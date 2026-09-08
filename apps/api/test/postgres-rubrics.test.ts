import {
  apiRoutes,
  type ErrorEnvelope,
  type MutationSuccessEnvelope,
  type RubricSuccessEnvelope,
} from "@rahhal/contracts";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../src/app.js";
import { createPostgresApiComposition } from "../src/postgres-composition.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import {
  LocalTestOidcAuthorizationAdapter,
  LocalTestSessionCredentialIssuer,
} from "./support/local-test-identity.js";

const adminUrl = testDatabaseAdminUrl();
const databaseName = `rahhal_d2_rubric_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const challengeId = "chl_synthetic_alpha";
const challengeVersionId = "chv_synthetic_alpha_v1";
const ownerHeaders = {
  authorization: "Bearer local-a1b-access-owner-alpha",
  "x-workspace-id": "wsp_org_alpha",
};
const validCriteria = [
  { id: "feasibility", label: "امکان‌پذیری", weight: 60, min: 0, max: 5 },
  { id: "impact", label: "اثر مورد انتظار", weight: 40, min: 0, max: 5 },
] as const;

let admin: Client;
let database: Pool;
let app: ReturnType<typeof buildApi>;
let adminConnected = false;
let databaseCreated = false;

async function createApp(options: { readonly beforeCommit?: () => void } = {}) {
  const composition = await createPostgresApiComposition({
    pool: database,
    beforeCommit: options.beforeCommit,
    oidc: new LocalTestOidcAuthorizationAdapter([], "test"),
    credentials: new LocalTestSessionCredentialIssuer(
      "d2-rubric-test-credential-secret-000000001",
      "test",
    ),
    environment: {
      NODE_ENV: "test",
      SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
      SOLVER_OTP_DEVELOPMENT_CODE: "12345",
      SOLVER_OTP_FLOW_SECRET: "d2-rubric-test-contact-secret-000000001",
    },
  });
  return buildApi(composition.ports);
}

const rubricPath = () => apiRoutes.challengeRubric.replace("{challengeId}", challengeId);
const createPath = () => apiRoutes.createRubricVersion.replace("{challengeId}", challengeId);
const body = (expectedVersion = 0, criteria: readonly unknown[] = validCriteria) => ({
  expected_version: expectedVersion,
  challenge_version_id: challengeVersionId,
  criteria,
});
const commandHeaders = (key: string) => ({ ...ownerHeaders, "idempotency-key": key });

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  adminConnected = true;
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  database = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_d2_technical', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'technical', 'approved', 'Synthetic approval', 'usr_approver_alpha',
       'org:approver_technical', transaction_timestamp()),
      ('cap_d2_legal', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'legal', 'approved', 'Synthetic approval', 'usr_platform_legal',
       'platform:legal', transaction_timestamp()),
      ('cap_d2_finance', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'finance', 'approved', 'Synthetic approval', 'usr_platform_finance',
       'platform:finance', transaction_timestamp()),
      ('cap_d2_quality', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
       'quality', 'approved', 'Synthetic approval', 'usr_platform_ops',
       'platform:ops', transaction_timestamp());
    INSERT INTO eligibility_rule (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id,
      allowed_applicant_types, verification_required, nda_required,
      document_gate_required, proposal_deadline, state, created_at
    ) VALUES (
      'elr_d2_alpha_v1', 'ten_org_alpha', 'wsp_org_alpha', '${challengeId}', '${challengeVersionId}',
      ARRAY['individual']::text[], false, false, false,
      '2099-01-01T00:00:00Z', 'open', transaction_timestamp()
    ) ON CONFLICT (challenge_version_id) DO NOTHING;
    UPDATE challenge
    SET stage = 'published', published_version_id = '${challengeVersionId}',
        publication_state = 'open', proposal_deadline_at = '2099-01-01T00:00:00Z',
        updated_at = transaction_timestamp()
    WHERE id = '${challengeId}';
  `);
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

