import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  ChallengeResource,
  MutationSuccessEnvelope,
  SuccessEnvelope,
} from "@rahhal/contracts";
import { parseCorrelationId, parseTenantId, parseUserId, parseWorkspaceId } from "@rahhal/domain";

import { buildApi } from "../src/app.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { createRuntimeApiComposition } from "../src/runtime-composition.js";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";

const defaultAdminUrl = "postgresql://rahhal:rahhal-local-only@127.0.0.1:5433/postgres";
const adminUrl = new URL(process.env.RAHHAL_TEST_DATABASE_ADMIN_URL ?? defaultAdminUrl);

if (!["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname)) {
  throw new Error("PostgreSQL challenge tests refuse to create databases on a non-loopback host");
}

const testDatabaseName = `rahhal_a1c_test_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

const ownerAccessToken = "local-a1b-access-owner-alpha";
const ownerUserId = parseUserId("usr_owner_alpha");
const ownerTenantId = parseTenantId("ten_org_alpha");
const ownerWorkspaceId = parseWorkspaceId("wsp_org_alpha");
const clock = { now: () => new Date("2026-08-27T08:30:00.000Z") };

let admin: Client;
let database: Pool;
let adminConnected = false;
let databaseCreated = false;
let databasePoolCreated = false;

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

function context(key: string, ordinal: number) {
  return {
    actorUserId: ownerUserId,
    tenantId: ownerTenantId,
    workspaceId: ownerWorkspaceId,
    role: "org:owner" as const,
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_a1c_${ordinal.toString().padStart(4, "0")}`),
  };
}

function adapter(options: { readonly beforeCommit?: () => void } = {}) {
  const unitOfWork = new PostgresUnitOfWork(database, options.beforeCommit);
  return new PostgresChallengeAdapter(unitOfWork, clock, new MonotonicIdFactory());
}

function apiHeaders(idempotencyKey?: string) {
  return {
    authorization: `Bearer ${ownerAccessToken}`,
    "x-workspace-id": ownerWorkspaceId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function postgresRuntimeEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    RAHHAL_API_MODE: "postgres",
    DATABASE_URL: testDatabaseUrl.toString(),
    RAHHAL_DATABASE_POOL_MAX: "4",
  };
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  databaseCreated = true;
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 8 });
  databasePoolCreated = true;
}, 60_000);

beforeEach(async () => {
  while ((await runMigrations(database, "down")).applied.length > 0) {
    // Revert every migration so each authoritative behavior starts cleanly.
  }
  await runMigrations(database, "up");
  await seedSyntheticData(database);
}, 60_000);

afterAll(async () => {
  if (databasePoolCreated) await database.end();
  if (adminConnected) {
    if (databaseCreated) {
      await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
    }
    await admin.end();
  }
});

