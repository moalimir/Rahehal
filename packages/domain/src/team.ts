import type { TeamInvitationId, TeamMembershipRequestId } from "./id.js";
import { teamRole, type Membership, type TeamRole } from "./workspace.js";

export const teamStatuses = ["active", "archived"] as const;
export type TeamStatus = (typeof teamStatuses)[number];

export const teamInvitationStates = [
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "revoked",
] as const;
export type TeamInvitationState = (typeof teamInvitationStates)[number];

export const teamMembershipRequestStates = [
  "requested",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
] as const;
export type TeamMembershipRequestState = (typeof teamMembershipRequestStates)[number];

export const teamOutboxEventTypes = [
  "team.created",
  "team.policy.updated",
  "team.invitation.sent",
  "team.invitation.revoked",
  "team.invitation.accepted",
  "team.invitation.declined",
  "team.membership-request.created",
  "team.membership-request.withdrawn",
  "team.membership-request.accepted",
  "team.membership-request.rejected",
  "team.member.role-changed",
  "team.member.suspended",
  "team.member.restored",
  "team.member.removed",
  "team.member.left",
  "team.ownership.transferred",
  "team.archived",
] as const;
export type TeamOutboxEventType = (typeof teamOutboxEventTypes)[number];

export type TeamNonOwnerRole = Exclude<TeamRole, "team:owner">;

export const teamNonOwnerRoles = [
  teamRole.admin,
  teamRole.proposalManager,
  teamRole.contributor,
  teamRole.viewer,
] as const satisfies readonly TeamNonOwnerRole[];

/**
 * Workspace-owned switches that narrow the canonical team-role matrix. These
 * switches never grant an action outside that matrix.
 */
export type TeamPolicy = {
  readonly proposalManagersCanEditProfile: boolean;
  readonly proposalManagersCanInvite: boolean;
  readonly adminsCanSubmit: boolean;
  readonly proposalManagersCanSubmit: boolean;
  readonly viewersCanReadMessages: boolean;
  readonly adminsCanViewPayments: boolean;
  readonly proposalManagersCanViewPayments: boolean;
  readonly approvalBeforeSubmit: boolean;
};

export const DEFAULT_TEAM_POLICY: TeamPolicy = {
  proposalManagersCanEditProfile: true,
  proposalManagersCanInvite: false,
  adminsCanSubmit: true,
  proposalManagersCanSubmit: true,
  viewersCanReadMessages: true,
  adminsCanViewPayments: true,
  proposalManagersCanViewPayments: true,
  approvalBeforeSubmit: false,
};

export const teamActions = [
  "view-workspace",
  "edit-team-profile",
  "invite-member",
  "review-membership-request",
  "change-member-role",
  "transfer-ownership",
  "create-proposal",
  "edit-proposal",
  "submit-proposal",
  "view-case-messages",
  "view-payments",
  "manage-team-settings",
  "archive-team",
  "leave-team",
  "approve-contract",
] as const;
export type TeamAction = (typeof teamActions)[number];

export type TeamPermissionContext = {
  readonly role: TeamRole;
  readonly policy: TeamPolicy;
  readonly assigned?: boolean;
  readonly isSelf?: boolean;
};

export type TeamPermissionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const denied = (reason: string): TeamPermissionDecision => ({ allowed: false, reason });

