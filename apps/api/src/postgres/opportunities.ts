import type {
  CancelDirectOfferBody,
  CreateDirectOfferBody,
  DeclineDirectOfferBody,
  DirectOfferListResource,
  DirectOfferNextAction,
  DirectOfferResource,
  MutationReceipt,
  OfferResponseContentResource,
  PatchOfferResponseBody,
  SaveOpportunityBody,
  SavedOpportunityListResource,
  SavedOpportunityNextAction,
  StartDirectOfferNegotiationBody,
  StartOfferResponseBody,
  SubmitOfferResponseBody,
  UnsaveOpportunityBody,
  ViewDirectOfferBody,
} from "@rahhal/contracts";
import {
  currencies,
  decideTeamPermission,
  evaluateOfferResponseReadiness,
  isDirectOfferOpenForResponse,
  isDirectOfferState,
  isOfferResponseState,
  isTeamRole,
  parseAccessGrantId,
  parseAuditEventId,
  parseChallengeId,
  parseChallengeVersionId,
  parseDirectOfferId,
  parseOfferResponseId,
  parsePrefixedId,
  parseReceiptId,
  parseSavedOpportunityId,
  parseWorkspaceId,
  type DirectOfferId,
  type OpportunityOutboxEventType,
  type SavedOpportunityId,
  type TeamAction,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  OpportunityCommandContext,
  OpportunityPort,
  OpportunityScope,
  TeamPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type SavedOutcome = MutationOutcome<SavedOpportunityId, SavedOpportunityNextAction>;
type OfferOutcome = MutationOutcome<DirectOfferId, DirectOfferNextAction>;

type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

type CachedMutation = {
  readonly entity_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
};

type SavedRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly saved_at: Date;
};

type OfferRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly sender_organization_workspace_id: string;
  readonly recipient_workspace_id: string;
  readonly recipient_workspace_kind: string;
  readonly title: string;
  readonly summary: string;
  readonly invitation_reasons: readonly string[];
  readonly requested_documents: readonly string[];
  readonly response_deadline: Date;
  readonly state: string;
  readonly lock_version: string | number;
  readonly viewed_at: Date | null;
  readonly decline_reason: string | null;
  readonly declined_at: Date | null;
  readonly cancellation_reason: string | null;
  readonly cancelled_at: Date | null;
  readonly expired_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly response_id: string | null;
  readonly response_state: string | null;
  readonly response_lock_version: string | number | null;
  readonly response_content: unknown;
  readonly response_submitted_at: Date | null;
  readonly response_created_at: Date | null;
  readonly response_updated_at: Date | null;
};

type OfferGateRow = {
  readonly sender_tenant_id: string;
  readonly sender_workspace_id: string;
  readonly challenge_version_id: string;
  readonly proposal_deadline_at: Date;
  readonly recipient_tenant_id: string;
  readonly recipient_workspace_id: string;
  readonly recipient_workspace_kind: "individual" | "team";
};

function version(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error("Database returned invalid version");
  return parsed;
}

function cachedMutation(value: unknown): CachedMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned invalid opportunity idempotency data");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row["entity_id"] !== "string" ||
    !Number.isSafeInteger(row["entity_version"]) ||
    typeof row["receipt_id"] !== "string" ||
    typeof row["audit_event_id"] !== "string" ||
    typeof row["timestamp"] !== "string" ||
    !Array.isArray(row["next_actions"]) ||
    !row["next_actions"].every((item) => typeof item === "string")
  ) {
    throw new Error("Database returned invalid opportunity idempotency data");
  }
  return row as CachedMutation;
}

function offerContent(value: unknown): OfferResponseContentResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned invalid offer response content");
  }
  const row = value as Record<string, unknown>;
  const currency = row["budget_currency"];
  if (
    typeof row["approach"] !== "string" ||
    typeof row["scope"] !== "string" ||
    typeof row["start_availability"] !== "string" ||
    (row["duration_weeks"] !== null && !Number.isSafeInteger(row["duration_weeks"])) ||
    (row["budget_amount_minor"] !== null && !Number.isSafeInteger(row["budget_amount_minor"])) ||
    typeof currency !== "string" ||
    !(currencies as readonly string[]).includes(currency) ||
    typeof row["payment_model"] !== "string" ||
    typeof row["negotiables"] !== "string" ||
    typeof row["authority_confirmed"] !== "boolean" ||
    !Array.isArray(row["attachment_ids"]) ||
    !row["attachment_ids"].every((item) => typeof item === "string")
  ) {
    throw new Error("Database returned invalid offer response content");
  }
  return {
    approach: row["approach"],
    scope: row["scope"],
    start_availability: row["start_availability"],
    duration_weeks: row["duration_weeks"] as number | null,
    budget_amount_minor: row["budget_amount_minor"] as number | null,
    budget_currency: currency as OfferResponseContentResource["budget_currency"],
    payment_model: row["payment_model"],
    negotiables: row["negotiables"],
    authority_confirmed: row["authority_confirmed"],
    attachment_ids: row["attachment_ids"].map((item) => parsePrefixedId(item, "fil")),
  };
}

