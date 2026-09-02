import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  ChallengeDraftContentResource,
  ChallengeResource,
  MutationSuccessEnvelope,
  SuccessEnvelope,
} from "@rahhal/contracts";
import {
  parseCorrelationId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  publicationGates,
  type UserId,
  type WorkspaceRole,
} from "@rahhal/domain";
import { buildChallengeContentResource } from "@rahhal/testkit";

import { buildApi } from "../src/app.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { createRuntimeApiComposition } from "../src/runtime-composition.js";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { PostgresPublicChallengeAdapter } from "../src/postgres/public-challenges.js";
import { credentialDigest } from "../src/postgres/identity-workspace.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { encodePublicChallengeCursor } from "../src/public-catalogue.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();

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

async function expectDatabaseError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected PostgreSQL error ${code}`);
}

function context(
  key: string,
  ordinal: number,
  overrides: { readonly role?: WorkspaceRole; readonly actorUserId?: UserId } = {},
) {
  return {
    actorUserId: ownerUserId,
    tenantId: ownerTenantId,
    workspaceId: ownerWorkspaceId,
    role: "org:owner" as const,
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_a1c_${ordinal.toString().padStart(4, "0")}`),
    ...overrides,
  };
}

function publicAdapter() {
  return new PostgresPublicChallengeAdapter(new PostgresUnitOfWork(database));
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
    OIDC_ISSUER_URL: "http://dex.localhost:5556/dex",
    OIDC_CLIENT_ID: "rahhal-local-web",
    OIDC_ALLOWED_REDIRECT_URIS: "http://localhost:3000/auth/callback",
    OIDC_ALLOW_INSECURE_HTTP: "true",
    OIDC_FLOW_SECRET: "a1c-runtime-test-oidc-flow-secret-00000001",
    SESSION_CREDENTIAL_SECRET: "a1c-runtime-test-session-secret-00000001",
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

describe("PostgreSQL organization challenge list", () => {
  it("lists only the scoped workspace's challenges, newest first, and pages by cursor", async () => {
    const challenges = adapter();
    const created: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const outcome = await challenges.create(
        { expected_version: 0, draft: { title: `پرونده ${index}` } },
        context(`list-create-0${index}`, 100 + index),
      );
      created.push(outcome.receipt.entity_id);
    }

    const page = await challenges.listScoped(context("unused", 200), {});
    const ids = page.items.map((item) => item.id);
    // The three just created come back newest-first, ahead of the seeded row
    // that already belonged to this workspace.
    expect(ids.slice(0, 3)).toEqual([...created].reverse());
    expect(ids).toContain("chl_synthetic_alpha");
    expect(page.next_cursor).toBeNull();
    // The list row is narrow by construction: the brief never crosses it.
    expect(page.items[0]).not.toHaveProperty("content");
    expect(page.items[0]).not.toHaveProperty("approvals");

    // Beta's owner sees beta's own rows and none of alpha's — the scope
    // predicate, not a filter applied after the fact.
    const foreign = await challenges.listScoped(
      {
        ...context("unused", 201),
        tenantId: parseTenantId("ten_org_beta"),
        workspaceId: parseWorkspaceId("wsp_org_beta"),
      },
      {},
    );
    for (const id of ids) {
      expect(foreign.items.map((item) => item.id)).not.toContain(id);
    }
  });

  it("filters by stage and reports no approved gate on a version that has none", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      { expected_version: 0, draft: { title: "پرونده مرحله‌ای" } },
      context("list-stage-create", 220),
    );
    const challengeId = created.receipt.entity_id;

    const drafts = await challenges.listScoped(context("unused", 221), { stage: "draft" });
    const row = drafts.items.find((item) => item.id === challengeId);
    expect(row).toBeDefined();
    // A brand new draft has no gates and is not yet ready; both come from the
    // lateral aggregate and the shared readiness contract rather than a guess.
    expect(row?.publication_readiness).toMatchObject({ ready: false, satisfied: [] });
    expect(row?.ready).toBe(false);
    expect(row?.publication_state).toBeNull();

    const published = await challenges.listScoped(context("unused", 222), {
      stage: "published",
    });
    expect(published.items.map((item) => item.id)).not.toContain(challengeId);
  });
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
      {
        expected_version: 1,
        patch: {
          summary: "شرح نسخه دوم",
          allowed_applicant_types: ["individual", "expert-team"],
          verification_required: true,
          nda_required: true,
          document_gate_required: true,
          proposal_deadline: "2030-02-01T00:00:00.000Z",
          authoring_status: "ready",
        },
      },
      context("a1c-save-challenge-001", 3),
    );
    expect(saved.entityVersion).toBe(2);

    const current = await challenges.getScoped(
      context("unused-scope-key-2", 4),
      created.receipt.entity_id,
    );
    expect(current).toMatchObject({
      version: 2,
      authoring_status: "draft",
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
      eligibility_rules: string;
      audits: string;
      receipts: string;
      events: string;
      replays: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_version WHERE challenge_id = $1) AS versions,
          (SELECT count(*) FROM eligibility_rule WHERE challenge_id = $1) AS eligibility_rules,
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
      eligibility_rules: "0",
      audits: "2",
      receipts: "2",
      events: "2",
      replays: "2",
    });
  });

  it("saves expired drafts but refuses invalid governed eligibility snapshots", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      {
        expected_version: 0,
        draft: { proposal_deadline: "2026-08-27T08:29:59.000Z" },
      },
      context("b3-expired-rule", 5),
    );
    const draft = await challenges.getScoped(
      context("b3-expired-rule-read", 6),
      created.receipt.entity_id,
    );
    expect(draft).not.toBeNull();
    await expectDatabaseError(
      database.query(
        `
          INSERT INTO eligibility_rule (
            id, tenant_id, workspace_id, challenge_id, challenge_version_id,
            allowed_applicant_types, verification_required, nda_required,
            document_gate_required, proposal_deadline, state
          ) VALUES (
            'elr_b3_expired_rule', 'ten_org_alpha', 'wsp_org_alpha', $1,
            $2, '{}', false, false, false,
            '2025-01-01T00:00:00Z', 'open'
          )
        `,
        [draft?.id, draft?.current_version_id],
      ),
      "23514",
    );
    await expectDatabaseError(
      database.query(
        `
          INSERT INTO eligibility_rule (
            id, tenant_id, workspace_id, challenge_id, challenge_version_id,
            allowed_applicant_types, verification_required, nda_required,
            document_gate_required, proposal_deadline, state
          ) VALUES (
            'elr_b3_closed_rule', 'ten_org_alpha', 'wsp_org_alpha', $1,
            $2, '{}', false, false, false, NULL, 'closed'
          )
        `,
        [draft?.id, draft?.current_version_id],
      ),
      "23514",
    );

    await database.query(`
      INSERT INTO eligibility_rule (
        id, tenant_id, workspace_id, challenge_id, challenge_version_id,
        allowed_applicant_types, verification_required, nda_required,
        document_gate_required, proposal_deadline, state
      ) VALUES (
        'elr_b3_seed_rule', 'ten_org_alpha', 'wsp_org_alpha',
        'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', '{}', false, false,
        false, NULL, 'open'
      )
    `);
    await expectDatabaseError(
      database.query(
        "UPDATE eligibility_rule SET nda_required = true WHERE id = 'elr_b3_seed_rule'",
      ),
      "55000",
    );
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

  it("persists the B1 lifecycle, locks submitted content, and separates aggregate/content versions", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      { expected_version: 0, draft: buildChallengeContentResource() },
      context("b1-postgres-create-01", 20),
    );
    const challengeId = created.receipt.entity_id;
    const draft = await challenges.getScoped(context("b1-read-draft", 21), challengeId);
    expect(draft).toMatchObject({
      stage: "draft",
      version: 1,
      content_version: 1,
      readiness: { ready: true, evaluated_version: 1, issues: [] },
    });

    const triageCommand = context("b1-postgres-triage-01", 22);
    const triage = await challenges.transition(
      challengeId,
      "request-triage",
      { expected_version: 1 },
      triageCommand,
    );
    const triageReplay = await challenges.transition(
      challengeId,
      "request-triage",
      { expected_version: 1 },
      triageCommand,
    );
    expect(triage).toMatchObject({
      entityVersion: 2,
      receipt: { idempotent: false, next_actions: ["advance_formulation"] },
    });
    expect(triageReplay).toEqual({
      ...triage,
      receipt: { ...triage.receipt, idempotent: true },
    });
    const submittedVersion = await database.query<{
      locked_at: Date | null;
      lock_reason: string | null;
    }>(
      `
        SELECT locked_at, lock_reason
        FROM challenge_version
        WHERE challenge_id = $1 AND version_number = 1
      `,
      [challengeId],
    );
    expect(submittedVersion.rows[0]).toMatchObject({
      locked_at: expect.any(Date),
      lock_reason: "triage_submission",
    });

    await challenges.transition(
      challengeId,
      "advance-formulation",
      { expected_version: 2 },
      context("b1-postgres-formulation-01", 23),
    );
    await challenges.patch(
      challengeId,
      { expected_version: 3, patch: { summary: "Refined measurable challenge summary." } },
      context("b1-postgres-refine-01", 24),
    );
    const approvals = await challenges.transition(
      challengeId,
      "request-approvals",
      { expected_version: 4 },
      context("b1-postgres-approvals-01", 25),
    );
    expect(approvals).toMatchObject({
      entityVersion: 5,
      receipt: { next_actions: ["await_approvals"] },
    });

    const current = await challenges.getScoped(context("b1-read-approvals", 26), challengeId);
    expect(current).toMatchObject({
      stage: "approvals",
      version: 5,
      content_version: 2,
      readiness: { ready: true, evaluated_version: 5 },
    });
    await expect(
      challenges.patch(
        challengeId,
        { expected_version: 5, patch: { title: "Forbidden in approvals" } },
        context("b1-postgres-edit-approvals", 27),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE", statusCode: 409 });

    const evidence = await database.query<{
      versions: string;
      locked_versions: string;
      audits: string;
      receipts: string;
      events: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_version WHERE challenge_id = $1) AS versions,
          (SELECT count(*) FROM challenge_version
            WHERE challenge_id = $1 AND locked_at IS NOT NULL) AS locked_versions,
          (SELECT count(*) FROM audit_event
            WHERE target_type = 'challenge' AND target_id = $1
              AND reason_code = 'MUTATION_COMMITTED') AS audits,
          (SELECT count(*) FROM mutation_receipt
            WHERE entity_type = 'challenge' AND entity_id = $1) AS receipts,
          (SELECT count(*) FROM outbox_event
            WHERE aggregate_type = 'challenge' AND aggregate_id = $1) AS events
      `,
      [challengeId],
    );
    expect(evidence.rows[0]).toEqual({
      versions: "2",
      locked_versions: "2",
      audits: "5",
      receipts: "5",
      events: "5",
    });
  });

  it("rolls back a B1 transition and all evidence when commit fails", async () => {
    const created = await adapter().create(
      { expected_version: 0, draft: buildChallengeContentResource() },
      context("b1-rollback-create-01", 30),
    );
    const before = await database.query<{ snapshot: string }>(
      `
        SELECT jsonb_build_object(
          'stage', (SELECT stage FROM challenge WHERE id = $1),
          'version', (SELECT lock_version FROM challenge WHERE id = $1),
          'locked', (SELECT count(*) FROM challenge_version
            WHERE challenge_id = $1 AND locked_at IS NOT NULL),
          'audits', (SELECT count(*) FROM audit_event WHERE target_id = $1),
          'receipts', (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1),
          'events', (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1),
          'replays', (SELECT count(*) FROM idempotency_key
            WHERE tenant_id = $2 AND idempotency_key = 'b1-rollback-transition-01')
        )::text AS snapshot
      `,
      [created.receipt.entity_id, ownerTenantId],
    );
    const failing = adapter({
      beforeCommit: () => {
        throw new Error("forced B1 transition rollback");
      },
    });
    await expect(
      failing.transition(
        created.receipt.entity_id,
        "request-triage",
        { expected_version: 1 },
        context("b1-rollback-transition-01", 31),
      ),
    ).rejects.toThrow("forced B1 transition rollback");
    const after = await database.query<{ snapshot: string }>(
      `
        SELECT jsonb_build_object(
          'stage', (SELECT stage FROM challenge WHERE id = $1),
          'version', (SELECT lock_version FROM challenge WHERE id = $1),
          'locked', (SELECT count(*) FROM challenge_version
            WHERE challenge_id = $1 AND locked_at IS NOT NULL),
          'audits', (SELECT count(*) FROM audit_event WHERE target_id = $1),
          'receipts', (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1),
          'events', (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1),
          'replays', (SELECT count(*) FROM idempotency_key
            WHERE tenant_id = $2 AND idempotency_key = 'b1-rollback-transition-01')
        )::text AS snapshot
      `,
      [created.receipt.entity_id, ownerTenantId],
    );
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  async function advanceToApprovals(
    challenges: PostgresChallengeAdapter,
    keyPrefix: string,
    ordinal: number,
    draft: ChallengeDraftContentResource = buildChallengeContentResource(),
  ): Promise<string> {
    const created = await challenges.create(
      { expected_version: 0, draft },
      context(`${keyPrefix}-create`, ordinal),
    );
    const challengeId = created.receipt.entity_id;
    await challenges.transition(
      challengeId,
      "request-triage",
      { expected_version: 1 },
      context(`${keyPrefix}-triage`, ordinal + 1),
    );
    await challenges.transition(
      challengeId,
      "advance-formulation",
      { expected_version: 2 },
      context(`${keyPrefix}-formulation`, ordinal + 2),
    );
    await challenges.transition(
      challengeId,
      "request-approvals",
      { expected_version: 3 },
      context(`${keyPrefix}-approvals`, ordinal + 3),
    );
    return challengeId;
  }

  it("records all four B2 publication gates with atomic evidence and reaches publication readiness", async () => {
    await database.query(`
      INSERT INTO app_user (
        id, display_name, primary_email, email_verified, primary_phone, phone_verified,
        created_at, updated_at
      ) VALUES
        (
          'usr_gate_legal_test', 'Test Legal Approver', 'gate-legal-test@synthetic.invalid',
          true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
        ),
        (
          'usr_gate_finance_test', 'Test Finance Approver', 'gate-finance-test@synthetic.invalid',
          true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
        )
      ON CONFLICT (id) DO NOTHING
    `);

    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b2-full", 100);

    const technical = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "Technical review complete.",
      },
      context("b2-full-technical", 104, { role: "org:approver_technical" }),
    );
    expect(technical).toMatchObject({
      entityVersion: 1,
      receipt: { next_actions: ["await_remaining_gates"] },
    });

    const legal = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "legal",
        decision: "approved",
        reason: "Legal review complete.",
      },
      context("b2-full-legal", 105, {
        role: "platform:legal",
        actorUserId: parseUserId("usr_gate_legal_test"),
      }),
    );
    expect(legal.receipt.next_actions).toEqual(["await_remaining_gates"]);

    const finance = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "finance",
        decision: "approved",
        reason: "Finance review complete.",
      },
      context("b2-full-finance", 106, {
        role: "platform:finance",
        actorUserId: parseUserId("usr_gate_finance_test"),
      }),
    );
    expect(finance.receipt.next_actions).toEqual(["await_remaining_gates"]);

    const qualityContext = context("b2-full-quality", 107, {
      role: "platform:ops",
      actorUserId: parseUserId("usr_platform_ops"),
    });
    const quality = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "quality",
        decision: "approved",
        reason: "Quality review complete.",
      },
      qualityContext,
    );
    expect(quality.receipt.next_actions).toEqual(["ready_for_publish"]);
    const qualityReplay = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "quality",
        decision: "approved",
        reason: "Quality review complete.",
      },
      qualityContext,
    );
    expect(qualityReplay).toEqual({
      ...quality,
      receipt: { ...quality.receipt, idempotent: true },
    });

    const finalState = await challenges.getScoped(context("b2-full-read", 108), challengeId);
    expect(finalState?.publication_readiness).toEqual({
      ready: true,
      satisfied: ["technical", "legal", "finance", "quality"],
      missing: [],
    });
    expect(finalState?.approvals).toHaveLength(4);
    // Gate recording never touches the challenge's own aggregate version.
    expect(finalState?.version).toBe(4);

    const evidence = await database.query<{
      approvals: string;
      approval_audits: string;
      approval_receipts: string;
      approval_events: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_approval WHERE challenge_id = $1) AS approvals,
          (SELECT count(*) FROM audit_event
            WHERE target_type = 'challenge' AND target_id = $1
              AND action = 'challenge.approval.recorded') AS approval_audits,
          (SELECT count(*) FROM mutation_receipt
            WHERE entity_type = 'challenge_approval'
              AND entity_id IN (SELECT id FROM challenge_approval WHERE challenge_id = $1)) AS approval_receipts,
          (SELECT count(*) FROM outbox_event
            WHERE aggregate_type = 'challenge_approval'
              AND aggregate_id IN (SELECT id FROM challenge_approval WHERE challenge_id = $1)) AS approval_events
      `,
      [challengeId],
    );
    expect(evidence.rows[0]).toEqual({
      approvals: "4",
      approval_audits: "4",
      approval_receipts: "4",
      approval_events: "4",
    });

    await expect(
      database.query(
        `UPDATE challenge_approval SET decision = 'rejected' WHERE challenge_id = $1`,
        [challengeId],
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      database.query(`DELETE FROM challenge_approval WHERE challenge_id = $1`, [challengeId]),
    ).rejects.toThrow(/append-only/);
  });

  it("returns a rejected version to formulation through a fresh immutable version", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b2-rework", 109);
    const rejectedVersion = await challenges.getScoped(context("b2-rework-read", 113), challengeId);

    const rejection = await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "technical",
        decision: "rejected",
        reason: "The technical scope needs correction.",
      },
      context("b2-rework-reject", 114, { role: "org:approver_technical" }),
    );
    expect(rejection.receipt.next_actions).toEqual(["revise"]);

    await challenges.patch(
      challengeId,
      { expected_version: 4, patch: { title: "Corrected technical scope" } },
      context("b2-rework-patch", 115),
    );
    const revised = await challenges.getScoped(context("b2-rework-reread", 116), challengeId);
    expect(revised).toMatchObject({
      stage: "formulation",
      version: 5,
      content_version: 2,
      content: { title: "Corrected technical scope" },
      approvals: [],
      publication_readiness: { ready: false, satisfied: [], missing: publicationGates },
    });
    expect(revised?.current_version_id).not.toBe(rejectedVersion?.current_version_id);

    const evidence = await database.query<{ approvals: string; rules: string }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_approval WHERE challenge_id = $1) AS approvals,
          (SELECT count(*) FROM eligibility_rule WHERE challenge_id = $1) AS rules
      `,
      [challengeId],
    );
    expect(evidence.rows[0]).toEqual({ approvals: "1", rules: "1" });
  });

  it("rejects a duplicate gate and separation-of-duty violations under real constraints", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b2-conflict", 110);

    await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "First technical review.",
      },
      context("b2-conflict-technical", 114, { role: "org:approver_technical" }),
    );

    await expect(
      challenges.recordApproval(
        challengeId,
        {
          expected_version: 4,
          gate: "technical",
          decision: "approved",
          reason: "Second technical review.",
        },
        context("b2-conflict-technical-again", 115, {
          role: "org:approver_technical",
          actorUserId: parseUserId("usr_solver_alpha"),
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });

    await expect(
      challenges.recordApproval(
        challengeId,
        {
          expected_version: 4,
          gate: "quality",
          decision: "approved",
          reason: "Same actor, different gate.",
        },
        context("b2-conflict-second-gate", 116, { role: "platform:ops" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });

    const count = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM challenge_approval WHERE challenge_id = $1",
      [challengeId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("serializes concurrent duplicate gate submissions for the same version", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b2-race", 120);

    const attempt = (ordinal: number, actorUserId: UserId) =>
      challenges.recordApproval(
        challengeId,
        {
          expected_version: 4,
          gate: "technical",
          decision: "approved",
          reason: "Concurrent technical review.",
        },
        context(`b2-race-technical-${ordinal}`, 124 + ordinal, {
          role: "org:approver_technical",
          actorUserId,
        }),
      );

    const results = await Promise.allSettled([
      attempt(1, ownerUserId),
      attempt(2, parseUserId("usr_solver_alpha")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ statusCode: 409, code: "CONFLICT" });

    const count = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM challenge_approval WHERE challenge_id = $1",
      [challengeId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("rolls back all approval evidence when the commit fails", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b2-rollback", 130);
    const snapshotQuery = `
      SELECT jsonb_build_object(
        'approvals', (SELECT count(*) FROM challenge_approval WHERE challenge_id = $1),
        'audits', (SELECT count(*) FROM audit_event
          WHERE target_id = $1 AND action = 'challenge.approval.recorded'),
        'receipts', (SELECT count(*) FROM mutation_receipt WHERE entity_type = 'challenge_approval'),
        'events', (SELECT count(*) FROM outbox_event WHERE aggregate_type = 'challenge_approval'),
        'replays', (SELECT count(*) FROM idempotency_key
          WHERE tenant_id = $2 AND idempotency_key = 'b2-rollback-record-01')
      )::text AS snapshot
    `;
    const before = await database.query<{ snapshot: string }>(snapshotQuery, [
      challengeId,
      ownerTenantId,
    ]);
    const failing = adapter({
      beforeCommit: () => {
        throw new Error("forced B2 approval rollback");
      },
    });
    await expect(
      failing.recordApproval(
        challengeId,
        {
          expected_version: 4,
          gate: "technical",
          decision: "approved",
          reason: "Should roll back.",
        },
        context("b2-rollback-record-01", 134, { role: "org:approver_technical" }),
      ),
    ).rejects.toThrow("forced B2 approval rollback");
    const after = await database.query<{ snapshot: string }>(snapshotQuery, [
      challengeId,
      ownerTenantId,
    ]);
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  it("projects a platform approval brief and role-scoped queue without private fields", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b8-platform-read", 150);
    await challenges.recordApproval(
      challengeId,
      {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "Technical review complete.",
      },
      context("b8-platform-technical", 154, { role: "org:approver_technical" }),
    );
    const platformScope = context("b8-platform-scope", 155, {
      role: "platform:ops",
      actorUserId: parseUserId("usr_platform_ops"),
    });

    const brief = await challenges.getApprovalBrief(platformScope, challengeId);
    expect(brief).toMatchObject({ id: challengeId, stage: "approvals", version: 4 });
    expect(brief?.content).not.toHaveProperty("contact");
    expect(brief?.content).not.toHaveProperty("invitees");
    expect(brief?.content).not.toHaveProperty("attachment_ids");
    expect(brief?.approvals[0]).toMatchObject({
      gate: "technical",
      recorded_by_role: "org:approver_technical",
      recorded_by_current_actor: false,
    });
    expect(brief?.approvals[0]).not.toHaveProperty("recorded_by");

    const queue = await challenges.listApprovalQueue(platformScope);
    expect(queue.items).toContainEqual(
      expect.objectContaining({ challenge_id: challengeId, gate: "quality" }),
    );
  });

  it("queues a triage brief for platform ops and closes that reach after screening", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      { expected_version: 0, draft: buildChallengeContentResource() },
      context("b1-ops-triage-create", 140),
    );
    const challengeId = created.receipt.entity_id;
    await challenges.transition(
      challengeId,
      "request-triage",
      { expected_version: 1 },
      context("b1-ops-triage-request", 141),
    );
    const opsScope = context("b1-ops-triage-scope", 142, {
      role: "platform:ops",
      actorUserId: parseUserId("usr_platform_ops"),
    });

    await expect(challenges.getApprovalBrief(opsScope, challengeId)).resolves.toMatchObject({
      id: challengeId,
      stage: "triage",
      gate: "quality",
      version: 2,
    });
    await expect(challenges.listApprovalQueue(opsScope)).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ challenge_id: challengeId, stage: "triage" }),
      ]),
    });

    await challenges.transition(
      challengeId,
      "advance-formulation",
      { expected_version: 2 },
      context("b1-ops-triage-advance", 143, {
        role: "platform:ops",
        actorUserId: parseUserId("usr_platform_ops"),
      }),
    );

    await expect(challenges.getApprovalBrief(opsScope, challengeId)).resolves.toBeNull();
    await expect(
      challenges.getScoped(context("b1-ops-triage-owner-read", 144), challengeId),
    ).resolves.toMatchObject({ stage: "formulation", version: 3 });
  });

  /**
   * The legal and finance gates are recorded by platform actors who hold no
   * membership in the org workspace, so each needs its own user row; the
   * adapter is given the role directly (app.ts owns the authorization path).
   */
  async function approveAllGates(
    challenges: PostgresChallengeAdapter,
    challengeId: string,
    keyPrefix: string,
    ordinal: number,
  ): Promise<void> {
    await database.query(`
      INSERT INTO app_user (
        id, display_name, primary_email, email_verified, primary_phone, phone_verified,
        created_at, updated_at
      ) VALUES
        (
          'usr_gate_legal_test', 'Test Legal Approver', 'gate-legal-test@synthetic.invalid',
          true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
        ),
        (
          'usr_gate_finance_test', 'Test Finance Approver', 'gate-finance-test@synthetic.invalid',
          true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
        )
      ON CONFLICT (id) DO NOTHING
    `);

    const gates = [
      ["technical", "org:approver_technical", ownerUserId],
      ["legal", "platform:legal", parseUserId("usr_gate_legal_test")],
      ["finance", "platform:finance", parseUserId("usr_gate_finance_test")],
      ["quality", "platform:ops", parseUserId("usr_platform_ops")],
    ] as const;
    for (const [index, [gate, role, actorUserId]] of gates.entries()) {
      await challenges.recordApproval(
        challengeId,
        { expected_version: 4, gate, decision: "approved", reason: `${gate} review complete.` },
        context(`${keyPrefix}-${gate}`, ordinal + index, { role, actorUserId }),
      );
    }
  }

  async function publishableChallenge(
    challenges: PostgresChallengeAdapter,
    keyPrefix: string,
    ordinal: number,
    draft?: ChallengeDraftContentResource,
  ): Promise<string> {
    const challengeId = await advanceToApprovals(challenges, keyPrefix, ordinal, draft);
    await approveAllGates(challenges, challengeId, keyPrefix, ordinal + 4);
    return challengeId;
  }

  async function publishedChallenge(
    challenges: PostgresChallengeAdapter,
    keyPrefix: string,
    ordinal: number,
    draft?: ChallengeDraftContentResource,
  ): Promise<string> {
    const challengeId = await publishableChallenge(challenges, keyPrefix, ordinal, draft);
    await challenges.publish(
      challengeId,
      { expected_version: 4 },
      context(`${keyPrefix}-publish`, ordinal + 8, { role: "org:publisher" }),
    );
    return challengeId;
  }

  it("publishes the approved version and its allowlisted projection in one transaction", async () => {
    const challenges = adapter();
    const challengeId = await publishableChallenge(challenges, "b4-publish", 200);
    const approved = await challenges.getScoped(context("b4-publish-read", 210), challengeId);
    const approvedVersionId = approved?.current_version_id;

    const publishContext = context("b4-publish-command", 211, { role: "org:publisher" });
    const published = await challenges.publish(
      challengeId,
      { expected_version: 4 },
      publishContext,
    );
    expect(published).toMatchObject({
      entityVersion: 5,
      receipt: { next_actions: ["await_proposals"], idempotent: false },
    });
    const replay = await challenges.publish(challengeId, { expected_version: 4 }, publishContext);
    expect(replay).toEqual({ ...published, receipt: { ...published.receipt, idempotent: true } });

    const current = await challenges.getScoped(context("b4-publish-reread", 212), challengeId);
    expect(current).toMatchObject({ stage: "published", version: 5 });
    expect(current?.published_version_id).toBe(approvedVersionId);

    const aggregate = await database.query<{
      published_version_id: string;
      locked_at: Date | null;
    }>(
      `
        SELECT challenge.published_version_id, version.locked_at
        FROM challenge
        JOIN challenge_version AS version ON version.id = challenge.published_version_id
        WHERE challenge.id = $1
      `,
      [challengeId],
    );
    expect(aggregate.rows[0]?.published_version_id).toBe(approvedVersionId);
    // A published version is never left unlocked.
    expect(aggregate.rows[0]?.locked_at).not.toBeNull();

    // The projection's column set IS the allowlist: a confidential field added
    // to the aggregate later has nowhere in this table to land.
    const columns = await database.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'challenge_public_projection'
        ORDER BY column_name
      `,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "allowed_applicant_types",
      "applicant_scope",
      "budget_amount_minor",
      "budget_currency",
      "budget_status",
      "category",
      "challenge_id",
      "challenge_version_id",
      "document_gate_required",
      "ip_terms",
      "location",
      "nda_required",
      "output_type",
      "preferred_start_date",
      "proposal_deadline",
      "public_summary",
      "published_at",
      "sourcing_model",
      "state",
      "tenant_id",
      "title",
      "verification_required",
      "visibility",
      "work_mode",
    ]);

    const projection = await database.query<{
      challenge_version_id: string;
      title: string;
      public_summary: string;
      visibility: string;
      allowed_applicant_types: string[];
      budget_amount_minor: string;
      row: string;
    }>(
      `
        SELECT
          challenge_version_id, title, public_summary, visibility,
          allowed_applicant_types, budget_amount_minor, to_jsonb(t)::text AS row
        FROM challenge_public_projection AS t
        WHERE challenge_id = $1
      `,
      [challengeId],
    );
    expect(projection.rowCount).toBe(1);
    expect(projection.rows[0]).toMatchObject({
      challenge_version_id: approvedVersionId,
      title: "Test Challenge",
      public_summary: "A public-safe summary.",
      visibility: "registered",
      allowed_applicant_types: ["individual", "expert-team", "company"],
      budget_amount_minor: "100000000",
    });
    // Nothing confidential travelled with it.
    for (const confidential of [
      "A deterministic challenge draft for tests.",
      "The current process is manual.",
      "contact@example.test",
      "+980000000000",
    ]) {
      expect(projection.rows[0]?.row).not.toContain(confidential);
    }

    const evidence = await database.query<{
      audits: string;
      receipts: string;
      events: string;
      replays: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM audit_event
            WHERE target_id = $1 AND action = 'challenge.published') AS audits,
          (SELECT count(*) FROM mutation_receipt
            WHERE entity_type = 'challenge' AND entity_id = $1 AND entity_version = 5) AS receipts,
          (SELECT count(*) FROM outbox_event
            WHERE aggregate_id = $1 AND event_type = 'challenge.published') AS events,
          (SELECT count(*) FROM idempotency_key
            WHERE tenant_id = $2 AND idempotency_key = 'b4-publish-command') AS replays
      `,
      [challengeId, ownerTenantId],
    );
    expect(evidence.rows[0]).toEqual({
      audits: "1",
      receipts: "1",
      events: "1",
      replays: "1",
    });

    await expectDatabaseError(
      database.query(`UPDATE challenge_public_projection SET title = 'x' WHERE challenge_id = $1`, [
        challengeId,
      ]),
      "55000",
    );
    await expectDatabaseError(
      database.query(`DELETE FROM challenge_public_projection WHERE challenge_id = $1`, [
        challengeId,
      ]),
      "55000",
    );
  });

  it("refuses to publish an under-approved version and writes nothing", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b4-partial", 220);
    // Three of four gates -- `quality` is deliberately never recorded.
    for (const [index, [gate, role, actorUserId]] of (
      [
        ["technical", "org:approver_technical", ownerUserId],
        ["legal", "org:approver_legal", parseUserId("usr_solver_alpha")],
        ["finance", "org:approver_finance", parseUserId("usr_platform_ops")],
      ] as const
    ).entries()) {
      await challenges.recordApproval(
        challengeId,
        { expected_version: 4, gate, decision: "approved", reason: "Partial approval." },
        context(`b4-partial-${gate}`, 224 + index, { role, actorUserId }),
      );
    }

    await expect(
      challenges.publish(
        challengeId,
        { expected_version: 4 },
        context("b4-partial-publish", 228, { role: "org:publisher" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE" });

    const state = await database.query<{ stage: string; published_version_id: string | null }>(
      "SELECT stage, published_version_id FROM challenge WHERE id = $1",
      [challengeId],
    );
    expect(state.rows[0]).toEqual({ stage: "approvals", published_version_id: null });
    const projections = await database.query(
      "SELECT 1 FROM challenge_public_projection WHERE challenge_id = $1",
      [challengeId],
    );
    expect(projections.rowCount).toBe(0);
  });

  it("serializes concurrent publish attempts into one published version", async () => {
    const challenges = adapter();
    const challengeId = await publishableChallenge(challenges, "b4-race", 240);

    const attempt = (ordinal: number) =>
      challenges.publish(
        challengeId,
        { expected_version: 4 },
        context(`b4-race-publish-${ordinal}`, 250 + ordinal, { role: "org:publisher" }),
      );
    const results = await Promise.allSettled([attempt(1), attempt(2)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const counts = await database.query<{ projections: string; receipts: string }>(
      `
        SELECT
          (SELECT count(*) FROM challenge_public_projection WHERE challenge_id = $1) AS projections,
          (SELECT count(*) FROM mutation_receipt
            WHERE entity_type = 'challenge' AND entity_id = $1 AND entity_version = 5) AS receipts
      `,
      [challengeId],
    );
    expect(counts.rows[0]).toEqual({ projections: "1", receipts: "1" });
  });

  it("rolls back the aggregate, projection, and evidence together on a failed publish", async () => {
    const challenges = adapter();
    const challengeId = await publishableChallenge(challenges, "b4-rollback", 260);
    const snapshotQuery = `
      SELECT jsonb_build_object(
        'stage', (SELECT stage FROM challenge WHERE id = $1),
        'published', (SELECT published_version_id FROM challenge WHERE id = $1),
        'projections', (SELECT count(*) FROM challenge_public_projection WHERE challenge_id = $1),
        'audits', (SELECT count(*) FROM audit_event
          WHERE target_id = $1 AND action = 'challenge.published'),
        'receipts', (SELECT count(*) FROM mutation_receipt
          WHERE entity_id = $1 AND entity_version = 5),
        'events', (SELECT count(*) FROM outbox_event
          WHERE aggregate_id = $1 AND event_type = 'challenge.published'),
        'replays', (SELECT count(*) FROM idempotency_key
          WHERE tenant_id = $2 AND idempotency_key = 'b4-rollback-publish')
      )::text AS snapshot
    `;
    const before = await database.query<{ snapshot: string }>(snapshotQuery, [
      challengeId,
      ownerTenantId,
    ]);

    const failing = adapter({
      beforeCommit: () => {
        throw new Error("forced B4 publish rollback");
      },
    });
    await expect(
      failing.publish(
        challengeId,
        { expected_version: 4 },
        context("b4-rollback-publish", 270, { role: "org:publisher" }),
      ),
    ).rejects.toThrow("forced B4 publish rollback");

    const after = await database.query<{ snapshot: string }>(snapshotQuery, [
      challengeId,
      ownerTenantId,
    ]);
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  it("refuses a hand-written publication that the four gates never cleared", async () => {
    const challenges = adapter();
    const challengeId = await advanceToApprovals(challenges, "b4-forged", 280);
    const current = await challenges.getScoped(context("b4-forged-read", 285), challengeId);

    // Bypassing the adapter entirely: the database itself must reject a
    // published_version_id that no set of four approved gates supports.
    await expectDatabaseError(
      database.query(
        "UPDATE challenge SET stage = 'published', published_version_id = $2 WHERE id = $1",
        [challengeId, current?.current_version_id],
      ),
      "23514",
    );
  });

  it("refuses publication when the approved call deadline has passed", async () => {
    let now = new Date("2030-08-27T08:30:00.000Z");
    const challenges = new PostgresChallengeAdapter(
      new PostgresUnitOfWork(database),
      { now: () => now },
      new MonotonicIdFactory(),
    );
    const challengeId = await advanceToApprovals(
      challenges,
      "b4-expired-publication",
      290,
      buildChallengeContentResource({ proposal_deadline: "2030-08-28T08:30:00.000Z" }),
    );
    await approveAllGates(challenges, challengeId, "b4-expired-publication", 294);

    now = new Date("2030-08-29T08:30:00.000Z");
    await expect(
      challenges.publish(
        challengeId,
        { expected_version: 4 },
        context("b4-expired-publication-publish", 299, { role: "org:publisher" }),
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: "VALIDATION" });
    await expect(publicAdapter().get("anonymous", challengeId)).resolves.toBeNull();
  });

  it("publishes an NDA challenge without creating a public projection row", async () => {
    const challenges = adapter();
    const created = await challenges.create(
      {
        expected_version: 0,
        draft: buildChallengeContentResource({ visibility: "nda", public_summary: "" }),
      },
      context("b4-nda-create", 300),
    );
    const challengeId = created.receipt.entity_id;
    for (const [index, [command, version]] of (
      [
        ["request-triage", 1],
        ["advance-formulation", 2],
        ["request-approvals", 3],
      ] as const
    ).entries()) {
      await challenges.transition(
        challengeId,
        command,
        { expected_version: version },
        context(`b4-nda-${command}`, 301 + index),
      );
    }
    await approveAllGates(challenges, challengeId, "b4-nda", 310);

    await challenges.publish(
      challengeId,
      { expected_version: 4 },
      context("b4-nda-publish", 320, { role: "org:publisher" }),
    );

    const state = await database.query<{ stage: string; projections: string }>(
      `
        SELECT
          challenge.stage,
          (SELECT count(*) FROM challenge_public_projection WHERE challenge_id = $1) AS projections
        FROM challenge
        WHERE challenge.id = $1
      `,
      [challengeId],
    );
    expect(state.rows[0]).toEqual({ stage: "published", projections: "0" });
    const nda = await challenges.getScoped(context("b4-nda-read", 321), challengeId);

    await expectDatabaseError(
      database.query(
        `
          INSERT INTO challenge_public_projection (
            challenge_id, tenant_id, challenge_version_id, title, category, location,
            public_summary, output_type, sourcing_model, applicant_scope,
            allowed_applicant_types, work_mode, proposal_deadline, preferred_start_date,
            budget_status, budget_amount_minor, budget_currency, visibility,
            verification_required, nda_required, document_gate_required, ip_terms,
            state, published_at
          ) VALUES (
            $1, 'ten_org_alpha', $2, 'Forged projection', 'energy', 'Plant',
            'This row disagrees with the authoritative live call.', 'pilot', 'public', 'both',
            ARRAY['individual'], 'hybrid', '2031-01-01T00:00:00Z', NULL,
            'undecided', NULL, 'IRR', 'public', false, false, false,
            'solver_license', 'paused', clock_timestamp()
          )
        `,
        [challengeId, nda?.published_version_id],
      ),
      "23514",
    );
  });

  it("answers public discovery without reading the private aggregate at all", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b5-isolated",
      400,
      buildChallengeContentResource({ visibility: "public" }),
    );

    // The structural proof: take the private tables out of reach by name. Any
    // query in the public adapter that touched `challenge`, `challenge_version`,
    // or `challenge_approval` would now fail with `undefined_table` (42P01)
    // instead of returning rows. Renaming keeps the projection's foreign keys
    // intact, because they follow the table's identity, not its name.
    const hidden = [
      ["challenge", "challenge_out_of_reach"],
      ["challenge_version", "challenge_version_out_of_reach"],
      ["challenge_approval", "challenge_approval_out_of_reach"],
    ] as const;

    let detail: Awaited<ReturnType<PostgresPublicChallengeAdapter["get"]>> = null;
    try {
      for (const [from, to] of hidden) {
        await database.query(`ALTER TABLE ${from} RENAME TO ${to}`);
      }
      const catalogue = publicAdapter();
      const page = await catalogue.list("anonymous", {});
      expect(page.items.map((row) => row.challenge_id)).toEqual([challengeId]);
      detail = await catalogue.get("anonymous", challengeId);
    } finally {
      // The names must come back even when an assertion above fails, or the
      // next test's migration rollback cannot find the tables it drops.
      for (const [from, to] of hidden) {
        await database.query(`ALTER TABLE IF EXISTS ${to} RENAME TO ${from}`);
      }
    }

    expect(detail).toMatchObject({
      challenge_id: challengeId,
      title: "Test Challenge",
      public_summary: "A public-safe summary.",
      visibility: "public",
    });
    // And the projection it returned carries only allowlisted fields.
    expect(Object.keys(detail ?? {}).sort()).toEqual(
      [
        "allowed_applicant_types",
        "applicant_scope",
        "budget",
        "category",
        "challenge_id",
        "challenge_version_id",
        "document_gate_required",
        "ip_terms",
        "location",
        "nda_required",
        "output_type",
        "preferred_start_date",
        "proposal_deadline",
        "public_summary",
        "published_at",
        "sourcing_model",
        "state",
        "title",
        "verification_required",
        "visibility",
        "work_mode",
      ].sort(),
    );
  });

  it("withholds registered challenges from the anonymous audience", async () => {
    const challenges = adapter();
    const openId = await publishedChallenge(
      challenges,
      "b5-open",
      420,
      buildChallengeContentResource({ visibility: "public" }),
    );
    const gatedId = await publishedChallenge(
      challenges,
      "b5-gated",
      440,
      buildChallengeContentResource({ visibility: "registered" }),
    );

    const catalogue = publicAdapter();
    const anonymous = await catalogue.list("anonymous", {});
    expect(anonymous.items.map((row) => row.challenge_id)).toEqual([openId]);
    await expect(catalogue.get("anonymous", gatedId)).resolves.toBeNull();

    const registered = await catalogue.list("registered", {});
    expect(registered.items.map((row) => row.challenge_id).sort()).toEqual(
      [openId, gatedId].sort(),
    );
    await expect(catalogue.get("registered", gatedId)).resolves.not.toBeNull();
  });

  it("pages the catalogue by keyset cursor and filters by category", async () => {
    const challenges = adapter();
    // Publication order is immutable; ids break ties under this fixed test clock.
    const oldest = await publishedChallenge(
      challenges,
      "b5-page-oldest",
      460,
      buildChallengeContentResource({
        visibility: "public",
        category: "logistics",
        proposal_deadline: "2030-01-01T00:00:00.000Z",
      }),
    );
    const middle = await publishedChallenge(
      challenges,
      "b5-page-middle",
      480,
      buildChallengeContentResource({
        visibility: "public",
        category: "logistics",
        proposal_deadline: "2030-06-01T00:00:00.000Z",
      }),
    );
    const newest = await publishedChallenge(
      challenges,
      "b5-page-newest",
      500,
      buildChallengeContentResource({
        visibility: "public",
        category: "operations",
        proposal_deadline: "2030-12-01T00:00:00.000Z",
      }),
    );

    const catalogue = publicAdapter();
    const first = await catalogue.list("anonymous", {});
    expect(first.items.map((row) => row.challenge_id)).toEqual([newest, middle, oldest]);
    // A single page holds all three, so there is nothing left to continue from.
    expect(first.next_cursor).toBeNull();

    // Continuing from the newest row yields exactly the rows after it.
    const afterNewest = await catalogue.list("anonymous", {
      cursor: encodePublicChallengeCursor(first.items[0]!),
    });
    expect(afterNewest.items.map((row) => row.challenge_id)).toEqual([middle, oldest]);

    const logistics = await catalogue.list("anonymous", { category: "logistics" });
    expect(logistics.items.map((row) => row.challenge_id)).toEqual([middle, oldest]);
    const normalized = await catalogue.list("anonymous", { category: " LOGISTICS " });
    expect(normalized.items.map((row) => row.challenge_id)).toEqual([middle, oldest]);

    await expect(catalogue.list("anonymous", { cursor: "%%%not-base64%%%" })).rejects.toMatchObject(
      {
        statusCode: 422,
        code: "VALIDATION",
      },
    );
  });

  it("extends a deadline forward without touching the approved version", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-extend",
      600,
      buildChallengeContentResource({ visibility: "public" }),
    );
    const before = await challenges.getScoped(context("b6-extend-read", 610), challengeId);
    const approvedVersionId = before?.published_version_id;
    expect(before?.publication_state).toBe("open");

    const extended = await challenges.extendDeadline(
      challengeId,
      { expected_version: 5, proposal_deadline: "2031-06-01T00:00:00.000Z", reason: "تمدید مهلت." },
      context("b6-extend-command", 611, { role: "org:publisher" }),
    );
    expect(extended.entityVersion).toBe(6);

    const after = await challenges.getScoped(context("b6-extend-reread", 612), challengeId);
    expect(after?.proposal_deadline_at).toBe("2031-06-01T00:00:00.000Z");
    // The approved version is untouched: the gates approved that content.
    expect(after?.published_version_id).toBe(approvedVersionId);
    expect(after?.content.proposal_deadline).toBe(before?.content.proposal_deadline);

    const projection = await database.query<{ proposal_deadline: Date }>(
      "SELECT proposal_deadline FROM challenge_public_projection WHERE challenge_id = $1",
      [challengeId],
    );
    expect(projection.rows[0]?.proposal_deadline).toEqual(new Date("2031-06-01T00:00:00.000Z"));

    // Backwards is refused by the command...
    await expect(
      challenges.extendDeadline(
        challengeId,
        {
          expected_version: 6,
          proposal_deadline: "2030-01-01T00:00:00.000Z",
          reason: "کوتاه‌کردن مهلت.",
        },
        context("b6-extend-backwards", 613, { role: "org:publisher" }),
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: "VALIDATION" });

    // ...and by the database, so a direct write cannot shorten it either.
    await expectDatabaseError(
      database.query("UPDATE challenge SET proposal_deadline_at = $2 WHERE id = $1", [
        challengeId,
        "2030-01-01T00:00:00.000Z",
      ]),
      "23514",
    );
  });

  it("hides a paused call from discovery, keeps its record, and resumes it", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-pause",
      620,
      buildChallengeContentResource({ visibility: "public" }),
    );
    const catalogue = publicAdapter();
    expect((await catalogue.list("anonymous", {})).items.map((r) => r.challenge_id)).toEqual([
      challengeId,
    ]);

    // A direct projection write is not an alternate lifecycle command: the
    // mutable fields must already match the authoritative aggregate.
    await expectDatabaseError(
      database.query(
        "UPDATE challenge_public_projection SET state = 'paused' WHERE challenge_id = $1",
        [challengeId],
      ),
      "23514",
    );
    await expectDatabaseError(
      database.query(
        "UPDATE challenge_public_projection SET proposal_deadline = '2031-01-01T00:00:00Z' WHERE challenge_id = $1",
        [challengeId],
      ),
      "23514",
    );

    await challenges.changePublicationState(
      challengeId,
      "pause",
      { expected_version: 5, reason: "توقف موقت برای بازبینی." },
      context("b6-pause-command", 621, { role: "org:publisher" }),
    );

    // Gone from the listing...
    expect((await catalogue.list("anonymous", {})).items).toHaveLength(0);
    // ...but still resolvable by direct link, showing why it stopped.
    const detail = await catalogue.get("anonymous", challengeId);
    expect(detail?.state).toBe("paused");
    const pauseAudit = await database.query<{ reason: string }>(
      `
        SELECT metadata ->> 'reason' AS reason
        FROM audit_event
        WHERE target_id = $1 AND action = 'challenge.paused'
      `,
      [challengeId],
    );
    expect(pauseAudit.rows[0]?.reason).toBe("توقف موقت برای بازبینی.");

    await challenges.changePublicationState(
      challengeId,
      "resume",
      { expected_version: 6, reason: "ادامه فراخوان." },
      context("b6-resume-command", 622, { role: "org:publisher" }),
    );
    expect((await catalogue.list("anonymous", {})).items.map((r) => r.challenge_id)).toEqual([
      challengeId,
    ]);
  });

  it("treats closed and cancelled as terminal in the command and in the database", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-terminal",
      640,
      buildChallengeContentResource({ visibility: "public" }),
    );

    await challenges.changePublicationState(
      challengeId,
      "cancel",
      { expected_version: 5, reason: "لغو فراخوان با اطلاع‌رسانی." },
      context("b6-cancel-command", 641, { role: "org:publisher" }),
    );

    await expect(
      challenges.changePublicationState(
        challengeId,
        "resume",
        { expected_version: 6, reason: "تلاش برای بازگشایی." },
        context("b6-reopen-command", 642, { role: "org:publisher" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE" });

    // Reopening a cancelled call is a new challenge, not a state flip -- the
    // database refuses it even outside the command.
    await expectDatabaseError(
      database.query("UPDATE challenge SET publication_state = 'open' WHERE id = $1", [
        challengeId,
      ]),
      "23514",
    );

    const catalogue = publicAdapter();
    expect((await catalogue.list("anonymous", {})).items).toHaveLength(0);
    expect((await catalogue.get("anonymous", challengeId))?.state).toBe("cancelled");
  });

  it("refuses a lifecycle command from a non-publisher role at the adapter", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-role",
      680,
      buildChallengeContentResource({ visibility: "public" }),
    );

    // app.ts already gates this on `org:publisher`; the adapter must not rely
    // on that alone, the same way B2's gate recording and B4's publish do not.
    for (const role of ["org:owner", "org:member", "platform:ops"] as const) {
      await expect(
        challenges.changePublicationState(
          challengeId,
          "pause",
          { expected_version: 5, reason: "نقش نامعتبر." },
          context(`b6-role-${role.replace(/[^a-z]/g, "")}`, 681, { role }),
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
      await expect(
        challenges.extendDeadline(
          challengeId,
          {
            expected_version: 5,
            proposal_deadline: "2031-06-01T00:00:00.000Z",
            reason: "نقش نامعتبر.",
          },
          context(`b6-role-x-${role.replace(/[^a-z]/g, "")}`, 682, { role }),
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
    }

    const state = await database.query<{ publication_state: string }>(
      "SELECT publication_state FROM challenge WHERE id = $1",
      [challengeId],
    );
    expect(state.rows[0]?.publication_state).toBe("open");
  });

  it("rolls back every lifecycle row when the commit fails", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-rollback",
      660,
      buildChallengeContentResource({ visibility: "public" }),
    );
    const snapshotQuery = `
      SELECT jsonb_build_object(
        'state', (SELECT publication_state FROM challenge WHERE id = $1),
        'deadline', (SELECT proposal_deadline_at FROM challenge WHERE id = $1),
        'projection', (SELECT state FROM challenge_public_projection WHERE challenge_id = $1),
        'audits', (SELECT count(*) FROM audit_event
          WHERE target_id = $1 AND action = 'challenge.paused'),
        'events', (SELECT count(*) FROM outbox_event
          WHERE aggregate_id = $1 AND event_type = 'challenge.paused')
      )::text AS snapshot
    `;
    const before = await database.query<{ snapshot: string }>(snapshotQuery, [challengeId]);

    const failing = adapter({
      beforeCommit: () => {
        throw new Error("forced B6 pause rollback");
      },
    });
    await expect(
      failing.changePublicationState(
        challengeId,
        "pause",
        { expected_version: 5, reason: "باید برگردد." },
        context("b6-rollback-pause", 670, { role: "org:publisher" }),
      ),
    ).rejects.toThrow("forced B6 pause rollback");

    const after = await database.query<{ snapshot: string }>(snapshotQuery, [challengeId]);
    expect(after.rows[0]?.snapshot).toBe(before.rows[0]?.snapshot);
  });

  it("backfills publication state for challenges published before migration 0009", async () => {
    const challenges = adapter();
    const challengeId = await publishedChallenge(
      challenges,
      "b6-backfill",
      600,
      buildChallengeContentResource({ visibility: "public" }),
    );

    // Roll 0010 and 0009 off, then back on, with a *published* challenge already present.
    // The suite normally migrates an empty database, so the backfill path --
    // and the ordering bug where the pairing constraint was added before it --
    // is invisible without this.
    // Three migrations sit above 0010, so the walk down is three steps longer
    // than a single-branch tree: 0014 (C1 solver profile/eligibility), 0013
    // (the proposal foundation), then 0012 (phase-2 review closure).
    const solverDown = await runMigrations(database, "down");
    expect(solverDown.applied).toEqual(["0014_c1_solver_profile_eligibility"]);
    const proposalDown = await runMigrations(database, "down");
    expect(proposalDown.applied).toEqual(["0013_c_proposal_foundation"]);
    const reviewClosureDown = await runMigrations(database, "down");
    expect(reviewClosureDown.applied).toEqual(["0012_phase2_review_closure"]);
    const closureDown = await runMigrations(database, "down");
    expect(closureDown.applied).toEqual(["0010_phase2_closure"]);
    const down = await runMigrations(database, "down");
    expect(down.applied).toEqual(["0009_b6_publication_lifecycle"]);
    const up = await runMigrations(database, "up");
    expect(up.applied).toEqual([
      "0009_b6_publication_lifecycle",
      "0010_phase2_closure",
      "0012_phase2_review_closure",
      "0013_c_proposal_foundation",
      "0014_c1_solver_profile_eligibility",
    ]);

    const restored = await database.query<{
      publication_state: string;
      proposal_deadline_at: Date;
    }>("SELECT publication_state, proposal_deadline_at FROM challenge WHERE id = $1", [
      challengeId,
    ]);
    expect(restored.rows[0]?.publication_state).toBe("open");
    expect(restored.rows[0]?.proposal_deadline_at).toEqual(new Date("2030-02-01T00:00:00.000Z"));
  });

  it("rolls back aggregate, version, receipt, audit, outbox, and replay together", async () => {
    const before = await database.query<{ snapshot: string }>(`
      SELECT jsonb_build_object(
        'challenges', (SELECT count(*) FROM challenge),
        'versions', (SELECT count(*) FROM challenge_version),
        'eligibility_rules', (SELECT count(*) FROM eligibility_rule),
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
        'eligibility_rules', (SELECT count(*) FROM eligibility_rule),
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

  it("authorizes a cross-tenant platform gate through the unit of work and denies a revoked session", async () => {
    const platformToken = "local-b2-access-platform-ops";
    await database.query(
      `
        INSERT INTO app_session (
          id, user_id, origin_tenant_id, token_family_id, access_token_digest,
          refresh_token_digest, session_version, active_tenant_id, active_workspace_id,
          issued_at, access_expires_at, refresh_expires_at, last_used_at
        ) VALUES (
          'ses_platform_ops_b2', 'usr_platform_ops', 'ten_platform', 'family_platform_ops_b2',
          $1, $2, 1, 'ten_platform', 'wsp_platform_main',
          '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z'
        )
      `,
      [credentialDigest(platformToken), credentialDigest(`${platformToken}-refresh`)],
    );

    const composition = await createRuntimeApiComposition(postgresRuntimeEnvironment());
    const api = buildApi(composition.ports);
    try {
      // Drive the org-side lifecycle to `approvals` with the seeded org owner.
      const created = await api.inject({
        method: "POST",
        url: "/api/v1/challenges",
        headers: apiHeaders("b2-authz-create"),
        payload: { expected_version: 0, draft: buildChallengeContentResource() },
      });
      expect(created.statusCode).toBe(201);
      const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;
      for (const [route, version, key] of [
        [":request-triage", 1, "b2-authz-triage"],
        [":advance-formulation", 2, "b2-authz-formulation"],
        [":request-approvals", 3, "b2-authz-approvals"],
      ] as const) {
        const step = await api.inject({
          method: "POST",
          url: `/api/v1/challenges/${challengeId}${route}`,
          headers: apiHeaders(key),
          payload: { expected_version: version },
        });
        expect(step.statusCode).toBe(200);
      }

      const gateUrl = `/api/v1/challenges/${challengeId}/approvals:record`;
      const platformHeaders = (idempotencyKey: string) => ({
        authorization: `Bearer ${platformToken}`,
        // The platform actor's own session stays active in wsp_platform_main;
        // the target org workspace is reached only via platform authority.
        "x-workspace-id": ownerWorkspaceId,
        "idempotency-key": idempotencyKey,
      });

      const quality = await api.inject({
        method: "POST",
        url: gateUrl,
        headers: platformHeaders("b2-authz-quality"),
        payload: {
          expected_version: 4,
          gate: "quality",
          decision: "approved",
          reason: "Independent platform quality review passed.",
        },
      });
      expect(quality.statusCode).toBe(200);
      const recorded = await database.query<{ role: string; user_id: string }>(
        `
          SELECT recorded_by_role AS role, recorded_by_user_id AS user_id
          FROM challenge_approval
          WHERE challenge_id = $1 AND gate = 'quality'
        `,
        [challengeId],
      );
      expect(recorded.rows[0]).toEqual({ role: "platform:ops", user_id: "usr_platform_ops" });

      // platform:ops holds no standing authority over the technical gate, so
      // the cross-tenant reach fails and must not enumerate the challenge.
      const technical = await api.inject({
        method: "POST",
        url: gateUrl,
        headers: platformHeaders("b2-authz-technical"),
        payload: {
          expected_version: 4,
          gate: "technical",
          decision: "approved",
          reason: "Not this actor's gate.",
        },
      });
      expect(technical.statusCode).toBe(404);

      await database.query(
        `
          UPDATE app_session
          SET revoked_at = clock_timestamp(), revocation_reason = 'b2_authority_test'
          WHERE id = 'ses_platform_ops_b2'
        `,
      );
      const afterRevocation = await api.inject({
        method: "POST",
        url: gateUrl,
        headers: platformHeaders("b2-authz-after-revoke"),
        payload: {
          expected_version: 4,
          gate: "legal",
          decision: "approved",
          reason: "Revoked session must not record a gate.",
        },
      });
      expect(afterRevocation.statusCode).toBe(403);
      const total = await database.query<{ count: string }>(
        "SELECT count(*) AS count FROM challenge_approval WHERE challenge_id = $1",
        [challengeId],
      );
      expect(total.rows[0]?.count).toBe("1");
    } finally {
      await api.close();
      await composition.close();
    }
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
    ).rejects.toThrow("refuses production");
  });
});
