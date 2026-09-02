import type {
  ArchiveTeamBody,
  ChangeTeamMemberRoleBody,
  ChangeTeamMemberStateBody,
  CreateTeamBody,
  CreateTeamInvitationBody,
  CreateTeamMembershipRequestBody,
  DecideTeamMembershipRequestBody,
  LeaveTeamBody,
  MutationReceipt,
  OutboxEvent,
  RespondTeamInvitationBody,
  RevokeTeamInvitationBody,
  TeamInvitationResource,
  TeamMembershipRequestResource,
  TeamNextAction,
  TeamResource,
  TransferTeamOwnershipBody,
  UpdateTeamPolicyBody,
  WithdrawTeamMembershipRequestBody,
} from "@rahhal/contracts";
import {
  DEFAULT_TEAM_POLICY,
  canRemoveTeamMembership,
  decideTeamPermission,
  isTeamNonOwnerRole,
  isTeamRole,
  parseAuditEventId,
  parseMembershipId,
  parsePrefixedId,
  parseReceiptId,
  parseTeamInvitationId,
  parseTeamMembershipRequestId,
  parseWorkspaceId,
  teamRole,
  type Membership,
  type MembershipId,
  type TeamAction,
  type TeamInvitationId,
  type TeamMembershipRequestId,
  type TeamRole,
  type TeamWorkspace,
  type User,
  type WorkspaceId,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import type { InMemoryIdentityAdapter } from "./in-memory-identity.js";
import type { InMemorySolverWorkspaceAdapter } from "./in-memory-solver-workspaces.js";
import { commandFingerprint } from "./primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  TeamPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "./ports.js";

type CachedOutcome = {
  readonly fingerprint: string;
  readonly outcome: MutationOutcome<string, TeamNextAction>;
};

type TeamAuditRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly occurredAt: string;
};

const joinModes = new Set(["open", "request", "invite-only"]);
const activeInvitationStates = new Set(["sent", "viewed"]);

function invalidState(currentState: string): ApiProblem {
  return new ApiProblem(409, "INVALID_STATE", "The team resource is not actionable", {
    currentState,
  });
}

function duplicate(message: string): ApiProblem {
  return new ApiProblem(409, "CONFLICT", message, { recovery: "review_existing_record" });
}

function leaveActionRequired(): ApiProblem {
  return new ApiProblem(409, "INVALID_STATE", "Use the leave-team command for yourself", {
    recovery: "use_leave_team",
  });
}

function text(value: string, min: number, max: number, path: string): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiProblem(422, "VALIDATION", "The team command is invalid", {
      fields: [
        {
          path,
          code: normalized.length < min ? "minLength" : "maxLength",
          message: `${path} is invalid`,
        },
      ],
    });
  }
  return normalized;
}

function email(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (normalized.length < 3 || normalized.length > 320 || !normalized.includes("@")) {
    throw new ApiProblem(422, "VALIDATION", "The recipient email is invalid", {
      fields: [{ path: "/recipient_email", code: "format", message: "A valid email is required" }],
    });
  }
  return normalized;
}

export class InMemoryTeamAdapter implements TeamPort {
  private readonly teams = new Map<WorkspaceId, TeamResource>();
  private readonly invitations = new Map<TeamInvitationId, TeamInvitationResource>();
  private readonly requests = new Map<TeamMembershipRequestId, TeamMembershipRequestResource>();
  private readonly idempotency = new Map<string, CachedOutcome>();
  private readonly auditEvents: TeamAuditRecord[] = [];
  private readonly outboxEvents: OutboxEvent[] = [];

