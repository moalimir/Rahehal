import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChallengeContentResource } from "@rahhal/testkit";
import { parseCorrelationId, parseTenantId, parseUserId, parseWorkspaceId } from "@rahhal/domain";
import { buildApi } from "../src/app.js";
import { createRuntimeApiComposition } from "../src/runtime-composition.js";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { MonotonicIdFactory } from "../src/primitives.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const name = `rahhal_m1_test_${process.pid}_${Date.now()}`;
const url = new URL(testDatabaseAdminUrl());
url.pathname = `/${name}`;
const admin = new Client({ connectionString: testDatabaseAdminUrl().toString() });
const database = new Pool({ connectionString: url.toString() });
const clock = { now: () => new Date("2026-09-16T08:30:00Z") };
const ids = new MonotonicIdFactory();
const context = (key: string) => ({
  actorUserId: parseUserId("usr_owner_alpha"),
  tenantId: parseTenantId("ten_org_alpha"),
  workspaceId: parseWorkspaceId("wsp_org_alpha"),
  role: "org:owner" as const,
  idempotencyKey: key,
  correlationId: parseCorrelationId(`cor_${key}`),
});
const adapter = (beforeCommit?: () => void) =>
  new PostgresChallengeAdapter(new PostgresUnitOfWork(database, beforeCommit), clock, ids);
const content = () =>
  buildChallengeContentResource({
    visibility: "public",
    proposal_deadline: "2030-02-01T20:29:59.999Z",
  });
async function create(key: string, draft = content()) {
  return (await adapter().create({ expected_version: 0, draft }, context(`${key}_create`))).receipt
    .entity_id;
}
const headers = (key: string) => ({
  authorization: "Bearer local-a1b-access-owner-alpha",
  "x-workspace-id": "wsp_org_alpha",
  "idempotency-key": key,
});

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await runMigrations(database, "up");
  await seedSyntheticData(database);
});
afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

