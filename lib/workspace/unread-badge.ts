"use client";

import { useEffect, useState } from "react";

import { useWebRuntime } from "@/components/runtime-provider";

/**
 * The unread notification count both application shells put in their header.
 *
 * The solver shell and the organization shell each grew their own copy of this
 * effect, which is how the two personas end up disagreeing about when a badge
 * clears. One implementation keeps them honest, and keeps the same rule on
 * both sides: a denied or unreachable summary shows no badge rather than a
 * zero dressed up as a fact, because the notifications page is where a failure
 * gets reported, not the chrome.
 *
 * Re-reads when the active workspace changes -- a badge is workspace-scoped --
 * and when `refreshKey` changes, so navigating after marking something read
 * does not leave a stale number in the header.
 */
export function useUnreadNotificationCount(refreshKey?: string): number {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways;
  const activeWorkspaceId = runtime.me?.active_context?.workspace_id ?? null;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (runtime.mode !== "network" || !gateways || !activeWorkspaceId) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    void gateways.notifications.summary().then((result) => {
      if (!cancelled) setUnreadCount(result.ok ? result.data.unread_count : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, gateways, refreshKey, runtime.mode]);

  return unreadCount;
}