function readiness(content: OfferResponseContentResource, evaluatedVersion: number) {
  return {
    ...evaluateOfferResponseReadiness({
      approach: content.approach,
      scope: content.scope,
      startAvailability: content.start_availability,
      durationWeeks: content.duration_weeks,
      budgetAmountMinor: content.budget_amount_minor,
      budgetCurrency: content.budget_currency,
      paymentModel: content.payment_model,
      negotiables: content.negotiables,
      authorityConfirmed: content.authority_confirmed,
      attachmentIds: content.attachment_ids,
    }),
    evaluated_version: evaluatedVersion,
  };
}

function offerResource(row: OfferRow): DirectOfferResource {
  if (!isDirectOfferState(row.state))
    throw new Error("Database returned invalid direct-offer state");
  if (row.recipient_workspace_kind !== "individual" && row.recipient_workspace_kind !== "team") {
    throw new Error("Database returned invalid direct-offer recipient kind");
  }
  let response: DirectOfferResource["response"] = null;
  if (row.response_id !== null) {
    if (
      !row.response_state ||
      !isOfferResponseState(row.response_state) ||
      row.response_lock_version === null ||
      !row.response_created_at ||
      !row.response_updated_at
    ) {
      throw new Error("Database returned incomplete offer response");
    }
    const content = offerContent(row.response_content);
    const responseVersion = version(row.response_lock_version);
    response = {
      id: parseOfferResponseId(row.response_id),
      state: row.response_state,
      version: responseVersion,
      content,
      readiness: readiness(content, responseVersion),
      submitted_at: row.response_submitted_at?.toISOString() ?? null,
      created_at: row.response_created_at.toISOString(),
      updated_at: row.response_updated_at.toISOString(),
    };
  }
  return {
    id: parseDirectOfferId(row.id),
    challenge_id: parseChallengeId(row.challenge_id),
    challenge_version_id: parseChallengeVersionId(row.challenge_version_id),
    sender_organization_workspace_id: parseWorkspaceId(row.sender_organization_workspace_id),
    recipient_workspace_id: parseWorkspaceId(row.recipient_workspace_id),
    recipient_workspace_kind: row.recipient_workspace_kind,
    title: row.title,
    summary: row.summary,
    invitation_reasons: [...row.invitation_reasons],
    requested_documents: [...row.requested_documents],
    response_deadline: row.response_deadline.toISOString(),
    state: row.state,
    version: version(row.lock_version),
    response,
    viewed_at: row.viewed_at?.toISOString() ?? null,
    decline_reason: row.decline_reason,
    declined_at: row.declined_at?.toISOString() ?? null,
    cancellation_reason: row.cancellation_reason,
    cancelled_at: row.cancelled_at?.toISOString() ?? null,
    expired_at: row.expired_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function senderProjection(resource: DirectOfferResource): DirectOfferResource {
  return resource.response?.state === "draft" ? { ...resource, response: null } : resource;
}

const offerSelect = `
  SELECT offer.id, offer.challenge_id, offer.challenge_version_id,
    offer.sender_organization_workspace_id, offer.recipient_workspace_id,
    offer.recipient_workspace_kind, offer.title, offer.summary,
    offer.invitation_reasons, offer.requested_documents, offer.response_deadline,
    offer.state, offer.lock_version, offer.viewed_at, offer.decline_reason,
    offer.declined_at, offer.cancellation_reason, offer.cancelled_at,
    offer.expired_at, offer.created_at, offer.updated_at,
    response.id AS response_id, response.state AS response_state,
    response.lock_version AS response_lock_version, response.content AS response_content,
    response.submitted_at AS response_submitted_at,
    response.created_at AS response_created_at,
    response.updated_at AS response_updated_at
  FROM direct_offer AS offer
  LEFT JOIN offer_response AS response ON response.direct_offer_id = offer.id`;

function emptyContent(): OfferResponseContentResource {
  return {
    approach: "",
    scope: "",
    start_availability: "",
    duration_weeks: null,
    budget_amount_minor: null,
    budget_currency: "IRR",
    payment_model: "",
    negotiables: "",
    authority_confirmed: false,
    attachment_ids: [],
  };
}

export class PostgresOpportunityAdapter implements OpportunityPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly teams: TeamPort,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private async lockIdempotency(client: PoolClient, context: WorkspaceCommandContext) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
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

  private savedOutcome(cached: CachedMutation, idempotent: boolean): SavedOutcome {
    return {
      entityVersion: cached.entity_version,
      receipt: {
        entity_id: parseSavedOpportunityId(cached.entity_id),
        receipt_id: parseReceiptId(cached.receipt_id),
        audit_event_id: parseAuditEventId(cached.audit_event_id),
        timestamp: new Date(cached.timestamp).toISOString(),
        idempotent,
        next_actions: cached.next_actions as readonly SavedOpportunityNextAction[],
      },
    };
  }

  private offerOutcome(cached: CachedMutation, idempotent: boolean): OfferOutcome {
    return {
      entityVersion: cached.entity_version,
      receipt: {
        entity_id: parseDirectOfferId(cached.entity_id),
        receipt_id: parseReceiptId(cached.receipt_id),
        audit_event_id: parseAuditEventId(cached.audit_event_id),
        timestamp: new Date(cached.timestamp).toISOString(),
        idempotent,
        next_actions: cached.next_actions as readonly DirectOfferNextAction[],
      },
    };
  }

  private async record<TargetId extends SavedOpportunityId | DirectOfferId, Next extends string>(
    client: PoolClient,
    target: TargetId,
    entityType: "saved_opportunity" | "direct_offer",
    entityVersion: number,
    context: WorkspaceCommandContext,
    action: OpportunityOutboxEventType,
    requestHash: string,
    nextActions: readonly Next[],
    responseStatus = 200,
    metadata: Readonly<Record<string, string | number>> = {},
  ): Promise<MutationOutcome<TargetId, Next>> {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const cached: CachedMutation = {
      entity_id: target,
      entity_version: entityVersion,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: nextActions,
    };
    const payload = { entity_version: entityVersion, ...metadata };
    await client.query(
      `INSERT INTO audit_event (
         id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
         action, outcome, reason_code, target_type, target_id, metadata, occurred_at
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED',$7,$8,$9::jsonb,$10)`,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        action,
        entityType,
        target,
        JSON.stringify(payload),
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
        entityType,
        target,
        entityVersion,
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
        parsePrefixedId(this.ids.next("evt"), "evt"),
        context.tenantId,
        context.correlationId,
        action,
        entityType,
        target,
        JSON.stringify(payload),
        `${action}:${target}:${entityVersion}`,
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO idempotency_key (
         id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
         request_hash, status, response_status, response_body, created_at, expires_at
       ) VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',$5,$6::jsonb,$7,$8)`,
      [
        `idk_${commandFingerprint({ tenantId: context.tenantId, key: context.idempotencyKey })}`,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        responseStatus,
        JSON.stringify(cached),
        occurredAt,
        new Date(Date.parse(occurredAt) + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return {
      receipt: {
        entity_id: target,
        receipt_id: receiptId,
        audit_event_id: auditId,
        timestamp: occurredAt,
        idempotent: false,
        next_actions: nextActions,
      } as MutationReceipt<TargetId, Next>,
      entityVersion,
    };
  }

  private async permitted(scope: OpportunityScope, action: TeamAction): Promise<boolean> {
    if (scope.role === "individual") return true;
    if (!isTeamRole(scope.role)) return false;
    const team = await this.teams.get(scope);
    const member = team?.members.find(
      (candidate) =>
        candidate.id === scope.membershipId &&
        candidate.user_id === scope.actorUserId &&
        candidate.role === scope.role &&
        candidate.state === "active",
    );
    return Boolean(
      member &&
        team &&
        decideTeamPermission(action, {
          role: scope.role,
          policy: team.policy,
        }).allowed,
    );
  }

  private async expireDue(client: PoolClient): Promise<void> {
    const now = this.clock.now().toISOString();
    const due = await client.query<{
      id: string;
      sender_tenant_id: string;
      sender_organization_workspace_id: string;
      lock_version: string | number;
    }>(
      `SELECT id, sender_tenant_id, sender_organization_workspace_id, lock_version
       FROM direct_offer
       WHERE state IN ('received','viewed','response_draft') AND response_deadline <= $1
       FOR UPDATE`,
      [now],
    );
    for (const row of due.rows) {
      const nextVersion = version(row.lock_version) + 1;
      await client.query(
        `UPDATE direct_offer SET state = 'expired', lock_version = $2,
           expired_at = $3, updated_at = $3 WHERE id = $1`,
        [row.id, nextVersion, now],
      );
      await client.query(
        `UPDATE access_grant SET state = 'expired'
         WHERE direct_offer_id = $1 AND state = 'active'`,
        [row.id],
      );
      const correlationId = parsePrefixedId(this.ids.next("cor"), "cor");
      const auditId = parseAuditEventId(this.ids.next("aud"));
      const payload = JSON.stringify({ entity_version: nextVersion });
      await client.query(
        `INSERT INTO audit_event (
           id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
           action, outcome, reason_code, target_type, target_id, metadata, occurred_at
         ) VALUES ($1,$2,$3,$4,'system',NULL,'direct-offer.expired','success',
           'DEADLINE_PASSED','direct_offer',$5,$6::jsonb,$7)`,
        [
          auditId,
          correlationId,
          row.sender_tenant_id,
          row.sender_organization_workspace_id,
          row.id,
          payload,
          now,
        ],
      );
      await client.query(
        `INSERT INTO outbox_event (
           id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
           aggregate_id, payload, dedupe_key, occurred_at, available_at
         ) VALUES ($1,$2,$3,'direct-offer.expired',1,'direct_offer',$4,$5::jsonb,$6,$7,$7)`,
        [
          parsePrefixedId(this.ids.next("evt"), "evt"),
          row.sender_tenant_id,
          correlationId,
          row.id,
          payload,
          `direct-offer.expired:${row.id}:${nextVersion}`,
          now,
        ],
      );
    }
  }

  async listSaved(scope: OpportunityScope): Promise<SavedOpportunityListResource> {
    if (!(await this.permitted(scope, "view-workspace"))) throw forbidden();
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<SavedRow>(
        `SELECT id, challenge_id, challenge_version_id, saved_at
         FROM saved_opportunity WHERE tenant_id = $1 AND workspace_id = $2
         ORDER BY saved_at DESC, id`,
        [scope.tenantId, scope.workspaceId],
      );
      return {
        items: result.rows.map((row) => ({
          id: parseSavedOpportunityId(row.id),
          challenge_id: parseChallengeId(row.challenge_id),
          challenge_version_id: parseChallengeVersionId(row.challenge_version_id),
          version: 1,
          saved_at: row.saved_at.toISOString(),
        })),
      };
    });
  }

  async save(
    challengeId: string,
    body: SaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<SavedOutcome> {
    const requestHash = commandFingerprint({
      action: "opportunity.save",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      body,
    });
    if (!(await this.permitted(context, "view-workspace"))) throw forbidden();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.savedOutcome(replay, true);
      if (body.expected_version !== 0)
        throw new ApiProblem(422, "VALIDATION", "A new saved opportunity must expect version zero");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `saved-opportunity:${context.tenantId}:${context.workspaceId}:${challengeId}`,
      ]);
      const projection = await client.query<{ challenge_version_id: string }>(
        `SELECT projection.challenge_version_id
         FROM challenge_public_projection AS projection
         JOIN challenge ON challenge.id = projection.challenge_id
          AND challenge.published_version_id = projection.challenge_version_id
         WHERE projection.challenge_id = $1 AND projection.state = 'open'
           AND projection.proposal_deadline > $2 AND challenge.publication_state = 'open'
           AND challenge.proposal_deadline_at > $2 FOR SHARE OF projection, challenge`,
        [challengeId, this.clock.now().toISOString()],
      );
      const current = projection.rows[0];
      if (!current) throw notFound();
      const duplicate = await client.query(
        `SELECT 1 FROM saved_opportunity
         WHERE tenant_id = $1 AND workspace_id = $2 AND challenge_id = $3`,
        [context.tenantId, context.workspaceId, challengeId],
      );
      if (duplicate.rowCount)
        throw new ApiProblem(409, "CONFLICT", "The opportunity is already saved");
      const id = parseSavedOpportunityId(this.ids.next("sop"));
      const occurredAt = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO saved_opportunity (
           id, tenant_id, workspace_id, workspace_kind, challenge_id,
           challenge_version_id, created_by_user_id, saved_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          context.tenantId,
          context.workspaceId,
          context.role === "individual" ? "individual" : "team",
          challengeId,
          current.challenge_version_id,
          context.actorUserId,
          occurredAt,
        ],
      );
      return this.record(
        client,
        id,
        "saved_opportunity",
        1,
        context,
        "opportunity.saved",
        requestHash,
        ["unsave"],
        201,
        { challenge_id: challengeId, challenge_version_id: current.challenge_version_id },
      );
    });
  }

  async unsave(
    challengeId: string,
    body: UnsaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<SavedOutcome> {
    const requestHash = commandFingerprint({
      action: "opportunity.unsave",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      body,
    });
    if (!(await this.permitted(context, "view-workspace"))) throw forbidden();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.savedOutcome(replay, true);
      const current = await client.query<SavedRow>(
        `SELECT id, challenge_id, challenge_version_id, saved_at FROM saved_opportunity
         WHERE tenant_id = $1 AND workspace_id = $2 AND challenge_id = $3 FOR UPDATE`,
        [context.tenantId, context.workspaceId, challengeId],
      );
      const row = current.rows[0];
      if (!row) throw notFound();
      if (body.expected_version !== 1) throw staleVersion(1);
      await client.query("DELETE FROM saved_opportunity WHERE id = $1", [row.id]);
      return this.record(
        client,
        parseSavedOpportunityId(row.id),
        "saved_opportunity",
        2,
        context,
        "opportunity.unsaved",
        requestHash,
        ["saved"],
        200,
        { challenge_id: row.challenge_id, challenge_version_id: row.challenge_version_id },
      );
    });
  }

  private async findReceived(
    client: PoolClient,
    scope: OpportunityScope,
    id: string,
    lock: boolean,
  ) {
    if (lock) {
      const locked = await client.query(
        `SELECT 1 FROM direct_offer WHERE id = $1 AND recipient_tenant_id = $2
           AND recipient_workspace_id = $3 FOR UPDATE`,
        [id, scope.tenantId, scope.workspaceId],
      );
      if (locked.rowCount !== 1) return null;
    }
    const result = await client.query<OfferRow>(
      `${offerSelect}
       JOIN access_grant AS grant_row ON grant_row.direct_offer_id = offer.id
        AND grant_row.resource_type = 'direct_offer' AND grant_row.capability = 'collaborate'
       WHERE offer.id = $1 AND offer.recipient_tenant_id = $2
         AND offer.recipient_workspace_id = $3 AND grant_row.grantee_tenant_id = $2
         AND grant_row.grantee_workspace_id = $3 AND grant_row.state = 'active'
         AND grant_row.valid_from <= $4 AND grant_row.expires_at > $4`,
      [id, scope.tenantId, scope.workspaceId, this.clock.now().toISOString()],
    );
    return result.rows[0] ? offerResource(result.rows[0]) : null;
  }

  private async findSent(client: PoolClient, scope: WorkspaceScope, id: string, lock: boolean) {
    if (lock) {
      const locked = await client.query(
        `SELECT 1 FROM direct_offer WHERE id = $1 AND sender_tenant_id = $2
           AND sender_organization_workspace_id = $3 FOR UPDATE`,
        [id, scope.tenantId, scope.workspaceId],
      );
      if (locked.rowCount !== 1) return null;
    }
    const result = await client.query<OfferRow>(
      `${offerSelect} WHERE offer.id = $1 AND offer.sender_tenant_id = $2
         AND offer.sender_organization_workspace_id = $3`,
      [id, scope.tenantId, scope.workspaceId],
    );
    return result.rows[0] ? senderProjection(offerResource(result.rows[0])) : null;
  }

  async listReceived(scope: OpportunityScope): Promise<DirectOfferListResource> {
    if (!(await this.permitted(scope, "view-direct-offer"))) throw forbidden();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.expireDue(client);
      const result = await client.query<OfferRow>(
        `${offerSelect}
         JOIN access_grant AS grant_row ON grant_row.direct_offer_id = offer.id
          AND grant_row.resource_type = 'direct_offer' AND grant_row.capability = 'collaborate'
         WHERE offer.recipient_tenant_id = $1 AND offer.recipient_workspace_id = $2
           AND grant_row.grantee_tenant_id = $1 AND grant_row.grantee_workspace_id = $2
           AND grant_row.state = 'active' AND grant_row.valid_from <= $3
           AND grant_row.expires_at > $3 ORDER BY offer.updated_at DESC, offer.id`,
        [scope.tenantId, scope.workspaceId, this.clock.now().toISOString()],
      );
      return { items: result.rows.map(offerResource) };
    });
  }

  async getReceived(scope: OpportunityScope, id: string): Promise<DirectOfferResource | null> {
    if (!(await this.permitted(scope, "view-direct-offer"))) return null;
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.expireDue(client);
      return this.findReceived(client, scope, id, false);
    });
  }

  async listSent(scope: WorkspaceScope): Promise<DirectOfferListResource> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.expireDue(client);
      const result = await client.query<OfferRow>(
        `${offerSelect} WHERE offer.sender_tenant_id = $1
         AND offer.sender_organization_workspace_id = $2
         ORDER BY offer.updated_at DESC, offer.id`,
        [scope.tenantId, scope.workspaceId],
      );
      return { items: result.rows.map((row) => senderProjection(offerResource(row))) };
    });
  }

  async getSent(scope: WorkspaceScope, id: string): Promise<DirectOfferResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.expireDue(client);
      return this.findSent(client, scope, id, false);
    });
  }

  async send(body: CreateDirectOfferBody, context: WorkspaceCommandContext): Promise<OfferOutcome> {
    const requestHash = commandFingerprint({
      action: "direct-offer.send",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.offerOutcome(replay, true);
      if (body.expected_version !== 0)
        throw new ApiProblem(422, "VALIDATION", "A new direct offer must expect version zero");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `direct-offer:${body.challenge_id}:${body.recipient_workspace_id}`,
      ]);
      const gate = await client.query<OfferGateRow>(
        `SELECT challenge.tenant_id AS sender_tenant_id,
                challenge.workspace_id AS sender_workspace_id,
                challenge.published_version_id AS challenge_version_id,
                challenge.proposal_deadline_at,
                profile.tenant_id AS recipient_tenant_id,
                profile.workspace_id AS recipient_workspace_id,
                profile.workspace_kind AS recipient_workspace_kind
         FROM challenge
         JOIN solver_workspace_profile AS profile ON profile.workspace_id = $3
         WHERE challenge.id = $1 AND challenge.tenant_id = $4
           AND challenge.workspace_id = $5 AND challenge.stage = 'published'
           AND challenge.publication_state = 'open'
           AND challenge.published_version_id = $2
           AND challenge.proposal_deadline_at > $6
           AND profile.tenant_id <> challenge.tenant_id
         FOR SHARE OF challenge, profile`,
        [
          body.challenge_id,
          body.challenge_version_id,
          body.recipient_workspace_id,
          context.tenantId,
          context.workspaceId,
          this.clock.now().toISOString(),
        ],
      );
      const facts = gate.rows[0];
      if (!facts) throw notFound();
      const deadline = Date.parse(body.response_deadline);
      if (
        !Number.isFinite(deadline) ||
        deadline <= this.clock.now().getTime() ||
        deadline > facts.proposal_deadline_at.getTime()
      ) {
        throw new ApiProblem(
          422,
          "VALIDATION",
          "Response deadline must be in the future and within the call deadline",
        );
      }
      const duplicate = await client.query(
        `SELECT 1 FROM direct_offer WHERE challenge_id = $1 AND recipient_workspace_id = $2
           AND state NOT IN ('declined','expired','cancelled')`,
        [body.challenge_id, body.recipient_workspace_id],
      );
      if (duplicate.rowCount)
        throw new ApiProblem(409, "CONFLICT", "An active offer already exists");
      const id = parseDirectOfferId(this.ids.next("dof"));
      const occurredAt = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO direct_offer (
           id, sender_tenant_id, sender_organization_workspace_id,
           recipient_tenant_id, recipient_workspace_id, recipient_workspace_kind,
           challenge_id, challenge_version_id, title, summary, invitation_reasons,
           requested_documents, response_deadline, state, lock_version,
           created_by_user_id, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12::text[],$13,
           'received',1,$14,$15,$15)`,
        [
          id,
          facts.sender_tenant_id,
          facts.sender_workspace_id,
          facts.recipient_tenant_id,
          facts.recipient_workspace_id,
          facts.recipient_workspace_kind,
          body.challenge_id,
          body.challenge_version_id,
          body.title.trim(),
          body.summary.trim(),
          body.invitation_reasons,
          body.requested_documents,
          body.response_deadline,
          context.actorUserId,
          occurredAt,
        ],
      );
      for (const grant of [
        { resourceType: "direct_offer", resourceId: id, capability: "collaborate" },
        { resourceType: "challenge", resourceId: body.challenge_id, capability: "read" },
      ] as const) {
        await client.query(
          `INSERT INTO access_grant (
             id, grantor_tenant_id, grantor_workspace_id,
             grantee_tenant_id, grantee_workspace_id, resource_type, resource_id,
             capability, state, valid_from, expires_at, created_by_user_id,
             created_at, direct_offer_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$9,$12)`,
          [
            parseAccessGrantId(this.ids.next("agr")),
            facts.sender_tenant_id,
            facts.sender_workspace_id,
            facts.recipient_tenant_id,
            facts.recipient_workspace_id,
            grant.resourceType,
            grant.resourceId,
            grant.capability,
            occurredAt,
            facts.proposal_deadline_at.toISOString(),
            context.actorUserId,
            id,
          ],
        );
      }
      return this.record(
        client,
        id,
        "direct_offer",
        1,
        context,
        "direct-offer.sent",
        requestHash,
        ["await_response", "cancel"],
        201,
        {
          challenge_id: body.challenge_id,
          challenge_version_id: body.challenge_version_id,
          recipient_workspace_id: body.recipient_workspace_id,
        },
      );
    });
  }

  private async recipientCommand(
    id: string,
    body: Readonly<{ expected_version: number }>,
    context: OpportunityCommandContext,
    options: {
      readonly command: string;
      readonly permission: TeamAction;
      readonly action: OpportunityOutboxEventType;
      readonly from: readonly DirectOfferResource["state"][];
      readonly to: DirectOfferResource["state"];
      readonly nextActions: readonly DirectOfferNextAction[];
      readonly mutate?: (
        client: PoolClient,
        current: DirectOfferResource,
        occurredAt: string,
      ) => Promise<void>;
    },
  ): Promise<OfferOutcome> {
    const requestHash = commandFingerprint({
      action: options.command,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    if (!(await this.permitted(context, options.permission))) throw notFound();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.offerOutcome(replay, true);
      const current = await this.findReceived(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (!options.from.includes(current.state)) {
        throw new ApiProblem(409, "INVALID_STATE", "Direct offer cannot perform this transition", {
          currentState: current.state,
          allowedTransitions: [options.to],
        });
      }
      if (
        isDirectOfferOpenForResponse(current.state) &&
        Date.parse(current.response_deadline) <= this.clock.now().getTime()
      ) {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "The direct offer response deadline has passed",
          { currentState: "expired" },
        );
      }
      const occurredAt = this.clock.now().toISOString();
      await client.query(
        `UPDATE direct_offer SET state = $2, lock_version = lock_version + 1,
           viewed_at = CASE WHEN $2 = 'viewed' THEN $3 ELSE viewed_at END,
           decline_reason = CASE WHEN $2 = 'declined' THEN $4 ELSE decline_reason END,
           declined_at = CASE WHEN $2 = 'declined' THEN $3 ELSE declined_at END,
           updated_at = $3 WHERE id = $1 AND lock_version = $5`,
        [
          current.id,
          options.to,
          occurredAt,
          options.to === "declined" ? (body as DeclineDirectOfferBody).reason.trim() : null,
          current.version,
        ],
      );
      await options.mutate?.(client, current, occurredAt);
      if (options.to === "declined") {
        await client.query(
          `UPDATE access_grant SET state = 'revoked', revoked_at = $2,
             revoked_by_user_id = $3, revocation_reason = $4
           WHERE direct_offer_id = $1 AND state = 'active'`,
          [
            current.id,
            occurredAt,
            context.actorUserId,
            (body as DeclineDirectOfferBody).reason.trim(),
          ],
        );
      }
      const updated = await this.findSent(
        client,
        {
          ...context,
          tenantId: (
            await client.query<{ sender_tenant_id: string }>(
              "SELECT sender_tenant_id FROM direct_offer WHERE id = $1",
              [current.id],
            )
          ).rows[0]!.sender_tenant_id as WorkspaceScope["tenantId"],
          workspaceId: current.sender_organization_workspace_id,
        },
        current.id,
        false,
      );
      if (!updated) throw new Error("Updated direct offer could not be read");
      return this.record(
        client,
        updated.id,
        "direct_offer",
        updated.version,
        context,
        options.action,
        requestHash,
        options.nextActions,
      );
    });
  }

  async view(id: string, body: ViewDirectOfferBody, context: OpportunityCommandContext) {
    return this.recipientCommand(id, body, context, {
      command: "direct-offer.view",
      permission: "view-direct-offer",
      action: "direct-offer.viewed",
      from: ["received"],
      to: "viewed",
      nextActions: ["start_response", "decline"],
    });
  }

  async startResponse(
    id: string,
    body: StartOfferResponseBody,
    context: OpportunityCommandContext,
  ) {
    return this.recipientCommand(id, body, context, {
      command: "direct-offer.start-response",
      permission: "edit-offer-response",
      action: "direct-offer.response.draft.created",
      from: ["viewed"],
      to: "response_draft",
      nextActions: ["edit_response", "submit_response", "decline"],
      mutate: async (client, current, occurredAt) => {
        await client.query(
          `INSERT INTO offer_response (
             id, direct_offer_id, owner_tenant_id, owner_workspace_id, state,
             lock_version, content, created_by_user_id, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'draft',1,$5::jsonb,$6,$7,$7)`,
          [
            parseOfferResponseId(this.ids.next("ofr")),
            current.id,
            context.tenantId,
            context.workspaceId,
            JSON.stringify(emptyContent()),
            context.actorUserId,
            occurredAt,
          ],
        );
      },
    });
  }

  async patchResponse(
    id: string,
    body: PatchOfferResponseBody,
    context: OpportunityCommandContext,
  ) {
    return this.recipientCommand(id, body, context, {
      command: "direct-offer.patch-response",
      permission: "edit-offer-response",
      action: "direct-offer.response.draft.updated",
      from: ["response_draft"],
      to: "response_draft",
      nextActions: ["edit_response", "submit_response", "decline"],
      mutate: async (client, current, occurredAt) => {
        if (!current.response || current.response.state !== "draft") throw notFound();
        const content = { ...current.response.content, ...body.patch };
        const result = await client.query(
          `UPDATE offer_response SET content = $2::jsonb, lock_version = lock_version + 1,
             updated_at = $3 WHERE direct_offer_id = $1 AND state = 'draft'`,
          [current.id, JSON.stringify(content), occurredAt],
        );
        if (result.rowCount !== 1) throw notFound();
      },
    });
  }

  async submitResponse(
    id: string,
    body: SubmitOfferResponseBody,
    context: OpportunityCommandContext,
  ) {
    return this.recipientCommand(id, body, context, {
      command: "direct-offer.submit-response",
      permission: "submit-offer-response",
      action: "direct-offer.response.submitted",
      from: ["response_draft"],
      to: "response_submitted",
      nextActions: ["await_organization"],
      mutate: async (client, current, occurredAt) => {
        if (!current.response || current.response.state !== "draft") throw notFound();
        const evaluated = readiness(current.response.content, current.response.version);
        if (!evaluated.ready)
          throw new ApiProblem(422, "VALIDATION", "Offer response is not ready for submission", {
            fields: evaluated.issues,
            recovery: "complete_offer_response",
          });
        const result = await client.query(
          `UPDATE offer_response SET state = 'submitted', lock_version = lock_version + 1,
             submitted_at = $2, updated_at = $2
           WHERE direct_offer_id = $1 AND state = 'draft'`,
          [current.id, occurredAt],
        );
        if (result.rowCount !== 1) throw notFound();
      },
    });
  }

  async decline(id: string, body: DeclineDirectOfferBody, context: OpportunityCommandContext) {
    return this.recipientCommand(id, body, context, {
      command: "direct-offer.decline",
      permission: "decline-direct-offer",
      action: "direct-offer.declined",
      from: ["received", "viewed", "response_draft"],
      to: "declined",
      nextActions: ["closed"],
    });
  }

  private async senderCommand(
    id: string,
    body: Readonly<{ expected_version: number }>,
    context: WorkspaceCommandContext,
    options: {
      readonly command: string;
      readonly action: OpportunityOutboxEventType;
      readonly from: readonly DirectOfferResource["state"][];
      readonly to: DirectOfferResource["state"];
      readonly nextActions: readonly DirectOfferNextAction[];
    },
  ): Promise<OfferOutcome> {
    const requestHash = commandFingerprint({
      action: options.command,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.offerOutcome(replay, true);
      const current = await this.findSent(client, context, id, true);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      if (!options.from.includes(current.state))
        throw new ApiProblem(409, "INVALID_STATE", "Direct offer cannot perform this transition", {
          currentState: current.state,
          allowedTransitions: [options.to],
        });
      if (
        isDirectOfferOpenForResponse(current.state) &&
        Date.parse(current.response_deadline) <= this.clock.now().getTime()
      ) {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "The direct offer response deadline has passed",
          { currentState: "expired" },
        );
      }
      const occurredAt = this.clock.now().toISOString();
      const reason =
        options.to === "cancelled" ? (body as CancelDirectOfferBody).reason.trim() : null;
      await client.query(
        `UPDATE direct_offer SET state = $2, lock_version = lock_version + 1,
           cancellation_reason = CASE WHEN $2 = 'cancelled' THEN $3 ELSE cancellation_reason END,
           cancelled_at = CASE WHEN $2 = 'cancelled' THEN $4 ELSE cancelled_at END,
           updated_at = $4 WHERE id = $1 AND lock_version = $5`,
        [current.id, options.to, reason, occurredAt, current.version],
      );
      if (options.to === "cancelled") {
        await client.query(
          `UPDATE access_grant SET state = 'revoked', revoked_at = $2,
             revoked_by_user_id = $3, revocation_reason = $4
           WHERE direct_offer_id = $1 AND state = 'active'`,
          [current.id, occurredAt, context.actorUserId, reason],
        );
      }
      return this.record(
        client,
        current.id,
        "direct_offer",
        current.version + 1,
        context,
        options.action,
        requestHash,
        options.nextActions,
      );
    });
  }

  async cancel(id: string, body: CancelDirectOfferBody, context: WorkspaceCommandContext) {
    return this.senderCommand(id, body, context, {
      command: "direct-offer.cancel",
      action: "direct-offer.cancelled",
      from: ["received", "viewed", "response_draft", "response_submitted", "negotiating"],
      to: "cancelled",
      nextActions: ["closed"],
    });
  }

  async startNegotiation(
    id: string,
    body: StartDirectOfferNegotiationBody,
    context: WorkspaceCommandContext,
  ) {
    return this.senderCommand(id, body, context, {
      command: "direct-offer.start-negotiation",
      action: "direct-offer.negotiation.started",
      from: ["response_submitted"],
      to: "negotiating",
      nextActions: ["continue_negotiation", "cancel"],
    });
  }
}
