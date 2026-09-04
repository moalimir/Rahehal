import type {
  CreateProposalBody,
  MutationReceipt,
  OrganizationProposalInboxItemResource,
  OrganizationProposalInboxResource,
  OrganizationProposalResource,
  PatchProposalBody,
  ProposalNextAction,
  ProposalResource,
  ProposalVersionResource,
  SubmitProposalBody,
} from "@rahhal/contracts";
import {
  decideTeamPermission,
  evaluateProposalEligibility,
  isApplicantType,
  isAggregateVersion,
  isProposalState,
  isTeamRole,
  parseAccessGrantId,
  parseAuditEventId,
  parseChallengeId,
  parseChallengeVersionId,
  parseMembershipId,
  parseProposalId,
  parseProposalVersionId,
  parsePrefixedId,
  parseReceiptId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type ProposalId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import {
  assertProposalContent,
  changedProposalFields,
  emptyProposalContent,
  mergeProposalContent,
  proposalContentHash,
  proposalReadiness,
} from "../proposal-draft.js";
import { commandFingerprint } from "../primitives.js";
import { C4_PROPOSAL_GRANT_DURATION_MS } from "../proposal-submission.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  ProposalCommandContext,
  ProposalPort,
  ProposalScope,
  TeamPort,
  WorkspaceScope,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ProposalRow = {
  readonly id: string;
  readonly current_version_id: string;
  readonly tenant_id: string;
  readonly owner_workspace_id: string;
  readonly owner_workspace_kind: string;
  readonly challenge_id: string;
  readonly assigned_membership_ids: readonly string[];
  readonly state: string;
  readonly tracking_code: string | null;
  readonly lock_version: string | number;
  readonly submitted_at: Date | null;
  readonly created_by_user_id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly content: unknown;
  readonly nda_required: boolean;
};

type ProposalVersionRow = {
  readonly id: string;
  readonly proposal_id: string;
  readonly version_number: number;
  readonly base_version_id: string | null;
  readonly accepted_challenge_version_id: string | null;
  readonly changed_fields: readonly string[];
  readonly content_hash: string;
  readonly locked_at: Date | null;
  readonly actor_user_id: string;
  readonly created_at: Date;
};

type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

type CachedProposalMutation = {
  readonly entity_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
};

type ProposalMutationOutcome = MutationOutcome<ProposalId, ProposalNextAction>;
type ProposalEvidenceAction =
  | "proposal.draft.created"
  | "proposal.draft.updated"
  | "proposal.submitted";

type SubmissionGateRow = {
  readonly server_now: Date;
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly organization_tenant_id: string;
  readonly organization_workspace_id: string;
  readonly publication_state: "open" | "paused" | "closed" | "cancelled";
  readonly proposal_deadline_at: Date;
  readonly allowed_applicant_types: readonly string[];
  readonly verification_required: boolean;
  readonly nda_required: boolean;
  readonly document_gate_required: boolean;
  readonly applicant_type: string;
  readonly verification_state: string;
  readonly nda_accepted: boolean;
  readonly document_acknowledged: boolean;
};

type OrganizationProposalInboxRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly owner_workspace_kind: string;
  readonly state: string;
  readonly tracking_code: string;
  readonly submitted_at: Date;
  readonly proposal_version_id: string;
  readonly version_number: number;
  readonly base_version_id: string;
  readonly accepted_challenge_version_id: string;
  readonly changed_fields: readonly string[];
  readonly content_hash: string;
  readonly locked_at: Date;
};

type OrganizationProposalRow = OrganizationProposalInboxRow & {
  readonly content: unknown;
};

const proposalNextActions = [
  "edit",
  "submit",
  "await_eligibility",
] as const satisfies readonly ProposalNextAction[];

function aggregateVersion(value: unknown): number {
  const version = typeof value === "number" ? value : Number(value);
  if (!isAggregateVersion(version) || version === 0) {
    throw new Error("Database returned an invalid proposal version");
  }
  return version;
}

function cachedMutation(value: unknown): CachedProposalMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned an invalid proposal idempotency response");
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
        typeof item === "string" && proposalNextActions.includes(item as ProposalNextAction),
    )
  ) {
    throw new Error("Database returned an invalid proposal idempotency response");
  }
  return record as unknown as CachedProposalMutation;
}

