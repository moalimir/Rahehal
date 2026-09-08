import {
  apiRoutes,
  type ReviewAssignmentListSuccessEnvelope,
  type ErrorEnvelope,
} from "@rahhal/contracts";
import { parseMembershipId, parseTenantId, parseUserId, parseWorkspaceId } from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { createPostgresApiComposition } from "../src/postgres-composition.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresReviewAdapter } from "../src/postgres/reviews.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import {
  LocalTestOidcAuthorizationAdapter,
  LocalTestSessionCredentialIssuer,
} from "./support/local-test-identity.js";
import type { ReviewerScope } from "../src/ports.js";

const adminUrl = testDatabaseAdminUrl();
const name = `rahhal_d1_review_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${name}`;
let admin: Client;
let database: Pool;
let connected = false;
let created = false;
let app: ReturnType<typeof buildApi> | undefined;
let reviews: PostgresReviewAdapter;
const scope = (suffix: string): ReviewerScope => ({
  tenantId: parseTenantId("ten_platform"),
  workspaceId: parseWorkspaceId("wsp_platform_main"),
  actorUserId: parseUserId(`usr_reviewer_${suffix}`),
  membershipId: parseMembershipId(`mem_reviewer_${suffix}`),
  role: "platform:reviewer",
});
const headers = {
  authorization: "Bearer local-seed-reviewer-alpha-access-0001",
  "x-workspace-id": "wsp_platform_main",
};
const oidcRecord = {
  authorizationAttemptId: "oat_d1_reviewer",
  issuer: "https://oidc.synthetic.invalid",
  subject: "reviewer-alpha",
  verifiedEmail: "reviewer-alpha@synthetic.invalid",
  authorizationCode: "d1-reviewer-authorization",
  codeVerifier: "d1-reviewer-code-verifier-0000000000000000000000000",
  redirectUri: "http://localhost:3000/auth/callback",
  state: "d1-reviewer-state",
};
async function createApp() {
  const composition = await createPostgresApiComposition({
    pool: database,
    oidc: new LocalTestOidcAuthorizationAdapter([oidcRecord], "test"),
    credentials: new LocalTestSessionCredentialIssuer(
      "d1-reviewer-test-credential-secret-00000001",
      "test",
    ),
    environment: {
      NODE_ENV: "test",
      SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
      SOLVER_OTP_DEVELOPMENT_CODE: "12345",
      SOLVER_OTP_FLOW_SECRET: "d1-reviewer-test-contact-secret-000000001",
    },
  });
  return buildApi(composition.ports);
}

function proposalContent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "راهکار کاهش مصرف انرژی",
    problem_statement: "شرح کامل مسئله عملیاتی و ریشه‌های مصرف بیش از اندازه.",
    value_proposition: "راهکار پیشنهادی امکان کاهش سنجش‌پذیر مصرف را فراهم می‌کند.",
    maturity_level: "prototype",
    prototype_weeks: "8",
    technologies: ["sensor"],
    technical_approach: "نمونه‌سازی مرحله‌ای، جمع‌آوری داده و ارزیابی در محل.",
    architecture: "edge",
    data_needs: "telemetry",
    success_metrics: "کاهش حداقل بیست درصدی مصرف.",
    ip_status: "owned",
    duration_weeks: "16",
    roadmap: "prototype, pilot, measurement",
    dependencies: "site access",
    pilot_location: "factory",
    risks: "integration",
    mitigation: "staged rollout",
    lead_name: "Synthetic Solver",
    team_summary: "Synthetic team",
    relevant_experience: "Relevant industrial delivery",
    budget_amount_minor: 100_000,
    budget_currency: "IRR",
    payment_model: "milestone",
    budget_rationale: "Synthetic estimate",
    start_availability: "two-weeks",
    team_availability: "part-time",
    nda_accepted: true,
    conflict_declared: true,
    ip_accepted: true,
    accuracy_confirmed: true,
    attachment_ids: [],
    ...overrides,
  };
}

/**
 * Appends the locked version a submission creates. Since `0016` the lock can
 * only arrive on a new append-only row, so every locking rule is exercised
 * through an INSERT rather than an UPDATE of the draft version.
 */
async function insertLockedVersion(acceptedChallengeVersionId: string): Promise<unknown> {
  return database.query(
    `INSERT INTO proposal_version (
       id, proposal_id, challenge_id, version_number, actor_user_id, content,
       content_hash, changed_fields, base_version_id,
       accepted_challenge_version_id, locked_at, lock_reason, created_at
     ) VALUES ('prv_foundation_alpha_v2', 'prp_foundation_alpha', 'chl_synthetic_alpha', 2,
       'usr_solver_alpha', $1, $2, '{}'::text[], 'prv_foundation_alpha_v1',
       $3, transaction_timestamp(), 'submission', transaction_timestamp())`,
    [proposalContent(), "c".repeat(64), acceptedChallengeVersionId],
  );
}

