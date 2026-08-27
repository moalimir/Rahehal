import { readdir, readFile } from "node:fs/promises";

import type { Pool } from "pg";

const defaultSeedDirectory = new URL("../../seeds/", import.meta.url);

export async function seedSyntheticData(
  pool: Pool,
  seedDirectory: URL = defaultSeedDirectory,
): Promise<void> {
  const seedFiles = (await readdir(seedDirectory))
    .filter((name) => /^[a-z0-9][a-z0-9-]*\.sql$/.test(name))
    .sort();
  if (seedFiles.length === 0) throw new Error("No synthetic seed SQL files were found");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [1_919_742_212]);
    for (const seedFile of seedFiles) {
      await client.query(await readFile(new URL(seedFile, seedDirectory), "utf8"));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
