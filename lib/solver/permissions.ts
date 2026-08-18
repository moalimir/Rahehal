import type { SolverTeam, TeamMembership, TeamPolicy, TeamRole } from "@/domain/solver";

export type TeamAction =
  | "view-workspace"
  | "edit-team-profile"
  | "invite-member"
  | "review-membership-request"
  | "change-member-role"
  | "transfer-ownership"
  | "create-proposal"
  | "edit-proposal"
  | "submit-proposal"
  | "view-case-messages"
  | "view-payments"
  | "manage-team-settings"
  | "archive-team"
  | "leave-team"
  | "approve-contract";

export type PermissionContext = {
  role: TeamRole;
  policy: TeamPolicy;
  assigned?: boolean;
  isSelf?: boolean;
};

export type PermissionDecision = { allowed: true } | { allowed: false; reason: string };

const denied = (reason: string): PermissionDecision => ({ allowed: false, reason });

export function decideTeamPermission(
  action: TeamAction,
  { role, policy, assigned = false }: PermissionContext,
): PermissionDecision {
  if (action === "view-workspace" || action === "leave-team") return { allowed: true };
  if (role === "owner") return { allowed: true };
  if (action === "transfer-ownership" || action === "archive-team")
    return denied("فقط مالک تیم می‌تواند این اقدام را انجام دهد.");
  if (action === "edit-team-profile") {
    if (role === "admin" || (role === "proposal-manager" && policy.proposalManagersCanEditProfile))
      return { allowed: true };
    return denied("ویرایش پروفایل تیم به مالک، مدیر یا نقش مجاز در سیاست تیم محدود است.");
  }
  if (action === "invite-member") {
    if (role === "admin" || (role === "proposal-manager" && policy.proposalManagersCanInvite))
      return { allowed: true };
    return denied("دعوت عضو برای نقش فعلی شما مجاز نیست.");
  }
  if (action === "review-membership-request")
    return role === "admin" ? { allowed: true } : denied("فقط مالک یا مدیر درخواست عضویت را بررسی می‌کند.");
  if (action === "change-member-role")
    return role === "admin" ? { allowed: true } : denied("تغییر نقش اعضا برای نقش فعلی شما مجاز نیست.");
  if (action === "create-proposal")
    return role === "viewer" ? denied("نقش مشاهده‌گر اجازه ساخت پیشنهاد ندارد.") : { allowed: true };
  if (action === "edit-proposal") {
    if (role === "admin" || role === "proposal-manager" || (role === "contributor" && assigned))
      return { allowed: true };
    return denied("ویرایش این پیشنهاد به اعضای تخصیص‌یافته یا مدیران محدود است.");
  }
  if (action === "submit-proposal") {
    if (role === "admin" && policy.adminsCanSubmit) return { allowed: true };
    if (role === "proposal-manager" && policy.proposalManagersCanSubmit) return { allowed: true };
    return denied("ارسال نهایی برای نقش شما مجاز نیست؛ از مالک یا ارسال‌کننده مجاز بخواهید نسخه را ثبت کند.");
  }
  if (action === "view-case-messages") {
    if (role === "admin" || role === "proposal-manager" || (role === "contributor" && assigned))
      return { allowed: true };
    if (role === "viewer" && policy.viewersCanReadMessages) return { allowed: true };
    return denied("دسترسی پیام‌های پرونده به اعضای تخصیص‌یافته محدود است.");
  }
  if (action === "view-payments") {
    if (role === "admin" && policy.adminsCanViewPayments) return { allowed: true };
    if (role === "proposal-manager" && policy.proposalManagersCanViewPayments)
      return { allowed: true };
    return denied("اطلاعات مالی برای نقش فعلی شما قابل مشاهده نیست.");
  }
  if (action === "manage-team-settings")
    return role === "admin" ? { allowed: true } : denied("تنظیمات تیم به مالک و مدیر محدود است.");
  if (action === "approve-contract")
    return role === "admin" ? { allowed: true } : denied("تأیید قرارداد به مالک یا مدیر مجاز محدود است.");
  return denied("این اقدام برای نقش فعلی تعریف نشده است.");
}

export function activeMembershipFor(
  memberships: TeamMembership[],
  teamId: string,
  userId: string,
) {
  return memberships.find(
    (membership) =>
      membership.teamId === teamId && membership.userId === userId && membership.state === "active",
  );
}

export function permissionForMembership(
  action: TeamAction,
  team: SolverTeam,
  membership: TeamMembership | undefined,
  options: { assigned?: boolean } = {},
): PermissionDecision {
  if (!membership || membership.teamId !== team.id || membership.state !== "active")
    return denied("عضویت فعال در این تیم پیدا نشد.");
  return decideTeamPermission(action, {
    role: membership.role,
    policy: team.policy,
    assigned: options.assigned,
  });
}

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "مالک تیم",
  admin: "مدیر",
  "proposal-manager": "مدیر پیشنهاد",
  contributor: "همکار",
  viewer: "مشاهده‌گر",
};

export function canRemoveMembership(
  memberships: TeamMembership[],
  target: TeamMembership,
): PermissionDecision {
  const activeManagers = memberships.filter(
    (membership) =>
      membership.teamId === target.teamId &&
      membership.state === "active" &&
      (membership.role === "owner" || membership.role === "admin"),
  );
  if (target.role === "owner") return denied("مالک فقط پس از انتقال مالکیت قابل حذف است.");
  if (target.role === "admin" && activeManagers.length <= 1)
    return denied("آخرین مدیر مجاز تیم قابل حذف نیست.");
  return { allowed: true };
}
