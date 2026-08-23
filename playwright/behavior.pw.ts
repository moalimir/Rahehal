import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { behaviorRoutes } from "./coverage-matrix";

const standaloneURL = pathToFileURL(resolve("index.html")).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

for (const route of behaviorRoutes) {
  test(`route contract: ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main").first()).toBeVisible();
  });
}

test("public navigation preserves back and forward history", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('a[href="/challenges"]:visible, a[href="/challenges/"]:visible')
    .first()
    .click();
  await expect(page).toHaveURL(/\/challenges\/?$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/challenges\/?$/);
});

test("standalone-style hash navigation resolves without changing the pathname", async ({
  page,
}) => {
  await page.goto(`${standaloneURL}#/challenges`);
  await expect(page).toHaveURL(/index\.html#\/challenges\/?$/);
  await expect(page.locator('[data-standalone-current="/challenges"]')).toBeVisible();
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("چالش");
});

test("mobile navigation traps its visible menu in a dialog", async ({ page }, testInfo) => {
  const viewportWidth = testInfo.project.use.viewport?.width ?? Number.POSITIVE_INFINITY;
  test.skip(viewportWidth > 480, "Mobile navigation contract");
  await page.goto("/");
  await page.getByRole("button", { name: "بازکردن منوی اصلی" }).click();
  await expect(page.getByRole("dialog", { name: "منوی اصلی" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "منوی اصلی" })).toBeHidden();
});