describe("D2 PostgreSQL rubric authoring", () => {
  it("appends an exact-version rubric with atomic receipt, audit, outbox and replay", async () => {
    const empty = await app.inject({ url: rubricPath(), headers: ownerHeaders });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<RubricSuccessEnvelope>().data).toBeNull();

    const first = await app.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-create-0001"),
      payload: body(),
    });
    expect(first.statusCode).toBe(200);
    const firstReceipt = first.json<MutationSuccessEnvelope>();
    expect(firstReceipt).toMatchObject({
      ok: true,
      data: { idempotent: false, next_actions: ["edit_rubric", "open_evaluation"] },
      meta: { entity_version: 1 },
    });
    const replay = await app.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-create-0001"),
      payload: body(),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...firstReceipt.data,
      idempotent: true,
    });

    const read = await app.inject({ url: rubricPath(), headers: ownerHeaders });
    expect(read.statusCode).toBe(200);
    expect(read.json<RubricSuccessEnvelope>().data).toMatchObject({
      id: firstReceipt.data.entity_id,
      version: 1,
      challenge_id: challengeId,
      challenge_version_id: challengeVersionId,
      criteria: validCriteria,
    });
    const evidence = await database.query(`
      SELECT
        (SELECT count(*) FROM rubric) AS rubrics,
        (SELECT count(*) FROM rubric_version) AS versions,
        (SELECT count(*) FROM audit_event WHERE action = 'rubric.version.created') AS audits,
        (SELECT count(*) FROM outbox_event WHERE event_type = 'rubric.version.created') AS events,
        (SELECT count(*) FROM mutation_receipt WHERE entity_type = 'rubric') AS receipts
    `);
    expect(evidence.rows[0]).toEqual({
      rubrics: "1",
      versions: "1",
      audits: "1",
      events: "1",
      receipts: "1",
    });
  });

  it("rejects invalid scoring policy, stale terms, stale versions and key reuse", async () => {
    for (const [key, payload] of [
      ["d2-rubric-bad-total", body(1, [{ ...validCriteria[0], weight: 59 }, validCriteria[1]])],
      ["d2-rubric-bad-range", body(1, [{ ...validCriteria[0], max: 10 }, validCriteria[1]])],
      [
        "d2-rubric-duplicate",
        body(1, [validCriteria[0], { ...validCriteria[1], id: "feasibility" }]),
      ],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: createPath(),
        headers: commandHeaders(key),
        payload,
      });
      expect(response.statusCode).toBe(422);
    }
    const staleTerms = await app.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-stale-terms"),
      payload: { ...body(1), challenge_version_id: "chv_other_terms_001" },
    });
    expect(staleTerms.statusCode).toBe(409);
    expect(staleTerms.json<ErrorEnvelope>().error).toMatchObject({
      code: "CONFLICT",
      recovery: "refresh_challenge_terms",
    });
    const staleVersion = await app.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-stale-version"),
      payload: body(0),
    });
    expect(staleVersion.statusCode).toBe(409);
    expect(staleVersion.json<ErrorEnvelope>().error).toMatchObject({
      code: "CONFLICT",
      current_version: 1,
    });
    const keyConflict = await app.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-create-0001"),
      payload: body(1),
    });
    expect(keyConflict.statusCode).toBe(409);
  });

  it("scopes before lookup, denies other roles and rechecks membership immediately", async () => {
    const foreign = await app.inject({
      url: apiRoutes.challengeRubric.replace("{challengeId}", "chl_foreign_beta_001"),
      headers: ownerHeaders,
    });
    expect(foreign.statusCode).toBe(404);
    await database.query(
      "UPDATE membership SET role = 'org:approver_technical' WHERE id = 'mem_owner_alpha'",
    );
    const approver = await app.inject({ url: rubricPath(), headers: ownerHeaders });
    expect(approver.statusCode).toBe(403);
    await database.query("UPDATE membership SET role = 'org:owner' WHERE id = 'mem_owner_alpha'");
    await database.query("UPDATE membership SET state = 'removed' WHERE id = 'mem_owner_alpha'");
    const removed = await app.inject({ url: rubricPath(), headers: ownerHeaders });
    expect(removed.statusCode).toBe(404);
    await database.query("UPDATE membership SET state = 'active' WHERE id = 'mem_owner_alpha'");
  });

  it("keeps versions immutable, enforces the policy in PostgreSQL and serializes writers", async () => {
    await expect(
      database.query("UPDATE rubric_version SET criteria = '[]' WHERE version_number = 1"),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      database.query(
        `INSERT INTO rubric_version (id, rubric_id, version_number, criteria, created_by_user_id)
         SELECT 'rbv_d2_invalid', id, 99, '[]'::jsonb, 'usr_owner_alpha' FROM rubric`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const requests = ["left", "right"].map((suffix) =>
      app.inject({
        method: "POST",
        url: createPath(),
        headers: commandHeaders(`d2-rubric-race-${suffix}`),
        payload: body(1),
      }),
    );
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await database.query("SELECT count(*) AS total FROM rubric_version")).rows[0]).toEqual({
      total: "2",
    });
  });

  it("rolls the version and all command evidence back together", async () => {
    const failing = await createApp({
      beforeCommit: () => {
        throw new Error("synthetic commit failure");
      },
    });
    const response = await failing.inject({
      method: "POST",
      url: createPath(),
      headers: commandHeaders("d2-rubric-rollback-0001"),
      payload: body(2),
    });
    await failing.close();
    expect(response.statusCode).toBe(503);
    expect((await database.query("SELECT count(*) AS total FROM rubric_version")).rows[0]).toEqual({
      total: "2",
    });
    expect(
      (
        await database.query(
          "SELECT count(*) AS total FROM idempotency_key WHERE idempotency_key = 'd2-rubric-rollback-0001'",
        )
      ).rows[0],
    ).toEqual({ total: "0" });
  });
});
