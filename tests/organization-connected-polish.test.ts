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
    // The version identity and content fingerprint are what make a decision
    // attributable to an exact submission. They moved off every inbox row,
    // where they competed with the facts that decide whether to open a
    // proposal at all, and onto the record beside the decision they support --
    // so this asserts they are still reachable, not where they used to sit.
    expect(proposals).toContain("اثر انگشت محتوا");
    expect(proposals).toContain("org-connected-record-rail");
    expect(proposals).toMatch(/RecordId value=\{version\.id\}/);
    expect(proposals).toMatch(/RecordId value=\{version\.content_hash\}/);
    expect(offers).toContain("وضعیت آن برای هر دو طرف یکسان");
  });

  it("groups the inbox by the call each proposal answers", () => {
    // Proposals are only comparable within one call, and an organization
    // running several at once had to read the challenge line on every card to
    // know which competition it was looking at. Grouping also makes "how is
    // this call doing" answerable, which a flat list never was.
    expect(proposals).toContain("org-connected-inbox-group");
    expect(proposals).toMatch(/byChallenge/);
    // Ordered by work waiting, then recency: the call with answered
    // clarifications sitting unread belongs at the top of the page.
    expect(proposals).toMatch(/right\.waiting - left\.waiting \|\| right\.latest/);
    expect(proposals).toContain("منتظر اقدام شما");
  });

  it("names the call once per group instead of on every row", () => {
    // The card used to repeat the challenge title and category that the group
    // header now carries, which left the submission itself unnamed.
    expect(proposals).toContain("org-connected-inbox-group__head");
    expect(proposals).not.toMatch(/org-connected-inbox-card__title[\s\S]{0,400}challenge\?\.title/);
  });
});
