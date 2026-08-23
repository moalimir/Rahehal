import {
  isCorrelationId,
  isEntityId,
  isOutboxEventId,
  isTenantId,
  type CorrelationId,
  type EntityId,
  type OutboxEventId,
  type TenantId,
} from "@rahhal/domain";

export type OutboxAggregateId = Exclude<EntityId, OutboxEventId>;

export type OutboxEvent<Payload = unknown> = {
  readonly event_id: OutboxEventId;
  readonly event_type: string;
  readonly schema_version: number;
  readonly aggregate_type: string;
  readonly aggregate_id: OutboxAggregateId;
  readonly tenant_id: TenantId;
  readonly correlation_id: CorrelationId;
  readonly occurred_at: string;
  readonly payload: Payload;
};

const outboxEventFields = [
  "event_id",
  "event_type",
  "schema_version",
  "aggregate_type",
  "aggregate_id",
  "tenant_id",
  "correlation_id",
  "occurred_at",
  "payload",
] as const;

const outboxEventFieldSet: ReadonlySet<string> = new Set(outboxEventFields);
const rfc3339DateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function isRfc3339DateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    rfc3339DateTimePattern.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function isOutboxEvent(value: unknown): value is OutboxEvent {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

    const record = value as Record<string, unknown>;
    const fields = Object.keys(record);
    if (
      fields.length !== outboxEventFields.length ||
      fields.some((field) => !outboxEventFieldSet.has(field)) ||
      outboxEventFields.some((field) => !Object.hasOwn(record, field))
    ) {
      return false;
    }

    const eventType = record.event_type;
    const schemaVersion = record.schema_version;
    const aggregateType = record.aggregate_type;
    return (
      isOutboxEventId(record.event_id) &&
      typeof eventType === "string" &&
      eventType.length >= 1 &&
      eventType.length <= 200 &&
      Number.isSafeInteger(schemaVersion) &&
      (schemaVersion as number) >= 1 &&
      typeof aggregateType === "string" &&
      aggregateType.length >= 1 &&
      aggregateType.length <= 100 &&
      isEntityId(record.aggregate_id) &&
      !isOutboxEventId(record.aggregate_id) &&
      isTenantId(record.tenant_id) &&
      isCorrelationId(record.correlation_id) &&
      isRfc3339DateTime(record.occurred_at) &&
      record.payload !== undefined
    );
  } catch {
    return false;
  }
}
