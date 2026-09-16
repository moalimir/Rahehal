import { expect, test, type Page } from "@playwright/test";

/**
 * B7 acceptance ([80] §5): org drafts → ops triage → approvals with four
 * distinct approvers → publish; the public visits the published challenge.
 * Plus the three named negative paths.
 *
 * Requires the connected stack (PostgreSQL, API in `postgres` mode, local Dex,
 * and the web built with RAHHAL_WEB_RUNTIME=network):
 *
 *   RAHHAL_CONNECTED_E2E=1 npm run test:browser:b7
 *
 * Identities are the repository's synthetic local fixtures; `@synthetic.invalid`
 * is a reserved, unroutable domain and the shared password lives in
 * infra/local/dex/config.yaml. Nothing here is a real credential.
 *
 * Triage, every gate, and publish are clicked in the UI. Platform actors hold
 * no membership in the org's workspace, so they enter their sole platform
 * workspace and open the governance page with the owning workspace named in
 * the URL; B8a's
 * platform-scoped brief resolves it through the narrow standing authority in
 * ADR-0015. Draft creation and the owner-controlled stage transitions stay as
 * API calls from inside the signed-in page — they are B1 surface that B7 does
 * not re-prove, and doing them through the multi-step form would make this gate
 * slow and brittle without testing anything B1 has not.
 */
const connectedStack = process.env.RAHHAL_CONNECTED_E2E === "1";
const password = process.env.RAHHAL_E2E_PASSWORD ?? "rahhal-local-owner";
const orgWorkspaceId = "wsp_org_alpha";

const identities = {
  owner: "owner-alpha@synthetic.invalid",
  technical: "approver-alpha@synthetic.invalid",
  legal: "platform-legal@synthetic.invalid",
  finance: "platform-finance@synthetic.invalid",
  quality: "platform-ops@synthetic.invalid",
  publisher: "publisher-alpha@synthetic.invalid",
} as const;

const gateLabels = {
  technical: "تأیید فنی",
  legal: "تأیید حقوقی",
  finance: "تأیید مالی",
  quality: "دروازه کیفیت",
} as const;

const readyContent = {
  title: "کاهش مصرف آب در خط رنگ",
  summary: "مصرف آب در خط رنگ بالاتر از استاندارد داخلی است.",
  category: "energy",
  location: "کارخانه شماره دو",
  desired_outcome: "کاهش پایدار مصرف آب با حفظ کیفیت رنگ",
  current_state: "شست‌وشوی دستی با مصرف بالا و کنترل نشده انجام می‌شود.",
  expected_output: "طرح اجرایی به همراه پایلوت سنجش‌پذیر",
  success_criteria: [
    {
      id: "criterion-1",
      title: "کاهش مصرف",
      target: "حداقل ۲۰ درصد",
      method: "مقایسه خط پایه و نتیجه پایلوت",
    },
  ],
  in_scope: "خط رنگ و تاسیسات جانبی آن",
  output_type: "pilot",
  sourcing_model: "public",
  allowed_applicant_types: ["individual", "expert-team"],
  work_mode: "hybrid",
  // The end of 2030-02-01 in Tehran, as the intake form would write it.
  proposal_deadline: "2030-02-01T20:29:59.999Z",
  visibility: "public",
  public_summary: "فراخوان عمومی برای کاهش مصرف آب در خط رنگ کارخانه.",
  ip_terms: "solver_license",
  contact: { name: "مالک مسئله", email: "owner@example.test", phone: "02100000000" },
  accuracy_confirmed: true,
} as const;

type ApiResult = { status: number; body: Record<string, unknown> };

