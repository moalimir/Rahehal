import { expect, test, type Page } from "@playwright/test";

/**
 * Manual-review fixture. Drives the *real* API through real signed-in sessions
 * to leave one challenge in every state a reviewer should be able to click.
 *
 * Deliberately not SQL inserts: every invariant worth checking — the four
 * gates, separation of duty, immutable versions, forward-only deadlines —
 * lives in the command layer, and rows written around it would prove nothing
 * and could reach states the commands cannot.
 *
 *   RAHHAL_CONNECTED_E2E=1 npm run seed:demo
 */
const connectedStack = process.env.RAHHAL_CONNECTED_E2E === "1";
const password = process.env.RAHHAL_E2E_PASSWORD ?? "rahhal-local-owner";
const orgWorkspaceId = "wsp_org_alpha";

const who = {
  owner: "owner-alpha@synthetic.invalid",
  technical: "approver-alpha@synthetic.invalid",
  legal: "platform-legal@synthetic.invalid",
  finance: "platform-finance@synthetic.invalid",
  quality: "platform-ops@synthetic.invalid",
  publisher: "publisher-alpha@synthetic.invalid",
} as const;

type Draft = Record<string, unknown>;

function brief(overrides: Draft): Draft {
  return {
    title: "عنوان پیش‌فرض",
    summary: "شرح یک‌جمله‌ای داخلی مسئله برای تیم سازمان.",
    category: "energy",
    location: "کارخانه شماره یک",
    desired_outcome: "نتیجه قابل سنجش و پایدار برای سازمان",
    current_state: "وضعیت فعلی به صورت دستی و بدون اندازه‌گیری انجام می‌شود.",
    consequence: "هزینه و توقف خط تولید افزایش می‌یابد.",
    expected_output: "طرح اجرایی همراه با پایلوت سنجش‌پذیر",
    success_criteria: [
      {
        id: "criterion-1",
        title: "بهبود سنجش‌پذیر",
        target: "حداقل ۲۰ درصد",
        method: "مقایسه خط پایه با نتیجه پایلوت",
      },
    ],
    in_scope: "خط تولید و تاسیسات جانبی آن",
    constraints: "استفاده از داده آزمایشی تأییدشده",
    organization_support: "کارشناس فنی و محیط آزمایشی",
    previous_attempts: "پایلوت قبلی انجام نشده است.",
    output_type: "pilot",
    sourcing_model: "public",
    allowed_applicant_types: ["individual", "expert-team"],
    work_mode: "hybrid",
    proposal_deadline: "2030-02-01T00:00:00.000Z",
    preferred_start_date: "2030-03-01T00:00:00.000Z",
    budget: { status: "fixed", amount_minor: 850_000_000, currency: "IRR" },
    visibility: "public",
    public_summary: "فراخوان عمومی برای ارائه راهکار اجرایی و قابل پایلوت در محیط واقعی.",
    ip_terms: "solver_license",
    contact: { name: "مالک مسئله", email: "owner@example.test", phone: "02100000000" },
    accuracy_confirmed: true,
    legal_notes: "یادداشت حقوقی داخلی و محرمانه.",
    ...overrides,
  };
}

