import { Pool } from "pg";

import { databaseHost, databasePoolConfig } from "./config.js";
import { runMigrations } from "./migrations.js";
import { seedSyntheticData } from "./seeds.js";

if (
  process.env.NODE_ENV === "production" ||
  process.env.RAHHAL_LOCAL_COMPOSE !== "true" ||
  databaseHost() !== "postgres"
) {
  throw new Error(
    "Local Compose database setup requires RAHHAL_LOCAL_COMPOSE=true, NODE_ENV!=production, and the internal postgres host",
  );
}

const pool = new Pool({ ...databasePoolConfig(), max: 1 });

try {
  const result = await runMigrations(pool, "up");
  await seedSyntheticData(pool);
  const summary = result.applied.length > 0 ? result.applied.join(", ") : "already current";
  process.stdout.write(`Local Compose database ready: ${summary}\n`);
} finally {
  await pool.end();
}
