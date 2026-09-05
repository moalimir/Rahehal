import {
  parseCorrelationId,
  parseChallengeId,
  parseChallengeVersionId,
  parseMembershipId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MonotonicIdFactory } from "../src/primitives.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresOpportunityAdapter } from "../src/postgres/opportunities.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresSolverWorkspaceAdapter } from "../src/postgres/solver-workspaces.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import type {
  OpportunityCommandContext,
  OpportunityScope,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../src/ports.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const databaseName = `rahhal_c6_opportunities_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

let currentTime = "2026-09-05T09:00:00.000Z";
const clock = { now: () => new Date(currentTime) };
const ids = new MonotonicIdFactory();
const challengeId = parseChallengeId("chl_synthetic_alpha");
const challengeVersionId = parseChallengeVersionId("chv_synthetic_alpha_v1");
const confidentialChallengeId = parseChallengeId("chl_c6_invite_only");
const confidentialChallengeVersionId = parseChallengeVersionId("chv_c6_invite_only_v1");

let admin: Client;
let database: Pool;
let opportunities: PostgresOpportunityAdapter;
let solverWorkspaces: PostgresSolverWorkspaceAdapter;

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

const organizationScope: WorkspaceScope = {
  tenantId: parseTenantId("ten_org_alpha"),
  workspaceId: parseWorkspaceId("wsp_org_alpha"),
  role: "org:owner",
  actorUserId: parseUserId("usr_owner_alpha"),
};

const organizationCommand = (key: string): WorkspaceCommandContext => ({
  ...organizationScope,
  idempotencyKey: key,
  correlationId: parseCorrelationId(`cor_${key}`),
});

const individualScope: OpportunityScope = {
  tenantId: parseTenantId("ten_solver_alpha"),
  workspaceId: parseWorkspaceId("wsp_individual_alpha"),
  role: "individual",
  actorUserId: parseUserId("usr_solver_alpha"),
  membershipId: parseMembershipId("mem_individual_alpha"),
};

const individualCommand = (key: string): OpportunityCommandContext => ({
  ...individualScope,
  idempotencyKey: key,
  correlationId: parseCorrelationId(`cor_${key}`),
});

const offerBody = (deadline = "2098-12-01T00:00:00.000Z") => ({
  expected_version: 0 as const,
  challenge_id: challengeId,
  challenge_version_id: challengeVersionId,
  recipient_workspace_id: individualScope.workspaceId,
  title: "Synthetic direct offer",
  summary: "A persisted direct offer used to prove the complete C6 bilateral aggregate.",
  invitation_reasons: ["Relevant verified experience"],
  requested_documents: ["Pilot delivery plan"],
  response_deadline: deadline,
});

const readyResponse = {
  approach: "A".repeat(80),
  scope: "S".repeat(80),
  start_availability: "Within two weeks",
  duration_weeks: 12,
  budget_amount_minor: 125_000_000,
  budget_currency: "IRR" as const,
  payment_model: "Milestone",
  negotiables: "Delivery dates",
  authority_confirmed: true,
  attachment_ids: [] as const,
};

async function publishSyntheticChallenge(): Promise<void> {
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_c6_technical', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'technical', 'approved',
       'Synthetic approval', 'usr_approver_alpha', 'org:approver_technical', clock_timestamp()),
      ('cap_c6_legal', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'legal', 'approved',
       'Synthetic approval', 'usr_platform_legal', 'platform:legal', clock_timestamp()),
      ('cap_c6_finance', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'finance', 'approved',
       'Synthetic approval', 'usr_platform_finance', 'platform:finance', clock_timestamp()),
      ('cap_c6_quality', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'quality', 'approved',
       'Synthetic approval', 'usr_platform_ops', 'platform:ops', clock_timestamp())
  `);
  await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_c6_synthetic_alpha', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_synthetic_alpha', 'chv_synthetic_alpha_v1',
      ARRAY['individual', 'expert-team']::text[], false, false, false,
      '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    )
  `);
  await database.query(`
    UPDATE challenge
    SET stage = 'published', published_version_id = 'chv_synthetic_alpha_v1',
        publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
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
      'Synthetic C6 challenge', 'technology', 'Tehran',
      'Public projection for authoritative saved-opportunity and offer tests.',
      'pilot', 'public', 'both', ARRAY['individual', 'expert-team']::text[],
      'hybrid', '2099-01-01T00:00:00Z', NULL, 'undecided', NULL, 'IRR',
      'public', false, false, false, 'solver_license', 'open', clock_timestamp()
    )
  `);
}

async function publishConfidentialChallenge(): Promise<void> {
  await database.query(`
    INSERT INTO challenge (
      id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
      current_version_id, published_version_id, lock_version,
      created_by_user_id, created_at, updated_at
    ) VALUES (
      'chl_c6_invite_only', 'ten_org_alpha', 'organization', 'wsp_org_alpha', 'org',
      'draft', 'chv_c6_invite_only_v1', NULL, 1,
      'usr_owner_alpha', clock_timestamp(), clock_timestamp()
    );
    INSERT INTO challenge_version (
      id, challenge_id, version_number, content, authoring_status,
      created_by_user_id, created_at
    )
    SELECT 'chv_c6_invite_only_v1', 'chl_c6_invite_only', 1,
           jsonb_set(
             jsonb_set(
               jsonb_set(content, '{visibility}', '"invite_only"'::jsonb),
               '{sourcing_model}', '"private"'::jsonb),
             '{proposal_deadline}', '"2099-01-01T00:00:00Z"'::jsonb),
           'ready', 'usr_owner_alpha', clock_timestamp()
    FROM challenge_version WHERE id = 'chv_synthetic_alpha_v1';
  `);
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    )
    SELECT 'cap_c6_private_' || gate.name, 'ten_org_alpha', 'wsp_org_alpha',
           'chl_c6_invite_only', 'chv_c6_invite_only_v1', gate.name,
           'approved', 'Synthetic approval', gate.actor, gate.role, clock_timestamp()
    FROM (VALUES
      ('technical', 'usr_approver_alpha', 'org:approver_technical'),
      ('legal', 'usr_platform_legal', 'platform:legal'),
      ('finance', 'usr_platform_finance', 'platform:finance'),
      ('quality', 'usr_platform_ops', 'platform:ops')
    ) AS gate(name, actor, role)
  `);
  await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_c6_invite_only', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_c6_invite_only', 'chv_c6_invite_only_v1',
      ARRAY['individual', 'expert-team']::text[], false, false, false,
      '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    );
    UPDATE challenge
    SET stage = 'published', published_version_id = 'chv_c6_invite_only_v1',
        publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = clock_timestamp()
    WHERE id = 'chl_c6_invite_only';
  `);
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
  database = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await publishSyntheticChallenge();
  await publishConfidentialChallenge();
  const unitOfWork = new PostgresUnitOfWork(database);
  const teams = new PostgresTeamAdapter(unitOfWork, clock, ids);
  solverWorkspaces = new PostgresSolverWorkspaceAdapter(unitOfWork, clock, ids);
  opportunities = new PostgresOpportunityAdapter(unitOfWork, teams, clock, ids);
}, 60_000);

beforeEach(async () => {
  currentTime = "2026-09-05T09:00:00.000Z";
  await database.query("TRUNCATE saved_opportunity, offer_response, direct_offer CASCADE");
});

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`);
  await admin.end();
});

