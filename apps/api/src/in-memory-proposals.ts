import type {
  CreateProposalBody,
  MutationReceipt,
  OrganizationProposalInboxItemResource,
  OrganizationProposalInboxResource,
  OrganizationProposalResource,
  OutboxEvent,
  PatchProposalBody,
  ProposalNextAction,
  ProposalResource,
  SubmitProposalBody,
} from "@rahhal/contracts";
import {
  decideTeamPermission,
  isAggregateVersion,
  isTeamRole,
  parseAccessGrantId,
  parseAuditEventId,
  parseProposalId,
  parseProposalVersionId,
  parsePrefixedId,
  parseReceiptId,
  type AccessGrantId,
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
import type { InMemoryChallengeRepository } from "./in-memory-challenges.js";
import { C4_PROPOSAL_GRANT_DURATION_MS } from "./proposal-submission.js";
import type {
  Clock,
  EligibilityPort,
  IdFactory,
  MutationOutcome,
  ProposalCommandContext,
  ProposalPort,
  ProposalScope,
  TeamPort,
  WorkspaceScope,
} from "./ports.js";

type ProposalMutationOutcome = MutationOutcome<ProposalId, ProposalNextAction>;

type ProposalAuditRecord = {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly entityId: ProposalId;
  readonly entityVersion: number;
  readonly action: "proposal.draft.created" | "proposal.draft.updated" | "proposal.submitted";
  readonly outcome: "success";
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
};

type StoredProposal = {
  readonly current: ProposalResource;
  readonly versions: readonly ProposalResource[];
};

type StoredProposalGrant = {
  readonly id: AccessGrantId;
  readonly proposalId: ProposalId;
  readonly proposalVersionId: ProposalResource["current_version_id"];
  readonly organizationTenantId: TenantId;
  readonly organizationWorkspaceId: WorkspaceId;
  readonly expiresAt: string;
  readonly state: "active" | "revoked";
};

type RepositoryState = {
  readonly proposals: Map<string, StoredProposal>;
  readonly idempotency: Map<
    string,
    { readonly fingerprint: string; readonly outcome: ProposalMutationOutcome }
  >;
  readonly auditEvents: ProposalAuditRecord[];
  readonly outboxEvents: OutboxEvent[];
  readonly grants: Map<string, StoredProposalGrant>;
};

export type ProposalRepositorySnapshot = {
  readonly proposals: readonly ProposalResource[];
  readonly versions: readonly ProposalResource[];
  readonly auditEvents: readonly ProposalAuditRecord[];
  readonly outboxEvents: readonly OutboxEvent[];
  readonly idempotencyEntryCount: number;
  readonly grants: readonly StoredProposalGrant[];
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
    grants: new Map(
      [...state.grants].map(([key, value]) => [key, structuredClone(value)] as const),
    ),
  };
}

export class InMemoryProposalAdapter implements ProposalPort {
  private trackingSequence = 0;
  private state: RepositoryState = {
    proposals: new Map(),
    idempotency: new Map(),
    auditEvents: [],
    outboxEvents: [],
    grants: new Map(),
  };

