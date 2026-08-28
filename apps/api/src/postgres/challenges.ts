import type {
  ChallengeApprovalNextAction,
  ChallengeApprovalResource,
  ChallengeDraftContentResource,
  ChallengeNextAction,
  ChallengeResource,
  ChallengeTransitionBody,
  CreateChallengeBody,
  MutationReceipt,
  PatchChallengeBody,
  RecordChallengeApprovalBody,
} from "@rahhal/contracts";
import {
  approvalDecisions,
  canTransition,
  challengeAuthoringStages,
  challengeTransitions,
  evaluatePublicationReadiness,
  isAggregateVersion,
  isChallengeDraftAuthoringStatus,
  isGateApproverRole,
  isPublicationGate,
  isWorkspaceRole,
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
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import {
  challengeReadiness,
  emptyChallengeContent,
  mergeChallengeDraftPatch,
} from "../challenge-draft.js";
import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  ChallengeCommandContext,
  ChallengePort,
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
  | "challenge.approvals.requested";

const challengeNextActions = [
  "edit",
  "request_triage",
  "advance_formulation",
  "request_approvals",
  "await_approvals",
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
  if (!challengeAuthoringStages.includes(row.stage as (typeof challengeAuthoringStages)[number])) {
    throw new Error("Authoring API loaded a challenge outside its lifecycle boundary");
  }
  if (!isChallengeDraftAuthoringStatus(row.authoring_status)) {
    throw new Error("Database returned an invalid challenge authoring status");
  }
  if (typeof row.content !== "object" || row.content === null || Array.isArray(row.content)) {
    throw new Error("Database returned invalid challenge content");
  }
  const version = challengeVersion(row.lock_version);
  const content = structuredClone(row.content) as ChallengeDraftContentResource;
  return {
    id: parseChallengeId(row.id),
    current_version_id: parseChallengeVersionId(row.current_version_id),
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
          'challenge', $7, jsonb_build_object('entity_version', $8::bigint), $9
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
        !canTransition(challengeTransitions, current.stage, definition.to, context.role, [
          definition.precondition,
        ])
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
        await client.query(
          `
            UPDATE challenge_version
            SET locked_at = $3, lock_reason = $4
            WHERE id = $1 AND challenge_id = $2 AND locked_at IS NULL
          `,
          [current.current_version_id, current.id, occurredAt, definition.lockReason],
        );
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
