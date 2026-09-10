import {
  parseCorrelationId,
  parseChallengeId,
  parseMembershipId,
  parsePrefixedId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type MembershipId,
  type WorkspaceId,
  type WorkspaceRole,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import type {
  ProposalCommandContext,
  ProposalScope,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../src/ports.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_c3_proposals_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

const clock = { now: () => new Date("2026-09-03T09:00:00.000Z") };
const challengeId = parseChallengeId("chl_synthetic_alpha");
const verificationChallengeId = parseChallengeId("chl_c4_verification_required");
const verificationChallengeVersionId = parsePrefixedId("chv_c4_verification_required_v1", "chv");
const teamWorkspaceId = parseWorkspaceId("wsp_team_alpha");
const individualWorkspaceId = parseWorkspaceId("wsp_individual_alpha");

let admin: Client;
let database: Pool;
let proposals: PostgresProposalAdapter;
let teams: PostgresTeamAdapter;

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

function scope(
  workspaceId: WorkspaceId,
  role: WorkspaceRole,
  membershipId: MembershipId,
  actorUserId: string,
): ProposalScope {
  return {
    tenantId: parseTenantId("ten_solver_alpha"),
    workspaceId,
    role,
    membershipId,
    actorUserId: parseUserId(actorUserId),
  };
}

function command(
  workspaceId: WorkspaceId,
  role: WorkspaceRole,
  membershipId: MembershipId,
  actorUserId: string,
  key: string,
): ProposalCommandContext {
  return {
    ...scope(workspaceId, role, membershipId, actorUserId),
    idempotencyKey: key,
    correlationId: parseCorrelationId(`cor_${key}`),
  };
}

const teamOwner = (key: string) =>
  command(
    teamWorkspaceId,
    "team:owner",
    parseMembershipId("mem_team_owner_alpha"),
    "usr_solver_alpha",
    key,
  );
const teamContributor = (key: string) =>
  command(
    teamWorkspaceId,
    "team:contributor",
    parseMembershipId("mem_team_contributor_alpha"),
    "usr_team_contributor_alpha",
    key,
  );
const teamViewer = (key: string) =>
  command(
    teamWorkspaceId,
    "team:viewer",
    parseMembershipId("mem_team_viewer_alpha"),
    "usr_team_viewer_alpha",
    key,
  );
const individual = (key: string) =>
  command(
    individualWorkspaceId,
    "individual",
    parseMembershipId("mem_individual_alpha"),
    "usr_solver_alpha",
    key,
  );

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

const readyProposalDraft = () => ({
  title: "Authoritative energy monitoring proposal",
  problem_statement:
    "Energy consumption cannot be improved without reliable interval measurements.",
  value_proposition:
    "The solution identifies waste and provides measurable corrective recommendations.",
  prototype_weeks: "6",
  technical_approach:
    "A deterministic pipeline aggregates meter samples and exposes reviewed indicators.",
  success_metrics: "Ten percent measured consumption reduction",
  ip_status: "owned",
  duration_weeks: "12",
  budget_amount_minor: 125_000_000,
  budget_currency: "IRR" as const,
  nda_accepted: false,
  conflict_declared: true,
  ip_accepted: true,
  accuracy_confirmed: true,
});

async function publishSyntheticChallenge(): Promise<void> {
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_c3_technical', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'technical', 'approved',
       'Synthetic approval', 'usr_approver_alpha', 'org:approver_technical', clock_timestamp()),
      ('cap_c3_legal', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'legal', 'approved',
       'Synthetic approval', 'usr_platform_legal', 'platform:legal', clock_timestamp()),
      ('cap_c3_finance', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'finance', 'approved',
       'Synthetic approval', 'usr_platform_finance', 'platform:finance', clock_timestamp()),
      ('cap_c3_quality', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'quality', 'approved',
       'Synthetic approval', 'usr_platform_ops', 'platform:ops', clock_timestamp())
  `);
  await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_c3_synthetic_alpha_v1', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_synthetic_alpha', 'chv_synthetic_alpha_v1',
      ARRAY['individual', 'expert-team']::text[], false, false, false,
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
      'Synthetic C3 challenge', 'technology', 'Tehran',
      'Synthetic public projection for C3 draft tests.',
      'pilot', 'public', 'both', ARRAY['individual', 'expert-team']::text[],
      'hybrid', '2099-01-01T00:00:00Z', NULL,
      'undecided', NULL, 'IRR', 'public', false, false, false,
      'solver_license', 'open', clock_timestamp()
    )
  `);
}

