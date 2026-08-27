import { readFile } from "node:fs/promises";

import type { Pool } from "pg";

const defaultSeedFile = new URL("../../seeds/a1a-synthetic.sql", import.meta.url);

export async function seedSyntheticData(
  pool: Pool,
  seedFile: URL = defaultSeedFile,
): Promise<void> {
  const sql = await readFile(seedFile, "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [1_919_742_212]);
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
