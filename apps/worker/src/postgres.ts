import type { OutboxEvent } from "@rahhal/contracts";
import type { Pool, PoolClient } from "pg";

import type {
  DeliveryLedger,
  OutboxClaim,
  OutboxClaimId,
  OutboxDeadLetter,
  OutboxSource,
  WorkerClock,
} from "./ports.js";

type ClaimRow = {
  readonly id: string;
  readonly attempt_count: number;
  readonly tenant_id: string;
  readonly correlation_id: string;
  readonly event_type: string;
  readonly schema_version: number;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly payload: unknown;
  readonly occurred_at: Date;
};

/** How long a claimed row stays locked before another worker may retry it. */
const claimLeaseMs = 60_000;

function record(row: ClaimRow): unknown {
  return {
    event_id: row.id,
    tenant_id: row.tenant_id,
    correlation_id: row.correlation_id,
    event_type: row.event_type,
    schema_version: row.schema_version,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    payload: row.payload,
    occurred_at: row.occurred_at.toISOString(),
  };
}

/**
 * Durable outbox claims. `FOR UPDATE SKIP LOCKED` lets several workers poll the
 * same table without blocking each other, and the lease means a worker that
 * dies mid-delivery releases its rows by expiry rather than stranding them.
 */
export class PostgresOutboxSource implements OutboxSource {
  constructor(
    private readonly pool: Pool,
    private readonly clock: WorkerClock,
  ) {}

  async claim(limit: number): Promise<readonly OutboxClaim[]> {
    // Availability and the lease are judged by `transaction_timestamp()`, the
    // same clock that stamps `available_at` on insert. Comparing against the
    // worker's own wall clock instead would make a freshly written event
    // unclaimable until the two clocks agreed, so any skew between the API
    // host and the database would silently delay delivery.
    const result = await this.pool.query<ClaimRow>(
      `UPDATE outbox_event
       SET locked_at = transaction_timestamp(), attempt_count = attempt_count + 1
       WHERE id IN (
         SELECT id FROM outbox_event
         WHERE published_at IS NULL
           AND available_at <= transaction_timestamp()
           AND (locked_at IS NULL
                OR locked_at <= transaction_timestamp() - ($1::bigint * interval '1 millisecond'))
           AND last_error_code IS NULL
         ORDER BY available_at, occurred_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       RETURNING id, attempt_count, tenant_id, correlation_id, event_type,
                 schema_version, aggregate_type, aggregate_id, payload, occurred_at`,
      [claimLeaseMs, limit],
    );
    return result.rows.map((row) => ({
      claimId: row.id as OutboxClaimId,
      attempt: row.attempt_count,
      record: record(row),
    }));
  }

  async markPublished(claimId: OutboxClaimId, publishedAt: string): Promise<void> {
    await this.pool.query(
      "UPDATE outbox_event SET published_at = $2, locked_at = NULL WHERE id = $1",
      [claimId, publishedAt],
    );
  }

  async releaseForRetry(claimId: OutboxClaimId): Promise<void> {
    await this.pool.query("UPDATE outbox_event SET locked_at = NULL WHERE id = $1", [claimId]);
  }

  async markDeadLetter(claimId: OutboxClaimId, deadLetter: OutboxDeadLetter): Promise<void> {
    // The row keeps its payload and gains a reason. Nothing is deleted, so a
    // poisoned event stays inspectable instead of vanishing from the ledger.
    await this.pool.query(
      "UPDATE outbox_event SET locked_at = NULL, last_error_code = $2 WHERE id = $1",
      [claimId, deadLetter.reason],
    );
  }
}

/**
 * Delivery evidence in the same database as the effect. `runOnce` inserts the
 * event id and performs the effect in one transaction, so a redelivered event
 * finds the row and skips: at-least-once delivery becomes exactly-one
 * notification.
 */
export class PostgresDeliveryLedger implements DeliveryLedger<PoolClient> {
  constructor(private readonly pool: Pool) {}

  async runOnce(
    eventId: OutboxEvent["event_id"],
    effect: (client: PoolClient) => Promise<void>,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO outbox_delivery (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id",
        [eventId],
      );
      if (inserted.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await effect(client);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
