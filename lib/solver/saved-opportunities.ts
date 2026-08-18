import { PERSONAL_WORKSPACE_ID } from "@/data/solver-fixtures";
import { contextFromLocation } from "@/lib/solver/context";
import {
  readSolverState,
  savedOpportunityIds,
  setSavedOpportunity,
} from "@/lib/solver/repository";

export const SAVED_OPPORTUNITIES_EVENT = "rahhal:saved-opportunities-change";

/** Legacy key retained only for the v1 → v3 migration contract. */
export function savedOpportunityKey(challengeId: string) {
  return `rahhal:saved:${challengeId}`;
}

function activeWorkspaceId(explicit?: string) {
  if (explicit) return explicit;
  const state = readSolverState();
  const resolution = contextFromLocation(state);
  return resolution.ok ? resolution.context.workspaceId : PERSONAL_WORKSPACE_ID;
}

export function isOpportunitySaved(
  challengeId: string,
  fallback = false,
  workspaceId?: string,
) {
  if (typeof window === "undefined") return fallback;
  try {
    return savedOpportunityIds(activeWorkspaceId(workspaceId)).includes(challengeId);
  } catch {
    return fallback;
  }
}

export function setOpportunitySaved(challengeId: string, saved: boolean, workspaceId?: string) {
  if (typeof window === "undefined") return;
  const scopedWorkspaceId = activeWorkspaceId(workspaceId);
  const result = setSavedOpportunity(scopedWorkspaceId, challengeId, saved);
  window.dispatchEvent(
    new CustomEvent(SAVED_OPPORTUNITIES_EVENT, {
      detail: { challengeId, saved, workspaceId: scopedWorkspaceId, ok: result.ok },
    }),
  );
  return result;
}