/** Canonical team-role decision matrix, ported from the established solver prototype. */
export function decideTeamPermission(
  action: TeamAction,
  { role, policy, assigned = false }: TeamPermissionContext,
): TeamPermissionDecision {
  if (action === "view-workspace" || action === "leave-team") return { allowed: true };
  if (role === teamRole.owner) return { allowed: true };
  if (action === "transfer-ownership" || action === "archive-team") {
    return denied("فقط مالک تیم می‌تواند این اقدام را انجام دهد.");
  }
  if (action === "edit-team-profile") {
    if (
      role === teamRole.admin ||
      (role === teamRole.proposalManager && policy.proposalManagersCanEditProfile)
    ) {
      return { allowed: true };
    }
    return denied("ویرایش پروفایل تیم به مالک، مدیر یا نقش مجاز در سیاست تیم محدود است.");
  }
  if (action === "invite-member") {
    if (
      role === teamRole.admin ||
      (role === teamRole.proposalManager && policy.proposalManagersCanInvite)
    ) {
      return { allowed: true };
    }
    return denied("دعوت عضو برای نقش فعلی شما مجاز نیست.");
  }
  if (action === "review-membership-request") {
    return role === teamRole.admin
      ? { allowed: true }
      : denied("فقط مالک یا مدیر درخواست عضویت را بررسی می‌کند.");
  }
  if (action === "change-member-role") {
    return role === teamRole.admin
      ? { allowed: true }
      : denied("تغییر نقش اعضا برای نقش فعلی شما مجاز نیست.");
  }
  if (action === "create-proposal") {
    return role === teamRole.viewer
      ? denied("نقش مشاهده‌گر اجازه ساخت پیشنهاد ندارد.")
      : { allowed: true };
  }
  if (action === "edit-proposal") {
    if (
      role === teamRole.admin ||
      role === teamRole.proposalManager ||
      (role === teamRole.contributor && assigned)
    ) {
      return { allowed: true };
    }
    return denied("ویرایش این پیشنهاد به اعضای تخصیص‌یافته یا مدیران محدود است.");
  }
  if (action === "submit-proposal") {
    if (role === teamRole.admin && policy.adminsCanSubmit) return { allowed: true };
    if (role === teamRole.proposalManager && policy.proposalManagersCanSubmit) {
      return { allowed: true };
    }
    return denied(
      "ارسال نهایی برای نقش شما مجاز نیست؛ از مالک یا ارسال‌کننده مجاز بخواهید نسخه را ثبت کند.",
    );
  }
  if (action === "view-case-messages") {
    if (
      role === teamRole.admin ||
      role === teamRole.proposalManager ||
      (role === teamRole.contributor && assigned)
    ) {
      return { allowed: true };
    }
    if (role === teamRole.viewer && policy.viewersCanReadMessages) return { allowed: true };
    return denied("دسترسی پیام‌های پرونده به اعضای تخصیص‌یافته محدود است.");
  }
  if (action === "view-payments") {
    if (role === teamRole.admin && policy.adminsCanViewPayments) return { allowed: true };
    if (role === teamRole.proposalManager && policy.proposalManagersCanViewPayments) {
      return { allowed: true };
    }
    return denied("اطلاعات مالی برای نقش فعلی شما قابل مشاهده نیست.");
  }
  if (action === "manage-team-settings") {
    return role === teamRole.admin
      ? { allowed: true }
      : denied("تنظیمات تیم به مالک و مدیر محدود است.");
  }
  if (action === "approve-contract") {
    return role === teamRole.admin
      ? { allowed: true }
      : denied("تأیید قرارداد به مالک یا مدیر مجاز محدود است.");
  }
  return denied("این اقدام برای نقش فعلی تعریف نشده است.");
}

export function canRemoveTeamMembership<ScopeId extends string>(
  memberships: readonly {
    readonly workspaceId: ScopeId;
    readonly role: TeamRole;
    readonly state: Membership["state"];
  }[],
  target: { readonly workspaceId: ScopeId; readonly role: TeamRole },
): TeamPermissionDecision {
  const activeManagers = memberships.filter(
    (membership) =>
      membership.workspaceId === target.workspaceId &&
      membership.state === "active" &&
      (membership.role === teamRole.owner || membership.role === teamRole.admin),
  );
  if (target.role === teamRole.owner) {
    return denied("مالک فقط پس از انتقال مالکیت قابل حذف است.");
  }
  if (target.role === teamRole.admin && activeManagers.length <= 1) {
    return denied("آخرین مدیر مجاز تیم قابل حذف نیست.");
  }
  return { allowed: true };
}

export type TeamInvitation = {
  readonly id: TeamInvitationId;
  readonly workspaceId: import("./id.js").WorkspaceId;
  readonly inviterUserId: import("./id.js").UserId;
  readonly recipientUserId: import("./id.js").UserId | null;
  readonly recipientEmail: string;
  readonly proposedRole: TeamNonOwnerRole;
  readonly scope: string;
  readonly message: string;
  readonly commitment: string;
  readonly ipNotice: string;
  readonly state: TeamInvitationState;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TeamMembershipRequest = {
  readonly id: TeamMembershipRequestId;
  readonly workspaceId: import("./id.js").WorkspaceId;
  readonly requesterUserId: import("./id.js").UserId;
  readonly requestedRole: TeamNonOwnerRole;
  readonly introduction: string;
  readonly availability: string;
  readonly state: TeamMembershipRequestState;
  readonly decisionReason: string | null;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function isTeamStatus(value: unknown): value is TeamStatus {
  return teamStatuses.includes(value as TeamStatus);
}

export function isTeamInvitationState(value: unknown): value is TeamInvitationState {
  return teamInvitationStates.includes(value as TeamInvitationState);
}

export function isTeamMembershipRequestState(value: unknown): value is TeamMembershipRequestState {
  return teamMembershipRequestStates.includes(value as TeamMembershipRequestState);
}

export function isTeamNonOwnerRole(value: unknown): value is TeamNonOwnerRole {
  return teamNonOwnerRoles.includes(value as TeamNonOwnerRole);
}
