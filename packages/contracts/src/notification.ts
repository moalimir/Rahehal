import type { SuccessEnvelope } from "./envelopes.js";
import type { NotificationKind } from "@rahhal/domain";
import type { NotificationId, TenantId, UserId, WorkspaceId } from "@rahhal/domain";

/**
 * One projected notification. The resource deliberately carries no aggregate
 * content: a client follows `subject_type`/`subject_id` back through the
 * normal authorized read, which re-checks access at that moment rather than
 * trusting a link minted when the notification was written.
 */
export type NotificationResource = {
  readonly id: NotificationId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly user_id: UserId;
  readonly kind: NotificationKind;
  readonly subject_type: "proposal" | "team" | "direct_offer";
  readonly subject_id: string;
  readonly read_at: string | null;
  readonly occurred_at: string;
};

export type NotificationListResource = {
  readonly items: readonly NotificationResource[];
  readonly unread_count: number;
  /** Present only when more rows exist beyond the returned page. */
  readonly next_cursor?: string;
};

export type NotificationSummaryResource = {
  readonly unread_count: number;
};

export type MarkNotificationReadBody = {
  readonly expected_version: 0;
};

export type MarkAllNotificationsReadBody = {
  readonly expected_version: 0;
};

export type NotificationNextAction = "open_subject" | "review_notifications" | "none";

export type NotificationListSuccessEnvelope = SuccessEnvelope<NotificationListResource>;
export type NotificationSummarySuccessEnvelope = SuccessEnvelope<NotificationSummaryResource>;
