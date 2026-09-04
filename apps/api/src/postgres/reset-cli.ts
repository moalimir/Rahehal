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
  // Recreate the schema rather than walking the down migrations. Down
  // migrations legitimately refuse to discard evidence -- `0017` stops a
  // rollback that would drop clarification/revision workflow history -- so a
  // reset built on them cannot reset a database that has exercised C5, which
  // is exactly the database a developer needs to reset. This path is already
  // restricted to a non-production loopback host above, and dropping the
  // schema is what "reset" means here; the evidence guards stay in force for
  // every real `db:migrate:down`.
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  const applied = await runMigrations(pool, "up");
  await seedSyntheticData(pool);
  process.stdout.write(
    `Local database reset: recreated the schema, applied ${applied.applied.length}, seeded synthetic data\n`,
  );
} finally {
  await pool.end();
}
