import { AsyncLocalStorage } from "node:async_hooks";

import type { Pool, PoolClient } from "pg";

export class PostgresUnitOfWork {
  private readonly transaction = new AsyncLocalStorage<PoolClient>();

  constructor(
    private readonly pool: Pool,
    private readonly beforeCommit?: () => void | Promise<void>,
  ) {}

  isActive(): boolean {
    return this.transaction.getStore() !== undefined;
  }

  currentClient(): PoolClient {
    const client = this.transaction.getStore();
    if (!client) throw new Error("A PostgreSQL transaction is required for this operation");
    return client;
  }

  async run<Result>(operation: () => Result | Promise<Result>): Promise<Result> {
    if (this.isActive()) return operation();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.transaction.run(client, operation);
      await this.beforeCommit?.();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
