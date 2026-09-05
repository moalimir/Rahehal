import type { NotificationResource } from "@rahhal/contracts";

import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * The active workspace's C8 notification page.
 *
 * `unreadCount` comes from the list response rather than being counted from
 * the returned rows: the list is bounded, so counting what came back would
 * under-report as soon as there is a second page.
 */
export type NotificationView = {
  readonly items: readonly NotificationResource[];
  readonly unreadCount: number;
  readonly nextCursor: string | null;
  readonly error: GatewayFailure | null;
};

export async function readNotifications(gateways: WorkspaceGateways): Promise<NotificationView> {
  const result = await gateways.notifications.list({ limit: 50 });
  if (!result.ok) return { items: [], unreadCount: 0, nextCursor: null, error: result.error };
  return {
    items: result.data.items,
    unreadCount: result.data.unread_count,
    nextCursor: result.data.next_cursor ?? null,
    error: null,
  };
}

export function notificationsScopeLost(view: NotificationView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}