describe("M1 authoritative owner publication", () => {
  it.each(["triage", "approvals"])(
    "lets the owner complete a fresh immutable version from %s",
    async (stage) => {
      const id = await create(`m1_rework_${stage}`);
      const challenges = adapter();
      let version = 1;
      const commands = ["request-triage", "advance-formulation", "request-approvals"] as const;
      for (const command of commands.slice(0, stage === "triage" ? 1 : 3)) {
        await challenges.transition(
          id,
          command,
          { expected_version: version++ },
          context(`m1_rework_${stage}_${version}`),
        );
      }
      const before = await challenges.getScoped(context("m1_rework_read"), id);
      await expect(
        challenges.patch(
          id,
          { expected_version: version, patch: { title: "Member forbidden revision" } },
          { ...context(`m1_member_${stage}`), role: "org:member" },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      await challenges.patch(
        id,
        { expected_version: version, patch: { title: "Owner revised unpublished challenge" } },
        context(`m1_owner_rework_${stage}`),
      );
      const revised = await challenges.getScoped(context("m1_rework_read"), id);
      expect(revised?.stage).toBe("formulation");
      expect(revised?.current_version_id).not.toBe(before?.current_version_id);
      expect(
        (
          await database.query(
            "SELECT content ->> 'title' AS title, locked_at FROM challenge_version WHERE id = $1",
            [before?.current_version_id],
          )
        ).rows[0],
      ).toMatchObject({ title: content().title, locked_at: expect.any(Date) });
      await challenges.publish(
        id,
        { expected_version: version + 1 },
        context(`m1_rework_publish_${stage}`),
      );
    },
  );

  it("database publication guard rejects a non-owner and a suspended owner", async () => {
    const id = await create("m1_sql_guard");
    const sql = `UPDATE challenge SET stage = 'published', published_version_id = current_version_id,
      owner_publisher_user_id = $2, publication_state = 'open', proposal_deadline_at = '2030-02-01' WHERE id = $1`;
    await expect(database.query(sql, [id, "usr_approver_alpha"])).rejects.toMatchObject({
      code: "23514",
    });
    await database.query("UPDATE membership SET state = 'suspended' WHERE id = 'mem_owner_alpha'");
    try {
      await expect(database.query(sql, [id, "usr_owner_alpha"])).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await database.query("UPDATE membership SET state = 'active' WHERE id = 'mem_owner_alpha'");
    }
    await expect(database.query(sql, [id, "usr_owner_alpha"])).rejects.toMatchObject({
      code: "23514",
    });
  });
  it.each(["draft", "triage", "formulation", "approvals"] as const)(
    "publishes from %s without manufacturing approvals",
    async (stage) => {
      const key = `m1_${stage}`;
      const id = await create(key);
      const challenges = adapter();
      const commands = ["request-triage", "advance-formulation", "request-approvals"] as const;
      const stages = ["draft", "triage", "formulation", "approvals"];
      let version = 1;
      for (const command of commands.slice(0, stages.indexOf(stage))) {
        await challenges.transition(
          id,
          command,
          { expected_version: version++ },
          context(`${key}_${version}`),
        );
      }
      const before = await challenges.getScoped(context(key), id);
      const first = await challenges.publish(
        id,
        { expected_version: version },
        context(`${key}_publish`),
      );
      const replay = await challenges.publish(
        id,
        { expected_version: version },
        context(`${key}_publish`),
      );
      expect(replay.receipt.receipt_id).toBe(first.receipt.receipt_id);
      expect(replay.receipt.idempotent).toBe(true);
      const after = await challenges.getScoped(context(key), id);
      expect(after).toMatchObject({
        stage: "published",
        published_version_id: before?.current_version_id,
        approvals: [],
        version: version + 1,
      });
      const evidence = await database.query(
        `SELECT c.owner_publisher_user_id, v.locked_at,
      (SELECT count(*)::int FROM eligibility_rule WHERE challenge_id = c.id) AS rules,
      (SELECT count(*)::int FROM audit_event WHERE target_id = c.id AND action = 'challenge.published') AS audits,
      (SELECT count(*)::int FROM outbox_event WHERE aggregate_id = c.id AND event_type = 'challenge.published') AS events
      FROM challenge c JOIN challenge_version v ON v.id = c.published_version_id WHERE c.id = $1`,
        [id],
      );
      expect(evidence.rows[0]).toMatchObject({
        owner_publisher_user_id: "usr_owner_alpha",
        rules: 1,
        audits: 1,
        events: 1,
      });
      expect(evidence.rows[0].locked_at).not.toBeNull();
      const projection = await database.query(
        "SELECT * FROM challenge_public_projection WHERE challenge_id = $1",
        [id],
      );
      expect(projection.rows[0].public_summary).toBe(content().public_summary);
      for (const field of [
        "summary",
        "current_state",
        "desired_outcome",
        "success_criteria",
        "contact",
        "attachments",
        "owner_publisher_user_id",
      ])
        expect(projection.rows[0]).not.toHaveProperty(field);
      await expect(
        database.query("UPDATE challenge SET owner_publisher_user_id = NULL WHERE id = $1", [id]),
      ).rejects.toMatchObject({ code: "55000" });
      await expect(
        challenges.publish(id, { expected_version: version }, context(`${key}_stale`)),
      ).rejects.toMatchObject({ statusCode: 409 });
    },
  );

  it("rolls publication, locking, snapshot, audit and outbox back together", async () => {
    const id = await create("m1_rollback");
    await expect(
      adapter(() => {
        throw new Error("forced M1 rollback");
      }).publish(id, { expected_version: 1 }, context("m1_rollback_publish")),
    ).rejects.toThrow("forced M1 rollback");
    const state = await database.query(
      `SELECT c.stage, c.owner_publisher_user_id, v.locked_at,
      (SELECT count(*)::int FROM eligibility_rule WHERE challenge_id = c.id) AS rules,
      (SELECT count(*)::int FROM challenge_public_projection WHERE challenge_id = c.id) AS projections,
      (SELECT count(*)::int FROM audit_event WHERE target_id = c.id AND action = 'challenge.published') AS audits,
      (SELECT count(*)::int FROM outbox_event WHERE aggregate_id = c.id AND event_type = 'challenge.published') AS events
      FROM challenge c JOIN challenge_version v ON v.id = c.current_version_id WHERE c.id = $1`,
      [id],
    );
    expect(state.rows[0]).toEqual({
      stage: "draft",
      owner_publisher_user_id: null,
      locked_at: null,
      rules: 0,
      projections: 0,
      audits: 0,
      events: 0,
    });
  });

  it("serializes competing publish commands and keeps confidential calls out of discovery", async () => {
    const id = await create("m1_race", { ...content(), visibility: "nda" });
    const results = await Promise.allSettled(
      ["first", "second"].map((key) =>
        adapter().publish(id, { expected_version: 1 }, context(`m1_race_${key}`)),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (
        await database.query("SELECT * FROM challenge_public_projection WHERE challenge_id = $1", [
          id,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("rejects incomplete and expired briefs without changing their draft state", async () => {
    for (const [key, draft] of [
      ["incomplete", { ...content(), public_summary: "" }],
      ["expired", { ...content(), proposal_deadline: "2026-01-01T00:00:00Z" }],
    ] as const) {
      const id = await create(`m1_${key}`, draft);
      await expect(
        adapter().publish(id, { expected_version: 1 }, context(`m1_${key}_publish`)),
      ).rejects.toMatchObject({ code: key === "expired" ? "VALIDATION" : "INVALID_STATE" });
      expect((await adapter().getScoped(context(`m1_${key}`), id))?.stage).toBe("draft");
    }
  });

  it("enforces API roles, tenant scope, revoked membership/session, and owner live controls", async () => {
    const runtime = await createRuntimeApiComposition({
      ...process.env,
      NODE_ENV: "test",
      RAHHAL_API_MODE: "postgres",
      DATABASE_URL: url.toString(),
      OIDC_ISSUER_URL: "http://dex.localhost:5556/dex",
      OIDC_CLIENT_ID: "rahhal-local-web",
      OIDC_ALLOWED_REDIRECT_URIS: "http://localhost:3000/auth/callback",
      OIDC_ALLOW_INSECURE_HTTP: "true",
      OIDC_FLOW_SECRET: "m1-runtime-test-oidc-flow-secret-00000001",
      SESSION_CREDENTIAL_SECRET: "m1-runtime-test-session-secret-00000001",
      SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
      SOLVER_OTP_DEVELOPMENT_CODE: "12345",
      SOLVER_OTP_FLOW_SECRET: "m1-runtime-test-contact-flow-secret-000001",
    });
    const app = buildApi(runtime.ports);
    const id = await create("m1_api");
    // Arrange a real record in Beta; a missing-ID test alone cannot prove isolation.
    const foreign = await adapter().create(
      { expected_version: 0, draft: content() },
      {
        ...context("m1_foreign_create"),
        tenantId: parseTenantId("ten_org_beta"),
        workspaceId: parseWorkspaceId("wsp_org_beta"),
      },
    );
    const command = (target: string, action: string, version: number, key: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/challenges/${target}:${action}`,
        headers: headers(key),
        payload: { expected_version: version, reason: "آزمون مالک" },
      });
    try {
      for (const role of [
        "org:member",
        "org:approver_technical",
        "org:approver_legal",
        "org:approver_finance",
        "org:publisher",
      ]) {
        await database.query(
          "UPDATE membership SET role = $1 WHERE user_id = 'usr_owner_alpha' AND workspace_id = 'wsp_org_alpha'",
          [role],
        );
        expect((await command(id, "publish", 1, `m1_api_${role}`)).statusCode).toBe(
          role === "org:publisher" ? 409 : 403,
        );
      }
      await database.query(
        "UPDATE membership SET role = 'org:owner' WHERE user_id = 'usr_owner_alpha' AND workspace_id = 'wsp_org_alpha'",
      );
      for (const target of [foreign.receipt.entity_id, "chl_missing_m1"])
        expect((await command(target, "publish", 1, `m1_api_${target}`)).statusCode).toBe(404);
      await database.query(
        "UPDATE membership SET state = 'suspended' WHERE user_id = 'usr_owner_alpha' AND workspace_id = 'wsp_org_alpha'",
      );
      expect((await command(id, "publish", 1, "m1_api_revoked_member")).statusCode).toBe(404);
      await database.query(
        "UPDATE membership SET state = 'active' WHERE user_id = 'usr_owner_alpha' AND workspace_id = 'wsp_org_alpha'",
      );
      const published = await command(id, "publish", 1, "m1_api_publish");
      expect(published.statusCode, published.body).toBe(200);
      expect((await command(id, "pause", 2, "m1_api_pause")).statusCode).toBe(200);
      expect((await command(id, "resume", 3, "m1_api_resume")).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/challenges/${id}:extend-deadline`,
            headers: headers("m1_api_extend"),
            payload: {
              expected_version: 4,
              proposal_deadline: "2031-01-01T00:00:00Z",
              reason: "مهلت بیشتر",
            },
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(id, "close", 5, "m1_api_close")).statusCode).toBe(200);
      const cancelled = await create("m1_api_cancel");
      expect((await command(cancelled, "publish", 1, "m1_api_cancel_publish")).statusCode).toBe(
        200,
      );
      expect((await command(cancelled, "cancel", 2, "m1_api_cancel_call")).statusCode).toBe(200);
      await database.query(
        "UPDATE app_session SET revoked_at = clock_timestamp(), revocation_reason = 'M1 test' WHERE id = 'ses_owner_alpha'",
      );
      expect((await command(id, "publish", 1, "m1_api_publish")).statusCode).toBe(403);
    } finally {
      await app.close();
      await runtime.close();
    }
  });

  it("refuses destructive rollback after owner publication", async () => {
    await expect(runMigrations(database, "down")).rejects.toThrow(
      "cannot roll back M1 after owner publication",
    );
  });
});