describe("C6 PostgreSQL opportunities and direct offers", () => {
  it("persists save/unsave with tenant-scoped replay and atomic evidence", async () => {
    const saved = await opportunities.save(
      "chl_synthetic_alpha",
      { expected_version: 0 },
      individualCommand("c6-pg-save-0001"),
    );
    const replay = await opportunities.save(
      "chl_synthetic_alpha",
      { expected_version: 0 },
      individualCommand("c6-pg-save-0001"),
    );
    expect(replay.receipt).toEqual({ ...saved.receipt, idempotent: true });
    expect((await opportunities.listSaved(individualScope)).items).toEqual([
      expect.objectContaining({
        id: saved.receipt.entity_id,
        challenge_id: "chl_synthetic_alpha",
        challenge_version_id: "chv_synthetic_alpha_v1",
        version: 1,
      }),
    ]);

    await opportunities.unsave(
      "chl_synthetic_alpha",
      { expected_version: 1 },
      individualCommand("c6-pg-unsave-0001"),
    );
    expect((await opportunities.listSaved(individualScope)).items).toEqual([]);
    const evidence = await database.query<{ audits: string; outbox: string; receipts: string }>(`
      SELECT
        (SELECT count(*) FROM audit_event
         WHERE target_type = 'saved_opportunity') AS audits,
        (SELECT count(*) FROM outbox_event
         WHERE aggregate_type = 'saved_opportunity') AS outbox,
        (SELECT count(*) FROM mutation_receipt
         WHERE entity_type = 'saved_opportunity') AS receipts
    `);
    expect(evidence.rows[0]).toEqual({ audits: "2", outbox: "2", receipts: "2" });
  });

  it("persists exact offer grants, response versions, submission, and negotiation", async () => {
    const sent = await opportunities.send(offerBody(), organizationCommand("c6-pg-send-0001"));
    const offerId = sent.receipt.entity_id;
    expect((await opportunities.getReceived(individualScope, offerId))?.state).toBe("received");
    await opportunities.view(
      offerId,
      { expected_version: 1 },
      individualCommand("c6-pg-view-0001"),
    );
    await opportunities.startResponse(
      offerId,
      { expected_version: 2 },
      individualCommand("c6-pg-start-response-0001"),
    );
    await opportunities.patchResponse(
      offerId,
      { expected_version: 3, patch: readyResponse },
      individualCommand("c6-pg-patch-response-0001"),
    );
    await opportunities.submitResponse(
      offerId,
      { expected_version: 4 },
      individualCommand("c6-pg-submit-response-0001"),
    );
    await opportunities.startNegotiation(
      offerId,
      { expected_version: 5 },
      organizationCommand("c6-pg-negotiate-0001"),
    );

    const final = await opportunities.getSent(organizationScope, offerId);
    expect(final).toMatchObject({
      state: "negotiating",
      version: 6,
      response: {
        state: "submitted",
        version: 3,
        content: readyResponse,
        readiness: { ready: true, evaluated_version: 3, issues: [] },
      },
    });
    const grants = await database.query<{
      resource_type: string;
      resource_id: string;
      capability: string;
      direct_offer_id: string;
      state: string;
    }>(
      `
      SELECT resource_type, resource_id, capability, direct_offer_id, state
      FROM access_grant WHERE direct_offer_id = $1 ORDER BY resource_type
    `,
      [offerId],
    );
    expect(grants.rows).toEqual([
      {
        resource_type: "challenge",
        resource_id: "chl_synthetic_alpha",
        capability: "read",
        direct_offer_id: offerId,
        state: "active",
      },
      {
        resource_type: "direct_offer",
        resource_id: offerId,
        capability: "collaborate",
        direct_offer_id: offerId,
        state: "active",
      },
    ]);
    const evidence = await database.query<{ audits: string; outbox: string; receipts: string }>(
      `
      SELECT
        (SELECT count(*) FROM audit_event WHERE target_id = $1) AS audits,
        (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1) AS outbox,
        (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1) AS receipts
    `,
      [offerId],
    );
    expect(evidence.rows[0]).toEqual({ audits: "6", outbox: "6", receipts: "6" });
  });

  it("expires an in-progress response and both grants at the response deadline", async () => {
    const sent = await opportunities.send(
      offerBody("2026-09-05T09:10:00.000Z"),
      organizationCommand("c6-pg-send-expiring-0001"),
    );
    const offerId = sent.receipt.entity_id;
    await opportunities.view(
      offerId,
      { expected_version: 1 },
      individualCommand("c6-pg-view-expiring-0001"),
    );
    await opportunities.startResponse(
      offerId,
      { expected_version: 2 },
      individualCommand("c6-pg-draft-expiring-0001"),
    );

    currentTime = "2026-09-05T09:10:00.001Z";
    expect(await opportunities.getReceived(individualScope, offerId)).toBeNull();
    expect(await opportunities.getSent(organizationScope, offerId)).toMatchObject({
      state: "expired",
      version: 4,
      expired_at: currentTime,
    });
    const grants = await database.query<{ state: string }>(
      "SELECT state FROM access_grant WHERE direct_offer_id = $1",
      [offerId],
    );
    expect(grants.rows).toEqual([{ state: "expired" }, { state: "expired" }]);
  });

  it("closes recipient access on decline and replays after the grants are revoked", async () => {
    const sent = await opportunities.send(
      offerBody(),
      organizationCommand("c6-pg-send-decline-0001"),
    );
    const offerId = sent.receipt.entity_id;
    const body = { expected_version: 1, reason: "The requested timing is not feasible." };
    const declined = await opportunities.decline(
      offerId,
      body,
      individualCommand("c6-pg-decline-0001"),
    );
    const replay = await opportunities.decline(
      offerId,
      body,
      individualCommand("c6-pg-decline-0001"),
    );
    expect(replay.receipt).toEqual({ ...declined.receipt, idempotent: true });
    expect(await opportunities.getReceived(individualScope, offerId)).toBeNull();
    expect(await opportunities.getSent(organizationScope, offerId)).toMatchObject({
      state: "declined",
      version: 2,
      decline_reason: body.reason,
    });
    const grants = await database.query<{ state: string; revocation_reason: string }>(
      `SELECT state, revocation_reason FROM access_grant
       WHERE direct_offer_id = $1 ORDER BY resource_type`,
      [offerId],
    );
    expect(grants.rows).toEqual([
      { state: "revoked", revocation_reason: body.reason },
      { state: "revoked", revocation_reason: body.reason },
    ]);
  });

  it("uses the exact active offer grant to reach an invite-only challenge", async () => {
    expect(await solverWorkspaces.evaluate(individualScope, confidentialChallengeId)).toBeNull();
    const sent = await opportunities.send(
      {
        ...offerBody(),
        challenge_id: confidentialChallengeId,
        challenge_version_id: confidentialChallengeVersionId,
      },
      organizationCommand("c6-pg-send-private-0001"),
    );
    expect(await solverWorkspaces.evaluate(individualScope, confidentialChallengeId)).toMatchObject(
      {
        challenge_id: confidentialChallengeId,
        evaluated_against_version_id: confidentialChallengeVersionId,
        status: "eligible",
      },
    );
    await opportunities.cancel(
      sent.receipt.entity_id,
      { expected_version: 1, reason: "Invitation withdrawn." },
      organizationCommand("c6-pg-cancel-private-0001"),
    );
    expect(await solverWorkspaces.evaluate(individualScope, confidentialChallengeId)).toBeNull();
  });

  it("protects offer grant evidence without silencing other access grants", async () => {
    const sent = await opportunities.send(
      offerBody(),
      organizationCommand("c6-pg-grant-delete-guard-0001"),
    );
    await expect(
      database.query("DELETE FROM access_grant WHERE direct_offer_id = $1", [
        sent.receipt.entity_id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    expect(
      (
        await database.query("SELECT 1 FROM access_grant WHERE direct_offer_id = $1", [
          sent.receipt.entity_id,
        ])
      ).rowCount,
    ).toBe(2);

    // C6's guard sits on every access_grant row, so a grant it does not own
    // must still delete. A BEFORE DELETE trigger returning NULL cancels the
    // statement silently: `DELETE 0` with the row still present and no error.
    await database.query(
      `INSERT INTO access_grant (
         id, grantor_tenant_id, grantor_workspace_id, grantee_tenant_id, grantee_workspace_id,
         resource_type, resource_id, capability, state, valid_from, expires_at,
         created_by_user_id, created_at
       ) VALUES (
         'agr_c6_unrelated_scratch', 'ten_org_alpha', 'wsp_org_alpha',
         'ten_solver_alpha', 'wsp_individual_alpha', 'challenge', $1, 'read', 'active',
         clock_timestamp(), clock_timestamp() + interval '1 day',
         'usr_owner_alpha', clock_timestamp()
       )`,
      [confidentialChallengeId],
    );
    const removed = await database.query(
      "DELETE FROM access_grant WHERE id = 'agr_c6_unrelated_scratch'",
    );
    expect(removed.rowCount).toBe(1);
    expect(
      (await database.query("SELECT 1 FROM access_grant WHERE id = 'agr_c6_unrelated_scratch'"))
        .rowCount,
    ).toBe(0);
  });
});
