import { Pool } from "pg";

import { databaseUrl } from "./config.js";
import { runMigrations } from "./migrations.js";

const direction = process.argv[2];
if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: migrate-cli.ts <up|down>");
}

const pool = new Pool({ connectionString: databaseUrl(), max: 1 });

try {
  const result = await runMigrations(pool, direction);
  const summary = result.applied.length > 0 ? result.applied.join(", ") : "nothing to do";
  process.stdout.write(`Database migration ${direction}: ${summary}\n`);
} finally {
  await pool.end();
}
