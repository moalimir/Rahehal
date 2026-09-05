import type {
  CancelDirectOfferBody,
  CreateDirectOfferBody,
  DeclineDirectOfferBody,
  DirectOfferListResource,
  DirectOfferNextAction,
  DirectOfferResource,
  MutationReceipt,
  OutboxEvent,
  PatchOfferResponseBody,
  SaveOpportunityBody,
  SavedOpportunityListResource,
  SavedOpportunityNextAction,
  SavedOpportunityResource,
  StartDirectOfferNegotiationBody,
  StartOfferResponseBody,
  SubmitOfferResponseBody,
  UnsaveOpportunityBody,
  ViewDirectOfferBody,
} from "@rahhal/contracts";
import {
  decideTeamPermission,
  evaluateOfferResponseReadiness,
  isDirectOfferOpenForResponse,
  isTeamRole,
  parseAccessGrantId,
  parseAuditEventId,
  parseDirectOfferId,
  parseOfferResponseId,
  parsePrefixedId,
  parseReceiptId,
  parseSavedOpportunityId,
  type AccessGrantId,
  type AuditEventId,
  type CorrelationId,
  type DirectOfferId,
  type OpportunityOutboxEventType,
  type SavedOpportunityId,
  type TeamAction,
  type TenantId,
  type UserId,
  type WorkspaceId,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import type { InMemoryChallengeRepository } from "./in-memory-challenges.js";
import type { InMemorySolverWorkspaceAdapter } from "./in-memory-solver-workspaces.js";
import { commandFingerprint } from "./primitives.js";
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
} from "./ports.js";

type SavedOutcome = MutationOutcome<SavedOpportunityId, SavedOpportunityNextAction>;
type OfferOutcome = MutationOutcome<DirectOfferId, DirectOfferNextAction>;
type AnyOutcome = MutationOutcome<string, string>;

type StoredGrant = {
  readonly id: AccessGrantId;
  readonly directOfferId: DirectOfferId;
  readonly resourceType: "direct_offer" | "challenge";
  readonly resourceId: string;
  readonly granteeTenantId: TenantId;
  readonly granteeWorkspaceId: WorkspaceId;
  readonly expiresAt: string;
  state: "active" | "revoked" | "expired";
};

type StoredOffer = {
  resource: DirectOfferResource;
  readonly senderTenantId: TenantId;
  readonly recipientTenantId: TenantId;
  readonly relationshipExpiresAt: string;
};

type OpportunityAuditRecord = {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId | null;
  readonly entityType: "saved_opportunity" | "direct_offer";
  readonly entityId: SavedOpportunityId | DirectOfferId;
  readonly entityVersion: number;
  readonly action: OpportunityOutboxEventType;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
};

type RepositoryState = {
  saved: Map<string, SavedOpportunityResource>;
  offers: Map<DirectOfferId, StoredOffer>;
  grants: Map<AccessGrantId, StoredGrant>;
  idempotency: Map<string, { readonly fingerprint: string; readonly outcome: AnyOutcome }>;
  auditEvents: OpportunityAuditRecord[];
  outboxEvents: OutboxEvent[];
};

const scopedKey = (...parts: readonly string[]) => parts.join("\0");

function cloneState(state: RepositoryState): RepositoryState {
  return {
    saved: new Map([...state.saved].map(([key, value]) => [key, structuredClone(value)])),
    offers: new Map([...state.offers].map(([key, value]) => [key, structuredClone(value)])),
    grants: new Map([...state.grants].map(([key, value]) => [key, structuredClone(value)])),
    idempotency: new Map(
      [...state.idempotency].map(([key, value]) => [key, structuredClone(value)]),
    ),
    auditEvents: structuredClone(state.auditEvents),
    outboxEvents: structuredClone(state.outboxEvents),
  };
}

