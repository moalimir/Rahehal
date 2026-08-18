import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Standalone React آفلاین", () => {
  const html = fs.readFileSync("index.html", "utf8");

  it("از همان Bundle پروژه Hydrate می‌شود", () => {
    expect(html).toContain('data-challenge-standalone="true"');
    expect(html).toContain('content="react-hydrated-offline"');
    expect(html).toContain("self.__next_f");
  });

  it("CSS و JavaScript و دارایی‌های Next را داخل یک فایل نگه می‌دارد", () => {
    expect(html).toContain("<style");
    expect(html).toContain("<script");
    expect(html).not.toMatch(/(?:href|src)=["']\/_next\//);
    expect(Buffer.byteLength(html)).toBeGreaterThan(500_000);
  });

  it("CTA اصلی لندینگ به ثبت مسئله کانونی متصل است", () => {
    expect(html).toContain("/app/org/challenges/new");
    expect(html).toContain("ثبت مسئله سازمانی");
  });
});
