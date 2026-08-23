import { OutboxConsumer } from "./consumer.js";
import { InMemoryDeliveryLedger } from "./delivery-ledger.js";
import { InMemoryOutboxSource } from "./in-memory.js";
import type { OutboxHandler, WorkerClock } from "./ports.js";

export type DemoWorkerComposition = {
  readonly source: InMemoryOutboxSource;
  readonly ledger: InMemoryDeliveryLedger;
  readonly consumer: OutboxConsumer;
};

export function createDemoWorkerComposition(options: {
  readonly mode: string | undefined;
  readonly nodeEnv?: string | undefined;
  readonly clock?: WorkerClock;
  readonly handler?: OutboxHandler;
}): DemoWorkerComposition {
  if (options.nodeEnv === "production" || options.mode !== "demo") {
    throw new Error(
      "No production outbox adapter is configured; the in-memory worker is demo-only",
    );
  }

  const source = new InMemoryOutboxSource();
  const ledger = new InMemoryDeliveryLedger();
  const consumer = new OutboxConsumer(
    source,
    ledger,
    options.handler ?? { handle: async () => undefined },
    options.clock ?? { now: () => new Date() },
  );
  return { source, ledger, consumer };
}
