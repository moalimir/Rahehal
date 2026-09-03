import type { OutboxEvent } from "@rahhal/contracts";
import { parsePrefixedId, proposalOutboxEventTypes, teamOutboxEventTypes } from "@rahhal/domain";
import { buildOutboxEvent, fixedTimestamp } from "@rahhal/testkit";
import { describe, expect, it, vi } from "vitest";
import { isSupportedOutboxEventType, OutboxConsumer } from "../src/consumer.js";
import { createDemoWorkerComposition } from "../src/demo-composition.js";
import { InMemoryDeliveryLedger } from "../src/delivery-ledger.js";
import { InMemoryOutboxSource } from "../src/in-memory.js";
import type { OutboxDeliveryContext } from "../src/ports.js";

const clock = { now: () => new Date(fixedTimestamp) };

function supportedEvent(index = 1, overrides: Partial<OutboxEvent<Record<string, unknown>>> = {}) {
  return buildOutboxEvent<Record<string, unknown>>(
    { entity_version: index },
    {
      event_id: parsePrefixedId(`evt_${String(index).padStart(8, "0")}`, "evt"),
      event_type: "challenge.draft.updated",
      ...overrides,
    },
  );
}

describe("idempotent outbox consumer", () => {
  it("accepts every C2 team event family through the worker boundary", () => {
    for (const eventType of teamOutboxEventTypes) {
      expect(isSupportedOutboxEventType(eventType)).toBe(true);
    }
  });

  it("accepts every C3 proposal draft event family through the worker boundary", () => {
    for (const eventType of proposalOutboxEventTypes) {
      expect(isSupportedOutboxEventType(eventType)).toBe(true);
    }
  });

  it("delivers duplicate event claims once while publishing each source record", async () => {
    const event = supportedEvent(1);
    const source = new InMemoryOutboxSource([event, structuredClone(event)]);
    const ledger = new InMemoryDeliveryLedger();
    const handle = vi.fn(async () => undefined);
    const consumer = new OutboxConsumer(source, ledger, { handle }, clock);

    await expect(consumer.pollOnce()).resolves.toEqual({
      claimed: 2,
      delivered: 1,
      duplicates: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(event, {
      claimId: "claim_00000001",
      attempt: 1,
      idempotencyKey: event.event_id,
    });
    expect(ledger.has(event.event_id)).toBe(true);
    expect(source.pendingCount()).toBe(0);
    expect(source.publishedCount()).toBe(2);
    expect(source.snapshot().map((record) => record.claimId)).toEqual([
      "claim_00000001",
      "claim_00000002",
    ]);
  });

  it("releases a transient failure for retry with the same claim and event idempotency key", async () => {
    const event = supportedEvent(2);
    const source = new InMemoryOutboxSource([event]);
    const ledger = new InMemoryDeliveryLedger();
    const contexts: OutboxDeliveryContext[] = [];
    const handle = vi.fn(async (_event: OutboxEvent, context: OutboxDeliveryContext) => {
      contexts.push(context);
      if (contexts.length === 1) throw new Error("transient");
    });
    const consumer = new OutboxConsumer(source, ledger, { handle }, clock);

    await expect(consumer.pollOnce()).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      duplicates: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(source.pendingCount()).toBe(1);
    expect(ledger.has(event.event_id)).toBe(false);

    await expect(consumer.pollOnce()).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      duplicates: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(contexts.map((context) => context.claimId)).toEqual([
      "claim_00000001",
      "claim_00000001",
    ]);
    expect(contexts.map((context) => context.attempt)).toEqual([1, 2]);
    expect(contexts.map((context) => context.idempotencyKey)).toEqual([
      event.event_id,
      event.event_id,
    ]);
    expect(source.snapshot()[0]).toMatchObject({ attempts: 2, state: "published" });
  });

  it("isolates a poison handler failure so a later valid record is delivered", async () => {
    const poison = supportedEvent(3);
    const valid = supportedEvent(4);
    const source = new InMemoryOutboxSource([poison, valid]);
    const ledger = new InMemoryDeliveryLedger();
    const handle = vi.fn(async (event: OutboxEvent) => {
      if (event.event_id === poison.event_id) throw new Error("poison");
    });
    const consumer = new OutboxConsumer(source, ledger, { handle }, clock);

    await expect(consumer.pollOnce()).resolves.toEqual({
      claimed: 2,
      delivered: 1,
      duplicates: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(handle).toHaveBeenCalledTimes(2);
    expect(ledger.has(valid.event_id)).toBe(true);
    expect(source.pendingCount()).toBe(1);
    expect(source.publishedCount()).toBe(1);
  });

  it("dead-letters malformed, unknown-type, and unsupported-version records immediately", async () => {
    const malformed = { event_id: "evt_00000005" };
    const unknownType = supportedEvent(6, { event_type: "challenge.unknown" });
    const unsupportedVersion = supportedEvent(7, { schema_version: 2 });
    const source = new InMemoryOutboxSource([malformed, unknownType, unsupportedVersion]);
    const handle = vi.fn(async () => undefined);
    const consumer = new OutboxConsumer(source, new InMemoryDeliveryLedger(), { handle }, clock);

    await expect(consumer.pollOnce()).resolves.toEqual({
      claimed: 3,
      delivered: 0,
      duplicates: 0,
      retried: 0,
      deadLettered: 3,
    });
    expect(handle).not.toHaveBeenCalled();
    expect(source.deadLetterCount()).toBe(3);
    expect(source.snapshot().map((record) => record.deadLetter?.reason)).toEqual([
      "MALFORMED_EVENT",
      "UNSUPPORTED_EVENT_TYPE",
      "UNSUPPORTED_SCHEMA_VERSION",
    ]);
  });

  it("dead-letters a permanent handler failure after the bounded attempt count", async () => {
    const event = supportedEvent(8);
    const source = new InMemoryOutboxSource([event]);
    const handle = vi.fn(async () => {
      throw new Error("permanent");
    });
    const consumer = new OutboxConsumer(source, new InMemoryDeliveryLedger(), { handle }, clock, {
      maxDeliveryAttempts: 2,
    });

    await expect(consumer.pollOnce()).resolves.toMatchObject({ retried: 1, deadLettered: 0 });
    await expect(consumer.pollOnce()).resolves.toMatchObject({ retried: 0, deadLettered: 1 });
    await expect(consumer.pollOnce()).resolves.toMatchObject({ claimed: 0 });
    expect(handle).toHaveBeenCalledTimes(2);
    expect(source.snapshot()[0]).toMatchObject({
      attempts: 2,
      state: "dead-letter",
      deadLetter: {
        reason: "DELIVERY_ATTEMPTS_EXHAUSTED",
        eventId: event.event_id,
      },
    });
  });

  it("keeps an external effect exactly once across a crash-window retry and fresh ledger", async () => {
    const event = supportedEvent(9);
    const source = new InMemoryOutboxSource([event]);
    const appliedEffects = new Set<string>();
    let externalEffectExecutions = 0;
    let crashAfterEffect = true;
    const handle = vi.fn(async (_event: OutboxEvent, context: OutboxDeliveryContext) => {
      if (!appliedEffects.has(context.idempotencyKey)) {
        appliedEffects.add(context.idempotencyKey);
        externalEffectExecutions += 1;
      }
      if (crashAfterEffect) {
        crashAfterEffect = false;
        throw new Error("crash after external effect");
      }
    });
    const firstLedger = new InMemoryDeliveryLedger();
    const firstConsumer = new OutboxConsumer(source, firstLedger, { handle }, clock);

    await expect(firstConsumer.pollOnce()).resolves.toMatchObject({ retried: 1 });
    expect(externalEffectExecutions).toBe(1);
    expect(firstLedger.has(event.event_id)).toBe(false);

    const restartedLedger = new InMemoryDeliveryLedger();
    const restartedConsumer = new OutboxConsumer(source, restartedLedger, { handle }, clock);
    await expect(restartedConsumer.pollOnce()).resolves.toMatchObject({
      delivered: 1,
      retried: 0,
    });

    expect(handle).toHaveBeenCalledTimes(2);
    expect(externalEffectExecutions).toBe(1);
    expect(appliedEffects).toEqual(new Set([event.event_id]));
    expect(restartedLedger.has(event.event_id)).toBe(true);
    expect(source.publishedCount()).toBe(1);
  });

  it("refuses the demo composition in production or without explicit demo mode", () => {
    expect(() => createDemoWorkerComposition({ mode: "demo", nodeEnv: "production" })).toThrow(
      "demo-only",
    );
    expect(() => createDemoWorkerComposition({ mode: undefined, nodeEnv: "development" })).toThrow(
      "demo-only",
    );
  });
});
