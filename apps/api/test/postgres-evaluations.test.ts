import {
  apiRoutes,
  type ChallengeEvaluationSuccessEnvelope,
  type ErrorEnvelope,
  type MutationSuccessEnvelope,
} from "@rahhal/contracts";
import {
  parseChallengeId,
  parseCorrelationId,
  parseMembershipId,
  parsePrefixedId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../src/app.js";
import { createPostgresApiComposition } from "../src/postgres-composition.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import type { ProposalCommandContext, WorkspaceCommandContext } from "../src/ports.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import {
  LocalTestOidcAuthorizationAdapter,
  LocalTestSessionCredentialIssuer,
} from "./support/local-test-identity.js";

const adminUrl = testDatabaseAdminUrl();
const databaseName = `rahhal_d3_evaluation_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const challengeId = parseChallengeId("chl_synthetic_alpha");
const challengeVersionId = parsePrefixedId("chv_synthetic_alpha_v1", "chv");
const ownerHeaders = {
  authorization: "Bearer local-a1b-access-owner-alpha",
  "x-workspace-id": "wsp_org_alpha",
};

let admin: Client;
let database: Pool;
let app: ReturnType<typeof buildApi>;
let proposals: PostgresProposalAdapter;
let adminConnected = false;
let databaseCreated = false;

const evaluationPath = () => apiRoutes.challengeEvaluation.replace("{challengeId}", challengeId);
const openPath = () => apiRoutes.openChallengeEvaluation.replace("{challengeId}", challengeId);
const commandHeaders = (key: string) => ({ ...ownerHeaders, "idempotency-key": key });

function individualCommand(key: string): ProposalCommandContext {
  return {
    tenantId: parseTenantId("ten_solver_alpha"),
    workspaceId: parseWorkspaceId("wsp_individual_alpha"),
    role: "individual",
    membershipId: parseMembershipId("mem_individual_alpha"),
    actorUserId: parseUserId("usr_solver_alpha"),
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_${key}`),
  };
}

