import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/challenge-flow.css"), "utf8");
const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, declarations]) => ({
  selector: selector.trim(),
  declarations,
}));

describe("قواعد Responsive و اسکرول ماژول چالش", () => {
  it("Breakpointهای دسکتاپ، تبلت و موبایل کوچک را پوشش می‌دهد", () => {
    expect(css).toContain("@media (max-width: 1024px)");
    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("اسکرول عمودی مستقل را فقط برای Dialog و Drawer فیلترِ محدودشده مجاز می‌کند", () => {
    const independentlyScrollable = rules.filter(({ declarations }) =>
      /overflow-y:\s*(auto|scroll)/.test(declarations),
    );

    expect(independentlyScrollable.map(({ selector }) => selector)).toEqual([
      ".challenge-dialog",
      ".solver-filter-drawer",
    ]);
    expect(css).toMatch(/\.solver-filter-drawer\s*\{[\s\S]*?max-height:/);
  });

  it("نوار اقدام فرم ثابت یا چسبان نیست", () => {
    const actionRules = rules.filter(({ selector }) =>
      selector.includes(".challenge-form-actions"),
    );

    expect(actionRules.length).toBeGreaterThan(0);
    for (const { declarations } of actionRules) {
      expect(declarations).not.toMatch(/position:\s*(fixed|sticky)/);
    }
  });

  it("فهرست موبایل Card و فرم موبایل تک‌ستونه می‌شود", () => {
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*?\.challenge-data-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/,
    );
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*?\.challenge-form-grid\s*\{\s*grid-template-columns:\s*1fr/,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.challenge-data-row\s*\{\s*grid-template-columns:\s*1fr/,
    );
  });
});
