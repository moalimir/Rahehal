import { describe, expect, it } from "vitest";

import {
  databaseHost,
  databasePoolConfig,
  databasePoolMax,
  databaseUrl,
} from "../src/postgres/config.js";

describe("PostgreSQL runtime configuration", () => {
  it("uses the loopback development database only outside production", () => {
    expect(databaseUrl({ NODE_ENV: "test" })).toBe(
      "postgresql://rahhal:rahhal-local-only@127.0.0.1:5433/rahhal",
    );
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow("DATABASE_URL is required");
  });

  it("accepts split Compose credentials without URL interpretation", () => {
    const environment = {
      NODE_ENV: "development",
      PGHOST: "postgres",
      PGPORT: "5432",
      PGDATABASE: "rahhal",
      PGUSER: "rahhal",
      PGPASSWORD: "reserved:@/% password",
      RAHHAL_DATABASE_POOL_MAX: "7",
    };
    expect(databaseHost(environment)).toBe("postgres");
    expect(databasePoolConfig(environment)).toEqual({
      host: "postgres",
      port: 5432,
      database: "rahhal",
      user: "rahhal",
      password: "reserved:@/% password",
      max: 7,
    });
  });

  it("rejects partial split configuration and unsafe pool values", () => {
    expect(() => databasePoolConfig({ NODE_ENV: "test", PGHOST: "postgres" })).toThrow(
      "are all required",
    );
    expect(() => databasePoolMax({ RAHHAL_DATABASE_POOL_MAX: "0" })).toThrow(
      "integer from 1 to 100",
    );
    expect(() =>
      databasePoolConfig({
        NODE_ENV: "test",
        PGHOST: "postgres",
        PGPORT: "not-a-port",
        PGDATABASE: "rahhal",
        PGUSER: "rahhal",
        PGPASSWORD: "local",
      }),
    ).toThrow("PGPORT must be an integer");
  });
});
