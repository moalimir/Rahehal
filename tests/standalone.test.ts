import fs from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

describe("ورودی Standalone", () => {
  const html = fs.readFileSync("index.html", "utf8");

  it("زبان، جهت و نشانگر اجرای آفلاین صحیح دارد", () => {
    const dom = new JSDOM(html);
    expect(dom.window.document.documentElement.lang).toBe("fa");
    expect(dom.window.document.documentElement.dir).toBe("rtl");
    expect(dom.window.document.documentElement.dataset.challengeStandalone).toBe("true");
    expect(
      dom.window.document
        .querySelector('meta[name="rahhal-challenge-standalone"]')
        ?.getAttribute("content"),
    ).toBe("react-hydrated-offline");
    dom.window.close();
  }, 15_000);

  it("لندینگ واقعی و CTA ثبت مسئله را نگه می‌دارد", () => {
    const dom = new JSDOM(html);
    const hrefs = [...dom.window.document.querySelectorAll<HTMLAnchorElement>("a[href]")].map(
      (anchor) => anchor.getAttribute("href"),
    );
    expect(dom.window.document.querySelector("h1")?.textContent).toContain("مسئله");
    expect(hrefs).toContain("/app/org/challenges/new/");
    expect(hrefs).toContain("/organizations/");
    expect(html).toContain("شرکت‌های فعال در راه‌حل");
    dom.window.close();
  }, 15_000);
});
