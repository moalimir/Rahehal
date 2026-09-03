import type {
  CreateProposalBody,
  MutationReceipt,
  OutboxEvent,
  PatchProposalBody,
  ProposalNextAction,
  ProposalResource,
} from "@rahhal/contracts";
import {
  decideTeamPermission,
  isAggregateVersion,
  isTeamRole,
  parseAuditEventId,
  parseProposalId,
  parseProposalVersionId,
  parsePrefixedId,
  parseReceiptId,
  type AuditEventId,
  type CorrelationId,
  type ProposalId,
  type TenantId,
  type UserId,
  type WorkspaceId,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import {
  changedProposalFields,
  emptyProposalContent,
  mergeProposalContent,
  proposalContentHash,
  proposalReadiness,
} from "./proposal-draft.js";
import { commandFingerprint } from "./primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  ProposalCommandContext,
  ProposalPort,
  ProposalScope,
  PublicChallengePort,
  TeamPort,
} from "./ports.js";

type ProposalMutationOutcome = MutationOutcome<ProposalId, ProposalNextAction>;

type ProposalAuditRecord = {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly entityId: ProposalId;
  readonly entityVersion: number;
  readonly action: "proposal.draft.created" | "proposal.draft.updated";
  readonly outcome: "success";
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
};

type StoredProposal = {
  readonly current: ProposalResource;
  readonly versions: readonly ProposalResource[];
};

type RepositoryState = {
  readonly proposals: Map<string, StoredProposal>;
  readonly idempotency: Map<
    string,
    { readonly fingerprint: string; readonly outcome: ProposalMutationOutcome }
  >;
  readonly auditEvents: ProposalAuditRecord[];
  readonly outboxEvents: OutboxEvent[];
};

export type ProposalRepositorySnapshot = {
  readonly proposals: readonly ProposalResource[];
  readonly versions: readonly ProposalResource[];
  readonly auditEvents: readonly ProposalAuditRecord[];
  readonly outboxEvents: readonly OutboxEvent[];
  readonly idempotencyEntryCount: number;
};

function scopeKey(scope: Pick<ProposalScope, "tenantId" | "workspaceId">, id: string): string {
  return `${scope.tenantId}\u0000${scope.workspaceId}\u0000${id}`;
}

function commandKey(context: ProposalCommandContext, command: string): string {
  return `${context.tenantId}\u0000${command}\u0000${context.idempotencyKey}`;
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    proposals: new Map(
      [...state.proposals].map(([key, value]) => [key, structuredClone(value)] as const),
    ),
    idempotency: new Map(
      [...state.idempotency].map(([key, value]) => [key, structuredClone(value)] as const),
    ),
    auditEvents: structuredClone(state.auditEvents),
    outboxEvents: structuredClone(state.outboxEvents),
  };
}

export class InMemoryProposalAdapter implements ProposalPort {
  private state: RepositoryState = {
    proposals: new Map(),
    idempotency: new Map(),
    auditEvents: [],
    outboxEvents: [],
  };

  constructor(
    private readonly publicChallenges: PublicChallengePort,
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

  private replay(
    state: RepositoryState,
    key: string,
    fingerprint: string,
  ): ProposalMutationOutcome | null {
    const cached = state.idempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      entityVersion: cached.outcome.entityVersion,
      receipt: { ...cached.outcome.receipt, idempotent: true },
    };
  }

