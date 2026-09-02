import {
  parseChallengeId,
  parseChallengeVersionId,
  parseCorrelationId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiProblem } from "../src/errors.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresSolverWorkspaceAdapter } from "../src/postgres/solver-workspaces.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_c1_solver_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

let admin: Client;
let database: Pool;
let now = new Date("2026-01-01T00:00:00.000Z");
let adapter: PostgresSolverWorkspaceAdapter;

const teamContext = (idempotencyKey: string) => ({
  tenantId: parseTenantId("ten_solver_alpha"),
  workspaceId: parseWorkspaceId("wsp_team_alpha"),
  actorUserId: parseUserId("usr_solver_alpha"),
  role: "team:owner" as const,
  idempotencyKey,
  correlationId: parseCorrelationId(`cor_${idempotencyKey.replaceAll(/[^A-Za-z0-9_-]/g, "_")}`),
});

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
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 4 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);

  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_c1_technical', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'technical', 'approved',
       'Synthetic approval', 'usr_approver_alpha', 'org:approver_technical', clock_timestamp()),
      ('cap_c1_legal', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'legal', 'approved',
       'Synthetic approval', 'usr_platform_legal', 'platform:legal', clock_timestamp()),
      ('cap_c1_finance', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'finance', 'approved',
       'Synthetic approval', 'usr_platform_finance', 'platform:finance', clock_timestamp()),
      ('cap_c1_quality', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'quality', 'approved',
       'Synthetic approval', 'usr_platform_ops', 'platform:ops', clock_timestamp())
  `);
  await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_c1_synthetic_v1', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_synthetic_alpha', 'chv_synthetic_alpha_v1',
      ARRAY['individual', 'expert-team']::text[], true, true, true,
      '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    )
  `);
  await database.query(`
    UPDATE challenge
    SET stage = 'published',
        published_version_id = 'chv_synthetic_alpha_v1',
        publication_state = 'open',
        proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = clock_timestamp()
    WHERE id = 'chl_synthetic_alpha'
  `);
  await database.query(`
    INSERT INTO challenge_public_projection (
      challenge_id, tenant_id, challenge_version_id, title, category, location,
      public_summary, output_type, sourcing_model, applicant_scope,
      allowed_applicant_types, work_mode, proposal_deadline, preferred_start_date,
      budget_status, budget_amount_minor, budget_currency, visibility,
      verification_required, nda_required, document_gate_required, ip_terms,
      state, published_at
    ) VALUES (
      'chl_synthetic_alpha', 'ten_org_alpha', 'chv_synthetic_alpha_v1',
      'Synthetic C1 challenge', 'technology', 'Tehran',
      'Synthetic public projection for C1 eligibility tests.',
      'pilot', 'public', 'both', ARRAY['individual', 'expert-team']::text[],
      'hybrid', '2099-01-01T00:00:00Z', NULL,
      'undecided', NULL, 'IRR', 'public', true, true, true,
      'solver_license', 'open', clock_timestamp()
    )
  `);

  adapter = new PostgresSolverWorkspaceAdapter(
    new PostgresUnitOfWork(database),
    { now: () => new Date(now) },
    new MonotonicIdFactory(),
  );
}, 60_000);

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
  await admin.end();
});

