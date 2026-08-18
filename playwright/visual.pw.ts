import { expect, test } from "@playwright/test";
import { visualScenarios } from "./coverage-matrix";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

for (const scenario of visualScenarios) {
  test(`${scenario.family}: ${scenario.id}`, async ({ page }) => {
    await page.goto(scenario.route, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          caret-color: transparent !important;
          transition: none !important;
        }
      `,
    });
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page).toHaveScreenshot(`${scenario.id}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.001,
    });
  });
}