  constructor(
    seeds: readonly import("./ports.js").DemoIdentitySeed[],
    private readonly identity: InMemoryIdentityAdapter,
    private readonly solverWorkspaces: InMemorySolverWorkspaceAdapter,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {
    const workspaces = new Map<WorkspaceId, TeamWorkspace>();
    for (const seed of seeds) {
      if (seed.workspace.kind === "team") workspaces.set(seed.workspace.id, seed.workspace);
    }
    for (const workspace of workspaces.values()) {
      const members = seeds
        .filter((seed) => seed.workspace.id === workspace.id && isTeamRole(seed.membership.role))
        .map((seed) => ({
          id: seed.membership.id,
          user_id: seed.user.id,
          display_name: seed.user.displayName,
          role: seed.membership.role as TeamRole,
          state: seed.membership.state,
          version: 1,
          created_at: seed.membership.createdAt,
          updated_at: seed.membership.updatedAt,
        }));
      const createdAt = members[0]?.created_at ?? this.clock.now().toISOString();
      this.teams.set(workspace.id, {
        tenant_id: workspace.tenantId,
        workspace_id: workspace.id,
        name: workspace.name,
        team_kind: workspace.teamKind,
        owner_user_id: workspace.ownerUserId,
        status: "active",
        join_mode: "request",
        default_invitation_role: teamRole.contributor,
        policy: DEFAULT_TEAM_POLICY,
        members,
        version: 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
    }
  }

  private cacheKey(tenantId: string, key: string): string {
    return `${tenantId}\0${key}`;
  }

  private replay<Target extends string>(
    tenantId: string,
    key: string,
    fingerprint: string,
  ): MutationOutcome<Target, TeamNextAction> | null {
    const cached = this.idempotency.get(this.cacheKey(tenantId, key));
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      ...(structuredClone(cached.outcome) as MutationOutcome<Target, TeamNextAction>),
      receipt: { ...cached.outcome.receipt, idempotent: true } as MutationReceipt<
        Target,
        TeamNextAction
      >,
    };
  }

  private record<Target extends OutboxEvent["aggregate_id"]>(
    target: Target,
    version: number,
    tenantId: TeamResource["tenant_id"],
    workspaceId: WorkspaceId,
    context: WorkspaceCommandContext,
    action: string,
    fingerprint: string,
    nextActions: readonly TeamNextAction[],
    eventPayload: Readonly<Record<string, unknown>> = {},
    auditMetadata: Readonly<Record<string, unknown>> = {},
  ): MutationOutcome<Target, TeamNextAction> {
    const timestamp = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    this.auditEvents.push({
      id: auditId,
      tenantId,
      workspaceId,
      actorUserId: context.actorUserId,
      action,
      targetId: target,
      targetVersion: version,
      metadata: { entity_version: version, ...auditMetadata },
      correlationId: context.correlationId,
      occurredAt: timestamp,
    });
    this.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: action,
      schema_version: 1,
      aggregate_type: action.startsWith("team.invitation")
        ? "team_invitation"
        : action.startsWith("team.membership-request")
          ? "team_membership_request"
          : action.startsWith("team.member")
            ? "membership"
            : "team",
      aggregate_id: target,
      tenant_id: tenantId,
      correlation_id: context.correlationId,
      occurred_at: timestamp,
      payload: { entity_version: version, workspace_id: workspaceId, ...eventPayload },
    });
    const outcome: MutationOutcome<Target, TeamNextAction> = {
      entityVersion: version,
      receipt: {
        entity_id: target,
        receipt_id: receiptId,
        audit_event_id: auditId,
        timestamp,
        idempotent: false,
        next_actions: nextActions,
      },
    };
    this.idempotency.set(this.cacheKey(tenantId, context.idempotencyKey), {
      fingerprint,
      outcome: structuredClone(outcome),
    });
    return outcome;
  }

  private activeTeam(scope: Pick<WorkspaceScope, "tenantId" | "workspaceId">): TeamResource | null {
    const team = this.teams.get(scope.workspaceId);
    return team?.tenant_id === scope.tenantId && team.status === "active" ? team : null;
  }

  private authorize(
    context: WorkspaceScope,
    action: TeamAction,
  ): { team: TeamResource; role: TeamRole } {
    const team = this.activeTeam(context);
    if (!team) throw notFound();
    if (!isTeamRole(context.role)) throw forbidden();
    const decision = decideTeamPermission(action, { role: context.role, policy: team.policy });
    if (!decision.allowed) throw forbidden();
    return { team, role: context.role };
  }

  private memberDomain(
    team: TeamResource,
    member: TeamResource["members"][number],
  ): Membership & { readonly role: TeamRole } {
    return {
      id: member.id,
      tenantId: team.tenant_id,
      workspaceId: team.workspace_id,
      userId: member.user_id,
      role: member.role,
      state: member.state,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    };
  }

  private replaceTeam(team: TeamResource): void {
    this.teams.set(team.workspace_id, structuredClone(team));
  }

