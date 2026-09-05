import type { OutboxEvent } from "@rahhal/contracts";
import type { DeliveryLedger } from "./ports.js";

export class InMemoryDeliveryLedger implements DeliveryLedger<void> {
  private readonly completed = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  async runOnce(
    eventId: OutboxEvent["event_id"],
    effect: (transaction: void) => Promise<void>,
  ): Promise<boolean> {
    const key = String(eventId);
    if (this.completed.has(key)) return false;

    const existing = this.pending.get(key);
    if (existing) {
      await existing;
      return false;
    }

    const delivery = effect(undefined)
      .then(() => {
        this.completed.add(key);
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, delivery);
    await delivery;
    return true;
  }

  has(eventId: OutboxEvent["event_id"]) {
    return this.completed.has(String(eventId));
  }
}
