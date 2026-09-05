"use client";

import { useCallback, useEffect, useState } from "react";

import { useWebRuntime } from "@/components/runtime-provider";
import {
  readSolverDashboardSummary,
  summaryScopeLost,
  type SolverDashboardSummary,
} from "@/lib/workspace/solver-summary";

export type ConnectedDashboardState =
  /** Demo runtime: the page keeps its local projection and labels itself. */
  | { readonly kind: "demo" }
  | { readonly kind: "loading" }
  | { readonly kind: "anonymous" }
  /** The session or workspace scope is gone; the page must send the human back. */
  | { readonly kind: "scope-lost" }
  | { readonly kind: "ready"; readonly summary: SolverDashboardSummary };

/**
 * Live dashboard data for the active solver workspace.
 *
 * Re-reads whenever the active workspace changes, because C9 requires a
 * workspace switch to refresh scope, counts, and next actions rather than
 * leaving the previous workspace's numbers on screen.
 */
export function useConnectedSolverDashboard(): {
  readonly state: ConnectedDashboardState;
  refresh(): void;
} {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways;
  const activeWorkspaceId = runtime.me?.active_context?.workspace_id ?? null;
  const [state, setState] = useState<ConnectedDashboardState>(() =>
    runtime.mode === "network" ? { kind: "loading" } : { kind: "demo" },
  );
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (runtime.mode !== "network" || !gateways) {
      setState({ kind: "demo" });
      return;
    }
    if (runtime.sessionStatus === "loading") {
      setState({ kind: "loading" });
      return;
    }
    if (runtime.sessionStatus !== "authenticated" || !activeWorkspaceId) {
      setState({ kind: "anonymous" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    void readSolverDashboardSummary(gateways).then((summary) => {
      if (cancelled) return;
      setState(summaryScopeLost(summary) ? { kind: "scope-lost" } : { kind: "ready", summary });
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, gateways, nonce, runtime.mode, runtime.sessionStatus]);

  return { state, refresh };
}
