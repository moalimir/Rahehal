import type {
  ChallengeApprovalBriefContentResource,
  ChallengeApprovalBriefResource,
  ChallengeApprovalNextAction,
  ChallengeApprovalResource,
  ChallengeApprovalSummaryResource,
  ChallengeDraftContentResource,
  ChallengeNextAction,
  ChallengeResource,
  ChallengeTransitionBody,
  ChallengePublicationStateBody,
  CreateChallengeBody,
  ExtendChallengeDeadlineBody,
  MutationReceipt,
  PlatformChallengeApprovalQueueItem,
  PlatformChallengeApprovalQueueResource,
  PatchChallengeBody,
  PublishChallengeBody,
  RecordChallengeApprovalBody,
} from "@rahhal/contracts";
import {
  approvalDecisions,
  canChangePublicationState,
  canTransition,
  challengeManagedStages,
  gateApproverRoles,
  isChallengePublicationState,
  challengeTransitions,
  evaluatePublicationReadiness,
  isAggregateVersion,
  isChallengeDraftAuthoringStatus,
  isGateApproverRole,
  isPlatformRole,
  isPublicationGate,
  isPubliclyProjectable,
  isWorkspaceRole,
  publicationGates,
  parseAuditEventId,
  parseChallengeApprovalId,
  parseChallengeId,
  parseChallengeVersionId,
  parsePrefixedId,
  parseReceiptId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type ApprovalDecision,
  type ChallengeApprovalId,
  type ChallengeId,
  type PublicationGate,
  type WorkspaceRole,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import {
  assertEligibilityRuleAttachable,
  challengePublicProjection,
  challengeReadiness,
  emptyChallengeContent,
  mergeChallengeDraftPatch,
  satisfiedTransitionPreconditions,
} from "../challenge-draft.js";
import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  ChallengeCommandContext,
  ChallengePort,
  ChallengePublicationCommand,
  ChallengeScope,
  ChallengeTransitionCommand,
  Clock,
  IdFactory,
  MutationOutcome,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ChallengeRow = {
  readonly id: string;
  readonly current_version_id: string;
  readonly published_version_id: string | null;
  readonly publication_state: string | null;
  readonly proposal_deadline_at: Date | null;
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly stage: string;
  readonly authoring_status: string;
  readonly lock_version: number;
  readonly version_number: number;
  readonly content: unknown;
  readonly created_by_user_id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
};

type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

type CachedChallengeMutation = {
  readonly entity_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
};

type ChallengeMutationOutcome = MutationOutcome<ChallengeId, ChallengeNextAction>;
type ChallengeApprovalMutationOutcome = MutationOutcome<
  ChallengeApprovalId,
  ChallengeApprovalNextAction
>;
type ChallengeEvidenceAction =
  | "challenge.draft.created"
  | "challenge.draft.updated"
  | "challenge.triage.requested"
  | "challenge.formulation.started"
  | "challenge.approvals.requested"
  | "challenge.published"
  | "challenge.deadline.extended"
  | "challenge.paused"
  | "challenge.resumed"
  | "challenge.closed"
  | "challenge.cancelled";

const challengeNextActions = [
  "edit",
  "request_triage",
  "advance_formulation",
  "request_approvals",
  "await_approvals",
  "await_proposals",
  "await_resume",
  "closed",
] as const satisfies readonly ChallengeNextAction[];

const challengeApprovalNextActions = [
  "await_remaining_gates",
  "ready_for_publish",
] as const satisfies readonly ChallengeApprovalNextAction[];

type ChallengeApprovalRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly gate: string;
  readonly decision: string;
  readonly reason: string;
  readonly recorded_by_user_id: string;
  readonly recorded_by_role: string;
  readonly recorded_at: Date;
};

type ChallengeApprovalBriefRow = {
  readonly id: string;
  readonly current_version_id: string;
  readonly workspace_id: string;
  readonly stage: string;
  readonly lock_version: number;
  readonly content: unknown;
  readonly updated_at: Date;
};

type ChallengeApprovalSummaryRow = {
  readonly gate: string;
  readonly decision: string;
  readonly reason: string;
  readonly recorded_by_role: string;
  readonly recorded_at: Date;
  readonly recorded_by_current_actor: boolean;
};

type PlatformChallengeApprovalQueueRow = {
  readonly challenge_id: string;
  readonly current_version_id: string;
  readonly workspace_id: string;
  readonly lock_version: number;
  readonly title: string;
  readonly category: string;
  readonly updated_at: Date;
};

type CachedChallengeApprovalMutation = {
  readonly entity_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
};

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function challengeVersion(value: unknown): number {
  const version = typeof value === "number" ? value : Number(value);
  if (!isAggregateVersion(version) || version === 0) {
    throw new Error("Database returned an invalid challenge version");
  }
  return version;
}

