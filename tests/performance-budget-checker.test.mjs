import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  extractInitialJavaScriptReferences,
  routeHtmlPath,
  transferBytes,
} from "../scripts/check-performance-budgets.mjs";

describe("performance budget checker", () => {
  it("counts external scripts and script preloads once regardless of attribute order", () => {
    const references = extractInitialJavaScriptReferences(`
      <script async src="/_next/static/chunks/app.js"></script>
      <link href="/_next/static/chunks/runtime.js" as="script" rel="preload">
      <link rel="preload" as="script" href="/_next/static/chunks/app.js">
      <script>window.__inline = true</script>
      <link rel="stylesheet" href="/_next/static/app.css">
    `);

    expect([...references].sort()).toEqual([
      "/_next/static/chunks/app.js",
      "/_next/static/chunks/runtime.js",
    ]);
  });

  it("resolves exported and connected route outputs explicitly", () => {
    expect(routeHtmlPath("/repo", "demo", "/app/org/challenges/")).toBe(
      path.join("/repo", "out", "app", "org", "challenges", "index.html"),
    );
    expect(routeHtmlPath("/repo", "network", "/app/org/challenges/")).toBe(
      path.join("/repo", ".next", "server", "app", "app", "org", "challenges.html"),
    );
  });

  it("measures a stylesheet by what a browser downloads, not by its source size", () => {
    // The enforced CSS ceilings had moved four times in a fortnight, every time
    // because ordinary styling crossed a line drawn at the previous build. CSS
    // compresses to roughly a sixth, so an uncompressed ceiling spent headroom
    // about six times faster than it spent a reader's bandwidth.
    const stylesheet = Buffer.from(".a{color:red}".repeat(400));
    expect(transferBytes(stylesheet)).toBe(zlib.gzipSync(stylesheet, { level: 9 }).length);
    expect(transferBytes(stylesheet)).toBeLessThan(stylesheet.length / 4);
  });
});

describe("performance budget configuration", () => {
  const budgets = JSON.parse(readFileSync("config/performance-budgets.json", "utf8"));

  it("enforces CSS on transfer size and keeps the uncompressed totals as trends", () => {
    expect(budgets.staticAssets.maxCssTransferBytes).toBeGreaterThan(0);
    expect(budgets.staticAssets.maxLargestCssTransferBytes).toBeGreaterThan(0);
    // The retired ceilings must not come back: a build that satisfies the
    // transfer budget would fail them, so leaving one in place would restore
    // the exact friction DEC-2026-017 removed.
    expect(budgets.staticAssets.maxCssBytes).toBeUndefined();
    expect(budgets.staticAssets.maxLargestCssBytes).toBeUndefined();
    expect(budgets.standalone.maxCssCharacters).toBeUndefined();
    // References for the trend lines still have to exist, or the trend prints
    // NaN and stops being noticed.
    expect(budgets.staticAssets.cssReferenceBytes).toBeGreaterThan(0);
    expect(budgets.standalone.cssReferenceCharacters).toBeGreaterThan(0);
    expect(budgets.source.cssReferenceBytes).toBeGreaterThan(0);
  });

  it("leaves room to work under each enforced ceiling", () => {
    // A ceiling pinned to the last build is a change detector, not a budget:
    // the uncompressed CSS ceilings this replaced moved four times in a
    // fortnight, each time because ordinary styling had crossed a line drawn at
    // the previous build. Every enforced limit keeps at least a fifth of itself
    // in headroom against the build that set it.
    const measuredAtBaseline = {
      "CSS transfer bytes": [99_827, budgets.staticAssets.maxCssTransferBytes],
      "largest CSS asset transfer bytes": [39_429, budgets.staticAssets.maxLargestCssTransferBytes],
      "standalone bytes": [5_175_243, budgets.standalone.maxBytes],
      "standalone JavaScript characters": [2_259_118, budgets.standalone.maxJavaScriptCharacters],
    };
    for (const [label, [actual, ceiling]] of Object.entries(measuredAtBaseline)) {
      const headroom = (ceiling - actual) / ceiling;
      expect({ label, enough: headroom >= 0.2 }).toEqual({ label, enough: true });
    }
  });
});
