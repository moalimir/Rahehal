import type { OutboxClaim, OutboxClaimId, OutboxDeadLetter, OutboxSource } from "./ports.js";

export type InMemoryOutboxRecordState = "pending" | "claimed" | "published" | "dead-letter";

type StoredRecord = {
  readonly claimId: OutboxClaimId;
  readonly record: unknown;
  attempts: number;
  state: InMemoryOutboxRecordState;
  publishedAt?: string;
  deadLetter?: OutboxDeadLetter;
};

export type InMemoryOutboxRecordSnapshot = {
  readonly claimId: OutboxClaimId;
  readonly attempts: number;
  readonly state: InMemoryOutboxRecordState;
  readonly publishedAt?: string;
  readonly deadLetter?: OutboxDeadLetter;
};

export class InMemoryOutboxSource implements OutboxSource {
  private readonly records: StoredRecord[];

  constructor(records: readonly unknown[] = []) {
    this.records = records.map((record, index) => ({
      claimId: `claim_${String(index + 1).padStart(8, "0")}` as OutboxClaimId,
      record,
      attempts: 0,
      state: "pending",
    }));
  }

  async claim(limit: number): Promise<readonly OutboxClaim[]> {
    const claimed = this.records.filter((record) => record.state === "pending").slice(0, limit);

    return claimed.map((record) => {
      record.state = "claimed";
      record.attempts += 1;
      return {
        claimId: record.claimId,
        attempt: record.attempts,
        record: record.record,
      };
    });
  }

  async markPublished(claimId: OutboxClaimId, publishedAt: string) {
    const record = this.claimedRecord(claimId);
    record.state = "published";
    record.publishedAt = publishedAt;
  }

  async releaseForRetry(claimId: OutboxClaimId) {
    this.claimedRecord(claimId).state = "pending";
  }

  async markDeadLetter(claimId: OutboxClaimId, deadLetter: OutboxDeadLetter) {
    const record = this.claimedRecord(claimId);
    record.state = "dead-letter";
    record.deadLetter = deadLetter;
  }

  pendingCount() {
    return this.records.filter((record) => record.state === "pending" || record.state === "claimed")
      .length;
  }

  publishedCount() {
    return this.records.filter((record) => record.state === "published").length;
  }

  deadLetterCount() {
    return this.records.filter((record) => record.state === "dead-letter").length;
  }

  snapshot(): readonly InMemoryOutboxRecordSnapshot[] {
    return this.records.map(({ claimId, attempts, state, publishedAt, deadLetter }) => ({
      claimId,
      attempts,
      state,
      ...(publishedAt === undefined ? {} : { publishedAt }),
      ...(deadLetter === undefined ? {} : { deadLetter: { ...deadLetter } }),
    }));
  }

  private claimedRecord(claimId: OutboxClaimId): StoredRecord {
    const record = this.records.find((candidate) => candidate.claimId === claimId);
    if (!record) throw new Error("Unknown outbox claim");
    if (record.state !== "claimed") throw new Error("Outbox record is not currently claimed");
    return record;
  }
}
