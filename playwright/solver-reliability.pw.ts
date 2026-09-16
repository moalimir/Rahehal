import { expect, test, type Page } from "@playwright/test";
import type {
  MeResource,
  ProposalResource,
  ChallengePublicProjectionResource,
} from "@rahhal/contracts";

// Synthetic, retained acceptance examples. No reset, SQL mutation, or real outbound delivery.
// Uses the running network web/API/PostgreSQL and the local development OTP provider.
test.skip(process.env.RAHHAL_CONNECTED_E2E !== "1", "requires the connected local stack");
test.setTimeout(180_000);

async function api(page: Page, path: string, method = "GET", body?: unknown, workspace?: string) {
  const response = await page.request.fetch(path, {
    method,
    data: body,
    headers: {
      origin: new URL(page.url()).origin,
      "idempotency-key": `solver-qa-${crypto.randomUUID()}`,
      ...(workspace ? { "x-workspace-id": workspace } : {}),
    },
  });
  return { status: response.status(), body: await response.json() };
}

async function me(page: Page): Promise<MeResource> {
  return (await api(page, "/api/v1/me")).body.data;
}

async function signup(page: Page, email: string, team = false) {
  await page.goto("/auth/login/?role=solver");
  await page.getByRole("button", { name: "رایانامه", exact: true }).click();
  await page.getByRole("textbox", { name: /رایانامه/ }).fill(email);
  await page.getByRole("button", { name: "دریافت کد و ادامه" }).click();
  await page.getByRole("textbox", { name: "کد تأیید", exact: true }).fill("00000");
  await page.getByRole("button", { name: "تأیید و ورود" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /نشست یا دسترسی/ })).toBeVisible();
  await page.getByRole("textbox", { name: "کد تأیید", exact: true }).fill("۱۲۳۴۵");
  await page.getByRole("button", { name: "تأیید و ورود" }).click();
  await page
    .getByRole("textbox", { name: /نام و نام خانوادگی/ })
    .fill("حل‌گر نمونه اطمینان پیشنهاد");
  if (team) await page.getByRole("button", { name: /با ساخت یک تیم/ }).click();
  await page
    .getByRole("button", { name: team ? "فعال‌سازی و ساخت تیم" : "فعال‌سازی و ورود", exact: true })
    .click();
  await expect(page).toHaveURL(
    team ? /\/app\/solver\/teams\/?\?create=1/ : /\/app\/solver\/dashboard/,
  );
  return me(page);
}

async function publicCall(page: Page) {
  const calls = (await api(page, "/api/v1/public/challenges")).body.data
    .items as ChallengePublicProjectionResource[];
  const call = calls.find(
    (item) =>
      item.title === "نمونه انتشار مستقیم مالک — M1" &&
      item.state === "open" &&
      !item.verification_required &&
      !item.nda_required &&
      !item.document_gate_required,
  );
  expect(call, "retained M1 synthetic public challenge").toBeTruthy();
  return call!;
}

async function createProposal(page: Page, challenge: string, workspace: string) {
  const result = await api(
    page,
    "/api/v1/proposals",
    "POST",
    { expected_version: 0, challenge_id: challenge },
    workspace,
  );
  expect(result.status, JSON.stringify(result.body.error)).toBe(201);
  const id = result.body.data.entity_id as string;
  await page.goto(`/app/solver/proposals/record/edit/?id=${id}`);
  await expect(page.getByRole("heading", { name: "تدوین پیشنهاد" })).toBeVisible();
  return id;
}

async function fillProposal(page: Page, title: string) {
  await page.getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true }).fill(title);
  for (const [name, text] of [
    ["درک مسئله *", "مصرف آب خط تولید باید به صورت مستمر اندازه‌گیری و بهینه شود."],
    ["ارزش پیشنهادی *", "کاهش هزینه عملیاتی با پایش و تنظیم پیوسته مصرف آب در کارخانه."],
    ["رویکرد فنی *", "نصب حسگر و تحلیل داده‌های آزمایشی برای کنترل مصرف در هر مرحله."],
    ["سنجه‌های موفقیت *", "کاهش بیست درصدی مصرف نسبت به خط پایه"],
    ["زمان نمونه اولیه (هفته) *", "۶"],
    ["مدت اجرا (هفته) *", "۱۲"],
    ["وضعیت مالکیت فکری *", "مجوز بهره‌برداری برای سازمان"],
    ["بودجه پیشنهادی (ریال) *", "1000000"],
  ])
    await page.getByRole("textbox", { name, exact: true }).fill(text!);
  for (const label of [
    "شرایط محرمانگی را می‌پذیرم",
    "وضعیت تعارض منافع را اعلام می‌کنم",
    "شرایط مالکیت فکری را می‌پذیرم",
    "صحت اطلاعات و اختیار ارسال را تأیید می‌کنم",
  ])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
}