  private async permitted(
    scope: ProposalScope,
    action: "create-proposal" | "edit-proposal",
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

  private record(
    state: RepositoryState,
    resource: ProposalResource,
    context: ProposalCommandContext,
    action: ProposalAuditRecord["action"],
    key: string,
    fingerprint: string,
  ): ProposalMutationOutcome {
    const occurredAt = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<ProposalId, ProposalNextAction> = {
      entity_id: resource.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp: occurredAt,
      idempotent: false,
      next_actions: ["edit", "submit"],
    };
    const outcome = { receipt, entityVersion: resource.version } satisfies ProposalMutationOutcome;
    state.auditEvents.push({
      id: auditId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      entityId: resource.id,
      entityVersion: resource.version,
      action,
      outcome: "success",
      correlationId: context.correlationId,
      occurredAt,
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: action,
      schema_version: 1,
      aggregate_type: "proposal",
      aggregate_id: resource.id,
      tenant_id: context.tenantId,
      correlation_id: context.correlationId,
      occurred_at: occurredAt,
      payload: { entity_version: resource.version },
    });
    state.idempotency.set(key, { fingerprint, outcome: structuredClone(outcome) });
    return outcome;
  }

  async create(
    body: CreateProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const key = commandKey(context, "proposal:create");
    const fingerprint = commandFingerprint({
      command: "proposal:create",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    if (!(await this.permitted(context, "create-proposal"))) throw forbidden();
    const cached = this.replay(this.state, key, fingerprint);
    if (cached) return cached;
    if (body.expected_version !== 0 || !isAggregateVersion(body.expected_version)) {
      throw new ApiProblem(422, "VALIDATION", "A new proposal must expect version zero");
    }
    const challenge = await this.publicChallenges.get("registered", body.challenge_id);
    if (
      !challenge ||
      challenge.state !== "open" ||
      Date.parse(challenge.proposal_deadline) <= this.clock.now().getTime()
    ) {
      throw notFound();
    }

    return this.transact((state) => {
      const replay = this.replay(state, key, fingerprint);
      if (replay) return replay;
      const existing = [...state.proposals.values()].find(
        ({ current }) =>
          current.tenant_id === context.tenantId &&
          current.owner_workspace_id === context.workspaceId &&
          current.challenge_id === body.challenge_id &&
          current.state !== "withdrawn",
      );
      if (existing) {
        throw new ApiProblem(409, "CONFLICT", "An active proposal already exists for this call");
      }
      const id = parseProposalId(this.ids.next("prp"));
      const versionId = parseProposalVersionId(this.ids.next("prv"));
      const now = this.clock.now().toISOString();
      const empty = emptyProposalContent();
      const content = body.draft ? mergeProposalContent(empty, body.draft) : empty;
      const version = {
        id: versionId,
        version_number: 1,
        base_version_id: null,
        accepted_challenge_version_id: null,
        changed_fields: changedProposalFields(empty, content),
        content_hash: proposalContentHash(content),
        locked: false,
        actor_user_id: context.actorUserId,
        created_at: now,
      } as const;
      const resource: ProposalResource = {
        id,
        current_version_id: versionId,
        tenant_id: context.tenantId,
        owner_workspace_id: context.workspaceId,
        owner_workspace_kind: context.role === "individual" ? "individual" : "team",
        challenge_id: body.challenge_id,
        assigned_membership_ids: context.role === "individual" ? [] : [context.membershipId],
        state: "draft",
        tracking_code: null,
        version: 1,
        readiness: proposalReadiness(content, 1),
        content,
        versions: [version],
        submitted_at: null,
        created_by: context.actorUserId,
        created_at: now,
        updated_at: now,
      };
      state.proposals.set(scopeKey(context, id), { current: resource, versions: [resource] });
      return this.record(state, resource, context, "proposal.draft.created", key, fingerprint);
    });
  }

  async getScoped(scope: ProposalScope, id: string): Promise<ProposalResource | null> {
    const current = this.state.proposals.get(scopeKey(scope, id))?.current;
    if (!current) return null;
    if (!(await this.permitted(scope, "edit-proposal", current.assigned_membership_ids))) {
      return null;
    }
    return structuredClone(current);
  }

  async patch(
    id: string,
    body: PatchProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const key = commandKey(context, "proposal:patch");
    const fingerprint = commandFingerprint({
      command: "proposal:patch",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    const visible = await this.getScoped(context, id);
    if (!visible) throw notFound();
    const cached = this.replay(this.state, key, fingerprint);
    if (cached) return cached;

    return this.transact((state) => {
      const replay = this.replay(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context, id);
      const stored = state.proposals.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      if (stored.current.state !== "draft") {
        throw new ApiProblem(409, "INVALID_STATE", "Proposal content is not editable", {
          currentState: stored.current.state,
        });
      }
      const content = mergeProposalContent(stored.current.content, body.patch);
      const versionNumber = stored.current.version + 1;
      const version = {
        id: parseProposalVersionId(this.ids.next("prv")),
        version_number: versionNumber,
        base_version_id: stored.current.current_version_id,
        accepted_challenge_version_id: null,
        changed_fields: changedProposalFields(stored.current.content, content),
        content_hash: proposalContentHash(content),
        locked: false,
        actor_user_id: context.actorUserId,
        created_at: this.clock.now().toISOString(),
      } as const;
      const updated: ProposalResource = {
        ...stored.current,
        current_version_id: version.id,
        version: versionNumber,
        readiness: proposalReadiness(content, versionNumber),
        content,
        versions: [...stored.current.versions, version],
        updated_at: version.created_at,
      };
      state.proposals.set(storedKey, {
        current: updated,
        versions: [...stored.versions, updated],
      });
      return this.record(state, updated, context, "proposal.draft.updated", key, fingerprint);
    });
  }

  snapshot(): ProposalRepositorySnapshot {
    const stored = [...this.state.proposals.values()];
    return {
      proposals: structuredClone(stored.map(({ current }) => current)),
      versions: structuredClone(stored.flatMap(({ versions }) => versions)),
      auditEvents: structuredClone(this.state.auditEvents),
      outboxEvents: structuredClone(this.state.outboxEvents),
      idempotencyEntryCount: this.state.idempotency.size,
    };
  }
}