async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  workspaceId: string = orgWorkspaceId,
) {
  return page.evaluate(
    async ([method, path, body, workspaceId]) => {
      const response = await fetch(path as string, {
        method: method as string,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-workspace-id": workspaceId as string,
          "idempotency-key": `seed-${Math.random().toString(36).slice(2)}-${Date.now()}`,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    [method, path, body ?? null, workspaceId] as const,
  );
}

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/auth/organization/login");
  await page.getByRole("button", { name: /ورود با ارائه‌دهنده هویت محلی/ }).click();
  await page.waitForURL(/\/dex\/auth/);
  await page.locator("#login").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#submit-login").click();
  await page.waitForURL(/\/app\/org\/challenges\/new/);
}

async function activateOrgWorkspace(page: Page) {
  const chooser = page.getByRole("heading", { name: "یک فضای سازمانی را فعال کنید" });
  await expect(chooser).toBeVisible();
  await page.locator("button.challenge-button--primary").first().click();
  await expect(chooser).toBeHidden();
}

const created: { label: string; id: string; state: string }[] = [];

test.describe("demo fixture", () => {
  test.skip(!connectedStack, "requires the connected stack (RAHHAL_CONNECTED_E2E=1)");
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test("creates challenges across every reviewable state", async ({ page }) => {
    await signIn(page, who.owner);
    await activateOrgWorkspace(page);

    // Everything the owner alone can reach, in one session.
    const make = async (label: string, draft: Draft, upto: number) => {
      const res = await api(page, "POST", "/api/v1/challenges", {
        expected_version: 0,
        draft,
      });
      expect(res.status, `create ${label}`).toBe(201);
      const id = String((res.body.data as { entity_id: string }).entity_id);
      const commands = [":request-triage", ":advance-formulation", ":request-approvals"];
      for (let step = 0; step < upto; step += 1) {
        const r = await api(page, "POST", `/api/v1/challenges/${id}${commands[step]}`, {
          expected_version: step + 1,
        });
        expect(r.status, `${label} ${commands[step]}`).toBe(200);
      }
      created.push({ label, id, state: ["draft", "triage", "formulation", "approvals"][upto] });
      return id;
    };

    await make("Draft — still being written", brief({ title: "کاهش ضایعات در خط بسته‌بندی" }), 0);
    await make("Triage — awaiting screening", brief({ title: "پایش هوشمند مصرف انرژی" }), 1);
    await make("Formulation — being sharpened", brief({ title: "بهینه‌سازی زنجیره سرد" }), 2);

    const partial = await make(
      "Approvals — 2 of 4 gates",
      brief({ title: "کاهش توقف خط نورد" }),
      3,
    );
    const openCall = await make("Published — open", brief({ title: "بازیابی آب فرایندی" }), 3);
    const paused = await make("Published — paused", brief({ title: "پایش خوردگی مخازن" }), 3);
    const closedCall = await make("Published — closed", brief({ title: "کاهش مصرف بخار" }), 3);
    const extended = await make(
      "Published — deadline extended",
      brief({ title: "تشخیص نشتی هوای فشرده" }),
      3,
    );
    const confidential = await make(
      "Published — NDA only, never public",
      brief({ title: "فرمولاسیون محرمانه پوشش", visibility: "nda", public_summary: "" }),
      3,
    );

    // Gates. Four distinct actors; the org approver holds only `technical`.
    const gates = [
      [who.technical, "technical", true],
      [who.legal, "legal", false],
      [who.finance, "finance", false],
      [who.quality, "quality", false],
    ] as const;
    const fullyApproved = [openCall, paused, closedCall, extended, confidential];

    for (const [email, gate, orgSide] of gates) {
      await signIn(page, email);
      if (orgSide) await activateOrgWorkspace(page);
      for (const id of fullyApproved) {
        const r = await api(page, "POST", `/api/v1/challenges/${id}/approvals:record`, {
          expected_version: 4,
          gate,
          decision: "approved",
          reason: `تأیید دروازه ${gate} برای بررسی دستی.`,
        });
        expect(r.status, `${gate} on ${id}`).toBe(200);
      }
      // The partially-approved one deliberately stops after two gates.
      if (gate === "technical" || gate === "legal") {
        const r = await api(page, "POST", `/api/v1/challenges/${partial}/approvals:record`, {
          expected_version: 4,
          gate,
          decision: "approved",
          reason: `تأیید دروازه ${gate}؛ دو دروازه دیگر عمداً باقی مانده است.`,
        });
        expect(r.status, `${gate} on partial`).toBe(200);
      }
    }

    // Publish, then exercise the lifecycle commands that have no UI yet.
    await signIn(page, who.publisher);
    await activateOrgWorkspace(page);
    for (const id of fullyApproved) {
      const r = await api(page, "POST", `/api/v1/challenges/${id}:publish`, {
        expected_version: 4,
      });
      expect(r.status, `publish ${id}`).toBe(200);
    }

    expect(
      (
        await api(page, "POST", `/api/v1/challenges/${paused}:pause`, {
          expected_version: 5,
          reason: "متوقف شده برای بازبینی دستی دامنه.",
        })
      ).status,
    ).toBe(200);

    expect(
      (
        await api(page, "POST", `/api/v1/challenges/${closedCall}:close`, {
          expected_version: 5,
          reason: "مهلت به پایان رسید و فراخوان بسته شد.",
        })
      ).status,
    ).toBe(200);

    expect(
      (
        await api(page, "POST", `/api/v1/challenges/${extended}:extend-deadline`, {
          expected_version: 5,
          proposal_deadline: "2030-06-01T00:00:00.000Z",
          reason: "تمدید به درخواست حل‌کنندگان بالقوه.",
        })
      ).status,
    ).toBe(200);

    for (const row of created) {
      console.log(`${row.id}  ${row.label}`);
    }
  });
});