async function publishVerificationRequiredChallenge(): Promise<void> {
  await database.query(`
    BEGIN;
    INSERT INTO challenge (
      id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
      current_version_id, published_version_id, lock_version,
      created_by_user_id, created_at, updated_at
    ) VALUES (
      'chl_c4_verification_required', 'ten_org_alpha', 'organization',
      'wsp_org_alpha', 'org', 'draft', 'chv_c4_verification_required_v1', NULL, 1,
      'usr_owner_alpha', clock_timestamp(), clock_timestamp()
    );
    INSERT INTO challenge_version (
      id, challenge_id, version_number, content, created_by_user_id, created_at
    )
    SELECT 'chv_c4_verification_required_v1', 'chl_c4_verification_required', 1,
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(content, '{allowed_applicant_types}',
                     '["individual","expert-team"]'::jsonb),
                   '{verification_required}', 'true'::jsonb),
                 '{nda_required}', 'false'::jsonb),
               '{document_gate_required}', 'false'::jsonb),
             '{proposal_deadline}', '"2099-01-01T00:00:00Z"'::jsonb),
           'usr_owner_alpha', clock_timestamp()
    FROM challenge_version WHERE id = 'chv_synthetic_alpha_v1';
    COMMIT;
  `);
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    )
    SELECT 'cap_c4_verification_' || gate.name, 'ten_org_alpha', 'wsp_org_alpha',
           'chl_c4_verification_required', 'chv_c4_verification_required_v1', gate.name,
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
      'elr_c4_verification_required', 'ten_org_alpha', 'wsp_org_alpha',
      'chl_c4_verification_required', 'chv_c4_verification_required_v1',
      ARRAY['individual', 'expert-team']::text[], true, false, false,
      '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    )
  `);
  await database.query(`
    UPDATE challenge
    SET stage = 'published', published_version_id = 'chv_c4_verification_required_v1',
        publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = clock_timestamp()
    WHERE id = 'chl_c4_verification_required'
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
      'chl_c4_verification_required', 'ten_org_alpha', 'chv_c4_verification_required_v1',
      'Synthetic C4 verification challenge', 'technology', 'Tehran',
      'Synthetic public projection for the C4 verification gate.',
      'pilot', 'public', 'both', ARRAY['individual', 'expert-team']::text[],
      'hybrid', '2099-01-01T00:00:00Z', NULL,
      'undecided', NULL, 'IRR', 'public', true, false, false,
      'solver_license', 'open', clock_timestamp()
    )
  `);
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 8 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await publishSyntheticChallenge();
  const unitOfWork = new PostgresUnitOfWork(database);
  const ids = new MonotonicIdFactory();
  teams = new PostgresTeamAdapter(unitOfWork, clock, ids);
  proposals = new PostgresProposalAdapter(unitOfWork, teams, clock, ids);
}, 60_000);

beforeEach(async () => {
  // Every behavior starts from a fully rebuilt database rather than targeted
  // cleanup statements. Two guards make the cheaper reset impossible: audit
  // rows are append-only, and `challenge_publication_lifecycle_guard` keeps a
  // closed call closed, so once the closed-call behavior runs no UPDATE can
  // reopen the shared challenge for the behaviors after it.
  while ((await runMigrations(database, "down")).applied.length > 0) {
    // Revert every applied migration so each behavior starts from a clean database.
  }
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await publishSyntheticChallenge();
});

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
  await admin.end();
});

describe("C3 PostgreSQL proposal drafts", () => {
  it("atomically creates, replays, and appends exact immutable draft versions", async () => {
    const body = {
      expected_version: 0 as const,
      challenge_id: challengeId,
      draft: {
        title: "پیشنهاد پایش هوشمند انرژی",
        budget_amount_minor: 125_000_000,
        budget_currency: "IRR" as const,
        attachment_ids: [parsePrefixedId("fil_c3_metadata_001", "fil")],
      },
    };
    const created = await proposals.create(body, teamOwner("c3-pg-create-0001"));
    const replay = await proposals.create(body, teamOwner("c3-pg-create-0001"));
    expect(replay).toEqual({
      ...created,
      receipt: { ...created.receipt, idempotent: true },
    });

    const initial = await proposals.getScoped(
      teamOwner("c3-pg-read-0001"),
      created.receipt.entity_id,
    );
    expect(initial).toMatchObject({
      owner_workspace_id: teamWorkspaceId,
      owner_workspace_kind: "team",
      assigned_membership_ids: ["mem_team_owner_alpha"],
      state: "draft",
      version: 1,
      content: {
        budget_amount_minor: 125_000_000,
        budget_currency: "IRR",
        attachment_ids: ["fil_c3_metadata_001"],
      },
      versions: [{ version_number: 1, base_version_id: null, locked: false }],
    });

    const patchBody = {
      expected_version: 1,
      patch: { title: "پیشنهاد پایش و کاهش هوشمند انرژی", budget_amount_minor: 130_000_000 },
    } as const;
    const patched = await proposals.patch(
      created.receipt.entity_id,
      patchBody,
      teamOwner("c3-pg-patch-0001"),
    );
    expect(patched.entityVersion).toBe(2);
    const current = await proposals.getScoped(
      teamOwner("c3-pg-read-0002"),
      created.receipt.entity_id,
    );
    expect(current?.versions[1]).toMatchObject({
      version_number: 2,
      base_version_id: initial?.current_version_id,
      changed_fields: ["title", "budget_amount_minor"],
      locked: false,
    });
    expect(current?.versions[1]?.content_hash).toMatch(/^[0-9a-f]{64}$/);

    await expect(
      proposals.patch(created.receipt.entity_id, patchBody, teamOwner("c3-pg-patch-stale-0001")),
      // `staleVersion` reports the canonical CONFLICT code; STALE_VERSION is
      // not one of the seven codes in `apiErrorCodes`.
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      proposals.create(
        { ...body, draft: { ...body.draft, title: "Different request" } },
        teamOwner("c3-pg-create-0001"),
      ),
      // `idempotencyConflict` also reports the canonical CONFLICT code.
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const facts = await database.query(
      `
      SELECT
        (SELECT count(*) FROM proposal_version WHERE proposal_id = $1) AS versions,
        (SELECT count(*) FROM audit_event WHERE target_id = $1) AS audits,
        (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1) AS receipts,
        (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1) AS outbox,
        (SELECT bool_and(payload = jsonb_build_object('entity_version',
          (payload->>'entity_version')::bigint)) FROM outbox_event WHERE aggregate_id = $1)
          AS metadata_only,
        (SELECT bool_and(metadata = jsonb_build_object('entity_version',
          (metadata->>'entity_version')::bigint)) FROM audit_event WHERE target_id = $1)
          AS audit_metadata_only
    `,
      [created.receipt.entity_id],
    );
    expect(facts.rows[0]).toEqual({
      versions: "2",
      audits: "2",
      receipts: "2",
      outbox: "2",
      metadata_only: true,
      audit_metadata_only: true,
    });
  });

  it("serializes concurrent create and save races without duplicate drafts or versions", async () => {
    const createBody = { expected_version: 0 as const, challenge_id: challengeId };
    const creates = await Promise.allSettled([
      proposals.create(createBody, teamOwner("c3-pg-create-race-a-0001")),
      proposals.create(createBody, teamOwner("c3-pg-create-race-b-0001")),
    ]);
    expect(creates.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(creates.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(creates.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });

    const created = creates.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof proposals.create>>> =>
        result.status === "fulfilled",
    );
    if (!created) throw new Error("The concurrent create race produced no winner");
    const proposalId = created.value.receipt.entity_id;
    const saves = await Promise.allSettled([
      proposals.patch(
        proposalId,
        { expected_version: 1, patch: { title: "Concurrent draft A" } },
        teamOwner("c3-pg-save-race-a-0001"),
      ),
      proposals.patch(
        proposalId,
        { expected_version: 1, patch: { title: "Concurrent draft B" } },
        teamOwner("c3-pg-save-race-b-0001"),
      ),
    ]);
    expect(saves.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(saves.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(saves.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });

    const stored = await database.query<{ proposals: string; versions: string }>(
      `SELECT
         (SELECT count(*) FROM proposal WHERE challenge_id = $1
           AND owner_workspace_id = $2) AS proposals,
         (SELECT count(*) FROM proposal_version WHERE proposal_id = $3) AS versions`,
      [challengeId, teamWorkspaceId, proposalId],
    );
    expect(stored.rows[0]).toEqual({ proposals: "1", versions: "2" });
  });

  it("fails closed for viewers, unassigned contributors, ID swaps, and closed calls", async () => {
    await expect(
      proposals.create(
        { expected_version: 0, challenge_id: challengeId },
        teamViewer("c3-pg-viewer-create-0001"),
      ),
    ).rejects.toMatchObject({ code: "NO_ACCESS" });

    const created = await proposals.create(
      { expected_version: 0, challenge_id: challengeId },
      teamOwner("c3-pg-owner-create-0001"),
    );
    await expect(
      proposals.getScoped(teamContributor("c3-pg-unassigned-read-0001"), created.receipt.entity_id),
    ).resolves.toBeNull();
    await expect(
      proposals.patch(
        created.receipt.entity_id,
        { expected_version: 1, patch: { title: "Hidden write" } },
        teamContributor("c3-pg-unassigned-patch-0001"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      proposals.getScoped(individual("c3-pg-id-swap-read-0001"), created.receipt.entity_id),
    ).resolves.toBeNull();
    await expect(
      proposals.patch(
        created.receipt.entity_id,
        { expected_version: 1, patch: { title: "Cross-workspace write" } },
        individual("c3-pg-id-swap-patch-0001"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.query(`
      UPDATE challenge SET publication_state = 'closed', updated_at = clock_timestamp()
      WHERE id = 'chl_synthetic_alpha'
    `);
    await expect(
      proposals.create(
        { expected_version: 0, challenge_id: challengeId },
        individual("c3-pg-closed-create-0001"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("auto-assigns a contributor and revalidates canonical team authority before replay", async () => {
    const body = { expected_version: 0 as const, challenge_id: challengeId };
    const created = await proposals.create(body, teamContributor("c3-pg-contributor-create-0001"));
    const resource = await proposals.getScoped(
      teamContributor("c3-pg-contributor-read-0001"),
      created.receipt.entity_id,
    );
    expect(resource?.assigned_membership_ids).toEqual(["mem_team_contributor_alpha"]);

    const membership = await database.query<{ lock_version: string }>(
      "SELECT lock_version FROM membership WHERE id = 'mem_team_contributor_alpha'",
    );
    await teams.changeMemberRole(
      parseMembershipId("mem_team_contributor_alpha"),
      {
        expected_version: Number(membership.rows[0]!.lock_version),
        role: "team:viewer",
        reason: "Draft assignment ended",
      },
      teamOwner("c3-pg-contributor-demote-0001"),
    );
    await expect(
      proposals.create(body, teamContributor("c3-pg-contributor-create-0001")),
    ).rejects.toMatchObject({ code: "NO_ACCESS" });
    await expect(
      proposals.getScoped(
        teamContributor("c3-pg-contributor-read-0002"),
        created.receipt.entity_id,
      ),
    ).resolves.toBeNull();
  });

  it("rolls the aggregate, version, audit, outbox, receipt, and idempotency key back together", async () => {
    const rollbackUnitOfWork = new PostgresUnitOfWork(database, () => {
      throw new Error("synthetic commit failure");
    });
    const rollbackIds = new MonotonicIdFactory();
    const rollbackTeams = new PostgresTeamAdapter(rollbackUnitOfWork, clock, rollbackIds);
    const rollbackProposals = new PostgresProposalAdapter(
      rollbackUnitOfWork,
      rollbackTeams,
      clock,
      rollbackIds,
    );
    await expect(
      rollbackProposals.create(
        { expected_version: 0, challenge_id: challengeId },
        teamOwner("c3-pg-rollback-create-0001"),
      ),
    ).rejects.toThrow("synthetic commit failure");

    const counts = await database.query(`
      SELECT
        (SELECT count(*) FROM proposal) AS proposals,
        (SELECT count(*) FROM proposal_version) AS versions,
        (SELECT count(*) FROM audit_event WHERE target_type = 'proposal') AS audits,
        (SELECT count(*) FROM mutation_receipt WHERE entity_type = 'proposal') AS receipts,
        (SELECT count(*) FROM outbox_event WHERE aggregate_type = 'proposal') AS outbox,
        (SELECT count(*) FROM idempotency_key
          WHERE idempotency_key = 'c3-pg-rollback-create-0001') AS idempotency
    `);
    expect(counts.rows[0]).toEqual({
      proposals: "0",
      versions: "0",
      audits: "0",
      receipts: "0",
      outbox: "0",
      idempotency: "0",
    });
  });
});

describe("C4 PostgreSQL proposal submission", () => {
  async function createReady(context: ProposalCommandContext, targetChallengeId = challengeId) {
    return proposals.create(
      { expected_version: 0, challenge_id: targetChallengeId, draft: readyProposalDraft() },
      context,
    );
  }

  it("commits one exact-base locked version, durable tracking, grant, and metadata evidence", async () => {
    const created = await createReady(individual("c4-pg-create-success-0001"));
    const body = {
      expected_version: 1,
      accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
    } as const;
    const submitted = await proposals.submit(
      created.receipt.entity_id,
      body,
      individual("c4-pg-submit-success-0001"),
    );
    const replay = await proposals.submit(
      created.receipt.entity_id,
      body,
      individual("c4-pg-submit-success-0001"),
    );
    expect(replay).toEqual({
      ...submitted,
      receipt: { ...submitted.receipt, idempotent: true },
    });
    expect(submitted.entityVersion).toBe(2);

    const stored = await proposals.getScoped(
      individual("c4-pg-read-success-0001"),
      created.receipt.entity_id,
    );
    expect(stored).not.toBeNull();
    if (!stored) {
      throw new Error("Expected the submitted proposal to remain solver-readable.");
    }
    expect(stored).toMatchObject({ state: "submitted", version: 2 });
    expect(stored.tracking_code).toMatch(/^PRP-\d{4}-\d{6}$/);
    expect(stored.versions[1]).toMatchObject({
      version_number: 2,
      base_version_id: stored.versions[0]?.id,
      accepted_challenge_version_id: "chv_synthetic_alpha_v1",
      changed_fields: [],
      locked: true,
    });

    const inbox = await proposals.listForOrganization(organizationScope);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).not.toHaveProperty("content");
    const detail = await proposals.getForOrganization(organizationScope, created.receipt.entity_id);
    expect(detail).toMatchObject({
      id: created.receipt.entity_id,
      submitted_version: { id: stored?.current_version_id },
      content: { title: readyProposalDraft().title },
    });
    expect(detail).not.toHaveProperty("tenant_id");
    expect(detail).not.toHaveProperty("owner_workspace_id");

    const evidence = await database.query(
      `SELECT
         (SELECT count(*) FROM proposal_version WHERE proposal_id = $1) AS versions,
         (SELECT count(*) FROM access_grant WHERE resource_id = $1 AND state = 'active') AS grants,
         (SELECT count(*) FROM audit_event
           WHERE target_id = $1 AND action = 'proposal.submitted') AS audits,
         (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1) AS receipts,
         (SELECT count(*) FROM outbox_event
           WHERE aggregate_id = $1 AND event_type = 'proposal.submitted') AS outbox,
         (SELECT bool_and(payload ?& ARRAY['entity_version','submitted_version_id','grant_id']
                  AND NOT payload ?| ARRAY['content','title','attachment_ids'])
            FROM outbox_event
           WHERE aggregate_id = $1 AND event_type = 'proposal.submitted') AS metadata_only`,
      [created.receipt.entity_id],
    );
    expect(evidence.rows[0]).toEqual({
      versions: "2",
      grants: "1",
      audits: "1",
      receipts: "2",
      outbox: "1",
      metadata_only: true,
    });

    await expect(
      proposals.submit(
        created.receipt.entity_id,
        { ...body, expected_version: 2 },
        individual("c4-pg-submit-success-0001"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      proposals.submit(
        created.receipt.entity_id,
        { ...body, expected_version: 2 },
        individual("c4-pg-submit-double-0001"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("fails with actionable exact-rule eligibility, readiness, terms, and sender details", async () => {
    await publishVerificationRequiredChallenge();
    const blocked = await createReady(
      individual("c4-pg-create-verification-0001"),
      verificationChallengeId,
    );
    await expect(
      proposals.submit(
        blocked.receipt.entity_id,
        {
          expected_version: 1,
          accepted_challenge_version_id: verificationChallengeVersionId,
        },
        individual("c4-pg-submit-verification-0001"),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      options: {
        recovery: "complete_eligibility_actions",
        eligibility: {
          status: "needs_action",
          next_actions: ["verify_workspace"],
          reasons: [{ code: "verification_required" }],
        },
      },
    });
    expect(
      await database.query("SELECT 1 FROM access_grant WHERE resource_id = $1", [
        blocked.receipt.entity_id,
      ]),
    ).toHaveProperty("rowCount", 0);

    const incompleteDraft = await createReady(individual("c4-pg-create-incomplete-0001"));
    const incomplete = await proposals.patch(
      incompleteDraft.receipt.entity_id,
      { expected_version: 1, patch: { conflict_declared: false } },
      individual("c4-pg-make-incomplete-0001"),
    );
    await expect(
      proposals.submit(
        incompleteDraft.receipt.entity_id,
        {
          expected_version: incomplete.entityVersion,
          accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
        },
        individual("c4-pg-submit-incomplete-0001"),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      options: { recovery: "complete_proposal" },
    });
    await expect(
      proposals.submit(
        incompleteDraft.receipt.entity_id,
        {
          expected_version: incomplete.entityVersion,
          accepted_challenge_version_id: parsePrefixedId("chv_other_terms_001", "chv"),
        },
        individual("c4-pg-submit-stale-terms-0001"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", options: { recovery: "refresh_challenge_terms" } });

    await database.query(
      "TRUNCATE evaluation_proposal, challenge_evaluation, coi_declaration, review_assignment, proposal_clarification, proposal_revision_request, access_grant, proposal_version, proposal",
    );
    const teamDraft = await createReady(teamOwner("c4-pg-create-team-0001"));
    await expect(
      proposals.submit(
        teamDraft.receipt.entity_id,
        {
          expected_version: 1,
          accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
        },
        teamContributor("c4-pg-submit-unassigned-0001"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serializes double-submit and close races and never creates two locks or grants", async () => {
    const created = await createReady(individual("c4-pg-create-race-0001"));
    const body = {
      expected_version: 1,
      accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
    } as const;
    const results = await Promise.allSettled([
      proposals.submit(created.receipt.entity_id, body, individual("c4-pg-submit-race-a-0001")),
      proposals.submit(created.receipt.entity_id, body, individual("c4-pg-submit-race-b-0001")),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const counts = await database.query(
      `SELECT
         (SELECT count(*) FROM proposal_version
           WHERE proposal_id = $1 AND locked_at IS NOT NULL) AS locked_versions,
         (SELECT count(*) FROM access_grant WHERE resource_id = $1) AS grants`,
      [created.receipt.entity_id],
    );
    expect(counts.rows[0]).toEqual({ locked_versions: "1", grants: "1" });

    await database.query(
      "TRUNCATE evaluation_proposal, challenge_evaluation, coi_declaration, review_assignment, proposal_clarification, proposal_revision_request, access_grant, proposal_version, proposal",
    );
    const closeRace = await createReady(individual("c4-pg-create-close-race-0001"));
    const closeResults = await Promise.allSettled([
      proposals.submit(
        closeRace.receipt.entity_id,
        body,
        individual("c4-pg-submit-close-race-0001"),
      ),
      database.query(`
        UPDATE challenge SET publication_state = 'closed', updated_at = clock_timestamp()
        WHERE id = 'chl_synthetic_alpha'
      `),
    ]);
    expect(closeResults[1]?.status).toBe("fulfilled");
    const after = await database.query(
      `SELECT proposal.state,
              (SELECT count(*) FROM access_grant WHERE resource_id = proposal.id) AS grants
       FROM proposal WHERE proposal.id = $1`,
      [closeRace.receipt.entity_id],
    );
    if (closeResults[0]?.status === "fulfilled") {
      expect(after.rows[0]).toEqual({ state: "submitted", grants: "1" });
    } else {
      expect(after.rows[0]).toEqual({ state: "draft", grants: "0" });
    }
  });

  it("denies expired or revoked grants and database mutation of locked evidence or grant binding", async () => {
    const created = await createReady(individual("c4-pg-create-protection-0001"));
    await proposals.submit(
      created.receipt.entity_id,
      {
        expected_version: 1,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      individual("c4-pg-submit-protection-0001"),
    );
    const versionId = (await proposals.getScoped(
      individual("c4-pg-read-protection-0001"),
      created.receipt.entity_id,
    ))!.current_version_id;
    await expect(
      database.query("UPDATE proposal_version SET content_hash = repeat('0', 64) WHERE id = $1", [
        versionId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query("DELETE FROM proposal_version WHERE id = $1", [versionId]),
    ).rejects.toMatchObject({
      code: "55000",
    });
    await expect(
      database.query(
        `UPDATE access_grant SET proposal_version_id = (
           SELECT base_version_id FROM proposal_version WHERE id = $1
         ) WHERE resource_id = $2`,
        [versionId, created.receipt.entity_id],
      ),
    ).rejects.toMatchObject({ code: "55000" });

    await database.query("UPDATE access_grant SET state = 'expired' WHERE resource_id = $1", [
      created.receipt.entity_id,
    ]);
    await expect(
      proposals.getForOrganization(organizationScope, created.receipt.entity_id),
    ).resolves.toBeNull();
    await expect(
      database.query("UPDATE access_grant SET state = 'active' WHERE resource_id = $1", [
        created.receipt.entity_id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query("DELETE FROM access_grant WHERE resource_id = $1", [
        created.receipt.entity_id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });

    const revoked = await createReady(teamOwner("c4-pg-create-revoked-grant-0001"));
    await proposals.submit(
      revoked.receipt.entity_id,
      {
        expected_version: 1,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      teamOwner("c4-pg-submit-revoked-grant-0001"),
    );
    await expect(
      proposals.getForOrganization(
        {
          ...organizationScope,
          tenantId: parseTenantId("ten_org_beta"),
          workspaceId: parseWorkspaceId("wsp_org_beta"),
        },
        revoked.receipt.entity_id,
      ),
    ).resolves.toBeNull();
    await database.query(
      `UPDATE access_grant
       SET state = 'revoked', revoked_at = clock_timestamp(),
           revoked_by_user_id = 'usr_owner_alpha', revocation_reason = 'Synthetic revocation'
       WHERE resource_id = $1`,
      [revoked.receipt.entity_id],
    );
    await expect(
      proposals.getForOrganization(organizationScope, revoked.receipt.entity_id),
    ).resolves.toBeNull();
    await expect(
      database.query(
        `UPDATE access_grant
         SET state = 'active', revoked_at = NULL,
             revoked_by_user_id = NULL, revocation_reason = NULL
         WHERE resource_id = $1`,
        [revoked.receipt.entity_id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("preserves submitted grant bindings across a C7 through C4 down/up cycle", async () => {
    const created = await createReady(individual("c4-pg-create-migration-cycle-0001"));
    await proposals.submit(
      created.receipt.entity_id,
      {
        expected_version: 1,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      individual("c4-pg-submit-migration-cycle-0001"),
    );
    const before = await proposals.getScoped(
      individual("c4-pg-read-migration-cycle-before-0001"),
      created.receipt.entity_id,
    );
    if (!before?.tracking_code) throw new Error("Expected the first submitted tracking code.");

    expect((await runMigrations(database, "down")).applied).toEqual(["0028_d8_d9_decision_case"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0027_d6_review_scoring"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0026_d5_review_coi"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0025_d4_review_assignments"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0024_d3_open_evaluation"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0023_d2_rubric_authoring"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0022_d1_review_foundation"]);
    expect((await runMigrations(database, "down")).applied).toEqual([
      "0021_c6_offer_deadline_single_clock",
    ]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0020_c8_notifications"]);
    expect((await runMigrations(database, "down")).applied).toEqual(["0019_c7_solver_activation"]);
    expect((await runMigrations(database, "down")).applied).toEqual([
      "0018_c6_opportunities_direct_offers",
    ]);
    expect((await runMigrations(database, "down")).applied).toEqual([
      "0017_c5_proposal_clarification_revision",
    ]);
    expect((await runMigrations(database, "down")).applied).toEqual([
      "0016_c4_proposal_submission",
    ]);
    expect((await runMigrations(database, "up")).applied).toEqual([
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
    ]);

    const restored = await database.query(
      `SELECT grant_row.proposal_version_id, proposal.current_version_id
       FROM access_grant AS grant_row
       JOIN proposal ON proposal.id = grant_row.resource_id
       WHERE grant_row.resource_id = $1`,
      [created.receipt.entity_id],
    );
    expect(restored.rows[0]).toEqual({
      proposal_version_id: before.current_version_id,
      current_version_id: before.current_version_id,
    });
    await expect(
      proposals.getForOrganization(organizationScope, created.receipt.entity_id),
    ).resolves.toMatchObject({ id: created.receipt.entity_id });

    const second = await createReady(teamOwner("c4-pg-create-after-migration-cycle-0001"));
    await proposals.submit(
      second.receipt.entity_id,
      {
        expected_version: 1,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      teamOwner("c4-pg-submit-after-migration-cycle-0001"),
    );
    const after = await proposals.getScoped(
      teamOwner("c4-pg-read-after-migration-cycle-0001"),
      second.receipt.entity_id,
    );
    expect(after?.tracking_code).not.toBe(before.tracking_code);
    expect(Number(after?.tracking_code?.split("-").at(-1))).toBeGreaterThan(
      Number(before.tracking_code.split("-").at(-1)),
    );
  });

  it("rolls back submission, lock, grant, receipt, audit, outbox, and replay together", async () => {
    const created = await createReady(individual("c4-pg-create-rollback-0001"));
    const rollbackUnitOfWork = new PostgresUnitOfWork(database, () => {
      throw new Error("synthetic C4 commit failure");
    });
    const rollbackIds = new MonotonicIdFactory();
    const rollbackTeams = new PostgresTeamAdapter(rollbackUnitOfWork, clock, rollbackIds);
    const rollbackProposals = new PostgresProposalAdapter(
      rollbackUnitOfWork,
      rollbackTeams,
      clock,
      rollbackIds,
    );
    await expect(
      rollbackProposals.submit(
        created.receipt.entity_id,
        {
          expected_version: 1,
          accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
        },
        individual("c4-pg-submit-rollback-0001"),
      ),
    ).rejects.toThrow("synthetic C4 commit failure");
    const counts = await database.query(
      `SELECT proposal.state, proposal.lock_version,
              (SELECT count(*) FROM proposal_version WHERE proposal_id = proposal.id) AS versions,
              (SELECT count(*) FROM access_grant WHERE resource_id = proposal.id) AS grants,
              (SELECT count(*) FROM audit_event
                WHERE target_id = proposal.id AND action = 'proposal.submitted') AS audits,
              (SELECT count(*) FROM outbox_event
                WHERE aggregate_id = proposal.id AND event_type = 'proposal.submitted') AS outbox,
              (SELECT count(*) FROM idempotency_key
                WHERE idempotency_key = 'c4-pg-submit-rollback-0001') AS idempotency
       FROM proposal WHERE proposal.id = $1`,
      [created.receipt.entity_id],
    );
    expect(counts.rows[0]).toEqual({
      state: "draft",
      lock_version: "1",
      versions: "1",
      grants: "0",
      audits: "0",
      outbox: "0",
      idempotency: "0",
    });
  });
});

describe("C5 PostgreSQL proposal clarification and revision", () => {
  afterEach(async () => {
    // C5's down migration intentionally refuses to discard immutable workflow
    // evidence. Clear this describe's synthetic aggregates so the global
    // migration-based reset can still exercise every down migration.
    await database.query(
      "TRUNCATE evaluation_proposal, challenge_evaluation, coi_declaration, review_assignment, proposal_clarification, proposal_revision_request, access_grant, proposal_version, proposal",
    );
  });

  async function createSubmitted(key: string) {
    const created = await proposals.create(
      { expected_version: 0, challenge_id: challengeId, draft: readyProposalDraft() },
      individual(`${key}-create`),
    );
    await proposals.submit(
      created.receipt.entity_id,
      {
        expected_version: 1,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      individual(`${key}-submit`),
    );
    return created.receipt.entity_id;
  }

  it("lists only the owning workspace's proposals without their content", async () => {
    const proposalId = await createSubmitted("c9-pg-list-0001");
    const listed = await proposals.listScoped(individual("c9-pg-list-scope"));
    const row = listed.items.find((item) => item.id === proposalId);
    expect(row).toBeDefined();
    // A list is for finding a record, not for bulk-reading drafts.
    expect(row).not.toHaveProperty("content");
    expect(row).not.toHaveProperty("versions");
    expect(row?.state).toBe("submitted");

    // A different workspace in the same tenant must not see it.
    const foreign = { ...individual("c9-pg-list-foreign"), workspaceId: teamWorkspaceId };
    const foreignList = await proposals.listScoped(foreign);
    expect(foreignList.items.some((item) => item.id === proposalId)).toBe(false);
  });

  it("hides the list from a role that cannot open the records", async () => {
    // The proposal must live in the team workspace, or the viewer sees an
    // empty list from workspace scoping alone and the permission gate is
    // never exercised.
    const created = await proposals.create(
      { expected_version: 0, challenge_id: challengeId, draft: readyProposalDraft() },
      teamOwner("c9-pg-list-viewer-create"),
    );
    const ownerList = await proposals.listScoped(teamOwner("c9-pg-list-viewer-owner"));
    expect(ownerList.items.some((item) => item.id === created.receipt.entity_id)).toBe(true);

    // A viewer who is refused `getScoped` must not be able to enumerate the
    // same proposal's state, tracking code, and readiness through the list.
    const viewerList = await proposals.listScoped(teamViewer("c9-pg-list-viewer-scope"));
    expect(viewerList.items).toHaveLength(0);
  });

  it("records an ineligible decision as a terminal receipt", async () => {
    // The ineligible branch was never exercised: it passed an empty
    // `next_actions`, which `mutation_receipt_next_actions_check` rejects, so
    // every rejection failed with a database error instead of a decision.
    const proposalId = await createSubmitted("c5-pg-ineligible-0001");
    await proposals.startEligibilityReview(
      proposalId,
      { expected_version: 2 },
      organizationCommand("c5-pg-ineligible-start-0001"),
    );
    const decided = await proposals.decideEligibility(
      proposalId,
      {
        expected_version: 3,
        decision: "ineligible",
        reason: "The workspace does not meet the published rule.",
      },
      organizationCommand("c5-pg-ineligible-decide-0001"),
    );
    expect(decided.receipt.next_actions).toEqual(["closed"]);

    const stored = await database.query<{ state: string; receipts: string; audits: string }>(
      `SELECT proposal.state,
              (SELECT count(*) FROM mutation_receipt
                WHERE entity_id = proposal.id AND entity_type = 'proposal') AS receipts,
              (SELECT count(*) FROM audit_event
                WHERE target_id = proposal.id AND action = 'proposal.ineligible') AS audits
         FROM proposal WHERE proposal.id = $1`,
      [proposalId],
    );
    expect(stored.rows[0]).toMatchObject({ state: "ineligible", audits: "1" });
  });

  it("persists controlled thread evidence and an exact-base resubmission atomically", async () => {
    const proposalId = await createSubmitted("c5-pg-flow-0001");
    await proposals.startEligibilityReview(
      proposalId,
      { expected_version: 2 },
      organizationCommand("c5-pg-start-eligibility-0001"),
    );
    await proposals.decideEligibility(
      proposalId,
      {
        expected_version: 3,
        decision: "eligible",
        reason: "Workspace and call requirements match.",
      },
      organizationCommand("c5-pg-decide-eligibility-0001"),
    );
    const requested = await proposals.requestClarification(
      proposalId,
      {
        expected_version: 4,
        question: "Explain the normalized pilot baseline.",
      },
      organizationCommand("c5-pg-request-clarification-0001"),
    );
    const requestReplay = await proposals.requestClarification(
      proposalId,
      {
        expected_version: 4,
        question: "Explain the normalized pilot baseline.",
      },
      organizationCommand("c5-pg-request-clarification-0001"),
    );
    expect(requestReplay).toEqual({
      ...requested,
      receipt: { ...requested.receipt, idempotent: true },
    });

    let current = await proposals.getScoped(individual("c5-pg-read-0001"), proposalId);
    const clarificationId = current!.clarifications[0]!.id;
    const submittedClarification = await proposals.submitClarification(
      proposalId,
      {
        expected_version: 5,
        clarification_id: clarificationId,
        response: "The preceding normalized 30-day meter average is the baseline.",
      },
      individual("c5-pg-submit-clarification-0001"),
    );
    expect(submittedClarification.entityVersion).toBe(6);
    await proposals.resolveClarification(
      proposalId,
      {
        expected_version: 6,
        clarification_id: clarificationId,
        resolution: "Explanation accepted.",
      },
      organizationCommand("c5-pg-resolve-clarification-0001"),
    );
    await proposals.requestRevision(
      proposalId,
      {
        expected_version: 7,
        scope: "Update the title while preserving the baseline explanation.",
        revision_deadline: "2026-09-10T09:00:00.000Z",
      },
      organizationCommand("c5-pg-request-revision-0001"),
    );

    current = await proposals.getScoped(individual("c5-pg-read-0002"), proposalId);
    const revisionRequest = current!.revision_requests[0]!;
    const originalLockedVersionId = revisionRequest.base_version_id;
    await proposals.startRevision(
      proposalId,
      { expected_version: 8, revision_request_id: revisionRequest.id },
      individual("c5-pg-start-revision-0001"),
    );
    await proposals.patch(
      proposalId,
      {
        expected_version: 9,
        patch: { title: "Authoritative optimized energy monitoring proposal" },
      },
      individual("c5-pg-edit-revision-0001"),
    );
    const resubmitted = await proposals.resubmit(
      proposalId,
      {
        expected_version: 10,
        revision_request_id: revisionRequest.id,
        accepted_challenge_version_id: parsePrefixedId("chv_synthetic_alpha_v1", "chv"),
      },
      individual("c5-pg-resubmit-0001"),
    );
    expect(resubmitted).toMatchObject({
      entityVersion: 11,
      receipt: { next_actions: ["await_review"] },
    });

    current = await proposals.getScoped(individual("c5-pg-read-0003"), proposalId);
    expect(current).toMatchObject({ state: "resubmitted", version: 11 });
    expect(current!.versions.map(({ version_number }) => version_number)).toEqual([1, 2, 3, 4, 5]);
    expect(current!.versions.at(-1)).toMatchObject({
      base_version_id: current!.versions.at(-2)!.id,
      accepted_challenge_version_id: "chv_synthetic_alpha_v1",
      changed_fields: ["title"],
      locked: true,
    });
    expect(current!.revision_requests[0]).toMatchObject({
      state: "resubmitted",
      base_version_id: originalLockedVersionId,
      resubmitted_version_id: current!.current_version_id,
    });
    expect(current!.clarifications[0]).toMatchObject({ state: "resolved" });

    const organization = await proposals.getForOrganization(organizationScope, proposalId);
    expect(organization).toMatchObject({
      state: "resubmitted",
      content: { title: "Authoritative optimized energy monitoring proposal" },
      submitted_version: { id: current!.current_version_id, changed_fields: ["title"] },
    });
    const evidence = await database.query(
      `SELECT
         (SELECT count(*) FROM proposal_clarification WHERE proposal_id = $1) AS clarifications,
         (SELECT count(*) FROM proposal_revision_request WHERE proposal_id = $1) AS revisions,
         (SELECT count(*) FROM access_grant WHERE resource_id = $1 AND state = 'active') AS active_grants,
         (SELECT count(*) FROM access_grant WHERE resource_id = $1 AND state = 'revoked') AS revoked_grants,
         (SELECT count(*) FROM outbox_event
           WHERE aggregate_id = $1 AND event_type LIKE 'proposal.%') AS outbox`,
      [proposalId],
    );
    expect(evidence.rows[0]).toEqual({
      clarifications: "1",
      revisions: "1",
      active_grants: "1",
      revoked_grants: "1",
      outbox: "11",
    });
    await expect(
      database.query("DELETE FROM proposal_clarification WHERE id = $1", [clarificationId]),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("denies cross-organization commands and leaves failed transitions without evidence", async () => {
    const proposalId = await createSubmitted("c5-pg-negative-0001");
    await expect(
      proposals.startEligibilityReview(
        proposalId,
        { expected_version: 2 },
        {
          tenantId: parseTenantId("ten_solver_alpha"),
          workspaceId: individualWorkspaceId,
          role: "individual",
          actorUserId: parseUserId("usr_solver_alpha"),
          idempotencyKey: "c5-pg-wrong-org-0001",
          correlationId: parseCorrelationId("cor_c5-pg-wrong-org-0001"),
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      proposals.requestRevision(
        proposalId,
        {
          expected_version: 2,
          scope: "Expired request must not persist.",
          revision_deadline: "2026-09-03T08:59:59.000Z",
        },
        organizationCommand("c5-pg-invalid-state-revision-0001"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await database.query(
      `UPDATE access_grant
       SET state = 'revoked', revoked_at = clock_timestamp(),
           revoked_by_user_id = 'usr_owner_alpha', revocation_reason = 'Synthetic C5 revocation'
       WHERE resource_id = $1 AND state = 'active'`,
      [proposalId],
    );
    await expect(
      proposals.startEligibilityReview(
        proposalId,
        { expected_version: 2 },
        organizationCommand("c5-pg-revoked-grant-0001"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const counts = await database.query(
      `SELECT
         (SELECT state FROM proposal WHERE id = $1) AS state,
         (SELECT count(*) FROM proposal_revision_request WHERE proposal_id = $1) AS revisions`,
      [proposalId],
    );
    expect(counts.rows[0]).toEqual({ state: "submitted", revisions: "0" });
  });
});
