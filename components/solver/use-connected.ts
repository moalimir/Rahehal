"use client";

import { useCallback, useEffect, useState } from "react";

import { useWebRuntime } from "@/components/runtime-provider";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * The one state machine every connected workspace page family runs.
 *
 * C9 converts each family from browser/demo authority to server authority, and
 * every one of them needs the same five outcomes. Writing that machine per
 * family is how two families end up disagreeing about what a revoked session
 * looks like, so it lives here once and each family supplies only its read.
 *
 * - `demo`       the static export: the page keeps its local projection and labels itself
 * - `loading`    the session or the read is still resolving; never guess a persona
 * - `anonymous`  no session or no active workspace; the page shows its session boundary
 * - `scope-lost` the session/scope no longer reaches this family; recover, do not retry
 * - `ready`      live data for the active workspace
 */
export type ConnectedState<Data> =
  | { readonly kind: "demo" }
  | { readonly kind: "loading" }
  | { readonly kind: "anonymous" }
  | { readonly kind: "scope-lost" }
  | { readonly kind: "ready"; readonly data: Data };

export type ConnectedFamily<Data> = {
  readonly state: ConnectedState<Data>;
  /** Re-reads the family, for use after a mutation commits. */
  refresh(): void;
};

/**
 * Reads one page family for the active workspace.
 *
 * The read re-runs whenever the active workspace changes, because C9 requires a
 * workspace switch to refresh counts, permissions, and queries rather than
 * leaving the previous workspace's data on screen. `scopeLost` decides when a
 * failure means the page must recover instead of rendering an empty state; a
 * family that can partially succeed keeps its own rule for that.
 */
export function useConnectedFamily<Data>(
  read: (gateways: WorkspaceGateways) => Promise<Data>,
  scopeLost: (data: Data) => boolean,
  /**
   * Identifies what `read` is reading when it closes over a value — a record
   * id, a filter. `read` itself is excluded from the effect deps because a
   * fresh closure every render would re-read every render, so a family that
   * varies its target must say so here or it would keep the first target's
   * data after navigating to a second one.
   */
  key?: string,
): ConnectedFamily<Data> {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways;
  const activeWorkspaceId = runtime.me?.active_context?.workspace_id ?? null;
  const [state, setState] = useState<ConnectedState<Data>>(() =>
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
    void read(gateways).then((data) => {
      if (cancelled) return;
      setState(scopeLost(data) ? { kind: "scope-lost" } : { kind: "ready", data });
    });
    return () => {
      cancelled = true;
    };
    // `read`/`scopeLost` are module-level functions or stable closures supplied
    // by the family; re-running on their identity would re-read every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, gateways, key, nonce, runtime.mode, runtime.sessionStatus]);

  return { state, refresh };
}

/**
 * The active workspace's name, from the server in network mode.
 *
 * Returns `null` in demo mode and before the session resolves, so a caller
 * falls back to its own projection rather than showing an empty heading — and
 * never labels a live workspace with a fixture name.
 */
export function useActiveWorkspaceName(): string | null {
  const runtime = useWebRuntime();
  if (runtime.mode !== "network" || !runtime.me) return null;
  const activeId = runtime.me.active_context?.workspace_id ?? null;
  if (!activeId) return null;
  return runtime.me.workspaces.find((workspace) => workspace.id === activeId)?.name ?? null;
}
