"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useWebRuntime } from "@/components/runtime-provider";

const NOTIFICATION_STATE_CHANGED = "rahhal:notification-state-changed";
const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

/**
 * Tells every mounted workspace surface that a notification command committed.
 *
 * The page and the application shell are separate React branches. Without a
 * shared invalidation signal, marking a row read refreshed the list but left
 * the header badge stale until the next navigation.
 */
export function announceNotificationStateChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATION_STATE_CHANGED));
}

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
  const requestSequence = useRef(0);

  const refresh = useCallback(() => {
    const request = ++requestSequence.current;
    if (runtime.mode !== "network" || !gateways || !activeWorkspaceId) {
      setUnreadCount(0);
      return;
    }
    void gateways.notifications.summary().then((result) => {
      if (request === requestSequence.current)
        setUnreadCount(result.ok ? result.data.unread_count : 0);
    });
  }, [activeWorkspaceId, gateways, runtime.mode]);

  useEffect(() => {
    refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refreshVisible, NOTIFICATION_POLL_INTERVAL_MS);
    window.addEventListener(NOTIFICATION_STATE_CHANGED, refreshVisible);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      requestSequence.current += 1;
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATION_STATE_CHANGED, refreshVisible);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh, refreshKey]);

  return unreadCount;
}
