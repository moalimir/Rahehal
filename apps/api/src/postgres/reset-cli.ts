import { Pool } from "pg";

import { databaseHost, databasePoolConfig } from "./config.js";
import { runMigrations } from "./migrations.js";
import { seedSyntheticData } from "./seeds.js";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

if (process.env.NODE_ENV === "production" || !loopbackHosts.has(databaseHost())) {
  throw new Error("Database reset is restricted to a non-production loopback database");
}

const pool = new Pool({ ...databasePoolConfig(), max: 1 });

try {
  const reverted: string[] = [];
  while (true) {
    const result = await runMigrations(pool, "down");
    if (result.applied.length === 0) break;
    reverted.push(...result.applied);
  }
  const applied = await runMigrations(pool, "up");
  await seedSyntheticData(pool);
  process.stdout.write(
    `Local database reset: reverted ${reverted.length}, applied ${applied.applied.length}, seeded synthetic data\n`,
  );
} finally {
  await pool.end();
}