function proposalVersionResource(row: ProposalVersionRow): ProposalVersionResource {
  return {
    id: parseProposalVersionId(row.id),
    version_number: aggregateVersion(row.version_number),
    base_version_id:
      row.base_version_id === null ? null : parseProposalVersionId(row.base_version_id),
    accepted_challenge_version_id:
      row.accepted_challenge_version_id === null
        ? null
        : parseChallengeVersionId(row.accepted_challenge_version_id),
    changed_fields: [...row.changed_fields],
    content_hash: row.content_hash,
    locked: row.locked_at !== null,
    actor_user_id: parseUserId(row.actor_user_id),
    created_at: row.created_at.toISOString(),
  };
}

function organizationProposalInboxItem(
  row: OrganizationProposalInboxRow,
): OrganizationProposalInboxItemResource {
  if (!isProposalState(row.state) || !row.tracking_code || !row.base_version_id) {
    throw new Error("Database returned an invalid organization proposal projection");
  }
  if (row.owner_workspace_kind !== "individual" && row.owner_workspace_kind !== "team") {
    throw new Error("Database returned an invalid proposal workspace kind");
  }
  return {
    id: parseProposalId(row.id),
    challenge_id: parseChallengeId(row.challenge_id),
    owner_workspace_kind: row.owner_workspace_kind,
    state: row.state,
    tracking_code: row.tracking_code,
    submitted_at: row.submitted_at.toISOString(),
    submitted_version: {
      id: parseProposalVersionId(row.proposal_version_id),
      version_number: aggregateVersion(row.version_number),
      base_version_id: parseProposalVersionId(row.base_version_id),
      accepted_challenge_version_id: parseChallengeVersionId(row.accepted_challenge_version_id),
      changed_fields: [...row.changed_fields],
      content_hash: row.content_hash,
      locked_at: row.locked_at.toISOString(),
    },
  };
}

function organizationProposalResource(row: OrganizationProposalRow): OrganizationProposalResource {
  assertProposalContent(row.content);
  return {
    ...organizationProposalInboxItem(row),
    content: structuredClone(row.content),
  };
}

