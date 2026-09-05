"use client";

import { useConnectedFamily, type ConnectedFamily } from "@/components/solver/use-connected";
import {
  readSolverDashboardSummary,
  summaryScopeLost,
  type SolverDashboardSummary,
} from "@/lib/workspace/solver-summary";

export type ConnectedDashboardState = ConnectedFamily<SolverDashboardSummary>["state"];

/** Live dashboard data for the active solver workspace. */
export function useConnectedSolverDashboard(): ConnectedFamily<SolverDashboardSummary> {
  return useConnectedFamily(readSolverDashboardSummary, summaryScopeLost);
}
