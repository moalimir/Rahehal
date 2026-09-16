import type {
  AcceptEligibilityGateBody,
  EligibilityDecisionResource,
  MutationReceipt,
  PatchSolverWorkspaceProfileBody,
  SolverProfileNextAction,
  SolverVerificationNextAction,
  SolverVerificationResource,
  SolverWorkspaceProfileResource,
  StartSolverVerificationBody,
  EligibilityGateNextAction,
} from "@rahhal/contracts";
import {
  evaluateProposalEligibility,
  evaluateSolverProfileReadiness,
  isApplicantType,
  isVerificationState,
  parseAuditEventId,
  parseChallengeId,
  parseChallengeVersionId,
  parseEligibilityGateAcceptanceId,
  parseReceiptId,
  parseTenantId,
  parseVerificationId,
  parseWorkspaceId,
  type EligibilityGateAcceptanceId,
  type EligibilityGateKind,
  type VerificationId,
  type WorkspaceId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import { validateSolverProfilePatch } from "../solver-profile-validation.js";
import type {
  Clock,
  EligibilityPort,
  IdFactory,
  MutationOutcome,
  SolverWorkspacePort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";
import { challengeParticipation } from "./challenge-participation.js";

type ProfileRow = {
  tenant_id: string;
  workspace_id: string;
  workspace_kind: string;
  applicant_type: string;
  headline: string;
  overview: string;
  expertise: string[];
  geography: string[];
  lock_version: number;
  created_at: Date;
  updated_at: Date;
};
type VerificationRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  state: string;
  lock_version: number;
  requested_at: Date | null;
  submitted_at: Date | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type EligibilityRow = ProfileRow & {
  verification_state: string;
  challenge_id: string;
  challenge_version_id: string;
  allowed_applicant_types: string[];
  verification_required: boolean;
  nda_required: boolean;
  document_gate_required: boolean;
  publication_state: "open" | "paused" | "closed" | "cancelled";
  proposal_deadline_at: Date;
  nda_accepted: boolean;
  document_acknowledged: boolean;
};
type IdempotencyRow = {
  request_hash: string;
  status: string;
  response_body: unknown;
};
type CachedMutation = {
  entity_id: string;
  entity_version: number;
  receipt_id: string;
  audit_event_id: string;
  timestamp: string;
  next_actions: string[];
};

const canEditProfile = (context: Pick<WorkspaceCommandContext, "role" | "teamPolicy">) =>
  context.role === "individual" ||
  context.role === "team:owner" ||
  context.role === "team:admin" ||
  (context.role === "team:proposal-manager" &&
    context.teamPolicy?.proposalManagersCanEditProfile === true);

const canManageSolverAuthority = (role: WorkspaceCommandContext["role"]) =>
  role === "individual" || role === "team:owner" || role === "team:admin";

function profileResource(row: ProfileRow): SolverWorkspaceProfileResource {
  if (
    (row.workspace_kind !== "individual" && row.workspace_kind !== "team") ||
    !isApplicantType(row.applicant_type)
  ) {
    throw new Error("Database returned an invalid solver profile");
  }
  const facts = {
    headline: row.headline,
    overview: row.overview,
    expertise: row.expertise,
    geography: row.geography,
  };
  return {
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    workspace_kind: row.workspace_kind,
    applicant_type: row.applicant_type,
    ...facts,
    readiness: evaluateSolverProfileReadiness(facts),
    version: Number(row.lock_version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function verificationResource(row: VerificationRow): SolverVerificationResource {
  if (!isVerificationState(row.state))
    throw new Error("Database returned an invalid verification state");
  return {
    id: parseVerificationId(row.id),
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    state: row.state,
    version: Number(row.lock_version),
    requested_at: row.requested_at?.toISOString() ?? null,
    submitted_at: row.submitted_at?.toISOString() ?? null,
    verified_at: row.verified_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function cachedMutation(value: unknown): CachedMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned an invalid solver idempotency response");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.entity_id !== "string" ||
    typeof row.entity_version !== "number" ||
    typeof row.receipt_id !== "string" ||
    typeof row.audit_event_id !== "string" ||
    typeof row.timestamp !== "string" ||
    !Array.isArray(row.next_actions) ||
    !row.next_actions.every((item) => typeof item === "string")
  ) {
    throw new Error("Database returned an invalid solver idempotency response");
  }
  return row as CachedMutation;
}

export class PostgresSolverWorkspaceAdapter implements SolverWorkspacePort, EligibilityPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private async lockIdempotency(client: PoolClient, context: WorkspaceCommandContext) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      [context.tenantId, context.idempotencyKey].join(":"),
    ]);
  }

  private async replay(
    client: PoolClient,
    context: WorkspaceCommandContext,
    requestHash: string,
  ): Promise<CachedMutation | null> {
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

  private outcome<Target extends string, Next extends string>(
    cached: CachedMutation,
    parseTarget: (value: unknown) => Target,
    idempotent: boolean,
  ): MutationOutcome<Target, Next> {
    const receipt: MutationReceipt<Target, Next> = {
      entity_id: parseTarget(cached.entity_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: new Date(cached.timestamp).toISOString(),
      idempotent,
      next_actions: cached.next_actions as Next[],
    };
    return { receipt, entityVersion: cached.entity_version };
  }

  private async record<Target extends string, Next extends string>(
    client: PoolClient,
    target: Target,
    targetType: string,
    version: number,
    context: WorkspaceCommandContext,
    action: string,
    nextActions: readonly Next[],
    requestHash: string,
    parseTarget: (value: unknown) => Target,
    payload: Readonly<Record<string, unknown>> = {},
  ): Promise<MutationOutcome<Target, Next>> {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const eventId = this.ids.next("evt");
    const cached: CachedMutation = {
      entity_id: target,
      entity_version: version,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: [...nextActions],
    };
    await client.query(
      `INSERT INTO audit_event (
         id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
         action, outcome, reason_code, target_type, target_id, metadata, occurred_at
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED',$7,$8,
         jsonb_build_object('entity_version',$9::bigint),$10)`,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        action,
        targetType,
        target,
        version,
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO mutation_receipt (
         id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
         audit_event_id, correlation_id, next_actions, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        receiptId,
        context.tenantId,
        context.workspaceId,
        targetType,
        target,
        version,
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
       ) VALUES ($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$9)`,
      [
        eventId,
        context.tenantId,
        context.correlationId,
        action,
        targetType,
        target,
        JSON.stringify({ entity_version: version, ...payload }),
        [action, target, version].join(":"),
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO idempotency_key (
         id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
         request_hash, status, response_status, response_body, created_at, expires_at
       ) VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',200,$5::jsonb,$6,$7)`,
      [
        "idk_" +
          commandFingerprint({
            tenantId: context.tenantId,
            idempotencyKey: context.idempotencyKey,
          }),
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        occurredAt,
        new Date(Date.parse(occurredAt) + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.outcome(cached, parseTarget, false);
  }

  private async findProfile(
    client: PoolClient,
    scope: WorkspaceScope,
    lock: boolean,
  ): Promise<SolverWorkspaceProfileResource | null> {
    const result = await client.query<ProfileRow>(
      `SELECT tenant_id, workspace_id, workspace_kind, applicant_type, headline, overview,
              expertise, geography, lock_version, created_at, updated_at
       FROM solver_workspace_profile
       WHERE tenant_id = $1 AND workspace_id = $2
       ${lock ? "FOR UPDATE" : "FOR SHARE"}`,
      [scope.tenantId, scope.workspaceId],
    );
    return result.rows[0] ? profileResource(result.rows[0]) : null;
  }

  async getProfile(scope: WorkspaceScope): Promise<SolverWorkspaceProfileResource | null> {
    return this.unitOfWork.run(() =>
      this.findProfile(this.unitOfWork.currentClient(), scope, false),
    );
  }

  async patchProfile(
    body: PatchSolverWorkspaceProfileBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, SolverProfileNextAction>> {
    validateSolverProfilePatch(body);
    const requestHash = commandFingerprint({
      action: "solver.profile.updated",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, parseWorkspaceId, true);
      if (!canEditProfile(context)) throw forbidden();
      const current = await this.findProfile(client, context, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      const result = await client.query<ProfileRow>(
        `UPDATE solver_workspace_profile
         SET headline = COALESCE($3, headline), overview = COALESCE($4, overview),
             expertise = COALESCE($5::text[], expertise), geography = COALESCE($6::text[], geography),
             lock_version = lock_version + 1, updated_at = $7
         WHERE tenant_id = $1 AND workspace_id = $2
         RETURNING tenant_id, workspace_id, workspace_kind, applicant_type, headline, overview,
                   expertise, geography, lock_version, created_at, updated_at`,
        [
          context.tenantId,
          context.workspaceId,
          body.patch.headline ?? null,
          body.patch.overview ?? null,
          body.patch.expertise ?? null,
          body.patch.geography ?? null,
          this.clock.now().toISOString(),
        ],
      );
      const updated = profileResource(result.rows[0]!);
      return this.record(
        client,
        updated.workspace_id,
        "solver_workspace_profile",
        updated.version,
        context,
        "solver.profile.updated",
        updated.readiness.ready ? ["continue"] : ["review_profile"],
        requestHash,
        parseWorkspaceId,
      );
    });
  }

  private async findVerification(
    client: PoolClient,
    scope: WorkspaceScope,
    lock: boolean,
  ): Promise<SolverVerificationResource | null> {
    const result = await client.query<VerificationRow>(
      `SELECT verification.id, verification.tenant_id, verification.workspace_id,
              verification.state, verification.lock_version, verification.requested_at,
              verification.submitted_at, verification.verified_at,
              verification.created_at, verification.updated_at
       FROM verification_record AS verification
       JOIN solver_workspace_profile AS profile
         ON profile.workspace_id = verification.workspace_id
        AND profile.tenant_id = verification.tenant_id
       WHERE verification.tenant_id = $1 AND verification.workspace_id = $2
       ${lock ? "FOR UPDATE OF verification" : "FOR SHARE OF verification"}`,
      [scope.tenantId, scope.workspaceId],
    );
    return result.rows[0] ? verificationResource(result.rows[0]) : null;
  }

  async getVerification(scope: WorkspaceScope): Promise<SolverVerificationResource | null> {
    return this.unitOfWork.run(() =>
      this.findVerification(this.unitOfWork.currentClient(), scope, false),
    );
  }

  async startVerification(
    body: StartSolverVerificationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<VerificationId, SolverVerificationNextAction>> {
    const requestHash = commandFingerprint({
      action: "verification.draft.created",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, parseVerificationId, true);
      if (!canManageSolverAuthority(context.role)) throw forbidden();
      const current = await this.findVerification(client, context, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (current.state !== "not_started") {
        throw new ApiProblem(409, "INVALID_STATE", "Verification has already started", {
          currentState: current.state,
        });
      }
      const now = this.clock.now().toISOString();
      const result = await client.query<VerificationRow>(
        `UPDATE verification_record
         SET state = 'draft', lock_version = lock_version + 1,
             requested_at = $3, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2
         RETURNING id, tenant_id, workspace_id, state, lock_version, requested_at,
                   submitted_at, verified_at, created_at, updated_at`,
        [context.tenantId, context.workspaceId, now],
      );
      const updated = verificationResource(result.rows[0]!);
      return this.record(
        client,
        updated.id,
        "verification_record",
        updated.version,
        context,
        "verification.draft.created",
        ["complete_verification_request"],
        requestHash,
        parseVerificationId,
      );
    });
  }

  async acceptEligibilityGate(
    challengeId: string,
    gate: EligibilityGateKind,
    body: AcceptEligibilityGateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<EligibilityGateAcceptanceId, EligibilityGateNextAction>> {
    const requestHash = commandFingerprint({
      action: "eligibility.gate.accepted",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      gate,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, parseEligibilityGateAcceptanceId, true);
      if (!canManageSolverAuthority(context.role)) throw forbidden();
      if (body.expected_version !== 0) {
        throw new ApiProblem(422, "VALIDATION", "A new gate acceptance must expect version zero");
      }
      const visible = await client.query<{ required: boolean }>(
        `SELECT CASE $4::text
                 WHEN 'nda' THEN rule.nda_required
                 ELSE rule.document_gate_required
               END AS required
         FROM solver_workspace_profile AS profile
         JOIN challenge ON challenge.id = $3
          AND challenge.published_version_id = $5
         LEFT JOIN challenge_public_projection AS projection
           ON projection.challenge_id = challenge.id
          AND projection.challenge_version_id = challenge.published_version_id
         JOIN eligibility_rule AS rule
           ON rule.challenge_id = challenge.id
          AND rule.challenge_version_id = challenge.published_version_id
         WHERE profile.tenant_id = $1 AND profile.workspace_id = $2
           AND (
             projection.challenge_id IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM access_grant
               WHERE grantee_tenant_id = profile.tenant_id
                 AND grantee_workspace_id = profile.workspace_id
                 AND resource_type = 'challenge'
                 AND resource_id = challenge.id
                 AND capability = 'read'
                 AND state = 'active'
                 AND valid_from <= $6
                 AND expires_at > $6
             )
           )
         FOR UPDATE OF challenge`,
        [
          context.tenantId,
          context.workspaceId,
          challengeId,
          gate,
          body.challenge_version_id,
          this.clock.now().toISOString(),
        ],
      );
      if (!visible.rows[0]?.required) throw notFound();
      const existing = await client.query(
        `SELECT 1 FROM eligibility_gate_acceptance
         WHERE workspace_id = $1 AND challenge_version_id = $2 AND gate = $3`,
        [context.workspaceId, body.challenge_version_id, gate],
      );
      if (existing.rowCount) {
        throw new ApiProblem(409, "CONFLICT", "The eligibility gate is already accepted", {
          recovery: "recheck_eligibility",
        });
      }
      const id = parseEligibilityGateAcceptanceId(this.ids.next("ega"));
      const now = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO eligibility_gate_acceptance (
           id, tenant_id, workspace_id, challenge_id, challenge_version_id,
           gate, accepted_by_user_id, accepted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          context.tenantId,
          context.workspaceId,
          parseChallengeId(challengeId),
          body.challenge_version_id,
          gate,
          context.actorUserId,
          now,
        ],
      );
      return this.record(
        client,
        id,
        "eligibility_gate_acceptance",
        1,
        context,
        "eligibility.gate.accepted",
        ["recheck_eligibility"],
        requestHash,
        parseEligibilityGateAcceptanceId,
        { challenge_version_id: body.challenge_version_id, gate },
      );
    });
  }

  async evaluate(
    scope: WorkspaceScope,
    challengeId: string,
  ): Promise<EligibilityDecisionResource | null> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<EligibilityRow>(
        `SELECT profile.tenant_id, profile.workspace_id, profile.workspace_kind,
                profile.applicant_type, profile.headline, profile.overview,
                profile.expertise, profile.geography, profile.lock_version,
                profile.created_at, profile.updated_at,
                verification.state AS verification_state,
                challenge.id AS challenge_id,
                challenge.published_version_id AS challenge_version_id,
                rule.allowed_applicant_types, rule.verification_required,
                rule.nda_required, rule.document_gate_required,
                challenge.publication_state, challenge.proposal_deadline_at,
                EXISTS (
                  SELECT 1 FROM eligibility_gate_acceptance
                  WHERE tenant_id = profile.tenant_id
                    AND workspace_id = profile.workspace_id
                    AND challenge_version_id = challenge.published_version_id
                    AND gate = 'nda'
                ) AS nda_accepted,
                EXISTS (
                  SELECT 1 FROM eligibility_gate_acceptance
                  WHERE tenant_id = profile.tenant_id
                    AND workspace_id = profile.workspace_id
                    AND challenge_version_id = challenge.published_version_id
                    AND gate = 'document_acknowledgement'
                ) AS document_acknowledged
         FROM solver_workspace_profile AS profile
         JOIN verification_record AS verification
           ON verification.tenant_id = profile.tenant_id
          AND verification.workspace_id = profile.workspace_id
         JOIN challenge ON challenge.id = $3
         LEFT JOIN challenge_public_projection AS projection
           ON projection.challenge_id = challenge.id
          AND projection.challenge_version_id = challenge.published_version_id
         JOIN eligibility_rule AS rule
           ON rule.challenge_id = challenge.id
          AND rule.challenge_version_id = challenge.published_version_id
         WHERE profile.tenant_id = $1 AND profile.workspace_id = $2
           AND challenge.published_version_id IS NOT NULL
           AND challenge.publication_state IS NOT NULL
           AND challenge.proposal_deadline_at IS NOT NULL
           AND (
             projection.challenge_id IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM access_grant
               WHERE grantee_tenant_id = profile.tenant_id
                 AND grantee_workspace_id = profile.workspace_id
                 AND resource_type = 'challenge'
                 AND resource_id = challenge.id
                 AND capability = 'read'
                 AND state = 'active'
                 AND valid_from <= $4
                 AND expires_at > $4
             )
           )
         FOR SHARE OF profile, verification, challenge, rule`,
        [scope.tenantId, scope.workspaceId, challengeId, this.clock.now().toISOString()],
      );
      const row = result.rows[0];
      if (!row || !isApplicantType(row.applicant_type)) return null;
      const now = this.clock.now();
      const participation = await challengeParticipation(
        this.unitOfWork.currentClient(),
        scope,
        challengeId,
      );
      const decision = evaluateProposalEligibility(
        {
          invitationRequired: participation.invitationRequired,
          challengeVersionId: parseChallengeVersionId(row.challenge_version_id),
          allowedApplicantTypes: row.allowed_applicant_types.filter(isApplicantType),
          verificationRequired: row.verification_required,
          ndaRequired: row.nda_required,
          documentGateRequired: row.document_gate_required,
        },
        {
          state: row.publication_state,
          proposalDeadline: row.proposal_deadline_at.toISOString(),
        },
        {
          workspaceId: parseWorkspaceId(row.workspace_id),
          hasActiveInvitation: participation.hasActiveInvitation,
          applicantType: row.applicant_type,
          workspaceVerified: row.verification_state === "verified",
          ndaAccepted: row.nda_accepted,
          documentGateAcknowledged: row.document_acknowledged,
        },
        now,
      );
      return {
        challenge_id: parseChallengeId(row.challenge_id),
        evaluated_against_version_id: parseChallengeVersionId(row.challenge_version_id),
        applicant_type: row.applicant_type,
        status: decision.status,
        reasons: decision.reasons,
        next_actions: decision.nextActions,
        evaluated_at: now.toISOString(),
      };
    });
  }
}