export class PostgresProposalAdapter implements ProposalPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly teams: TeamPort,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private async lockIdempotency(
    client: PoolClient,
    context: ProposalCommandContext,
  ): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
    ]);
  }

  private async replay(
    client: PoolClient,
    context: ProposalCommandContext,
    requestHash: string,
  ): Promise<CachedProposalMutation | null> {
    await client.query(
      `DELETE FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 AND expires_at <= $3`,
      [context.tenantId, context.idempotencyKey, this.clock.now().toISOString()],
    );
    const result = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, response_body FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 FOR UPDATE`,
      [context.tenantId, context.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return cachedMutation(row.response_body);
  }

  private outcome(cached: CachedProposalMutation, idempotent: boolean): ProposalMutationOutcome {
    const receipt: MutationReceipt<ProposalId, ProposalNextAction> = {
      entity_id: parseProposalId(cached.entity_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: new Date(cached.timestamp).toISOString(),
      idempotent,
      next_actions: cached.next_actions as readonly ProposalNextAction[],
    };
    return { receipt, entityVersion: aggregateVersion(cached.entity_version) };
  }

  private async record(
    client: PoolClient,
    resource: ProposalResource,
    context: ProposalCommandContext,
    action: ProposalEvidenceAction,
    requestHash: string,
    options: {
      readonly occurredAt?: string;
      readonly nextActions?: readonly ProposalNextAction[];
      readonly metadata?: Readonly<Record<string, string | number>>;
    } = {},
  ): Promise<ProposalMutationOutcome> {
    const occurredAt = options.occurredAt ?? this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const nextActions = options.nextActions ?? (["edit", "submit"] as const);
    const metadata = { entity_version: resource.version, ...options.metadata };
    const cached: CachedProposalMutation = {
      entity_id: resource.id,
      entity_version: resource.version,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: nextActions,
    };
    await client.query(
      `INSERT INTO audit_event (
         id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
         action, outcome, reason_code, target_type, target_id, metadata, occurred_at
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED','proposal',$7,
         $8::jsonb,$9)`,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        action,
        resource.id,
        JSON.stringify(metadata),
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO mutation_receipt (
         id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
         audit_event_id, correlation_id, next_actions, occurred_at
       ) VALUES ($1,$2,$3,'proposal',$4,$5,$6,$7,$8::jsonb,$9)`,
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
      `INSERT INTO outbox_event (
         id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
         aggregate_id, payload, dedupe_key, occurred_at, available_at
       ) VALUES ($1,$2,$3,$4,1,'proposal',$5,$6::jsonb,$7,$8,$8)`,
      [
        parsePrefixedId(this.ids.next("evt"), "evt"),
        context.tenantId,
        context.correlationId,
        action,
        resource.id,
        JSON.stringify(metadata),
        `${action}:${resource.id}:${resource.version}`,
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO idempotency_key (
         id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
         request_hash, status, response_status, response_body, created_at, expires_at
       ) VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',$5,$6::jsonb,$7,$8)`,
      [
        `idk_${commandFingerprint({
          tenantId: context.tenantId,
          idempotencyKey: context.idempotencyKey,
        })}`,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        action === "proposal.draft.created" ? 201 : 200,
        JSON.stringify(cached),
        occurredAt,
        new Date(Date.parse(occurredAt) + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.outcome(cached, false);
  }

  private async permitted(
    scope: ProposalScope,
    action: "create-proposal" | "edit-proposal" | "submit-proposal",
    assignedMembershipIds: readonly string[] = [],
  ): Promise<boolean> {
    if (scope.role === "individual") return true;
    if (!isTeamRole(scope.role)) return false;
    const team = await this.teams.get(scope);
    if (!team) return false;
    const member = team.members.find(
      (candidate) =>
        candidate.id === scope.membershipId &&
        candidate.user_id === scope.actorUserId &&
        candidate.role === scope.role &&
        candidate.state === "active",
    );
    if (!member) return false;
    return decideTeamPermission(action, {
      role: scope.role,
      policy: team.policy,
      assigned: assignedMembershipIds.includes(scope.membershipId),
    }).allowed;
  }

  private async versions(
    client: PoolClient,
    scope: Pick<ProposalScope, "tenantId" | "workspaceId">,
    proposalId: string,
  ): Promise<ProposalVersionResource[]> {
    const result = await client.query<ProposalVersionRow>(
      `SELECT version.id, version.proposal_id, version.version_number, version.base_version_id,
         version.accepted_challenge_version_id, version.changed_fields, version.content_hash,
         version.locked_at, version.actor_user_id, version.created_at
       FROM proposal_version AS version
       JOIN proposal ON proposal.id = version.proposal_id
       WHERE proposal.tenant_id = $1 AND proposal.owner_workspace_id = $2
         AND proposal.id = $3
       ORDER BY version.version_number`,
      [scope.tenantId, scope.workspaceId, proposalId],
    );
    return result.rows.map(proposalVersionResource);
  }

  private async findScoped(
    client: PoolClient,
    scope: ProposalScope,
    id: string,
    lock: boolean,
  ): Promise<ProposalResource | null> {
    if (lock) {
      // Take the row lock in its own statement, without the version join.
      // Locking and joining together is unsafe under READ COMMITTED: when a
      // concurrent save advances `current_version_id`, EvalPlanQual re-checks
      // the updated proposal row, but the version row it now points at was
      // inserted after this statement's snapshot and is invisible to it, so
      // the join returns nothing and the save race loser is told the proposal
      // does not exist instead of receiving a stale-version conflict.
      const locked = await client.query(
        `SELECT 1 FROM proposal
         WHERE tenant_id = $1 AND owner_workspace_id = $2 AND id = $3
         FOR UPDATE`,
        [scope.tenantId, scope.workspaceId, id],
      );
      if (locked.rowCount !== 1) return null;
    }
    const result = await client.query<ProposalRow>(
      `SELECT proposal.id, proposal.current_version_id, proposal.tenant_id,
         proposal.owner_workspace_id, proposal.owner_workspace_kind,
         proposal.challenge_id, proposal.assigned_membership_ids, proposal.state,
         proposal.tracking_code, proposal.lock_version, proposal.submitted_at,
         proposal.created_by_user_id, proposal.created_at, proposal.updated_at,
         version.content, rule.nda_required
       FROM proposal
       JOIN proposal_version AS version
         ON version.id = proposal.current_version_id AND version.proposal_id = proposal.id
       JOIN challenge ON challenge.id = proposal.challenge_id
       JOIN eligibility_rule AS rule
         ON rule.challenge_id = challenge.id
        AND rule.challenge_version_id = challenge.published_version_id
       WHERE proposal.tenant_id = $1 AND proposal.owner_workspace_id = $2
         AND proposal.id = $3
       ${lock ? "" : "FOR SHARE OF proposal, version"}`,
      [scope.tenantId, scope.workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!isProposalState(row.state)) throw new Error("Database returned invalid proposal state");
    if (row.owner_workspace_kind !== "individual" && row.owner_workspace_kind !== "team") {
      throw new Error("Database returned invalid proposal workspace kind");
    }
    assertProposalContent(row.content);
    const version = aggregateVersion(row.lock_version);
    return {
      id: parseProposalId(row.id),
      current_version_id: parseProposalVersionId(row.current_version_id),
      tenant_id: parseTenantId(row.tenant_id),
      owner_workspace_id: parseWorkspaceId(row.owner_workspace_id),
      owner_workspace_kind: row.owner_workspace_kind,
      challenge_id: parseChallengeId(row.challenge_id),
      assigned_membership_ids: row.assigned_membership_ids.map(parseMembershipId),
      state: row.state,
      tracking_code: row.tracking_code,
      version,
      readiness: proposalReadiness(row.content, version, {
        ndaRequired: row.nda_required,
      }),
      content: structuredClone(row.content),
      versions: await this.versions(client, scope, row.id),
      submitted_at: row.submitted_at?.toISOString() ?? null,
      created_by: parseUserId(row.created_by_user_id),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private async assertDraftableChallenge(client: PoolClient, challengeId: string): Promise<void> {
    const now = this.clock.now().toISOString();
    const result = await client.query(
      `SELECT projection.challenge_id
       FROM challenge_public_projection AS projection
       JOIN challenge ON challenge.id = projection.challenge_id
       WHERE projection.challenge_id = $1
         AND projection.visibility IN ('public','registered')
         AND projection.state = 'open' AND projection.proposal_deadline > $2
         AND challenge.published_version_id = projection.challenge_version_id
         AND challenge.publication_state = 'open' AND challenge.proposal_deadline_at > $2
       FOR SHARE OF projection, challenge`,
      [challengeId, now],
    );
    if (result.rowCount !== 1) throw notFound();
  }

  async create(
    body: CreateProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "proposal.create",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      if (!(await this.permitted(context, "create-proposal"))) throw forbidden();
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);
      if (body.expected_version !== 0 || !isAggregateVersion(body.expected_version)) {
        throw new ApiProblem(422, "VALIDATION", "A new proposal must expect version zero");
      }
      await this.assertDraftableChallenge(client, body.challenge_id);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `proposal:${context.tenantId}:${context.workspaceId}:${body.challenge_id}`,
      ]);
      const existing = await client.query(
        `SELECT id FROM proposal
         WHERE tenant_id = $1 AND owner_workspace_id = $2 AND challenge_id = $3
           AND state <> 'withdrawn' FOR SHARE`,
        [context.tenantId, context.workspaceId, body.challenge_id],
      );
      if (existing.rowCount !== 0) {
        throw new ApiProblem(409, "CONFLICT", "An active proposal already exists for this call");
      }

      const proposalId = parseProposalId(this.ids.next("prp"));
      const proposalVersionId = parseProposalVersionId(this.ids.next("prv"));
      const occurredAt = this.clock.now().toISOString();
      const empty = emptyProposalContent();
      const content = body.draft ? mergeProposalContent(empty, body.draft) : empty;
      const assignedMembershipIds = context.role === "individual" ? [] : [context.membershipId];
      await client.query(
        `INSERT INTO proposal (
           id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
           current_version_id, state, assigned_membership_ids, lock_version,
           created_by_user_id, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7::text[],1,$8,$9,$9)`,
        [
          proposalId,
          context.tenantId,
          context.workspaceId,
          context.role === "individual" ? "individual" : "team",
          body.challenge_id,
          proposalVersionId,
          assignedMembershipIds,
          context.actorUserId,
          occurredAt,
        ],
      );
      await client.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields, base_version_id, created_at
         ) VALUES ($1,$2,$3,1,$4,$5::jsonb,$6,$7::text[],NULL,$8)`,
        [
          proposalVersionId,
          proposalId,
          body.challenge_id,
          context.actorUserId,
          JSON.stringify(content),
          proposalContentHash(content),
          changedProposalFields(empty, content),
          occurredAt,
        ],
      );
      const resource = await this.findScoped(client, context, proposalId, false);
      if (!resource) throw new Error("Created proposal could not be read in its owning scope");
      return this.record(client, resource, context, "proposal.draft.created", requestHash);
    });
  }

  async getScoped(scope: ProposalScope, id: string): Promise<ProposalResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const resource = await this.findScoped(client, scope, id, false);
      if (!resource) return null;
      return (await this.permitted(scope, "edit-proposal", resource.assigned_membership_ids))
        ? resource
        : null;
    });
  }

  async patch(
    id: string,
    body: PatchProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "proposal.patch",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (!(await this.permitted(context, "edit-proposal", current.assigned_membership_ids))) {
        throw notFound();
      }
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.state !== "draft") {
        throw new ApiProblem(409, "INVALID_STATE", "Proposal content is not editable", {
          currentState: current.state,
        });
      }
      const content = mergeProposalContent(current.content, body.patch);
      const version = current.version + 1;
      const versionId = parseProposalVersionId(this.ids.next("prv"));
      const occurredAt = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields, base_version_id, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::text[],$9,$10)`,
        [
          versionId,
          current.id,
          current.challenge_id,
          version,
          context.actorUserId,
          JSON.stringify(content),
          proposalContentHash(content),
          changedProposalFields(current.content, content),
          current.current_version_id,
          occurredAt,
        ],
      );
      const update = await client.query(
        `UPDATE proposal SET current_version_id = $4, lock_version = $5, updated_at = $6
         WHERE tenant_id = $1 AND owner_workspace_id = $2 AND id = $3 AND lock_version = $7`,
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
      if (update.rowCount !== 1) {
        throw new Error("Proposal optimistic update did not affect exactly one aggregate");
      }
      const resource = await this.findScoped(client, context, current.id, false);
      if (!resource) throw new Error("Updated proposal could not be read in its owning scope");
      return this.record(client, resource, context, "proposal.draft.updated", requestHash);
    });
  }

  async submit(
    id: string,
    body: SubmitProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const requestHash = commandFingerprint({
      action: "proposal.submit",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const current = await this.findScoped(client, context, id, true);
      if (!current) throw notFound();
      if (!(await this.permitted(context, "submit-proposal", current.assigned_membership_ids))) {
        throw notFound();
      }
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.state !== "draft") {
        throw new ApiProblem(409, "INVALID_STATE", "Proposal is not an editable draft", {
          currentState: current.state,
          allowedTransitions: [],
        });
      }

      const gate = await client.query<SubmissionGateRow>(
        `SELECT transaction_timestamp() AS server_now,
                challenge.id AS challenge_id,
                challenge.published_version_id AS challenge_version_id,
                challenge.tenant_id AS organization_tenant_id,
                challenge.workspace_id AS organization_workspace_id,
                challenge.publication_state,
                challenge.proposal_deadline_at,
                rule.allowed_applicant_types,
                rule.verification_required,
                rule.nda_required,
                rule.document_gate_required,
                profile.applicant_type,
                verification.state AS verification_state,
                EXISTS (
                  SELECT 1 FROM eligibility_gate_acceptance
                  WHERE tenant_id = profile.tenant_id
                    AND workspace_id = profile.workspace_id
                    AND challenge_id = challenge.id
                    AND challenge_version_id = challenge.published_version_id
                    AND gate = 'nda'
                ) AS nda_accepted,
                EXISTS (
                  SELECT 1 FROM eligibility_gate_acceptance
                  WHERE tenant_id = profile.tenant_id
                    AND workspace_id = profile.workspace_id
                    AND challenge_id = challenge.id
                    AND challenge_version_id = challenge.published_version_id
                    AND gate = 'document_acknowledgement'
                ) AS document_acknowledged
         FROM challenge_public_projection AS projection
         JOIN challenge ON challenge.id = projection.challenge_id
          AND challenge.published_version_id = projection.challenge_version_id
         JOIN eligibility_rule AS rule
           ON rule.challenge_id = challenge.id
          AND rule.challenge_version_id = challenge.published_version_id
         JOIN solver_workspace_profile AS profile
           ON profile.tenant_id = $1 AND profile.workspace_id = $2
         JOIN verification_record AS verification
           ON verification.tenant_id = profile.tenant_id
          AND verification.workspace_id = profile.workspace_id
         WHERE challenge.id = $3
           AND projection.visibility IN ('public','registered')
           AND challenge.published_version_id IS NOT NULL
           AND challenge.publication_state IS NOT NULL
           AND challenge.proposal_deadline_at IS NOT NULL
         FOR UPDATE OF challenge, profile, verification, rule, projection`,
        [context.tenantId, context.workspaceId, current.challenge_id],
      );
      const facts = gate.rows[0];
      if (!facts || !isApplicantType(facts.applicant_type)) throw notFound();
      const now = facts.server_now;
      const occurredAt = now.toISOString();
      if (body.accepted_challenge_version_id !== facts.challenge_version_id) {
        throw new ApiProblem(409, "CONFLICT", "Accepted challenge terms are no longer current", {
          fields: [
            {
              path: "/accepted_challenge_version_id",
              code: "stale_challenge_version",
              message: "Refresh the challenge terms and explicitly accept the current version.",
            },
          ],
          recovery: "refresh_challenge_terms",
        });
      }

      const eligibility = evaluateProposalEligibility(
        {
          challengeVersionId: parseChallengeVersionId(facts.challenge_version_id),
          allowedApplicantTypes: facts.allowed_applicant_types.filter(isApplicantType),
          verificationRequired: facts.verification_required,
          ndaRequired: facts.nda_required,
          documentGateRequired: facts.document_gate_required,
        },
        {
          state: facts.publication_state,
          proposalDeadline: facts.proposal_deadline_at.toISOString(),
        },
        {
          workspaceId: context.workspaceId,
          applicantType: facts.applicant_type,
          workspaceVerified: facts.verification_state === "verified",
          ndaAccepted: facts.nda_accepted,
          documentGateAcknowledged: facts.document_acknowledged,
        },
        now,
      );
      const eligibilityResource = {
        challenge_id: parseChallengeId(facts.challenge_id),
        evaluated_against_version_id: parseChallengeVersionId(facts.challenge_version_id),
        applicant_type: facts.applicant_type,
        status: eligibility.status,
        reasons: eligibility.reasons,
        next_actions: eligibility.nextActions,
        evaluated_at: occurredAt,
      } as const;
      if (eligibility.status !== "eligible") {
        throw new ApiProblem(409, "INVALID_STATE", "Proposal submission eligibility is not met", {
          currentState: facts.publication_state,
          recovery: eligibility.nextActions.length
            ? "complete_eligibility_actions"
            : "refresh_call_state",
          eligibility: eligibilityResource,
        });
      }

      const readiness = proposalReadiness(current.content, current.version, {
        ndaRequired: facts.nda_required,
      });
      if (!readiness.ready) {
        throw new ApiProblem(422, "VALIDATION", "Proposal form is not ready for submission", {
          currentVersion: current.version,
          fields: readiness.issues,
          recovery: "complete_proposal",
        });
      }

      const submittedVersion = current.version + 1;
      const submittedVersionId = parseProposalVersionId(this.ids.next("prv"));
      const grantId = parseAccessGrantId(this.ids.next("agr"));
      const expiresAt = new Date(now.getTime() + C4_PROPOSAL_GRANT_DURATION_MS).toISOString();
      await client.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields, base_version_id,
           accepted_challenge_version_id, locked_at, lock_reason, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'{}'::text[],$8,$9,$10,'submission',$10)`,
        [
          submittedVersionId,
          current.id,
          current.challenge_id,
          submittedVersion,
          context.actorUserId,
          JSON.stringify(current.content),
          proposalContentHash(current.content),
          current.current_version_id,
          facts.challenge_version_id,
          occurredAt,
        ],
      );
      const update = await client.query<{ tracking_code: string }>(
        `UPDATE proposal
         SET current_version_id = $4,
             state = 'submitted',
             tracking_code = 'PRP-' || extract(year from $5::timestamptz)::integer::text
               || '-' || lpad(nextval('proposal_tracking_sequence')::text, 6, '0'),
             lock_version = $6,
             submitted_at = $5,
             updated_at = $5
         WHERE tenant_id = $1 AND owner_workspace_id = $2 AND id = $3
           AND lock_version = $7 AND state = 'draft'
         RETURNING tracking_code`,
        [
          context.tenantId,
          context.workspaceId,
          current.id,
          submittedVersionId,
          occurredAt,
          submittedVersion,
          current.version,
        ],
      );
      if (update.rowCount !== 1) {
        throw new ApiProblem(409, "CONFLICT", "Proposal changed while it was being submitted", {
          recovery: "refetch_and_retry",
        });
      }
      await client.query(
        `INSERT INTO access_grant (
           id, grantor_tenant_id, grantor_workspace_id,
           grantee_tenant_id, grantee_workspace_id,
           resource_type, resource_id, capability, state,
           valid_from, expires_at, created_by_user_id, created_at,
           proposal_version_id
         ) VALUES ($1,$2,$3,$4,$5,'proposal',$6,'read','active',$7,$8,$9,$7,$10)`,
        [
          grantId,
          context.tenantId,
          context.workspaceId,
          facts.organization_tenant_id,
          facts.organization_workspace_id,
          current.id,
          occurredAt,
          expiresAt,
          context.actorUserId,
          submittedVersionId,
        ],
      );
      const resource = await this.findScoped(client, context, current.id, false);
      if (!resource) throw new Error("Submitted proposal could not be read in its owning scope");
      return this.record(client, resource, context, "proposal.submitted", requestHash, {
        occurredAt,
        nextActions: ["await_eligibility"],
        metadata: { submitted_version_id: submittedVersionId, grant_id: grantId },
      });
    });
  }

  private async organizationInboxRows(
    scope: WorkspaceScope,
  ): Promise<OrganizationProposalInboxItemResource[]> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<OrganizationProposalInboxRow>(
        `SELECT proposal.id, proposal.challenge_id, proposal.owner_workspace_kind,
                proposal.state, proposal.tracking_code, proposal.submitted_at,
                version.id AS proposal_version_id, version.version_number,
                version.base_version_id, version.accepted_challenge_version_id,
                version.changed_fields, version.content_hash, version.locked_at
         FROM access_grant AS grant_row
         JOIN proposal ON proposal.id = grant_row.resource_id
         JOIN proposal_version AS version
           ON version.id = grant_row.proposal_version_id
          AND version.proposal_id = proposal.id
         JOIN challenge
           ON challenge.id = proposal.challenge_id
          AND challenge.tenant_id = $1
          AND challenge.workspace_id = $2
         WHERE grant_row.grantee_tenant_id = $1
           AND grant_row.grantee_workspace_id = $2
           AND grant_row.resource_type = 'proposal'
           AND grant_row.capability = 'read'
           AND grant_row.state = 'active'
           AND grant_row.valid_from <= transaction_timestamp()
           AND grant_row.expires_at > transaction_timestamp()
           AND version.locked_at IS NOT NULL
           AND version.accepted_challenge_version_id IS NOT NULL
         ORDER BY proposal.submitted_at DESC, proposal.id
         LIMIT 100`,
        [scope.tenantId, scope.workspaceId],
      );
      return result.rows.map(organizationProposalInboxItem);
    });
  }

  async listForOrganization(scope: WorkspaceScope): Promise<OrganizationProposalInboxResource> {
    return { items: await this.organizationInboxRows(scope) };
  }

  async getForOrganization(
    scope: WorkspaceScope,
    id: string,
  ): Promise<OrganizationProposalResource | null> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<OrganizationProposalRow>(
        `SELECT proposal.id, proposal.challenge_id, proposal.owner_workspace_kind,
                proposal.state, proposal.tracking_code, proposal.submitted_at,
                version.id AS proposal_version_id, version.version_number,
                version.base_version_id, version.accepted_challenge_version_id,
                version.changed_fields, version.content_hash, version.locked_at,
                version.content
         FROM access_grant AS grant_row
         JOIN proposal ON proposal.id = grant_row.resource_id
         JOIN proposal_version AS version
           ON version.id = grant_row.proposal_version_id
          AND version.proposal_id = proposal.id
         JOIN challenge
           ON challenge.id = proposal.challenge_id
          AND challenge.tenant_id = $1
          AND challenge.workspace_id = $2
         WHERE grant_row.grantee_tenant_id = $1
           AND grant_row.grantee_workspace_id = $2
           AND grant_row.resource_type = 'proposal'
           AND grant_row.capability = 'read'
           AND grant_row.state = 'active'
           AND grant_row.valid_from <= transaction_timestamp()
           AND grant_row.expires_at > transaction_timestamp()
           AND proposal.id = $3
           AND version.locked_at IS NOT NULL
           AND version.accepted_challenge_version_id IS NOT NULL
         LIMIT 1`,
        [scope.tenantId, scope.workspaceId, id],
      );
      const row = result.rows[0];
      return row ? organizationProposalResource(row) : null;
    });
  }
}
