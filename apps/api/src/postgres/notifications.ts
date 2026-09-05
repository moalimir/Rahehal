import type {
  MutationReceipt,
  NotificationListResource,
  NotificationNextAction,
  NotificationResource,
  NotificationSummaryResource,
} from "@rahhal/contracts";
import {
  defaultNotificationPageSize,
  isNotificationKind,
  maxNotificationPageSize,
  parseAuditEventId,
  parseNotificationId,
  parseReceiptId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type NotificationId,
  type WorkspaceId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, idempotencyConflict, notFound } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  Clock,
  IdFactory,
  MutationOutcome,
  NotificationListQuery,
  NotificationPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type NotificationRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly kind: string;
  readonly subject_type: string;
  readonly subject_id: string;
  readonly read_at: Date | null;
  readonly occurred_at: Date;
};

type CachedMutation = {
  readonly entity_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
};

const notificationNextActions = [
  "open_subject",
  "review_notifications",
  "none",
] as const satisfies readonly NotificationNextAction[];

function cachedMutation(value: unknown): CachedMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned an invalid notification idempotency response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record["entity_id"] !== "string" ||
    !Number.isSafeInteger(record["entity_version"]) ||
    typeof record["receipt_id"] !== "string" ||
    typeof record["audit_event_id"] !== "string" ||
    typeof record["timestamp"] !== "string" ||
    !Array.isArray(record["next_actions"])
  ) {
    throw new Error("Database returned an invalid notification idempotency response");
  }
  return record as unknown as CachedMutation;
}

function resource(row: NotificationRow): NotificationResource {
  if (!isNotificationKind(row.kind)) {
    throw new Error("Database returned an unknown notification kind");
  }
  if (
    row.subject_type !== "proposal" &&
    row.subject_type !== "team" &&
    row.subject_type !== "direct_offer"
  ) {
    throw new Error("Database returned an unknown notification subject");
  }
  return {
    id: parseNotificationId(row.id),
    tenant_id: parseTenantId(row.tenant_id),
    workspace_id: parseWorkspaceId(row.workspace_id),
    user_id: parseUserId(row.user_id),
    kind: row.kind,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    read_at: row.read_at?.toISOString() ?? null,
    occurred_at: row.occurred_at.toISOString(),
  };
}

/**
 * Cursor over the same `(occurred_at DESC, id)` order the index provides, so a
 * page boundary cannot drop or repeat a row when new notifications arrive
 * between requests.
 */