describe("A1c authoritative PostgreSQL challenge adapter", () => {
  it("creates and saves scoped immutable versions with atomic evidence", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      { expected_version: 0, draft: { title: "مسئله عملیاتی" } },
      context("a1c-create-challenge-01", 1),
    );
    const replay = await challenges.create(
      { expected_version: 0, draft: { title: "مسئله عملیاتی" } },
      context("a1c-create-challenge-01", 1),
    );
    expect(replay).toEqual({
      ...created,
      receipt: { ...created.receipt, idempotent: true },
    });

    const first = await challenges.getScoped(
      context("unused-scope-key", 2),
      created.receipt.entity_id,
    );
    expect(first).toMatchObject({ version: 1, content: { title: "مسئله عملیاتی" } });
    const saved = await challenges.patch(
      created.receipt.entity_id,
      { expected_version: 1, patch: { summary: "شرح نسخه دوم", authoring_status: "ready" } },
      context("a1c-save-challenge-001", 3),
    );
    expect(saved.entityVersion).toBe(2);

    const current = await challenges.getScoped(
      context("unused-scope-key-2", 4),
      created.receipt.entity_id,
    );
    expect(current).toMatchObject({
      version: 2,
      authoring_status: "ready",
      content: { title: "مسئله عملیاتی", summary: "شرح نسخه دوم" },
    });
    await expect(
      challenges.getScoped(
        {
          actorUserId: ownerUserId,
          tenantId: parseTenantId("ten_org_beta"),
          workspaceId: parseWorkspaceId("wsp_org_beta"),
          role: "org:owner",
        },
        created.receipt.entity_id,
      ),
    ).resolves.toBeNull();

    const evidence = await database.query<{
      versions: string;
      audits: string;
      receipts: string;
      events: string;
      replays: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_version WHERE challenge_id = $1) AS versions,
          (SELECT count(*) FROM audit_event
            WHERE target_type = 'challenge' AND target_id = $1
              AND reason_code = 'MUTATION_COMMITTED') AS audits,
          (SELECT count(*) FROM mutation_receipt
            WHERE entity_type = 'challenge' AND entity_id = $1) AS receipts,
          (SELECT count(*) FROM outbox_event
            WHERE aggregate_type = 'challenge' AND aggregate_id = $1) AS events,
          (SELECT count(*) FROM idempotency_key
            WHERE tenant_id = $2 AND idempotency_key LIKE 'a1c-%') AS replays
      `,
      [created.receipt.entity_id, ownerTenantId],
    );
    expect(evidence.rows[0]).toEqual({
      versions: "2",
      audits: "2",
      receipts: "2",
      events: "2",
      replays: "2",
    });
  });

  it("collapses concurrent create retries and rejects key reuse or stale saves", async () => {
    const challenges = adapter();
    const command = context("a1c-concurrent-create", 5);
    const body = { expected_version: 0 as const, draft: { title: "همزمان" } };
    const outcomes = await Promise.all([
      challenges.create(body, command),
      challenges.create(body, command),
    ]);
    expect(outcomes.map((outcome) => outcome.receipt.idempotent).sort()).toEqual([false, true]);
    expect(outcomes[0]?.receipt.entity_id).toBe(outcomes[1]?.receipt.entity_id);

    await expect(
      challenges.create({ expected_version: 0, draft: { title: "درخواست متفاوت" } }, command),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    await expect(
      challenges.patch(
        outcomes[0]!.receipt.entity_id,
        { expected_version: 0, patch: { summary: "قدیمی" } },
        context("a1c-stale-save-key", 6),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });

  it("rolls back aggregate, version, receipt, audit, outbox, and replay together", async () => {
    const before = await database.query<{ snapshot: string }>(`
      SELECT jsonb_build_object(
        'challenges', (SELECT count(*) FROM challenge),
        'versions', (SELECT count(*) FROM challenge_version),
        'audits', (SELECT count(*) FROM audit_event),
        'receipts', (SELECT count(*) FROM mutation_receipt),
        'events', (SELECT count(*) FROM outbox_event),
        'replays', (SELECT count(*) FROM idempotency_key)
      )::text AS snapshot
    `);
    const failing = adapter({
      beforeCommit: () => {
        throw new Error("forced challenge commit failure");
      },
    });
    await expect(
      failing.create(
        { expected_version: 0, draft: { title: "نباید ثبت شود" } },
        context("a1c-forced-rollback", 7),
      ),
    ).rejects.toThrow("forced challenge commit failure");

    const after = await database.query<{ snapshot: string }>(`
      SELECT jsonb_build_object(
        'challenges', (SELECT count(*) FROM challenge),
        'versions', (SELECT count(*) FROM challenge_version),
        'audits', (SELECT count(*) FROM audit_event),
        'receipts', (SELECT count(*) FROM mutation_receipt),
        'events', (SELECT count(*) FROM outbox_event),
        'replays', (SELECT count(*) FROM idempotency_key)
      )::text AS snapshot
    `);
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  it("keeps a challenge authoritative across fresh API runtime compositions", async () => {
    const environment = postgresRuntimeEnvironment();
    const firstComposition = await createRuntimeApiComposition(environment);
    const firstApi = buildApi(firstComposition.ports);
    const createdResponse = await firstApi.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: apiHeaders("a1c-api-create-restart"),
      payload: { expected_version: 0, draft: { title: "ماندگار پس از راه‌اندازی" } },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<MutationSuccessEnvelope>();
    const challengeId = created.data.entity_id;
    await firstApi.close();
    await firstComposition.close();

    const secondComposition = await createRuntimeApiComposition(environment);
    const secondApi = buildApi(secondComposition.ports);
    const readAfterRestart = await secondApi.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: apiHeaders(),
    });
    expect(readAfterRestart.statusCode).toBe(200);
    expect(readAfterRestart.json<SuccessEnvelope<ChallengeResource>>().data).toMatchObject({
      id: challengeId,
      version: 1,
      content: { title: "ماندگار پس از راه‌اندازی" },
    });

    const hidden = await secondApi.inject({
      method: "GET",
      url: "/api/v1/challenges/chl_missing_a1c",
      headers: apiHeaders(),
    });
    expect(hidden.statusCode).toBe(404);
    const denial = await database.query<{ count: string }>(`
      SELECT count(*) AS count
      FROM audit_event
      WHERE action = 'challenge:read'
        AND outcome = 'denied'
        AND reason_code = 'record_unreachable'
        AND target_id = 'chl_missing_a1c'
    `);
    expect(denial.rows[0]?.count).toBe("1");

    const savedResponse = await secondApi.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${challengeId}`,
      headers: apiHeaders("a1c-api-save-restart"),
      payload: { expected_version: 1, patch: { summary: "نسخه پایدار دوم" } },
    });
    expect(savedResponse.statusCode).toBe(200);
    await secondApi.close();
    await secondComposition.close();

    const thirdComposition = await createRuntimeApiComposition(environment);
    const thirdApi = buildApi(thirdComposition.ports);
    const readAfterSecondRestart = await thirdApi.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: apiHeaders(),
    });
    expect(readAfterSecondRestart.statusCode).toBe(200);
    expect(readAfterSecondRestart.json<SuccessEnvelope<ChallengeResource>>().data).toMatchObject({
      version: 2,
      content: { title: "ماندگار پس از راه‌اندازی", summary: "نسخه پایدار دوم" },
    });
    await thirdApi.close();
    await thirdComposition.close();
  });

  it("requires explicit runtime mode and never falls back to demo authority", async () => {
    await expect(createRuntimeApiComposition({ NODE_ENV: "test" })).rejects.toThrow(
      "no runtime fallback",
    );
    await expect(
      createRuntimeApiComposition({ NODE_ENV: "test", RAHHAL_API_MODE: "unknown" }),
    ).rejects.toThrow("no runtime fallback");
    await expect(
      createRuntimeApiComposition({ NODE_ENV: "production", RAHHAL_API_MODE: "postgres" }),
    ).rejects.toThrow("local-integration-only");
  });
});
