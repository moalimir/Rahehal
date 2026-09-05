"use client";

import { useWebRuntime } from "@/components/runtime-provider";
import { useUnreadNotificationCount } from "@/lib/workspace/unread-badge";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import type { WorkspaceResource } from "@rahhal/contracts";
import type { TeamRole } from "@rahhal/domain";

/**
 * The identity and workspace list the application chrome shows.
 *
 * The solver shell used to read all of this from the demo repository, so a
 * connected session landed on a dashboard captioned with a fixture person and
 * a fixture team list. That is the "looks live but isn't" failure C9 exists to
 * remove, and it is worse in chrome than in a page body: the sidebar is the
 * one thing a human trusts to tell them whose workspace they are in.
 *
 * Returns `null` in demo mode and until the session resolves, so the shell
 * keeps its local projection there and never blends the two.
 */
export type ConnectedShell = {
  readonly userName: string;
  readonly userRole: string;
  readonly workspaceName: string;
  readonly workspaceLabel: string;
  readonly activeWorkspaceId: string;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly space: "individual" | "team";
  }[];
  readonly unreadCount: number;
};

const kindLabels = {
  individual: "فضای شخصی",
  team: "فضای تیمی",
  org: "فضای سازمانی",
  platform: "فضای پلتفرم",
} as const;

/** Solver chrome only offers the workspaces a solver actually works in. */
function isSolverWorkspace(
  workspace: WorkspaceResource,
): workspace is Extract<WorkspaceResource, { kind: "individual" | "team" }> {
  return workspace.kind === "individual" || workspace.kind === "team";
}

export function useConnectedShell(refreshKey?: string): ConnectedShell | null {
  const runtime = useWebRuntime();
  const me = runtime.me;
  const activeWorkspaceId = me?.active_context?.workspace_id ?? null;
  const unreadCount = useUnreadNotificationCount(refreshKey);

  if (runtime.mode !== "network" || !me || !activeWorkspaceId) return null;

  const workspaces = me.workspaces.filter(isSolverWorkspace);
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  if (!active) return null;

  const membershipRole = me.memberships.find(
    (membership) => membership.workspace_id === activeWorkspaceId && membership.state === "active",
  )?.role;

  return {
    userName: me.user.display_name,
    // The membership role is the honest caption: the connected profile
    // headline is a separate C1 read this chrome does not make.
    userRole:
      membershipRole === "individual"
        ? "حل‌کننده مستقل"
        : membershipRole?.startsWith("team:")
          ? TEAM_ROLE_LABELS[membershipRole as TeamRole]
          : "حل‌کننده",
    workspaceName: active.name,
    workspaceLabel: active.kind === "team" ? "فضای تیمی حل‌کننده" : "فضای فردی حل‌کننده",
    activeWorkspaceId,
    options: workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      description: kindLabels[workspace.kind],
      space: workspace.kind,
    })),
    unreadCount,
  };
}
