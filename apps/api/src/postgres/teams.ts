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
import { teamJoinModes } from "@rahhal/contracts";
import {
  decideTeamPermission,
  isMembershipState,
  isTeamInvitationState,
  isTeamKind,
  isTeamMembershipRequestState,
  isTeamNonOwnerRole,
  isTeamRole,
  isTeamStatus,
  parseAuditEventId,
  parseMembershipId,
  parseReceiptId,
  parseTeamInvitationId,
  parseTeamMembershipRequestId,
  parseTenantId,
  parseUserId,
  parseVerificationId,
  parseWorkspaceId,
  teamRole,
  type EntityId,
  type MembershipId,
  type TeamAction,
  type TeamInvitationId,
  type TeamMembershipRequestId,
  type TeamNonOwnerRole,
  type TeamPolicy,
  type TeamRole,
  type TenantId,
  type WorkspaceId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  TeamPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type TeamRow = {
  tenant_id: string;
  workspace_id: string;
  name: string;
  team_kind: string;
  owner_user_id: string;
  status: string;
  join_mode: string;
  default_invitation_role: string;
  proposal_managers_can_edit_profile: boolean;
  proposal_managers_can_invite: boolean;
  admins_can_submit: boolean;
  proposal_managers_can_submit: boolean;
  viewers_can_read_messages: boolean;
  admins_can_view_payments: boolean;
  proposal_managers_can_view_payments: boolean;
  approval_before_submit: boolean;
  lock_version: number | string;
  created_at: Date;
  updated_at: Date;
};

type MemberRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  display_name: string;
  role: string;
  state: string;
  lock_version: number | string;
  created_at: Date;
  updated_at: Date;
};

type InvitationRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  team_name: string;
  inviter_user_id: string;
  recipient_user_id: string | null;
  recipient_email: string;
  proposed_role: string;
  scope: string;
  message: string;
  commitment: string;
  ip_notice: string;
  state: string;
  lock_version: number | string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

type RequestRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  team_name: string;
  requester_user_id: string;
  requester_display_name: string;
  requested_role: string;
  assigned_role: string | null;
  introduction: string;
  availability: string;
  state: string;
  decision_reason: string | null;
  lock_version: number | string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

type IdempotencyRow = { request_hash: string; status: string; response_body: unknown };
type CachedMutation = {
  entity_id: string;
  entity_version: number;
  receipt_id: string;
  audit_event_id: string;
  timestamp: string;
  next_actions: string[];
};

const teamColumns = `
  team.tenant_id, team.workspace_id, workspace.name, workspace.team_kind,
  workspace.owner_user_id, team.status, team.join_mode, team.default_invitation_role,
  team.proposal_managers_can_edit_profile, team.proposal_managers_can_invite,
  team.admins_can_submit, team.proposal_managers_can_submit,
  team.viewers_can_read_messages, team.admins_can_view_payments,
  team.proposal_managers_can_view_payments, team.approval_before_submit,
  team.lock_version, team.created_at, team.updated_at`;

const memberColumns = `
  membership.id, membership.tenant_id, membership.workspace_id, membership.user_id,
  app_user.display_name, membership.role, membership.state, membership.lock_version,
  membership.created_at, membership.updated_at`;

const invitationColumns = `
  invitation.id, invitation.tenant_id, invitation.workspace_id, workspace.name AS team_name,
  invitation.inviter_user_id, invitation.recipient_user_id,
  invitation.recipient_email::text, invitation.proposed_role, invitation.scope,
  invitation.message, invitation.commitment, invitation.ip_notice,
  CASE WHEN invitation.state IN ('sent','viewed') AND invitation.expires_at <= $1
       THEN 'expired' ELSE invitation.state END AS state,
  invitation.lock_version, invitation.expires_at, invitation.created_at, invitation.updated_at`;

const requestColumns = `
  request.id, request.tenant_id, request.workspace_id, workspace.name AS team_name,
  request.requester_user_id, app_user.display_name AS requester_display_name,
  request.requested_role, request.assigned_role, request.introduction, request.availability,
  CASE WHEN request.state = 'requested' AND request.expires_at <= $1
       THEN 'expired' ELSE request.state END AS state,
  request.decision_reason, request.lock_version, request.expires_at,
  request.created_at, request.updated_at`;

function policy(row: TeamRow): TeamPolicy {
  return {
    proposalManagersCanEditProfile: row.proposal_managers_can_edit_profile,
    proposalManagersCanInvite: row.proposal_managers_can_invite,
    adminsCanSubmit: row.admins_can_submit,
    proposalManagersCanSubmit: row.proposal_managers_can_submit,
    viewersCanReadMessages: row.viewers_can_read_messages,
    adminsCanViewPayments: row.admins_can_view_payments,
    proposalManagersCanViewPayments: row.proposal_managers_can_view_payments,
    approvalBeforeSubmit: row.approval_before_submit,
  };
}