async function createDraftProposal(
  id = "prp_foundation_alpha",
  versionId = "prv_foundation_alpha_v1",
): Promise<void> {
  await database.query(
    `INSERT INTO proposal (
       id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
       current_version_id, state, assigned_membership_ids, lock_version,
       created_by_user_id, created_at, updated_at
     ) VALUES ($1, 'ten_solver_alpha', 'wsp_team_alpha', 'team',
       'chl_synthetic_alpha', $2, 'draft', ARRAY['mem_team_owner_alpha'], 1,
       'usr_solver_alpha', transaction_timestamp(), transaction_timestamp())`,
    [id, versionId],
  );
  await database.query(
    `INSERT INTO proposal_version (
       id, proposal_id, challenge_id, version_number, actor_user_id, content,
       content_hash, changed_fields, created_at
     ) VALUES ($1, $2, 'chl_synthetic_alpha', 1, 'usr_solver_alpha', $3,
       $4, ARRAY['title'], transaction_timestamp())`,
    [versionId, id, proposalContent(), "a".repeat(64)],
  );
  await database.query("SET CONSTRAINTS ALL IMMEDIATE");
  await database.query("SET CONSTRAINTS ALL DEFERRED");
}

async function insertAssignment(
  id: string,
  reviewer: string,
  proposalVersion = "prv_foundation_alpha_v2",
  tenant = "ten_org_alpha",
) {
  return database.query(
    `INSERT INTO review_assignment (id, tenant_id, proposal_version_id, rubric_version_id, reviewer_membership_id, reviewer_user_id, due_at, created_by_user_id)
    VALUES ($1, $2, $3, 'rbv_d1_alpha_001', $4, $5, transaction_timestamp() + interval '7 days', 'usr_owner_alpha')`,
    [id, tenant, proposalVersion, `mem_reviewer_${reviewer}`, `usr_reviewer_${reviewer}`],
  );
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 2000 });
  await admin.connect();
  connected = true;
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Unsafe test database name");
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  database = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
  await runMigrations(database, "up");
  expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0022_d1_review_foundation"]);
  expect((await runMigrations(database, "up")).applied).toEqual([
    "0022_d1_review_foundation",
    "0023_d2_rubric_authoring",
    "0024_d3_open_evaluation",
  ]);
  await seedSyntheticData(database);
  reviews = new PostgresReviewAdapter(new PostgresUnitOfWork(database));
  expect(await reviews.list(scope("alpha"), {})).toEqual({ items: [] });
  // Synthetic publication/submission setup; these are D1 database-boundary tests,
  // not a claim that the browser or publication command was exercised here.
  await database.query("BEGIN");
  try {
    await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_foundation_technical', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'technical', 'approved',
       'Synthetic approval', 'usr_approver_alpha', 'org:approver_technical', transaction_timestamp()),
      ('cap_foundation_legal', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'legal', 'approved',
       'Synthetic approval', 'usr_platform_legal', 'platform:legal', transaction_timestamp()),
      ('cap_foundation_finance', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'finance', 'approved',
       'Synthetic approval', 'usr_platform_finance', 'platform:finance', transaction_timestamp()),
      ('cap_foundation_quality', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'quality', 'approved',
       'Synthetic approval', 'usr_platform_ops', 'platform:ops', transaction_timestamp())
  `);
    // Migration 0012 stopped creating an eligibility rule on every version and
    // now snapshots one when a version enters approvals, then requires a
    // published version to have that snapshot. This fixture publishes by direct
    // SQL, so it has to write the snapshot the approvals transition would have.
    await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_synthetic_alpha_v1', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_synthetic_alpha', 'chv_synthetic_alpha_v1',
      ARRAY['individual', 'expert-team']::text[], false, false, false,
      '2099-01-01T00:00:00Z', 'open', transaction_timestamp()
    )
    ON CONFLICT (challenge_version_id) DO NOTHING
  `);
    await database.query(`
    UPDATE challenge
    SET stage = 'published',
        published_version_id = 'chv_synthetic_alpha_v1',
        publication_state = 'open',
        proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = transaction_timestamp()
    WHERE id = 'chl_synthetic_alpha'
  `);
    await createDraftProposal();
    await insertLockedVersion("chv_synthetic_alpha_v1");
    await database.query(
      `UPDATE proposal SET current_version_id = 'prv_foundation_alpha_v2', state = 'submitted', lock_version = 2, submitted_at = transaction_timestamp(), updated_at = transaction_timestamp(), tracking_code = 'PRP-2026-999' WHERE id = 'prp_foundation_alpha'`,
    );
    await database.query(`INSERT INTO rubric (id, tenant_id, challenge_id, challenge_version_id) VALUES ('rub_d1_alpha', 'ten_org_alpha', 'chl_synthetic_alpha', 'chv_synthetic_alpha_v1');
      INSERT INTO rubric_version (id, rubric_id, version_number, criteria, created_by_user_id) VALUES ('rbv_d1_alpha_001', 'rub_d1_alpha', 1, '[{"id":"quality","label":"Quality","weight":100,"min":0,"max":5}]', 'usr_owner_alpha');`);
    await insertAssignment("rva_d1_alpha", "alpha");
    await insertAssignment("rva_d1_beta", "beta");
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
  app = await createApp();
}, 60_000);
afterAll(async () => {
  await app?.close();
  await database?.end();
  if (connected) {
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});

describe("D1 PostgreSQL review foundation", () => {
  it("creates pending COI atomically and returns only own assignment bookkeeping", async () => {
    const own = await reviews.list(scope("alpha"), {});
    expect(own.items).toHaveLength(1);
    expect(own.items[0]).toMatchObject({
      id: "rva_d1_alpha",
      state: "coi-gate",
      coi_status: "pending",
      version: 1,
    });
    expect(Object.keys(own.items[0]!).sort()).toEqual([
      "coi_status",
      "due_at",
      "id",
      "state",
      "version",
    ]);
    expect(await reviews.get(scope("alpha"), "rva_d1_beta")).toBeNull();
    expect(await reviews.get(scope("alpha"), "rva_missing_001")).toBeNull();
    expect((await reviews.list(scope("beta"), {})).items.map((row) => row.id)).toEqual([
      "rva_d1_beta",
    ]);
    expect(
      await reviews.list({ ...scope("alpha"), tenantId: parseTenantId("ten_org_alpha") }, {}),
    ).toEqual({ items: [] });
  });
  it("refuses unlocked and cross-tenant proposal/rubric bindings", async () => {
    await expect(
      insertAssignment("rva_invalid_draft", "alpha", "prv_foundation_alpha_v1"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertAssignment("rva_invalid_tenant", "alpha", "prv_foundation_alpha_v2", "ten_org_beta"),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await database.query("SELECT count(*) AS total FROM coi_declaration")).rows[0]).toEqual(
      { total: "2" },
    );
  });
  it("prevents identity drift, material unlocking and destructive evidence rollback", async () => {
    for (const sql of [
      "UPDATE review_assignment SET reviewer_user_id = 'usr_reviewer_beta' WHERE id = 'rva_d1_alpha'",
      "UPDATE review_assignment SET state = 'accepted' WHERE id = 'rva_d1_alpha'",
      "UPDATE coi_declaration SET coi_status = 'clear' WHERE assignment_id = 'rva_d1_alpha'",
      "DELETE FROM review_assignment WHERE id = 'rva_d1_alpha'",
      "UPDATE rubric_version SET criteria = '[]' WHERE id = 'rbv_d1_alpha_001'",
      "DELETE FROM rubric_version WHERE id = 'rbv_d1_alpha_001'",
    ])
      await expect(database.query(sql)).rejects.toMatchObject({ code: "55000" });
    expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot discard review or rubric evidence",
    );
    await runMigrations(database, "up");
  });
  it("keeps assignment reads durable across API recreation and audits non-enumerating denial", async () => {
    await app!.close();
    app = await createApp();
    const response = await app.inject({ url: apiRoutes.reviewAssignments, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json<ReviewAssignmentListSuccessEnvelope>().data.items[0]?.id).toBe(
      "rva_d1_alpha",
    );
    const errors = [];
    for (const id of ["rva_d1_beta", "rva_missing_001"]) {
      const denied = await app.inject({ url: `${apiRoutes.reviewAssignments}/${id}`, headers });
      expect(denied.statusCode).toBe(404);
      errors.push(denied.json<ErrorEnvelope>().error);
    }
    expect(errors[0]).toEqual(errors[1]);
    const audit = await database.query(
      "SELECT outcome FROM audit_event WHERE action = 'review-assignment:read' ORDER BY occurred_at",
    );
    expect(audit.rows.map((row) => row.outcome)).toEqual(["denied", "denied"]);
  });
  it("signs a provisioned reviewer in through the existing identity exchange", async () => {
    const response = await app!.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "d1-postgres-reviewer-exchange" },
      payload: {
        expected_version: 0,
        authorization_code: oidcRecord.authorizationCode,
        code_verifier: oidcRecord.codeVerifier,
        redirect_uri: oidcRecord.redirectUri,
        state: oidcRecord.state,
      },
    });
    expect(response.statusCode).toBe(200);
    const token = response.json<{ data: { tokens: { access_token: string } } }>().data.tokens
      .access_token;
    expect(
      (
        await app!.inject({
          url: apiRoutes.reviewAssignments,
          headers: { ...headers, authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(200);
  });
  it("does not resurrect removed reviewers when seeds rerun", async () => {
    await database.query("UPDATE membership SET state = 'removed' WHERE id = 'mem_reviewer_alpha'");
    await seedSyntheticData(database);
    expect(await reviews.list(scope("alpha"), {})).toEqual({ items: [] });
    expect(await reviews.get(scope("alpha"), "rva_d1_alpha")).toBeNull();
    expect((await app!.inject({ url: apiRoutes.reviewAssignments, headers })).statusCode).toBe(404);
    await expect(insertAssignment("rva_removed_001", "alpha")).rejects.toMatchObject({
      code: "23514",
    });
  });
});