  private replaceMember(
    team: TeamResource,
    membershipId: string,
    patch: Partial<TeamResource["members"][number]>,
  ): { team: TeamResource; member: TeamResource["members"][number] } {
    const target = team.members.find((member) => member.id === membershipId);
    if (!target) throw notFound();
    const updated = { ...target, ...patch };
    const next = {
      ...team,
      members: team.members.map((member) => (member.id === target.id ? updated : member)),
      version: team.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.replaceTeam(next);
    this.identity.updateTeamMembershipForTeam(this.memberDomain(next, updated));
    return { team: next, member: updated };
  }

  private ensureRemovable(team: TeamResource, target: TeamResource["members"][number]): void {
    const decision = canRemoveTeamMembership(
      team.members.map((member) => this.memberDomain(team, member)),
      this.memberDomain(team, target),
    );
    if (!decision.allowed) throw forbidden();
  }

  private invitationState(resource: TeamInvitationResource): TeamInvitationResource {
    return activeInvitationStates.has(resource.state) &&
      Date.parse(resource.expires_at) <= this.clock.now().getTime()
      ? { ...resource, state: "expired" }
      : resource;
  }

  private requestState(resource: TeamMembershipRequestResource): TeamMembershipRequestResource {
    return resource.state === "requested" &&
      Date.parse(resource.expires_at) <= this.clock.now().getTime()
      ? { ...resource, state: "expired" }
      : resource;
  }

  private addOrRestoreMember(
    team: TeamResource,
    user: User,
    role: Exclude<TeamRole, "team:owner">,
  ): { team: TeamResource; member: TeamResource["members"][number] } {
    const existing = team.members.find((member) => member.user_id === user.id);
    if (existing?.state === "active" || existing?.state === "suspended") {
      throw duplicate("The user already has a current team membership");
    }
    const now = this.clock.now().toISOString();
    const member = existing
      ? {
          ...existing,
          role,
          state: "active" as const,
          version: existing.version + 1,
          updated_at: now,
        }
      : {
          id: parseMembershipId(this.ids.next("mem")),
          user_id: user.id,
          display_name: user.displayName,
          role,
          state: "active" as const,
          version: 1,
          created_at: now,
          updated_at: now,
        };
    const next = {
      ...team,
      members: existing
        ? team.members.map((candidate) => (candidate.id === existing.id ? member : candidate))
        : [...team.members, member],
      version: team.version + 1,
      updated_at: now,
    };
    this.replaceTeam(next);
    this.identity.addTeamMembershipForTeam(
      {
        id: next.workspace_id,
        tenantId: next.tenant_id,
        kind: "team",
        name: next.name,
        teamKind: next.team_kind,
        ownerUserId: next.owner_user_id,
      },
      this.memberDomain(next, member),
      user,
    );
    return { team: next, member };
  }

  async create(
    body: CreateTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const name = text(body.name, 1, 200, "/name");
    if (body.expected_version !== 0 || (body.join_mode && !joinModes.has(body.join_mode))) {
      throw new ApiProblem(422, "VALIDATION", "A new team must expect version zero");
    }
    const fingerprint = commandFingerprint({
      action: "team.created",
      actor: context.actorUserId,
      body,
    });
    const replay = this.replay<WorkspaceId>(context.tenantId, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    const user = this.identity.userForTeam(context.actorUserId);
    if (!user) throw notFound();
    const workspaceId = parseWorkspaceId(this.ids.next("wsp"));
    const membershipId = parseMembershipId(this.ids.next("mem"));
    const now = this.clock.now().toISOString();
    const workspace: TeamWorkspace = {
      id: workspaceId,
      tenantId: context.tenantId,
      kind: "team",
      name,
      teamKind: body.team_kind,
      ownerUserId: context.actorUserId,
    };
    const member = {
      id: membershipId,
      user_id: context.actorUserId,
      display_name: user.displayName,
      role: teamRole.owner,
      state: "active" as const,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    const team: TeamResource = {
      tenant_id: context.tenantId,
      workspace_id: workspaceId,
      name,
      team_kind: body.team_kind,
      owner_user_id: context.actorUserId,
      status: "active",
      join_mode: body.join_mode ?? "request",
      default_invitation_role: teamRole.contributor,
      policy: DEFAULT_TEAM_POLICY,
      members: [member],
      version: 1,
      created_at: now,
      updated_at: now,
    };
    this.replaceTeam(team);
    this.identity.addTeamMembershipForTeam(workspace, this.memberDomain(team, member), user);
    this.solverWorkspaces.initializeTeamWorkspaceForTeam(workspace);
    return this.record(
      workspaceId,
      1,
      team.tenant_id,
      workspaceId,
      context,
      "team.created",
      fingerprint,
      ["switch_workspace"],
      { owner_user_id: context.actorUserId },
    );
  }

  async get(scope: WorkspaceScope): Promise<TeamResource | null> {
    const team = this.activeTeam(scope);
    return team ? structuredClone(team) : null;
  }

  async updatePolicy(
    body: UpdateTeamPolicyBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const { team } = this.authorize(context, "manage-team-settings");
    const fingerprint = commandFingerprint({
      action: "team.policy.updated",
      actor: context.actorUserId,
      body,
    });
    const replay = this.replay<WorkspaceId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== team.version) throw staleVersion(team.version);
    if (body.default_invitation_role && !isTeamNonOwnerRole(body.default_invitation_role))
      throw forbidden();
    if (body.join_mode && !joinModes.has(body.join_mode)) throw forbidden();
    if (!body.join_mode && !body.default_invitation_role && !body.policy) {
      throw new ApiProblem(422, "VALIDATION", "At least one policy field is required");
    }
    const reason = text(body.reason, 1, 2_000, "/reason");
    const next = {
      ...team,
      ...(body.join_mode ? { join_mode: body.join_mode } : {}),
      ...(body.default_invitation_role
        ? { default_invitation_role: body.default_invitation_role }
        : {}),
      policy: { ...team.policy, ...body.policy },
      version: team.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.replaceTeam(next);
    return this.record(
      next.workspace_id,
      next.version,
      next.tenant_id,
      next.workspace_id,
      context,
      "team.policy.updated",
      fingerprint,
      ["review_team"],
      {},
      { reason },
    );
  }

  async listInvitations(scope: WorkspaceScope): Promise<readonly TeamInvitationResource[]> {
    const { team } = this.authorize(scope, "invite-member");
    return [...this.invitations.values()]
      .filter(
        (item) => item.workspace_id === team.workspace_id && item.tenant_id === team.tenant_id,
      )
      .map((item) => structuredClone(this.invitationState(item)));
  }

  async invite(
    body: CreateTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const { team } = this.authorize(context, "invite-member");
    const recipientEmail = email(body.recipient_email);
    const fingerprint = commandFingerprint({
      action: "team.invitation.sent",
      actor: context.actorUserId,
      body: { ...body, recipient_email: recipientEmail },
    });
    const replay = this.replay<TeamInvitationId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    if (body.expected_version !== team.version) throw staleVersion(team.version);
    const existing = [...this.invitations.values()].find(
      (item) =>
        item.workspace_id === team.workspace_id &&
        item.recipient_email === recipientEmail &&
        activeInvitationStates.has(this.invitationState(item).state),
    );
    if (existing) throw duplicate("A current invitation already exists for this recipient");
    const matchedRecipient = this.identity.userByEmailForTeam(recipientEmail);
    const recipient = matchedRecipient?.emailVerified ? matchedRecipient : null;
    if (
      recipient &&
      team.members.some(
        (member) =>
          member.user_id === recipient.id &&
          (member.state === "active" || member.state === "suspended"),
      )
    ) {
      throw duplicate("The recipient already has a current team membership");
    }
    const now = this.clock.now().toISOString();
    const id = parseTeamInvitationId(this.ids.next("tiv"));
    const resource: TeamInvitationResource = {
      id,
      tenant_id: team.tenant_id,
      workspace_id: team.workspace_id,
      team_name: team.name,
      inviter_user_id: context.actorUserId,
      recipient_user_id: recipient?.id ?? null,
      recipient_email: recipientEmail,
      proposed_role: body.proposed_role,
      scope: text(body.scope, 1, 1_000, "/scope"),
      message: body.message.trim().slice(0, 2_000),
      commitment: text(body.commitment, 1, 1_000, "/commitment"),
      ip_notice: text(body.ip_notice, 1, 1_000, "/ip_notice"),
      state: "sent",
      version: 1,
      expires_at: new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60_000).toISOString(),
      created_at: now,
      updated_at: now,
    };
    this.invitations.set(id, resource);
    const next = { ...team, version: team.version + 1, updated_at: now };
    this.replaceTeam(next);
    return this.record(
      id,
      1,
      team.tenant_id,
      team.workspace_id,
      context,
      "team.invitation.sent",
      fingerprint,
      ["review_invitations"],
      { recipient_user_id: recipient?.id ?? null },
    );
  }

  async revokeInvitation(
    invitationId: string,
    body: RevokeTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const { team } = this.authorize(context, "invite-member");
    const invitation = this.invitations.get(parseTeamInvitationId(invitationId));
    if (
      !invitation ||
      invitation.workspace_id !== team.workspace_id ||
      invitation.tenant_id !== team.tenant_id
    )
      throw notFound();
    const fingerprint = commandFingerprint({
      action: "team.invitation.revoked",
      actor: context.actorUserId,
      invitationId,
      body,
    });
    const replay = this.replay<TeamInvitationId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    const current = this.invitationState(invitation);
    if (body.expected_version !== invitation.version) throw staleVersion(invitation.version);
    if (!activeInvitationStates.has(current.state)) throw invalidState(current.state);
    const reason = text(body.reason, 1, 2_000, "/reason");
    const updated = {
      ...invitation,
      state: "revoked" as const,
      version: invitation.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.invitations.set(updated.id, updated);
    return this.record(
      updated.id,
      updated.version,
      team.tenant_id,
      team.workspace_id,
      context,
      "team.invitation.revoked",
      fingerprint,
      ["review_invitations"],
      {},
      { reason },
    );
  }

  async listIncomingInvitations(
    actorUserId: import("@rahhal/domain").UserId,
  ): Promise<readonly TeamInvitationResource[]> {
    const user = this.identity.userForTeam(actorUserId);
    if (!user?.emailVerified) return [];
    const normalized = email(user.primaryEmail);
    return [...this.invitations.values()]
      .filter(
        (item) =>
          this.activeTeam({ tenantId: item.tenant_id, workspaceId: item.workspace_id }) !== null &&
          (item.recipient_user_id === actorUserId ||
            (item.recipient_user_id === null && item.recipient_email === normalized)),
      )
      .map((item) => structuredClone(this.invitationState(item)));
  }

  async respondInvitation(
    invitationId: string,
    body: RespondTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const invitation = this.invitations.get(parseTeamInvitationId(invitationId));
    const user = this.identity.userForTeam(context.actorUserId);
    if (
      !invitation ||
      !user?.emailVerified ||
      (invitation.recipient_user_id !== context.actorUserId &&
        invitation.recipient_email !== email(user.primaryEmail))
    )
      throw notFound();
    const team = this.activeTeam({
      tenantId: invitation.tenant_id,
      workspaceId: invitation.workspace_id,
    });
    if (!team) throw notFound();
    const action =
      body.decision === "accept" ? "team.invitation.accepted" : "team.invitation.declined";
    const fingerprint = commandFingerprint({
      action,
      actor: context.actorUserId,
      invitationId,
      body,
    });
    const replay = this.replay<TeamInvitationId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    const current = this.invitationState(invitation);
    if (body.expected_version !== invitation.version) throw staleVersion(invitation.version);
    if (!activeInvitationStates.has(current.state)) throw invalidState(current.state);
    if (body.decision === "decline" && !body.reason?.trim()) {
      throw new ApiProblem(422, "VALIDATION", "A decline reason is required");
    }
    if (body.decision === "accept") this.addOrRestoreMember(team, user, invitation.proposed_role);
    const updated = {
      ...invitation,
      recipient_user_id: invitation.recipient_user_id ?? context.actorUserId,
      state: body.decision === "accept" ? ("accepted" as const) : ("declined" as const),
      version: invitation.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.invitations.set(updated.id, updated);
    return this.record(
      updated.id,
      updated.version,
      team.tenant_id,
      team.workspace_id,
      context,
      action,
      fingerprint,
      body.decision === "accept" ? ["switch_workspace"] : ["continue"],
      { recipient_user_id: context.actorUserId },
      body.reason !== undefined ? { reason: text(body.reason, 1, 2_000, "/reason") } : {},
    );
  }

  async requestMembership(
    teamWorkspaceId: string,
    body: CreateTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    if (body.expected_version !== 0)
      throw new ApiProblem(422, "VALIDATION", "A new request must expect version zero");
    const workspaceId = parseWorkspaceId(teamWorkspaceId);
    const team = this.teams.get(workspaceId);
    if (!team || team.status !== "active" || team.join_mode === "invite-only") throw notFound();
    const user = this.identity.userForTeam(context.actorUserId);
    if (!user) throw notFound();
    if (
      team.members.some(
        (member) =>
          member.user_id === user.id && (member.state === "active" || member.state === "suspended"),
      )
    )
      throw notFound();
    const fingerprint = commandFingerprint({
      action: "team.membership-request.created",
      actor: context.actorUserId,
      workspaceId,
      body,
    });
    const replay = this.replay<TeamMembershipRequestId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    const existing = [...this.requests.values()].find(
      (item) =>
        item.workspace_id === workspaceId &&
        item.requester_user_id === user.id &&
        this.requestState(item).state === "requested",
    );
    if (existing) throw duplicate("A current membership request already exists");
    const now = this.clock.now().toISOString();
    const id = parseTeamMembershipRequestId(this.ids.next("tmr"));
    const resource: TeamMembershipRequestResource = {
      id,
      tenant_id: team.tenant_id,
      workspace_id: team.workspace_id,
      team_name: team.name,
      requester_user_id: user.id,
      requester_display_name: user.displayName,
      requested_role: body.requested_role,
      assigned_role: null,
      introduction: text(body.introduction, 1, 2_000, "/introduction"),
      availability: text(body.availability, 1, 1_000, "/availability"),
      state: "requested",
      decision_reason: null,
      version: 1,
      expires_at: new Date(this.clock.now().getTime() + 30 * 24 * 60 * 60_000).toISOString(),
      created_at: now,
      updated_at: now,
    };
    this.requests.set(id, resource);
    return this.record(
      id,
      1,
      team.tenant_id,
      team.workspace_id,
      context,
      "team.membership-request.created",
      fingerprint,
      ["continue"],
      { requester_user_id: user.id },
    );
  }

  async listMembershipRequests(
    scope: WorkspaceScope,
  ): Promise<readonly TeamMembershipRequestResource[]> {
    const { team } = this.authorize(scope, "review-membership-request");
    return [...this.requests.values()]
      .filter((item) => item.workspace_id === team.workspace_id)
      .map((item) => structuredClone(this.requestState(item)));
  }

  async decideMembershipRequest(
    requestId: string,
    body: DecideTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    const { team } = this.authorize(context, "review-membership-request");
    const request = this.requests.get(parseTeamMembershipRequestId(requestId));
    if (
      !request ||
      request.workspace_id !== team.workspace_id ||
      request.tenant_id !== team.tenant_id
    )
      throw notFound();
    const action =
      body.decision === "accept"
        ? "team.membership-request.accepted"
        : "team.membership-request.rejected";
    const fingerprint = commandFingerprint({ action, actor: context.actorUserId, requestId, body });
    const replay = this.replay<TeamMembershipRequestId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    const current = this.requestState(request);
    if (body.expected_version !== request.version) throw staleVersion(request.version);
    if (current.state !== "requested") throw invalidState(current.state);
    const reason = text(body.reason, 1, 2_000, "/reason");
    let assignedRole = null;
    if (body.decision === "accept") {
      if (!body.assigned_role || !isTeamNonOwnerRole(body.assigned_role))
        throw new ApiProblem(422, "VALIDATION", "An assigned role is required");
      const user = this.identity.userForTeam(request.requester_user_id);
      if (!user) throw notFound();
      this.addOrRestoreMember(team, user, body.assigned_role);
      assignedRole = body.assigned_role;
    }
    const updated: TeamMembershipRequestResource = {
      ...request,
      state: body.decision === "accept" ? "accepted" : "rejected",
      assigned_role: assignedRole,
      decision_reason: reason,
      version: request.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.requests.set(updated.id, updated);
    return this.record(
      updated.id,
      updated.version,
      team.tenant_id,
      team.workspace_id,
      context,
      action,
      fingerprint,
      ["review_membership_requests"],
      { requester_user_id: request.requester_user_id },
      { reason },
    );
  }

  async listOwnMembershipRequests(
    actorUserId: import("@rahhal/domain").UserId,
  ): Promise<readonly TeamMembershipRequestResource[]> {
    return [...this.requests.values()]
      .filter((item) => item.requester_user_id === actorUserId)
      .map((item) => structuredClone(this.requestState(item)));
  }

  async withdrawMembershipRequest(
    requestId: string,
    body: WithdrawTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    const request = this.requests.get(parseTeamMembershipRequestId(requestId));
    if (!request || request.requester_user_id !== context.actorUserId) throw notFound();
    const team = this.teams.get(request.workspace_id);
    if (!team || team.status !== "active") throw notFound();
    const fingerprint = commandFingerprint({
      action: "team.membership-request.withdrawn",
      actor: context.actorUserId,
      requestId,
      body,
    });
    const replay = this.replay<TeamMembershipRequestId>(
      team.tenant_id,
      context.idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;
    const current = this.requestState(request);
    if (body.expected_version !== request.version) throw staleVersion(request.version);
    if (current.state !== "requested") throw invalidState(current.state);
    const reason = text(body.reason, 1, 2_000, "/reason");
    const updated: TeamMembershipRequestResource = {
      ...request,
      state: "withdrawn",
      decision_reason: reason,
      version: request.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.requests.set(updated.id, updated);
    return this.record(
      updated.id,
      updated.version,
      team.tenant_id,
      team.workspace_id,
      context,
      "team.membership-request.withdrawn",
      fingerprint,
      ["continue"],
      { requester_user_id: context.actorUserId },
      { reason },
    );
  }

  async changeMemberRole(
    membershipId: string,
    body: ChangeTeamMemberRoleBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const { team } = this.authorize(context, "change-member-role");
    const target = team.members.find((member) => member.id === membershipId);
    if (!target) throw notFound();
    const fingerprint = commandFingerprint({
      action: "team.member.role-changed",
      actor: context.actorUserId,
      membershipId,
      body,
    });
    const replay = this.replay<MembershipId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== target.version) throw staleVersion(target.version);
    if (target.role === teamRole.owner) throw forbidden();
    if (target.state !== "active") throw invalidState(target.state);
    if (!isTeamNonOwnerRole(body.role)) throw forbidden();
    if (target.role === teamRole.admin && body.role !== teamRole.admin)
      this.ensureRemovable(team, target);
    const reason = text(body.reason, 1, 2_000, "/reason");
    const result = this.replaceMember(team, membershipId, {
      role: body.role,
      version: target.version + 1,
      updated_at: this.clock.now().toISOString(),
    });
    return this.record(
      result.member.id,
      result.member.version,
      result.team.tenant_id,
      result.team.workspace_id,
      context,
      "team.member.role-changed",
      fingerprint,
      ["review_team"],
      { user_id: target.user_id },
      { reason, previous_role: target.role, role: body.role },
    );
  }

  private async changeMemberState(
    membershipId: string,
    body: ChangeTeamMemberStateBody,
    context: WorkspaceCommandContext,
    command: "suspend" | "restore" | "remove",
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const { team } = this.authorize(context, "change-member-role");
    const target = team.members.find((member) => member.id === membershipId);
    if (!target) throw notFound();
    const action = `team.member.${command === "remove" ? "removed" : command === "suspend" ? "suspended" : "restored"}`;
    const fingerprint = commandFingerprint({
      action,
      actor: context.actorUserId,
      membershipId,
      body,
    });
    const replay = this.replay<MembershipId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== target.version) throw staleVersion(target.version);
    const reason = text(body.reason, 1, 2_000, "/reason");
    if (command === "restore") {
      if (target.state !== "suspended") throw invalidState(target.state);
    } else {
      if (target.state !== "active") throw invalidState(target.state);
      this.ensureRemovable(team, target);
      if (target.user_id === context.actorUserId) throw leaveActionRequired();
    }
    const state =
      command === "restore" ? "active" : command === "suspend" ? "suspended" : "removed";
    const result = this.replaceMember(team, membershipId, {
      state,
      version: target.version + 1,
      updated_at: this.clock.now().toISOString(),
    });
    return this.record(
      result.member.id,
      result.member.version,
      result.team.tenant_id,
      result.team.workspace_id,
      context,
      action,
      fingerprint,
      ["review_team"],
      { user_id: target.user_id },
      { reason, previous_state: target.state, state },
    );
  }

  suspendMember(id: string, body: ChangeTeamMemberStateBody, context: WorkspaceCommandContext) {
    return this.changeMemberState(id, body, context, "suspend");
  }

  restoreMember(id: string, body: ChangeTeamMemberStateBody, context: WorkspaceCommandContext) {
    return this.changeMemberState(id, body, context, "restore");
  }

  removeMember(id: string, body: ChangeTeamMemberStateBody, context: WorkspaceCommandContext) {
    return this.changeMemberState(id, body, context, "remove");
  }

  async transferOwnership(
    body: TransferTeamOwnershipBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const { team } = this.authorize(context, "transfer-ownership");
    const fingerprint = commandFingerprint({
      action: "team.ownership.transferred",
      actor: context.actorUserId,
      body,
    });
    const replay = this.replay<WorkspaceId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== team.version) throw staleVersion(team.version);
    const reason = text(body.reason, 1, 2_000, "/reason");
    const currentOwner = team.members.find(
      (member) => member.role === teamRole.owner && member.state === "active",
    );
    const successor = team.members.find((member) => member.id === body.successor_membership_id);
    if (
      !currentOwner ||
      !successor ||
      successor.state !== "active" ||
      successor.role === teamRole.owner
    )
      throw notFound();
    const now = this.clock.now().toISOString();
    const updatedOwner = {
      ...currentOwner,
      role: teamRole.admin,
      version: currentOwner.version + 1,
      updated_at: now,
    };
    const updatedSuccessor = {
      ...successor,
      role: teamRole.owner,
      version: successor.version + 1,
      updated_at: now,
    };
    const next: TeamResource = {
      ...team,
      owner_user_id: successor.user_id,
      members: team.members.map((member) =>
        member.id === currentOwner.id
          ? updatedOwner
          : member.id === successor.id
            ? updatedSuccessor
            : member,
      ),
      version: team.version + 1,
      updated_at: now,
    };
    this.replaceTeam(next);
    this.identity.updateTeamMembershipForTeam(this.memberDomain(next, updatedOwner));
    this.identity.updateTeamMembershipForTeam(this.memberDomain(next, updatedSuccessor));
    this.identity.updateTeamWorkspaceForTeam({
      id: next.workspace_id,
      tenantId: next.tenant_id,
      kind: "team",
      name: next.name,
      teamKind: next.team_kind,
      ownerUserId: next.owner_user_id,
    });
    return this.record(
      next.workspace_id,
      next.version,
      next.tenant_id,
      next.workspace_id,
      context,
      "team.ownership.transferred",
      fingerprint,
      ["review_team"],
      { previous_owner_user_id: currentOwner.user_id, owner_user_id: successor.user_id },
      { reason, previous_owner_user_id: currentOwner.user_id, owner_user_id: successor.user_id },
    );
  }

  async leave(
    body: LeaveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const { team } = this.authorize(context, "leave-team");
    const self = team.members.find((member) => member.user_id === context.actorUserId);
    if (!self) throw notFound();
    const fingerprint = commandFingerprint({
      action: "team.member.left",
      actor: context.actorUserId,
      body,
    });
    const replay = this.replay<MembershipId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== self.version) throw staleVersion(self.version);
    const reason = text(body.reason, 1, 2_000, "/reason");
    this.ensureRemovable(team, self);
    const result = this.replaceMember(team, self.id, {
      state: "removed",
      version: self.version + 1,
      updated_at: this.clock.now().toISOString(),
    });
    return this.record(
      result.member.id,
      result.member.version,
      result.team.tenant_id,
      result.team.workspace_id,
      context,
      "team.member.left",
      fingerprint,
      ["switch_workspace"],
      { user_id: self.user_id },
      { reason },
    );
  }

  async archive(
    body: ArchiveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const { team } = this.authorize(context, "archive-team");
    const fingerprint = commandFingerprint({
      action: "team.archived",
      actor: context.actorUserId,
      body,
    });
    const replay = this.replay<WorkspaceId>(team.tenant_id, context.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (body.expected_version !== team.version) throw staleVersion(team.version);
    const reason = text(body.reason, 1, 2_000, "/reason");
    const next: TeamResource = {
      ...team,
      status: "archived",
      version: team.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.teams.set(next.workspace_id, next);
    this.identity.archiveTeamWorkspaceForTeam(next.workspace_id);
    return this.record(
      next.workspace_id,
      next.version,
      next.tenant_id,
      next.workspace_id,
      context,
      "team.archived",
      fingerprint,
      ["switch_workspace"],
      {},
      { reason },
    );
  }

  snapshot() {
    return {
      teams: structuredClone([...this.teams.values()]),
      invitations: structuredClone([...this.invitations.values()]),
      membershipRequests: structuredClone([...this.requests.values()]),
      auditEvents: structuredClone(this.auditEvents),
      outboxEvents: structuredClone(this.outboxEvents),
      idempotencyEntryCount: this.idempotency.size,
    };
  }
}