function encodeCursor(row: NotificationRow): string {
  return Buffer.from(`${row.occurred_at.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { readonly occurredAt: string; readonly id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf("|");
  const occurredAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (separator < 0 || Number.isNaN(Date.parse(occurredAt)) || !/^ntf_[A-Za-z0-9_-]+$/.test(id)) {
    throw new ApiProblem(422, "VALIDATION", "The notification cursor is not readable", {
      fields: [{ path: "cursor", code: "format", message: "The notification cursor is invalid" }],
    });
  }
  return { occurredAt, id };
}

export class PostgresNotificationAdapter implements NotificationPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  async list(
    scope: WorkspaceScope,
    query: NotificationListQuery,
  ): Promise<NotificationListResource> {
    const limit = Math.min(
      Math.max(query.limit ?? defaultNotificationPageSize, 1),
      maxNotificationPageSize,
    );
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const rows = await client.query<NotificationRow>(
        `SELECT id, tenant_id, workspace_id, user_id, kind, subject_type, subject_id,
                read_at, occurred_at
         FROM notification
         WHERE tenant_id = $1 AND workspace_id = $2 AND user_id = $3
           AND ($4::boolean IS NOT TRUE OR read_at IS NULL)
           AND ($5::timestamptz IS NULL
                OR (occurred_at, id) < ($5::timestamptz, $6::text))
         ORDER BY occurred_at DESC, id DESC
         LIMIT $7`,
        [
          scope.tenantId,
          scope.workspaceId,
          scope.actorUserId,
          query.unreadOnly ?? false,
          cursor?.occurredAt ?? null,
          cursor?.id ?? null,
          limit + 1,
        ],
      );
      const page = rows.rows.slice(0, limit);
      const last = page.at(-1);
      const unread = await this.unreadCount(client, scope);
      return {
        items: page.map(resource),
        unread_count: unread,
        ...(rows.rows.length > limit && last ? { next_cursor: encodeCursor(last) } : {}),
      };
    });
  }

  async summary(scope: WorkspaceScope): Promise<NotificationSummaryResource> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      return { unread_count: await this.unreadCount(client, scope) };
    });
  }

  private async unreadCount(client: PoolClient, scope: WorkspaceScope): Promise<number> {
    const result = await client.query<{ unread: string }>(
      `SELECT count(*) AS unread FROM notification
       WHERE tenant_id = $1 AND workspace_id = $2 AND user_id = $3 AND read_at IS NULL`,
      [scope.tenantId, scope.workspaceId, scope.actorUserId],
    );
    return Number(result.rows[0]?.unread ?? 0);
  }

  async markRead(
    id: string,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<NotificationId, NotificationNextAction>> {
    const requestHash = commandFingerprint({
      action: "notification.read",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return this.outcome(replay, true);
      const now = this.clock.now().toISOString();
      // Scoped by recipient before id: a foreign notification is unreachable
      // rather than forbidden, so the command cannot confirm one exists.
      const updated = await client.query<{ id: string }>(
        `UPDATE notification SET read_at = COALESCE(read_at, $5)
         WHERE tenant_id = $1 AND workspace_id = $2 AND user_id = $3 AND id = $4
         RETURNING id`,
        [context.tenantId, context.workspaceId, context.actorUserId, id, now],
      );
      if (updated.rowCount !== 1) throw notFound();
      return this.record(
        client,
        parseNotificationId(id),
        "notification",
        context,
        "notification.read",
        ["open_subject"],
        requestHash,
        now,
      );
    });
  }

  async markAllRead(
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, NotificationNextAction>> {
    const requestHash = commandFingerprint({
      action: "notification.read-all",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const replay = await this.replay(client, context, requestHash);
      if (replay)
        return this.outcome(replay, true) as MutationOutcome<WorkspaceId, NotificationNextAction>;
      const now = this.clock.now().toISOString();
      await client.query(
        `UPDATE notification SET read_at = $4
         WHERE tenant_id = $1 AND workspace_id = $2 AND user_id = $3 AND read_at IS NULL`,
        [context.tenantId, context.workspaceId, context.actorUserId, now],
      );
      return this.record(
        client,
        context.workspaceId,
        "workspace",
        context,
        "notification.read-all",
        ["review_notifications"],
        requestHash,
        now,
      );
    });
  }

  private async lockIdempotency(
    client: PoolClient,
    context: WorkspaceCommandContext,
  ): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
    ]);
  }

  private async replay(
    client: PoolClient,
    context: WorkspaceCommandContext,
    requestHash: string,
  ): Promise<CachedMutation | null> {
    await client.query(
      `DELETE FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 AND expires_at <= $3`,
      [context.tenantId, context.idempotencyKey, this.clock.now().toISOString()],
    );
    const result = await client.query<{
      request_hash: string;
      status: string;
      response_body: unknown;
    }>(
      `SELECT request_hash, status, response_body FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1 AND credential_fingerprint IS NULL
         AND idempotency_key = $2 FOR UPDATE`,
      [context.tenantId, context.idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return cachedMutation(row.response_body);
  }

  private outcome<Target extends string>(
    cached: CachedMutation,
    idempotent: boolean,
  ): MutationOutcome<Target, NotificationNextAction> {
    const receipt: MutationReceipt<Target, NotificationNextAction> = {
      entity_id: cached.entity_id as Target,
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: new Date(cached.timestamp).toISOString(),
      idempotent,
      next_actions: cached.next_actions.filter((item): item is NotificationNextAction =>
        notificationNextActions.includes(item as NotificationNextAction),
      ),
    };
    return { receipt, entityVersion: cached.entity_version };
  }

  private async record<Target extends string>(
    client: PoolClient,
    target: Target,
    targetType: string,
    context: WorkspaceCommandContext,
    action: string,
    nextActions: readonly NotificationNextAction[],
    requestHash: string,
    occurredAt: string,
  ): Promise<MutationOutcome<Target, NotificationNextAction>> {
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    // Read state is a per-recipient projection with no downstream consumer, so
    // it records audit, receipt, and idempotency but emits no outbox event:
    // the worker allowlist would dead-letter an event nothing subscribes to.
    const cached: CachedMutation = {
      entity_id: target,
      entity_version: 1,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: [...nextActions],
    };
    await client.query(
      `INSERT INTO audit_event (
         id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
         action, outcome, reason_code, target_type, target_id, metadata, occurred_at
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED',$7,$8,'{}'::jsonb,$9)`,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        action,
        targetType,
        target,
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO mutation_receipt (
         id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
         audit_event_id, correlation_id, next_actions, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8::jsonb,$9)`,
      [
        receiptId,
        context.tenantId,
        context.workspaceId,
        targetType,
        target,
        auditId,
        context.correlationId,
        JSON.stringify(nextActions),
        occurredAt,
      ],
    );
    await client.query(
      `INSERT INTO idempotency_key (
         id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
         request_hash, status, response_status, response_body, created_at, expires_at
       ) VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',200,$5::jsonb,$6,$7)`,
      [
        `idk_${commandFingerprint({
          tenantId: context.tenantId,
          idempotencyKey: context.idempotencyKey,
        })}`,
        context.tenantId,
        context.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        occurredAt,
        new Date(Date.parse(occurredAt) + 24 * 60 * 60_000).toISOString(),
      ],
    );
    return this.outcome(cached, false);
  }
}