  constructor(
    private readonly publicChallenges: InMemoryChallengeRepository,
    private readonly eligibility: EligibilityPort,
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

  private record(
    state: RepositoryState,
    resource: ProposalResource,
    context: ProposalCommandContext,
    action: ProposalAuditRecord["action"],
    key: string,
    fingerprint: string,
    options: {
      readonly occurredAt?: string;
      readonly nextActions?: readonly ProposalNextAction[];
      readonly metadata?: Readonly<Record<string, string | number>>;
    } = {},
  ): ProposalMutationOutcome {
    const occurredAt = options.occurredAt ?? this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<ProposalId, ProposalNextAction> = {
      entity_id: resource.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp: occurredAt,
      idempotent: false,
      next_actions: options.nextActions ?? ["edit", "submit"],
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
      payload: { entity_version: resource.version, ...options.metadata },
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
        readiness: proposalReadiness(content, 1, { ndaRequired: challenge.nda_required }),
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
    const challenge = await this.publicChallenges.get("registered", visible.challenge_id);
    if (!challenge) throw notFound();

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
        readiness: proposalReadiness(content, versionNumber, {
          ndaRequired: challenge.nda_required,
        }),
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

  async submit(
    id: string,
    body: SubmitProposalBody,
    context: ProposalCommandContext,
  ): Promise<ProposalMutationOutcome> {
    const key = commandKey(context, "proposal:submit");
    const fingerprint = commandFingerprint({
      command: "proposal:submit",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    const stored = this.state.proposals.get(scopeKey(context, id));
    if (!stored) throw notFound();
    if (
      !(await this.permitted(context, "submit-proposal", stored.current.assigned_membership_ids))
    ) {
      throw notFound();
    }
    const cached = this.replay(this.state, key, fingerprint);
    if (cached) return cached;
    if (body.expected_version !== stored.current.version)
      throw staleVersion(stored.current.version);
    if (stored.current.state !== "draft") {
      throw new ApiProblem(409, "INVALID_STATE", "Proposal is not an editable draft", {
        currentState: stored.current.state,
      });
    }

    const projection = await this.publicChallenges.get("registered", stored.current.challenge_id);
    const aggregate = this.publicChallenges
      .snapshot()
      .challenges.find((challenge) => challenge.id === stored.current.challenge_id);
    if (
      !projection ||
      !aggregate ||
      aggregate.published_version_id !== projection.challenge_version_id ||
      !aggregate.publication_state ||
      !aggregate.proposal_deadline_at
    ) {
      throw notFound();
    }
    if (body.accepted_challenge_version_id !== projection.challenge_version_id) {
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

    const eligibility = await this.eligibility.evaluate(context, stored.current.challenge_id);
    if (!eligibility) throw notFound();
    if (eligibility.status !== "eligible") {
      throw new ApiProblem(409, "INVALID_STATE", "Proposal submission eligibility is not met", {
        currentState: aggregate.publication_state,
        recovery: eligibility.next_actions.length
          ? "complete_eligibility_actions"
          : "refresh_call_state",
        eligibility,
      });
    }
    const readiness = proposalReadiness(stored.current.content, stored.current.version, {
      ndaRequired: projection.nda_required,
    });
    if (!readiness.ready) {
      throw new ApiProblem(422, "VALIDATION", "Proposal form is not ready for submission", {
        currentVersion: stored.current.version,
        fields: readiness.issues,
        recovery: "complete_proposal",
      });
    }

    return this.transact((state) => {
      const replay = this.replay(state, key, fingerprint);
      if (replay) return replay;
      const current = state.proposals.get(scopeKey(context, id));
      if (!current || current.current.version !== stored.current.version) {
        throw new ApiProblem(409, "CONFLICT", "Proposal changed while it was being submitted", {
          recovery: "refetch_and_retry",
        });
      }
      const occurredAt = eligibility.evaluated_at;
      const versionNumber = current.current.version + 1;
      const versionId = parseProposalVersionId(this.ids.next("prv"));
      const grantId = parseAccessGrantId(this.ids.next("agr"));
      this.trackingSequence += 1;
      const trackingCode = `PRP-${new Date(occurredAt).getUTCFullYear()}-${String(this.trackingSequence).padStart(6, "0")}`;
      const version = {
        id: versionId,
        version_number: versionNumber,
        base_version_id: current.current.current_version_id,
        accepted_challenge_version_id: projection.challenge_version_id,
        changed_fields: [],
        content_hash: proposalContentHash(current.current.content),
        locked: true,
        actor_user_id: context.actorUserId,
        created_at: occurredAt,
      } as const;
      const submitted: ProposalResource = {
        ...current.current,
        current_version_id: versionId,
        state: "submitted",
        tracking_code: trackingCode,
        version: versionNumber,
        readiness: { ...readiness, evaluated_version: versionNumber },
        versions: [...current.current.versions, version],
        submitted_at: occurredAt,
        updated_at: occurredAt,
      };
      const grant: StoredProposalGrant = {
        id: grantId,
        proposalId: submitted.id,
        proposalVersionId: versionId,
        organizationTenantId: aggregate.tenant_id,
        organizationWorkspaceId: aggregate.workspace_id,
        expiresAt: new Date(Date.parse(occurredAt) + C4_PROPOSAL_GRANT_DURATION_MS).toISOString(),
        state: "active",
      };
      state.proposals.set(scopeKey(context, id), {
        current: submitted,
        versions: [...current.versions, submitted],
      });
      state.grants.set(submitted.id, grant);
      return this.record(state, submitted, context, "proposal.submitted", key, fingerprint, {
        occurredAt,
        nextActions: ["await_eligibility"],
        metadata: { submitted_version_id: versionId, grant_id: grantId },
      });
    });
  }

  private organizationResource(
    scope: WorkspaceScope,
    proposalId: string,
  ): OrganizationProposalResource | null {
    const grant = this.state.grants.get(proposalId);
    if (
      !grant ||
      grant.state !== "active" ||
      grant.organizationTenantId !== scope.tenantId ||
      grant.organizationWorkspaceId !== scope.workspaceId ||
      Date.parse(grant.expiresAt) <= this.clock.now().getTime()
    ) {
      return null;
    }
    const stored = [...this.state.proposals.values()].find(
      ({ current }) => current.id === proposalId,
    );
    const proposal = stored?.current;
    const grantedSnapshot = stored?.versions.find(
      (candidate) => candidate.current_version_id === grant.proposalVersionId,
    );
    const version = grantedSnapshot?.versions.find(
      (candidate) => candidate.id === grant.proposalVersionId,
    );
    const challenge = this.publicChallenges
      .snapshot()
      .challenges.find(
        (candidate) =>
          candidate.id === proposal?.challenge_id &&
          candidate.tenant_id === scope.tenantId &&
          candidate.workspace_id === scope.workspaceId,
      );
    if (
      !proposal ||
      !grantedSnapshot ||
      !version ||
      !challenge ||
      !proposal.tracking_code ||
      !proposal.submitted_at ||
      !version.locked ||
      !version.base_version_id ||
      !version.accepted_challenge_version_id
    ) {
      return null;
    }
    return {
      id: proposal.id,
      challenge_id: proposal.challenge_id,
      owner_workspace_kind: proposal.owner_workspace_kind,
      state: proposal.state,
      tracking_code: proposal.tracking_code,
      submitted_at: proposal.submitted_at,
      submitted_version: {
        id: version.id,
        version_number: version.version_number,
        base_version_id: version.base_version_id,
        accepted_challenge_version_id: version.accepted_challenge_version_id,
        changed_fields: version.changed_fields,
        content_hash: version.content_hash,
        locked_at: version.created_at,
      },
      content: structuredClone(grantedSnapshot.content),
    };
  }

  async listForOrganization(scope: WorkspaceScope): Promise<OrganizationProposalInboxResource> {
    const items = [...this.state.grants.keys()]
      .map((id) => this.organizationResource(scope, id))
      .filter((item): item is OrganizationProposalResource => item !== null)
      .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))
      .slice(0, 100)
      .map(({ content, ...item }): OrganizationProposalInboxItemResource => {
        void content;
        return item;
      });
    return { items };
  }

  async getForOrganization(
    scope: WorkspaceScope,
    id: string,
  ): Promise<OrganizationProposalResource | null> {
    return structuredClone(this.organizationResource(scope, id));
  }

  snapshot(): ProposalRepositorySnapshot {
    const stored = [...this.state.proposals.values()];
    return {
      proposals: structuredClone(stored.map(({ current }) => current)),
      versions: structuredClone(stored.flatMap(({ versions }) => versions)),
      auditEvents: structuredClone(this.state.auditEvents),
      outboxEvents: structuredClone(this.state.outboxEvents),
      idempotencyEntryCount: this.state.idempotency.size,
      grants: structuredClone([...this.state.grants.values()]),
    };
  }
}
