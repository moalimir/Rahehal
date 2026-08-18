import {
  CURRENT_SOLVER_USER_ID,
  PERSONAL_WORKSPACE_ID,
  createCanonicalSolverState,
} from "@/data/solver-fixtures";
import type { ActiveWorkspace, SolverState } from "@/domain/solver";
import { activeMembershipFor } from "@/lib/solver/permissions";

export type SolverContextError = "invalid" | "not-found" | "no-access";
export type SolverContextResolution =
  | { ok: true; context: ActiveWorkspace }
  | { ok: false; error: SolverContextError; message: string; requestedTeamId?: string };

export const DEFAULT_SOLVER_CONTEXT: ActiveWorkspace = {
  type: "individual",
  workspaceId: PERSONAL_WORKSPACE_ID,
};

function sourceParams(source?: string | URLSearchParams): URLSearchParams {
  if (source instanceof URLSearchParams) return new URLSearchParams(source);
  if (!source) return new URLSearchParams();
  const hashQuery = source.includes("#") ? source.slice(source.indexOf("#") + 1) : source;
  const query = hashQuery.includes("?") ? hashQuery.slice(hashQuery.indexOf("?") + 1) : hashQuery;
  return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
}

export function parseSolverContext(
  source?: string | URLSearchParams,
  state: Pick<
    SolverState,
    "currentUser" | "personalWorkspace" | "teams" | "memberships"
  > = createCanonicalSolverState(),
): SolverContextResolution {
  const params = sourceParams(source);
  const space = params.get("space");
  if (!space || space === "individual") {
    const requestedWorkspace = params.get("workspaceId");
    if (requestedWorkspace && requestedWorkspace !== state.personalWorkspace.id)
      return { ok: false, error: "not-found", message: "فضای شخصی درخواست‌شده پیدا نشد." };
    return { ok: true, context: { type: "individual", workspaceId: state.personalWorkspace.id } };
  }
  if (space !== "team")
    return { ok: false, error: "invalid", message: "نوع فضای کاری معتبر نیست." };
  const teamId = params.get("teamId") || undefined;
  const requestedWorkspace = params.get("workspaceId") || undefined;
  if (!teamId) {
    if (!requestedWorkspace)
      return {
        ok: false,
        error: "invalid",
        message: "برای فضای تیمی، teamId یا workspaceId الزامی است.",
      };
    const byWorkspace = state.teams.find((team) => team.workspaceId === requestedWorkspace);
    if (!byWorkspace)
      return { ok: false, error: "not-found", message: "تیمی برای فضای درخواست‌شده پیدا نشد." };
    const membership = activeMembershipFor(state.memberships, byWorkspace.id, state.currentUser.id);
    if (!membership)
      return {
        ok: false,
        error: "no-access",
        requestedTeamId: byWorkspace.id,
        message: "عضویت فعال برای این تیم وجود ندارد.",
      };
    return {
      ok: true,
      context: {
        type: "team",
        teamId: byWorkspace.id,
        workspaceId: byWorkspace.workspaceId,
        membershipId: membership.id,
      },
    };
  }
  const team = state.teams.find((candidate) => candidate.id === teamId);
  if (!team)
    return {
      ok: false,
      error: "not-found",
      requestedTeamId: teamId,
      message: "تیم درخواست‌شده پیدا نشد.",
    };
  if (requestedWorkspace && requestedWorkspace !== team.workspaceId)
    return {
      ok: false,
      error: "invalid",
      requestedTeamId: teamId,
      message: "شناسه تیم و فضای کاری با یکدیگر سازگار نیستند.",
    };
  const membership = activeMembershipFor(state.memberships, team.id, state.currentUser.id);
  if (!membership || team.status !== "active")
    return {
      ok: false,
      error: "no-access",
      requestedTeamId: teamId,
      message: "به این فضای تیمی دسترسی فعال ندارید.",
    };
  return {
    ok: true,
    context: {
      type: "team",
      teamId: team.id,
      workspaceId: team.workspaceId,
      membershipId: membership.id,
    },
  };
}

export function solverContextParams(context: ActiveWorkspace) {
  const params = new URLSearchParams();
  params.set("space", context.type);
  params.set("workspaceId", context.workspaceId);
  if (context.type === "team") params.set("teamId", context.teamId);
  return params;
}

export function buildSolverHref(
  path: string,
  context: ActiveWorkspace,
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>,
) {
  const [base, existingQuery = ""] = path.split("?");
  const params = new URLSearchParams(existingQuery);
  const contextParams = solverContextParams(context);
  contextParams.forEach((value, key) => params.set(key, value));
  if (query instanceof URLSearchParams) query.forEach((value, key) => params.set(key, value));
  else if (query)
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
  if (context.type === "individual") params.delete("teamId");
  return `${base}?${params.toString()}`;
}

export function buildStandaloneSolverHref(
  path: string,
  context: ActiveWorkspace,
  query?: Parameters<typeof buildSolverHref>[2],
) {
  return `#${buildSolverHref(path, context, query)}`;
}

export function contextFromLocation(
  state: Pick<
    SolverState,
    "currentUser" | "personalWorkspace" | "teams" | "memberships"
  > = createCanonicalSolverState(),
): SolverContextResolution {
  if (typeof window === "undefined") return { ok: true, context: DEFAULT_SOLVER_CONTEXT };
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  return parseSolverContext(source, state);
}

export function workspaceContextForTeam(
  teamId: string,
  state: Pick<
    SolverState,
    "currentUser" | "personalWorkspace" | "teams" | "memberships"
  > = createCanonicalSolverState(),
): SolverContextResolution {
  return parseSolverContext(`space=team&teamId=${encodeURIComponent(teamId)}`, state);
}

export function isSolverEntityOwnedByContext(ownerWorkspaceId: string, context: ActiveWorkspace) {
  return ownerWorkspaceId === context.workspaceId;
}

export function currentUserIdForTests() {
  return CURRENT_SOLVER_USER_ID;
}
