import { expect, test } from "@playwright/test";

/**
 * A3 acceptance: a real browser signs in, activates a workspace, and creates,
 * reads and saves a challenge draft through the API and PostgreSQL.
 *
 * This suite needs the connected stack (PostgreSQL, the API in `postgres` mode,
 * a local OIDC provider, and the web built with RAHHAL_WEB_RUNTIME=network). It
 * is opt-in so the default demo browser gate stays runnable on its own:
 *
 *   RAHHAL_CONNECTED_E2E=1 npm run test:browser:connected
 *
 * The identity is the repository's synthetic local fixture — `@synthetic.invalid`
 * is a reserved, unroutable domain and the password lives in
 * infra/local/dex/config.yaml. Nothing here is a real credential.
 */

const connectedStack = process.env.RAHHAL_CONNECTED_E2E === "1";
const identity = {
  email: process.env.RAHHAL_E2E_LOGIN ?? "owner-alpha@synthetic.invalid",
  password: process.env.RAHHAL_E2E_PASSWORD ?? "rahhal-local-owner",
};

test.describe("A3 connected challenge slice", () => {
  test.skip(!connectedStack, "requires the connected stack (RAHHAL_CONNECTED_E2E=1)");
  // The npm script pins one viewport: this proves server authority, not
  // responsive layout, and every case shares one database.
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/auth/organization/login");
    await page.getByRole("button", { name: /ورود با ارائه‌دهنده هویت محلی/ }).click();

    await page.waitForURL(/\/dex\/auth/);
    await page.locator("#login").fill(identity.email);
    await page.locator("#password").fill(identity.password);
    await page.locator("#submit-login").click();

    await page.waitForURL(/\/app\/org\/challenges\/new/);
  }

  async function activateWorkspace(page: import("@playwright/test").Page) {
    // A freshly exchanged session has no active workspace: the server's receipt
    // says the next action is `select_workspace`, and the UI must ask for it
    // before any command is possible.
    const chooser = page.getByRole("heading", { name: "یک فضای سازمانی را فعال کنید" });
    await expect(chooser).toBeVisible();
    await page.locator("button.challenge-button--primary").first().click();
    await expect(chooser).toBeHidden();
  }

  test("signs in, activates a workspace, and persists a draft in PostgreSQL", async ({
    page,
  }, testInfo) => {
    await signIn(page);
    await activateWorkspace(page);

    const title = `پایش مصرف انرژی ${testInfo.testId}`;
    await page.getByLabel("عنوان مسئله").fill(title);
    await page
      .getByLabel("شرح یک‌جمله‌ای مشکل")
      .fill("شرح معتبر برای پیش‌نویس متصل به سرور و پایگاه داده.");
    await page.getByLabel("واحد، سایت یا محل درگیر").fill("کارخانه یک، خط تولید دو");
    await page.getByLabel("مالک مسئله").fill("مالک مصنوعی");
    await page
      .getByLabel("نتیجه‌ای که سازمان به‌دنبال آن است")
      .fill("کاهش سنجش‌پذیر اتلاف انرژی در خط تولید");
    const category = page.getByLabel("دسته‌بندی اصلی");
    await category.selectOption({ index: 1 });
    await page.getByRole("button", { name: "ذخیره و ادامه" }).click();

    // The server assigns the id, so the URL must carry a real chl_ record.
    await page.waitForURL(/\/app\/org\/challenges\/record\/edit\/\?id=chl_/);
    const recordUrl = page.url();
    expect(recordUrl).toContain("id=chl_");

    // A reload proves the draft came back from PostgreSQL, not from the browser.
    // The wizard deep-links to the step named in the URL (here step 2, per the
    // intake page's own redirect), so step 1's title field is reached by
    // navigating the stepper, not by reloading alone.
    await page.reload();
    await page.getByRole("button", { name: /تعریف مسئله/ }).click();
    await expect(page.locator(`input[value="${title}"]`).first()).toBeVisible();
  });

  test("refuses a command once the session is revoked", async ({ page }) => {
    await signIn(page);
    await activateWorkspace(page);

    await page.evaluate(async () => {
      await fetch("/auth/browser/session:revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": "e2e-revoke-0001" },
        body: "{}",
      });
    });

    const denied = await page.evaluate(
      async () => (await fetch("/api/v1/me", { credentials: "same-origin" })).status,
    );
    expect(denied).toBe(403);
  });

  test("never serves a record for a foreign or missing id", async ({ page }) => {
    await signIn(page);
    await activateWorkspace(page);

    // No id at all: an explicit empty state, never a look-alike sample record.
    await page.goto("/app/org/challenges/record/edit/");
    await expect(page.getByRole("heading", { name: "پرونده مورد نظر مشخص نیست" })).toBeVisible();

    // A well-formed id in another tenant must not resolve, and the denial must
    // not confirm whether the record exists.
    const foreign = await page.evaluate(async () => {
      const workspace = await (await fetch("/api/v1/me", { credentials: "same-origin" })).json();
      const response = await fetch("/api/v1/challenges/chl_e2e_foreign_record", {
        credentials: "same-origin",
        headers: { "x-workspace-id": workspace.data.active_context.workspace_id },
      });
      return { status: response.status, body: await response.json() };
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOT_FOUND");
  });
});
