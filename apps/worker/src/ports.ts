import type { OutboxEvent } from "@rahhal/contracts";

declare const outboxClaimIdBrand: unique symbol;

export type OutboxClaimId = string & {
  readonly [outboxClaimIdBrand]: "OutboxClaimId";
};

export type OutboxClaim = {
  readonly claimId: OutboxClaimId;
  readonly attempt: number;
  readonly record: unknown;
};

export type OutboxDeadLetterReason =
  | "MALFORMED_EVENT"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "UNSUPPORTED_EVENT_TYPE"
  | "DELIVERY_ATTEMPTS_EXHAUSTED";

export type OutboxDeadLetter = {
  readonly reason: OutboxDeadLetterReason;
  readonly deadLetteredAt: string;
  readonly eventId?: OutboxEvent["event_id"];
};

export interface OutboxSource {
  claim(limit: number): Promise<readonly OutboxClaim[]>;
  markPublished(claimId: OutboxClaimId, publishedAt: string): Promise<void>;
  releaseForRetry(claimId: OutboxClaimId): Promise<void>;
  markDeadLetter(claimId: OutboxClaimId, deadLetter: OutboxDeadLetter): Promise<void>;
}

export type OutboxDeliveryContext = {
  readonly claimId: OutboxClaimId;
  readonly attempt: number;
  readonly idempotencyKey: OutboxEvent["event_id"];
};

export interface OutboxHandler<Transaction = void> {
  /**
   * External side effects must use `context.idempotencyKey` unchanged. The local
   * delivery ledger cannot make a remote side effect and ledger completion atomic.
   *
   * A ledger that shares a database with the effect passes its transaction as
   * `transaction`, which is what lets the projection and the delivery record
   * commit together.
   */
  handle(
    event: OutboxEvent,
    context: OutboxDeliveryContext,
    transaction: Transaction,
  ): Promise<void>;
}

export interface DeliveryLedger<Transaction = void> {
  runOnce(
    eventId: OutboxEvent["event_id"],
    effect: (transaction: Transaction) => Promise<void>,
  ): Promise<boolean>;
}

export interface WorkerClock {
  now(): Date;
}
