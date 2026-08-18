import type { ActiveWorkspace } from "@/domain/solver";
import { permissionForMembership, type TeamAction } from "@/lib/solver/permissions";
import { readSolverState } from "@/lib/solver/repository/storage";

export function activeWorkspaces(state = readSolverState()): ActiveWorkspace[] {
  const workspaces: ActiveWorkspace[] = [
    { type: "individual", workspaceId: state.personalWorkspace.id },
  ];
  for (const membership of state.memberships) {
    if (membership.userId !== state.currentUser.id || membership.state !== "active") continue;
    const team = state.teams.find(
      (candidate) => candidate.id === membership.teamId && candidate.status === "active",
    );
    if (team)
      workspaces.push({
        type: "team",
        workspaceId: team.workspaceId,
        teamId: team.id,
        membershipId: membership.id,
      });
  }
  return workspaces;
}

export function teamPermission(
  context: ActiveWorkspace,
  action: TeamAction,
  options: { assigned?: boolean } = {},
  state = readSolverState(),
) {
  if (context.type === "individual") return { allowed: true as const };
  const team = state.teams.find((candidate) => candidate.id === context.teamId);
  const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
  if (!team) return { allowed: false as const, reason: "تیم پیدا نشد." };
  if (team.workspaceId !== context.workspaceId)
    return { allowed: false as const, reason: "فضای کاری با تیم فعال سازگار نیست." };
  if (membership?.userId !== state.currentUser.id)
    return { allowed: false as const, reason: "عضویت انتخاب‌شده متعلق به کاربر جاری نیست." };
  return permissionForMembership(action, team, membership, options);
}
