import { parseCorrelationId, parseTenantId, parseUserId, parseWorkspaceId } from "@rahhal/domain";
import {
  NotificationProjector,
  OutboxConsumer,
  PostgresDeliveryLedger,
  PostgresOutboxSource,
} from "@rahhal/worker";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresNotificationAdapter } from "../src/postgres/notifications.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import type { WorkspaceCommandContext, WorkspaceScope } from "../src/ports.js";
import { testDatabaseAdminUrl } from "./support/database.js";

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

const adminUrl = testDatabaseAdminUrl();
const databaseName = `rahhal_c8_notifications_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

const clock = { now: () => new Date() };
const ids = new MonotonicIdFactory();

let admin: Client;
let database: Pool;
let notifications: PostgresNotificationAdapter;
let consumer: OutboxConsumer<PoolClient>;

const orgScope: WorkspaceScope = {
  tenantId: parseTenantId("ten_org_alpha"),
  workspaceId: parseWorkspaceId("wsp_org_alpha"),
  actorUserId: parseUserId("usr_owner_alpha"),
  role: "org:owner",
};

const command = (key: string): WorkspaceCommandContext => ({
  ...orgScope,
  idempotencyKey: key,
  correlationId: parseCorrelationId(`cor_${key.replaceAll(/[^A-Za-z0-9_-]/g, "_")}`),
});

function quoted(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

/** Emits the outbox row a C4 submission would write, without the aggregate command. */
async function emitProposalSubmitted(
  eventId: string,
  proposalId = "prp_c8_fixture",
): Promise<void> {
  await database.query(
    `INSERT INTO outbox_event (
       id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
       aggregate_id, payload, dedupe_key, occurred_at, available_at
     ) VALUES ($1,'ten_solver_alpha','cor_c8_fixture','proposal.submitted',1,'proposal',
       $2, jsonb_build_object('entity_version', 2), $3, clock_timestamp(), clock_timestamp())`,
    [eventId, proposalId, `proposal.submitted:${eventId}`],
  );
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoted(databaseName)}`);
  database = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
  const unitOfWork = new PostgresUnitOfWork(database);
  notifications = new PostgresNotificationAdapter(unitOfWork, clock, ids);
  consumer = new OutboxConsumer<PoolClient>(
    new PostgresOutboxSource(database, clock),
    new PostgresDeliveryLedger(database),
    new NotificationProjector(ids),
    clock,
  );
}, 60_000);

