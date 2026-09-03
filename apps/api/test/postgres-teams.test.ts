import {
  parseCorrelationId,
  parseMembershipId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type WorkspaceId,
} from "@rahhal/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_c2_teams_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

let admin: Client;
let database: Pool;
let teams: PostgresTeamAdapter;
// Rows here take the database's `clock_timestamp()`, so a frozen literal date
// puts every `updated_at` this adapter writes behind its own `created_at` the
// moment the wall clock passes it, and `membership_check1` rejects the write.
// The adapter clock has to track the same real time the database does.
const clock = { now: () => new Date() };

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

const context = (
  workspaceId: WorkspaceId,
  key: string,
  options: {
    readonly actorUserId?:
      | "usr_solver_alpha"
      | "usr_team_admin_alpha"
      | "usr_team_candidate_alpha"
      | "usr_team_unverified_alpha";
    readonly role?: "team:owner" | "team:admin" | "team:viewer" | "individual";
  } = {},
) => ({
  tenantId: parseTenantId("ten_solver_alpha"),
  workspaceId,
  actorUserId: parseUserId(options.actorUserId ?? "usr_solver_alpha"),
  role: options.role ?? ("team:owner" as const),
  idempotencyKey: key,
  correlationId: parseCorrelationId(`cor_${key.replaceAll(/[^A-Za-z0-9_-]/g, "_")}`),
});

async function createTeam(key: string): Promise<WorkspaceId> {
  const created = await teams.create(
    { expected_version: 0, name: `Team ${key}`, team_kind: "expert-team", join_mode: "request" },
    context(parseWorkspaceId("wsp_individual_alpha"), key, { role: "individual" }),
  );
  return created.receipt.entity_id;
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 8 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  teams = new PostgresTeamAdapter(
    new PostgresUnitOfWork(database),
    clock,
    new MonotonicIdFactory(),
  );
}, 60_000);

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
  await admin.end();
});

