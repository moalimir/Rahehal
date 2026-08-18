import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("قرارداد responsive حل‌کننده نسخه ۲۸", () => {
  const shellCss = readFileSync("app/app-shell.css", "utf8");
  const solverCss = readFileSync("app/solver-workspace.css", "utf8");

  it("هفت viewport تحویل به breakpointهای واقعی موبایل، تبلت و دسکتاپ نگاشت شده‌اند", () => {
    const viewports = [360, 390, 480, 768, 1024, 1280, 1440];
    expect(viewports).toEqual([360, 390, 480, 768, 1024, 1280, 1440]);
    expect(shellCss).toContain("@media (max-width: 1023px)");
    expect(shellCss).toContain("@media (max-width: 767px)");
    expect(shellCss).toContain("@media (max-width: 420px)");
    expect(solverCss).toContain("@media (max-width: 480px)");
  });

  it("drawer، touch target، overflow جدول و reduced motion قرارداد CSS صریح دارند", () => {
    expect(shellCss).toMatch(/\.unified-sidebar\.is-open\s*\{[\s\S]*?visibility:\s*visible/);
    expect(shellCss).toMatch(
      /\.unified-topbar__menu[\s\S]*?inline-size:\s*44px[\s\S]*?block-size:\s*44px/,
    );
    expect(solverCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.unified-shell--solver\s+:is\(\s*button,\s*select,[\s\S]*?\)\s*\{[\s\S]*?min-block-size:\s*44px/,
    );
    expect(solverCss).toMatch(/\.rh-table[\s\S]*?overflow-x:\s*auto/);
    expect(solverCss).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