function challengeResource(
  row: ChallengeRow,
): Omit<ChallengeResource, "approvals" | "publication_readiness"> {
  if (!challengeManagedStages.includes(row.stage as (typeof challengeManagedStages)[number])) {
    throw new Error("Authoring API loaded a challenge outside its lifecycle boundary");
  }
  if (!isChallengeDraftAuthoringStatus(row.authoring_status)) {
    throw new Error("Database returned an invalid challenge authoring status");
  }
  if (typeof row.content !== "object" || row.content === null || Array.isArray(row.content)) {
    throw new Error("Database returned invalid challenge content");
  }
  const version = challengeVersion(row.lock_version);
  const content = {
    verification_required: false,
    document_gate_required: false,
    ...structuredClone(row.content),
  } as ChallengeDraftContentResource;
  return {
    id: parseChallengeId(row.id),
    current_version_id: parseChallengeVersionId(row.current_version_id),
    published_version_id:
      row.published_version_id === null ? null : parseChallengeVersionId(row.published_version_id),
    publication_state: publicationState(row.publication_state),
    proposal_deadline_at: row.proposal_deadline_at?.toISOString() ?? null,
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    stage: row.stage as ChallengeResource["stage"],
    authoring_status: row.authoring_status,
    version,
    content_version: challengeVersion(row.version_number),
    readiness: challengeReadiness(content, version),
    content,
    created_by: parseUserId(row.created_by_user_id),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

function publicationState(value: string | null) {
  if (value === null) return null;
  if (!isChallengePublicationState(value)) {
    throw new Error("Database returned an invalid publication state");
  }
  return value;
}

function challengeApprovalResource(row: ChallengeApprovalRow): ChallengeApprovalResource {
  if (!isPublicationGate(row.gate)) {
    throw new Error("Database returned an invalid publication gate");
  }
  if (!approvalDecisions.includes(row.decision as ApprovalDecision)) {
    throw new Error("Database returned an invalid approval decision");
  }
  if (!isWorkspaceRole(row.recorded_by_role)) {
    throw new Error("Database returned an invalid approval role");
  }
  return {
    id: parseChallengeApprovalId(row.id),
    challenge_id: parseChallengeId(row.challenge_id),
    challenge_version_id: parseChallengeVersionId(row.challenge_version_id),
    gate: row.gate,
    decision: row.decision as ApprovalDecision,
    reason: row.reason,
    recorded_by: parseUserId(row.recorded_by_user_id),
    recorded_by_role: row.recorded_by_role,
    recorded_at: timestamp(row.recorded_at),
  };
}

function platformGateForRole(role: WorkspaceRole): PublicationGate | null {
  if (!isPlatformRole(role)) return null;
  return publicationGates.find((gate) => gateApproverRoles[gate].includes(role)) ?? null;
}

function challengeApprovalSummary(
  row: ChallengeApprovalSummaryRow,
): ChallengeApprovalSummaryResource {
  if (!isPublicationGate(row.gate))
    throw new Error("Database returned an invalid publication gate");
  if (!approvalDecisions.includes(row.decision as ApprovalDecision)) {
    throw new Error("Database returned an invalid approval decision");
  }
  if (!isWorkspaceRole(row.recorded_by_role)) {
    throw new Error("Database returned an invalid approval role");
  }
  return {
    gate: row.gate,
    decision: row.decision as ApprovalDecision,
    reason: row.reason,
    recorded_by_role: row.recorded_by_role,
    recorded_at: timestamp(row.recorded_at),
    recorded_by_current_actor: row.recorded_by_current_actor,
  };
}

function cachedMutation(value: unknown): CachedChallengeMutation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Database returned an invalid challenge idempotency response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record["entity_id"] !== "string" ||
    !Number.isSafeInteger(record["entity_version"]) ||
    typeof record["receipt_id"] !== "string" ||
    typeof record["audit_event_id"] !== "string" ||
    typeof record["timestamp"] !== "string" ||
    !Array.isArray(record["next_actions"]) ||
    !record["next_actions"].every(
      (item) =>
        typeof item === "string" && challengeNextActions.includes(item as ChallengeNextAction),
    )
  ) {
    throw new Error("Database returned an invalid challenge idempotency response");
  }
  return record as unknown as CachedChallengeMutation;
}

function cachedApprovalMutation(value: unknown): CachedChallengeApprovalMutation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Database returned an invalid challenge approval idempotency response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record["entity_id"] !== "string" ||
    !Number.isSafeInteger(record["entity_version"]) ||
    typeof record["receipt_id"] !== "string" ||
    typeof record["audit_event_id"] !== "string" ||
    typeof record["timestamp"] !== "string" ||
    !Array.isArray(record["next_actions"]) ||
    !record["next_actions"].every(
      (item) =>
        typeof item === "string" &&
        challengeApprovalNextActions.includes(item as ChallengeApprovalNextAction),
    )
  ) {
    throw new Error("Database returned an invalid challenge approval idempotency response");
  }
  return record as unknown as CachedChallengeApprovalMutation;
}

