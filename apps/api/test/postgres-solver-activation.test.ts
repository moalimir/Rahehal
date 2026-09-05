import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DevelopmentContactVerificationAdapter } from "../src/development-contact-verification.js";
import { RandomIdFactory } from "../src/primitives.js";
import { PostgresIdentityWorkspaceAdapter } from "../src/postgres/identity-workspace.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresSolverActivationAdapter } from "../src/postgres/solver-activation.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { HmacSessionCredentialIssuer } from "../src/session-credentials.js";
import { InMemoryAccessDecisionAudit } from "../src/in-memory-audit.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_c7_test_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

let admin: Client;
let database: Pool;
let adminConnected = false;
let databaseCreated = false;
let databasePoolCreated = false;

class MutableClock {
  private milliseconds = Date.parse("2026-01-01T00:00:00.000Z");
  now() {
    return new Date(this.milliseconds);
  }
}

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  databaseCreated = true;
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 6 });
  databasePoolCreated = true;
}, 60_000);

beforeEach(async () => {
  await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations(database, "up");
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

describe("C7 PostgreSQL solver activation", () => {
  function adapters() {
    const clock = new MutableClock();
    const ids = new RandomIdFactory();
    const unitOfWork = new PostgresUnitOfWork(database);
    const provider = new DevelopmentContactVerificationAdapter(
      { code: "12345", flowSecret: "postgres-c7-contact-flow-secret-000000001" },
      clock,
      ids,
    );
    const credentials = new HmacSessionCredentialIssuer(
      "postgres-c7-session-credential-secret-000001",
    );
    const activation = new PostgresSolverActivationAdapter(
      unitOfWork,
      provider,
      credentials,
      clock,
      ids,
    );
    const noOidc = {
      async exchange() {
        return null;
      },
      async consume() {},
    };
    const identity = new PostgresIdentityWorkspaceAdapter(
      unitOfWork,
      noOidc,
      credentials,
      clock,
      ids,
      new InMemoryAccessDecisionAudit(),
    );
    return { activation, provider, identity };
  }

  async function proof(
    provider: DevelopmentContactVerificationAdapter,
    destination: string,
    suffix: string,
    channel: "email" | "mobile" = "email",
  ) {
    const attempt = await provider.start(
      { expected_version: 0, channel, destination },
      { idempotencyKey: `start-${suffix}`, correlationId: `cor_start_${suffix}` as never },
    );
    return provider.verify(
      attempt.attempt_id,
      { expected_version: attempt.version, code: "12345" },
      { idempotencyKey: `verify-${suffix}`, correlationId: `cor_verify_${suffix}` as never },
    );
  }

  it("atomically creates exactly one durable activation graph and replays its receipt", async () => {
    const { activation, provider, identity } = adapters();
    const verified = await proof(provider, "durable@example.test", "durable");
    const body = {
      expected_version: 0 as const,
      verification_token: verified.verification_token,
      display_name: "حل‌گر پایدار",
      start_intent: "team" as const,
    };
    const command = {
      idempotencyKey: "activate-durable-0001",
      correlationId: "cor_activate_durable" as never,
    };
    const first = await activation.activate(body, command);
    const replay = await activation.activate(body, command);

    expect(first.receipt.next_actions).toEqual(["create_team"]);
    expect(first.receipt.idempotent).toBe(false);
    expect(replay).toEqual({
      ...first,
      receipt: { ...first.receipt, idempotent: true },
    });
    const counts = await database.query<{
      users: string;
      tenants: string;
      workspaces: string;
      memberships: string;
      profiles: string;
      verifications: string;
      activations: string;
      receipts: string;
      consumptions: string;
    }>(`SELECT
      (SELECT count(*) FROM app_user) AS users,
      (SELECT count(*) FROM tenant) AS tenants,
      (SELECT count(*) FROM workspace) AS workspaces,
      (SELECT count(*) FROM membership) AS memberships,
      (SELECT count(*) FROM solver_workspace_profile) AS profiles,
      (SELECT count(*) FROM verification_record) AS verifications,
      (SELECT count(*) FROM solver_activation) AS activations,
      (SELECT count(*) FROM mutation_receipt) AS receipts,
      (SELECT count(*) FROM contact_verification_consumption) AS consumptions`);
    expect(counts.rows[0]).toEqual({
      users: "1",
      tenants: "1",
      workspaces: "1",
      memberships: "1",
      profiles: "1",
      verifications: "1",
      activations: "1",
      receipts: "1",
      consumptions: "1",
    });
    await expect(
      activation.activate(body, {
        idempotencyKey: "activate-durable-0002",
        correlationId: "cor_activate_again" as never,
      }),
    ).rejects.toMatchObject({ code: "NO_ACCESS" });

    const session = await identity.authenticate(first.tokens.access_token);
    expect(session).toMatchObject({
      userId: first.activation.user_id,
      activeWorkspaceId: first.activation.individual_workspace_id,
    });
    const me = await identity.getMe(session!);
    expect(me).toMatchObject({
      user: {
        primary_email: "durable@example.test",
        email_verified: true,
        primary_phone: null,
        phone_verified: false,
      },
      active_context: { workspace_id: first.activation.individual_workspace_id },
    });
    const event = await database.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM outbox_event WHERE event_type = 'solver.activated'",
    );
    expect(event.rows[0]?.payload).toEqual({
      entity_version: 1,
      user_id: first.activation.user_id,
      workspace_id: first.activation.individual_workspace_id,
      start_intent: "team",
    });
  });

  it("supports mobile-only activation and a fresh verified-contact sign-in after restart", async () => {
    const firstRuntime = adapters();
    const verified = await proof(
      firstRuntime.provider,
      "+98 912 123 4567",
      "mobile-activate",
      "mobile",
    );
    const activated = await firstRuntime.activation.activate(
      {
        expected_version: 0,
        verification_token: verified.verification_token,
        display_name: "حل‌گر همراه",
        start_intent: "individual",
      },
      { idempotencyKey: "activate-mobile-0001", correlationId: "cor_mobile_activate" as never },
    );
    const stored = await database.query<{
      primary_email: string | null;
      primary_phone: string | null;
      phone_verified: boolean;
    }>("SELECT primary_email::text, primary_phone, phone_verified FROM app_user");
    expect(stored.rows[0]).toEqual({
      primary_email: null,
      primary_phone: "09121234567",
      phone_verified: true,
    });

    // A restarted provider creates a fresh challenge/assertion; app identity
    // and one-time consumption remain durable in PostgreSQL.
    const secondRuntime = adapters();
    const signInProof = await proof(
      secondRuntime.provider,
      "09121234567",
      "mobile-signin",
      "mobile",
    );
    const signedIn = await secondRuntime.activation.exchangeContact(
      { expected_version: 0, verification_token: signInProof.verification_token },
      { idempotencyKey: "signin-mobile-0001", correlationId: "cor_mobile_signin" as never },
    );
    expect(signedIn.receipt.next_actions).toEqual(["select_workspace"]);
    expect(signedIn.tokens.session_id).not.toBe(activated.tokens.session_id);
    const session = await secondRuntime.identity.authenticate(signedIn.tokens.access_token);
    // A returning solver enters the permanent individual workspace, exactly as
    // a first activation does. This assertion previously required `null`,
    // which produced a signed-in session no workspace-scoped read could use:
    // `/app` offered a chooser for the single workspace it had, and every
    // connected page family fell back to its anonymous state. `select_workspace`
    // stays the next action because switching is still available.
    expect(session).toMatchObject({
      userId: activated.activation.user_id,
      activeWorkspaceId: activated.activation.individual_workspace_id,
    });
    const durableCounts = await database.query<{ users: string; workspaces: string }>(
      `SELECT (SELECT count(*) FROM app_user) AS users,
              (SELECT count(*) FROM workspace WHERE kind = 'individual') AS workspaces`,
    );
    expect(durableCounts.rows[0]).toEqual({ users: "1", workspaces: "1" });
  });

  it("serializes concurrent activations for the same verified contact", async () => {
    const { activation, provider } = adapters();
    const [leftProof, rightProof] = await Promise.all([
      proof(provider, "one.human@example.test", "concurrent-left"),
      proof(provider, "one.human@example.test", "concurrent-right"),
    ]);
    const results = await Promise.allSettled([
      activation.activate(
        {
          expected_version: 0,
          verification_token: leftProof.verification_token,
          display_name: "حل‌گر یکتا",
          start_intent: "individual",
        },
        {
          idempotencyKey: "activate-concurrent-left",
          correlationId: "cor_concurrent_left" as never,
        },
      ),
      activation.activate(
        {
          expected_version: 0,
          verification_token: rightProof.verification_token,
          display_name: "حل‌گر یکتا",
          start_intent: "team",
        },
        {
          idempotencyKey: "activate-concurrent-right",
          correlationId: "cor_concurrent_right" as never,
        },
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "INVALID_STATE" },
    });
    const counts = await database.query<{ users: string; workspaces: string; activations: string }>(
      `SELECT (SELECT count(*) FROM app_user) AS users,
              (SELECT count(*) FROM workspace WHERE kind = 'individual') AS workspaces,
              (SELECT count(*) FROM solver_activation) AS activations`,
    );
    expect(counts.rows[0]).toEqual({ users: "1", workspaces: "1", activations: "1" });
  });

  it("keeps activation evidence and consumed assertions append-only", async () => {
    const { activation, provider } = adapters();
    const verified = await proof(provider, "immutable@example.test", "immutable");
    await activation.activate(
      {
        expected_version: 0,
        verification_token: verified.verification_token,
        display_name: "حل‌گر تغییرناپذیر",
        start_intent: "individual",
      },
      { idempotencyKey: "activate-immutable-01", correlationId: "cor_immutable" as never },
    );
    await expect(
      database.query("UPDATE solver_activation SET start_intent = 'team'"),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query("DELETE FROM contact_verification_consumption"),
    ).rejects.toMatchObject({ code: "55000" });
  });
});
