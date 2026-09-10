import {
  apiRoutes,
  reviewCoiApiRoutes,
  type ReviewAssignmentListSuccessEnvelope,
  type ErrorEnvelope,
  type OperationsReviewAssignmentListSuccessEnvelope,
  type OperationsReviewConflictListResource,
  type ReviewMaterialsSuccessEnvelope,
  type MutationSuccessEnvelope,
} from "@rahhal/contracts";
import {
  parseCorrelationId,
  parseMembershipId,
  parseSessionId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { createPostgresApiComposition } from "../src/postgres-composition.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresReviewAdapter } from "../src/postgres/reviews.js";
import { PostgresEvaluationAdapter } from "../src/postgres/evaluations.js";
import { PostgresDecisionAdapter } from "../src/postgres/decisions.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { commandFingerprint, RandomIdFactory } from "../src/primitives.js";
import { HmacStepUpCredentialIssuer } from "../src/session-credentials.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import {
  LocalTestOidcAuthorizationAdapter,
  LocalTestSessionCredentialIssuer,
} from "./support/local-test-identity.js";
import type { ReviewerScope, WorkspaceScope } from "../src/ports.js";

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
let evaluations: PostgresEvaluationAdapter;
let decisions: PostgresDecisionAdapter;
const stepUpSecret = "d8-decision-step-up-secret-with-more-than-thirty-two-bytes";
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
const operationsOidcRecord = {
  authorizationAttemptId: "oat_d4_operations",
  issuer: "https://oidc.synthetic.invalid",
  subject: "platform-ops",
  verifiedEmail: "platform-ops@synthetic.invalid",
  authorizationCode: "d4-operations-authorization",
  codeVerifier: "d4-operations-code-verifier-000000000000000000000000",
  redirectUri: "http://localhost:3000/auth/callback",
  state: "d4-operations-state",
};
async function createApp() {
  const composition = await createPostgresApiComposition({
    pool: database,
    oidc: new LocalTestOidcAuthorizationAdapter([oidcRecord, operationsOidcRecord], "test"),
    credentials: new LocalTestSessionCredentialIssuer(
      "d1-reviewer-test-credential-secret-00000001",
      "test",
    ),
    environment: {
      NODE_ENV: "test",
      SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
      SOLVER_OTP_DEVELOPMENT_CODE: "12345",
      SOLVER_OTP_FLOW_SECRET: "d1-reviewer-test-contact-secret-000000001",
      SESSION_CREDENTIAL_SECRET: stepUpSecret,
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
    `INSERT INTO review_assignment (
       id, tenant_id, challenge_id, proposal_id, proposal_version_id, rubric_version_id,
       reviewer_membership_id, reviewer_user_id, due_at, created_by_user_id
     ) VALUES (
       $1, $2, 'chl_synthetic_alpha', 'prp_foundation_alpha', $3,
       'rbv_d1_alpha_001', $4, $5,
       transaction_timestamp() + interval '7 days', 'usr_owner_alpha'
     )`,
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
  expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0026_d5_review_coi"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0025_d4_review_assignments"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0022_d1_review_foundation"]);
  expect((await runMigrations(database, "up")).applied).toEqual([
    "0022_d1_review_foundation",
    "0023_d2_rubric_authoring",
    "0024_d3_open_evaluation",
    "0025_d4_review_assignments",
    "0026_d5_review_coi",
    "0027_d6_review_scoring",
    "0028_d8_d9_decision_case",
  ]);
  await seedSyntheticData(database);
  reviews = new PostgresReviewAdapter(new PostgresUnitOfWork(database), new RandomIdFactory());
  evaluations = new PostgresEvaluationAdapter(
    new PostgresUnitOfWork(database),
    new RandomIdFactory(),
  );
  decisions = new PostgresDecisionAdapter(new PostgresUnitOfWork(database), new RandomIdFactory());
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
    await database.query(`
      INSERT INTO access_grant (
        id, grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
        grantee_workspace_id, resource_type, resource_id, capability, state,
        valid_from, expires_at, proposal_version_id, created_by_user_id, created_at
      ) VALUES (
        'agr_d1_org_read', 'ten_solver_alpha', 'wsp_team_alpha',
        'ten_org_alpha', 'wsp_org_alpha', 'proposal', 'prp_foundation_alpha',
        'read', 'active', transaction_timestamp(),
        transaction_timestamp() + interval '30 days', 'prv_foundation_alpha_v2',
        'usr_solver_alpha', transaction_timestamp()
      );
      UPDATE proposal
      SET state = 'eligible', lock_version = 3, updated_at = transaction_timestamp()
      WHERE id = 'prp_foundation_alpha';
      UPDATE challenge
      SET publication_state = 'closed', updated_at = transaction_timestamp()
      WHERE id = 'chl_synthetic_alpha';
      INSERT INTO challenge_evaluation (
        challenge_id, tenant_id, workspace_id, challenge_version_id,
        rubric_version_id, required_reviews, challenge_lock_version,
        opened_by_user_id, opened_at
      ) SELECT id, tenant_id, workspace_id, published_version_id,
               'rbv_d1_alpha_001', 2, lock_version + 1,
               'usr_owner_alpha', transaction_timestamp()
        FROM challenge WHERE id = 'chl_synthetic_alpha';
      INSERT INTO evaluation_proposal (
        challenge_id, proposal_id, proposal_version_id, source_state, snapshotted_at
      ) VALUES (
        'chl_synthetic_alpha', 'prp_foundation_alpha',
        'prv_foundation_alpha_v2', 'eligible', transaction_timestamp()
      );
      UPDATE challenge
      SET stage = 'evaluating', lock_version = lock_version + 1,
          updated_at = transaction_timestamp()
      WHERE id = 'chl_synthetic_alpha';
    `);
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
      "coi_declaration",
      "coi_status",
      "due_at",
      "id",
      "overdue",
      "pre_coi_packet",
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
    expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0026_d5_review_coi"]);
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot remove D4 while assignment evidence exists",
    );
    expect((await runMigrations(database, "up")).applied).toEqual([
      "0026_d5_review_coi",
      "0027_d6_review_scoring",
      "0028_d8_d9_decision_case",
    ]);
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

  it("gates exact materials on an immutable reviewer COI declaration", async () => {
    const beforeClear = await app!.inject({
      url: reviewCoiApiRoutes.reviewAssignmentMaterials.replace("{assignmentId}", "rva_d1_alpha"),
      headers,
    });
    expect(beforeClear.statusCode).toBe(404);
    expect(beforeClear.headers["cache-control"]).toBe("no-store");

    const declared = await app!.inject({
      method: "POST",
      url: reviewCoiApiRoutes.declareReviewCoi.replace("{assignmentId}", "rva_d1_alpha"),
      headers: { ...headers, "idempotency-key": "d5-clear-alpha" },
      payload: {
        expected_version: 1,
        status: "clear",
        relationship_categories: [],
        reason: null,
        attestation: true,
      },
    });
    expect(declared.statusCode).toBe(200);
    expect(declared.json<MutationSuccessEnvelope>()).toMatchObject({
      data: {
        entity_id: "rva_d1_alpha",
        idempotent: false,
        next_actions: ["review_materials"],
      },
      meta: { entity_version: 2 },
    });
    const replay = await app!.inject({
      method: "POST",
      url: reviewCoiApiRoutes.declareReviewCoi.replace("{assignmentId}", "rva_d1_alpha"),
      headers: { ...headers, "idempotency-key": "d5-clear-alpha" },
      payload: {
        expected_version: 1,
        status: "clear",
        relationship_categories: [],
        reason: null,
        attestation: true,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data.idempotent).toBe(true);

    const accepted = await reviews.get(scope("alpha"), "rva_d1_alpha");
    expect(accepted).toMatchObject({
      state: "accepted",
      coi_status: "clear",
      version: 2,
      pre_coi_packet: {
        organization_name: "Synthetic Organization Alpha",
        challenge_title: "چالش آزمایشی قطعی",
      },
      coi_declaration: {
        status: "clear",
        relationship_categories: [],
        reason: null,
      },
    });
    const materialsResponse = await app!.inject({
      url: reviewCoiApiRoutes.reviewAssignmentMaterials.replace("{assignmentId}", "rva_d1_alpha"),
      headers,
    });
    expect(materialsResponse.statusCode).toBe(200);
    const materials = materialsResponse.json<ReviewMaterialsSuccessEnvelope>().data;
    expect(materials).toMatchObject({
      assignment_id: "rva_d1_alpha",
      proposal_version_id: "prv_foundation_alpha_v2",
      rubric_version_id: "rbv_d1_alpha_001",
      organization_name: "Synthetic Organization Alpha",
      challenge_title: "چالش آزمایشی قطعی",
      proposal_content: { title: "راهکار کاهش مصرف انرژی" },
      rubric_criteria: [{ id: "quality", weight: 100, min: 0, max: 5 }],
    });
    expect(JSON.stringify(materials)).not.toContain("usr_solver_alpha");
    expect(JSON.stringify(materials)).not.toContain("wsp_team_alpha");
    for (const hidden of [
      "lead_name",
      "team_summary",
      "relevant_experience",
      "budget_amount_minor",
      "payment_model",
      "budget_rationale",
      "attachment_ids",
    ]) {
      expect(Object.keys(materials.proposal_content)).not.toContain(hidden);
    }
    expect(JSON.stringify(materials)).not.toContain("Synthetic Solver");
    expect(JSON.stringify(materials)).not.toContain("Synthetic team");

    const conflict = await reviews.declareCoi(
      "rva_d1_beta",
      {
        expected_version: 1,
        status: "conflict",
        relationship_categories: ["prior_collaboration"],
        reason: "همکاری مستقیم در ۲۴ ماه گذشته.",
        attestation: true,
      },
      {
        ...scope("beta"),
        idempotencyKey: "d5-conflict-beta",
        correlationId: parseCorrelationId("cor_d5_conflict_beta"),
      },
    );
    expect(conflict).toMatchObject({
      entityVersion: 2,
      receipt: { next_actions: ["assign_replacement"] },
    });
    expect(await reviews.materials(scope("beta"), "rva_d1_beta")).toBeNull();
    const conflicts: OperationsReviewConflictListResource = await reviews.listConflicts({
      tenantId: parseTenantId("ten_platform"),
      workspaceId: parseWorkspaceId("wsp_platform_main"),
      actorUserId: parseUserId("usr_platform_ops"),
      role: "platform:ops",
    });
    expect(conflicts.items).toEqual([
      expect.objectContaining({
        assignment_id: "rva_d1_beta",
        relationship_categories: ["prior_collaboration"],
        reason: "همکاری مستقیم در ۲۴ ماه گذشته.",
        assignment_version: 2,
      }),
    ]);
    expect(JSON.stringify(conflicts)).not.toContain("prp_foundation_alpha");
    expect(JSON.stringify(conflicts)).not.toContain("prv_foundation_alpha_v2");
    await expect(
      database.query(
        "UPDATE coi_declaration SET reason = 'tampered' WHERE assignment_id = 'rva_d1_beta'",
      ),
    ).rejects.toMatchObject({ code: "55000" });
    expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot remove D5 while COI or acceptance evidence exists",
    );
    expect((await runMigrations(database, "up")).applied).toEqual([
      "0027_d6_review_scoring",
      "0028_d8_d9_decision_case",
    ]);
    const evidence = (
      await database.query(
        `SELECT
           (SELECT count(*) FROM audit_event
            WHERE action IN ('review.assignment.accepted', 'review.coi.conflict_declared')) AS audits,
           (SELECT count(*) FROM outbox_event
            WHERE event_type IN ('review.assignment.accepted', 'review.coi.conflict_declared')) AS events,
           (SELECT bool_or(payload ? 'reason' OR payload ? 'relationship_categories')
            FROM outbox_event
            WHERE event_type IN ('review.assignment.accepted', 'review.coi.conflict_declared'))
              AS sensitive_event_payload`,
      )
    ).rows[0];
    expect(evidence).toEqual({ audits: "2", events: "2", sensitive_event_payload: false });
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

  it("lets Operations cancel, assign, and replace reviewers with atomic evidence", async () => {
    await database.query(`
      INSERT INTO app_user (
        id, display_name, primary_email, email_verified, created_at, updated_at
      ) VALUES
        ('usr_reviewer_gamma', 'Synthetic Reviewer gamma',
         'reviewer-gamma@synthetic.invalid', true, transaction_timestamp(), transaction_timestamp()),
        ('usr_reviewer_delta', 'Synthetic Reviewer delta',
         'reviewer-delta@synthetic.invalid', true, transaction_timestamp(), transaction_timestamp());
      INSERT INTO membership (
        id, tenant_id, workspace_id, workspace_kind, user_id, role, state, created_at, updated_at
      ) VALUES
        ('mem_reviewer_gamma', 'ten_platform', 'wsp_platform_main', 'platform',
         'usr_reviewer_gamma', 'platform:reviewer', 'active', transaction_timestamp(), transaction_timestamp()),
        ('mem_reviewer_delta', 'ten_platform', 'wsp_platform_main', 'platform',
         'usr_reviewer_delta', 'platform:reviewer', 'active', transaction_timestamp(), transaction_timestamp());
    `);
    const exchange = await app!.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "d4-operations-sign-in" },
      payload: {
        expected_version: 0,
        authorization_code: operationsOidcRecord.authorizationCode,
        code_verifier: operationsOidcRecord.codeVerifier,
        redirect_uri: operationsOidcRecord.redirectUri,
        state: operationsOidcRecord.state,
      },
    });
    expect(exchange.statusCode).toBe(200);
    const operationsAccessToken = exchange.json<{
      data: { tokens: { access_token: string } };
    }>().data.tokens.access_token;
    const operationsHeaders = (idempotencyKey?: string) => ({
      authorization: `Bearer ${operationsAccessToken}`,
      "x-workspace-id": "wsp_platform_main",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    });
    await expect(reviews.listOperations(scope("beta"), {})).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(
      (
        await app!.inject({
          url: apiRoutes.operationsReviewAssignments,
          headers: {
            ...operationsHeaders(),
            "x-workspace-id": "wsp_org_alpha",
          },
        })
      ).statusCode,
    ).toBe(404);
    const list = async () => {
      const response = await app!.inject({
        url: apiRoutes.operationsReviewAssignments,
        headers: operationsHeaders(),
      });
      expect(response.statusCode).toBe(200);
      return response.json<OperationsReviewAssignmentListSuccessEnvelope>().data;
    };
    const initial = await list();
    expect(initial.evaluation_proposals).toEqual([
      expect.objectContaining({
        challenge_id: "chl_synthetic_alpha",
        proposal_id: "prp_foundation_alpha",
        required_reviews: 2,
        active_assignment_count: 2,
      }),
    ]);
    expect(initial.reviewers.map((reviewer) => reviewer.membership_id)).toEqual([
      "mem_reviewer_beta",
      "mem_reviewer_delta",
      "mem_reviewer_gamma",
    ]);

    const cancelled = await app!.inject({
      method: "POST",
      url: apiRoutes.cancelReviewAssignment.replace("{assignmentId}", "rva_d1_alpha"),
      headers: operationsHeaders("d4-cancel-alpha"),
      payload: { expected_version: 2, reason: "Reviewer membership was removed." },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<MutationSuccessEnvelope>()).toMatchObject({
      data: {
        entity_id: "rva_d1_alpha",
        idempotent: false,
        next_actions: ["assign_replacement"],
      },
      meta: { entity_version: 3 },
    });
    const afterCancel = await list();
    const slotAfterCancel = afterCancel.evaluation_proposals[0]!;
    expect(slotAfterCancel.active_assignment_count).toBe(1);

    const createPayload = {
      expected_version: slotAfterCancel.evaluation_version,
      challenge_id: "chl_synthetic_alpha",
      proposal_id: "prp_foundation_alpha",
      reviewer_membership_id: "mem_reviewer_gamma",
      due_at: "2099-01-01T00:00:00.000Z",
    };
    const createdAssignment = await app!.inject({
      method: "POST",
      url: apiRoutes.operationsReviewAssignments,
      headers: operationsHeaders("d4-assign-gamma"),
      payload: createPayload,
    });
    expect(createdAssignment.statusCode).toBe(200);
    const createdReceipt = createdAssignment.json<MutationSuccessEnvelope>();
    expect(createdReceipt).toMatchObject({
      data: { idempotent: false, next_actions: ["await_coi"] },
      meta: { entity_version: 1 },
    });
    const replay = await app!.inject({
      method: "POST",
      url: apiRoutes.operationsReviewAssignments,
      headers: operationsHeaders("d4-assign-gamma"),
      payload: createPayload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...createdReceipt.data,
      idempotent: true,
    });
    const conflictingReplay = await app!.inject({
      method: "POST",
      url: apiRoutes.operationsReviewAssignments,
      headers: operationsHeaders("d4-assign-gamma"),
      payload: { ...createPayload, due_at: "2099-02-01T00:00:00.000Z" },
    });
    expect(conflictingReplay.statusCode).toBe(409);

    const full = await list();
    const fullSlot = full.evaluation_proposals[0]!;
    const overCapacity = await app!.inject({
      method: "POST",
      url: apiRoutes.operationsReviewAssignments,
      headers: operationsHeaders("d4-over-capacity"),
      payload: {
        ...createPayload,
        expected_version: fullSlot.evaluation_version,
        reviewer_membership_id: "mem_reviewer_delta",
      },
    });
    expect(overCapacity.statusCode).toBe(409);

    const failedReplacement = await app!.inject({
      method: "POST",
      url: apiRoutes.replaceReviewAssignment.replace("{assignmentId}", "rva_d1_beta"),
      headers: operationsHeaders("d4-replace-beta-missing-reviewer"),
      payload: {
        expected_version: 2,
        reason: "This update must roll back when its replacement is invalid.",
        reviewer_membership_id: "mem_reviewer_missing",
        due_at: "2099-01-02T00:00:00.000Z",
      },
    });
    expect(failedReplacement.statusCode).toBe(404);
    expect(
      (
        await database.query(
          `SELECT state, lock_version::text, cancellation_reason
           FROM review_assignment WHERE id = 'rva_d1_beta'`,
        )
      ).rows[0],
    ).toEqual({ state: "coi-gate", lock_version: "2", cancellation_reason: null });

    const replaced = await app!.inject({
      method: "POST",
      url: apiRoutes.replaceReviewAssignment.replace("{assignmentId}", "rva_d1_beta"),
      headers: operationsHeaders("d4-replace-beta"),
      payload: {
        expected_version: 2,
        reason: "Reviewer is unavailable for the evaluation window.",
        reviewer_membership_id: "mem_reviewer_delta",
        due_at: "2099-01-02T00:00:00.000Z",
      },
    });
    expect(replaced.statusCode).toBe(200);
    const replacementId = replaced.json<MutationSuccessEnvelope>().data.entity_id;
    const final = await list();
    expect(final.evaluation_proposals[0]?.active_assignment_count).toBe(2);
    expect(final.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rva_d1_alpha",
          state: "cancelled",
          cancellation_reason: "Reviewer membership was removed.",
        }),
        expect.objectContaining({
          id: replacementId,
          replaces_assignment_id: "rva_d1_beta",
          reviewer_membership_id: "mem_reviewer_delta",
          state: "coi-gate",
        }),
      ]),
    );
    expect(await reviews.get(scope("beta"), "rva_d1_beta")).toBeNull();
    expect(
      (
        await database.query(
          `SELECT
             (SELECT count(*) FROM audit_event
              WHERE action IN ('review.assignment.created', 'review.assignment.cancelled',
                               'review.assignment.replaced')) AS audits,
             (SELECT count(*) FROM outbox_event
              WHERE event_type IN ('review.assignment.created', 'review.assignment.cancelled',
                                   'review.assignment.replaced')) AS events,
             (SELECT bool_or(
                payload ? 'reason' OR payload ? 'due_at' OR payload ? 'reviewer_user_id'
              ) FROM outbox_event
              WHERE event_type IN ('review.assignment.created', 'review.assignment.cancelled',
                                   'review.assignment.replaced')) AS sensitive_event_payload,
             (SELECT count(*) FROM mutation_receipt
              WHERE entity_type = 'review_assignment') AS receipts`,
        )
      ).rows[0],
    ).toEqual({
      audits: "3",
      events: "3",
      sensitive_event_payload: false,
      receipts: "5",
    });
    await expect(
      database.query(
        "UPDATE review_assignment SET cancellation_reason = 'tampered' WHERE id = 'rva_d1_alpha'",
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("versions drafts, freezes submission, locks explicitly, and replaces invalidated evidence", async () => {
    const gammaAssignment = (
      await database.query<{ id: string }>(
        `SELECT id FROM review_assignment
         WHERE reviewer_user_id = 'usr_reviewer_gamma' AND state = 'coi-gate'`,
      )
    ).rows[0]!.id;
    const gammaContext = (key: string) => ({
      ...scope("gamma"),
      idempotencyKey: key,
      correlationId: parseCorrelationId(`cor_${key}`),
    });
    const operationsContext = (key: string, actor = "usr_platform_ops") => ({
      tenantId: parseTenantId("ten_platform"),
      workspaceId: parseWorkspaceId("wsp_platform_main"),
      actorUserId: parseUserId(actor),
      role: "platform:ops" as const,
      idempotencyKey: key,
      correlationId: parseCorrelationId(`cor_${key}`),
    });

    await reviews.declareCoi(
      gammaAssignment,
      {
        expected_version: 1,
        status: "clear",
        relationship_categories: [],
        reason: null,
        attestation: true,
      },
      gammaContext("d6_gamma_clear"),
    );
    expect(await reviews.review(scope("gamma"), gammaAssignment)).toBeNull();

    const draft = await reviews.saveDraft(
      gammaAssignment,
      { expected_version: 2, scores: [{ criterion_id: "quality", value: 4, rationale: "" }] },
      gammaContext("d6_gamma_draft"),
    );
    expect(draft).toMatchObject({
      entityVersion: 3,
      receipt: { next_actions: ["continue_review"] },
    });
    await expect(
      reviews.submit(
        gammaAssignment,
        { expected_version: 3 },
        gammaContext("d6_gamma_incomplete_submit"),
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: "VALIDATION" });

    await reviews.saveDraft(
      gammaAssignment,
      {
        expected_version: 3,
        scores: [
          {
            criterion_id: "quality",
            value: 4,
            rationale: "شواهد فنی با معیار نسخه قفل‌شده سازگار است.",
          },
        ],
      },
      gammaContext("d6_gamma_complete_draft"),
    );
    const saved = await reviews.review(scope("gamma"), gammaAssignment);
    expect(saved).toMatchObject({ state: "draft", version: 2, weighted_score_tenths: null });

    const submitted = await reviews.submit(
      gammaAssignment,
      { expected_version: 4 },
      gammaContext("d6_gamma_submit"),
    );
    expect(submitted).toMatchObject({
      entityVersion: 5,
      receipt: { next_actions: ["await_review_lock"] },
    });
    expect(await reviews.review(scope("gamma"), gammaAssignment)).toMatchObject({
      state: "submitted",
      version: 3,
      weighted_score_tenths: 800,
    });
    expect(await reviews.materials(scope("gamma"), gammaAssignment)).not.toBeNull();
    await expect(
      reviews.saveDraft(
        gammaAssignment,
        { expected_version: 5, scores: [] },
        gammaContext("d6_gamma_edit_after_submit"),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE" });

    const locked = await reviews.lock(
      gammaAssignment,
      { expected_version: 5, reason: "کامل بودن معیارها و رسید ثبت بررسی شد." },
      operationsContext("d6_gamma_lock"),
    );
    expect(locked).toMatchObject({
      entityVersion: 6,
      receipt: { next_actions: ["review_complete"] },
    });
    await expect(
      database.query(`UPDATE review_scorecard SET scores = '[]'::jsonb WHERE assignment_id = $1`, [
        gammaAssignment,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      reviews.invalidate(
        gammaAssignment,
        { expected_version: 6, reason: "self invalidation must fail" },
        operationsContext("d6_gamma_self_invalidate", "usr_reviewer_gamma"),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
    await expect(
      reviews.invalidate(
        gammaAssignment,
        { expected_version: 6, reason: "organization decision actor must fail" },
        operationsContext("d6_gamma_org_invalidate", "usr_owner_alpha"),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });

    const invalidated = await reviews.invalidate(
      gammaAssignment,
      { expected_version: 6, reason: "شواهد داوری با نسخه تخصیص‌یافته سازگار نبود." },
      operationsContext("d6_gamma_invalidate"),
    );
    expect(invalidated).toMatchObject({
      entityVersion: 7,
      receipt: { next_actions: ["assign_replacement"] },
    });
    await expect(reviews.review(scope("gamma"), gammaAssignment)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await reviews.materials(scope("gamma"), gammaAssignment)).toBeNull();

    await database.query(`
      INSERT INTO app_user (
        id, display_name, primary_email, email_verified, created_at, updated_at
      ) VALUES (
        'usr_reviewer_epsilon', 'Synthetic Reviewer epsilon',
        'reviewer-epsilon@synthetic.invalid', true,
        transaction_timestamp(), transaction_timestamp()
      );
      INSERT INTO membership (
        id, tenant_id, workspace_id, workspace_kind, user_id, role, state, created_at, updated_at
      ) VALUES (
        'mem_reviewer_epsilon', 'ten_platform', 'wsp_platform_main', 'platform',
        'usr_reviewer_epsilon', 'platform:reviewer', 'active',
        transaction_timestamp(), transaction_timestamp()
      );
    `);
    const replacement = await reviews.replace(
      gammaAssignment,
      {
        expected_version: 7,
        reason: "داوری باطل‌شده باید با داور مستقل تازه جایگزین شود.",
        reviewer_membership_id: parseMembershipId("mem_reviewer_epsilon"),
        due_at: "2099-01-03T00:00:00.000Z",
      },
      operationsContext("d6_gamma_replace"),
    );
    expect(replacement).toMatchObject({
      entityVersion: 1,
      receipt: { next_actions: ["await_coi"] },
    });
    const operations = await reviews.listOperations(operationsContext("d6_list"), {});
    expect(operations.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: gammaAssignment,
          state: "invalidated",
          review_summary: expect.objectContaining({
            weighted_score_tenths: 800,
            lock_reason: "کامل بودن معیارها و رسید ثبت بررسی شد.",
            invalidation_reason: "شواهد داوری با نسخه تخصیص‌یافته سازگار نبود.",
          }),
        }),
        expect.objectContaining({
          id: replacement.receipt.entity_id,
          replaces_assignment_id: gammaAssignment,
          reviewer_user_id: "usr_reviewer_epsilon",
          state: "coi-gate",
        }),
      ]),
    );
    expect(operations.evaluation_proposals[0]?.active_assignment_count).toBe(2);
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot remove D6 while scoring evidence exists",
    );
  });

  it("withholds every aggregate until the full roster has two valid locked reviews", async () => {
    const organizationScope: WorkspaceScope = {
      tenantId: parseTenantId("ten_org_alpha"),
      workspaceId: parseWorkspaceId("wsp_org_alpha"),
      actorUserId: parseUserId("usr_owner_alpha"),
      role: "org:owner",
    };
    const initial = await evaluations.comparison(organizationScope, "chl_synthetic_alpha");
    expect(initial).toMatchObject({
      proposal_count: 1,
      completed_proposal_count: 0,
      scores_released: false,
      proposals: [
        {
          status: "reviews_in_progress",
          active_assignment_count: 2,
          locked_review_count: 0,
          cancelled_assignment_count: 2,
          invalidated_review_count: 1,
          score_summary: null,
        },
      ],
    });

    const assignments = await database.query<{ id: string; reviewer: string }>(
      `SELECT id, regexp_replace(reviewer_user_id, '^usr_reviewer_', '') AS reviewer
       FROM review_assignment
       WHERE challenge_id = 'chl_synthetic_alpha'
         AND reviewer_user_id IN ('usr_reviewer_delta','usr_reviewer_epsilon')
         AND state = 'coi-gate'
       ORDER BY reviewer_user_id`,
    );
    expect(assignments.rows.map((row) => row.reviewer)).toEqual(["delta", "epsilon"]);
    const operationsContext = (key: string) => ({
      tenantId: parseTenantId("ten_platform"),
      workspaceId: parseWorkspaceId("wsp_platform_main"),
      actorUserId: parseUserId("usr_platform_ops"),
      role: "platform:ops" as const,
      idempotencyKey: key,
      correlationId: parseCorrelationId(`cor_${key}`),
    });
    for (const [index, assignment] of assignments.rows.entries()) {
      const reviewerContext = {
        ...scope(assignment.reviewer),
        idempotencyKey: `d7_${assignment.reviewer}_clear`,
        correlationId: parseCorrelationId(`cor_d7_${assignment.reviewer}_clear`),
      };
      await reviews.declareCoi(
        assignment.id,
        {
          expected_version: 1,
          status: "clear",
          relationship_categories: [],
          reason: null,
          attestation: true,
        },
        reviewerContext,
      );
      await reviews.saveDraft(
        assignment.id,
        {
          expected_version: 2,
          scores: [
            {
              criterion_id: "quality",
              value: index === 0 ? 3 : 5,
              rationale: "ارزیابی مستقل بر پایه نسخه معیارهای قفل‌شده ثبت شد.",
            },
          ],
        },
        {
          ...reviewerContext,
          idempotencyKey: `d7_${assignment.reviewer}_draft`,
          correlationId: parseCorrelationId(`cor_d7_${assignment.reviewer}_draft`),
        },
      );
      await reviews.submit(
        assignment.id,
        { expected_version: 3 },
        {
          ...reviewerContext,
          idempotencyKey: `d7_${assignment.reviewer}_submit`,
          correlationId: parseCorrelationId(`cor_d7_${assignment.reviewer}_submit`),
        },
      );
      await reviews.lock(
        assignment.id,
        { expected_version: 4, reason: "رسید و کامل بودن داوری بررسی شد." },
        operationsContext(`d7_${assignment.reviewer}_lock`),
      );
      const during = await evaluations.comparison(organizationScope, "chl_synthetic_alpha");
      if (index === 0) {
        expect(during).toMatchObject({
          completed_proposal_count: 0,
          scores_released: false,
          proposals: [{ locked_review_count: 1, score_summary: null }],
        });
      }
    }

    const released = await evaluations.comparison(organizationScope, "chl_synthetic_alpha");
    expect(released).toMatchObject({
      completed_proposal_count: 1,
      scores_released: true,
      proposals: [
        {
          status: "complete",
          locked_review_count: 2,
          score_summary: {
            average_weighted_score_tenths: 800,
            criteria: [{ criterion_id: "quality", average_score_tenths: 40 }],
          },
        },
      ],
    });
    expect(JSON.stringify(released)).not.toMatch(/reviewer|rationale|solver|workspace|user_id/);
    await expect(
      evaluations.comparison(
        {
          ...organizationScope,
          tenantId: parseTenantId("ten_org_beta"),
          workspaceId: parseWorkspaceId("wsp_org_beta"),
        },
        "chl_synthetic_alpha",
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("D8-D9 PostgreSQL decision and case activation", () => {
  it("atomically binds shortlist, fresh session proof, final outcomes, and one case", async () => {
    const organization = {
      tenantId: parseTenantId("ten_org_alpha"),
      workspaceId: parseWorkspaceId("wsp_org_alpha"),
      actorUserId: parseUserId("usr_owner_alpha"),
      role: "org:owner" as const,
    };
    const currentVersion = Number(
      (
        await database.query<{ lock_version: string }>(
          "SELECT lock_version::text FROM challenge WHERE id = 'chl_synthetic_alpha'",
        )
      ).rows[0]!.lock_version,
    );
    const shortlist = await decisions.saveShortlist(
      "chl_synthetic_alpha",
      {
        expected_version: currentVersion,
        challenge_version_id: "chv_synthetic_alpha_v1" as never,
        rubric_version_id: "rbv_d1_alpha_001" as never,
        proposal_versions: [
          {
            proposal_id: "prp_foundation_alpha" as never,
            proposal_version_id: "prv_foundation_alpha_v2" as never,
          },
        ],
        rationale: "امتیازهای آزادشده و شواهد اجرای پیشنهاد بررسی شد.",
      },
      {
        ...organization,
        idempotencyKey: "d8_shortlist_alpha_001",
        correlationId: parseCorrelationId("cor_d8_shortlist_alpha_001"),
      },
    );
    expect(shortlist).toMatchObject({
      entityVersion: currentVersion + 1,
      receipt: { next_actions: ["reauthenticate_decision"] },
    });
    const shortlistReplay = await decisions.saveShortlist(
      "chl_synthetic_alpha",
      {
        expected_version: currentVersion,
        challenge_version_id: "chv_synthetic_alpha_v1" as never,
        rubric_version_id: "rbv_d1_alpha_001" as never,
        proposal_versions: [
          {
            proposal_id: "prp_foundation_alpha" as never,
            proposal_version_id: "prv_foundation_alpha_v2" as never,
          },
        ],
        rationale: "امتیازهای آزادشده و شواهد اجرای پیشنهاد بررسی شد.",
      },
      {
        ...organization,
        idempotencyKey: "d8_shortlist_alpha_001",
        correlationId: parseCorrelationId("cor_d8_shortlist_alpha_001"),
      },
    );
    expect(shortlistReplay.receipt).toEqual({ ...shortlist.receipt, idempotent: true });

    const proofIssuer = new HmacStepUpCredentialIssuer(stepUpSecret);
    const sessionId = parseSessionId("ses_owner_alpha");
    const attemptId = "sup_d8_owner_alpha_001";
    const proofToken = proofIssuer.issue(attemptId, sessionId, 1);
    await database.query("BEGIN");
    try {
      await database.query(
        `INSERT INTO step_up_attempt (
           id, oidc_state_digest, session_id, session_version, user_id, tenant_id,
           workspace_id, action, target_type, target_id, return_to, created_at, expires_at
         ) VALUES (
           $1,$2,$3,1,'usr_owner_alpha','ten_org_alpha','wsp_org_alpha',
           'challenge.decision.record','challenge','chl_synthetic_alpha',
           '/app/org/challenges/record/evaluation?id=chl_synthetic_alpha',
           transaction_timestamp(),transaction_timestamp() + interval '5 minutes'
         )`,
        [attemptId, commandFingerprint("d8-owner-oidc-state"), sessionId],
      );
      await database.query(
        `UPDATE step_up_attempt
         SET status = 'verified', proof_digest = $2,
             provider_issuer = 'https://oidc.synthetic.invalid',
             provider_subject = 'owner-alpha', authenticated_at = transaction_timestamp(),
             verified_at = transaction_timestamp(), expires_at = transaction_timestamp() + interval '5 minutes'
         WHERE id = $1`,
        [attemptId, commandFingerprint(proofToken)],
      );
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }

    const decisionBody = {
      expected_version: shortlist.entityVersion,
      challenge_version_id: "chv_synthetic_alpha_v1" as never,
      rubric_version_id: "rbv_d1_alpha_001" as never,
      shortlist_version_id: (
        await database.query<{ id: string }>(
          "SELECT id FROM decision_shortlist_version WHERE challenge_id = 'chl_synthetic_alpha'",
        )
      ).rows[0]!.id as never,
      outcome: "selected" as const,
      selected_proposal_id: "prp_foundation_alpha" as never,
      selected_proposal_version_id: "prv_foundation_alpha_v2" as never,
      reason_code: "best_overall_fit" as const,
      rationale: "پیشنهاد منتخب بهترین تناسب کلی با معیارهای مصوب دارد.",
      proposal_feedback: [
        {
          proposal_id: "prp_foundation_alpha" as never,
          proposal_version_id: "prv_foundation_alpha_v2" as never,
          feedback: "راهکار فنی روشن است و برای ادامه وارد پرونده همکاری شد.",
        },
      ],
    };
    const context = {
      ...organization,
      sessionId,
      sessionVersion: 1,
      stepUpToken: proofToken,
      idempotencyKey: "d8_final_decision_alpha_001",
      correlationId: parseCorrelationId("cor_d8_final_decision_alpha_001"),
    };
    await expect(
      decisions.record("chl_synthetic_alpha", decisionBody, {
        ...context,
        sessionVersion: 2,
        idempotencyKey: "d8_wrong_session_version_001",
        correlationId: parseCorrelationId("cor_d8_wrong_session_version_001"),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });

    const recorded = await decisions.record("chl_synthetic_alpha", decisionBody, context);
    expect(recorded).toMatchObject({
      entityVersion: shortlist.entityVersion + 1,
      receipt: { idempotent: false, next_actions: ["open_case"] },
    });
    const replay = await decisions.record("chl_synthetic_alpha", decisionBody, context);
    expect(replay.receipt).toEqual({ ...recorded.receipt, idempotent: true });

    const projection = await decisions.get(organization, "chl_synthetic_alpha");
    expect(projection).toMatchObject({
      stage: "decided",
      decision: {
        outcome: "selected",
        selected_proposal_id: "prp_foundation_alpha",
        selected_proposal_version_id: "prv_foundation_alpha_v2",
      },
      proposals: [
        {
          proposal_id: "prp_foundation_alpha",
          outcome: "selected",
          feedback: "راهکار فنی روشن است و برای ادامه وارد پرونده همکاری شد.",
        },
      ],
      case: {
        proposal_id: "prp_foundation_alpha",
        proposal_version_id: "prv_foundation_alpha_v2",
      },
    });
    const solver = {
      tenantId: parseTenantId("ten_solver_alpha"),
      workspaceId: parseWorkspaceId("wsp_team_alpha"),
      actorUserId: parseUserId("usr_solver_alpha"),
      role: "team:owner" as const,
    };
    const ownOutcome = await decisions.proposalOutcome(solver, "prp_foundation_alpha");
    expect(ownOutcome).toMatchObject({
      status: "selected",
      feedback: "راهکار فنی روشن است و برای ادامه وارد پرونده همکاری شد.",
      case_id: projection!.case!.id,
    });
    expect(JSON.stringify(ownOutcome)).not.toContain("پیشنهاد منتخب بهترین تناسب کلی");
    expect(await decisions.case(solver, projection!.case!.id)).toEqual(projection!.case);
    expect(
      await decisions.case(
        {
          ...solver,
          tenantId: parseTenantId("ten_org_beta"),
          workspaceId: parseWorkspaceId("wsp_org_beta"),
          role: "org:owner",
        },
        projection!.case!.id,
      ),
    ).toBeNull();

    const evidence = (
      await database.query(
        `SELECT
           (SELECT stage FROM challenge WHERE id = 'chl_synthetic_alpha') AS stage,
           (SELECT state FROM proposal WHERE id = 'prp_foundation_alpha') AS proposal_state,
           (SELECT status FROM step_up_attempt WHERE id = $1) AS proof_state,
           (SELECT count(*) FROM decision_review_evidence) AS review_evidence,
           (SELECT count(*) FROM decision_proposal_outcome) AS proposal_outcomes,
           (SELECT count(*) FROM case_record) AS cases,
           (SELECT count(*) FROM access_grant
             WHERE resource_type = 'case' AND capability = 'collaborate' AND state = 'active') AS grants,
           (SELECT bool_or(payload ? 'rationale' OR payload ? 'feedback') FROM outbox_event
             WHERE event_type IN ('challenge.decision.recorded','proposal.selected','case.created'))
             AS sensitive_event_payload`,
        [attemptId],
      )
    ).rows[0];
    expect(evidence).toEqual({
      stage: "decided",
      proposal_state: "selected",
      proof_state: "consumed",
      review_evidence: "2",
      proposal_outcomes: "1",
      cases: "1",
      grants: "1",
      sensitive_event_payload: false,
    });
    await expect(
      database.query(
        `UPDATE review_scorecard SET invalidated_by_user_id = 'usr_platform_ops',
          invalidation_reason = 'late mutation', invalidated_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
         WHERE assignment_id = (
           SELECT assignment_id FROM decision_review_evidence LIMIT 1
         )`,
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot remove D8-D9 while step-up, shortlist, decision, or case evidence exists",
    );
  });
});