function memberResource(row: MemberRow): TeamResource["members"][number] {
  if (!isTeamRole(row.role) || !isMembershipState(row.state)) {
    throw new Error("Database returned an invalid team membership");
  }
  return {
    id: parseMembershipId(row.id),
    user_id: parseUserId(row.user_id),
    display_name: row.display_name,
    role: row.role,
    state: row.state,
    version: Number(row.lock_version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function invitationResource(row: InvitationRow): TeamInvitationResource {
  if (!isTeamInvitationState(row.state) || !isTeamNonOwnerRole(row.proposed_role)) {
    throw new Error("Database returned an invalid team invitation");
  }
  return {
    id: parseTeamInvitationId(row.id),
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    team_name: row.team_name,
    inviter_user_id: parseUserId(row.inviter_user_id),
    recipient_user_id: row.recipient_user_id ? parseUserId(row.recipient_user_id) : null,
    recipient_email: row.recipient_email,
    proposed_role: row.proposed_role,
    scope: row.scope,
    message: row.message,
    commitment: row.commitment,
    ip_notice: row.ip_notice,
    state: row.state,
    version: Number(row.lock_version),
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function requestResource(row: RequestRow): TeamMembershipRequestResource {
  if (
    !isTeamMembershipRequestState(row.state) ||
    !isTeamNonOwnerRole(row.requested_role) ||
    (row.assigned_role !== null && !isTeamNonOwnerRole(row.assigned_role))
  ) {
    throw new Error("Database returned an invalid team membership request");
  }
  return {
    id: parseTeamMembershipRequestId(row.id),
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    team_name: row.team_name,
    requester_user_id: parseUserId(row.requester_user_id),
    requester_display_name: row.requester_display_name,
    requested_role: row.requested_role,
    assigned_role: row.assigned_role,
    introduction: row.introduction,
    availability: row.availability,
    state: row.state,
    decision_reason: row.decision_reason,
    version: Number(row.lock_version),
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function cachedMutation(value: unknown): CachedMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned an invalid team idempotency response");
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
    throw new Error("Database returned an invalid team idempotency response");
  }
  return row as CachedMutation;
}

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

function boundedText(value: string, min: number, max: number, field: string): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiProblem(422, "VALIDATION", `A valid ${field} is required`);
  }
  return normalized;
}

function structuredReason(value: string): string {
  return boundedText(value, 1, 2_000, "reason");
}

function recipientEmail(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (normalized.length < 3 || normalized.length > 320 || !normalized.includes("@")) {
    throw new ApiProblem(422, "VALIDATION", "A valid recipient email is required");
  }
  return normalized;
}

export class PostgresTeamAdapter implements TeamPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private async lockIdempotency(client: PoolClient, tenantId: TenantId, key: string) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      [tenantId, key].join(":"),
    ]);
  }

  private async replay<Target extends EntityId>(
    client: PoolClient,
    tenantId: TenantId,
    key: string,
    requestHash: string,
    parseTarget: (value: unknown) => Target,
  ): Promise<MutationOutcome<Target, TeamNextAction> | null> {
    await client.query(
      `DELETE FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 AND expires_at <= $3`,
      [tenantId, key, this.clock.now().toISOString()],
    );
    const result = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, response_body FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 FOR UPDATE`,
      [tenantId, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return this.outcome(cachedMutation(row.response_body), parseTarget, true);
  }

  private outcome<Target extends EntityId>(
    cached: CachedMutation,
    parseTarget: (value: unknown) => Target,
    idempotent: boolean,
  ): MutationOutcome<Target, TeamNextAction> {
    const receipt: MutationReceipt<Target, TeamNextAction> = {
      entity_id: parseTarget(cached.entity_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: new Date(cached.timestamp).toISOString(),
      idempotent,
      next_actions: cached.next_actions as TeamNextAction[],
    };
    return { receipt, entityVersion: cached.entity_version };
  }

  private async record<Target extends EntityId>(
    client: PoolClient,
    target: Target,
    targetType: string,
    version: number,
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    context: WorkspaceCommandContext,
    action: string,
    nextActions: readonly TeamNextAction[],
    requestHash: string,
    parseTarget: (value: unknown) => Target,
    auditMetadata: Readonly<Record<string, unknown>> = {},
    eventPayload: Readonly<Record<string, unknown>> = {},
  ): Promise<MutationOutcome<Target, TeamNextAction>> {
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
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED',$7,$8,$9::jsonb,$10)`,
      [
        auditId,
        context.correlationId,
        tenantId,
        workspaceId,
        context.actorUserId,
        action,
        targetType,
        target,
        JSON.stringify({ entity_version: version, ...auditMetadata }),
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
        tenantId,
        workspaceId,
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
        tenantId,
        context.correlationId,
        action,
        targetType,
        target,
        JSON.stringify({ entity_version: version, workspace_id: workspaceId, ...eventPayload }),
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
        `idk_${commandFingerprint({ tenantId, idempotencyKey: context.idempotencyKey })}`,
        tenantId,
        context.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        occurredAt,
        new Date(Date.parse(occurredAt) + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.outcome(cached, parseTarget, false);
  }

  private async findTeam(
    client: PoolClient,
    tenantId: string,
    workspaceId: string,
    lock: "share" | "update",
  ): Promise<TeamRow | null> {
    const result = await client.query<TeamRow>(
      `SELECT ${teamColumns}
       FROM team_workspace AS team
       JOIN workspace ON workspace.id = team.workspace_id AND workspace.tenant_id = team.tenant_id
       WHERE team.tenant_id = $1 AND team.workspace_id = $2 AND team.status = 'active'
       FOR ${lock === "update" ? "UPDATE OF team, workspace" : "SHARE OF team, workspace"}`,
      [tenantId, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  private async findTeamByWorkspace(
    client: PoolClient,
    workspaceId: string,
    lock: "share" | "update",
  ): Promise<TeamRow | null> {
    const result = await client.query<TeamRow>(
      `SELECT ${teamColumns}
       FROM team_workspace AS team
       JOIN workspace ON workspace.id = team.workspace_id AND workspace.tenant_id = team.tenant_id
       WHERE team.workspace_id = $1 AND team.status = 'active'
       FOR ${lock === "update" ? "UPDATE OF team, workspace" : "SHARE OF team, workspace"}`,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  private authorize(row: TeamRow, context: WorkspaceScope, action: TeamAction): TeamRole {
    if (
      row.tenant_id !== context.tenantId ||
      row.workspace_id !== context.workspaceId ||
      !isTeamRole(context.role)
    ) {
      throw notFound();
    }
    const decision = decideTeamPermission(action, { role: context.role, policy: policy(row) });
    if (!decision.allowed) throw forbidden();
    return context.role;
  }

  private async members(client: PoolClient, row: TeamRow, lock = false): Promise<MemberRow[]> {
    const result = await client.query<MemberRow>(
      `SELECT ${memberColumns}
       FROM membership
       JOIN app_user ON app_user.id = membership.user_id
       WHERE membership.tenant_id = $1 AND membership.workspace_id = $2
         AND membership.workspace_kind = 'team'
       ORDER BY membership.created_at, membership.id
       ${lock ? "FOR UPDATE OF membership" : "FOR SHARE OF membership, app_user"}`,
      [row.tenant_id, row.workspace_id],
    );
    return result.rows;
  }

  private async resource(client: PoolClient, row: TeamRow): Promise<TeamResource> {
    if (
      !isTeamKind(row.team_kind) ||
      !isTeamStatus(row.status) ||
      !teamJoinModes.includes(row.join_mode as (typeof teamJoinModes)[number]) ||
      !isTeamNonOwnerRole(row.default_invitation_role)
    ) {
      throw new Error("Database returned an invalid team workspace");
    }
    return {
      tenant_id: parseTenantId(row.tenant_id),
      workspace_id: parseWorkspaceId(row.workspace_id),
      name: row.name,
      team_kind: row.team_kind,
      owner_user_id: parseUserId(row.owner_user_id),
      status: row.status,
      join_mode: row.join_mode as (typeof teamJoinModes)[number],
      default_invitation_role: row.default_invitation_role,
      policy: policy(row),
      members: (await this.members(client, row)).map(memberResource),
      version: Number(row.lock_version),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private async teamCommand(
    context: WorkspaceCommandContext,
    action: TeamAction,
  ): Promise<{ client: PoolClient; row: TeamRow; tenantId: TenantId; workspaceId: WorkspaceId }> {
    const client = this.unitOfWork.currentClient();
    const row = await this.findTeam(client, context.tenantId, context.workspaceId, "update");
    if (!row) throw notFound();
    this.authorize(row, context, action);
    return {
      client,
      row,
      tenantId: parseTenantId(row.tenant_id),
      workspaceId: parseWorkspaceId(row.workspace_id),
    };
  }

  private async findMember(
    client: PoolClient,
    row: TeamRow,
    membershipId: string,
  ): Promise<MemberRow | null> {
    const result = await client.query<MemberRow>(
      `SELECT ${memberColumns}
       FROM membership JOIN app_user ON app_user.id = membership.user_id
       WHERE membership.id = $1 AND membership.tenant_id = $2
         AND membership.workspace_id = $3 AND membership.workspace_kind = 'team'
       FOR UPDATE OF membership`,
      [membershipId, row.tenant_id, row.workspace_id],
    );
    return result.rows[0] ?? null;
  }

  private async ensureRemovable(
    client: PoolClient,
    row: TeamRow,
    target: MemberRow,
  ): Promise<void> {
    if (target.role === teamRole.owner) throw forbidden();
    if (target.role !== teamRole.admin) return;
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership
       WHERE tenant_id = $1 AND workspace_id = $2 AND workspace_kind = 'team'
         AND state = 'active' AND role IN ('team:owner','team:admin')`,
      [row.tenant_id, row.workspace_id],
    );
    if (Number(result.rows[0]?.count ?? 0) <= 1) throw forbidden();
  }

  private async addOrRestoreMember(
    client: PoolClient,
    row: TeamRow,
    userId: string,
    role: TeamNonOwnerRole,
    now: string,
  ): Promise<void> {
    const current = await client.query<MemberRow>(
      `SELECT ${memberColumns}
       FROM membership JOIN app_user ON app_user.id = membership.user_id
       WHERE membership.workspace_id = $1 AND membership.user_id = $2
       FOR UPDATE OF membership`,
      [row.workspace_id, userId],
    );
    const existing = current.rows[0];
    if (existing && (existing.state === "active" || existing.state === "suspended")) {
      throw duplicate("The user already has a current team membership");
    }
    if (existing) {
      await client.query(
        `UPDATE membership SET role = $3, state = 'active', lock_version = lock_version + 1,
           updated_at = $4 WHERE id = $1 AND workspace_id = $2`,
        [existing.id, row.workspace_id, role, now],
      );
      return;
    }
    const id = parseMembershipId(this.ids.next("mem"));
    await client.query(
      `INSERT INTO membership (
         id, tenant_id, workspace_id, workspace_kind, user_id, role, state,
         lock_version, created_at, updated_at
       ) VALUES ($1,$2,$3,'team',$4,$5,'active',1,$6,$6)
       `,
      [id, row.tenant_id, row.workspace_id, userId, role, now],
    );
  }

  async create(
    body: CreateTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const requestHash = commandFingerprint({
      action: "team.created",
      actorUserId: context.actorUserId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context.tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        parseWorkspaceId,
      );
      if (replay) return replay;
      if (body.expected_version !== 0) {
        throw new ApiProblem(422, "VALIDATION", "A new team must expect version zero");
      }
      const name = body.name.trim();
      if (name.length < 1 || name.length > 200 || !isTeamKind(body.team_kind)) {
        throw new ApiProblem(422, "VALIDATION", "The team identity is invalid");
      }
      const joinMode = body.join_mode ?? "request";
      if (!teamJoinModes.includes(joinMode)) {
        throw new ApiProblem(422, "VALIDATION", "The team join mode is invalid");
      }
      const workspaceId = parseWorkspaceId(this.ids.next("wsp"));
      const membershipId = parseMembershipId(this.ids.next("mem"));
      const verificationId = parseVerificationId(this.ids.next("ver"));
      const now = this.clock.now().toISOString();
      await client.query(
        `INSERT INTO workspace (
           id, tenant_id, tenant_kind, kind, name, owner_user_id, team_kind,
           created_at, updated_at
         ) VALUES ($1,$2,'solver','team',$3,$4,$5,$6,$6)`,
        [workspaceId, context.tenantId, name, context.actorUserId, body.team_kind, now],
      );
      await client.query(
        `INSERT INTO team_workspace (
           workspace_id, tenant_id, status, join_mode, default_invitation_role,
           lock_version, created_at, updated_at
         ) VALUES ($1,$2,'active',$3,'team:contributor',1,$4,$4)`,
        [workspaceId, context.tenantId, joinMode, now],
      );
      await client.query(
        `INSERT INTO membership (
           id, tenant_id, workspace_id, workspace_kind, user_id, role, state,
           lock_version, created_at, updated_at
         ) VALUES ($1,$2,$3,'team',$4,'team:owner','active',1,$5,$5)`,
        [membershipId, context.tenantId, workspaceId, context.actorUserId, now],
      );
      await client.query(
        `INSERT INTO solver_workspace_profile (
           workspace_id, tenant_id, workspace_kind, applicant_type,
           lock_version, created_at, updated_at
         ) VALUES ($1,$2,'team',$3,1,$4,$4)`,
        [workspaceId, context.tenantId, body.team_kind, now],
      );
      await client.query(
        `INSERT INTO verification_record (
           id, tenant_id, workspace_id, state, lock_version, created_at, updated_at
         ) VALUES ($1,$2,$3,'not_started',1,$4,$4)`,
        [verificationId, context.tenantId, workspaceId, now],
      );
      return this.record(
        client,
        workspaceId,
        "team",
        1,
        context.tenantId,
        workspaceId,
        context,
        "team.created",
        ["switch_workspace"],
        requestHash,
        parseWorkspaceId,
        {},
        { owner_user_id: context.actorUserId },
      );
    });
  }

  async get(scope: WorkspaceScope): Promise<TeamResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const row = await this.findTeam(client, scope.tenantId, scope.workspaceId, "share");
      if (!row) return null;
      this.authorize(row, scope, "view-workspace");
      return this.resource(client, row);
    });
  }

  async updatePolicy(
    body: UpdateTeamPolicyBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const requestHash = commandFingerprint({
      action: "team.policy.updated",
      actorUserId: context.actorUserId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "manage-team-settings",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseWorkspaceId,
      );
      if (replay) return replay;
      if (body.expected_version !== Number(row.lock_version))
        throw staleVersion(Number(row.lock_version));
      if (!body.join_mode && !body.default_invitation_role && !body.policy) {
        throw new ApiProblem(422, "VALIDATION", "At least one policy field is required");
      }
      if (body.join_mode && !teamJoinModes.includes(body.join_mode)) throw forbidden();
      if (body.default_invitation_role && !isTeamNonOwnerRole(body.default_invitation_role))
        throw forbidden();
      const nextPolicy = { ...policy(row), ...body.policy };
      const result = await client.query<{ lock_version: number | string }>(
        `UPDATE team_workspace SET
           join_mode = COALESCE($3, join_mode),
           default_invitation_role = COALESCE($4, default_invitation_role),
           proposal_managers_can_edit_profile = $5,
           proposal_managers_can_invite = $6,
           admins_can_submit = $7,
           proposal_managers_can_submit = $8,
           viewers_can_read_messages = $9,
           admins_can_view_payments = $10,
           proposal_managers_can_view_payments = $11,
           approval_before_submit = $12,
           lock_version = lock_version + 1, updated_at = $13
         WHERE tenant_id = $1 AND workspace_id = $2
         RETURNING lock_version`,
        [
          tenantId,
          workspaceId,
          body.join_mode ?? null,
          body.default_invitation_role ?? null,
          nextPolicy.proposalManagersCanEditProfile,
          nextPolicy.proposalManagersCanInvite,
          nextPolicy.adminsCanSubmit,
          nextPolicy.proposalManagersCanSubmit,
          nextPolicy.viewersCanReadMessages,
          nextPolicy.adminsCanViewPayments,
          nextPolicy.proposalManagersCanViewPayments,
          nextPolicy.approvalBeforeSubmit,
          this.clock.now().toISOString(),
        ],
      );
      const version = Number(result.rows[0]!.lock_version);
      return this.record(
        client,
        workspaceId,
        "team",
        version,
        tenantId,
        workspaceId,
        context,
        "team.policy.updated",
        ["review_team"],
        requestHash,
        parseWorkspaceId,
        { reason: structuredReason(body.reason) },
      );
    });
  }

  async listInvitations(scope: WorkspaceScope): Promise<readonly TeamInvitationResource[]> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const row = await this.findTeam(client, scope.tenantId, scope.workspaceId, "share");
      if (!row) throw notFound();
      this.authorize(row, scope, "invite-member");
      const now = this.clock.now().toISOString();
      const result = await client.query<InvitationRow>(
        `SELECT ${invitationColumns}
         FROM team_invitation AS invitation
         JOIN workspace ON workspace.id = invitation.workspace_id
         WHERE invitation.tenant_id = $2 AND invitation.workspace_id = $3
         ORDER BY invitation.created_at DESC, invitation.id
         FOR SHARE OF invitation, workspace`,
        [now, row.tenant_id, row.workspace_id],
      );
      return result.rows.map(invitationResource);
    });
  }

  async invite(
    body: CreateTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const normalizedEmail = recipientEmail(body.recipient_email);
    const requestHash = commandFingerprint({
      action: "team.invitation.sent",
      actorUserId: context.actorUserId,
      body: { ...body, recipient_email: normalizedEmail },
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "invite-member",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamInvitationId,
      );
      if (replay) return replay;
      if (body.expected_version !== Number(row.lock_version))
        throw staleVersion(Number(row.lock_version));
      if (!isTeamNonOwnerRole(body.proposed_role)) throw forbidden();
      const now = this.clock.now().toISOString();
      await client.query(
        `UPDATE team_invitation SET state = 'expired', lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2 AND state IN ('sent','viewed') AND expires_at <= $3`,
        [tenantId, workspaceId, now],
      );
      const recipient = await client.query<{ id: string }>(
        `SELECT id FROM app_user WHERE primary_email = $1 AND email_verified = true FOR SHARE`,
        [normalizedEmail],
      );
      const recipientId = recipient.rows[0]?.id ?? null;
      if (recipientId) {
        const current = await client.query(
          `SELECT 1 FROM membership WHERE workspace_id = $1 AND user_id = $2
             AND state IN ('active','suspended')`,
          [workspaceId, recipientId],
        );
        if (current.rowCount)
          throw duplicate("The recipient already has a current team membership");
      }
      const duplicateInvitation = await client.query(
        `SELECT 1 FROM team_invitation WHERE workspace_id = $1 AND recipient_email = $2
           AND state IN ('sent','viewed')`,
        [workspaceId, normalizedEmail],
      );
      if (duplicateInvitation.rowCount)
        throw duplicate("A current invitation already exists for this recipient");
      const id = parseTeamInvitationId(this.ids.next("tiv"));
      await client.query(
        `INSERT INTO team_invitation (
           id, tenant_id, workspace_id, inviter_user_id, recipient_user_id,
           recipient_email, proposed_role, scope, message, commitment, ip_notice,
           state, lock_version, expires_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'sent',1,$12,$13,$13)`,
        [
          id,
          tenantId,
          workspaceId,
          context.actorUserId,
          recipientId,
          normalizedEmail,
          body.proposed_role,
          boundedText(body.scope, 1, 1_000, "invitation scope"),
          body.message.trim(),
          boundedText(body.commitment, 1, 1_000, "commitment"),
          boundedText(body.ip_notice, 1, 1_000, "IP notice"),
          new Date(Date.parse(now) + 14 * 24 * 60 * 60_000).toISOString(),
          now,
        ],
      );
      await client.query(
        `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2`,
        [tenantId, workspaceId, now],
      );
      return this.record(
        client,
        id,
        "team_invitation",
        1,
        tenantId,
        workspaceId,
        context,
        "team.invitation.sent",
        ["review_invitations"],
        requestHash,
        parseTeamInvitationId,
        {},
        { recipient_user_id: recipientId },
      );
    });
  }

  async revokeInvitation(
    invitationId: string,
    body: RevokeTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const id = parseTeamInvitationId(invitationId);
    const requestHash = commandFingerprint({
      action: "team.invitation.revoked",
      actorUserId: context.actorUserId,
      invitationId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "invite-member",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamInvitationId,
      );
      if (replay) return replay;
      const result = await client.query<{
        state: string;
        lock_version: number | string;
        expires_at: Date;
      }>(
        `SELECT state, lock_version, expires_at FROM team_invitation
         WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3 FOR UPDATE`,
        [id, row.tenant_id, row.workspace_id],
      );
      const invitation = result.rows[0];
      if (!invitation) throw notFound();
      const version = Number(invitation.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (
        !["sent", "viewed"].includes(invitation.state) ||
        invitation.expires_at <= this.clock.now()
      ) {
        throw invalidState(
          invitation.expires_at <= this.clock.now() ? "expired" : invitation.state,
        );
      }
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE team_invitation SET state = 'revoked', decision_reason = $2,
           lock_version = lock_version + 1, updated_at = $3 WHERE id = $1 RETURNING lock_version`,
        [id, structuredReason(body.reason), this.clock.now().toISOString()],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "team_invitation",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.invitation.revoked",
        ["review_invitations"],
        requestHash,
        parseTeamInvitationId,
        { reason: structuredReason(body.reason) },
      );
    });
  }

  async listIncomingInvitations(
    actorUserId: import("@rahhal/domain").UserId,
  ): Promise<readonly TeamInvitationResource[]> {
    return this.unitOfWork.run(async () => {
      const now = this.clock.now().toISOString();
      const result = await this.unitOfWork.currentClient().query<InvitationRow>(
        `SELECT ${invitationColumns}
         FROM team_invitation AS invitation
         JOIN workspace ON workspace.id = invitation.workspace_id
         JOIN team_workspace AS team ON team.workspace_id = invitation.workspace_id
                                      AND team.tenant_id = invitation.tenant_id
         JOIN app_user AS recipient ON recipient.id = $2
         WHERE team.status = 'active'
           AND recipient.email_verified = true
           AND (invitation.recipient_user_id = recipient.id
             OR (invitation.recipient_user_id IS NULL AND invitation.recipient_email = recipient.primary_email))
         ORDER BY invitation.created_at DESC, invitation.id
         FOR SHARE OF invitation, workspace, team, recipient`,
        [now, actorUserId],
      );
      return result.rows.map(invitationResource);
    });
  }

  async respondInvitation(
    invitationId: string,
    body: RespondTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>> {
    const id = parseTeamInvitationId(invitationId);
    const action =
      body.decision === "accept" ? "team.invitation.accepted" : "team.invitation.declined";
    const requestHash = commandFingerprint({
      action,
      actorUserId: context.actorUserId,
      invitationId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const target = await client.query<{ tenant_id: string; workspace_id: string }>(
        `SELECT invitation.tenant_id, invitation.workspace_id
         FROM team_invitation AS invitation
         JOIN team_workspace AS team ON team.workspace_id = invitation.workspace_id
                                      AND team.tenant_id = invitation.tenant_id
         JOIN app_user AS recipient ON recipient.id = $2
         WHERE invitation.id = $1 AND team.status = 'active'
           AND recipient.email_verified = true
           AND (invitation.recipient_user_id = recipient.id
             OR (invitation.recipient_user_id IS NULL
               AND invitation.recipient_email = recipient.primary_email))`,
        [id, context.actorUserId],
      );
      const invitationTarget = target.rows[0];
      if (!invitationTarget) throw notFound();
      const tenantId = parseTenantId(invitationTarget.tenant_id);
      const workspaceId = parseWorkspaceId(invitationTarget.workspace_id);
      // Team-changing commands take the aggregate lock before an invitation or
      // membership row so transfer/removal/acceptance cannot observe different
      // manager rosters or deadlock by taking the same rows in reverse order.
      const team = await this.findTeam(client, tenantId, workspaceId, "update");
      if (!team) throw notFound();
      const resolved = await client.query<InvitationRow>(
        `SELECT ${invitationColumns}
         FROM team_invitation AS invitation
         JOIN workspace ON workspace.id = invitation.workspace_id
         JOIN app_user AS recipient ON recipient.id = $2
         WHERE invitation.id = $3 AND invitation.tenant_id = $4
           AND invitation.workspace_id = $5
           AND recipient.email_verified = true
           AND (invitation.recipient_user_id = recipient.id
             OR (invitation.recipient_user_id IS NULL
               AND invitation.recipient_email = recipient.primary_email))
         FOR UPDATE OF invitation
         FOR SHARE OF recipient`,
        [this.clock.now().toISOString(), context.actorUserId, id, tenantId, workspaceId],
      );
      const invitation = resolved.rows[0];
      if (!invitation) throw notFound();
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamInvitationId,
      );
      if (replay) return replay;
      const version = Number(invitation.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (
        !["sent", "viewed"].includes(invitation.state) ||
        invitation.expires_at <= this.clock.now()
      ) {
        throw invalidState(
          invitation.expires_at <= this.clock.now() ? "expired" : invitation.state,
        );
      }
      if (body.decision === "decline" && !body.reason?.trim()) {
        throw new ApiProblem(422, "VALIDATION", "A decline reason is required");
      }
      const now = this.clock.now().toISOString();
      if (body.decision === "accept") {
        await this.addOrRestoreMember(
          client,
          team,
          context.actorUserId,
          invitation.proposed_role as TeamNonOwnerRole,
          now,
        );
        await client.query(
          `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
           WHERE tenant_id = $1 AND workspace_id = $2`,
          [tenantId, workspaceId, now],
        );
      }
      const update = await client.query<{ lock_version: number | string }>(
        `UPDATE team_invitation SET state = $2,
           recipient_user_id = COALESCE(recipient_user_id, $3), decision_reason = $4,
           lock_version = lock_version + 1, updated_at = $5
         WHERE id = $1 RETURNING lock_version`,
        [
          id,
          body.decision === "accept" ? "accepted" : "declined",
          context.actorUserId,
          body.decision === "decline" ? structuredReason(body.reason!) : null,
          now,
        ],
      );
      const nextVersion = Number(update.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "team_invitation",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        action,
        body.decision === "accept" ? ["switch_workspace"] : ["continue"],
        requestHash,
        parseTeamInvitationId,
        body.reason !== undefined ? { reason: structuredReason(body.reason) } : {},
        { recipient_user_id: context.actorUserId },
      );
    });
  }

  async requestMembership(
    teamWorkspaceId: string,
    body: CreateTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    const workspaceIdInput = parseWorkspaceId(teamWorkspaceId);
    const requestHash = commandFingerprint({
      action: "team.membership-request.created",
      actorUserId: context.actorUserId,
      workspaceId: workspaceIdInput,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const row = await this.findTeamByWorkspace(client, workspaceIdInput, "update");
      if (!row || row.join_mode === "invite-only") throw notFound();
      const tenantId = parseTenantId(row.tenant_id);
      const workspaceId = parseWorkspaceId(row.workspace_id);
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamMembershipRequestId,
      );
      if (replay) return replay;
      if (body.expected_version !== 0 || !isTeamNonOwnerRole(body.requested_role)) {
        throw new ApiProblem(422, "VALIDATION", "A new membership request is invalid");
      }
      const currentMembership = await client.query(
        `SELECT 1 FROM membership WHERE workspace_id = $1 AND user_id = $2
           AND state IN ('active','suspended')`,
        [workspaceId, context.actorUserId],
      );
      if (currentMembership.rowCount) throw notFound();
      const now = this.clock.now().toISOString();
      await client.query(
        `UPDATE team_membership_request SET state = 'expired', lock_version = lock_version + 1,
           updated_at = $3 WHERE workspace_id = $1 AND requester_user_id = $2
           AND state = 'requested' AND expires_at <= $3`,
        [workspaceId, context.actorUserId, now],
      );
      const duplicateRequest = await client.query(
        `SELECT 1 FROM team_membership_request WHERE workspace_id = $1
           AND requester_user_id = $2 AND state = 'requested'`,
        [workspaceId, context.actorUserId],
      );
      if (duplicateRequest.rowCount) throw duplicate("A current membership request already exists");
      const id = parseTeamMembershipRequestId(this.ids.next("tmr"));
      await client.query(
        `INSERT INTO team_membership_request (
           id, tenant_id, workspace_id, requester_user_id, requested_role,
           introduction, availability, state, lock_version, expires_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'requested',1,$8,$9,$9)`,
        [
          id,
          tenantId,
          workspaceId,
          context.actorUserId,
          body.requested_role,
          boundedText(body.introduction, 1, 2_000, "introduction"),
          boundedText(body.availability, 1, 1_000, "availability"),
          new Date(Date.parse(now) + 30 * 24 * 60 * 60_000).toISOString(),
          now,
        ],
      );
      return this.record(
        client,
        id,
        "team_membership_request",
        1,
        tenantId,
        workspaceId,
        context,
        "team.membership-request.created",
        ["continue"],
        requestHash,
        parseTeamMembershipRequestId,
        {},
        { requester_user_id: context.actorUserId },
      );
    });
  }

  async listMembershipRequests(
    scope: WorkspaceScope,
  ): Promise<readonly TeamMembershipRequestResource[]> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const row = await this.findTeam(client, scope.tenantId, scope.workspaceId, "share");
      if (!row) throw notFound();
      this.authorize(row, scope, "review-membership-request");
      const result = await client.query<RequestRow>(
        `SELECT ${requestColumns}
         FROM team_membership_request AS request
         JOIN workspace ON workspace.id = request.workspace_id
         JOIN app_user ON app_user.id = request.requester_user_id
         WHERE request.tenant_id = $2 AND request.workspace_id = $3
         ORDER BY request.created_at DESC, request.id
         FOR SHARE OF request, workspace, app_user`,
        [this.clock.now().toISOString(), row.tenant_id, row.workspace_id],
      );
      return result.rows.map(requestResource);
    });
  }

  async decideMembershipRequest(
    requestId: string,
    body: DecideTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    const id = parseTeamMembershipRequestId(requestId);
    const action =
      body.decision === "accept"
        ? "team.membership-request.accepted"
        : "team.membership-request.rejected";
    const requestHash = commandFingerprint({
      action,
      actorUserId: context.actorUserId,
      requestId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "review-membership-request",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamMembershipRequestId,
      );
      if (replay) return replay;
      const result = await client.query<{
        state: string;
        lock_version: number | string;
        expires_at: Date;
        requester_user_id: string;
      }>(
        `SELECT state, lock_version, expires_at, requester_user_id
         FROM team_membership_request WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
         FOR UPDATE`,
        [id, tenantId, workspaceId],
      );
      const membershipRequest = result.rows[0];
      if (!membershipRequest) throw notFound();
      const version = Number(membershipRequest.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (
        membershipRequest.state !== "requested" ||
        membershipRequest.expires_at <= this.clock.now()
      ) {
        throw invalidState(
          membershipRequest.expires_at <= this.clock.now() ? "expired" : membershipRequest.state,
        );
      }
      if (
        body.decision === "accept" &&
        (!body.assigned_role || !isTeamNonOwnerRole(body.assigned_role))
      ) {
        throw new ApiProblem(422, "VALIDATION", "An assigned role is required");
      }
      const now = this.clock.now().toISOString();
      if (body.decision === "accept") {
        await this.addOrRestoreMember(
          client,
          row,
          membershipRequest.requester_user_id,
          body.assigned_role!,
          now,
        );
        await client.query(
          `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
           WHERE tenant_id = $1 AND workspace_id = $2`,
          [tenantId, workspaceId, now],
        );
      }
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE team_membership_request SET state = $2, assigned_role = $3,
           reviewed_by_user_id = $4, decision_reason = $5,
           lock_version = lock_version + 1, updated_at = $6 WHERE id = $1
         RETURNING lock_version`,
        [
          id,
          body.decision === "accept" ? "accepted" : "rejected",
          body.decision === "accept" ? body.assigned_role : null,
          context.actorUserId,
          structuredReason(body.reason),
          now,
        ],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "team_membership_request",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        action,
        ["review_membership_requests"],
        requestHash,
        parseTeamMembershipRequestId,
        { reason: structuredReason(body.reason) },
        { requester_user_id: membershipRequest.requester_user_id },
      );
    });
  }

  async listOwnMembershipRequests(
    actorUserId: import("@rahhal/domain").UserId,
  ): Promise<readonly TeamMembershipRequestResource[]> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<RequestRow>(
        `SELECT ${requestColumns}
         FROM team_membership_request AS request
         JOIN workspace ON workspace.id = request.workspace_id
         JOIN team_workspace AS team ON team.workspace_id = request.workspace_id
                                      AND team.tenant_id = request.tenant_id
         JOIN app_user ON app_user.id = request.requester_user_id
         WHERE request.requester_user_id = $2
         ORDER BY request.created_at DESC, request.id
         FOR SHARE OF request, workspace, team, app_user`,
        [this.clock.now().toISOString(), actorUserId],
      );
      return result.rows.map(requestResource);
    });
  }

  async withdrawMembershipRequest(
    requestId: string,
    body: WithdrawTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>> {
    const id = parseTeamMembershipRequestId(requestId);
    const requestHash = commandFingerprint({
      action: "team.membership-request.withdrawn",
      actorUserId: context.actorUserId,
      requestId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<{
        tenant_id: string;
        workspace_id: string;
        state: string;
        lock_version: number | string;
        expires_at: Date;
      }>(
        `SELECT request.tenant_id, request.workspace_id, request.state,
                request.lock_version, request.expires_at
         FROM team_membership_request AS request
         JOIN team_workspace AS team ON team.workspace_id = request.workspace_id
                                      AND team.tenant_id = request.tenant_id
         WHERE request.id = $1 AND request.requester_user_id = $2 AND team.status = 'active'
         FOR UPDATE OF request, team`,
        [id, context.actorUserId],
      );
      const membershipRequest = result.rows[0];
      if (!membershipRequest) throw notFound();
      const tenantId = parseTenantId(membershipRequest.tenant_id);
      const workspaceId = parseWorkspaceId(membershipRequest.workspace_id);
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseTeamMembershipRequestId,
      );
      if (replay) return replay;
      const version = Number(membershipRequest.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (
        membershipRequest.state !== "requested" ||
        membershipRequest.expires_at <= this.clock.now()
      ) {
        throw invalidState(
          membershipRequest.expires_at <= this.clock.now() ? "expired" : membershipRequest.state,
        );
      }
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE team_membership_request SET state = 'withdrawn', decision_reason = $2,
           lock_version = lock_version + 1, updated_at = $3 WHERE id = $1 RETURNING lock_version`,
        [id, structuredReason(body.reason), this.clock.now().toISOString()],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "team_membership_request",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.membership-request.withdrawn",
        ["continue"],
        requestHash,
        parseTeamMembershipRequestId,
        { reason: structuredReason(body.reason) },
        { requester_user_id: context.actorUserId },
      );
    });
  }

  async changeMemberRole(
    membershipId: string,
    body: ChangeTeamMemberRoleBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const id = parseMembershipId(membershipId);
    const requestHash = commandFingerprint({
      action: "team.member.role-changed",
      actorUserId: context.actorUserId,
      membershipId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "change-member-role",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseMembershipId,
      );
      if (replay) return replay;
      const member = await this.findMember(client, row, id);
      if (!member) throw notFound();
      const version = Number(member.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (member.state !== "active") throw invalidState(member.state);
      if (member.role === teamRole.owner || !isTeamNonOwnerRole(body.role)) throw forbidden();
      if (member.role === teamRole.admin && body.role !== teamRole.admin) {
        await this.ensureRemovable(client, row, member);
      }
      const now = this.clock.now().toISOString();
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE membership SET role = $2, lock_version = lock_version + 1, updated_at = $3
         WHERE id = $1 RETURNING lock_version`,
        [id, body.role, now],
      );
      await client.query(
        `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2`,
        [tenantId, workspaceId, now],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "membership",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.member.role-changed",
        ["review_team"],
        requestHash,
        parseMembershipId,
        { reason: structuredReason(body.reason), previous_role: member.role, role: body.role },
        { user_id: member.user_id },
      );
    });
  }

  private async changeMemberState(
    membershipId: string,
    body: ChangeTeamMemberStateBody,
    context: WorkspaceCommandContext,
    command: "suspend" | "restore" | "remove",
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const id = parseMembershipId(membershipId);
    const action = `team.member.${command === "remove" ? "removed" : command === "suspend" ? "suspended" : "restored"}`;
    const requestHash = commandFingerprint({
      action,
      actorUserId: context.actorUserId,
      membershipId,
      body,
    });
    return this.unitOfWork.run(async () => {
      // Locking this one team row first serializes every manager-count change.
      // A concurrent removal cannot evaluate the same pre-removal roster.
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "change-member-role",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseMembershipId,
      );
      if (replay) return replay;
      const member = await this.findMember(client, row, id);
      if (!member) throw notFound();
      const version = Number(member.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (command === "restore") {
        if (member.state !== "suspended") throw invalidState(member.state);
      } else {
        if (member.state !== "active") throw invalidState(member.state);
        await this.ensureRemovable(client, row, member);
        if (member.user_id === context.actorUserId) throw leaveActionRequired();
      }
      const state =
        command === "restore" ? "active" : command === "suspend" ? "suspended" : "removed";
      const now = this.clock.now().toISOString();
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE membership SET state = $2, lock_version = lock_version + 1, updated_at = $3
         WHERE id = $1 RETURNING lock_version`,
        [id, state, now],
      );
      await client.query(
        `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2`,
        [tenantId, workspaceId, now],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        id,
        "membership",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        action,
        ["review_team"],
        requestHash,
        parseMembershipId,
        { reason: structuredReason(body.reason), previous_state: member.state, state },
        { user_id: member.user_id },
      );
    });
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
    const requestHash = commandFingerprint({
      action: "team.ownership.transferred",
      actorUserId: context.actorUserId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "transfer-ownership",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseWorkspaceId,
      );
      if (replay) return replay;
      const teamVersion = Number(row.lock_version);
      if (body.expected_version !== teamVersion) throw staleVersion(teamVersion);
      const roster = await client.query<MemberRow>(
        `SELECT ${memberColumns}
         FROM membership JOIN app_user ON app_user.id = membership.user_id
         WHERE membership.tenant_id = $1 AND membership.workspace_id = $2
           AND membership.workspace_kind = 'team'
           AND (membership.role = 'team:owner' OR membership.id = $3)
         ORDER BY membership.id FOR UPDATE OF membership`,
        [tenantId, workspaceId, body.successor_membership_id],
      );
      const owner = roster.rows.find(
        (member) => member.role === teamRole.owner && member.state === "active",
      );
      const successor = roster.rows.find((member) => member.id === body.successor_membership_id);
      if (!owner || !successor || successor.state !== "active" || successor.role === teamRole.owner)
        throw notFound();
      const now = this.clock.now().toISOString();
      // Demote first to satisfy the immediate unique owner index; the deferred
      // owner-consistency triggers validate the complete swap at commit.
      await client.query(
        `UPDATE membership SET role = 'team:admin', lock_version = lock_version + 1,
           updated_at = $2 WHERE id = $1`,
        [owner.id, now],
      );
      await client.query(
        `UPDATE membership SET role = 'team:owner', lock_version = lock_version + 1,
           updated_at = $2 WHERE id = $1`,
        [successor.id, now],
      );
      await client.query(
        `UPDATE workspace SET owner_user_id = $3, updated_at = $4
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, workspaceId, successor.user_id, now],
      );
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2 RETURNING lock_version`,
        [tenantId, workspaceId, now],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        workspaceId,
        "team",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.ownership.transferred",
        ["review_team"],
        requestHash,
        parseWorkspaceId,
        {
          reason: structuredReason(body.reason),
          previous_owner_user_id: owner.user_id,
          owner_user_id: successor.user_id,
        },
        { previous_owner_user_id: owner.user_id, owner_user_id: successor.user_id },
      );
    });
  }

  async leave(
    body: LeaveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>> {
    const requestHash = commandFingerprint({
      action: "team.member.left",
      actorUserId: context.actorUserId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(context, "leave-team");
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const selfResult = await client.query<MemberRow>(
        `SELECT ${memberColumns}
         FROM membership JOIN app_user ON app_user.id = membership.user_id
         WHERE membership.tenant_id = $1 AND membership.workspace_id = $2
           AND membership.user_id = $3 AND membership.workspace_kind = 'team'
         FOR UPDATE OF membership`,
        [tenantId, workspaceId, context.actorUserId],
      );
      const self = selfResult.rows[0];
      if (!self) throw notFound();
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseMembershipId,
      );
      if (replay) return replay;
      const version = Number(self.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      if (self.state !== "active") throw invalidState(self.state);
      await this.ensureRemovable(client, row, self);
      const now = this.clock.now().toISOString();
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE membership SET state = 'removed', lock_version = lock_version + 1,
           updated_at = $2 WHERE id = $1 RETURNING lock_version`,
        [self.id, now],
      );
      await client.query(
        `UPDATE team_workspace SET lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2`,
        [tenantId, workspaceId, now],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        parseMembershipId(self.id),
        "membership",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.member.left",
        ["switch_workspace"],
        requestHash,
        parseMembershipId,
        { reason: structuredReason(body.reason) },
        { user_id: context.actorUserId },
      );
    });
  }

  async archive(
    body: ArchiveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>> {
    const requestHash = commandFingerprint({
      action: "team.archived",
      actorUserId: context.actorUserId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const { client, row, tenantId, workspaceId } = await this.teamCommand(
        context,
        "archive-team",
      );
      await this.lockIdempotency(client, tenantId, context.idempotencyKey);
      const replay = await this.replay(
        client,
        tenantId,
        context.idempotencyKey,
        requestHash,
        parseWorkspaceId,
      );
      if (replay) return replay;
      const version = Number(row.lock_version);
      if (body.expected_version !== version) throw staleVersion(version);
      const updated = await client.query<{ lock_version: number | string }>(
        `UPDATE team_workspace SET status = 'archived', archived_at = $3,
           archived_by_user_id = $4, archive_reason = $5,
           lock_version = lock_version + 1, updated_at = $3
         WHERE tenant_id = $1 AND workspace_id = $2 RETURNING lock_version`,
        [
          tenantId,
          workspaceId,
          this.clock.now().toISOString(),
          context.actorUserId,
          structuredReason(body.reason),
        ],
      );
      const nextVersion = Number(updated.rows[0]!.lock_version);
      return this.record(
        client,
        workspaceId,
        "team",
        nextVersion,
        tenantId,
        workspaceId,
        context,
        "team.archived",
        ["switch_workspace"],
        requestHash,
        parseWorkspaceId,
        { reason: structuredReason(body.reason) },
      );
    });
  }
}