beforeEach(async () => {
  while ((await runMigrations(database, "down")).applied.length > 0) {
    // Start every behavior from a clean database.
  }
  await runMigrations(database, "up");
  await seedSyntheticData(database);
});

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quoted(databaseName)}`);
  await admin.end();
});

describe("C8 PostgreSQL notification projection and read model", () => {
  it("projects one notification per recipient and stays exactly-once on redelivery", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_submitted_0001");

    // The synthetic seed emits its own outbox rows, so the assertion is about
    // this event's projection rather than the whole claim batch.
    const first = await consumer.pollOnce();
    expect(first.delivered).toBeGreaterThanOrEqual(1);

    const organizationMembers = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM membership WHERE workspace_id = 'wsp_org_alpha' AND state = 'active'",
    );
    const projected = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM notification WHERE source_event_id = 'evt_c8_submitted_0001'",
    );
    expect(projected.rows[0]?.count).toBe(organizationMembers.rows[0]?.count);

    // Redelivery: the row is unpublished again, so the consumer reclaims it.
    await database.query("UPDATE outbox_event SET published_at = NULL, locked_at = NULL");
    const second = await consumer.pollOnce();
    expect(second.duplicates).toBeGreaterThanOrEqual(1);
    expect(second.delivered).toBe(0);
    const afterRedelivery = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM notification WHERE source_event_id = 'evt_c8_submitted_0001'",
    );
    expect(afterRedelivery.rows[0]?.count).toBe(projected.rows[0]?.count);
  });

  it("carries no aggregate content into the projection", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_content_0001");
    await consumer.pollOnce();
    const columns = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'notification'`,
    );
    const names = columns.rows.map((row) => row.column_name);
    for (const forbidden of ["content", "title", "body", "email", "phone", "message", "reason"]) {
      expect(names).not.toContain(forbidden);
    }
    const row = await database.query(
      "SELECT kind, subject_type, subject_id FROM notification WHERE source_event_id = 'evt_c8_content_0001' LIMIT 1",
    );
    expect(row.rows[0]).toMatchObject({
      kind: "proposal.submitted",
      subject_type: "proposal",
      subject_id: "prp_c8_fixture",
    });
  });

  it("scopes reads to the recipient and marks read idempotently", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_read_0001");
    await consumer.pollOnce();

    const listed = await notifications.list(orgScope, {});
    expect(listed.items.length).toBeGreaterThan(0);
    expect(listed.unread_count).toBe(listed.items.length);
    expect(listed.items.every((item) => item.user_id === orgScope.actorUserId)).toBe(true);

    const target = listed.items[0]!;
    const receipt = await notifications.markRead(target.id, command("c8-read-0001"));
    const replay = await notifications.markRead(target.id, command("c8-read-0001"));
    expect(replay.receipt).toEqual({ ...receipt.receipt, idempotent: true });

    const summary = await notifications.summary(orgScope);
    expect(summary.unread_count).toBe(listed.unread_count - 1);

    // A foreign recipient's notification is unreachable rather than forbidden.
    const foreign: WorkspaceCommandContext = {
      ...orgScope,
      actorUserId: parseUserId("usr_publisher_alpha"),
      idempotencyKey: "c8-foreign-0001",
      correlationId: parseCorrelationId("cor_c8_foreign_0001"),
    };
    await expect(notifications.markRead(target.id, foreign)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("marks every unread notification read and survives a restart", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_all_0001");
    await consumer.pollOnce();

    await notifications.markAllRead(command("c8-read-all-0001"));
    expect((await notifications.summary(orgScope)).unread_count).toBe(0);

    // A fresh adapter stands in for an API restart: read state is durable, not
    // process memory, so the count does not reappear.
    const restarted = new PostgresNotificationAdapter(new PostgresUnitOfWork(database), clock, ids);
    expect((await restarted.summary(orgScope)).unread_count).toBe(0);
    const readRow = await database.query<{ read_at: Date | null }>(
      `SELECT read_at FROM notification
       WHERE source_event_id = 'evt_c8_all_0001' AND user_id = $1`,
      [orgScope.actorUserId],
    );
    expect(readRow.rows[0]?.read_at).not.toBeNull();
  });

  it("keeps mark-all-read usable after the first time in a workspace", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_repeat_0001");
    await consumer.pollOnce();
    await notifications.markAllRead(command("c8-repeat-read-all-0001"));

    // `mutation_receipt` is unique on (entity_type, entity_id, entity_version)
    // and this command is addressed at the workspace, so a constant version
    // made every later mark-all-read collide -- the button worked exactly once
    // per workspace and then returned an unretryable storage error forever.
    await emitProposalSubmitted("evt_c8_repeat_0002");
    await consumer.pollOnce();
    expect((await notifications.summary(orgScope)).unread_count).toBe(1);
    const second = await notifications.markAllRead(command("c8-repeat-read-all-0002"));
    expect(second.entityVersion).toBe(2);
    expect((await notifications.summary(orgScope)).unread_count).toBe(0);

    // A third with nothing left to mark still succeeds: the command is
    // idempotent in effect, not merely on a repeated idempotency key.
    const third = await notifications.markAllRead(command("c8-repeat-read-all-0003"));
    expect(third.entityVersion).toBe(3);

    const receipts = await database.query<{ entity_version: number }>(
      `SELECT entity_version FROM mutation_receipt
       WHERE entity_type = 'workspace' AND entity_id = $1 ORDER BY entity_version`,
      [orgScope.workspaceId],
    );
    expect(receipts.rows.map((row) => Number(row.entity_version))).toEqual([1, 2, 3]);
  });

  it("bounds a page and keeps the cursor stable", async () => {
    await seedProposalRows();
    for (let index = 0; index < 5; index += 1) {
      await emitProposalSubmitted(`evt_c8_page_000${index}`);
    }
    await consumer.pollOnce();

    const page = await notifications.list(orgScope, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).toBeTypeOf("string");
    const next = await notifications.list(orgScope, { limit: 2, cursor: page.next_cursor! });
    expect(next.items).toHaveLength(2);
    const seen = new Set([...page.items, ...next.items].map((item) => item.id));
    expect(seen.size).toBe(4);
  });

  it("tells an invited solver they were invited, in the workspace they read", async () => {
    // `team.invitation.sent` was routed to a membership in the *team's*
    // workspace, which an invitee by definition does not hold yet, so the join
    // matched nothing and every invitation notified nobody. A person found out
    // they had been invited only by opening the team page unprompted.
    await seedInvitation("tiv_c8_pending", "usr_team_candidate_alpha");
    await emitInvitationSent("evt_c8_invite_0001", "tiv_c8_pending");
    await consumer.pollOnce();

    const projected = await database.query<{
      workspace_id: string;
      user_id: string;
      kind: string;
      subject_type: string;
      subject_id: string;
    }>(
      `SELECT workspace_id, user_id, kind, subject_type, subject_id FROM notification
       WHERE source_event_id = 'evt_c8_invite_0001'`,
    );
    expect(projected.rows).toEqual([
      {
        // Their own workspace, because the team's is not theirs to read yet.
        workspace_id: "wsp_c8_candidate",
        user_id: "usr_team_candidate_alpha",
        kind: "team.invitation.sent",
        subject_type: "team",
        // ...while the subject still names the team the invitation is about.
        subject_id: "wsp_team_alpha",
      },
    ]);

    // Nobody else is told: an invitation is addressed to one person, and the
    // team's own members learn about it from the team's invitation list.
    const scope: WorkspaceScope = {
      tenantId: parseTenantId("ten_solver_alpha"),
      workspaceId: parseWorkspaceId("wsp_c8_candidate"),
      actorUserId: parseUserId("usr_team_candidate_alpha"),
      role: "individual",
    };
    expect((await notifications.summary(scope)).unread_count).toBe(1);
  });

  it("tells a requester their membership request was decided, accepted or not", async () => {
    // The decision was routed through a membership in the *team's* workspace,
    // which only an accepted requester ends up holding. A rejection therefore
    // reached nobody: the one person waiting on the answer was the one person
    // never told, and nothing in the product said so.
    await seedMembershipRequest("tmr_c8_rejected", "rejected");
    await emitTeamEvent(
      "evt_c8_reject_0001",
      "team.membership-request.rejected",
      "team_membership_request",
      "tmr_c8_rejected",
    );
    await consumer.pollOnce();

    const projected = await database.query<{
      workspace_id: string;
      user_id: string;
      kind: string;
      subject_id: string;
    }>(
      `SELECT workspace_id, user_id, kind, subject_id FROM notification
       WHERE source_event_id = 'evt_c8_reject_0001'`,
    );
    expect(projected.rows).toEqual([
      {
        // Their own workspace, because a rejected requester holds no other.
        workspace_id: "wsp_c8_candidate",
        user_id: "usr_team_candidate_alpha",
        kind: "team.membership-request.rejected",
        // ...while the subject still names the team they asked to join.
        subject_id: "wsp_team_alpha",
      },
    ]);
  });

  it("notifies nobody when the invitation names a contact that is not a user", async () => {
    // C8 reads no contact details, so an invitation to an email address that
    // has never activated reaches that person out of band, not here.
    await seedInvitation("tiv_c8_contact", null);
    await emitInvitationSent("evt_c8_invite_0002", "tiv_c8_contact");
    await consumer.pollOnce();
    const projected = await database.query<{ count: string }>(
      "SELECT count(*) AS count FROM notification WHERE source_event_id = 'evt_c8_invite_0002'",
    );
    expect(projected.rows[0]?.count).toBe("0");
  });

  it("refuses to unread a notification once it is read", async () => {
    await seedProposalRows();
    await emitProposalSubmitted("evt_c8_immutable_0001");
    await consumer.pollOnce();
    await notifications.markAllRead(command("c8-immutable-0001"));
    await expect(
      database.query("UPDATE notification SET read_at = NULL WHERE read_at IS NOT NULL"),
    ).rejects.toMatchObject({ code: "55000" });
  });
});

