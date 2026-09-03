import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildSessionExchangeBody,
  buildSessionRefreshBody,
  buildSessionRevokeBody,
  fixedTimestamp,
} from "@rahhal/testkit";
import { parseCorrelationId, parseSessionId, parseUserId, parseWorkspaceId } from "@rahhal/domain";

import { forbidden, notFound } from "../src/errors.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { PostgresAccessDecisionAudit } from "../src/postgres/access-decision-audit.js";
import {
  credentialDigest,
  PostgresIdentityWorkspaceAdapter,
} from "../src/postgres/identity-workspace.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import {
  LocalTestOidcExchangeAdapter,
  LocalTestSessionCredentialIssuer,
} from "./support/local-test-identity.js";

const adminUrl = testDatabaseAdminUrl();

const testDatabaseName = `rahhal_a1b_test_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

const ownerAccessToken = "local-a1b-access-owner-alpha";
const ownerRefreshToken = "local-a1b-refresh-owner-alpha";
const ownerSessionId = parseSessionId("ses_owner_alpha");
const ownerUserId = parseUserId("usr_owner_alpha");
const solverUserId = parseUserId("usr_solver_alpha");
const ownerWorkspaceId = parseWorkspaceId("wsp_org_alpha");
const clock = { now: () => new Date(fixedTimestamp) };
const localOidcRecord = {
  authorizationAttemptId: "oat_owner_alpha",
  issuer: "https://oidc.synthetic.invalid",
  subject: "owner-alpha",
  verifiedEmail: "owner-alpha@synthetic.invalid",
  authorizationCode: "local-a1b-authorization-code-owner-alpha",
  codeVerifier: "local-a1b-code-verifier-owner-alpha-0000000000000000",
  redirectUri: "http://localhost:3000/auth/callback",
  state: "local-a1b-state-owner-alpha",
} as const;
const localCredentialSecret = "a1b-local-test-secret-with-32-characters-minimum";

let admin: Client;
let database: Pool;
let adminConnected = false;
let databaseCreated = false;
let databasePoolCreated = false;
let adapter: PostgresIdentityWorkspaceAdapter;
// The audit the current adapter writes through, so a test can record on the
// adapter's own transaction rather than a second, independently committing one.
let adapterAudit: PostgresAccessDecisionAudit;

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

function command(key: string, ordinal: number) {
  return {
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_a1b_${ordinal.toString().padStart(4, "0")}`),
  };
}

function exchangeBody() {
  return buildSessionExchangeBody({
    authorization_code: localOidcRecord.authorizationCode,
    code_verifier: localOidcRecord.codeVerifier,
    redirect_uri: localOidcRecord.redirectUri,
    state: localOidcRecord.state,
  });
}

function createAdapter(options: { readonly beforeCommit?: () => void } = {}) {
  const ids = new MonotonicIdFactory();
  const nextUnitOfWork = new PostgresUnitOfWork(database, options.beforeCommit);
  const audit = new PostgresAccessDecisionAudit(nextUnitOfWork, ids);
  adapterAudit = audit;
  const nextAdapter = new PostgresIdentityWorkspaceAdapter(
    nextUnitOfWork,
    new LocalTestOidcExchangeAdapter([localOidcRecord], "test"),
    new LocalTestSessionCredentialIssuer(localCredentialSecret, "test"),
    clock,
    ids,
    audit,
  );
  return nextAdapter;
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
    // Revert every applied migration so each behavior starts from a clean database.
  }
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  adapter = createAdapter();
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

