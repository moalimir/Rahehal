import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { Pool } from "pg";

/**
 * Local synthetic D1-D9 browser acceptance through Fastify and PostgreSQL:
 * rubric, frozen roster, assignment, COI, scoring, lock, decision and case.
 * Independent actor contexts exercise both selection and no-award decisions.
 */
const connectedStack = process.env.RAHHAL_CONNECTED_E2E === "1";
const password = process.env.RAHHAL_E2E_PASSWORD ?? "rahhal-local-owner";
const owner = process.env.RAHHAL_E2E_LOGIN ?? "owner-alpha@synthetic.invalid";
const orgWorkspaceId = "wsp_org_alpha";
const platformWorkspaceId = "wsp_platform_main";
const solverWorkspaceId = "wsp_team_alpha";

function connectedDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for the Phase 4 connected fixture");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Phase 4 browser fixtures refuse a non-loopback PostgreSQL database");
  }
  return url.toString();
}

async function completeDexLogin(page: Page, email = owner) {
  await page.waitForURL(/\/dex\/auth/);
  const login = page.locator("#login");
  const connector = page.getByRole("link", { name: "Log in with Email" });
  await expect(login.or(connector)).toBeVisible();
  if (await connector.isVisible()) await connector.click();
  await expect(login).toBeVisible();
  await login.fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#submit-login").click();
}

async function signIn(page: Page) {
  await page.goto("/auth/organization/login");
  await page.getByRole("button", { name: /ادامه برای ورود امن سازمانی/ }).click();
  await completeDexLogin(page);
  await page.waitForURL(/\/app\/org\/challenges\/?(?:\?|$)/);
  await page.waitForLoadState("domcontentloaded");
}

async function activateWorkspace(page: Page, workspaceId = orgWorkspaceId) {
  const me = await page.evaluate(async () => {
    const response = await fetch("/api/v1/me", { credentials: "same-origin" });
    return response.json();
  });
  const current = (me as { data: { active_context: { workspace_id: string } | null } }).data
    .active_context;
  if (current?.workspace_id === workspaceId) return;
  const version = (me as { meta: { entity_version: number } }).meta.entity_version;
  const status = await page.evaluate(
    async ([workspaceId, expectedVersion]) => {
      const response = await fetch("/api/v1/me/context:switch", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
          "idempotency-key": `phase4-context-${Date.now()}`,
        },
        body: JSON.stringify({ expected_version: expectedVersion, workspace_id: workspaceId }),
      });
      return response.status;
    },
    [workspaceId, version] as const,
  );
  expect(status).toBe(200);
}

async function signInOidcFromProtectedRoute(
  page: Page,
  route: string,
  role: "reviewer" | "ops",
  email: string,
) {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "برای ادامه وارد حساب مجاز شوید" })).toBeVisible();
  await page.getByRole("link", { name: "ورود و ادامه" }).click();
  await expect(page).toHaveURL(new RegExp(`/auth/organization/login/?\\?.*role=${role}`));
  await expect(
    page.getByRole("heading", { name: role === "reviewer" ? "ورود داور" : "ورود عملیات" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: role === "reviewer" ? "ادامه برای ورود امن داور" : "ادامه برای ورود امن عملیات",
    })
    .click();
  await completeDexLogin(page, email);
  await page.waitForURL(
    role === "reviewer" ? /\/app\/reviewer\/assignments\/?/ : /\/app\/ops\/publication\/?/,
  );
  await activateWorkspace(page, platformWorkspaceId);
  await page.goto(route);
}

async function signInSolver(page: Page, email: string) {
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "رایانامه" }).click();
  await page.getByLabel("رایانامه").fill(email);
  await page.getByRole("button", { name: /دریافت کد و ادامه/ }).click();
  await page.getByLabel("کد تأیید").fill("12345");
  await page.getByRole("button", { name: /تأیید و ورود/ }).click();
  await page.waitForURL(/\/app\/solver\//);
  await activateWorkspace(page, solverWorkspaceId);
}

