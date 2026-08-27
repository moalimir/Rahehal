const localDatabaseUrl = "postgresql://rahhal:rahhal-local-only@127.0.0.1:5433/rahhal";

export function databaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DATABASE_URL?.trim();
  if (configured) return configured;

  if (environment.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required when NODE_ENV=production");
  }

  return localDatabaseUrl;
}
