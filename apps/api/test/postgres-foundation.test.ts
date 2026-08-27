import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";

const defaultAdminUrl = "postgresql://rahhal:rahhal-local-only@127.0.0.1:5433/postgres";
const adminUrl = new URL(process.env.RAHHAL_TEST_DATABASE_ADMIN_URL ?? defaultAdminUrl);

if (!["127.0.0.1", "localhost", "::1"].includes(adminUrl.hostname)) {
  throw new Error("PostgreSQL foundation tests refuse to create databases on a non-loopback host");
}

const testDatabaseName = `rahhal_a1a_test_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

let admin: Client;
let database: Pool;
let adminConnected = false;
let databaseCreated = false;
let databasePoolCreated = false;

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

async function expectDatabaseError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected PostgreSQL error ${code}`);
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  databaseCreated = true;
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 4 });
  databasePoolCreated = true;

  const firstUp = await runMigrations(database, "up");
  expect(firstUp.applied).toEqual(["0001_a1a_foundation"]);

  const down = await runMigrations(database, "down");
  expect(down.applied).toEqual(["0001_a1a_foundation"]);
  const removed = await database.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.tenant')::text AS table_name",
  );
  expect(removed.rows[0]?.table_name).toBeNull();

  const secondDown = await runMigrations(database, "down");
  expect(secondDown.applied).toEqual([]);
  const secondUp = await runMigrations(database, "up");
  expect(secondUp.applied).toEqual(["0001_a1a_foundation"]);
  const noOpUp = await runMigrations(database, "up");
  expect(noOpUp.applied).toEqual([]);

  await seedSyntheticData(database);
  await seedSyntheticData(database);
}, 60_000);

afterAll(async () => {
  if (databasePoolCreated) await database.end();
  if (adminConnected) {
    if (databaseCreated) {
      await admin.query(
        `DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)} WITH (FORCE)`,
      );
    }
    await admin.end();
  }
});