function organizationCommand(key: string): WorkspaceCommandContext {
  return {
    tenantId: parseTenantId("ten_org_alpha"),
    workspaceId: parseWorkspaceId("wsp_org_alpha"),
    role: "org:owner",
    actorUserId: parseUserId("usr_owner_alpha"),
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_${key}`),
  };
}

const readyProposalDraft = {
  title: "Authoritative evaluation proposal",
  problem_statement: "The current process lacks reliable interval measurements and evidence.",
  value_proposition: "The proposal provides measurable corrective recommendations for the pilot.",
  prototype_weeks: "6",
  technical_approach:
    "A deterministic pipeline aggregates samples and exposes reviewed indicators.",
  success_metrics: "Ten percent measured consumption reduction",
  ip_status: "owned",
  duration_weeks: "12",
  budget_amount_minor: 125_000_000,
  budget_currency: "IRR" as const,
  nda_accepted: false,
  conflict_declared: true,
  ip_accepted: true,
  accuracy_confirmed: true,
};

async function createApp(options: { readonly beforeCommit?: () => void } = {}) {
  const composition = await createPostgresApiComposition({
    pool: database,
    beforeCommit: options.beforeCommit,
    oidc: new LocalTestOidcAuthorizationAdapter([], "test"),
    credentials: new LocalTestSessionCredentialIssuer(
      "d3-evaluation-test-credential-secret-000001",
      "test",
    ),
    environment: {
      NODE_ENV: "test",
      SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
      SOLVER_OTP_DEVELOPMENT_CODE: "12345",
      SOLVER_OTP_FLOW_SECRET: "d3-evaluation-test-contact-secret-000001",
      SESSION_CREDENTIAL_SECRET: "d3-evaluation-test-session-secret-0000001",
    },
  });
  return buildApi(composition.ports);
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  adminConnected = true;
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  database = new Pool({ connectionString: databaseUrl.toString(), max: 6 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_d3_technical', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'technical', 'approved', 'Synthetic approval', 'usr_approver_alpha',
       'org:approver_technical', transaction_timestamp()),
      ('cap_d3_legal', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'legal', 'approved', 'Synthetic approval', 'usr_platform_legal',
       'platform:legal', transaction_timestamp()),
      ('cap_d3_finance', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'finance', 'approved', 'Synthetic approval', 'usr_platform_finance',
       'platform:finance', transaction_timestamp()),
      ('cap_d3_quality', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'quality', 'approved', 'Synthetic approval', 'usr_platform_ops',
       'platform:ops', transaction_timestamp());
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_d3_alpha_v1', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
      ARRAY['individual']::text[], false, false, false,
      '2099-01-01T00:00:00Z', 'open', transaction_timestamp()
    ) ON CONFLICT (challenge_version_id) DO NOTHING;
    UPDATE challenge
    SET stage = 'published', published_version_id = '${challengeVersionId}',
        publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = transaction_timestamp()
    WHERE id = '${challengeId}';
    INSERT INTO challenge_public_projection (
      challenge_id, tenant_id, challenge_version_id, title, category, location,
      public_summary, output_type, sourcing_model, applicant_scope,
      allowed_applicant_types, work_mode, proposal_deadline, preferred_start_date,
      budget_status, budget_amount_minor, budget_currency, visibility,
      verification_required, nda_required, document_gate_required, ip_terms,
      state, published_at
    ) VALUES (
      '${challengeId}', 'ten_org_alpha', '${challengeVersionId}',
      'Synthetic D3 challenge', 'technology', 'Tehran',
      'Synthetic public projection for evaluation tests.',
      'pilot', 'public', 'person', ARRAY['individual']::text[],
      'hybrid', '2099-01-01T00:00:00Z', NULL,
      'undecided', NULL, 'IRR', 'public', false, false, false,
      'solver_license', 'open', transaction_timestamp()
    );
    INSERT INTO rubric (id, tenant_id, challenge_id, challenge_version_id)
    VALUES ('rub_d3_alpha', 'ten_org_alpha', '${challengeId}', '${challengeVersionId}');
    INSERT INTO rubric_version (
      id, rubric_id, version_number, criteria, created_by_user_id, created_at
    ) VALUES (
      'rbv_d3_alpha_v1', 'rub_d3_alpha', 1,
      '[{"id":"feasibility","label":"Feasibility","weight":60,"min":0,"max":5},
        {"id":"impact","label":"Impact","weight":40,"min":0,"max":5}]'::jsonb,
      'usr_owner_alpha', transaction_timestamp()
    );
  `);
  const unitOfWork = new PostgresUnitOfWork(database);
  const ids = new MonotonicIdFactory();
  const clock = { now: () => new Date() };
  const teams = new PostgresTeamAdapter(unitOfWork, clock, ids);
  proposals = new PostgresProposalAdapter(unitOfWork, teams, clock, ids);
  app = await createApp();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await database?.end();
  if (adminConnected) {
    if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});

