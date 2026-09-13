import type { NotificationId, TenantId, UserId, WorkspaceId } from "./id.js";

/**
 * The C8 projection vocabulary. Every kind names an event a human needs to act
 * on or acknowledge; lifecycle events that only move internal state are
 * deliberately absent, so a new outbox event cannot become a notification
 * without being listed here.
 */
export const notificationKinds = [
  "proposal.submitted",
  "proposal.eligible",
  "proposal.ineligible",
  "proposal.clarification.requested",
  "proposal.clarification.submitted",
  "proposal.revision.requested",
  "proposal.resubmitted",
  "proposal.selected",
  "proposal.rejected",
  "team.invitation.sent",
  "team.invitation.accepted",
  "team.invitation.declined",
  "team.membership-request.created",
  "team.membership-request.accepted",
  "team.membership-request.rejected",
  "direct-offer.sent",
  "direct-offer.response.submitted",
  "direct-offer.negotiation.started",
  "direct-offer.declined",
  "direct-offer.cancelled",
  "direct-offer.expired",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];

const notificationKindSet: ReadonlySet<string> = new Set(notificationKinds);

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && notificationKindSet.has(value);
}

/**
 * Which side of a two-party aggregate the projection must resolve. The worker
 * reads the aggregate to find the recipient because outbox payloads carry only
 * stable identifiers and versions, never the parties or their contact details.
 */
export type NotificationAudience =
  | "proposal-owner"
  | "challenge-organization"
  | "team-managers"
  | "team-invitation-recipient"
  | "team-invitation-sender"
  | "team-membership-requester"
  | "offer-recipient"
  | "offer-sender";

export type NotificationProjection = {
  readonly kind: NotificationKind;
  readonly audience: NotificationAudience;
};

/**
 * The exact event-to-recipient routing table. An event absent here produces no
 * notification: silence is the default so an unreviewed event cannot reach a
 * person.
 */
export const notificationProjections: Readonly<Record<string, NotificationProjection>> = {
  "proposal.submitted": { kind: "proposal.submitted", audience: "challenge-organization" },
  "proposal.eligible": { kind: "proposal.eligible", audience: "proposal-owner" },
  "proposal.ineligible": { kind: "proposal.ineligible", audience: "proposal-owner" },
  "proposal.clarification.requested": {
    kind: "proposal.clarification.requested",
    audience: "proposal-owner",
  },
  "proposal.clarification.submitted": {
    kind: "proposal.clarification.submitted",
    audience: "challenge-organization",
  },
  "proposal.revision.requested": {
    kind: "proposal.revision.requested",
    audience: "proposal-owner",
  },
  "proposal.resubmitted": { kind: "proposal.resubmitted", audience: "challenge-organization" },
  "proposal.selected": { kind: "proposal.selected", audience: "proposal-owner" },
  "proposal.rejected": { kind: "proposal.rejected", audience: "proposal-owner" },
  "team.invitation.sent": {
    kind: "team.invitation.sent",
    audience: "team-invitation-recipient",
  },
  "team.invitation.accepted": {
    kind: "team.invitation.accepted",
    audience: "team-invitation-sender",
  },
  "team.invitation.declined": {
    kind: "team.invitation.declined",
    audience: "team-invitation-sender",
  },
  "team.membership-request.created": {
    kind: "team.membership-request.created",
    audience: "team-managers",
  },
  "team.membership-request.accepted": {
    kind: "team.membership-request.accepted",
    audience: "team-membership-requester",
  },
  "team.membership-request.rejected": {
    kind: "team.membership-request.rejected",
    audience: "team-membership-requester",
  },
  "direct-offer.sent": { kind: "direct-offer.sent", audience: "offer-recipient" },
  "direct-offer.response.submitted": {
    kind: "direct-offer.response.submitted",
    audience: "offer-sender",
  },
  "direct-offer.negotiation.started": {
    kind: "direct-offer.negotiation.started",
    audience: "offer-recipient",
  },
  "direct-offer.declined": { kind: "direct-offer.declined", audience: "offer-sender" },
  "direct-offer.cancelled": { kind: "direct-offer.cancelled", audience: "offer-recipient" },
  "direct-offer.expired": { kind: "direct-offer.expired", audience: "offer-recipient" },
};

export function notificationProjectionFor(eventType: string): NotificationProjection | null {
  return notificationProjections[eventType] ?? null;
}

/** The maximum page a notification list will ever return. */
export const maxNotificationPageSize = 50;
export const defaultNotificationPageSize = 20;

export type Notification = {
  readonly id: NotificationId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly kind: NotificationKind;
  /** Aggregate the notification points at, for an authorized deep link. */
  readonly subjectType: "proposal" | "team" | "direct_offer";
  readonly subjectId: string;
  readonly readAt: string | null;
  readonly occurredAt: string;
};