export class PostgresChallengeAdapter implements ChallengePort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private async lockIdempotencyKey(
    client: PoolClient,
    context: ChallengeCommandContext,
  ): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
    ]);
  }

  private async loadReplay(
    client: PoolClient,
    context: ChallengeCommandContext,
    requestHash: string,
  ): Promise<CachedChallengeMutation | null> {
    await client.query(
      `
        DELETE FROM idempotency_key
        WHERE scope_kind = 'tenant'
          AND tenant_id = $1
          AND credential_fingerprint IS NULL
          AND idempotency_key = $2
          AND expires_at <= $3
      `,
      [context.tenantId, context.idempotencyKey, this.clock.now().toISOString()],
    );
    const result = await client.query<IdempotencyRow>(
      `
        SELECT request_hash, status, response_body
        FROM idempotency_key
        WHERE scope_kind = 'tenant'
          AND tenant_id = $1
          AND credential_fingerprint IS NULL
          AND idempotency_key = $2
        FOR UPDATE
      `,
      [context.tenantId, context.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return cachedMutation(row.response_body);
  }

  private async loadApprovalReplay(
    client: PoolClient,
    context: ChallengeCommandContext,
    requestHash: string,
  ): Promise<CachedChallengeApprovalMutation | null> {
    await client.query(
      `
        DELETE FROM idempotency_key
        WHERE scope_kind = 'tenant'
          AND tenant_id = $1
          AND credential_fingerprint IS NULL
          AND idempotency_key = $2
          AND expires_at <= $3
      `,
      [context.tenantId, context.idempotencyKey, this.clock.now().toISOString()],
    );
    const result = await client.query<IdempotencyRow>(
      `
        SELECT request_hash, status, response_body
        FROM idempotency_key
        WHERE scope_kind = 'tenant'
          AND tenant_id = $1
          AND credential_fingerprint IS NULL
          AND idempotency_key = $2
        FOR UPDATE
      `,
      [context.tenantId, context.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return cachedApprovalMutation(row.response_body);
  }

  private outcome(cached: CachedChallengeMutation, idempotent: boolean): ChallengeMutationOutcome {
    const receipt: MutationReceipt<ChallengeId, ChallengeNextAction> = {
      entity_id: parseChallengeId(cached.entity_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: timestamp(cached.timestamp),
      idempotent,
      next_actions: cached.next_actions as readonly ChallengeNextAction[],
    };
    return { receipt, entityVersion: challengeVersion(cached.entity_version) };
  }

  private approvalOutcome(
    cached: CachedChallengeApprovalMutation,
    idempotent: boolean,
  ): ChallengeApprovalMutationOutcome {
    const receipt: MutationReceipt<ChallengeApprovalId, ChallengeApprovalNextAction> = {
      entity_id: parseChallengeApprovalId(cached.entity_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: timestamp(cached.timestamp),
      idempotent,
      next_actions: cached.next_actions as readonly ChallengeApprovalNextAction[],
    };
    return { receipt, entityVersion: cached.entity_version };
  }

  private async recordMutation(
    client: PoolClient,
    resource: ChallengeResource,
    context: ChallengeCommandContext,
    action: ChallengeEvidenceAction,
    nextActions: readonly ChallengeNextAction[],
    requestHash: string,
    reason?: string,
  ): Promise<ChallengeMutationOutcome> {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const outboxId = parsePrefixedId(this.ids.next("evt"), "evt");
    const cached: CachedChallengeMutation = {
      entity_id: resource.id,
      entity_version: resource.version,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: nextActions,
    };

    await client.query(
      `
        INSERT INTO audit_event (
          id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
          action, outcome, reason_code, target_type, target_id, metadata, occurred_at
        ) VALUES (
          $1, $2, $3, $4, 'user', $5, $6, 'success', 'MUTATION_COMMITTED',
          'challenge', $7,
          jsonb_strip_nulls(jsonb_build_object('entity_version', $8::bigint, 'reason', $9::text)),
          $10
        )
      `,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        action,
        resource.id,
        resource.version,
        reason ?? null,
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO mutation_receipt (
          id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
          audit_event_id, correlation_id, next_actions, occurred_at
        ) VALUES ($1, $2, $3, 'challenge', $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        receiptId,
        context.tenantId,
        context.workspaceId,
        resource.id,
        resource.version,
        auditId,
        context.correlationId,
        JSON.stringify(nextActions),
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO outbox_event (
          id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
          aggregate_id, payload, dedupe_key, occurred_at, available_at
        ) VALUES (
          $1, $2, $3, $4, 1, 'challenge', $5,
          jsonb_build_object('entity_version', $6::bigint), $7, $8, $8
        )
      `,
      [
        outboxId,
        context.tenantId,
        context.correlationId,
        action,
        resource.id,
        resource.version,
        `${action}:${resource.id}:${resource.version}`,
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO idempotency_key (
          id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
          request_hash, status, response_status, response_body, created_at, expires_at
        ) VALUES (
          $1, 'tenant', $2, NULL, $3, $4, 'completed', 200, $5::jsonb, $6, $7
        )
      `,
      [
        `idk_${commandFingerprint({
          tenantId: context.tenantId,
          idempotencyKey: context.idempotencyKey,
        })}`,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        occurredAt,
        new Date(new Date(occurredAt).getTime() + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.outcome(cached, false);
  }

  /**
   * Records evidence for a challenge_approval row -- a distinct aggregate from
   * the challenge itself, so the receipt/outbox target the approval's own id
   * while the audit trail stays keyed by the parent challenge (matching how
   * every other challenge-scoped audit query already reads it).
   */
  private async recordApprovalMutation(
    client: PoolClient,
    approval: ChallengeApprovalResource,
    challenge: ChallengeResource,
    context: ChallengeCommandContext,
    nextActions: readonly ChallengeApprovalNextAction[],
    requestHash: string,
  ): Promise<ChallengeApprovalMutationOutcome> {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const outboxId = parsePrefixedId(this.ids.next("evt"), "evt");
    const cached: CachedChallengeApprovalMutation = {
      entity_id: approval.id,
      entity_version: 1,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: nextActions,
    };

    await client.query(
      `
        INSERT INTO audit_event (
          id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
          action, outcome, reason_code, target_type, target_id, metadata, occurred_at
        ) VALUES (
          $1, $2, $3, $4, 'user', $5, 'challenge.approval.recorded', 'success',
          'MUTATION_COMMITTED', 'challenge', $6, jsonb_build_object('entity_version', $7::bigint), $8
        )
      `,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        challenge.id,
        challenge.version,
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO mutation_receipt (
          id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
          audit_event_id, correlation_id, next_actions, occurred_at
        ) VALUES ($1, $2, $3, 'challenge_approval', $4, 1, $5, $6, $7::jsonb, $8)
      `,
      [
        receiptId,
        context.tenantId,
        context.workspaceId,
        approval.id,
        auditId,
        context.correlationId,
        JSON.stringify(nextActions),
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO outbox_event (
          id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
          aggregate_id, payload, dedupe_key, occurred_at, available_at
        ) VALUES (
          $1, $2, $3, 'challenge.approval.recorded', 1, 'challenge_approval', $4,
          jsonb_build_object('challenge_id', $5::text, 'gate', $6::text, 'decision', $7::text),
          $8, $9, $9
        )
      `,
      [
        outboxId,
        context.tenantId,
        context.correlationId,
        approval.id,
        challenge.id,
        approval.gate,
        approval.decision,
        `challenge.approval.recorded:${approval.id}`,
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO idempotency_key (
          id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
          request_hash, status, response_status, response_body, created_at, expires_at
        ) VALUES (
          $1, 'tenant', $2, NULL, $3, $4, 'completed', 200, $5::jsonb, $6, $7
        )
      `,
      [
        `idk_${commandFingerprint({
          tenantId: context.tenantId,
          idempotencyKey: context.idempotencyKey,
        })}`,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        occurredAt,
        new Date(new Date(occurredAt).getTime() + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.approvalOutcome(cached, false);
  }

  private async approvalsForVersion(
    client: PoolClient,
    versionId: string,
    lock: boolean,
  ): Promise<ChallengeApprovalResource[]> {
    const result = await client.query<ChallengeApprovalRow>(
      `
        SELECT
          id, challenge_id, challenge_version_id, gate, decision, reason,
          recorded_by_user_id, recorded_by_role, recorded_at
        FROM challenge_approval
        WHERE challenge_version_id = $1
        ${lock ? "FOR UPDATE" : "FOR SHARE"}
      `,
      [versionId],
    );
    return result.rows.map(challengeApprovalResource);
  }

  private async findScoped(
    client: PoolClient,
    scope: ChallengeScope,
    id: string,
    lock: boolean,
  ): Promise<ChallengeResource | null> {
    const result = await client.query<ChallengeRow>(
      `
        SELECT
          challenge.id,
          challenge.current_version_id,
          challenge.published_version_id,
          challenge.publication_state,
          challenge.proposal_deadline_at,
          challenge.tenant_id,
          challenge.workspace_id,
          challenge.stage,
          version.authoring_status,
          challenge.lock_version,
          version.version_number,
          version.content,
          challenge.created_by_user_id,
          challenge.created_at,
          challenge.updated_at
        FROM challenge
        JOIN challenge_version AS version
          ON version.id = challenge.current_version_id
         AND version.challenge_id = challenge.id
        WHERE challenge.tenant_id = $1
          AND challenge.workspace_id = $2
          AND challenge.id = $3
        ${lock ? "FOR UPDATE OF challenge" : "FOR SHARE OF challenge, version"}
      `,
      [scope.tenantId, scope.workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const resource = challengeResource(row);
    const approvals = await this.approvalsForVersion(client, resource.current_version_id, lock);
    return {
      ...resource,
      approvals,
      publication_readiness: evaluatePublicationReadiness(approvals),
    };
  }

  private async approvalSummariesForVersion(
    client: PoolClient,
    versionId: string,
    actorUserId: string,
  ): Promise<ChallengeApprovalSummaryResource[]> {
    const result = await client.query<ChallengeApprovalSummaryRow>(
      `
        SELECT
          gate, decision, reason, recorded_by_role, recorded_at,
          recorded_by_user_id = $2 AS recorded_by_current_actor
        FROM challenge_approval
        WHERE challenge_version_id = $1
        ORDER BY gate
        FOR SHARE
      `,
      [versionId, actorUserId],
    );
    return result.rows.map(challengeApprovalSummary);
  }

  async create(
    body: CreateChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "challenge.create",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);
      if (body.expected_version !== 0 || !isAggregateVersion(body.expected_version)) {
        throw new ApiProblem(422, "VALIDATION", "A new challenge must expect version zero");
      }

      const challengeId = parseChallengeId(this.ids.next("chl"));
      const versionId = parseChallengeVersionId(this.ids.next("chv"));
      const occurredAt = this.clock.now().toISOString();
      const merged = mergeChallengeDraftPatch(emptyChallengeContent(), body.draft ?? {});
      assertEligibilityRuleAttachable(merged.content, new Date(occurredAt));
      const readiness = challengeReadiness(merged.content, 1);
      const authoringStatus = readiness.ready ? "ready" : "draft";
      const insert = await client.query(
        `
          INSERT INTO challenge (
            id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
            current_version_id, published_version_id, lock_version,
            created_by_user_id, created_at, updated_at
          ) VALUES ($1, $2, 'organization', $3, 'org', 'draft', $4, NULL, 1, $5, $6, $6)
        `,
        [
          challengeId,
          context.tenantId,
          context.workspaceId,
          versionId,
          context.actorUserId,
          occurredAt,
        ],
      );
      await client.query(
        `
          INSERT INTO challenge_version (
            id, challenge_id, version_number, authoring_status, content,
            created_by_user_id, created_at
          ) VALUES ($1, $2, 1, $3, $4::jsonb, $5, $6)
        `,
        [
          versionId,
          challengeId,
          authoringStatus,
          JSON.stringify(merged.content),
          context.actorUserId,
          occurredAt,
        ],
      );
      if (insert.rowCount !== 1) {
        throw new Error("Challenge insert did not affect exactly one aggregate");
      }
      const resource: ChallengeResource = {
        id: challengeId,
        current_version_id: versionId,
        published_version_id: null,
        publication_state: null,
        proposal_deadline_at: null,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        stage: "draft",
        authoring_status: authoringStatus,
        version: 1,
        content_version: 1,
        readiness,
        content: merged.content,
        approvals: [],
        publication_readiness: evaluatePublicationReadiness([]),
        created_by: context.actorUserId,
        created_at: occurredAt,
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        "challenge.draft.created",
        ["edit"],
        requestHash,
      );
    });
  }

  async getScoped(scope: ChallengeScope, id: string): Promise<ChallengeResource | null> {
    return this.unitOfWork.run(() =>
      this.findScoped(this.unitOfWork.currentClient(), scope, id, false),
    );
  }

  async getApprovalBrief(
    scope: ChallengeScope,
    id: string,
  ): Promise<ChallengeApprovalBriefResource | null> {
    if (!platformGateForRole(scope.role)) throw forbidden();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<ChallengeApprovalBriefRow>(
        `
          SELECT
            challenge.id,
            challenge.current_version_id,
            challenge.workspace_id,
            challenge.stage,
            challenge.lock_version,
            jsonb_build_object(
              'title', version.content -> 'title',
              'summary', version.content -> 'summary',
              'category', version.content -> 'category',
              'location', version.content -> 'location',
              'desired_outcome', version.content -> 'desired_outcome',
              'current_state', version.content -> 'current_state',
              'consequence', version.content -> 'consequence',
              'expected_output', version.content -> 'expected_output',
              'success_criteria', version.content -> 'success_criteria',
              'in_scope', version.content -> 'in_scope',
              'constraints', version.content -> 'constraints',
              'organization_support', version.content -> 'organization_support',
              'previous_attempts', version.content -> 'previous_attempts',
              'output_type', version.content -> 'output_type',
              'sourcing_model', version.content -> 'sourcing_model',
              'applicant_scope', version.content -> 'applicant_scope',
              'allowed_applicant_types', version.content -> 'allowed_applicant_types',
              'work_mode', version.content -> 'work_mode',
              'proposal_deadline', version.content -> 'proposal_deadline',
              'preferred_start_date', version.content -> 'preferred_start_date',
              'budget', version.content -> 'budget',
              'visibility', version.content -> 'visibility',
              'public_summary', version.content -> 'public_summary',
              'verification_required', COALESCE(version.content -> 'verification_required', 'false'),
              'nda_required', version.content -> 'nda_required',
              'document_gate_required', COALESCE(version.content -> 'document_gate_required', 'false'),
              'ip_terms', version.content -> 'ip_terms',
              'accuracy_confirmed', version.content -> 'accuracy_confirmed',
              'legal_notes', version.content -> 'legal_notes'
            ) AS content,
            challenge.updated_at
          FROM challenge
          JOIN challenge_version AS version
            ON version.id = challenge.current_version_id
           AND version.challenge_id = challenge.id
          WHERE challenge.tenant_id = $1
            AND challenge.workspace_id = $2
            AND challenge.id = $3
            AND challenge.stage = 'approvals'
          FOR SHARE OF challenge, version
        `,
        [scope.tenantId, scope.workspaceId, id],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (row.stage !== "approvals") throw new Error("Approval brief loaded outside approvals");
      if (typeof row.content !== "object" || row.content === null || Array.isArray(row.content)) {
        throw new Error("Database returned invalid approval brief content");
      }
      const approvals = await this.approvalSummariesForVersion(
        client,
        row.current_version_id,
        scope.actorUserId,
      );
      return {
        id: parseChallengeId(row.id),
        current_version_id: parseChallengeVersionId(row.current_version_id),
        workspace_id: parseWorkspaceId(row.workspace_id),
        stage: "approvals",
        version: challengeVersion(row.lock_version),
        content: structuredClone(row.content) as ChallengeApprovalBriefContentResource,
        approvals,
        publication_readiness: evaluatePublicationReadiness(approvals),
        updated_at: timestamp(row.updated_at),
      };
    });
  }

  async listApprovalQueue(scope: ChallengeScope): Promise<PlatformChallengeApprovalQueueResource> {
    const gate = platformGateForRole(scope.role);
    if (!gate) throw forbidden();
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<PlatformChallengeApprovalQueueRow>(
        `
          SELECT
            challenge.id AS challenge_id,
            challenge.current_version_id,
            challenge.workspace_id,
            challenge.lock_version,
            version.content ->> 'title' AS title,
            version.content ->> 'category' AS category,
            challenge.updated_at
          FROM challenge
          JOIN challenge_version AS version
            ON version.id = challenge.current_version_id
           AND version.challenge_id = challenge.id
          WHERE challenge.stage = 'approvals'
            AND NOT EXISTS (
              SELECT 1
              FROM challenge_approval
              WHERE challenge_version_id = challenge.current_version_id
                AND gate = $1
            )
            AND NOT EXISTS (
              SELECT 1
              FROM challenge_approval
              WHERE challenge_version_id = challenge.current_version_id
                AND recorded_by_user_id = $2
            )
          ORDER BY challenge.updated_at, challenge.id
          LIMIT 50
        `,
        [gate, scope.actorUserId],
      );
      const items: PlatformChallengeApprovalQueueItem[] = result.rows.map((row) => ({
        challenge_id: parseChallengeId(row.challenge_id),
        current_version_id: parseChallengeVersionId(row.current_version_id),
        workspace_id: parseWorkspaceId(row.workspace_id),
        version: challengeVersion(row.lock_version),
        title: row.title,
        category: row.category,
        gate,
        updated_at: timestamp(row.updated_at),
      }));
      return { items };
    });
  }

  async patch(
    id: string,
    body: PatchChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "challenge.patch",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);

      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.stage !== "draft" && current.stage !== "formulation") {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge content is not editable", {
          currentState: current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === current.stage)
            .map(({ to }) => to),
        });
      }

      const merged = mergeChallengeDraftPatch(current.content, body.patch);
      const version = current.version + 1;
      const contentVersion = current.content_version + 1;
      const versionId = parseChallengeVersionId(this.ids.next("chv"));
      const occurredAt = this.clock.now().toISOString();
      assertEligibilityRuleAttachable(merged.content, new Date(occurredAt));
      const readiness = challengeReadiness(merged.content, version);
      const authoringStatus = readiness.ready
        ? "ready"
        : current.stage === "formulation"
          ? "needs_changes"
          : "draft";
      const versionInsert = await client.query(
        `
          INSERT INTO challenge_version (
            id, challenge_id, version_number, authoring_status, content,
            created_by_user_id, created_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        `,
        [
          versionId,
          current.id,
          contentVersion,
          authoringStatus,
          JSON.stringify(merged.content),
          context.actorUserId,
          occurredAt,
        ],
      );
      if (versionInsert.rowCount !== 1) {
        throw new Error("Challenge version insert did not affect exactly one row");
      }
      const aggregateUpdate = await client.query(
        `
          UPDATE challenge
          SET current_version_id = $4, lock_version = $5, updated_at = $6
          WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3 AND lock_version = $7
        `,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          versionId,
          version,
          occurredAt,
          current.version,
        ],
      );
      if (aggregateUpdate.rowCount !== 1) {
        throw new Error("Challenge optimistic update did not affect exactly one aggregate");
      }
      const resource: ChallengeResource = {
        ...current,
        current_version_id: versionId,
        authoring_status: authoringStatus,
        version,
        content_version: contentVersion,
        readiness,
        content: merged.content,
        // A new version_id starts with no approvals of its own -- gates are
        // recorded against one specific locked version (B2), never inherited.
        approvals: [],
        publication_readiness: evaluatePublicationReadiness([]),
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        "challenge.draft.updated",
        ["edit"],
        requestHash,
      );
    });
  }

  async transition(
    id: string,
    command: ChallengeTransitionCommand,
    body: ChallengeTransitionBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const definitions = {
      "request-triage": {
        from: "draft",
        to: "triage",
        precondition: "brief-valid",
        action: "challenge.triage.requested",
        nextActions: ["advance_formulation"],
        lockReason: "triage_submission",
      },
      "advance-formulation": {
        from: "triage",
        to: "formulation",
        precondition: "triage-passed",
        action: "challenge.formulation.started",
        nextActions: ["edit"],
        lockReason: null,
      },
      "request-approvals": {
        from: "formulation",
        to: "approvals",
        precondition: "formulation-complete",
        action: "challenge.approvals.requested",
        nextActions: ["await_approvals"],
        lockReason: "approval_submission",
      },
    } as const;
    const definition = definitions[command];
    const requestHash = commandFingerprint({
      action: `challenge.${command}`,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);

      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);

      const rule = challengeTransitions.find(
        ({ from, to }) => from === current.stage && to === definition.to,
      );
      if (!rule || !rule.roles.some((role) => role === context.role)) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge transition is not allowed", {
          currentState: current.stage,
          allowedTransitions: challengeTransitions
            .filter(
              ({ from, roles }) =>
                from === current.stage && roles.some((role) => role === context.role),
            )
            .map(({ to }) => to),
        });
      }

      const readiness = challengeReadiness(current.content, current.version);
      if (command !== "advance-formulation" && !readiness.ready) {
        throw new ApiProblem(422, "VALIDATION", "Challenge brief is not ready", {
          currentVersion: current.version,
          fields: readiness.issues,
          readiness,
        });
      }
      if (
        !canTransition(
          challengeTransitions,
          current.stage,
          definition.to,
          context.role,
          satisfiedTransitionPreconditions(current.stage, readiness),
        )
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge transition is not allowed", {
          currentState: current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === current.stage)
            .map(({ to }) => to),
        });
      }

      const occurredAt = this.clock.now().toISOString();
      if (definition.lockReason) {
        const versionLock = await client.query(
          `
            UPDATE challenge_version
            SET locked_at = $3, lock_reason = $4
            WHERE id = $1 AND challenge_id = $2 AND locked_at IS NULL
          `,
          [current.current_version_id, current.id, occurredAt, definition.lockReason],
        );
        // Zero rows is legitimate: the guard is `locked_at IS NULL`, and a
        // version submitted for triage and then for approvals with no content
        // edit in between is already locked (the append-only trigger permits
        // only the unlocked -> locked mutation, so it keeps its first
        // lock_reason). What must never happen is the version ending this
        // transition unlocked, or missing entirely.
        if (versionLock.rowCount !== 1) {
          const existing = await client.query<{ locked_at: Date | null }>(
            "SELECT locked_at FROM challenge_version WHERE id = $1 AND challenge_id = $2",
            [current.current_version_id, current.id],
          );
          if (!existing.rows[0] || existing.rows[0].locked_at === null) {
            throw new Error("Challenge version was not locked by its submitting transition");
          }
        }
      }

      const version = current.version + 1;
      const aggregateUpdate = await client.query(
        `
          UPDATE challenge
          SET stage = $4, lock_version = $5, updated_at = $6
          WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3 AND lock_version = $7
        `,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          definition.to,
          version,
          occurredAt,
          current.version,
        ],
      );
      if (aggregateUpdate.rowCount !== 1) {
        throw new Error("Challenge transition did not affect exactly one aggregate");
      }
      const resource: ChallengeResource = {
        ...current,
        stage: definition.to,
        version,
        readiness: { ...readiness, evaluated_version: version },
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        definition.action,
        definition.nextActions,
        requestHash,
      );
    });
  }

  async publish(
    id: string,
    body: PublishChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "challenge.publish",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);

      // `FOR UPDATE` on the aggregate plus `FOR UPDATE` on the version's
      // approvals: two concurrent publishes of the same challenge serialize
      // here, and the loser then fails its `lock_version` guard rather than
      // writing a second projection row.
      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);

      const readiness = challengeReadiness(current.content, current.version);
      if (
        !canTransition(
          challengeTransitions,
          current.stage,
          "published",
          context.role,
          satisfiedTransitionPreconditions(current.stage, readiness, current.publication_readiness),
        )
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge cannot be published yet", {
          currentState: current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === current.stage)
            .map(({ to }) => to),
        });
      }
      if (!readiness.ready) {
        throw new ApiProblem(422, "VALIDATION", "Challenge brief is not ready", {
          currentVersion: current.version,
          fields: readiness.issues,
          readiness,
        });
      }

      const occurredAt = this.clock.now().toISOString();
      // The version reaching `approvals` is already locked by that transition;
      // this keeps the invariant that a published version is never unlocked
      // without depending on which submission locked it first.
      const versionLock = await client.query(
        `
          UPDATE challenge_version
          SET locked_at = $3, lock_reason = $4
          WHERE id = $1 AND challenge_id = $2 AND locked_at IS NULL
        `,
        [current.current_version_id, current.id, occurredAt, "publication"],
      );
      if (versionLock.rowCount !== 1) {
        const existing = await client.query<{ locked_at: Date | null }>(
          "SELECT locked_at FROM challenge_version WHERE id = $1 AND challenge_id = $2",
          [current.current_version_id, current.id],
        );
        if (!existing.rows[0] || existing.rows[0].locked_at === null) {
          throw new Error("Published challenge version was left unlocked");
        }
      }

      const version = current.version + 1;
      const aggregateUpdate = await client.query(
        `
          UPDATE challenge
          SET stage = 'published',
              published_version_id = $4,
              publication_state = 'open',
              proposal_deadline_at = (
                SELECT (content ->> 'proposal_deadline')::timestamptz
                FROM challenge_version WHERE id = $4
              ),
              lock_version = $5,
              updated_at = $6
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND id = $3
            AND lock_version = $7
            AND published_version_id IS NULL
        `,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          current.current_version_id,
          version,
          occurredAt,
          current.version,
        ],
      );
      if (aggregateUpdate.rowCount !== 1) {
        throw new Error("Challenge publication did not affect exactly one aggregate");
      }

      if (isPubliclyProjectable(current.content.visibility)) {
        const projection = challengePublicProjection(
          current.id,
          current.current_version_id,
          current.content,
          occurredAt,
          "open",
        );
        const projectionInsert = await client.query(
          `
            INSERT INTO challenge_public_projection (
              challenge_id, tenant_id, challenge_version_id, title, category, location,
              public_summary, output_type, sourcing_model, applicant_scope,
              allowed_applicant_types, work_mode, proposal_deadline, preferred_start_date,
              budget_status, budget_amount_minor, budget_currency, visibility,
              verification_required, nda_required, document_gate_required, ip_terms,
              state, published_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
            )
          `,
          [
            projection.challenge_id,
            context.tenantId,
            projection.challenge_version_id,
            projection.title,
            projection.category,
            projection.location,
            projection.public_summary,
            projection.output_type,
            projection.sourcing_model,
            projection.applicant_scope,
            [...projection.allowed_applicant_types],
            projection.work_mode,
            projection.proposal_deadline,
            projection.preferred_start_date,
            projection.budget.status,
            projection.budget.amount_minor,
            projection.budget.currency,
            projection.visibility,
            projection.verification_required,
            projection.nda_required,
            projection.document_gate_required,
            projection.ip_terms,
            projection.state,
            projection.published_at,
          ],
        );
        if (projectionInsert.rowCount !== 1) {
          throw new Error("Challenge public projection insert did not affect exactly one row");
        }
      }

      const resource: ChallengeResource = {
        ...current,
        stage: "published",
        published_version_id: current.current_version_id,
        publication_state: "open",
        proposal_deadline_at: current.content.proposal_deadline,
        version,
        readiness: { ...readiness, evaluated_version: version },
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        "challenge.published",
        ["await_proposals"],
        requestHash,
        body.reason,
      );
    });
  }

  /**
   * B6. Extends the proposal deadline of an open published call.
   *
   * The approved version is never touched: the four gates approved that exact
   * content, and rewriting it to carry a later date would silently restate
   * what they signed off. The live deadline lives on the aggregate and is
   * mirrored into the public projection.
   */
  async extendDeadline(
    id: string,
    body: ExtendChallengeDeadlineBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "challenge.extend-deadline",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);

      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      // Defense in depth: app.ts authorizes the publisher before this is
      // reached, but the adapter never trusts that alone -- the same rule B2's
      // gate recording and B4's publish already follow.
      if (context.role !== "org:publisher") throw forbidden();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.publication_state !== "open" || current.proposal_deadline_at === null) {
        throw new ApiProblem(409, "INVALID_STATE", "Only an open published call can be extended", {
          currentState: current.publication_state ?? current.stage,
        });
      }

      const now = this.clock.now();
      const next = Date.parse(body.proposal_deadline);
      // Server time decides the race, never the caller's clock.
      if (!Number.isFinite(next) || next <= now.getTime()) {
        throw new ApiProblem(422, "VALIDATION", "A new deadline must be in the future", {
          fields: [
            {
              path: "/proposal_deadline",
              code: "future",
              message: "The new proposal deadline must be later than server time",
            },
          ],
        });
      }
      if (next <= Date.parse(current.proposal_deadline_at)) {
        throw new ApiProblem(422, "VALIDATION", "A deadline can only be extended", {
          fields: [
            {
              path: "/proposal_deadline",
              code: "future",
              message: "The new proposal deadline must be later than the current one",
            },
          ],
        });
      }

      const occurredAt = now.toISOString();
      const version = current.version + 1;
      const updated = await client.query(
        `
          UPDATE challenge
          SET proposal_deadline_at = $4, lock_version = $5, updated_at = $6
          WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3 AND lock_version = $7
            AND publication_state = 'open'
        `,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          body.proposal_deadline,
          version,
          occurredAt,
          current.version,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new Error("Challenge deadline extension did not affect exactly one aggregate");
      }
      // Zero rows is legitimate: an invite-only or NDA call has no public row.
      await client.query(
        "UPDATE challenge_public_projection SET proposal_deadline = $2 WHERE challenge_id = $1",
        [current.id, body.proposal_deadline],
      );

      const resource: ChallengeResource = {
        ...current,
        version,
        proposal_deadline_at: body.proposal_deadline,
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        "challenge.deadline.extended",
        ["await_proposals"],
        requestHash,
      );
    });
  }

  /**
   * B6. Pause, resume, close, cancel. Discovery reads the projection, so the
   * call leaves the public catalogue the moment it stops being open -- without
   * deleting the row that anyone already holding a link still needs.
   */
  async changePublicationState(
    id: string,
    command: ChallengePublicationCommand,
    body: ChallengePublicationStateBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const definitions = {
      pause: { to: "paused", action: "challenge.paused", next: ["await_resume"] },
      resume: { to: "open", action: "challenge.resumed", next: ["await_proposals"] },
      close: { to: "closed", action: "challenge.closed", next: ["closed"] },
      cancel: { to: "cancelled", action: "challenge.cancelled", next: ["closed"] },
    } as const;
    const definition = definitions[command];
    const requestHash = commandFingerprint({
      action: `challenge.${command}`,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadReplay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);

      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      // Defense in depth: app.ts authorizes the publisher before this is
      // reached, but the adapter never trusts that alone -- the same rule B2's
      // gate recording and B4's publish already follow.
      if (context.role !== "org:publisher") throw forbidden();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (
        current.publication_state === null ||
        !canChangePublicationState(current.publication_state, definition.to)
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Publication state change is not allowed", {
          currentState: current.publication_state ?? current.stage,
        });
      }

      const occurredAt = this.clock.now().toISOString();
      const version = current.version + 1;
      const updated = await client.query(
        `
          UPDATE challenge
          SET publication_state = $4, lock_version = $5, updated_at = $6
          WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3 AND lock_version = $7
            AND publication_state = $8
        `,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          definition.to,
          version,
          occurredAt,
          current.version,
          current.publication_state,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new Error("Challenge publication state change did not affect exactly one aggregate");
      }
      await client.query(
        "UPDATE challenge_public_projection SET state = $2 WHERE challenge_id = $1",
        [current.id, definition.to],
      );

      const resource: ChallengeResource = {
        ...current,
        version,
        publication_state: definition.to,
        updated_at: occurredAt,
      };
      return this.recordMutation(
        client,
        resource,
        context,
        definition.action,
        definition.next,
        requestHash,
        body.reason,
      );
    });
  }

  async recordApproval(
    id: string,
    body: RecordChallengeApprovalBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeApprovalMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "challenge.record-approval",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotencyKey(client, context);
      const replay = await this.loadApprovalReplay(client, context, requestHash);
      if (replay) return this.approvalOutcome(replay, true);

      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.stage !== "approvals") {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge is not awaiting approvals", {
          currentState: current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === current.stage)
            .map(({ to }) => to),
        });
      }
      // Defense in depth: app.ts resolves org- or platform-side authorization
      // before this is reached, but the adapter never trusts that alone.
      if (!isGateApproverRole(body.gate, context.role)) throw forbidden();

      if (current.approvals.some((approval) => approval.gate === body.gate)) {
        throw new ApiProblem(409, "CONFLICT", `The ${body.gate} gate is already recorded`, {
          recovery: "refetch_and_retry",
        });
      }
      if (current.approvals.some((approval) => approval.recorded_by === context.actorUserId)) {
        throw new ApiProblem(
          409,
          "CONFLICT",
          "This actor already recorded a different gate on this version",
          { recovery: "refetch_and_retry" },
        );
      }

      const approvalId = parseChallengeApprovalId(this.ids.next("cap"));
      const occurredAt = this.clock.now().toISOString();
      const insert = await client.query(
        `
          INSERT INTO challenge_approval (
            id, tenant_id, workspace_id, challenge_id, challenge_version_id,
            gate, decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          approvalId,
          context.tenantId,
          context.workspaceId,
          current.id,
          current.current_version_id,
          body.gate,
          body.decision,
          body.reason,
          context.actorUserId,
          context.role,
          occurredAt,
        ],
      );
      if (insert.rowCount !== 1) {
        throw new Error("Challenge approval insert did not affect exactly one row");
      }

      const approval: ChallengeApprovalResource = {
        id: approvalId,
        challenge_id: current.id,
        challenge_version_id: current.current_version_id,
        gate: body.gate,
        decision: body.decision,
        reason: body.reason,
        recorded_by: context.actorUserId,
        recorded_by_role: context.role,
        recorded_at: occurredAt,
      };
      const publicationReadiness = evaluatePublicationReadiness([...current.approvals, approval]);
      const nextActions: readonly ChallengeApprovalNextAction[] = [
        publicationReadiness.ready ? "ready_for_publish" : "await_remaining_gates",
      ];

      return this.recordApprovalMutation(
        client,
        approval,
        current,
        context,
        nextActions,
        requestHash,
      );
    });
  }
}
