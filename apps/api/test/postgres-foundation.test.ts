import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();

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
  expect(firstUp.applied).toEqual([
    "0001_a1a_foundation",
    "0002_a1b_identity_transaction",
    "0003_a1c_authoritative_challenge",
    "0004_a2_oidc_authorization",
    "0005_b1_authoritative_challenge_lifecycle",
    "0006_b2_challenge_approval_gates",
    "0007_b3_versioned_eligibility_rules",
    "0008_b4_challenge_publication",
    "0009_b6_publication_lifecycle",
    "0010_phase2_closure",
    "0012_phase2_review_closure",
    "0013_c_proposal_foundation",
    "0014_c1_solver_profile_eligibility",
    "0015_c2_team_lifecycle",
    "0016_c4_proposal_submission",
    "0017_c5_proposal_clarification_revision",
    "0018_c6_opportunities_direct_offers",
    "0019_c7_solver_activation",
    "0020_c8_notifications",
    "0021_c6_offer_deadline_single_clock",
    "0022_d1_review_foundation",
    "0023_d2_rubric_authoring",
    "0024_d3_open_evaluation",
    "0025_d4_review_assignments",
    "0026_d5_review_coi",
    "0027_d6_review_scoring",
    "0028_d8_d9_decision_case",
    "0029_d8_d9_review_remediation",
  ]);

  // Newest first.
  expect((await runMigrations(database, "down")).applied).toEqual([
    "0029_d8_d9_review_remediation",
  ]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0026_d5_review_coi"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0025_d4_review_assignments"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
  expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
  const reviewFoundationDown = await runMigrations(database, "down");
  expect(reviewFoundationDown.applied).toEqual(["0022_d1_review_foundation"]);
  const offerClockDown = await runMigrations(database, "down");
  expect(offerClockDown.applied).toEqual(["0021_c6_offer_deadline_single_clock"]);
  const c8Down = await runMigrations(database, "down");
  expect(c8Down.applied).toEqual(["0020_c8_notifications"]);
  const c7Down = await runMigrations(database, "down");
  expect(c7Down.applied).toEqual(["0019_c7_solver_activation"]);
  const c6Down = await runMigrations(database, "down");
  expect(c6Down.applied).toEqual(["0018_c6_opportunities_direct_offers"]);
  const c5Down = await runMigrations(database, "down");
  expect(c5Down.applied).toEqual(["0017_c5_proposal_clarification_revision"]);
  const c4Down = await runMigrations(database, "down");
  expect(c4Down.applied).toEqual(["0016_c4_proposal_submission"]);
  const c2Down = await runMigrations(database, "down");
  expect(c2Down.applied).toEqual(["0015_c2_team_lifecycle"]);
  const c1Down = await runMigrations(database, "down");
  expect(c1Down.applied).toEqual(["0014_c1_solver_profile_eligibility"]);
  const proposalDown = await runMigrations(database, "down");
  expect(proposalDown.applied).toEqual(["0013_c_proposal_foundation"]);
  const reviewClosureDown = await runMigrations(database, "down");
  expect(reviewClosureDown.applied).toEqual(["0012_phase2_review_closure"]);
  const phase2Down = await runMigrations(database, "down");
  expect(phase2Down.applied).toEqual(["0010_phase2_closure"]);
  const b6Down = await runMigrations(database, "down");
  expect(b6Down.applied).toEqual(["0009_b6_publication_lifecycle"]);
  const b4Down = await runMigrations(database, "down");
  expect(b4Down.applied).toEqual(["0008_b4_challenge_publication"]);
  const b3Down = await runMigrations(database, "down");
  expect(b3Down.applied).toEqual(["0007_b3_versioned_eligibility_rules"]);
  const b2Down = await runMigrations(database, "down");
  expect(b2Down.applied).toEqual(["0006_b2_challenge_approval_gates"]);
  const b1Down = await runMigrations(database, "down");
  expect(b1Down.applied).toEqual(["0005_b1_authoritative_challenge_lifecycle"]);
  const a2Down = await runMigrations(database, "down");
  expect(a2Down.applied).toEqual(["0004_a2_oidc_authorization"]);
  const a1cDown = await runMigrations(database, "down");
  expect(a1cDown.applied).toEqual(["0003_a1c_authoritative_challenge"]);
  const a1bDown = await runMigrations(database, "down");
  expect(a1bDown.applied).toEqual(["0002_a1b_identity_transaction"]);
  const foundationStillPresent = await database.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.tenant')::text AS table_name",
  );
  expect(foundationStillPresent.rows[0]?.table_name).toBe("tenant");

  const a1aDown = await runMigrations(database, "down");
  expect(a1aDown.applied).toEqual(["0001_a1a_foundation"]);
  const removed = await database.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.tenant')::text AS table_name",
  );
  expect(removed.rows[0]?.table_name).toBeNull();

  const secondDown = await runMigrations(database, "down");
  expect(secondDown.applied).toEqual([]);
  const secondUp = await runMigrations(database, "up");
  expect(secondUp.applied).toEqual([
    "0001_a1a_foundation",
    "0002_a1b_identity_transaction",
    "0003_a1c_authoritative_challenge",
    "0004_a2_oidc_authorization",
    "0005_b1_authoritative_challenge_lifecycle",
    "0006_b2_challenge_approval_gates",
    "0007_b3_versioned_eligibility_rules",
    "0008_b4_challenge_publication",
    "0009_b6_publication_lifecycle",
    "0010_phase2_closure",
    "0012_phase2_review_closure",
    "0013_c_proposal_foundation",
    "0014_c1_solver_profile_eligibility",
    "0015_c2_team_lifecycle",
    "0016_c4_proposal_submission",
    "0017_c5_proposal_clarification_revision",
    "0018_c6_opportunities_direct_offers",
    "0019_c7_solver_activation",
    "0020_c8_notifications",
    "0021_c6_offer_deadline_single_clock",
    "0022_d1_review_foundation",
    "0023_d2_rubric_authoring",
    "0024_d3_open_evaluation",
    "0025_d4_review_assignments",
    "0026_d5_review_coi",
    "0027_d6_review_scoring",
    "0028_d8_d9_decision_case",
    "0029_d8_d9_review_remediation",
  ]);
  const noOpUp = await runMigrations(database, "up");
  expect(noOpUp.applied).toEqual([]);

  await seedSyntheticData(database);
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