test("signup → personal proposal → optional team → invitation acceptance → team proposal", async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.project.name}`;
  const email = `solver-owner-${suffix}@synthetic.invalid`;
  const identity = await signup(page, email);
  expect(identity.workspaces.filter((item) => item.kind === "individual")).toHaveLength(1);
  expect(identity.workspaces.filter((item) => item.kind === "team")).toHaveLength(0);
  const personal = identity.active_context!.workspace_id;
  const challenge = await publicCall(page);
  const proposalId = await createProposal(page, challenge.challenge_id, personal);

  // A partial draft saves; a failed write does not discard its text.
  const title = page.getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true });
  await title.fill("پیش‌نویس ناقص برای بررسی دستی");
  const save = page.getByRole("button", { name: "ذخیره نسخه", exact: true });
  await page.route(`**/api/v1/proposals/${proposalId}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await save.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "متن شما در این صفحه حفظ شده است" }),
  ).toBeVisible();
  await expect(title).toHaveValue("پیش‌نویس ناقص برای بررسی دستی");
  await page.unroute(`**/api/v1/proposals/${proposalId}`);
  await save.click();
  await expect(page.getByText("نسخه پیش‌نویس ذخیره شد.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("پیش‌نویس ناقص برای بررسی دستی");

  const finalTitle = `پیشنهاد شخصی — آخرین ویرایش ${suffix}`;
  await fillProposal(page, finalTitle);
  await expect(page.getByRole("textbox", { name: "فناوری‌ها", exact: true })).toHaveCount(0);
  const submit = page.getByRole("button", { name: "ارسال نهایی و قفل نسخه", exact: true });
  const submitKeys: string[] = [];
  // The API COMMITTED the submission, but its first response is lost.
  await page.route(`**/api/v1/proposals/${proposalId}:submit`, async (route) => {
    submitKeys.push(route.request().headers()["idempotency-key"]!);
    if (submitKeys.length === 1) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await submit.click();
  await expect(
    page.getByText("نتیجه ارسال مشخص نیست؛ برای بررسی، ارسال را دوباره بزنید."),
  ).toBeVisible();
  await expect(title).toBeDisabled();
  await submit.click();
  await expect(page).toHaveURL(/\/proposals\/record\/preview/);
  expect(submitKeys).toHaveLength(2);
  expect(submitKeys[0]).toBe(submitKeys[1]);
  const submitted = (await api(page, `/api/v1/proposals/${proposalId}`, "GET", undefined, personal))
    .body.data as ProposalResource;
  expect(submitted.state).toBe("submitted");
  expect(submitted.content.title).toBe(finalTitle);
  expect(submitted.versions.filter((item) => item.locked)).toHaveLength(1);
  expect(submitted.versions).toHaveLength(4);
  await expect(page.getByRole("heading", { name: "تاریخچه نسخه‌ها" })).toBeVisible();

  // Team creation is optional and possible AFTER individual signup/submission.
  await page.goto("/app/solver/teams/?create=1");
  const teamName = `تیم نمونه اطمینان ${suffix}`;
  await page.getByRole("textbox", { name: /نام تیم/ }).fill(teamName);
  await page.getByRole("button", { name: "ساخت تیم و ورود به آن" }).click();
  await expect(page).toHaveURL(/\/app\/solver\/dashboard/);
  const teamIdentity = await me(page);
  const teamId = teamIdentity.active_context!.workspace_id;
  expect(teamIdentity.workspaces.some((item) => item.id === personal)).toBe(true);
  expect(teamIdentity.workspaces.find((item) => item.id === teamId)?.kind).toBe("team");

  const colleague = await browser.newPage({
    baseURL: "http://localhost:3000",
    viewport: testInfo.project.use.viewport,
  });
  const colleagueEmail = `solver-member-${suffix}@synthetic.invalid`;
  const memberIdentity = await signup(colleague, colleagueEmail);
  const denied = await api(
    colleague,
    `/api/v1/proposals/${proposalId}`,
    "GET",
    undefined,
    memberIdentity.active_context!.workspace_id,
  );
  expect(denied.status).toBe(404);

  await page.goto("/app/solver/teams/");
  const recipient = page.getByRole("textbox", { name: "رایانامه گیرنده", exact: true });
  await recipient.fill(colleagueEmail);
  await page.getByRole("textbox", { name: /دامنه همکاری/ }).fill("تدوین بخش فنی پیشنهاد");
  await page
    .getByRole("textbox", { name: "پیام دعوت", exact: true })
    .fill("برای همکاری در تدوین راهکار این چالش به تیم بپیوندید.");
  await page.route("**/api/v1/solver/team/invitations", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "ارسال دعوت", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /ارتباط با سرویس/ })).toBeVisible();
  await expect(recipient).toHaveValue(colleagueEmail);
  await page.unroute("**/api/v1/solver/team/invitations");
  await page.getByRole("button", { name: "ارسال دعوت", exact: true }).click();
  await expect(page.getByText("دعوت ارسال شد", { exact: true })).toBeVisible();
  await expect(recipient).toHaveValue("");

  await colleague.goto("/app/solver/teams/");
  await colleague.getByRole("button", { name: "پذیرش دعوت", exact: true }).click();
  await expect(colleague.getByText("دعوت پذیرفته شد", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await me(colleague)).workspaces.some((item) => item.id === teamId))
    .toBe(true);
  await expect(colleague.getByRole("button", { name: "پذیرش دعوت", exact: true })).toHaveCount(0);
  await expect(page.getByText("دعوت ارسال شد", { exact: true })).toBeHidden({ timeout: 8000 });

  const teamProposalId = await createProposal(page, challenge.challenge_id, teamId);
  await page
    .getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true })
    .fill("کار حفظ‌شده هنگام تغییر فضای کاری");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "انتخاب فضای کاری", exact: true })
    .selectOption(personal);
  await expect(page.getByRole("combobox", { name: "انتخاب فضای کاری", exact: true })).toHaveValue(
    teamId,
  );
  await expect(page.getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true })).toHaveValue(
    "کار حفظ‌شده هنگام تغییر فضای کاری",
  );
  expect((await me(page)).active_context!.workspace_id).toBe(teamId);
  const teamTitle = `پیشنهاد تیمی — آخرین ویرایش ${suffix}`;
  await fillProposal(page, teamTitle);
  await page.getByRole("button", { name: "ارسال نهایی و قفل نسخه", exact: true }).click();
  await expect(page).toHaveURL(/\/proposals\/record\/preview/);
  await expect(page.getByRole("heading", { name: teamTitle, exact: true })).toBeVisible();
  const teamProposal = (
    await api(page, `/api/v1/proposals/${teamProposalId}`, "GET", undefined, teamId)
  ).body.data as ProposalResource;
  expect(teamProposal.state).toBe("submitted");
  expect(teamProposal.owner_workspace_kind).toBe("team");
  expect(teamProposal.content.title).toBe(teamTitle);
  await page.screenshot({
    path: `output/playwright/solver-${testInfo.project.name}.png`,
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      email,
      colleagueEmail,
      personal,
      teamId,
      teamName,
      challengeId: challenge.challenge_id,
      proposalId,
      teamProposalId,
    }),
  );
  await colleague.close();
});