describe("D3 PostgreSQL evaluation opening", () => {
  it("freezes the complete exact-version roster with atomic evidence and replay", async () => {
    const initial = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(initial.statusCode).toBe(200);
    expect(initial.json<ChallengeEvaluationSuccessEnvelope>().data).toMatchObject({
      ready: false,
      required_reviews: 2,
      blockers: ["submission_window_open"],
      roster: [],
    });

    const created = await proposals.create(
      { expected_version: 0, challenge_id: challengeId, draft: readyProposalDraft },
      individualCommand("d3-proposal-create"),
    );
    await proposals.submit(
      created.receipt.entity_id,
      { expected_version: 1, accepted_challenge_version_id: challengeVersionId },
      individualCommand("d3-proposal-submit"),
    );
    const unresolved = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(unresolved.json<ChallengeEvaluationSuccessEnvelope>().data).toMatchObject({
      ready: false,
      unresolved_proposal_count: 1,
      blockers: ["submission_window_open", "proposal_workflow_unresolved"],
    });
    await database.query(
      "UPDATE access_grant SET state = 'expired' WHERE resource_id = $1 AND capability = 'read'",
      [created.receipt.entity_id],
    );
    const unavailable = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(unavailable.json<ChallengeEvaluationSuccessEnvelope>().data).toMatchObject({
      ready: false,
      qualifying_proposal_count: 0,
      unresolved_proposal_count: 0,
      blockers: ["submission_window_open", "proposal_roster_unavailable"],
      roster: [],
    });
    await database.query(
      `INSERT INTO access_grant (
         id, grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
         grantee_workspace_id, resource_type, resource_id, capability, state,
         valid_from, expires_at, proposal_version_id, created_by_user_id, created_at
       )
       SELECT 'agr_d3_replacement', p.tenant_id, p.owner_workspace_id,
              c.tenant_id, c.workspace_id, 'proposal', p.id, 'read', 'active',
              p.submitted_at, p.submitted_at + interval '30 days', p.current_version_id,
              p.created_by_user_id, p.submitted_at
       FROM proposal p JOIN challenge c ON c.id = p.challenge_id
       WHERE p.id = $1`,
      [created.receipt.entity_id],
    );
    await proposals.startEligibilityReview(
      created.receipt.entity_id,
      { expected_version: 2 },
      organizationCommand("d3-proposal-review"),
    );
    await proposals.decideEligibility(
      created.receipt.entity_id,
      { expected_version: 3, decision: "eligible", reason: "Published conditions are satisfied." },
      organizationCommand("d3-proposal-eligible"),
    );
    await database.query(`
      BEGIN;
      UPDATE challenge SET publication_state = 'closed', updated_at = transaction_timestamp()
      WHERE id = '${challengeId}';
      UPDATE challenge_public_projection SET state = 'closed' WHERE challenge_id = '${challengeId}';
      COMMIT;
    `);

    const ready = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(ready.statusCode).toBe(200);
    const readiness = ready.json<ChallengeEvaluationSuccessEnvelope>();
    expect(readiness.data).toMatchObject({
      ready: true,
      qualifying_proposal_count: 1,
      unresolved_proposal_count: 0,
      blockers: [],
      rubric_version_id: "rbv_d3_alpha_v1",
      roster: [
        {
          proposal_id: created.receipt.entity_id,
          proposal_version_id: expect.stringMatching(/^prv_/),
          source_state: "eligible",
          tracking_code: expect.stringMatching(/^PRP-/),
        },
      ],
    });

    const attempts = ["left", "right"].map((suffix) =>
      app.inject({
        method: "POST",
        url: openPath(),
        headers: commandHeaders(`d3-open-${suffix}`),
        payload: { expected_version: readiness.data.version },
      }),
    );
    const responses = await Promise.all(attempts);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const winnerIndex = responses.findIndex((response) => response.statusCode === 200);
    const winner = responses[winnerIndex]!;
    const winnerKey = winnerIndex === 0 ? "d3-open-left" : "d3-open-right";
    const receipt = winner.json<MutationSuccessEnvelope>();
    expect(receipt).toMatchObject({
      ok: true,
      data: { idempotent: false, next_actions: ["assign_reviewers"] },
      meta: { entity_version: readiness.data.version + 1 },
    });
    const replay = await app.inject({
      method: "POST",
      url: openPath(),
      headers: commandHeaders(winnerKey),
      payload: { expected_version: readiness.data.version },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...receipt.data,
      idempotent: true,
    });

    const stored = await database.query(
      `
      SELECT challenge.stage, challenge.publication_state,
        (SELECT count(*) FROM challenge_evaluation WHERE challenge_id = challenge.id) AS snapshots,
        (SELECT count(*) FROM evaluation_proposal WHERE challenge_id = challenge.id) AS roster,
        (SELECT count(*) FROM audit_event
          WHERE target_id = challenge.id AND action = 'challenge.evaluation.started') AS audits,
        (SELECT count(*) FROM outbox_event
          WHERE aggregate_id = challenge.id AND event_type = 'challenge.evaluation.started') AS events
      FROM challenge WHERE id = $1
    `,
      [challengeId],
    );
    expect(stored.rows[0]).toEqual({
      stage: "evaluating",
      publication_state: "closed",
      snapshots: "1",
      roster: "1",
      audits: "1",
      events: "1",
    });

    await database.query(
      "UPDATE access_grant SET state = 'expired' WHERE resource_id = $1 AND capability = 'read'",
      [created.receipt.entity_id],
    );
    const frozen = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(frozen.json<ChallengeEvaluationSuccessEnvelope>().data).toMatchObject({
      ready: true,
      stage: "evaluating",
      qualifying_proposal_count: 1,
      roster: [{ proposal_id: created.receipt.entity_id }],
    });
    await expect(
      database.query("UPDATE proposal SET tracking_code = 'PRP-2099-999' WHERE id = $1", [
        created.receipt.entity_id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query("DELETE FROM challenge_evaluation WHERE challenge_id = $1", [challengeId]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query(`
        INSERT INTO rubric_version (
          id, rubric_id, version_number, criteria, created_by_user_id
        ) SELECT 'rbv_d3_forbidden_v2', rubric_id, 2, criteria, 'usr_owner_alpha'
          FROM rubric_version WHERE id = 'rbv_d3_alpha_v1'
      `),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("allows a frozen empty roster and directs the organization to a reasoned no-award", async () => {
    const emptyChallengeId = "chl_d3_empty_alpha";
    const emptyVersionId = "chv_d3_empty_alpha_v1";
    await database.query(`
      BEGIN;
      INSERT INTO challenge (
        id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
        current_version_id, published_version_id, lock_version,
        created_by_user_id, created_at, updated_at
      ) VALUES (
        '${emptyChallengeId}', 'ten_org_alpha', 'organization', 'wsp_org_alpha', 'org', 'draft',
        '${emptyVersionId}', NULL, 1, 'usr_owner_alpha',
        transaction_timestamp(), transaction_timestamp()
      );
      INSERT INTO challenge_version (
        id, challenge_id, version_number, content, created_by_user_id, created_at,
        locked_at, lock_reason
      ) SELECT '${emptyVersionId}', '${emptyChallengeId}', 1, content,
               'usr_owner_alpha', transaction_timestamp(), transaction_timestamp(), 'published'
        FROM challenge_version WHERE id = '${challengeVersionId}';
      INSERT INTO challenge_approval (
        id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
        decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
      ) VALUES
        ('cap_d3_empty_technical', 'ten_org_alpha', 'wsp_org_alpha', '${emptyChallengeId}', '${emptyVersionId}',
         'technical', 'approved', 'Synthetic approval', 'usr_approver_alpha',
         'org:approver_technical', transaction_timestamp()),
        ('cap_d3_empty_legal', 'ten_org_alpha', 'wsp_org_alpha', '${emptyChallengeId}', '${emptyVersionId}',
         'legal', 'approved', 'Synthetic approval', 'usr_platform_legal',
         'platform:legal', transaction_timestamp()),
        ('cap_d3_empty_finance', 'ten_org_alpha', 'wsp_org_alpha', '${emptyChallengeId}', '${emptyVersionId}',
         'finance', 'approved', 'Synthetic approval', 'usr_platform_finance',
         'platform:finance', transaction_timestamp()),
        ('cap_d3_empty_quality', 'ten_org_alpha', 'wsp_org_alpha', '${emptyChallengeId}', '${emptyVersionId}',
         'quality', 'approved', 'Synthetic approval', 'usr_platform_ops',
         'platform:ops', transaction_timestamp());
      INSERT INTO eligibility_rule (
        id, tenant_id, workspace_id, challenge_id, challenge_version_id,
        allowed_applicant_types, verification_required, nda_required,
        document_gate_required, proposal_deadline, state, created_at
      ) VALUES (
        'elr_d3_empty_v1', 'ten_org_alpha', 'wsp_org_alpha', '${emptyChallengeId}', '${emptyVersionId}',
        ARRAY['individual']::text[], false, false, false,
        '2099-01-01T00:00:00Z', 'open', transaction_timestamp()
      );
      UPDATE challenge
      SET stage = 'published', published_version_id = '${emptyVersionId}',
          publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
          updated_at = transaction_timestamp()
      WHERE id = '${emptyChallengeId}';
      INSERT INTO challenge_public_projection (
        challenge_id, tenant_id, challenge_version_id, title, category, location,
        public_summary, output_type, sourcing_model, applicant_scope,
        allowed_applicant_types, work_mode, proposal_deadline, preferred_start_date,
        budget_status, budget_amount_minor, budget_currency, visibility,
        verification_required, nda_required, document_gate_required, ip_terms,
        state, published_at
      ) VALUES (
        '${emptyChallengeId}', 'ten_org_alpha', '${emptyVersionId}',
        'Synthetic empty D3 challenge', 'technology', 'Tehran',
        'Synthetic public projection for an empty evaluation roster.',
        'pilot', 'public', 'person', ARRAY['individual']::text[],
        'hybrid', '2099-01-01T00:00:00Z', NULL,
        'undecided', NULL, 'IRR', 'public', false, false, false,
        'solver_license', 'open', transaction_timestamp()
      );
      INSERT INTO rubric (id, tenant_id, challenge_id, challenge_version_id)
      VALUES ('rub_d3_empty', 'ten_org_alpha', '${emptyChallengeId}', '${emptyVersionId}');
      INSERT INTO rubric_version (
        id, rubric_id, version_number, criteria, created_by_user_id, created_at
      ) VALUES (
        'rbv_d3_empty_v1', 'rub_d3_empty', 1,
        '[{"id":"fit","label":"Fit","weight":100,"min":0,"max":5}]'::jsonb,
        'usr_owner_alpha', transaction_timestamp()
      );
      UPDATE challenge SET publication_state = 'closed' WHERE id = '${emptyChallengeId}';
      UPDATE challenge_public_projection SET state = 'closed' WHERE challenge_id = '${emptyChallengeId}';
      COMMIT;
    `);
    const path = apiRoutes.challengeEvaluation.replace("{challengeId}", emptyChallengeId);
    const ready = await app.inject({ url: path, headers: ownerHeaders });
    const readiness = ready.json<ChallengeEvaluationSuccessEnvelope>();
    expect(readiness.data).toMatchObject({ ready: true, qualifying_proposal_count: 0, roster: [] });
    const opened = await app.inject({
      method: "POST",
      url: apiRoutes.openChallengeEvaluation.replace("{challengeId}", emptyChallengeId),
      headers: commandHeaders("d3-open-empty"),
      payload: { expected_version: readiness.data.version },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json<MutationSuccessEnvelope>().data.next_actions).toEqual(["record_no_award"]);
  });

  it("scopes before lookup and revalidates organization authority before replay", async () => {
    const foreign = await app.inject({
      url: apiRoutes.challengeEvaluation.replace("{challengeId}", "chl_foreign_beta_001"),
      headers: ownerHeaders,
    });
    expect(foreign.statusCode).toBe(404);
    await database.query(
      "UPDATE membership SET role = 'org:approver_technical' WHERE id = 'mem_owner_alpha'",
    );
    const denied = await app.inject({ url: evaluationPath(), headers: ownerHeaders });
    expect(denied.statusCode).toBe(403);
    await database.query("UPDATE membership SET role = 'org:owner' WHERE id = 'mem_owner_alpha'");
    await database.query("UPDATE membership SET state = 'removed' WHERE id = 'mem_owner_alpha'");
    const removed = await app.inject({
      method: "POST",
      url: openPath(),
      headers: commandHeaders("d3-open-left"),
      payload: { expected_version: 1 },
    });
    expect(removed.statusCode).toBe(404);
    expect(removed.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    await database.query("UPDATE membership SET state = 'active' WHERE id = 'mem_owner_alpha'");
  });
});