async function seedProposalRows(): Promise<void> {
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_c8_technical', 'ten_org_alpha', 'wsp_org_alpha', 'chl_synthetic_alpha',
       'chv_synthetic_alpha_v1', 'technical', 'approved', 'Synthetic approval',
       'usr_approver_alpha', 'org:approver_technical', clock_timestamp()),
      ('cap_c8_legal', 'ten_org_alpha', 'wsp_org_alpha', 'chl_synthetic_alpha',
       'chv_synthetic_alpha_v1', 'legal', 'approved', 'Synthetic approval',
       'usr_platform_legal', 'platform:legal', clock_timestamp()),
      ('cap_c8_finance', 'ten_org_alpha', 'wsp_org_alpha', 'chl_synthetic_alpha',
       'chv_synthetic_alpha_v1', 'finance', 'approved', 'Synthetic approval',
       'usr_platform_finance', 'platform:finance', clock_timestamp()),
      ('cap_c8_quality', 'ten_org_alpha', 'wsp_org_alpha', 'chl_synthetic_alpha',
       'chv_synthetic_alpha_v1', 'quality', 'approved', 'Synthetic approval',
       'usr_platform_ops', 'platform:ops', clock_timestamp())
  `);
  await database.query(`
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_c8_synthetic', 'ten_org_alpha', 'wsp_org_alpha', 'chl_synthetic_alpha',
      'chv_synthetic_alpha_v1', ARRAY['individual', 'expert-team']::text[],
      false, false, false, '2099-01-01T00:00:00Z', 'open', clock_timestamp()
    )
    ON CONFLICT (challenge_version_id) DO NOTHING
  `);
  await database.query(`
    UPDATE challenge SET stage = 'published', published_version_id = 'chv_synthetic_alpha_v1',
      publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z'
    WHERE id = 'chl_synthetic_alpha'
  `);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(
      `INSERT INTO proposal (
         id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
         current_version_id, state, assigned_membership_ids, lock_version,
         created_by_user_id, submitted_at
       ) VALUES ('prp_c8_fixture','ten_solver_alpha','wsp_team_alpha','team',
         'chl_synthetic_alpha','prv_c8_fixture','submitted',
         ARRAY['mem_team_owner_alpha']::text[], 1, 'usr_solver_alpha', clock_timestamp())`,
    );
    await client.query(
      `INSERT INTO proposal_version (
         id, proposal_id, challenge_id, version_number, actor_user_id, content,
         content_hash, changed_fields, created_at
       ) VALUES ('prv_c8_fixture','prp_c8_fixture','chl_synthetic_alpha',1,
         'usr_solver_alpha',$1::jsonb,$2,'{}'::text[],clock_timestamp())`,
      [proposalContent(), "a".repeat(64)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** The team workspace's invitation to a solver who holds only a personal workspace. */
/** The personal workspace an invitee or requester reads their notifications in. */
async function seedCandidateWorkspace(): Promise<void> {
  await database.query(`
    INSERT INTO workspace (id, tenant_id, tenant_kind, kind, name, owner_user_id, team_kind,
      created_at, updated_at)
    VALUES ('wsp_c8_candidate', 'ten_solver_alpha', 'solver', 'individual',
      'Synthetic Candidate Workspace', 'usr_team_candidate_alpha', NULL,
      clock_timestamp(), clock_timestamp())
    ON CONFLICT (id) DO NOTHING
  `);
  await database.query(`
    INSERT INTO membership (id, tenant_id, workspace_id, workspace_kind, user_id, role, state,
      created_at, updated_at)
    VALUES ('mem_c8_candidate', 'ten_solver_alpha', 'wsp_c8_candidate', 'individual',
      'usr_team_candidate_alpha', 'individual', 'active', clock_timestamp(), clock_timestamp())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function seedInvitation(invitationId: string, recipientUserId: string | null): Promise<void> {
  await seedCandidateWorkspace();
  await database.query(
    `INSERT INTO team_invitation (
       id, tenant_id, workspace_id, inviter_user_id, recipient_user_id, recipient_email,
       proposed_role, scope, commitment, ip_notice, state, lock_version, expires_at,
       created_at, updated_at
     ) VALUES ($1, 'ten_solver_alpha', 'wsp_team_alpha', 'usr_solver_alpha', $2,
       'team-candidate-alpha@synthetic.invalid', 'team:contributor',
       'همکاری در پیشنهادهای این تیم', 'حداقل ده ساعت در هفته',
       'مالکیت فکری تابع قرارداد تیم است.', 'sent', 1,
       clock_timestamp() + interval '14 days', clock_timestamp(), clock_timestamp())`,
    [invitationId, recipientUserId],
  );
}

