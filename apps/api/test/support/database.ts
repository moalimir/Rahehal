/**
 * Where the PostgreSQL integration suites connect.
 *
 * `compose.yaml` publishes PostgreSQL on `RAHHAL_POSTGRES_PORT` (default
 * 5433), so the tests derive their default from the same variable instead of
 * hard-coding a second port that silently diverges the moment `.env` sets one.
 * `RAHHAL_TEST_DATABASE_ADMIN_URL` still wins, which is how CI points the
 * suites at its own service container.
 */
export function testDatabaseAdminUrl(): URL {
  const configured = process.env.RAHHAL_TEST_DATABASE_ADMIN_URL?.trim();
  const port = process.env.RAHHAL_POSTGRES_PORT?.trim() || "5433";
  const url = new URL(
    configured || `postgresql://rahhal:rahhal-local-only@127.0.0.1:${port}/postgres`,
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("PostgreSQL tests refuse to create databases on a non-loopback host");
  }
  return url;
}