describe("C2 PostgreSQL team lifecycle", () => {
  it("creates one team, owner membership, profile, verification, and atomic evidence", async () => {
    const workspaceId = await createTeam("c2-pg-create-0001");
    const replay = await teams.create(
      {
        expected_version: 0,
        name: "Team c2-pg-create-0001",
        team_kind: "expert-team",
        join_mode: "request",
      },
      context(parseWorkspaceId("wsp_individual_alpha"), "c2-pg-create-0001", {
        role: "individual",
      }),
    );
    expect(replay.receipt).toMatchObject({ entity_id: workspaceId, idempotent: true });

    const resource = await teams.get(context(workspaceId, "c2-pg-read-create"));
    expect(resource).toMatchObject({
      workspace_id: workspaceId,
      owner_user_id: "usr_solver_alpha",
      status: "active",
      version: 1,
      members: [{ role: "team:owner", state: "active", version: 1 }],
    });
    const facts = await database.query(
      `
      SELECT
        (SELECT count(*) FROM solver_workspace_profile WHERE workspace_id = $1) AS profiles,
        (SELECT state FROM verification_record WHERE workspace_id = $1) AS verification,
        (SELECT count(*) FROM audit_event WHERE target_id = $1 AND action = 'team.created') AS audits,
        (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1 AND event_type = 'team.created') AS outbox,
        (SELECT count(*) FROM mutation_receipt WHERE entity_id = $1) AS receipts
    `,
      [workspaceId],
    );
    expect(facts.rows[0]).toEqual({
      profiles: "1",
      verification: "not_started",
      audits: "1",
      outbox: "1",
      receipts: "1",
    });
  });

  it("binds an invitation only after the recipient email is verified", async () => {
    await database.query(
      `INSERT INTO app_user (
         id, display_name, primary_email, email_verified, primary_phone,
         phone_verified, created_at, updated_at
       ) VALUES (
         'usr_team_unverified_alpha', 'Unverified Team Candidate',
         'team-unverified-alpha@synthetic.invalid', false, NULL, false,
         '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
       )`,
    );
    const workspaceId = await createTeam("c2-pg-verified-recipient-0001");
    const invitation = await teams.invite(
      {
        expected_version: 1,
        recipient_email: "team-unverified-alpha@synthetic.invalid",
        proposed_role: "team:viewer",
        scope: "Verified recipient test",
        message: "Welcome",
        commitment: "Two hours weekly",
        ip_notice: "Team IP terms apply",
      },
      context(workspaceId, "c2-pg-unverified-invite"),
    );
    expect(
      (
        await database.query(`SELECT recipient_user_id FROM team_invitation WHERE id = $1`, [
          invitation.receipt.entity_id,
        ])
      ).rows[0],
    ).toEqual({ recipient_user_id: null });
    await expect(
      teams.respondInvitation(
        invitation.receipt.entity_id,
        { expected_version: 1, decision: "accept" },
        context(workspaceId, "c2-pg-unverified-response", {
          actorUserId: "usr_team_unverified_alpha",
          role: "individual",
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.query(
      `UPDATE app_user SET email_verified = true, updated_at = $2 WHERE id = $1`,
      ["usr_team_unverified_alpha", clock.now().toISOString()],
    );
    await teams.respondInvitation(
      invitation.receipt.entity_id,
      { expected_version: 1, decision: "accept" },
      context(workspaceId, "c2-pg-verified-response", {
        actorUserId: "usr_team_unverified_alpha",
        role: "individual",
      }),
    );
    expect(
      (
        await database.query(
          `SELECT invitation.recipient_user_id, membership.state
           FROM team_invitation AS invitation
           JOIN membership ON membership.workspace_id = invitation.workspace_id
                          AND membership.user_id = invitation.recipient_user_id
           WHERE invitation.id = $1`,
          [invitation.receipt.entity_id],
        )
      ).rows[0],
    ).toEqual({ recipient_user_id: "usr_team_unverified_alpha", state: "active" });
  });

  it("enforces policy, recipient binding, request decisions, replay, and immediate removal", async () => {
    const workspaceId = await createTeam("c2-pg-lifecycle-0001");
    await expect(
      teams.updatePolicy(
        {
          expected_version: 1,
          reason: "Enable delegated invitations for this team.",
          policy: { proposalManagersCanInvite: true },
        },
        context(workspaceId, "c2-pg-viewer-policy", { role: "team:viewer" }),
      ),
    ).rejects.toMatchObject({ code: "NO_ACCESS" });

    const invitation = await teams.invite(
      {
        expected_version: 1,
        recipient_email: "team-candidate-alpha@synthetic.invalid",
        proposed_role: "team:contributor",
        scope: "Proposal collaboration",
        message: "Welcome",
        commitment: "Ten hours weekly",
        ip_notice: "Team IP terms apply",
      },
      context(workspaceId, "c2-pg-invite-0001"),
    );
    await expect(
      teams.respondInvitation(
        invitation.receipt.entity_id,
        { expected_version: 1, decision: "accept" },
        context(workspaceId, "c2-pg-wrong-recipient", {
          actorUserId: "usr_team_admin_alpha",
          role: "team:admin",
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await teams.respondInvitation(
      invitation.receipt.entity_id,
      { expected_version: 1, decision: "accept" },
      context(workspaceId, "c2-pg-accept-invite", {
        actorUserId: "usr_team_candidate_alpha",
        role: "individual",
      }),
    );
    const accepted = await database.query<{ id: string; lock_version: string }>(
      `SELECT id, lock_version FROM membership WHERE workspace_id = $1 AND user_id = 'usr_team_candidate_alpha'`,
      [workspaceId],
    );
    const candidateMembershipId = parseMembershipId(accepted.rows[0]!.id);
    await teams.removeMember(
      candidateMembershipId,
      { expected_version: Number(accepted.rows[0]!.lock_version), reason: "Collaboration ended" },
      context(workspaceId, "c2-pg-remove-invitee"),
    );
    expect(
      (await database.query("SELECT state FROM membership WHERE id = $1", [candidateMembershipId]))
        .rows[0],
    ).toEqual({ state: "removed" });

    const membershipRequest = await teams.requestMembership(
      workspaceId,
      {
        expected_version: 0,
        requested_role: "team:contributor",
        introduction: "Relevant operating experience",
        availability: "Ten hours weekly",
      },
      context(parseWorkspaceId("wsp_individual_alpha"), "c2-pg-request-0001", {
        actorUserId: "usr_team_candidate_alpha",
        role: "individual",
      }),
    );
    const decided = await teams.decideMembershipRequest(
      membershipRequest.receipt.entity_id,
      {
        expected_version: 1,
        decision: "accept",
        assigned_role: "team:viewer",
        reason: "Experience confirmed",
      },
      context(workspaceId, "c2-pg-decide-request"),
    );
    expect(decided.entityVersion).toBe(2);
    expect(
      (
        await database.query("SELECT role, state FROM membership WHERE id = $1", [
          candidateMembershipId,
        ])
      ).rows[0],
    ).toEqual({ role: "team:viewer", state: "active" });
    const decisionEvidence = await database.query(
      `SELECT
         (SELECT metadata ->> 'reason' FROM audit_event
          WHERE target_id = $1 AND action = 'team.membership-request.accepted') AS audit_reason,
         (SELECT payload ? 'reason' FROM outbox_event
          WHERE aggregate_id = $1 AND event_type = 'team.membership-request.accepted') AS outbox_has_reason`,
      [membershipRequest.receipt.entity_id],
    );
    expect(decisionEvidence.rows[0]).toEqual({
      audit_reason: "Experience confirmed",
      outbox_has_reason: false,
    });
  });

  it("serializes concurrent ownership transfer and removal under the team row lock", async () => {
    const workspaceId = await createTeam("c2-pg-row-lock-0001");
    await database.query(
      `INSERT INTO membership (
         id, tenant_id, workspace_id, workspace_kind, user_id, role, state, lock_version
       ) VALUES ('mem_c2_race_admin','ten_solver_alpha',$1,'team','usr_team_admin_alpha','team:admin','active',1)`,
      [workspaceId],
    );
    const target = parseMembershipId("mem_c2_race_admin");
    const results = await Promise.allSettled([
      teams.transferOwnership(
        {
          expected_version: 1,
          successor_membership_id: target,
          reason: "Concurrent ownership transfer",
        },
        context(workspaceId, "c2-pg-race-transfer"),
      ),
      teams.removeMember(
        target,
        { expected_version: 1, reason: "Concurrent removal" },
        context(workspaceId, "c2-pg-race-remove"),
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const ownerState = await database.query(
      `SELECT workspace.owner_user_id,
              count(membership.id) FILTER (
                WHERE membership.role = 'team:owner' AND membership.state = 'active'
              ) AS active_owner_count,
              min(membership.user_id) FILTER (
                WHERE membership.role = 'team:owner' AND membership.state = 'active'
              ) AS membership_owner
       FROM workspace
       JOIN membership ON membership.workspace_id = workspace.id
       WHERE workspace.id = $1
       GROUP BY workspace.id`,
      [workspaceId],
    );
    expect(ownerState.rows[0]).toMatchObject({
      active_owner_count: "1",
      membership_owner: ownerState.rows[0].owner_user_id,
    });
  });

  it("protects terminal team evidence, membership identity, and aggregate versions", async () => {
    const workspaceId = await createTeam("c2-pg-evidence-0001");
    const invitation = await teams.invite(
      {
        expected_version: 1,
        recipient_email: "team-candidate-alpha@synthetic.invalid",
        proposed_role: "team:contributor",
        scope: "Evidence-protection test",
        message: "Welcome",
        commitment: "Ten hours weekly",
        ip_notice: "Team IP terms apply",
      },
      context(workspaceId, "c2-pg-evidence-invite"),
    );
    await teams.respondInvitation(
      invitation.receipt.entity_id,
      { expected_version: 1, decision: "accept" },
      context(workspaceId, "c2-pg-evidence-accept", {
        actorUserId: "usr_team_candidate_alpha",
        role: "individual",
      }),
    );
    const acceptedMembership = await database.query<{ id: string }>(
      `SELECT id FROM membership
       WHERE workspace_id = $1 AND user_id = 'usr_team_candidate_alpha'`,
      [workspaceId],
    );

    const request = await teams.requestMembership(
      workspaceId,
      {
        expected_version: 0,
        requested_role: "team:viewer",
        introduction: "Evidence-protection request",
        availability: "Five hours weekly",
      },
      context(parseWorkspaceId("wsp_individual_alpha"), "c2-pg-evidence-request", {
        actorUserId: "usr_team_admin_alpha",
        role: "individual",
      }),
    );
    await teams.decideMembershipRequest(
      request.receipt.entity_id,
      {
        expected_version: 1,
        decision: "reject",
        reason: "The team is not recruiting this role",
      },
      context(workspaceId, "c2-pg-evidence-reject"),
    );

    await expect(
      database.query(
        `UPDATE team_invitation
         SET state = 'declined', decision_reason = 'rewrite', lock_version = lock_version + 1
         WHERE id = $1`,
        [invitation.receipt.entity_id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query(`DELETE FROM team_invitation WHERE id = $1`, [invitation.receipt.entity_id]),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      database.query(`UPDATE membership SET state = 'suspended' WHERE id = $1`, [
        acceptedMembership.rows[0]!.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.query(`DELETE FROM membership WHERE id = $1`, [acceptedMembership.rows[0]!.id]),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      database.query(
        `UPDATE team_membership_request
         SET decision_reason = 'rewrite', lock_version = lock_version + 1
         WHERE id = $1`,
        [request.receipt.entity_id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query(`DELETE FROM team_membership_request WHERE id = $1`, [
        request.receipt.entity_id,
      ]),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      database.query(`UPDATE team_workspace SET join_mode = 'open' WHERE workspace_id = $1`, [
        workspaceId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.query(`DELETE FROM team_workspace WHERE workspace_id = $1`, [workspaceId]),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("atomically transfers ownership, rejects owner removal, and archives authority", async () => {
    const workspaceId = await createTeam("c2-pg-transfer-0001");
    await database.query(
      `INSERT INTO membership (
         id, tenant_id, workspace_id, workspace_kind, user_id, role, state, lock_version
       ) VALUES ('mem_c2_successor','ten_solver_alpha',$1,'team','usr_team_admin_alpha','team:admin','active',1)`,
      [workspaceId],
    );
    const current = await teams.get(context(workspaceId, "c2-pg-transfer-read"));
    const owner = current!.members.find((member) => member.role === "team:owner")!;
    await expect(
      teams.removeMember(
        owner.id,
        { expected_version: owner.version, reason: "Must fail" },
        context(workspaceId, "c2-pg-remove-owner"),
      ),
    ).rejects.toMatchObject({ code: "NO_ACCESS" });

    const transferred = await teams.transferOwnership(
      {
        expected_version: current!.version,
        successor_membership_id: parseMembershipId("mem_c2_successor"),
        reason: "Planned succession",
      },
      context(workspaceId, "c2-pg-transfer-owner"),
    );
    const ownerState = await database.query(
      `SELECT workspace.owner_user_id,
              (SELECT user_id FROM membership WHERE workspace_id = workspace.id
               AND role = 'team:owner' AND state = 'active') AS membership_owner
       FROM workspace WHERE id = $1`,
      [workspaceId],
    );
    expect(ownerState.rows[0]).toEqual({
      owner_user_id: "usr_team_admin_alpha",
      membership_owner: "usr_team_admin_alpha",
    });

    await teams.archive(
      { expected_version: transferred.entityVersion, reason: "Team work completed" },
      context(workspaceId, "c2-pg-archive", {
        actorUserId: "usr_team_admin_alpha",
        role: "team:owner",
      }),
    );
    expect(
      await teams.get(
        context(workspaceId, "c2-pg-archived-read", {
          actorUserId: "usr_team_admin_alpha",
          role: "team:owner",
        }),
      ),
    ).toBeNull();

    await expect(
      database.query(
        `UPDATE membership SET state = 'removed', lock_version = lock_version + 1
         WHERE workspace_id = $1 AND role = 'team:owner'`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("protects team membership evidence without silencing other workspace kinds", async () => {
    const workspaceId = await createTeam("c2-pg-delete-guard-0001");
    await expect(
      database.query(`DELETE FROM membership WHERE workspace_id = $1`, [workspaceId]),
    ).rejects.toMatchObject({ code: "55000" });
    expect(
      (await database.query(`SELECT 1 FROM membership WHERE workspace_id = $1`, [workspaceId]))
        .rowCount,
    ).toBe(1);

    // C2's guard covers every membership row, so a non-team delete must still
    // delete. A BEFORE DELETE trigger returning NULL cancels the statement
    // silently: `DELETE 0` with the row still present and no error raised.
    await database.query(
      `INSERT INTO membership (
         id, tenant_id, workspace_id, workspace_kind, user_id, role, state, lock_version
       ) VALUES ('mem_c2_org_scratch','ten_org_alpha','wsp_org_alpha','org',
                 'usr_team_admin_alpha','org:member','active',1)`,
    );
    const removed = await database.query(`DELETE FROM membership WHERE id = 'mem_c2_org_scratch'`);
    expect(removed.rowCount).toBe(1);
    expect(
      (await database.query(`SELECT 1 FROM membership WHERE id = 'mem_c2_org_scratch'`)).rowCount,
    ).toBe(0);
  });
});
