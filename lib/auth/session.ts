import type { InternalRole } from "@/domain/product";
import { CURRENT_SOLVER_USER_ID, PERSONAL_WORKSPACE_ID } from "@/data/solver-fixtures";
import type { ActiveWorkspace } from "@/domain/solver";

const SESSION_KEY = "rahhal.session.v1";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type DemoSession = {
  version: 1 | 2;
  userId: string;
  role: InternalRole;
  workspaceId: string;
  activeWorkspace?: ActiveWorkspace;
  twoFactorVerified: boolean;
  expiresAt: number;
};

export function createDemoSession(
  role: InternalRole,
  workspaceId: string,
  twoFactorVerified = true,
): DemoSession {
  const solverWorkspace: ActiveWorkspace | undefined =
    role === "solver"
      ? workspaceId.startsWith("WS-TEAM-")
        ? {
            type: "team",
            workspaceId,
            teamId: workspaceId.replace(/^WS-/, ""),
            membershipId: `MEM-${workspaceId.replace(/^WS-/, "")}-001`,
          }
        : { type: "individual", workspaceId: workspaceId || PERSONAL_WORKSPACE_ID }
      : undefined;
  const session: DemoSession = {
    version: 2,
    userId: role === "solver" ? CURRENT_SOLVER_USER_ID : `demo-${role}`,
    role,
    workspaceId: role === "solver" ? solverWorkspace!.workspaceId : workspaceId,
    activeWorkspace: solverWorkspace,
    twoFactorVerified,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as DemoSession | null;
    if (
      !parsed ||
      ![1, 2].includes(parsed.version) ||
      !["org", "solver", "reviewer", "ops"].includes(parsed.role) ||
      parsed.expiresAt <= Date.now()
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (parsed.role === "solver" && !parsed.activeWorkspace) {
      const migrated: DemoSession = {
        ...parsed,
        version: 2,
        userId: CURRENT_SOLVER_USER_ID,
        workspaceId: parsed.workspaceId || PERSONAL_WORKSPACE_ID,
        activeWorkspace: { type: "individual", workspaceId: PERSONAL_WORKSPACE_ID },
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearDemoSession() {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
}

export function canAccessInternalRole(session: DemoSession | null, role: InternalRole): boolean {
  return Boolean(session && session.role === role);
}