/** Issues an API call from inside the page, carrying its real session cookie. */
async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  workspaceId: string = orgWorkspaceId,
): Promise<ApiResult> {
  return page.evaluate(
    async ([method, path, body, workspaceId]) => {
      const response = await fetch(path as string, {
        method: method as string,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-workspace-id": workspaceId as string,
          "idempotency-key": `b7-${Math.random().toString(36).slice(2)}-${Date.now()}`,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    [method, path, body ?? null, workspaceId] as const,
  );
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/organization/login");
  await page.getByRole("button", { name: /ادامه برای ورود امن سازمانی/ }).click();
  await page.waitForURL(/\/dex\/auth/);
  await page.locator("#login").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#submit-login").click();
  const isPlatformActor =
    email === identities.legal || email === identities.finance || email === identities.quality;
  await page.waitForURL(
    isPlatformActor ? /\/app\/ops\/publication\/?$/ : /\/app\/org\/challenges\/?$/,
  );
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

test.describe("B7 governed challenge journey", () => {
  test.skip(!connectedStack, "requires the connected stack (RAHHAL_CONNECTED_E2E=1)");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let challengeId = "";

  test("M1 owner publishes directly from preview and leaves an inspectable public example", async ({
    page,
    browser,
  }) => {
    await signIn(page, identities.owner);
    await page.goto("/app/org/challenges/new/");
    await page.getByLabel("عنوان مسئله").fill("نمونه انتشار مستقیم مالک — M1");
    await page.getByLabel("شرح یک‌جمله‌ای مشکل").fill(readyContent.summary);
    await page.getByLabel("دسته‌بندی اصلی").selectOption({ index: 1 });
    await page.getByLabel("واحد، سایت یا محل درگیر").fill(readyContent.location);
    await page.getByLabel("مالک مسئله").fill("مالک مصنوعی");
    await page.getByLabel("نتیجه‌ای که سازمان به‌دنبال آن است").fill(readyContent.desired_outcome);
    await page.getByRole("button", { name: "ذخیره و ادامه", exact: true }).click();
    await page.waitForURL(/\/record\/edit\/\?id=chl_/);
    const id = new URL(page.url()).searchParams.get("id")!;
    await page.getByLabel("شرح وضعیت فعلی").fill(readyContent.current_state);
    await page.getByLabel("خروجی نهایی مورد انتظار").fill(readyContent.expected_output);
    await page.getByRole("button", { name: "افزودن معیار" }).click();
    await page.getByLabel("عنوان معیار").fill(readyContent.success_criteria[0].title);
    await page.getByLabel("مقدار هدف").fill(readyContent.success_criteria[0].target);
    await page.getByLabel("روش اندازه‌گیری").fill(readyContent.success_criteria[0].method);
    await page.getByLabel("موارد داخل دامنه").fill(readyContent.in_scope);
    await page.getByRole("button", { name: "ذخیره و ادامه", exact: true }).click();
    await page.getByRole("radio", { name: "پایلوت", exact: true }).check();
    await page.getByRole("radio", { name: "عمومی", exact: true }).check();
    await page.getByRole("checkbox", { name: "متخصص مستقل", exact: true }).check();
    await page.getByRole("checkbox", { name: "تیم تخصصی", exact: true }).check();
    await page.getByRole("radio", { name: "دورکار", exact: true }).check();
    await page.getByLabel("مهلت دریافت پیشنهاد (تا پایان روز، به وقت تهران)").fill("2030-02-01");
    await page.getByRole("radio", { name: "دریافت پیشنهاد قیمت", exact: true }).check();
    await page.getByRole("button", { name: "ذخیره و ادامه", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "دسترسی، مالکیت و ارسال", exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "عمومی", exact: true }).check();
    await page.getByLabel("خلاصه عمومی مسئله").fill(readyContent.public_summary);
    await page
      .getByRole("radio", {
        name: "متعلق به ارائه‌دهنده و دارای مجوز استفاده برای سازمان",
        exact: true,
      })
      .check();
    await page.getByLabel("نام مسئول پیگیری").fill(readyContent.contact.name);
    await page.getByLabel("ایمیل مسئول پیگیری").fill(readyContent.contact.email);
    await page.getByLabel("شماره تماس").fill(readyContent.contact.phone);
    await page
      .getByRole("checkbox", {
        name: "صحت اطلاعات و اختیار ارسال این پرونده از طرف سازمان را تأیید می‌کنم.",
      })
      .check();
    // Immediate preview must save the final fields without waiting for autosave.
    await page.getByRole("button", { name: "مشاهده پیش‌نمایش", exact: true }).click();
    await page.waitForURL(new RegExp(`/preview/\\?id=${id}`));
    await expect(page.getByRole("button", { name: "انتشار چالش", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "نمایش اطلاعات عمومی" }).click();
    await expect(page.getByText(readyContent.public_summary, { exact: true })).toBeVisible();
    for (const value of [
      readyContent.summary,
      readyContent.desired_outcome,
      readyContent.expected_output,
    ]) {
      expect(await page.locator("body").textContent()).not.toContain(value);
    }
    await page.getByRole("button", { name: "انتشار چالش", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "انتشار این نسخه از چالش؟" })).toBeVisible();
    await page.getByRole("button", { name: "تأیید و انتشار", exact: true }).click();
    await page.waitForURL(new RegExp(`/governance/\\?id=${id}`));
    await expect(page.getByRole("heading", { name: "انتشار و مدیریت چالش" })).toBeVisible();
    await page.reload();
    const liveCall = page.getByRole("region", { name: "مدیریت فراخوان منتشرشده" });
    await page.getByLabel("دلیل اقدام").fill("آزمون توقف به دست مالک");
    await page.getByRole("button", { name: "توقف موقت" }).click();
    await expect(liveCall).toHaveAttribute("data-publication-state", "paused");
    await page.getByLabel("دلیل اقدام").fill("بازگشایی نمونه برای بررسی دستی");
    await page.getByRole("button", { name: "ازسرگیری فراخوان" }).click();
    await expect(liveCall).toHaveAttribute("data-publication-state", "open");
    const resource = await api(page, "GET", `/api/v1/challenges/${id}`);
    expect(resource.body.data).toMatchObject({
      stage: "published",
      approvals: [],
      publication_state: "open",
    });
    const anonymous = await browser.newContext();
    try {
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`/challenges/record/?id=${id}`);
      await expect(
        publicPage.getByRole("heading", { name: "نمونه انتشار مستقیم مالک — M1" }),
      ).toBeVisible();
      await expect(publicPage.getByText(readyContent.public_summary)).toBeVisible();
      expect(await publicPage.locator("body").textContent()).not.toContain(readyContent.summary);
    } finally {
      await anonymous.close();
    }
  });

  test("org drafts, four distinct actors clear the gates, and the publisher publishes", async ({
    page,
  }) => {
    await signIn(page, identities.owner);

    const created = await api(page, "POST", "/api/v1/challenges", {
      expected_version: 0,
      draft: readyContent,
    });
    expect(created.status).toBe(201);
    challengeId = String((created.body.data as { entity_id: string }).entity_id);

    const requestedTriage = await api(
      page,
      "POST",
      `/api/v1/challenges/${challengeId}:request-triage`,
      { expected_version: 1 },
    );
    expect(requestedTriage.status).toBe(200);

    // Platform ops owns the visible screening action. Once it advances the
    // record, its purpose-scoped brief disappears instead of widening into an
    // organization read.
    await signOut(page);
    await signIn(page, identities.quality);
    await page.goto("/app/ops/publication");
    await page.locator(`a[href*="id=${challengeId}"]`).click();
    await page.getByRole("button", { name: "تأیید غربالگری و شروع صورت‌بندی" }).click();
    await page.waitForURL(/\/app\/ops\/publication/);

    await signOut(page);
    await signIn(page, identities.owner);
    const requestedApprovals = await api(
      page,
      "POST",
      `/api/v1/challenges/${challengeId}:request-approvals`,
      { expected_version: 3 },
    );
    expect(requestedApprovals.status).toBe(200);

    // Negative: delegated technical approvers still cannot publish.
    // Authorization is checked before the gates.
    await signOut(page);
    await signIn(page, identities.technical);
    const ownerPublish = await api(page, "POST", `/api/v1/challenges/${challengeId}:publish`, {
      expected_version: 4,
    });
    expect(ownerPublish.status).toBe(403);

    // Negative: no gate is recorded yet, so even the right role cannot publish.
    await signOut(page);
    await signIn(page, identities.publisher);
    const earlyPublish = await api(page, "POST", `/api/v1/challenges/${challengeId}:publish`, {
      expected_version: 4,
    });
    expect(earlyPublish.status).toBe(409);

    // Four gates, four distinct actors. legal/finance/quality are platform
    // roles with no membership in wsp_org_alpha: they start from their own
    // role-scoped queue and open the allowlisted cross-tenant approval brief.
    const gates = [
      [identities.technical, "technical", true],
      [identities.legal, "legal", false],
      [identities.finance, "finance", false],
      [identities.quality, "quality", false],
    ] as const;
    for (const [email, gate, orgSide] of gates) {
      await signOut(page);
      await signIn(page, email);
      if (orgSide) {
        await page.goto(`/app/org/challenges/record/governance/?id=${challengeId}`);
      } else {
        await page.goto("/app/ops/publication");
        await page.locator(`a[href*="id=${challengeId}"]`).click();
      }

      const reason = page.getByLabel(/دلیل ثبت/);
      await expect(reason).toBeVisible();
      await reason.fill(`تأیید دروازه ${gate}.`);
      await page.getByRole("button", { name: new RegExp(`ثبت`) }).click();
      const gateRow = page.getByRole("listitem").filter({ hasText: gateLabels[gate] });
      await expect(gateRow.locator('[data-decision="approved"]')).toContainText("تأییدشده");
      await expect(reason).toBeHidden();

      if (gate === "technical") {
        // Separation of duty: one actor may not hold two required gates on the
        // same version, so no second form is offered after recording one.
        await expect(page.getByLabel(new RegExp(`دلیل ثبت`))).toBeHidden();
        const secondGate = await api(
          page,
          "POST",
          `/api/v1/challenges/${challengeId}/approvals:record`,
          {
            expected_version: 4,
            gate: "quality",
            decision: "approved",
            reason: "تلاش برای ثبت دروازه دوم توسط همان کاربر.",
          },
        );
        expect(secondGate.status).not.toBe(200);
      }
    }

    // The publisher publishes through the UI: this is the browser reaching
    // server authority, which is what the gate exists to prove.
    await signOut(page);
    await signIn(page, identities.publisher);
    await page.goto(`/app/org/challenges/record/governance/?id=${challengeId}`);
    const publish = page.getByRole("button", { name: "انتشار پرونده" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText("این پرونده منتشر شده است.")).toBeVisible();

    // B6 is also a visible publisher workflow. Exercise reversible controls
    // and deadline extension, then leave the call open for the public test.
    const liveCall = page.getByRole("region", { name: "مدیریت فراخوان منتشرشده" });
    await expect(liveCall).toHaveAttribute("data-publication-state", "open");
    const publicationReason = page.getByLabel("دلیل اقدام");
    await publicationReason.fill("توقف کوتاه برای هماهنگی پاسخ‌گویی سازمان.");
    await page.getByRole("button", { name: "توقف موقت" }).click();
    await expect(liveCall).toHaveAttribute("data-publication-state", "paused");

    await page.getByLabel("دلیل اقدام").fill("هماهنگی انجام شد و پذیرش می‌تواند ادامه یابد.");
    await page.getByRole("button", { name: "ازسرگیری فراخوان" }).click();
    await expect(liveCall).toHaveAttribute("data-publication-state", "open");

    await page.getByLabel("مهلت تازه").fill("2030-03-01T12:00");
    await page.getByLabel("دلیل تمدید").fill("فرصت بیشتر برای دریافت پیشنهادهای کامل.");
    await page.getByRole("button", { name: "تمدید مهلت" }).click();
    await expect(page.getByText("مهلت تازه با موفقیت ثبت شد.")).toBeVisible();

    await page.getByLabel("دلیل اقدام").fill("پایان یا لغو فراخوان نیازمند تأیید صریح ناشر است.");
    await page.getByRole("button", { name: "بستن فراخوان" }).click();
    await expect(page.getByRole("dialog", { name: "بستن قطعی فراخوان؟" })).toBeVisible();
    await page.getByRole("button", { name: "انصراف" }).click();
    await page.getByRole("button", { name: "لغو فراخوان" }).click();
    await expect(page.getByRole("dialog", { name: "لغو قطعی فراخوان؟" })).toBeVisible();
    await page.getByRole("button", { name: "انصراف" }).click();
  });

  test("the public sees the published projection and nothing confidential", async ({ browser }) => {
    expect(challengeId).not.toBe("");
    // A fresh context: no cookies, so this is a genuinely anonymous reader.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/challenges/");

    // B5's catalogue and record both read the public projection; neither
    // maps through the richer fixture view model.
    const catalogueLink = page
      .locator(`a[href*="id=${challengeId}"]`)
      .filter({ hasText: readyContent.title })
      .first();
    await expect(catalogueLink).toBeVisible();
    await catalogueLink.click();
    await page.waitForURL(new RegExp(`/challenges/record/\\?id=${challengeId}`));

    await expect(page.getByRole("heading", { name: readyContent.title })).toBeVisible();
    await expect(page.getByText(readyContent.public_summary)).toBeVisible();

    // Every confidential field must be structurally absent, not merely hidden.
    const body = (await page.locator("body").innerText()) ?? "";
    for (const confidential of [
      readyContent.summary,
      readyContent.current_state,
      readyContent.expected_output,
      readyContent.contact.email,
      readyContent.contact.phone,
    ]) {
      expect(body, `public page must not contain ${confidential}`).not.toContain(confidential);
    }
    await context.close();
  });

  test("unknown records stay non-enumerating and connected mode never falls back to fixtures", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/challenges/record/?id=chl_absent_00000000001");
    await expect(page.getByRole("heading", { name: "این فراخوان در دسترس نیست" })).toBeVisible();
    const fixtureResponse = await page.goto("/challenges/smart-water-recovery/");
    expect(fixtureResponse?.status()).toBe(404);
    await context.close();
  });
});
