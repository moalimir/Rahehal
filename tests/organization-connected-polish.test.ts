import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("connected organization page polish", () => {
  const css = readFileSync("app/organization-workspace.css", "utf8");
  const offers = readFileSync("components/organization/connected-direct-offers.tsx", "utf8");
  const proposals = readFileSync("components/solver/connected-organization-proposals.tsx", "utf8");

  it("keeps connected cards out of the legacy checkbox-and-avatar proposal grid", () => {
    expect(offers).not.toContain('className="org-proposal-list"');
    expect(proposals).not.toContain('className="org-proposal-list"');
    expect(css).toMatch(
      /\.org-connected-offer-card > header,[\s\S]*?\.org-connected-inbox-card > header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/,
    );
  });

  it("gives both live families explicit narrow-screen layouts and full-width actions", () => {
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.org-offer-form__grid,[\s\S]*?\.org-connected-inbox-card__facts\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.org-connected-inbox-card > footer a\s*\{[\s\S]*?width:\s*100%/,
    );
  });

  it("preserves visible focus and authoritative evidence in the polished views", () => {
    expect(css).toMatch(/\.org-offer-form__grid :is\(input, select, textarea\):focus-visible/);
    expect(proposals).toContain("نسخه و اثر انگشت محتوا");
    expect(offers).toContain("وضعیت آن برای هر دو طرف یکسان");
  });
});