describe("A1a PostgreSQL foundation", () => {
  it("migrates every required table and records the checksum", async () => {
    // One list in the query's own `ORDER BY table_name` order, migration
    // ledger included -- a new table has to be named here, not absorbed by an
    // index into a spliced array.
    const expectedTables = [
      "access_grant",
      "app_session",
      "app_user",
      "audit_event",
      "case_record",
      "challenge",
      "challenge_approval",
      "challenge_evaluation",
      "challenge_public_projection",
      "challenge_version",
      "coi_declaration",
      "contact_verification_consumption",
      "decision",
      "decision_proposal_outcome",
      "decision_review_evidence",
      "decision_shortlist_version",
      "direct_offer",
      "eligibility_gate_acceptance",
      "eligibility_rule",
      "evaluation_proposal",
      "idempotency_key",
      "identity_link",
      "membership",
      "mutation_receipt",
      "notification",
      "offer_response",
      "oidc_authorization_attempt",
      "outbox_delivery",
      "outbox_event",
      "proposal",
      "proposal_clarification",
      "proposal_revision_request",
      "proposal_version",
      "review_assignment",
      "review_assignment_packet",
      "review_scorecard",
      "rubric",
      "rubric_version",
      "saved_opportunity",
      "schema_migration",
      "solver_activation",
      "solver_workspace_profile",
      "step_up_attempt",
      "team_invitation",
      "team_membership_request",
      "team_workspace",
      "tenant",
      "verification_record",
      "workspace",
    ];
    const tables = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual(expectedTables);

    const ledger = await database.query<{ id: string; checksum: string }>(
      "SELECT id, checksum FROM schema_migration",
    );
    expect(ledger.rows).toEqual([
      { id: "0001_a1a_foundation", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      {
        id: "0002_a1b_identity_transaction",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0003_a1c_authoritative_challenge",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0004_a2_oidc_authorization",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0005_b1_authoritative_challenge_lifecycle",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0006_b2_challenge_approval_gates",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0007_b3_versioned_eligibility_rules",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0008_b4_challenge_publication",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0009_b6_publication_lifecycle",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0010_phase2_closure",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0012_phase2_review_closure",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0013_c_proposal_foundation",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0014_c1_solver_profile_eligibility",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0015_c2_team_lifecycle",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0016_c4_proposal_submission",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0017_c5_proposal_clarification_revision",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0018_c6_opportunities_direct_offers",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0019_c7_solver_activation",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0020_c8_notifications",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        id: "0021_c6_offer_deadline_single_clock",
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      { id: "0022_d1_review_foundation", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0023_d2_rubric_authoring", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0024_d3_open_evaluation", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0025_d4_review_assignments", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0026_d5_review_coi", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0027_d6_review_scoring", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0028_d8_d9_decision_case", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0029_d8_d9_review_remediation", checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it("applies deterministic, rerunnable synthetic seeds", async () => {
    const counts = await database.query<{
      tenants: string;
      users: string;
      workspaces: string;
      challenges: string;
      challenge_versions: string;
      eligibility_rules: string;
      audit_events: string;
      outbox_events: string;
      mutation_receipts: string;
    }>(`
      SELECT
        (SELECT count(*) FROM tenant) AS tenants,
        (SELECT count(*) FROM app_user) AS users,
        (SELECT count(*) FROM workspace) AS workspaces,
        (SELECT count(*) FROM challenge) AS challenges,
        (SELECT count(*) FROM challenge_version) AS challenge_versions,
        (SELECT count(*) FROM eligibility_rule) AS eligibility_rules,
        (SELECT count(*) FROM audit_event) AS audit_events,
        (SELECT count(*) FROM outbox_event) AS outbox_events,
        (SELECT count(*) FROM mutation_receipt) AS mutation_receipts
    `);
    expect(counts.rows[0]).toEqual({
      tenants: "4",
      // 3 baseline + the 4 B7 governance identities (distinct approvers,
      // publisher, platform finance/legal) the Phase-2 exit gate requires.
      // C2 adds five durable team-role/candidate identities for lifecycle and
      // exhaustive server-policy fixtures.
      // D1 adds two independently scoped local reviewers.
      users: "14",
      workspaces: "5",
      challenges: "1",
      challenge_versions: "1",
      eligibility_rules: "0",
      audit_events: "1",
      outbox_events: "1",
      mutation_receipts: "1",
    });
    const solverOtpIdentity = await database.query<{
      user_id: string;
      individual_workspace_id: string;
      individual_membership_id: string;
    }>(
      `SELECT link.user_id, activation.individual_workspace_id, activation.individual_membership_id
       FROM identity_link link
       JOIN solver_activation activation ON activation.user_id=link.user_id
         AND activation.provider_issuer=link.issuer AND activation.provider_subject=link.subject
       WHERE link.issuer='urn:rahhal:identity:development-otp'
         AND link.subject='contact:email:c1a7de9082ba019c38cd4f1bdbdeabd47370ae2b51d4d27441ebade6dfc2f80d'`,
    );
    expect(solverOtpIdentity.rows).toEqual([
      {
        user_id: "usr_solver_alpha",
        individual_workspace_id: "wsp_individual_alpha",
        individual_membership_id: "mem_individual_alpha",
      },
    ]);
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
          id, user_id, origin_tenant_id, token_family_id,
          access_token_digest, refresh_token_digest,
          access_expires_at, refresh_expires_at
        ) VALUES (
          'ses_invalid_digest', 'usr_solver_alpha', 'ten_solver_alpha',
          'family_invalid_digest', 'raw-token',
          repeat('d', 64), clock_timestamp() + interval '5 minutes',
          clock_timestamp() + interval '1 day'
        )
      `),
      "23514",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO app_session (
          id, user_id, origin_tenant_id, token_family_id,
          access_token_digest, refresh_token_digest,
          access_expires_at, refresh_expires_at
        ) VALUES (
          'ses_equal_digests', 'usr_solver_alpha', 'ten_solver_alpha',
          'family_equal_digests', repeat('d', 64), repeat('d', 64),
          clock_timestamp() + interval '5 minutes', clock_timestamp() + interval '1 day'
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
          current_version_id, lock_version, created_by_user_id
        ) VALUES (
          'chl_invalid_solver', 'ten_solver_alpha', 'organization', 'wsp_team_alpha',
          'org', 'draft', 'chv_invalid_solver_v1', 1, 'usr_solver_alpha'
        )
      `),
      "23503",
    );

    await expectDatabaseError(
      database.query(`
        INSERT INTO challenge (
          id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
          current_version_id, lock_version, created_by_user_id
        ) VALUES (
          'chl_invalid_stage', 'ten_org_alpha', 'organization', 'wsp_org_alpha',
          'org', 'ready', 'chv_invalid_stage_v1', 1, 'usr_owner_alpha'
        )
      `),
      "23514",
    );
  });

  it("makes every challenge version, receipt, and audit record immutable", async () => {
    await expectDatabaseError(
      database.query(`
        UPDATE challenge_version
        SET content = '{"title":"tampered"}'::jsonb
        WHERE id = 'chv_synthetic_alpha_v1'
      `),
      "55000",
    );
    await expectDatabaseError(
      database.query(`
        UPDATE mutation_receipt
        SET next_actions = '["tampered"]'::jsonb
        WHERE id = 'rcp_seed_challenge_alpha'
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

  it("fails the A1b migration atomically for an orphaned existing session", async () => {
    expect((await runMigrations(database, "down")).applied).toEqual([
      "0029_d8_d9_review_remediation",
    ]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0026_d5_review_coi"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0025_d4_review_assignments"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0022_d1_review_foundation"]);
    const offerClockDown = await runMigrations(database, "down");
    expect(offerClockDown.applied).toEqual(["0021_c6_offer_deadline_single_clock"]);
    const c8Down = await runMigrations(database, "down");
    expect(c8Down.applied).toEqual(["0020_c8_notifications"]);
    const c7Down = await runMigrations(database, "down");
    expect(c7Down.applied).toEqual(["0019_c7_solver_activation"]);
    const c6Down = await runMigrations(database, "down");
    expect(c6Down.applied).toEqual(["0018_c6_opportunities_direct_offers"]);
    const c5Down = await runMigrations(database, "down");
    expect(c5Down.applied).toEqual(["0017_c5_proposal_clarification_revision"]);
    const c4Down = await runMigrations(database, "down");
    expect(c4Down.applied).toEqual(["0016_c4_proposal_submission"]);
    const c2Down = await runMigrations(database, "down");
    expect(c2Down.applied).toEqual(["0015_c2_team_lifecycle"]);
    const c1Down = await runMigrations(database, "down");
    expect(c1Down.applied).toEqual(["0014_c1_solver_profile_eligibility"]);
    const proposalDown = await runMigrations(database, "down");
    expect(proposalDown.applied).toEqual(["0013_c_proposal_foundation"]);
    const reviewClosureDown = await runMigrations(database, "down");
    expect(reviewClosureDown.applied).toEqual(["0012_phase2_review_closure"]);
    const phase2Down = await runMigrations(database, "down");
    expect(phase2Down.applied).toEqual(["0010_phase2_closure"]);
    const b6Down = await runMigrations(database, "down");
    expect(b6Down.applied).toEqual(["0009_b6_publication_lifecycle"]);
    const b4Down = await runMigrations(database, "down");
    expect(b4Down.applied).toEqual(["0008_b4_challenge_publication"]);
    const b3Down = await runMigrations(database, "down");
    expect(b3Down.applied).toEqual(["0007_b3_versioned_eligibility_rules"]);
    const b2Down = await runMigrations(database, "down");
    expect(b2Down.applied).toEqual(["0006_b2_challenge_approval_gates"]);
    const b1Down = await runMigrations(database, "down");
    expect(b1Down.applied).toEqual(["0005_b1_authoritative_challenge_lifecycle"]);
    const a2Down = await runMigrations(database, "down");
    expect(a2Down.applied).toEqual(["0004_a2_oidc_authorization"]);
    const a1cDown = await runMigrations(database, "down");
    expect(a1cDown.applied).toEqual(["0003_a1c_authoritative_challenge"]);
    const down = await runMigrations(database, "down");
    expect(down.applied).toEqual(["0002_a1b_identity_transaction"]);
    await database.query(`
      INSERT INTO app_user (id, display_name, primary_email, created_at, updated_at)
      VALUES (
        'usr_orphaned_session', 'Orphaned Session', 'orphaned-session@synthetic.invalid',
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      )
    `);
    await database.query(`
      INSERT INTO app_session (
        id, user_id, token_family_id, access_token_digest, refresh_token_digest,
        issued_at, access_expires_at, refresh_expires_at
      ) VALUES (
        'ses_orphaned_session', 'usr_orphaned_session', 'family_orphaned_session',
        repeat('a', 64), repeat('b', 64), '2026-01-01T00:00:00Z',
        '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z'
      )
    `);

    await expect(runMigrations(database, "up")).rejects.toThrow(
      "revoke orphaned sessions before retrying",
    );
    const rolledBack = await database.query<{
      origin_column: string | null;
      ledger_count: string;
    }>(`
      SELECT
        (
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'app_session'
            AND column_name = 'origin_tenant_id'
        ) AS origin_column,
        (
          SELECT count(*)
          FROM schema_migration
          WHERE id = '0002_a1b_identity_transaction'
        ) AS ledger_count
    `);
    expect(rolledBack.rows[0]).toEqual({ origin_column: null, ledger_count: "0" });

    await database.query("DELETE FROM app_session WHERE id = 'ses_orphaned_session'");
    await database.query("DELETE FROM app_user WHERE id = 'usr_orphaned_session'");
    const recovered = await runMigrations(database, "up");
    expect(recovered.applied).toEqual([
      "0002_a1b_identity_transaction",
      "0003_a1c_authoritative_challenge",
      "0004_a2_oidc_authorization",
      "0005_b1_authoritative_challenge_lifecycle",
      "0006_b2_challenge_approval_gates",
      "0007_b3_versioned_eligibility_rules",
      "0008_b4_challenge_publication",
      "0009_b6_publication_lifecycle",
      "0010_phase2_closure",
      "0012_phase2_review_closure",
      "0013_c_proposal_foundation",
      "0014_c1_solver_profile_eligibility",
      "0015_c2_team_lifecycle",
      "0016_c4_proposal_submission",
      "0017_c5_proposal_clarification_revision",
      "0018_c6_opportunities_direct_offers",
      "0019_c7_solver_activation",
      "0020_c8_notifications",
      "0021_c6_offer_deadline_single_clock",
      "0022_d1_review_foundation",
      "0023_d2_rubric_authoring",
      "0024_d3_open_evaluation",
      "0025_d4_review_assignments",
      "0026_d5_review_coi",
      "0027_d6_review_scoring",
      "0028_d8_d9_decision_case",
      "0029_d8_d9_review_remediation",
    ]);
  });
});
