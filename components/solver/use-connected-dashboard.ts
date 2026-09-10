"use client";

import { useCallback } from "react";

import { useWebRuntime } from "@/components/runtime-provider";
import { useConnectedFamily, type ConnectedFamily } from "@/components/solver/use-connected";
import {
  readSolverDashboardSummary,
  summaryScopeLost,
  type SolverDashboardSummary,
} from "@/lib/workspace/solver-summary";

export type ConnectedDashboardState = ConnectedFamily<SolverDashboardSummary>["state"];

/** Live dashboard data for the active solver workspace. */
export function useConnectedSolverDashboard(): ConnectedFamily<SolverDashboardSummary> {
  const runtime = useWebRuntime();
  const activeWorkspace = runtime.me?.workspaces.find(
    (workspace) => workspace.id === runtime.me?.active_context?.workspace_id,
  );
  const workspaceKind = activeWorkspace?.kind === "team" ? "team" : "individual";
  const read = useCallback(
    (gateways: Parameters<typeof readSolverDashboardSummary>[0]) =>
      readSolverDashboardSummary(gateways, workspaceKind),
    [workspaceKind],
  );
  return useConnectedFamily(read, summaryScopeLost, workspaceKind);
}