test("stale-save conflict retains edits and does not overwrite a concurrent version", async ({
  page,
}) => {
  const identity = await signup(page, `solver-conflict-${Date.now()}@synthetic.invalid`, true);
  expect(identity.workspaces.filter((item) => item.kind === "team")).toHaveLength(0);
  const workspace = identity.active_context!.workspace_id;
  const challenge = await publicCall(page);
  const proposalId = await createProposal(page, challenge.challenge_id, workspace);
  const title = page.getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true });
  await title.fill("ویرایش محلی حفظ‌شده در تعارض");
  const concurrent = await api(
    page,
    `/api/v1/proposals/${proposalId}`,
    "PATCH",
    { expected_version: 1, patch: { title: "ویرایش هم‌زمان ذخیره‌شده" } },
    workspace,
  );
  expect(concurrent.status).toBe(200);
  await page.getByRole("button", { name: "ارسال نهایی و قفل نسخه", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /متن شما حفظ شده/ })).toBeVisible();
  await expect(title).toHaveValue("ویرایش محلی حفظ‌شده در تعارض");
  const stored = (await api(page, `/api/v1/proposals/${proposalId}`, "GET", undefined, workspace))
    .body.data;
  expect(stored.content.title).toBe("ویرایش هم‌زمان ذخیره‌شده");
  expect(stored.state).toBe("draft");
});