test.describe("Phase 4 connected decision", () => {
  test.skip(!connectedStack, "requires the connected stack (RAHHAL_CONNECTED_E2E=1)");
  test.describe.configure({ mode: "serial", timeout: 180_000 });
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

  let database: Pool;
  let challengeId = "";
  let lifecycleChallengeId = "";
  let lifecycleChallengeVersionId = "";
  let lifecycleProposalId = "";
  let lifecycleProposalVersionId = "";
  let lifecycleTrackingCode = "";
  let solverLogin = "";

  test.beforeAll(async () => {
    database = new Pool({ connectionString: connectedDatabaseUrl(), max: 1 });
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // Each viewport uses its own local activated-human fixture rather than
    // exhausting the real provider's three-start abuse boundary on one email.
    // Link only synthetic identities; never disable the provider limit.
    solverLogin = `phase4-solver-${suffix}@synthetic.invalid`;
    challengeId = `chl_phase4_browser_${suffix}`;
    const challengeVersionId = `chv_phase4_browser_${suffix}`;
    const eligibilityId = `elr_phase4_browser_${suffix}`;
    const rubricId = `rub_phase4_browser_${suffix}`;
    const rubricVersionId = `rbv_phase4_browser_${suffix}`;
    lifecycleChallengeId = `chl_phase4_lifecycle_${suffix}`;
    lifecycleChallengeVersionId = `chv_phase4_lifecycle_${suffix}`;
    lifecycleProposalId = `prp_phase4_lifecycle_${suffix}`;
    const draftProposalVersionId = `prv_phase4_lifecycle_draft_${suffix}`;
    lifecycleProposalVersionId = `prv_phase4_lifecycle_locked_${suffix}`;
    lifecycleTrackingCode = `PRP-2099-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0")}`;
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const solverUserId = `usr_phase4_solver_${suffix}`;
      const individualWorkspaceId = `wsp_phase4_solver_${suffix}`;
      const individualMembershipId = `mem_phase4_individual_${suffix}`;
      const solverSubject = `contact:email:${createHash("sha256")
        .update(JSON.stringify(solverLogin))
        .digest("hex")}`;
      await client.query(
        `INSERT INTO app_user (id,display_name,primary_email,email_verified)
         VALUES ($1,'Synthetic Phase 4 solver',$2,true)`,
        [solverUserId, solverLogin],
      );
      await client.query(
        `INSERT INTO workspace (id,tenant_id,tenant_kind,kind,name,owner_user_id)
         VALUES ($1,'ten_solver_alpha','solver','individual','Synthetic Phase 4 individual',$2)`,
        [individualWorkspaceId, solverUserId],
      );
      await client.query(
        `INSERT INTO membership (id,tenant_id,workspace_id,workspace_kind,user_id,role,state)
         VALUES ($1,'ten_solver_alpha',$2,'individual',$3,'individual','active'),
                ($4,'ten_solver_alpha','wsp_team_alpha','team',$3,'team:proposal-manager','active')`,
        [individualMembershipId, individualWorkspaceId, solverUserId, `mem_phase4_team_${suffix}`],
      );
      await client.query(
        `INSERT INTO identity_link (id,user_id,issuer,subject,created_at)
         VALUES ($1,$2,'urn:rahhal:identity:development-otp',$3,transaction_timestamp())`,
        [`idl_phase4_solver_${suffix}`, solverUserId, solverSubject],
      );
      await client.query(
        `INSERT INTO solver_activation (
           id,user_id,tenant_id,individual_workspace_id,individual_membership_id,
           provider_issuer,provider_subject,contact_channel,start_intent
         ) VALUES ($1,$2,'ten_solver_alpha',$3,$4,'urn:rahhal:identity:development-otp',$5,'email','team')`,
        [
          `act_phase4_solver_${suffix}`,
          solverUserId,
          individualWorkspaceId,
          individualMembershipId,
          solverSubject,
        ],
      );
      await client.query(
        `INSERT INTO challenge (
           id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
           current_version_id, published_version_id, lock_version, created_by_user_id,
           created_at, updated_at, publication_state, proposal_deadline_at
         ) VALUES (
           $1,'ten_org_alpha','organization','wsp_org_alpha','org','approvals',
           $2,NULL,3,'usr_owner_alpha',transaction_timestamp() - interval '2 days',
           transaction_timestamp(),NULL,NULL
         )`,
        [challengeId, challengeVersionId],
      );
      await client.query(
        `INSERT INTO challenge_version (
           id, challenge_id, version_number, content, created_by_user_id,
           created_at, locked_at, lock_reason
         )
         SELECT $1,$2,1,content,'usr_owner_alpha',transaction_timestamp() - interval '2 days',
                transaction_timestamp() - interval '1 day','published'
         FROM challenge_version WHERE id = 'chv_synthetic_alpha_v1'`,
        [challengeVersionId, challengeId],
      );
      await client.query(
        `INSERT INTO eligibility_rule (
           id, tenant_id, workspace_id, challenge_id, challenge_version_id,
           allowed_applicant_types, verification_required, nda_required,
           document_gate_required, proposal_deadline, state, created_at
         ) VALUES (
           $1,'ten_org_alpha','wsp_org_alpha',$2,$3,
           ARRAY['individual','expert-team']::text[],false,false,false,
           '2099-09-10T09:00:00.000Z','closed',transaction_timestamp()
         )`,
        [eligibilityId, challengeId, challengeVersionId],
      );
      await client.query(
        `INSERT INTO challenge_approval (
           id, tenant_id, workspace_id, challenge_id, challenge_version_id,
           gate, decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
         ) VALUES
           ($1,'ten_org_alpha','wsp_org_alpha',$5,$6,'technical','approved',
            'Technical approval.','usr_approver_alpha','org:approver_technical',transaction_timestamp()),
           ($2,'ten_org_alpha','wsp_org_alpha',$5,$6,'legal','approved',
            'Legal approval.','usr_platform_legal','platform:legal',transaction_timestamp()),
           ($3,'ten_org_alpha','wsp_org_alpha',$5,$6,'finance','approved',
            'Finance approval.','usr_platform_finance','platform:finance',transaction_timestamp()),
           ($4,'ten_org_alpha','wsp_org_alpha',$5,$6,'quality','approved',
            'Quality approval.','usr_platform_ops','platform:ops',transaction_timestamp())`,
        [
          `cap_p4_technical_${suffix}`,
          `cap_p4_legal_${suffix}`,
          `cap_p4_finance_${suffix}`,
          `cap_p4_quality_${suffix}`,
          challengeId,
          challengeVersionId,
        ],
      );
      await client.query(
        `UPDATE challenge
         SET stage = 'published', published_version_id = $2, publication_state = 'closed',
             proposal_deadline_at = '2099-09-10T09:00:00.000Z',
             updated_at = transaction_timestamp()
         WHERE id = $1`,
        [challengeId, challengeVersionId],
      );
      await client.query(
        `INSERT INTO rubric (id, tenant_id, challenge_id, challenge_version_id)
         VALUES ($1,'ten_org_alpha',$2,$3)`,
        [rubricId, challengeId, challengeVersionId],
      );
      await client.query(
        `INSERT INTO rubric_version (
           id, rubric_id, version_number, criteria, created_by_user_id, created_at
         ) VALUES (
           $1,$2,1,'[{"id":"quality","label":"کیفیت","weight":100,"min":0,"max":5}]'::jsonb,
           'usr_owner_alpha',transaction_timestamp()
         )`,
        [rubricVersionId, rubricId],
      );
      await client.query(
        `INSERT INTO challenge_evaluation (
           challenge_id, tenant_id, workspace_id, challenge_version_id, rubric_version_id,
           required_reviews, challenge_lock_version, opened_by_user_id, opened_at
         ) VALUES (
           $1,'ten_org_alpha','wsp_org_alpha',$2,$3,2,4,'usr_owner_alpha',transaction_timestamp()
         )`,
        [challengeId, challengeVersionId, rubricVersionId],
      );
      await client.query(
        `UPDATE challenge
         SET stage = 'evaluating', lock_version = 4, updated_at = transaction_timestamp()
         WHERE id = $1`,
        [challengeId],
      );
      await client.query(
        `INSERT INTO challenge (
           id, tenant_id, tenant_kind, workspace_id, workspace_kind, stage,
           current_version_id, published_version_id, lock_version, created_by_user_id,
           created_at, updated_at, publication_state, proposal_deadline_at
         ) VALUES (
           $1,'ten_org_alpha','organization','wsp_org_alpha','org','approvals',
           $2,NULL,3,'usr_owner_alpha',transaction_timestamp() - interval '2 days',
           transaction_timestamp(),NULL,NULL
         )`,
        [lifecycleChallengeId, lifecycleChallengeVersionId],
      );
      await client.query(
        `INSERT INTO challenge_version (
           id, challenge_id, version_number, content, created_by_user_id,
           created_at, locked_at, lock_reason
         )
         SELECT $1,$2,1,
                jsonb_set(content, '{title}', '"چرخه کامل داوری مرورگر"'::jsonb),
                'usr_owner_alpha',transaction_timestamp() - interval '2 days',
                transaction_timestamp() - interval '1 day','published'
         FROM challenge_version WHERE id = 'chv_synthetic_alpha_v1'`,
        [lifecycleChallengeVersionId, lifecycleChallengeId],
      );
      await client.query(
        `INSERT INTO eligibility_rule (
           id, tenant_id, workspace_id, challenge_id, challenge_version_id,
           allowed_applicant_types, verification_required, nda_required,
           document_gate_required, proposal_deadline, state, created_at
         ) VALUES (
           $1,'ten_org_alpha','wsp_org_alpha',$2,$3,
           ARRAY['individual','expert-team']::text[],false,false,false,
           '2099-09-10T09:00:00.000Z','closed',transaction_timestamp()
         )`,
        [`elr_phase4_lifecycle_${suffix}`, lifecycleChallengeId, lifecycleChallengeVersionId],
      );
      await client.query(
        `INSERT INTO challenge_approval (
           id, tenant_id, workspace_id, challenge_id, challenge_version_id,
           gate, decision, reason, recorded_by_user_id, recorded_by_role, recorded_at
         ) VALUES
           ($1,'ten_org_alpha','wsp_org_alpha',$5,$6,'technical','approved',
            'Technical approval.','usr_approver_alpha','org:approver_technical',transaction_timestamp()),
           ($2,'ten_org_alpha','wsp_org_alpha',$5,$6,'legal','approved',
            'Legal approval.','usr_platform_legal','platform:legal',transaction_timestamp()),
           ($3,'ten_org_alpha','wsp_org_alpha',$5,$6,'finance','approved',
            'Finance approval.','usr_platform_finance','platform:finance',transaction_timestamp()),
           ($4,'ten_org_alpha','wsp_org_alpha',$5,$6,'quality','approved',
            'Quality approval.','usr_platform_ops','platform:ops',transaction_timestamp())`,
        [
          `cap_p4_lifecycle_technical_${suffix}`,
          `cap_p4_lifecycle_legal_${suffix}`,
          `cap_p4_lifecycle_finance_${suffix}`,
          `cap_p4_lifecycle_quality_${suffix}`,
          lifecycleChallengeId,
          lifecycleChallengeVersionId,
        ],
      );
      await client.query(
        `UPDATE challenge
         SET stage = 'published', published_version_id = $2, publication_state = 'open',
             proposal_deadline_at = '2099-09-10T09:00:00.000Z',
             updated_at = transaction_timestamp()
         WHERE id = $1`,
        [lifecycleChallengeId, lifecycleChallengeVersionId],
      );
      await client.query(
        `INSERT INTO proposal (
           id, tenant_id, owner_workspace_id, owner_workspace_kind, challenge_id,
           current_version_id, state, assigned_membership_ids, lock_version,
           created_by_user_id, created_at, updated_at
         ) VALUES (
           $1,'ten_solver_alpha','wsp_team_alpha','team',$2,$3,'draft',
           ARRAY['mem_team_owner_alpha'],1,'usr_solver_alpha',
           transaction_timestamp(),transaction_timestamp()
         )`,
        [lifecycleProposalId, lifecycleChallengeId, draftProposalVersionId],
      );
      const proposalContent = {
        title: "راهکار آزمون مرورگر داوری",
        problem_statement: "شرح دقیق مسئله برای آزمون یکپارچه مرورگر و مرز پایگاه داده.",
        value_proposition: "ارزش سنجش‌پذیر و قابل بررسی برای چرخه کامل داوری.",
        maturity_level: "prototype",
        prototype_weeks: "8",
        technologies: ["sensor"],
        technical_approach: "نمونه‌سازی مرحله‌ای و ارزیابی در محل.",
        architecture: "edge",
        data_needs: "telemetry",
        success_metrics: "کاهش سنجش‌پذیر مصرف.",
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
      };
      await client.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields, created_at
         ) VALUES ($1,$2,$3,1,'usr_solver_alpha',$4,$5,ARRAY['title'],transaction_timestamp())`,
        [
          draftProposalVersionId,
          lifecycleProposalId,
          lifecycleChallengeId,
          proposalContent,
          "a".repeat(64),
        ],
      );
      await client.query(
        `INSERT INTO proposal_version (
           id, proposal_id, challenge_id, version_number, actor_user_id, content,
           content_hash, changed_fields, base_version_id, accepted_challenge_version_id,
           locked_at, lock_reason, created_at
         ) VALUES ($1,$2,$3,2,'usr_solver_alpha',$4,$5,'{}'::text[],$6,$7,
                   transaction_timestamp(),'submission',transaction_timestamp())`,
        [
          lifecycleProposalVersionId,
          lifecycleProposalId,
          lifecycleChallengeId,
          proposalContent,
          "b".repeat(64),
          draftProposalVersionId,
          lifecycleChallengeVersionId,
        ],
      );
      await client.query(
        `UPDATE proposal
         SET current_version_id=$2,state='submitted',lock_version=2,
             tracking_code=$3,submitted_at=transaction_timestamp(),updated_at=transaction_timestamp()
         WHERE id=$1`,
        [lifecycleProposalId, lifecycleProposalVersionId, lifecycleTrackingCode],
      );
      await client.query(
        `INSERT INTO access_grant (
           id, grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
           grantee_workspace_id, resource_type, resource_id, capability, state,
           valid_from, expires_at, proposal_version_id, created_by_user_id, created_at
         ) VALUES (
           $1,'ten_solver_alpha','wsp_team_alpha','ten_org_alpha','wsp_org_alpha',
           'proposal',$2,'read','active',transaction_timestamp(),
           '2099-09-10T09:00:00.000Z',$3,'usr_solver_alpha',transaction_timestamp()
         )`,
        [`agr_phase4_lifecycle_${suffix}`, lifecycleProposalId, lifecycleProposalVersionId],
      );
      await client.query(
        `UPDATE proposal SET state='eligible',lock_version=3,updated_at=transaction_timestamp()
         WHERE id=$1`,
        [lifecycleProposalId],
      );
      await client.query(
        `UPDATE challenge SET publication_state='closed',updated_at=transaction_timestamp()
         WHERE id=$1`,
        [lifecycleChallengeId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  test.afterAll(async () => {
    await database?.end();
  });

  test("preserves the form across fresh OIDC and records one audited no-award decision", async ({
    page,
  }) => {
    await signIn(page);
    await activateWorkspace(page);
    await page.goto(`/app/org/challenges/record/evaluation/?id=${challengeId}`);

    await expect(page.getByRole("heading", { name: "کوتاه‌فهرست و تصمیم نهایی" })).toBeVisible();
    const rationale = "هیچ پیشنهاد واجد شرایطی در فهرست دقیق ارزیابی وجود ندارد.";
    await page.getByLabel("استدلال نهایی").fill(rationale);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "ورود تازه برای تصمیم" }).click();
    const popup = await popupPromise;
    await completeDexLogin(popup);
    await popup.waitForEvent("close");

    await expect(page.getByText("ورود تازه تأیید شد؛ اطلاعات فرم حفظ شده است.")).toBeVisible();
    await expect(page.getByLabel("استدلال نهایی")).toHaveValue(rationale);
    await page.getByRole("button", { name: "ثبت تصمیم نهایی" }).click();
    await expect(page.getByRole("heading", { name: "تصمیم نهایی ثبت شده است" })).toBeVisible();
    await expect(page.getByText("بدون انتخاب").first()).toBeVisible();

    const evidence = await database.query<{
      stage: string;
      outcome: string;
      cases: string;
      proof_state: string;
      audit_actions: string[];
    }>(
      `SELECT challenge.stage, decision.outcome,
              (SELECT count(*) FROM case_record WHERE challenge_id = challenge.id) AS cases,
              step_up.status AS proof_state,
              ARRAY(
                SELECT action FROM audit_event
                WHERE target_id = challenge.id
                  AND action IN (
                    'challenge:decision-step-up',
                    'challenge:decision-step-up:complete',
                    'challenge.decision.recorded'
                  )
                ORDER BY action
              ) AS audit_actions
       FROM challenge
       JOIN decision ON decision.challenge_id = challenge.id
       JOIN step_up_attempt step_up ON step_up.id = decision.step_up_attempt_id
       WHERE challenge.id = $1`,
      [challengeId],
    );
    expect(evidence.rows[0]).toMatchObject({
      stage: "decided",
      outcome: "no_award",
      cases: "0",
      proof_state: "consumed",
    });
    expect(evidence.rows[0]!.audit_actions).toEqual(
      expect.arrayContaining([
        "challenge:decision-step-up",
        "challenge:decision-step-up:complete",
        "challenge.decision.recorded",
      ]),
    );
  });

  test("runs D1-D9 through organization, operations, reviewer, and solver browser sessions", async ({
    browser,
  }: { browser: Browser }, testInfo) => {
    const actorOptions = {
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    };
    const ownerContext = await browser.newContext(actorOptions);
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage);
    await activateWorkspace(ownerPage);

    await ownerPage.goto(`/app/org/challenges/record/rubric/?id=${lifecycleChallengeId}`);
    await expect(ownerPage.getByRole("heading", { name: "معیارهای ارزیابی" })).toBeVisible();
    await ownerPage.getByLabel("عنوان معیار").fill("کیفیت اجرا");
    await ownerPage.getByRole("button", { name: "ثبت نخستین نسخه" }).click();
    await expect(ownerPage.getByText("نسخه ۱ معیارها ثبت شد.")).toBeVisible();

    await ownerPage.goto(`/app/org/challenges/record/evaluation/?id=${lifecycleChallengeId}`);
    await expect(ownerPage.getByRole("heading", { name: "آمادگی شروع ارزیابی" })).toBeVisible();
    await expect(ownerPage.getByText(lifecycleTrackingCode)).toBeVisible();
    await ownerPage.getByRole("button", { name: "قفل فهرست و شروع ارزیابی" }).click();
    await expect(
      ownerPage.getByRole("heading", { name: "فهرست ارزیابی قفل شده است" }),
    ).toBeVisible();

    const operationsContext = await browser.newContext(actorOptions);
    const operationsPage = await operationsContext.newPage();
    await signInOidcFromProtectedRoute(
      operationsPage,
      "/app/ops/reviews",
      "ops",
      "platform-ops@synthetic.invalid",
    );
    await expect(operationsPage.getByRole("heading", { name: "تخصیص داوران" })).toBeVisible();
    const operationsForm = operationsPage.locator(".app-form-grid");
    const proposalSelect = operationsForm.locator("select").nth(0);
    const reviewerSelect = operationsForm.locator("select").nth(1);
    await expect(proposalSelect.locator(`option[value="${lifecycleProposalId}"]`)).toHaveCount(1);
    await proposalSelect.selectOption(lifecycleProposalId);
    await reviewerSelect.selectOption("mem_reviewer_alpha");
    await operationsPage.getByRole("button", { name: "ثبت مأموریت" }).click();
    await expect(operationsPage.getByText(/مأموریت داوری ثبت شد/)).toBeVisible();
    await proposalSelect.selectOption(lifecycleProposalId);
    await reviewerSelect.selectOption("mem_reviewer_beta");
    await operationsPage.getByRole("button", { name: "ثبت مأموریت" }).click();
    await expect(operationsPage.getByText(/مأموریت داوری ثبت شد/)).toBeVisible();

    const assignmentRows = await database.query<{ id: string; reviewer_user_id: string }>(
      `SELECT id, reviewer_user_id FROM review_assignment
       WHERE challenge_id=$1 ORDER BY reviewer_user_id`,
      [lifecycleChallengeId],
    );
    expect(assignmentRows.rows).toHaveLength(2);

    for (const assignment of assignmentRows.rows) {
      const reviewerContext = await browser.newContext(actorOptions);
      const reviewerPage = await reviewerContext.newPage();
      const reviewerEmail =
        assignment.reviewer_user_id === "usr_reviewer_alpha"
          ? "reviewer-alpha@synthetic.invalid"
          : "reviewer-beta@synthetic.invalid";
      await signInOidcFromProtectedRoute(
        reviewerPage,
        "/app/reviewer/assignments",
        "reviewer",
        reviewerEmail,
      );
      const card = reviewerPage.locator("article").filter({ hasText: assignment.id });
      await expect(card).toBeVisible();
      await expect(card).not.toContainText("نمونه‌سازی مرحله‌ای و ارزیابی در محل.");
      await card.getByLabel("صحت این اظهار و بررسی روابط ۲۴ ماه گذشته را تأیید می‌کنم.").check();
      await card.getByRole("button", { name: "ثبت نهایی اظهار" }).click();
      await expect(card.getByText("اظهار ثبت شد؛ مواد داوری باز شد.")).toBeVisible();
      await expect(card.getByText("نمونه‌سازی مرحله‌ای و ارزیابی در محل.")).toBeVisible();
      const scoreCriterion = card.locator(".app-review-score-criterion").first();
      await scoreCriterion.locator("select").selectOption("4");
      await scoreCriterion.locator("textarea").fill("شواهد کافی و ریسک اجرایی کنترل‌شده است.");
      await card.getByRole("button", { name: "ذخیره پیش‌نویس" }).click();
      await expect(card.getByText(/پیش‌نویس ذخیره شد/)).toBeVisible();
      await card.getByRole("button", { name: "ثبت نهایی داوری" }).click();
      await expect(card.getByText(/داوری نهایی ثبت شد/)).toBeVisible();
      await reviewerContext.close();
    }

    await operationsPage.reload();
    await expect(operationsPage.getByRole("heading", { name: "تخصیص داوران" })).toBeVisible();
    for (const assignment of assignmentRows.rows) {
      const card = operationsPage.locator("article").filter({ hasText: assignment.id });
      await expect(card.getByText("آماده قفل")).toBeVisible();
      await card.getByLabel("دلیل قفل").fill("داوری کامل و شواهد نسخه دقیق بررسی شد.");
      await card.getByRole("button", { name: "قفل داوری" }).click();
      await expect(operationsPage.getByText(/داوری قفل شد/)).toBeVisible();
    }

    await ownerPage.reload();
    await expect(ownerPage.getByText("آماده تصمیم")).toBeVisible();
    await ownerPage.getByRole("checkbox", { name: new RegExp(lifecycleTrackingCode) }).check();
    await ownerPage
      .getByLabel("دلیل کوتاه‌فهرست")
      .fill("دو داوری مستقل این پیشنهاد را تأیید کردند.");
    await ownerPage.getByRole("button", { name: "ثبت نسخه کوتاه‌فهرست" }).click();
    await expect(ownerPage.getByText("نسخه تازه کوتاه‌فهرست ثبت شد.")).toBeVisible();
    await ownerPage.getByLabel("استدلال نهایی").fill("این پیشنهاد بهترین تناسب اجرایی را دارد.");
    await ownerPage
      .getByRole("textbox", { name: new RegExp(`بازخورد برای ${lifecycleTrackingCode}`) })
      .fill("برای ورود به پرونده همکاری انتخاب شد.");

    const popupPromise = ownerPage.waitForEvent("popup");
    await ownerPage.getByRole("button", { name: "ورود تازه برای تصمیم" }).click();
    const popup = await popupPromise;
    await completeDexLogin(popup);
    await popup.waitForEvent("close");
    await expect(ownerPage.getByText("ورود تازه تأیید شد؛ اطلاعات فرم حفظ شده است.")).toBeVisible();
    await ownerPage.getByRole("button", { name: "ثبت تصمیم نهایی" }).click();
    await expect(ownerPage.getByRole("heading", { name: "تصمیم نهایی ثبت شده است" })).toBeVisible();
    await expect(ownerPage.getByText("انتخاب انجام شد")).toBeVisible();

    const evidence = await database.query<{
      case_id: string;
      decision_count: string;
      locked_reviews: string;
      outcomes: string;
      selected_state: string;
      audit_actions: string[];
      outbox_events: string[];
    }>(
      `SELECT cse.id AS case_id,
              (SELECT count(*) FROM decision d WHERE d.challenge_id=$1) AS decision_count,
              (SELECT count(*) FROM review_assignment a WHERE a.challenge_id=$1 AND a.state='locked') AS locked_reviews,
              (SELECT count(*) FROM decision_proposal_outcome o
                JOIN decision d ON d.id=o.decision_id WHERE d.challenge_id=$1) AS outcomes,
              proposal.state AS selected_state,
              ARRAY(
                SELECT action FROM audit_event
                WHERE (target_id IN ($1,$2) OR metadata->>'challenge_id'=$1) AND action IN (
                  'rubric.version.created','challenge.evaluation.started',
                  'review.assignment.created','review.assignment.accepted',
                  'review.draft.created','review.submitted','review.locked',
                  'challenge.shortlist.recorded','challenge:decision-step-up',
                  'challenge:decision-step-up:complete','challenge.decision.recorded'
                ) ORDER BY action
              ) AS audit_actions,
              ARRAY(
                SELECT event_type FROM outbox_event
                WHERE aggregate_id IN ($1,$2,cse.id)
                   OR payload->>'challenge_id'=$1
                ORDER BY event_type
              ) AS outbox_events
       FROM case_record cse
       JOIN proposal ON proposal.id=cse.proposal_id
       WHERE cse.challenge_id=$1 AND cse.proposal_id=$2`,
      [lifecycleChallengeId, lifecycleProposalId],
    );
    expect(evidence.rows[0]).toMatchObject({
      decision_count: "1",
      locked_reviews: "2",
      outcomes: "1",
      selected_state: "selected",
    });
    expect(evidence.rows[0]!.audit_actions).toEqual(
      expect.arrayContaining([
        "rubric.version.created",
        "challenge.evaluation.started",
        "review.assignment.created",
        "review.assignment.accepted",
        "review.draft.created",
        "review.submitted",
        "review.locked",
        "challenge.shortlist.recorded",
        "challenge:decision-step-up",
        "challenge:decision-step-up:complete",
        "challenge.decision.recorded",
      ]),
    );
    expect(evidence.rows[0]!.outbox_events).toEqual(
      expect.arrayContaining([
        "rubric.version.created",
        "challenge.evaluation.started",
        "review.assignment.created",
        "review.assignment.accepted",
        "review.draft.created",
        "review.submitted",
        "review.locked",
        "challenge.shortlist.recorded",
        "challenge.decision.recorded",
        "proposal.selected",
        "case.created",
      ]),
    );

    const solverContext = await browser.newContext(actorOptions);
    const solverPage = await solverContext.newPage();
    await signInSolver(solverPage, solverLogin);
    await solverPage.goto(`/app/solver/proposals/record/?id=${lifecycleProposalId}`);
    await expect(solverPage.getByRole("heading", { name: "پیشنهاد شما انتخاب شد" })).toBeVisible();
    await expect(solverPage.getByText("برای ورود به پرونده همکاری انتخاب شد.")).toBeVisible();
    await expect(solverPage.getByText(evidence.rows[0]!.case_id)).toBeVisible();

    await solverContext.close();
    await operationsContext.close();
    await ownerContext.close();
  });
});
