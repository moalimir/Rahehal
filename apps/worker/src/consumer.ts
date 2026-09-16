import { isOutboxEvent, type OutboxEvent } from "@rahhal/contracts";
import {
  challengeOutboxEventTypes,
  privateFileOutboxEventTypes,
  opportunityOutboxEventTypes,
  proposalOutboxEventTypes,
  solverOutboxEventTypes,
  solverActivationOutboxEventTypes,
  teamOutboxEventTypes,
} from "@rahhal/domain";
import type {
  DeliveryLedger,
  OutboxClaim,
  OutboxDeadLetterReason,
  OutboxHandler,
  OutboxSource,
  WorkerClock,
} from "./ports.js";

// Aggregate event types come from the domain so a new lifecycle or approval
// event cannot be emitted by the API without the worker routing it.
export const supportedOutboxEventTypes = [
  ...challengeOutboxEventTypes,
  ...privateFileOutboxEventTypes,
  ...proposalOutboxEventTypes,
  ...opportunityOutboxEventTypes,
  ...solverOutboxEventTypes,
  ...solverActivationOutboxEventTypes,
  ...teamOutboxEventTypes,
  "session.exchanged",
  "session.refreshed",
  "session.revoked",
  "session.context.switched",
] as const;

export type SupportedOutboxEventType = (typeof supportedOutboxEventTypes)[number];

const supportedOutboxEventTypeSet: ReadonlySet<string> = new Set(supportedOutboxEventTypes);

export function isSupportedOutboxEventType(value: string): value is SupportedOutboxEventType {
  return supportedOutboxEventTypeSet.has(value);
}

export type PollResult = {
  readonly claimed: number;
  readonly delivered: number;
  readonly duplicates: number;
  readonly retried: number;
  readonly deadLettered: number;
};

export type OutboxConsumerOptions = {
  readonly maxDeliveryAttempts?: number;
};

export const defaultMaxDeliveryAttempts = 3;

export class OutboxConsumer<Transaction = void> {
  private readonly maxDeliveryAttempts: number;

  constructor(
    private readonly source: OutboxSource,
    private readonly ledger: DeliveryLedger<Transaction>,
    private readonly handler: OutboxHandler<Transaction>,
    private readonly clock: WorkerClock,
    options: OutboxConsumerOptions = {},
  ) {
    this.maxDeliveryAttempts = options.maxDeliveryAttempts ?? defaultMaxDeliveryAttempts;
    if (!Number.isSafeInteger(this.maxDeliveryAttempts) || this.maxDeliveryAttempts < 1) {
      throw new RangeError("Maximum delivery attempts must be a positive integer");
    }
  }

  async pollOnce(limit = 50): Promise<PollResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError("Outbox poll limit must be an integer from 1 to 500");
    }

    const claims = await this.source.claim(limit);
    let delivered = 0;
    let duplicates = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const claim of claims) {
      const event = claim.record;
      if (!isOutboxEvent(event)) {
        await this.deadLetter(claim, "MALFORMED_EVENT");
        deadLettered += 1;
        continue;
      }
      if (event.schema_version !== 1) {
        await this.deadLetter(claim, "UNSUPPORTED_SCHEMA_VERSION", event.event_id);
        deadLettered += 1;
        continue;
      }
      if (!isSupportedOutboxEventType(event.event_type)) {
        await this.deadLetter(claim, "UNSUPPORTED_EVENT_TYPE", event.event_id);
        deadLettered += 1;
        continue;
      }

      try {
        const context = Object.freeze({
          claimId: claim.claimId,
          attempt: claim.attempt,
          idempotencyKey: event.event_id,
        });
        const handled = await this.ledger.runOnce(event.event_id, async (transaction) =>
          this.handler.handle(event, context, transaction),
        );
        await this.source.markPublished(claim.claimId, this.clock.now().toISOString());
        if (handled) delivered += 1;
        else duplicates += 1;
      } catch {
        if (claim.attempt >= this.maxDeliveryAttempts) {
          await this.deadLetter(claim, "DELIVERY_ATTEMPTS_EXHAUSTED", event.event_id);
          deadLettered += 1;
        } else {
          await this.source.releaseForRetry(claim.claimId);
          retried += 1;
        }
      }
    }

    return { claimed: claims.length, delivered, duplicates, retried, deadLettered };
  }

  private async deadLetter(
    claim: OutboxClaim,
    reason: OutboxDeadLetterReason,
    eventId?: OutboxEvent["event_id"],
  ) {
    await this.source.markDeadLetter(claim.claimId, {
      reason,
      deadLetteredAt: this.clock.now().toISOString(),
      ...(eventId === undefined ? {} : { eventId }),
    });
  }
}