test("clarification feedback → revision → latest edits resubmitted with immutable history", async ({
  page,
  browser,
}, testInfo) => {
  const identity = await signup(page, `solver-revision-${Date.now()}@synthetic.invalid`);
  const workspace = identity.active_context!.workspace_id;
  const challenge = await publicCall(page);
  const proposalId = await createProposal(page, challenge.challenge_id, workspace);
  await fillProposal(page, "پیشنهاد اولیه برای بررسی و اصلاح");
  await page.getByRole("button", { name: "ارسال نهایی و قفل نسخه", exact: true }).click();
  await expect(page).toHaveURL(/\/proposals\/record\/preview/);
  const original = (await api(page, `/api/v1/proposals/${proposalId}`, "GET", undefined, workspace))
    .body.data as ProposalResource;
  const owner = await browser.newPage({
    baseURL: "http://localhost:3000",
    viewport: testInfo.project.use.viewport,
  });
  await owner.goto("/auth/organization/login/");
  await owner.getByRole("button", { name: /ادامه برای ورود امن سازمانی/ }).click();
  await owner.waitForURL(/\/dex\/auth/);
  await owner.locator("#login").fill("owner-alpha@synthetic.invalid");
  await owner.locator("#password").fill("rahhal-local-owner");
  await owner.locator("#submit-login").click();
  await owner.waitForURL(/localhost:3000/);
  const orgPath = `/api/v1/organization/proposals/${proposalId}`;
  const orgCommand = async (action: string, body: object = {}) => {
    const current = await api(owner, orgPath, "GET", undefined, "wsp_org_alpha");
    expect(current.status).toBe(200);
    const changed = await api(
      owner,
      `${orgPath}:${action}`,
      "POST",
      { expected_version: current.body.data.version, ...body },
      "wsp_org_alpha",
    );
    expect(changed.status, JSON.stringify(changed.body.error)).toBe(200);
  };
  await orgCommand("start-eligibility-review");
  await orgCommand("decide-eligibility", {
    decision: "eligible",
    reason: "شرایط مشارکت و محتوای اولیه بررسی و تأیید شد.",
  });
  await orgCommand("request-clarification", { question: "خط پایه مصرف چگونه محاسبه می‌شود؟" });
  await page.goto(`/app/solver/proposals/record/edit/?id=${proposalId}`);
  await page
    .getByRole("textbox", { name: "پاسخ شما", exact: true })
    .fill("میانگین مصرف روزانه سی روز قبل از شروع پایلوت مبنای مقایسه است.");
  await page.getByRole("button", { name: "ثبت پاسخ شفاف‌سازی", exact: true }).click();
  await expect(page.getByText(/پاسخ ثبت شد/)).toBeVisible();
  const replied = (await api(page, `/api/v1/proposals/${proposalId}`, "GET", undefined, workspace))
    .body.data as ProposalResource;
  await orgCommand("resolve-clarification", {
    clarification_id: replied.clarifications[0]!.id,
    resolution: "خط پایه روشن است؛ لطفاً عنوان را به نسخه نهایی اصلاح کنید.",
  });
  await orgCommand("request-revision", {
    scope: "عنوان و سنجه‌های موفقیت را برای نسخه نهایی روشن‌تر بنویسید.",
    revision_deadline: new Date(Date.now() + 14 * 86400_000).toISOString(),
  });
  await page.goto(`/app/solver/proposals/record/preview/?id=${proposalId}`);
  await expect(page.getByText(/جمع‌بندی سازمان: خط پایه روشن است/)).toBeVisible();
  await page.getByRole("link", { name: "شروع نسخه اصلاح‌شده", exact: true }).click();
  await page.getByRole("button", { name: "شروع نسخه اصلاحی", exact: true }).click();
  const finalTitle = "نسخه اصلاح‌شده — آخرین ویرایش بدون ذخیره جداگانه";
  await page.getByRole("textbox", { name: "عنوان پیشنهاد *", exact: true }).fill(finalTitle);
  await page.getByRole("button", { name: "ارسال نسخه اصلاحی", exact: true }).click();
  await expect(page).toHaveURL(/\/proposals\/record\/preview/);
  const revised = (await api(page, `/api/v1/proposals/${proposalId}`, "GET", undefined, workspace))
    .body.data as ProposalResource;
  expect(revised.state).toBe("resubmitted");
  expect(revised.content.title).toBe(finalTitle);
  expect(revised.versions.filter((item) => item.locked)).toHaveLength(2);
  expect(revised.versions.find((item) => item.id === original.current_version_id)).toEqual(
    original.versions.find((item) => item.id === original.current_version_id),
  );
  expect(revised.revision_requests[0]!.base_version_id).toBe(original.current_version_id);
  const orgRecord = await api(owner, orgPath, "GET", undefined, "wsp_org_alpha");
  expect(JSON.stringify(orgRecord.body.data)).toContain(finalTitle);
  console.log(JSON.stringify({ revisionProposalId: proposalId, workspace }));
  await owner.close();
});
