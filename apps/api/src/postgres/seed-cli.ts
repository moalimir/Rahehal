import { Pool } from "pg";

import { databaseUrl } from "./config.js";
import { seedSyntheticData } from "./seeds.js";

const connectionString = databaseUrl();
const target = new URL(connectionString);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

if (process.env.NODE_ENV === "production" || !loopbackHosts.has(target.hostname)) {
  throw new Error("Synthetic seeds are restricted to a non-production loopback database");
}

const pool = new Pool({ connectionString, max: 1 });

try {
  await seedSyntheticData(pool);
  process.stdout.write("Synthetic local seed applied\n");
} finally {
  await pool.end();
}