function emptyOfferResponseContent(): NonNullable<DirectOfferResource["response"]>["content"] {
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

function responseReadiness(
  content: NonNullable<DirectOfferResource["response"]>["content"],
  version: number,
): NonNullable<DirectOfferResource["response"]>["readiness"] {
  const result = evaluateOfferResponseReadiness({
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
  });
  return { ...result, evaluated_version: version };
}

function senderProjection(resource: DirectOfferResource): DirectOfferResource {
  return resource.response?.state === "draft" ? { ...resource, response: null } : resource;
}

export class InMemoryOpportunityAdapter implements OpportunityPort {
  private state: RepositoryState = {
    saved: new Map(),
    offers: new Map(),
    grants: new Map(),
    idempotency: new Map(),
    auditEvents: [],
    outboxEvents: [],
  };

  constructor(
    private readonly challenges: InMemoryChallengeRepository,
    private readonly solverWorkspaces: InMemorySolverWorkspaceAdapter,
    private readonly teams: TeamPort,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
    private readonly beforeCommit?: () => void,
  ) {}

  private transact<Result>(operation: (state: RepositoryState) => Result): Result {
    const draft = cloneState(this.state);
    const result = operation(draft);
    this.beforeCommit?.();
    this.state = draft;
    return result;
  }

  private commandKey(context: WorkspaceCommandContext, command: string): string {
    return scopedKey(context.tenantId, command, context.idempotencyKey);
  }

  private replay<Outcome extends AnyOutcome>(
    state: RepositoryState,
    key: string,
    fingerprint: string,
  ): Outcome | null {
    const cached = state.idempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      ...structuredClone(cached.outcome),
      receipt: { ...cached.outcome.receipt, idempotent: true },
    } as Outcome;
  }

  private record<Target extends SavedOpportunityId | DirectOfferId, Next extends string>(
    state: RepositoryState,
    target: Target,
    entityType: OpportunityAuditRecord["entityType"],
    version: number,
    context: WorkspaceCommandContext,
    action: OpportunityOutboxEventType,
    nextActions: readonly Next[],
    key: string,
    fingerprint: string,
    metadata: Readonly<Record<string, string | number>> = {},
  ): MutationOutcome<Target, Next> {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<Target, Next> = {
      entity_id: target,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp: occurredAt,
      idempotent: false,
      next_actions: nextActions,
    };
    const outcome = { receipt, entityVersion: version };
    state.auditEvents.push({
      id: auditId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      entityType,
      entityId: target,
      entityVersion: version,
      action,
      correlationId: context.correlationId,
      occurredAt,
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: action,
      schema_version: 1,
      aggregate_type: entityType,
      aggregate_id: target,
      tenant_id: context.tenantId,
      correlation_id: context.correlationId,
      occurred_at: occurredAt,
      payload: { entity_version: version, ...metadata },
    });
    state.idempotency.set(key, {
      fingerprint,
      outcome: structuredClone(outcome) as AnyOutcome,
    });
    return outcome;
  }

  private recordExpiration(state: RepositoryState, stored: StoredOffer, occurredAt: string): void {
    const offer = stored.resource;
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const correlationId = parsePrefixedId(this.ids.next("cor"), "cor");
    state.auditEvents.push({
      id: auditId,
      tenantId: stored.senderTenantId,
      workspaceId: offer.sender_organization_workspace_id,
      actorUserId: null,
      entityType: "direct_offer",
      entityId: offer.id,
      entityVersion: offer.version,
      action: "direct-offer.expired",
      correlationId,
      occurredAt,
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: "direct-offer.expired",
      schema_version: 1,
      aggregate_type: "direct_offer",
      aggregate_id: offer.id,
      tenant_id: stored.senderTenantId,
      correlation_id: correlationId,
      occurred_at: occurredAt,
      payload: { entity_version: offer.version },
    });
  }

  private expireDue(state: RepositoryState): void {
    const now = this.clock.now();
    const occurredAt = now.toISOString();
    for (const stored of state.offers.values()) {
      if (
        !isDirectOfferOpenForResponse(stored.resource.state) ||
        Date.parse(stored.resource.response_deadline) > now.getTime()
      ) {
        continue;
      }
      stored.resource = {
        ...stored.resource,
        state: "expired",
        version: stored.resource.version + 1,
        expired_at: occurredAt,
        updated_at: occurredAt,
      };
      for (const grant of state.grants.values()) {
        if (grant.directOfferId === stored.resource.id && grant.state === "active") {
          grant.state = "expired";
        }
      }
      this.recordExpiration(state, stored, occurredAt);
    }
  }

  private expireDueNow(): void {
    if (
      [...this.state.offers.values()].some(
        ({ resource }) =>
          isDirectOfferOpenForResponse(resource.state) &&
          Date.parse(resource.response_deadline) <= this.clock.now().getTime(),
      )
    ) {
      this.transact((state) => this.expireDue(state));
    }
  }

  private async permitted(scope: OpportunityScope, action: TeamAction): Promise<boolean> {
    if (scope.role === "individual") return true;
    if (!isTeamRole(scope.role)) return false;
    const team = await this.teams.get(scope);
    if (!team) return false;
    const membership = team.members.find(
      (candidate) =>
        candidate.id === scope.membershipId &&
        candidate.user_id === scope.actorUserId &&
        candidate.role === scope.role &&
        candidate.state === "active",
    );
    return Boolean(
      membership && decideTeamPermission(action, { role: scope.role, policy: team.policy }).allowed,
    );
  }

  private activeOfferGrant(state: RepositoryState, scope: OpportunityScope, id: string): boolean {
    const now = this.clock.now().getTime();
    return [...state.grants.values()].some(
      (grant) =>
        grant.directOfferId === id &&
        grant.resourceType === "direct_offer" &&
        grant.state === "active" &&
        grant.granteeTenantId === scope.tenantId &&
        grant.granteeWorkspaceId === scope.workspaceId &&
        Date.parse(grant.expiresAt) > now,
    );
  }

  hasActiveChallengeGrant(workspaceId: WorkspaceId, challengeId: string): boolean {
    this.expireDueNow();
    const now = this.clock.now().getTime();
    return [...this.state.grants.values()].some(
      (grant) =>
        grant.resourceType === "challenge" &&
        grant.resourceId === challengeId &&
        grant.granteeWorkspaceId === workspaceId &&
        grant.state === "active" &&
        Date.parse(grant.expiresAt) > now,
    );
  }

  async listSaved(scope: OpportunityScope): Promise<SavedOpportunityListResource> {
    if (!(await this.permitted(scope, "view-workspace"))) throw forbidden();
    return {
      items: [...this.state.saved.entries()]
        .filter(([key]) => key.startsWith(scopedKey(scope.tenantId, scope.workspaceId) + "\0"))
        .map(([, value]) => structuredClone(value))
        .sort((left, right) => right.saved_at.localeCompare(left.saved_at)),
    };
  }

  async save(
    challengeId: string,
    body: SaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<SavedOutcome> {
    const key = this.commandKey(context, "opportunity:save");
    const fingerprint = commandFingerprint({
      command: "opportunity:save",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      body,
    });
    if (!(await this.permitted(context, "view-workspace"))) throw forbidden();
    const replay = this.replay<SavedOutcome>(this.state, key, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== 0) {
      throw new ApiProblem(422, "VALIDATION", "A new saved opportunity must expect version zero");
    }
    const challenge = await this.challenges.get("registered", challengeId);
    if (
      !challenge ||
      challenge.state !== "open" ||
      Date.parse(challenge.proposal_deadline) <= this.clock.now().getTime()
    ) {
      throw notFound();
    }
    return this.transact((state) => {
      const replayInside = this.replay<SavedOutcome>(state, key, fingerprint);
      if (replayInside) return replayInside;
      const savedKey = scopedKey(context.tenantId, context.workspaceId, challengeId);
      if (state.saved.has(savedKey)) {
        throw new ApiProblem(409, "CONFLICT", "The opportunity is already saved");
      }
      const now = this.clock.now().toISOString();
      const resource: SavedOpportunityResource = {
        id: parseSavedOpportunityId(this.ids.next("sop")),
        challenge_id: challenge.challenge_id,
        challenge_version_id: challenge.challenge_version_id,
        version: 1,
        saved_at: now,
      };
      state.saved.set(savedKey, resource);
      return this.record(
        state,
        resource.id,
        "saved_opportunity",
        1,
        context,
        "opportunity.saved",
        ["unsave"],
        key,
        fingerprint,
        {
          challenge_id: resource.challenge_id,
          challenge_version_id: resource.challenge_version_id,
        },
      );
    });
  }

  async unsave(
    challengeId: string,
    body: UnsaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<SavedOutcome> {
    const key = this.commandKey(context, "opportunity:unsave");
    const fingerprint = commandFingerprint({
      command: "opportunity:unsave",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      body,
    });
    if (!(await this.permitted(context, "view-workspace"))) throw forbidden();
    const replay = this.replay<SavedOutcome>(this.state, key, fingerprint);
    if (replay) return replay;
    return this.transact((state) => {
      const replayInside = this.replay<SavedOutcome>(state, key, fingerprint);
      if (replayInside) return replayInside;
      const savedKey = scopedKey(context.tenantId, context.workspaceId, challengeId);
      const current = state.saved.get(savedKey);
      if (!current) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);
      state.saved.delete(savedKey);
      return this.record(
        state,
        current.id,
        "saved_opportunity",
        2,
        context,
        "opportunity.unsaved",
        ["saved"],
        key,
        fingerprint,
        { challenge_id: current.challenge_id, challenge_version_id: current.challenge_version_id },
      );
    });
  }

  async listReceived(scope: OpportunityScope): Promise<DirectOfferListResource> {
    if (!(await this.permitted(scope, "view-direct-offer"))) throw forbidden();
    this.expireDueNow();
    return {
      items: [...this.state.offers.values()]
        .filter(
          ({ resource }) =>
            resource.recipient_workspace_id === scope.workspaceId &&
            this.activeOfferGrant(this.state, scope, resource.id),
        )
        .map(({ resource }) => structuredClone(resource))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    };
  }

  async getReceived(scope: OpportunityScope, id: string): Promise<DirectOfferResource | null> {
    if (!(await this.permitted(scope, "view-direct-offer"))) return null;
    this.expireDueNow();
    const stored = [...this.state.offers.values()].find(
      ({ resource }) =>
        resource.id === id &&
        resource.recipient_workspace_id === scope.workspaceId &&
        this.activeOfferGrant(this.state, scope, id),
    );
    return stored ? structuredClone(stored.resource) : null;
  }

  async listSent(scope: WorkspaceScope): Promise<DirectOfferListResource> {
    this.expireDueNow();
    return {
      items: [...this.state.offers.values()]
        .filter(
          (stored) =>
            stored.senderTenantId === scope.tenantId &&
            stored.resource.sender_organization_workspace_id === scope.workspaceId,
        )
        .map(({ resource }) => structuredClone(senderProjection(resource)))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    };
  }

  async getSent(scope: WorkspaceScope, id: string): Promise<DirectOfferResource | null> {
    this.expireDueNow();
    const stored = this.state.offers.get(id as DirectOfferId);
    if (
      !stored ||
      stored.senderTenantId !== scope.tenantId ||
      stored.resource.sender_organization_workspace_id !== scope.workspaceId
    ) {
      return null;
    }
    return structuredClone(senderProjection(stored.resource));
  }

  async send(body: CreateDirectOfferBody, context: WorkspaceCommandContext): Promise<OfferOutcome> {
    const key = this.commandKey(context, "direct-offer:send");
    const fingerprint = commandFingerprint({
      command: "direct-offer:send",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    const replay = this.replay<OfferOutcome>(this.state, key, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== 0) {
      throw new ApiProblem(422, "VALIDATION", "A new direct offer must expect version zero");
    }
    const challenge = await this.challenges.getScoped(context, body.challenge_id);
    const target = this.solverWorkspaces.findOfferTarget(body.recipient_workspace_id);
    const deadline = Date.parse(body.response_deadline);
    if (
      !challenge ||
      challenge.stage !== "published" ||
      challenge.publication_state !== "open" ||
      challenge.published_version_id !== body.challenge_version_id ||
      !challenge.proposal_deadline_at ||
      !target ||
      target.tenantId === context.tenantId
    ) {
      throw notFound();
    }
    if (
      !Number.isFinite(deadline) ||
      deadline <= this.clock.now().getTime() ||
      deadline > Date.parse(challenge.proposal_deadline_at)
    ) {
      throw new ApiProblem(
        422,
        "VALIDATION",
        "Response deadline must be in the future and within the call deadline",
      );
    }
    const relationshipExpiresAt = challenge.proposal_deadline_at;
    return this.transact((state) => {
      const replayInside = this.replay<OfferOutcome>(state, key, fingerprint);
      if (replayInside) return replayInside;
      const duplicate = [...state.offers.values()].some(
        ({ resource }) =>
          resource.challenge_id === body.challenge_id &&
          resource.recipient_workspace_id === target.workspaceId &&
          !["declined", "expired", "cancelled"].includes(resource.state),
      );
      if (duplicate) throw new ApiProblem(409, "CONFLICT", "An active offer already exists");
      const now = this.clock.now().toISOString();
      const id = parseDirectOfferId(this.ids.next("dof"));
      const resource: DirectOfferResource = {
        id,
        challenge_id: body.challenge_id,
        challenge_version_id: body.challenge_version_id,
        sender_organization_workspace_id: context.workspaceId,
        recipient_workspace_id: target.workspaceId,
        recipient_workspace_kind: target.workspaceKind,
        title: body.title.trim(),
        summary: body.summary.trim(),
        invitation_reasons: [...body.invitation_reasons],
        requested_documents: [...body.requested_documents],
        response_deadline: body.response_deadline,
        state: "received",
        version: 1,
        response: null,
        viewed_at: null,
        decline_reason: null,
        declined_at: null,
        cancellation_reason: null,
        cancelled_at: null,
        expired_at: null,
        created_at: now,
        updated_at: now,
      };
      state.offers.set(id, {
        resource,
        senderTenantId: context.tenantId,
        recipientTenantId: target.tenantId,
        relationshipExpiresAt,
      });
      for (const grant of [
        { resourceType: "direct_offer" as const, resourceId: id },
        { resourceType: "challenge" as const, resourceId: body.challenge_id },
      ]) {
        const grantId = parseAccessGrantId(this.ids.next("agr"));
        state.grants.set(grantId, {
          id: grantId,
          directOfferId: id,
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          granteeTenantId: target.tenantId,
          granteeWorkspaceId: target.workspaceId,
          expiresAt: relationshipExpiresAt,
          state: "active",
        });
      }
      return this.record(
        state,
        id,
        "direct_offer",
        1,
        context,
        "direct-offer.sent",
        ["await_response", "cancel"],
        key,
        fingerprint,
        {
          challenge_id: body.challenge_id,
          challenge_version_id: body.challenge_version_id,
          recipient_workspace_id: target.workspaceId,
        },
      );
    });
  }

  private async recipientCommand(
    id: string,
    body: Readonly<{ expected_version: number }>,
    context: OpportunityCommandContext,
    command: string,
    permission: TeamAction,
    action: OpportunityOutboxEventType,
    fromStates: readonly DirectOfferResource["state"][],
    toState: DirectOfferResource["state"],
    nextActions: readonly DirectOfferNextAction[],
    transform?: (resource: DirectOfferResource, now: string) => DirectOfferResource,
  ): Promise<OfferOutcome> {
    const key = this.commandKey(context, command);
    const fingerprint = commandFingerprint({
      command,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    if (!(await this.permitted(context, permission))) throw notFound();
    const replay = this.replay<OfferOutcome>(this.state, key, fingerprint);
    if (replay) return replay;
    return this.transact((state) => {
      const replayInside = this.replay<OfferOutcome>(state, key, fingerprint);
      if (replayInside) return replayInside;
      const stored = state.offers.get(id as DirectOfferId);
      if (
        !stored ||
        stored.recipientTenantId !== context.tenantId ||
        stored.resource.recipient_workspace_id !== context.workspaceId ||
        !this.activeOfferGrant(state, context, id)
      ) {
        throw notFound();
      }
      if (body.expected_version !== stored.resource.version)
        throw staleVersion(stored.resource.version);
      if (!fromStates.includes(stored.resource.state)) {
        throw new ApiProblem(409, "INVALID_STATE", "Direct offer cannot perform this transition", {
          currentState: stored.resource.state,
          allowedTransitions: [toState],
        });
      }
      if (
        isDirectOfferOpenForResponse(stored.resource.state) &&
        Date.parse(stored.resource.response_deadline) <= this.clock.now().getTime()
      ) {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "The direct offer response deadline has passed",
          {
            currentState: "expired",
          },
        );
      }
      const now = this.clock.now().toISOString();
      let updated: DirectOfferResource = {
        ...stored.resource,
        state: toState,
        version: stored.resource.version + 1,
        updated_at: now,
      };
      if (transform) updated = transform(updated, now);
      stored.resource = updated;
      if (["declined", "cancelled", "expired"].includes(toState)) {
        for (const grant of state.grants.values()) {
          if (grant.directOfferId === stored.resource.id && grant.state === "active") {
            grant.state = toState === "expired" ? "expired" : "revoked";
          }
        }
      }
      return this.record(
        state,
        updated.id,
        "direct_offer",
        updated.version,
        context,
        action,
        nextActions,
        key,
        fingerprint,
      );
    });
  }

  async view(
    id: string,
    body: ViewDirectOfferBody,
    context: OpportunityCommandContext,
  ): Promise<OfferOutcome> {
    return this.recipientCommand(
      id,
      body,
      context,
      "direct-offer:view",
      "view-direct-offer",
      "direct-offer.viewed",
      ["received"],
      "viewed",
      ["start_response", "decline"],
      (resource, now) => ({ ...resource, viewed_at: now }),
    );
  }

  async startResponse(
    id: string,
    body: StartOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<OfferOutcome> {
    return this.recipientCommand(
      id,
      body,
      context,
      "direct-offer:start-response",
      "edit-offer-response",
      "direct-offer.response.draft.created",
      ["viewed"],
      "response_draft",
      ["edit_response", "submit_response", "decline"],
      (resource, now) => {
        const content = emptyOfferResponseContent();
        return {
          ...resource,
          response: {
            id: parseOfferResponseId(this.ids.next("ofr")),
            state: "draft",
            version: 1,
            content,
            readiness: responseReadiness(content, 1),
            submitted_at: null,
            created_at: now,
            updated_at: now,
          },
        };
      },
    );
  }

  async patchResponse(
    id: string,
    body: PatchOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<OfferOutcome> {
    return this.recipientCommand(
      id,
      body,
      context,
      "direct-offer:patch-response",
      "edit-offer-response",
      "direct-offer.response.draft.updated",
      ["response_draft"],
      "response_draft",
      ["edit_response", "submit_response", "decline"],
      (resource, now) => {
        if (!resource.response || resource.response.state !== "draft") throw notFound();
        const content = { ...resource.response.content, ...body.patch };
        const responseVersion = resource.response.version + 1;
        return {
          ...resource,
          response: {
            ...resource.response,
            version: responseVersion,
            content,
            readiness: responseReadiness(content, responseVersion),
            updated_at: now,
          },
        };
      },
    );
  }

  async submitResponse(
    id: string,
    body: SubmitOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<OfferOutcome> {
    return this.recipientCommand(
      id,
      body,
      context,
      "direct-offer:submit-response",
      "submit-offer-response",
      "direct-offer.response.submitted",
      ["response_draft"],
      "response_submitted",
      ["await_organization"],
      (resource, now) => {
        if (!resource.response || resource.response.state !== "draft") throw notFound();
        const responseVersion = resource.response.version + 1;
        const readiness = responseReadiness(resource.response.content, responseVersion);
        if (!readiness.ready) {
          throw new ApiProblem(422, "VALIDATION", "Offer response is not ready for submission", {
            fields: readiness.issues,
            recovery: "complete_offer_response",
          });
        }
        return {
          ...resource,
          response: {
            ...resource.response,
            state: "submitted",
            version: responseVersion,
            readiness,
            submitted_at: now,
            updated_at: now,
          },
        };
      },
    );
  }

  async decline(
    id: string,
    body: DeclineDirectOfferBody,
    context: OpportunityCommandContext,
  ): Promise<OfferOutcome> {
    return this.recipientCommand(
      id,
      body,
      context,
      "direct-offer:decline",
      "decline-direct-offer",
      "direct-offer.declined",
      ["received", "viewed", "response_draft"],
      "declined",
      ["closed"],
      (resource, now) => ({
        ...resource,
        decline_reason: body.reason.trim(),
        declined_at: now,
      }),
    );
  }

  private async senderCommand(
    id: string,
    body: Readonly<{ expected_version: number }>,
    context: WorkspaceCommandContext,
    command: string,
    action: OpportunityOutboxEventType,
    fromStates: readonly DirectOfferResource["state"][],
    toState: DirectOfferResource["state"],
    nextActions: readonly DirectOfferNextAction[],
    transform?: (resource: DirectOfferResource, now: string) => DirectOfferResource,
  ): Promise<OfferOutcome> {
    const key = this.commandKey(context, command);
    const fingerprint = commandFingerprint({
      command,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    const replay = this.replay<OfferOutcome>(this.state, key, fingerprint);
    if (replay) return replay;
    return this.transact((state) => {
      const replayInside = this.replay<OfferOutcome>(state, key, fingerprint);
      if (replayInside) return replayInside;
      const stored = state.offers.get(id as DirectOfferId);
      if (
        !stored ||
        stored.senderTenantId !== context.tenantId ||
        stored.resource.sender_organization_workspace_id !== context.workspaceId
      ) {
        throw notFound();
      }
      if (body.expected_version !== stored.resource.version)
        throw staleVersion(stored.resource.version);
      if (!fromStates.includes(stored.resource.state)) {
        throw new ApiProblem(409, "INVALID_STATE", "Direct offer cannot perform this transition", {
          currentState: stored.resource.state,
          allowedTransitions: [toState],
        });
      }
      const now = this.clock.now().toISOString();
      let updated: DirectOfferResource = {
        ...stored.resource,
        state: toState,
        version: stored.resource.version + 1,
        updated_at: now,
      };
      if (transform) updated = transform(updated, now);
      stored.resource = updated;
      if (toState === "cancelled") {
        for (const grant of state.grants.values()) {
          if (grant.directOfferId === updated.id && grant.state === "active")
            grant.state = "revoked";
        }
      }
      return this.record(
        state,
        updated.id,
        "direct_offer",
        updated.version,
        context,
        action,
        nextActions,
        key,
        fingerprint,
      );
    });
  }

  async cancel(
    id: string,
    body: CancelDirectOfferBody,
    context: WorkspaceCommandContext,
  ): Promise<OfferOutcome> {
    return this.senderCommand(
      id,
      body,
      context,
      "direct-offer:cancel",
      "direct-offer.cancelled",
      ["received", "viewed", "response_draft", "response_submitted", "negotiating"],
      "cancelled",
      ["closed"],
      (resource, now) => ({
        ...resource,
        cancellation_reason: body.reason.trim(),
        cancelled_at: now,
      }),
    );
  }

  async startNegotiation(
    id: string,
    body: StartDirectOfferNegotiationBody,
    context: WorkspaceCommandContext,
  ): Promise<OfferOutcome> {
    return this.senderCommand(
      id,
      body,
      context,
      "direct-offer:start-negotiation",
      "direct-offer.negotiation.started",
      ["response_submitted"],
      "negotiating",
      ["continue_negotiation", "cancel"],
    );
  }

  snapshot() {
    return structuredClone({
      saved: [...this.state.saved.values()],
      offers: [...this.state.offers.values()].map(({ resource }) => resource),
      grants: [...this.state.grants.values()],
      auditEvents: this.state.auditEvents,
      outboxEvents: this.state.outboxEvents,
      idempotencyEntryCount: this.state.idempotency.size,
    });
  }
}
