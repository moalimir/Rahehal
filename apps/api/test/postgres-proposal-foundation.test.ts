import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();
const testDatabaseName = `rahhal_proposal_foundation_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;

let admin: Client;
let database: Pool;

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
       'usr_solver_alpha', clock_timestamp(), clock_timestamp())`,
    [id, versionId],
  );
  await database.query(
    `INSERT INTO proposal_version (
       id, proposal_id, challenge_id, version_number, actor_user_id, content,
       content_hash, changed_fields, created_at
     ) VALUES ($1, $2, 'chl_synthetic_alpha', 1, 'usr_solver_alpha', $3,
       $4, ARRAY['title'], clock_timestamp())`,
    [versionId, id, proposalContent(), "a".repeat(64)],
  );
  await database.query("SET CONSTRAINTS ALL IMMEDIATE");
  await database.query("SET CONSTRAINTS ALL DEFERRED");
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 1 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
}, 60_000);

beforeEach(async () => {
  await database.query("BEGIN");
  await database.query(`
    INSERT INTO challenge_approval (
      id, tenant_id, workspace_id, challenge_id, challenge_version_id, gate,
      decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
    ) VALUES
      ('cap_foundation_technical', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'technical', 'approved',
       'Synthetic approval', 'usr_approver_alpha', 'org:approver_technical', clock_timestamp()),
      ('cap_foundation_legal', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'legal', 'approved',
       'Synthetic approval', 'usr_platform_legal', 'platform:legal', clock_timestamp()),
      ('cap_foundation_finance', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'finance', 'approved',
       'Synthetic approval', 'usr_platform_finance', 'platform:finance', clock_timestamp()),
      ('cap_foundation_quality', 'ten_org_alpha', 'wsp_org_alpha',
       'chl_synthetic_alpha', 'chv_synthetic_alpha_v1', 'quality', 'approved',
       'Synthetic approval', 'usr_platform_ops', 'platform:ops', clock_timestamp())
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
});

afterEach(async () => {
  await database.query("ROLLBACK");
});

afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
  await admin.end();
});

describe("C proposal database foundation", () => {
  it("creates one scoped draft whose aggregate points at its latest version", async () => {
    await createDraftProposal();
    const stored = await database.query<{
      owner_workspace_kind: string;
      current_version_id: string;
      lock_version: string;
      assigned_membership_ids: string[];
    }>(`
      SELECT owner_workspace_kind, current_version_id, lock_version,
             assigned_membership_ids
      FROM proposal WHERE id = 'prp_foundation_alpha'
    `);
    expect(stored.rows[0]).toEqual({
      owner_workspace_kind: "team",
      current_version_id: "prv_foundation_alpha_v1",
      lock_version: "1",
      assigned_membership_ids: ["mem_team_owner_alpha"],
    });
  });

  it("rejects an organization workspace disguised as a solver owner", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO proposal (
          id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
          current_version_id, state, created_by_user_id
        ) VALUES (
          'prp_invalid_owner', 'ten_org_alpha', 'wsp_org_alpha', 'individual',
          'chl_synthetic_alpha', 'prv_invalid_owner_v1', 'draft', 'usr_owner_alpha'
        )
      `),
      "23503",
    );
  });

  it("makes tenant, workspace, and challenge identity immutable", async () => {
    await createDraftProposal();
    await expectDatabaseError(
      database.query(`
        UPDATE proposal
        SET owner_workspace_id = 'wsp_individual_alpha',
            owner_workspace_kind = 'individual',
            assigned_membership_ids = '{}'
        WHERE id = 'prp_foundation_alpha'
      `),
      "55000",
    );
  });

  it("requires every later version to cite a base and forbids sequence gaps", async () => {
    await createDraftProposal();
    await expectDatabaseError(
      database.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields
         ) VALUES (
           'prv_foundation_alpha_v3', 'prp_foundation_alpha', 'chl_synthetic_alpha',
           3, 'usr_solver_alpha', $1, $2, ARRAY['title']
         )`,
        [proposalContent(), "b".repeat(64)],
      ),
      "23514",
    );
  });

  it("requires version two to cite its exact base version", async () => {
    await createDraftProposal();
    await expectDatabaseError(
      database.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields
         ) VALUES (
           'prv_foundation_alpha_v2', 'prp_foundation_alpha', 'chl_synthetic_alpha',
           2, 'usr_solver_alpha', $1, $2, ARRAY['title']
         )`,
        [proposalContent(), "b".repeat(64)],
      ),
      "23514",
    );
  });

  it("requires the aggregate pointer and lock version to follow the latest version", async () => {
    await createDraftProposal();
    await database.query(
      `INSERT INTO proposal_version (
         id, proposal_id, challenge_id, version_number, actor_user_id, content,
         content_hash, changed_fields, base_version_id
       ) VALUES (
         'prv_foundation_alpha_v2', 'prp_foundation_alpha', 'chl_synthetic_alpha',
         2, 'usr_solver_alpha', $1, $2, ARRAY['title'], 'prv_foundation_alpha_v1'
       )`,
      [proposalContent({ title: "نسخه دوم راهکار" }), "b".repeat(64)],
    );
    await expectDatabaseError(database.query("SET CONSTRAINTS ALL IMMEDIATE"), "23514");
  });

  it("locks a submission only against the currently published challenge version", async () => {
    await createDraftProposal();
    await database.query(`
      INSERT INTO challenge_version (
        id, challenge_id, version_number, content, created_by_user_id, created_at
      )
      SELECT 'chv_synthetic_alpha_v2', challenge_id, 2, content,
             created_by_user_id, clock_timestamp()
      FROM challenge_version WHERE id = 'chv_synthetic_alpha_v1'
    `);

    // Locking is insert-only since `0016`: a submission appends a new locked
    // version rather than mutating the draft version in place.
    await expectDatabaseError(insertLockedVersion("chv_synthetic_alpha_v2"), "23514");
  });

  it("persists exact accepted terms and makes the locked version append-only", async () => {
    await createDraftProposal();
    await insertLockedVersion("chv_synthetic_alpha_v1");
    await database.query(`
      UPDATE proposal
      SET current_version_id = 'prv_foundation_alpha_v2', lock_version = 2,
          state = 'submitted', submitted_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE id = 'prp_foundation_alpha'
    `);
    await database.query("SET CONSTRAINTS ALL IMMEDIATE");
    await database.query("SET CONSTRAINTS ALL DEFERRED");

    const evidence = await database.query<{ accepted_challenge_version_id: string }>(`
      SELECT accepted_challenge_version_id
      FROM proposal_version WHERE id = 'prv_foundation_alpha_v2'
    `);
    expect(evidence.rows[0]?.accepted_challenge_version_id).toBe("chv_synthetic_alpha_v1");

    await expectDatabaseError(
      database.query(`
        UPDATE proposal_version
        SET content = jsonb_set(content, '{title}', '"tampered"')
        WHERE id = 'prv_foundation_alpha_v2'
      `),
      "55000",
    );
  });

  it("uses server state and deadline when locking a submission", async () => {
    await createDraftProposal();
    await database.query(`
      UPDATE challenge SET publication_state = 'paused'
      WHERE id = 'chl_synthetic_alpha'
    `);
    await expectDatabaseError(insertLockedVersion("chv_synthetic_alpha_v1"), "23514");
  });

  it("rejects duplicate or malformed proposal assignments", async () => {
    await expectDatabaseError(
      database.query(`
        INSERT INTO proposal (
          id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
          current_version_id, state, assigned_membership_ids, created_by_user_id
        ) VALUES (
          'prp_invalid_assignments', 'ten_solver_alpha', 'wsp_team_alpha', 'team',
          'chl_synthetic_alpha', 'prv_invalid_assignments_v1', 'draft',
          ARRAY['mem_team_owner_alpha', 'mem_team_owner_alpha'], 'usr_solver_alpha'
        )
      `),
      "23514",
    );
  });

  it("rejects malformed minor-unit money", async () => {
    await database.query(`
      INSERT INTO proposal (
        id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
        current_version_id, state, assigned_membership_ids, created_by_user_id
      ) VALUES (
        'prp_invalid_content', 'ten_solver_alpha', 'wsp_team_alpha', 'team',
        'chl_synthetic_alpha', 'prv_invalid_content_v1', 'draft',
        ARRAY['mem_team_owner_alpha'], 'usr_solver_alpha'
      )
    `);
    await expectDatabaseError(
      database.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash
         ) VALUES (
           'prv_invalid_content_v1', 'prp_invalid_content', 'chl_synthetic_alpha',
           1, 'usr_solver_alpha', $1, $2
         )`,
        [proposalContent({ budget_amount_minor: -1 }), "c".repeat(64)],
      ),
      "23514",
    );
  });

  it("rejects unsupported proposal currencies", async () => {
    await database.query(`
      INSERT INTO proposal (
        id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
        current_version_id, state, assigned_membership_ids, created_by_user_id
      ) VALUES (
        'prp_invalid_currency', 'ten_solver_alpha', 'wsp_team_alpha', 'team',
        'chl_synthetic_alpha', 'prv_invalid_currency_v1', 'draft',
        ARRAY['mem_team_owner_alpha'], 'usr_solver_alpha'
      )
    `);
    await expectDatabaseError(
      database.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash
         ) VALUES (
           'prv_invalid_currency_v1', 'prp_invalid_currency', 'chl_synthetic_alpha',
           1, 'usr_solver_alpha', $1, $2
         )`,
        [proposalContent({ budget_currency: "XYZ" }), "d".repeat(64)],
      ),
      "23514",
    );
  });
});
