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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import type { ProposalCommandContext, ProposalScope } from "../src/ports.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_c3_proposals_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

const clock = { now: () => new Date("2026-09-03T09:00:00.000Z") };
const challengeId = parseChallengeId("chl_synthetic_alpha");
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
      ARRAY['individual', 'expert-team']::text[], true, true, true,
      '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    )
    ON CONFLICT (challenge_version_id) DO NOTHING
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
      'undecided', NULL, 'IRR', 'public', true, true, true,
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
