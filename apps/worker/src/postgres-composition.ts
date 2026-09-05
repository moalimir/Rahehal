import { Pool, type PoolConfig, type PoolClient } from "pg";

import { OutboxConsumer } from "./consumer.js";
import { NotificationProjector } from "./notification-projector.js";
import { PostgresDeliveryLedger, PostgresOutboxSource } from "./postgres.js";
import type { WorkerClock } from "./ports.js";

export type PostgresWorkerComposition = {
  readonly pool: Pool;
  readonly consumer: OutboxConsumer<PoolClient>;
  close(): Promise<void>;
};

function poolConfig(environment: NodeJS.ProcessEnv): PoolConfig {
  const connectionString = environment.DATABASE_URL?.trim();
  if (connectionString) return { connectionString, max: 4 };
  const host = environment.PGHOST?.trim();
  if (!host) {
    throw new Error("The PostgreSQL worker requires DATABASE_URL or PGHOST configuration");
  }
  return {
    host,
    max: 4,
    ...(environment.PGPORT ? { port: Number(environment.PGPORT) } : {}),
    ...(environment.PGDATABASE ? { database: environment.PGDATABASE } : {}),
    ...(environment.PGUSER ? { user: environment.PGUSER } : {}),
    ...(environment.PGPASSWORD ? { password: environment.PGPASSWORD } : {}),
  };
}

/**
 * The connected worker. Claims are durable rows rather than process memory, so
 * a restart resumes exactly where the previous process stopped and read state
 * projected before the restart is already committed.
 */
export function createPostgresWorkerComposition(options: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly clock?: WorkerClock;
  readonly ids?: { next(prefix: "ntf"): string };
}): PostgresWorkerComposition {
  const environment = options.environment ?? process.env;
  const clock = options.clock ?? { now: () => new Date() };
  const pool = new Pool(poolConfig(environment));
  const ids = options.ids ?? {
    next: (prefix: "ntf") => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`,
  };
  const consumer = new OutboxConsumer<PoolClient>(
    new PostgresOutboxSource(pool, clock),
    new PostgresDeliveryLedger(pool),
    new NotificationProjector(ids),
    clock,
  );
  return {
    pool,
    consumer,
    close: async () => {
      await pool.end();
    },
  };
}
