import { CURRENT_SOLVER_USER_ID, PERSONAL_WORKSPACE_ID } from "@/data/solver-fixtures";
import type { ActiveWorkspace } from "@/domain/solver";
import { activeWorkspaces, readSolverState } from "@/lib/solver/repository";

export const SOLVER_ACTIVE_WORKSPACE_KEY = `rahhal.solver.active-workspace.v2.${CURRENT_SOLVER_USER_ID}`;

type ActiveWorkspaceEnvelope = {
  version: 2;
  userId: string;
  value: ActiveWorkspace;
  updatedAt: string;
};

export function readLastActiveWorkspace(): ActiveWorkspace {
  const state = readSolverState();
  const available = activeWorkspaces(state);
  if (typeof window === "undefined") return available[0];
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SOLVER_ACTIVE_WORKSPACE_KEY) ?? "null",
    ) as ActiveWorkspaceEnvelope | null;
    if (
      parsed?.version === 2 &&
      parsed.userId === state.currentUser.id &&
      available.some((workspace) => workspace.workspaceId === parsed.value.workspaceId)
    )
      return parsed.value;
    const legacySpace = localStorage.getItem("rahhal:solver-space");
    if (legacySpace === "team") {
      const legacyTeam = available.find((workspace) => workspace.type === "team");
      if (legacyTeam) {
        writeLastActiveWorkspace(legacyTeam);
        return legacyTeam;
      }
    }
  } catch {
    // Corrupt context safely falls back to the canonical personal workspace.
  }
  return (
    available.find((workspace) => workspace.workspaceId === PERSONAL_WORKSPACE_ID) ?? available[0]
  );
}

export function writeLastActiveWorkspace(context: ActiveWorkspace) {
  if (typeof window === "undefined") return;
  const state = readSolverState();
  if (!activeWorkspaces(state).some((workspace) => workspace.workspaceId === context.workspaceId))
    return;
  const envelope: ActiveWorkspaceEnvelope = {
    version: 2,
    userId: state.currentUser.id,
    value: context,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(SOLVER_ACTIVE_WORKSPACE_KEY, JSON.stringify(envelope));
}