/** Emits the outbox row a C2 invitation would write, without the aggregate command. */
async function emitInvitationSent(eventId: string, invitationId: string): Promise<void> {
  await database.query(
    `INSERT INTO outbox_event (
       id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
       aggregate_id, payload, dedupe_key, occurred_at, available_at
     ) VALUES ($1,'ten_solver_alpha','cor_c8_invite','team.invitation.sent',1,'team_invitation',
       $2, jsonb_build_object('entity_version', 1), $3, clock_timestamp(), clock_timestamp())`,
    [eventId, invitationId, `team.invitation.sent:${eventId}`],
  );
}

/** A membership request from a solver who holds only a personal workspace. */
async function seedMembershipRequest(requestId: string, state: string): Promise<void> {
  await seedCandidateWorkspace();
  await database.query(
    `INSERT INTO team_membership_request (
       id, tenant_id, workspace_id, requester_user_id, requested_role, introduction,
       availability, state, decision_reason, reviewed_by_user_id, lock_version, expires_at,
       created_at, updated_at
     ) VALUES ($1, 'ten_solver_alpha', 'wsp_team_alpha', 'usr_team_candidate_alpha',
       'team:contributor', 'علاقه‌مند به همکاری در این تیم هستم.', 'پاره‌وقت', $2,
       'ظرفیت تیم تکمیل است.', 'usr_solver_alpha', 1, clock_timestamp() + interval '30 days',
       clock_timestamp(), clock_timestamp())`,
    [requestId, state],
  );
}

/** Emits the outbox row a C2 command would write, without the aggregate command. */
async function emitTeamEvent(
  eventId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO outbox_event (
       id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
       aggregate_id, payload, dedupe_key, occurred_at, available_at
     ) VALUES ($1,'ten_solver_alpha','cor_c8_team',$2,1,$3,
       $4, jsonb_build_object('entity_version', 1), $5, clock_timestamp(), clock_timestamp())`,
    [eventId, eventType, aggregateType, aggregateId, `${eventType}:${eventId}`],
  );
}