describe("A1b PostgreSQL identity, workspace, and transaction boundary", () => {
  it("authenticates the seeded digest and builds /me from PostgreSQL", async () => {
    const session = await adapter.authenticate(ownerAccessToken);
    expect(session).toMatchObject({
      id: "ses_owner_alpha",
      userId: ownerUserId,
      version: 1,
      activeWorkspaceId: ownerWorkspaceId,
      credentialFingerprint: credentialDigest(ownerAccessToken),
    });
    if (!session) throw new Error("seeded session was not authenticated");

    const me = await adapter.getMe(session);
    expect(me).toMatchObject({
      user: { id: ownerUserId, email_verified: true },
      active_context: {
        tenant_id: "ten_org_alpha",
        workspace_id: ownerWorkspaceId,
        workspace_kind: "org",
      },
    });
    expect(me?.memberships).toContainEqual(
      expect.objectContaining({ role: "org:owner", state: "active" }),
    );

    const stored = await database.query<{
      access_token_digest: string;
      refresh_token_digest: string;
      row: string;
    }>(`
      SELECT access_token_digest, refresh_token_digest, row_to_json(app_session)::text AS row
      FROM app_session
      WHERE id = 'ses_owner_alpha'
    `);
    expect(stored.rows[0]).toMatchObject({
      access_token_digest: credentialDigest(ownerAccessToken),
      refresh_token_digest: credentialDigest(ownerRefreshToken),
    });
    expect(stored.rows[0]?.row).not.toContain(ownerAccessToken);
    expect(stored.rows[0]?.row).not.toContain(ownerRefreshToken);
  });

  it("binds revalidation to the database session principal", async () => {
    const session = await adapter.authenticate(ownerAccessToken);
    if (!session) throw new Error("seeded session was not authenticated");

    await expect(adapter.getMe({ ...session, userId: solverUserId })).rejects.toMatchObject({
      statusCode: 403,
      code: "NO_ACCESS",
    });
  });

  it("rotates credentials atomically and reconstructs credential-free replay", async () => {
    const body = buildSessionRefreshBody({
      expected_version: 1,
      refresh_token: ownerRefreshToken,
    });
    const mutation = command("a1b-refresh-owner-alpha", 1);
    const first = await adapter.refresh(body, mutation);
    const replay = await adapter.refresh(body, mutation);

    expect(first.entityVersion).toBe(2);
    expect(first.receipt.idempotent).toBe(false);
    expect(replay).toEqual({
      ...first,
      receipt: { ...first.receipt, idempotent: true },
    });
    await expect(adapter.authenticate(ownerAccessToken)).resolves.toBeNull();
    await expect(adapter.authenticate(first.tokens.access_token)).resolves.toMatchObject({
      version: 2,
    });

    const persisted = await database.query<{
      access_token_digest: string;
      refresh_token_digest: string;
      response_body: string;
      audit_count: string;
      outbox_count: string;
    }>(
      `
        SELECT
          session.access_token_digest,
          session.refresh_token_digest,
          idempotency.response_body::text,
          (SELECT count(*) FROM audit_event WHERE action = 'session.refreshed') AS audit_count,
          (SELECT count(*) FROM outbox_event WHERE event_type = 'session.refreshed') AS outbox_count
        FROM app_session AS session
        JOIN idempotency_key AS idempotency
          ON idempotency.credential_fingerprint = $1
         AND idempotency.idempotency_key = 'a1b-refresh-owner-alpha'
        WHERE session.id = 'ses_owner_alpha'
      `,
      [credentialDigest(ownerRefreshToken)],
    );
    expect(persisted.rows[0]).toMatchObject({
      access_token_digest: credentialDigest(first.tokens.access_token),
      refresh_token_digest: credentialDigest(first.tokens.refresh_token),
      audit_count: "1",
      outbox_count: "1",
    });
    expect(persisted.rows[0]?.response_body).not.toContain(first.tokens.access_token);
    expect(persisted.rows[0]?.response_body).not.toContain(first.tokens.refresh_token);
  });

  it("collapses concurrent refresh retries into one committed mutation", async () => {
    const body = buildSessionRefreshBody({
      expected_version: 1,
      refresh_token: ownerRefreshToken,
    });
    const mutation = command("a1b-refresh-concurrent-owner", 12);
    const outcomes = await Promise.all([
      adapter.refresh(body, mutation),
      adapter.refresh(body, mutation),
    ]);

    expect(outcomes.map((outcome) => outcome.receipt.idempotent).sort()).toEqual([false, true]);
    expect(outcomes[1]?.tokens).toEqual(outcomes[0]?.tokens);
    const evidence = await database.query<{ audits: string; events: string; replays: string }>(`
      SELECT
        (SELECT count(*) FROM audit_event WHERE action = 'session.refreshed') AS audits,
        (SELECT count(*) FROM outbox_event WHERE event_type = 'session.refreshed') AS events,
        (SELECT count(*) FROM idempotency_key
          WHERE idempotency_key = 'a1b-refresh-concurrent-owner') AS replays
    `);
    expect(evidence.rows[0]).toEqual({ audits: "1", events: "1", replays: "1" });
  });

  it("reclaims expired credential-scoped replay keys before reuse", async () => {
    await database.query(
      `
        INSERT INTO idempotency_key (
          id, scope_kind, credential_fingerprint, idempotency_key, request_hash,
          status, response_status, response_body, created_at, expires_at
        ) VALUES (
          'idk_expired_refresh_owner', 'credential', $1,
          'a1b-expired-refresh-owner', repeat('0', 64), 'completed', 200,
          '{"kind":"mutation"}'::jsonb, '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z'
        )
      `,
      [credentialDigest(ownerRefreshToken)],
    );

    const outcome = await adapter.refresh(
      buildSessionRefreshBody({ expected_version: 1, refresh_token: ownerRefreshToken }),
      command("a1b-expired-refresh-owner", 14),
    );
    expect(outcome.receipt.idempotent).toBe(false);
    const replay = await database.query<{ count: string; old_hashes: string }>(`
      SELECT
        count(*) AS count,
        count(*) FILTER (WHERE request_hash = repeat('0', 64)) AS old_hashes
      FROM idempotency_key
      WHERE idempotency_key = 'a1b-expired-refresh-owner'
    `);
    expect(replay.rows[0]).toEqual({ count: "1", old_hashes: "0" });
  });

  it("revokes once, denies authentication immediately, and replays the same receipt", async () => {
    const body = buildSessionRevokeBody({
      expected_version: 1,
      session_id: ownerSessionId,
    });
    const mutation = command("a1b-revoke-owner-alpha", 2);
    const first = await adapter.revoke(ownerAccessToken, body, mutation);
    const replay = await adapter.revoke(ownerAccessToken, body, mutation);

    expect(first).toMatchObject({ actorUserId: ownerUserId, entityVersion: 2 });
    expect(first.receipt.idempotent).toBe(false);
    expect(replay.receipt).toEqual({ ...first.receipt, idempotent: true });
    await expect(adapter.authenticate(ownerAccessToken)).resolves.toBeNull();

    const evidence = await database.query<{ audits: string; events: string; revoked: boolean }>(`
      SELECT
        (SELECT count(*) FROM audit_event WHERE action = 'session.revoked') AS audits,
        (SELECT count(*) FROM outbox_event WHERE event_type = 'session.revoked') AS events,
        (SELECT revoked_at IS NOT NULL FROM app_session WHERE id = 'ses_owner_alpha') AS revoked
    `);
    expect(evidence.rows[0]).toEqual({ audits: "1", events: "1", revoked: true });
  });

  it("switches context with one transaction and revalidates target membership", async () => {
    const session = await adapter.authenticate(ownerAccessToken);
    if (!session) throw new Error("seeded session was not authenticated");
    const mutation = command("a1b-context-owner-alpha", 3);
    const first = await adapter.switchContext(session, ownerWorkspaceId, 1, mutation);
    const replay = await adapter.switchContext(session, ownerWorkspaceId, 1, mutation);

    expect(first.entityVersion).toBe(2);
    expect(replay.receipt).toEqual({ ...first.receipt, idempotent: true });

    await expect(
      adapter.switchContext(
        session,
        ownerWorkspaceId,
        2,
        command("a1b-context-from-stale-session", 13),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });

    await database.query(
      "UPDATE membership SET state = 'suspended', updated_at = clock_timestamp() WHERE id = 'mem_owner_alpha'",
    );
    const currentSession = await adapter.authenticate(ownerAccessToken);
    if (!currentSession) throw new Error("context-switched session was not authenticated");
    await expect(
      adapter.switchContext(
        currentSession,
        ownerWorkspaceId,
        2,
        command("a1b-context-after-suspension", 4),
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    const state = await database.query<{ session_version: string; denials: string }>(`
      SELECT
        session_version,
        (SELECT count(*) FROM audit_event
          WHERE action = 'workspace.context.switch' AND outcome = 'denied') AS denials
      FROM app_session
      WHERE id = 'ses_owner_alpha'
    `);
    expect(state.rows[0]).toEqual({ session_version: "2", denials: "2" });
  });

  it("locks the revalidated membership for the authorized transaction", async () => {
    const session = await adapter.authenticate(ownerAccessToken);
    if (!session) throw new Error("seeded session was not authenticated");

    let enterOperation!: () => void;
    let releaseOperation!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterOperation = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });
    const authorized = adapter.runAuthorizedWorkspace(
      session,
      ownerWorkspaceId,
      {
        action: "challenge:create",
        correlationId: command("unused-authority-key", 5).correlationId,
        allows: (access) => access.role === "org:owner",
      },
      async () => {
        enterOperation();
        await release;
        return "committed";
      },
    );
    await entered;

    const competing = await database.connect();
    try {
      await competing.query("BEGIN");
      await competing.query("SET LOCAL lock_timeout = '100ms'");
      await expect(
        competing.query("UPDATE membership SET state = 'suspended' WHERE id = 'mem_owner_alpha'"),
      ).rejects.toMatchObject({ code: "55P03" });
      await competing.query("ROLLBACK");
    } finally {
      competing.release();
    }

    releaseOperation();
    await expect(authorized).resolves.toBe("committed");
    await database.query("UPDATE membership SET state = 'suspended' WHERE id = 'mem_owner_alpha'");
    await expect(
      adapter.runAuthorizedWorkspace(
        session,
        ownerWorkspaceId,
        {
          action: "challenge:create",
          correlationId: command("unused-authority-key", 6).correlationId,
        },
        () => "must-not-run",
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("revalidates revocation after authentication before protected work", async () => {
    const session = await adapter.authenticate(ownerAccessToken);
    if (!session) throw new Error("seeded session was not authenticated");
    await adapter.revoke(
      ownerAccessToken,
      buildSessionRevokeBody({ expected_version: 1, session_id: ownerSessionId }),
      command("a1b-revoke-before-authority", 7),
    );

    await expect(
      adapter.runAuthorizedWorkspace(
        session,
        ownerWorkspaceId,
        {
          action: "challenge:read",
          correlationId: command("unused-authority-key", 8).correlationId,
        },
        () => "must-not-run",
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
  });

  it("uses only the injected local OIDC adapter and persists issued digests", async () => {
    const body = exchangeBody();
    const mutation = command("a1b-exchange-owner-alpha", 9);
    const first = await adapter.exchange(body, mutation);
    const replay = await adapter.exchange(body, mutation);

    expect(first.entityVersion).toBe(1);
    expect(first.tokens.session_id).not.toBe("ses_owner_alpha");
    expect(replay).toEqual({
      ...first,
      receipt: { ...first.receipt, idempotent: true },
    });
    await expect(
      adapter.exchange(body, command("a1b-exchange-reused-code", 10)),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });

    const persisted = await database.query<{
      access_token_digest: string;
      refresh_token_digest: string;
      active_workspace_id: string | null;
      last_authenticated_at: Date;
      session_row: string;
      replay_row: string;
    }>(
      `
        SELECT
          session.access_token_digest,
          session.refresh_token_digest,
          session.active_workspace_id,
          link.last_authenticated_at,
          row_to_json(session)::text AS session_row,
          idempotency.response_body::text AS replay_row
        FROM app_session AS session
        JOIN identity_link AS link ON link.user_id = session.user_id
        JOIN idempotency_key AS idempotency
          ON idempotency.idempotency_key = 'a1b-exchange-owner-alpha'
        WHERE session.id = $1
      `,
      [first.tokens.session_id],
    );
    expect(persisted.rows[0]).toMatchObject({
      access_token_digest: credentialDigest(first.tokens.access_token),
      refresh_token_digest: credentialDigest(first.tokens.refresh_token),
      active_workspace_id: null,
      last_authenticated_at: new Date(fixedTimestamp),
    });
    for (const serialized of [persisted.rows[0]?.session_row, persisted.rows[0]?.replay_row]) {
      expect(serialized).not.toContain(first.tokens.access_token);
      expect(serialized).not.toContain(first.tokens.refresh_token);
      expect(serialized).not.toContain(localOidcRecord.authorizationCode);
      expect(serialized).not.toContain(localOidcRecord.codeVerifier);
    }
  });

  it("rolls back session, audit, outbox, and replay metadata on commit failure", async () => {
    const before = await database.query<{ snapshot: string }>(`
      SELECT jsonb_build_object(
        'session', (SELECT row_to_json(session) FROM app_session AS session WHERE id = 'ses_owner_alpha'),
        'audit_count', (SELECT count(*) FROM audit_event),
        'outbox_count', (SELECT count(*) FROM outbox_event),
        'idempotency_count', (SELECT count(*) FROM idempotency_key)
      )::text AS snapshot
    `);
    const failing = createAdapter({
      beforeCommit: () => {
        throw new Error("forced identity commit failure");
      },
    });

    await expect(
      failing.refresh(
        buildSessionRefreshBody({ expected_version: 1, refresh_token: ownerRefreshToken }),
        command("a1b-refresh-forced-rollback", 11),
      ),
    ).rejects.toThrow("forced identity commit failure");

    const after = await database.query<{ snapshot: string }>(`
      SELECT jsonb_build_object(
        'session', (SELECT row_to_json(session) FROM app_session AS session WHERE id = 'ses_owner_alpha'),
        'audit_count', (SELECT count(*) FROM audit_event),
        'outbox_count', (SELECT count(*) FROM outbox_event),
        'idempotency_count', (SELECT count(*) FROM idempotency_key)
      )::text AS snapshot
    `);
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  it("audits a denial raised inside the authorized transaction", async () => {
    // The operation runs on the transaction this adapter opened, so a route
    // that records its own denial there loses the row to the rollback that
    // the throw triggers. The reason travels on the problem instead, and the
    // audit has to land outside the transaction for the deny to be recorded
    // at all (70_SECURITY_AND_AUTHZ.md: every decision emits an audit_event).
    const session = await adapter.authenticate(ownerAccessToken);
    if (!session) throw new Error("seeded session was not authenticated");

    for (const [label, thrown, expectedReason, expectedStatus] of [
      ["role capability", forbidden("role_capability_denied"), "role_capability_denied", 403],
      ["command", forbidden(), "command_denied", 403],
      ["record", notFound(), "record_unreachable", 404],
    ] as const) {
      const correlationId = parseCorrelationId(`cor_a1b_deny_${label.replace(/[^a-z]/g, "")}`);
      await expect(
        adapter.runAuthorizedWorkspace(
          session,
          ownerWorkspaceId,
          {
            action: "challenge:read",
            entityType: "challenge",
            correlationId,
            deferSuccess: true,
            allows: (access) => access.role === "org:owner",
          },
          async () => {
            // Written on the transaction the throw is about to roll back,
            // exactly as the route-level guards in app.ts do.
            await adapterAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: "ten_org_alpha",
              workspaceId: ownerWorkspaceId,
              action: "challenge:read",
              entityType: "challenge",
              reason: expectedReason,
              correlationId,
              occurredAt: fixedTimestamp,
            });
            throw thrown;
          },
        ),
      ).rejects.toMatchObject({ statusCode: expectedStatus });

      const recorded = await database.query<{ reason_code: string; outcome: string }>(
        `SELECT outcome, reason_code FROM audit_event WHERE correlation_id = $1`,
        [correlationId],
      );
      expect(recorded.rows).toEqual([{ outcome: "denied", reason_code: expectedReason }]);
    }
  });

  it("keeps all local identity helpers unavailable in production mode", () => {
    expect(() => new LocalTestOidcExchangeAdapter([localOidcRecord], "production")).toThrow(
      "test-only",
    );
    expect(() => new LocalTestSessionCredentialIssuer(localCredentialSecret, "production")).toThrow(
      "test-only",
    );
  });
});
