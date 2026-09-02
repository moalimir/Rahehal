import type { SolverTeam, TeamMembership, TeamRole } from "@/domain/solver";
import {
  canRemoveTeamMembership,
  decideTeamPermission,
  teamRole,
  type TeamAction,
  type TeamPermissionContext,
  type TeamPermissionDecision,
} from "@rahhal/domain";

export { decideTeamPermission };
export type { TeamAction };
export type PermissionContext = TeamPermissionContext;
export type PermissionDecision = TeamPermissionDecision;

const denied = (reason: string): PermissionDecision => ({ allowed: false, reason });

export function activeMembershipFor(memberships: TeamMembership[], teamId: string, userId: string) {
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
  [teamRole.owner]: "مالک تیم",
  [teamRole.admin]: "مدیر",
  [teamRole.proposalManager]: "مدیر پیشنهاد",
  [teamRole.contributor]: "همکار",
  [teamRole.viewer]: "مشاهده‌گر",
};

export function canRemoveMembership(
  memberships: TeamMembership[],
  target: TeamMembership,
): PermissionDecision {
  return canRemoveTeamMembership(
    memberships.map((membership) => ({
      workspaceId: membership.teamId,
      role: membership.role,
      state: membership.state,
    })),
    { workspaceId: target.teamId, role: target.role },
  );
}