describe("C1 PostgreSQL solver workspace adapter", () => {
  it("derives personal/team facts and denies a tenant/workspace ID swap", async () => {
    const personal = await adapter.getProfile({
      ...teamContext("c1-read-personal"),
      workspaceId: parseWorkspaceId("wsp_individual_alpha"),
      role: "individual",
    });
    const team = await adapter.getProfile(teamContext("c1-read-team"));
    expect(personal).toMatchObject({ workspace_kind: "individual", applicant_type: "individual" });
    expect(team).toMatchObject({ workspace_kind: "team", applicant_type: "expert-team" });

    await expect(
      adapter.getProfile({
        ...teamContext("c1-swapped-scope"),
        tenantId: parseTenantId("ten_org_alpha"),
      }),
    ).resolves.toBeNull();
  });

  it("atomically versions profile facts and enforces stale/idempotent commands", async () => {
    const body = {
      expected_version: 1,
      patch: {
        headline: "تیم تحلیل داده",
        overview: "تجربه اجرای پروژه‌های تحلیل داده در محیط‌های عملیاتی و صنعتی.",
        expertise: ["تحلیل داده"],
        geography: ["ایران"],
      },
    };
    const context = teamContext("c1-profile-update");
    await expect(
      adapter.patchProfile(body, { ...teamContext("c1-profile-viewer"), role: "team:viewer" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
    const first = await adapter.patchProfile(body, context);
    const replay = await adapter.patchProfile(body, context);
    expect(first.entityVersion).toBe(2);
    expect(replay.receipt).toEqual({ ...first.receipt, idempotent: true });

    await expect(
      adapter.patchProfile(
        { ...body, patch: { ...body.patch, headline: "تغییر ناسازگار" } },
        context,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      options: { recovery: "use_a_new_idempotency_key" },
    });
    await expect(adapter.patchProfile(body, teamContext("c1-profile-stale"))).rejects.toMatchObject(
      { code: "CONFLICT", options: { recovery: "refetch_and_retry" } },
    );

    const evidence = await database.query<{
      audits: string;
      receipts: string;
      outbox: string;
      idempotency: string;
    }>(`
      SELECT
        (SELECT count(*) FROM audit_event WHERE action = 'solver.profile.updated') AS audits,
        (SELECT count(*) FROM mutation_receipt WHERE entity_type = 'solver_workspace_profile') AS receipts,
        (SELECT count(*) FROM outbox_event WHERE event_type = 'solver.profile.updated') AS outbox,
        (SELECT count(*) FROM idempotency_key WHERE idempotency_key = 'c1-profile-update') AS idempotency
    `);
    expect(evidence.rows[0]).toEqual({ audits: "1", receipts: "1", outbox: "1", idempotency: "1" });
  });

  it("keeps contact identity separate, never self-verifies, and uses live challenge state", async () => {
    const challengeId = parseChallengeId("chl_synthetic_alpha");
    const initial = await adapter.evaluate(teamContext("c1-eligibility-initial"), challengeId);
    expect(initial).toMatchObject({
      evaluated_against_version_id: "chv_synthetic_alpha_v1",
      status: "needs_action",
      reasons: [
        { code: "verification_required" },
        { code: "nda_required" },
        { code: "document_acknowledgement_required" },
      ],
    });

    const started = await adapter.startVerification(
      { expected_version: 1 },
      teamContext("c1-verification-start"),
    );
    const replay = await adapter.startVerification(
      { expected_version: 1 },
      teamContext("c1-verification-start"),
    );
    expect(started.entityVersion).toBe(2);
    expect(replay.receipt.idempotent).toBe(true);
    expect((await adapter.getVerification(teamContext("c1-verification-read")))?.state).toBe(
      "draft",
    );

    await database.query(`
      UPDATE verification_record
      SET state = 'verified', lock_version = lock_version + 1,
          verified_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE workspace_id = 'wsp_team_alpha'
    `);
    const afterIndependentVerification = await adapter.evaluate(
      teamContext("c1-eligibility-verified"),
      challengeId,
    );
    expect(afterIndependentVerification?.reasons.map(({ code }) => code)).toEqual([
      "nda_required",
      "document_acknowledgement_required",
    ]);

    await database.query(
      "UPDATE challenge SET publication_state = 'paused' WHERE id = 'chl_synthetic_alpha'",
    );
    expect(
      (await adapter.evaluate(teamContext("c1-eligibility-paused"), challengeId))?.reasons,
    ).toEqual([expect.objectContaining({ code: "call_not_open" })]);
    await database.query(
      "UPDATE challenge SET publication_state = 'open' WHERE id = 'chl_synthetic_alpha'",
    );

    now = new Date("2100-01-01T00:00:00.000Z");
    expect(
      (await adapter.evaluate(teamContext("c1-eligibility-expired"), challengeId))?.reasons,
    ).toEqual([expect.objectContaining({ code: "deadline_passed" })]);
    now = new Date("2026-01-01T00:00:00.000Z");
  });

  it("binds append-only acknowledgements to the exact published rule version", async () => {
    const challengeId = parseChallengeId("chl_synthetic_alpha");
    const versionId = parseChallengeVersionId("chv_synthetic_alpha_v1");
    await expect(
      adapter.acceptEligibilityGate(
        challengeId,
        "nda",
        { expected_version: 0, challenge_version_id: parseChallengeVersionId("chv_unknown_v2") },
        teamContext("c1-nda-wrong-version"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const nda = await adapter.acceptEligibilityGate(
      challengeId,
      "nda",
      { expected_version: 0, challenge_version_id: versionId },
      teamContext("c1-nda-accept"),
    );
    const ndaReplay = await adapter.acceptEligibilityGate(
      challengeId,
      "nda",
      { expected_version: 0, challenge_version_id: versionId },
      teamContext("c1-nda-accept"),
    );
    expect(ndaReplay.receipt).toEqual({ ...nda.receipt, idempotent: true });
    await expect(
      adapter.acceptEligibilityGate(
        challengeId,
        "nda",
        { expected_version: 0, challenge_version_id: versionId },
        teamContext("c1-nda-duplicate"),
      ),
    ).rejects.toBeInstanceOf(ApiProblem);

    const document = await adapter.acceptEligibilityGate(
      challengeId,
      "document_acknowledgement",
      { expected_version: 0, challenge_version_id: versionId },
      teamContext("c1-document-accept"),
    );
    expect(document.entityVersion).toBe(1);
    expect((await adapter.evaluate(teamContext("c1-eligibility-clear"), challengeId))?.status).toBe(
      "eligible",
    );

    await expectDatabaseError(
      database.query(
        "UPDATE eligibility_gate_acceptance SET accepted_at = clock_timestamp() WHERE id = $1",
        [document.receipt.entity_id],
      ),
      "55000",
    );
    await expectDatabaseError(
      database.query(
        "UPDATE solver_workspace_profile SET applicant_type = 'company' WHERE workspace_id = 'wsp_team_alpha'",
      ),
      "55000",
    );
  });
});