describe("A1a PostgreSQL foundation", () => {
  it("migrates every required table and records the checksum", async () => {
    const expectedTables = [
      "access_grant",
      "app_session",
      "app_user",
      "audit_event",
      "challenge",
      "challenge_version",
      "idempotency_key",
      "identity_link",
      "membership",
      "outbox_event",
      "tenant",
      "workspace",
    ];
    const tables = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      ...expectedTables.slice(0, 10),
      "schema_migration",
      ...expectedTables.slice(10),
    ]);

    const ledger = await database.query<{ id: string; checksum: string }>(
      "SELECT id, checksum FROM schema_migration",
    );
    expect(ledger.rows).toEqual([
      { id: "0001_a1a_foundation", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it("applies deterministic, rerunnable synthetic seeds", async () => {
    const counts = await database.query<{
      tenants: string;
      users: string;
      workspaces: string;
      challenges: string;
      audit_events: string;
      outbox_events: string;
    }>(`
      SELECT
        (SELECT count(*) FROM tenant) AS tenants,
        (SELECT count(*) FROM app_user) AS users,
        (SELECT count(*) FROM workspace) AS workspaces,
        (SELECT count(*) FROM challenge) AS challenges,
        (SELECT count(*) FROM audit_event) AS audit_events,
        (SELECT count(*) FROM outbox_event) AS outbox_events
    `);
    expect(counts.rows[0]).toEqual({
      tenants: "4",
      users: "3",
      workspaces: "5",
      challenges: "1",
      audit_events: "1",
      outbox_events: "1",
    });
  });

  it("enforces tenant/workspace and membership compatibility", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO workspace (
          id, tenant_id, tenant_kind, kind, name, owner_user_id, team_kind
        ) VALUES (
          'wsp_invalid_org', 'ten_solver_alpha', 'solver', 'org', 'Invalid', NULL, NULL
        )
      `),
      "23514",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO membership (
          id, tenant_id, workspace_id, workspace_kind, user_id, role, state
        ) VALUES (
          'mem_invalid_role', 'ten_org_alpha', 'wsp_org_alpha', 'org',
          'usr_solver_alpha', 'team:viewer', 'active'
        )
      `),
      "23514",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO membership (
          id, tenant_id, workspace_id, workspace_kind, user_id, role, state
        ) VALUES (
          'mem_invalid_scope', 'ten_org_beta', 'wsp_org_alpha', 'org',
          'usr_solver_alpha', 'org:member', 'active'
        )
      `),
      "23503",
    );
  });

  it("keys identity links by issuer and subject", async () => {
    await database.query(`
      INSERT INTO app_user (id, display_name, primary_email)
      VALUES ('usr_identity_duplicate', 'Duplicate Identity', 'duplicate@synthetic.invalid')
    `);
    await expectDatabaseError(
      database.query(`
        INSERT INTO identity_link (id, user_id, issuer, subject)
        VALUES (
          'idl_identity_duplicate', 'usr_identity_duplicate',
          'https://oidc.synthetic.invalid', 'owner-alpha'
        )
      `),
      "23505",
    );
  });

  it("stores only session token digests and validates their shape", async () => {
    const columns = await database.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_session'
    `);
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("access_token_digest");
    expect(names).toContain("refresh_token_digest");
    expect(names).not.toContain("access_token");
    expect(names).not.toContain("refresh_token");

    await expectDatabaseError(
      database.query(`
        INSERT INTO app_session (
          id, user_id, token_family_id, access_token_digest, refresh_token_digest,
          access_expires_at, refresh_expires_at
        ) VALUES (
          'ses_invalid_digest', 'usr_solver_alpha', 'family_invalid_digest', 'raw-token',
          repeat('d', 64), clock_timestamp() + interval '5 minutes',
          clock_timestamp() + interval '1 day'
        )
      `),
      "23514",
    );
  });

  it("requires narrow cross-tenant access grants", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO access_grant (
          id, grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
          grantee_workspace_id, resource_type, resource_id, capability, state,
          expires_at, created_by_user_id
        ) VALUES (
          'agr_same_tenant', 'ten_org_alpha', 'wsp_org_alpha', 'ten_org_alpha',
          'wsp_org_alpha', 'challenge', 'chl_synthetic_alpha', 'read', 'active',
          clock_timestamp() + interval '1 day', 'usr_owner_alpha'
        )
      `),
      "23514",
    );
  });

  it("restricts challenges to organization workspaces and the canonical lifecycle", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO challenge (
          id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
          current_version_id, created_by_user_id
        ) VALUES (
          'chl_invalid_solver', 'ten_solver_alpha', 'organization', 'wsp_team_alpha',
          'org', 'draft', 'chv_invalid_solver_v1', 'usr_solver_alpha'
        )
      `),
      "23503",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO challenge (
          id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
          current_version_id, created_by_user_id
        ) VALUES (
          'chl_invalid_stage', 'ten_org_alpha', 'organization', 'wsp_org_alpha',
          'org', 'ready', 'chv_invalid_stage_v1', 'usr_owner_alpha'
        )
      `),
      "23514",
    );
  });

  it("makes locked challenge versions and audit evidence immutable", async () => {
    await database.query(`
      INSERT INTO challenge_version (
        id, challenge_id, version_number, content, created_by_user_id, locked_at, lock_reason
      ) VALUES (
        'chv_synthetic_alpha_v2', 'chl_synthetic_alpha', 2, '{"title":"locked"}'::jsonb,
        'usr_owner_alpha', clock_timestamp(), 'submitted'
      )
    `);
    await expectDatabaseError(
      database.query(`
        UPDATE challenge_version
        SET content = '{"title":"tampered"}'::jsonb
        WHERE id = 'chv_synthetic_alpha_v2'
      `),
      "55000",
    );
    await expectDatabaseError(
      database.query("DELETE FROM audit_event WHERE id = 'aud_seed_challenge_alpha'"),
      "55000",
    );
  });

  it("keeps outbox content immutable while allowing delivery bookkeeping", async () => {
    await database.query(`
      UPDATE outbox_event
      SET attempt_count = attempt_count + 1, locked_at = clock_timestamp()
      WHERE id = 'evt_seed_challenge_alpha'
    `);
    await expectDatabaseError(
      database.query(`
        UPDATE outbox_event
        SET payload = '{"tampered":true}'::jsonb
        WHERE id = 'evt_seed_challenge_alpha'
      `),
      "55000",
    );
    await expectDatabaseError(
      database.query(`
        UPDATE outbox_event
        SET schema_version = 2
        WHERE id = 'evt_seed_challenge_alpha'
      `),
      "55000",
    );
  });

  it("scopes and deduplicates idempotency records", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO idempotency_key (
          id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
          request_hash, status, expires_at
        ) VALUES (
          'idk_invalid_scope', 'tenant', 'ten_org_alpha', repeat('e', 64),
          'invalid-scope-key', repeat('f', 64), 'in_progress',
          clock_timestamp() + interval '1 day'
        )
      `),
      "23514",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO idempotency_key (
          id, scope_kind, tenant_id, idempotency_key, request_hash, status,
          response_status, response_body, expires_at
        ) VALUES (
          'idk_duplicate_scope', 'tenant', 'ten_org_alpha', 'seed-create-challenge-alpha',
          repeat('0', 64), 'completed', 201, '{}'::jsonb,
          clock_timestamp() + interval '1 day'
        )
      `),
      "23505",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO idempotency_key (
          id, scope_kind, credential_fingerprint, idempotency_key, request_hash,
          status, response_status, response_body, expires_at
        ) VALUES (
          'idk_raw_session_token', 'credential', repeat('1', 64),
          'session-exchange-replay', repeat('2', 64), 'completed', 200,
          '{"tokens":{"access_token":"raw","refresh_token":"raw"}}'::jsonb,
          clock_timestamp() + interval '1 day'
        )
      `),
      "23514",
    );
  });
});
