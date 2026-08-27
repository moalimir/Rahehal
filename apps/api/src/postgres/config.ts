import type { PoolConfig } from "pg";

const localDatabaseUrl = "postgresql://rahhal:rahhal-local-only@127.0.0.1:5433/rahhal";

function databasePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PGPORT must be an integer from 1 to 65535");
  }
  return parsed;
}

export function databaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DATABASE_URL?.trim();
  if (configured) return configured;

  if (environment.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required when NODE_ENV=production");
  }

  return localDatabaseUrl;
}

export function databasePoolMax(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = environment.RAHHAL_DATABASE_POOL_MAX?.trim() ?? "10";
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("RAHHAL_DATABASE_POOL_MAX must be an integer from 1 to 100");
  }
  return parsed;
}

export function databaseHost(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DATABASE_URL?.trim();
  if (configured) return new URL(configured).hostname;
  return environment.PGHOST?.trim() || new URL(databaseUrl(environment)).hostname;
}

export function databasePoolConfig(environment: NodeJS.ProcessEnv = process.env): PoolConfig {
  const max = databasePoolMax(environment);
  const connectionString = environment.DATABASE_URL?.trim();
  if (connectionString) return { connectionString, max };

  const pgValues = [
    environment.PGHOST,
    environment.PGPORT,
    environment.PGDATABASE,
    environment.PGUSER,
    environment.PGPASSWORD,
  ];
  if (pgValues.some((value) => value !== undefined)) {
    const host = environment.PGHOST?.trim();
    const database = environment.PGDATABASE?.trim();
    const user = environment.PGUSER?.trim();
    if (!host || !database || !user || environment.PGPASSWORD === undefined) {
      throw new Error(
        "PGHOST, PGDATABASE, PGUSER, and PGPASSWORD are all required for split PostgreSQL configuration",
      );
    }
    return {
      host,
      port: databasePort(environment.PGPORT),
      database,
      user,
      password: environment.PGPASSWORD,
      max,
    };
  }

  return { connectionString: databaseUrl(environment), max };
}
