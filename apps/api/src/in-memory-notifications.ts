import type {
  NotificationListResource,
  NotificationNextAction,
  NotificationResource,
  NotificationSummaryResource,
} from "@rahhal/contracts";
import {
  defaultNotificationPageSize,
  maxNotificationPageSize,
  parseAuditEventId,
  parseNotificationId,
  parseReceiptId,
  type NotificationId,
  type WorkspaceId,
} from "@rahhal/domain";

import { idempotencyConflict, notFound } from "./errors.js";
import { commandFingerprint } from "./primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  NotificationListQuery,
  NotificationPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "./ports.js";

type Stored = NotificationResource & { readAt: string | null };

/**
 * Demo-side notification store. It mirrors the PostgreSQL adapter's contract --
 * recipient scoping before id, bounded pages, idempotent commands -- so the
 * browser cannot behave differently against the two runtimes.
 */
export class InMemoryNotificationAdapter implements NotificationPort {
  private readonly stored: Stored[] = [];
  private readonly commandIdempotency = new Map<
    string,
    {
      readonly fingerprint: string;
      readonly outcome: MutationOutcome<string, NotificationNextAction>;
    }
  >();

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  /** Test and demo seam: the projector is the worker in the connected runtime. */
  project(notification: NotificationResource): void {
    if (this.stored.some((item) => item.id === notification.id)) return;
    this.stored.push({ ...notification, readAt: notification.read_at });
  }

  private owned(scope: WorkspaceScope): Stored[] {
    return this.stored
      .filter(
        (item) =>
          item.tenant_id === scope.tenantId &&
          item.workspace_id === scope.workspaceId &&
          item.user_id === scope.actorUserId,
      )
      .sort((left, right) =>
        left.occurred_at === right.occurred_at
          ? right.id.localeCompare(left.id)
          : right.occurred_at.localeCompare(left.occurred_at),
      );
  }

  async list(
    scope: WorkspaceScope,
    query: NotificationListQuery,
  ): Promise<NotificationListResource> {
    const limit = Math.min(
      Math.max(query.limit ?? defaultNotificationPageSize, 1),
      maxNotificationPageSize,
    );
    let owned = this.owned(scope);
    if (query.unreadOnly) owned = owned.filter((item) => item.readAt === null);
    const start = query.cursor
      ? owned.findIndex(
          (item) =>
            item.id === Buffer.from(query.cursor!, "base64url").toString("utf8").split("|")[1],
        ) + 1
      : 0;
    const page = owned.slice(start, start + limit);
    const unread = this.owned(scope).filter((item) => item.readAt === null).length;
    const last = page.at(-1);
    return {
      items: page.map((item) => ({ ...item, read_at: item.readAt })),
      unread_count: unread,
      ...(owned.length > start + limit && last
        ? {
            next_cursor: Buffer.from(`${last.occurred_at}|${last.id}`, "utf8").toString(
              "base64url",
            ),
          }
        : {}),
    };
  }

  async summary(scope: WorkspaceScope): Promise<NotificationSummaryResource> {
    return { unread_count: this.owned(scope).filter((item) => item.readAt === null).length };
  }

  async markRead(
    id: string,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<NotificationId, NotificationNextAction>> {
    const fingerprint = commandFingerprint({
      action: "notification.read",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
    });
    const replay = this.replay(context.idempotencyKey, fingerprint);
    if (replay) {
      return {
        ...replay,
        receipt: { ...replay.receipt, entity_id: parseNotificationId(replay.receipt.entity_id) },
      };
    }
    const target = this.owned(context).find((item) => item.id === id);
    if (!target) throw notFound();
    target.readAt = target.readAt ?? this.clock.now().toISOString();
    return this.complete(context, fingerprint, parseNotificationId(id), ["open_subject"]);
  }

  async markAllRead(
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, NotificationNextAction>> {
    const fingerprint = commandFingerprint({
      action: "notification.read-all",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
    });
    const replay = this.replay(context.idempotencyKey, fingerprint);
    if (replay) {
      return {
        ...replay,
        receipt: { ...replay.receipt, entity_id: context.workspaceId },
      };
    }
    const now = this.clock.now().toISOString();
    for (const item of this.owned(context)) item.readAt = item.readAt ?? now;
    return this.complete(context, fingerprint, context.workspaceId, ["review_notifications"]);
  }

  private replay(
    idempotencyKey: string,
    fingerprint: string,
  ): MutationOutcome<string, NotificationNextAction> | null {
    const cached = this.commandIdempotency.get(idempotencyKey);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return { ...cached.outcome, receipt: { ...cached.outcome.receipt, idempotent: true } };
  }

  private complete<Target extends string>(
    context: WorkspaceCommandContext,
    fingerprint: string,
    target: Target,
    nextActions: readonly NotificationNextAction[],
  ): MutationOutcome<Target, NotificationNextAction> {
    const outcome: MutationOutcome<Target, NotificationNextAction> = {
      receipt: {
        entity_id: target,
        receipt_id: parseReceiptId(this.ids.next("rcp")),
        audit_event_id: parseAuditEventId(this.ids.next("aud")),
        timestamp: this.clock.now().toISOString(),
        idempotent: false,
        next_actions: nextActions,
      },
      entityVersion: 1,
    };
    this.commandIdempotency.set(context.idempotencyKey, { fingerprint, outcome });
    return outcome;
  }
}
