import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import type { Pool, PoolClient } from "pg";

const migrationLockId = 1_919_742_211;
const migrationNamePattern = /^(\d{4}_[a-z0-9_]+)\.(up|down)\.sql$/;
const defaultMigrationDirectory = new URL("../../migrations/", import.meta.url);

type Migration = {
  readonly id: string;
  readonly upSql: string;
  readonly downSql: string;
  readonly checksum: string;
};

export type MigrationResult = {
  readonly direction: "up" | "down";
  readonly applied: readonly string[];
};

async function loadMigrations(directory: URL): Promise<readonly Migration[]> {
  const names = await readdir(directory);
  const pairs = new Map<string, Partial<Record<"up" | "down", string>>>();

  for (const name of names) {
    const match = migrationNamePattern.exec(name);
    if (!match) continue;

    const id = match[1];
    const direction = match[2];
    if (id === undefined || (direction !== "up" && direction !== "down")) {
      throw new Error(`Invalid migration filename ${name}`);
    }
    const pair = pairs.get(id) ?? {};
    pair[direction] = await readFile(new URL(name, directory), "utf8");
    pairs.set(id, pair);
  }

  return [...pairs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, pair]) => {
      if (pair.up === undefined || pair.down === undefined) {
        throw new Error(`Migration ${id} must have matching up and down SQL files`);
      }

      return {
        id,
        upSql: pair.up,
        downSql: pair.down,
        checksum: createHash("sha256").update(pair.up).update("\0").update(pair.down).digest("hex"),
      };
    });
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id text PRIMARY KEY,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

async function appliedMigrations(client: PoolClient): Promise<ReadonlyMap<string, string>> {
  const result = await client.query<{ id: string; checksum: string }>(
    "SELECT id, checksum FROM schema_migration ORDER BY id",
  );
  return new Map(result.rows.map((row) => [row.id, row.checksum]));
}

async function inTransaction(client: PoolClient, operation: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await operation();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations(
  pool: Pool,
  direction: "up" | "down",
  directory: URL = defaultMigrationDirectory,
): Promise<MigrationResult> {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    await ensureMigrationTable(client);
    const applied = await appliedMigrations(client);
    const knownIds = new Set(migrations.map((migration) => migration.id));

    for (const [id] of applied) {
      if (!knownIds.has(id)) {
        throw new Error(`Database contains unknown migration ${id}`);
      }
    }

    for (const migration of migrations) {
      const recordedChecksum = applied.get(migration.id);
      if (recordedChecksum !== undefined && recordedChecksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for applied migration ${migration.id}`);
      }
    }

    if (direction === "up") {
      const pending = migrations.filter((migration) => !applied.has(migration.id));
      for (const migration of pending) {
        await inTransaction(client, async () => {
          await client.query(migration.upSql);
          await client.query("INSERT INTO schema_migration (id, checksum) VALUES ($1, $2)", [
            migration.id,
            migration.checksum,
          ]);
        });
      }
      return { direction, applied: pending.map((migration) => migration.id) };
    }

    const latestApplied = [...migrations].reverse().find((migration) => applied.has(migration.id));
    if (!latestApplied) return { direction, applied: [] };

    await inTransaction(client, async () => {
      await client.query(latestApplied.downSql);
      await client.query("DELETE FROM schema_migration WHERE id = $1", [latestApplied.id]);
    });
    return { direction, applied: [latestApplied.id] };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    } finally {
      client.release();
    }
  }
}
