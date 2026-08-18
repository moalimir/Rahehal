import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const challengeCss = readFileSync(resolve(process.cwd(), "app/challenge-flow.css"), "utf8");

describe("فاصله کناری صفحات", () => {
  it("محتوای عمومی و لندینگ را با فاصله نسخه پیشین نمایش می‌دهد", () => {
    expect(globalCss).toContain("width: min(1200px, calc(100% - 64px));");
    expect(globalCss).toContain("width: min(1470px, calc(100% - 80px));");
    expect(globalCss).toContain("width: min(1216px, calc(100% - 52px));");
    expect(globalCss).not.toContain("width: min(1200px, 80%);");
    expect(globalCss).not.toContain("width: min(1470px, 80%);");
    expect(globalCss).not.toContain("width: min(1216px, 80%);");
  });

  it("صفحات چالش را با عرض اصلی و فاصله امن موبایل نگه می‌دارد", () => {
    expect(challengeCss).toContain("width: min(1160px, calc(100% - 48px));");
    expect(challengeCss).toContain("width: calc(100% - 24px);");
    expect(challengeCss).not.toContain("width: min(1160px, 80%);");
  });
});
