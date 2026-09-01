import { describe, expect, it } from "vitest";
import {
  extractInitialJavaScriptReferences,
  routeHtmlPath,
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
      "/repo/out/app/org/challenges/index.html",
    );
    expect(routeHtmlPath("/repo", "network", "/app/org/challenges/")).toBe(
      "/repo/.next/server/app/app/org/challenges.html",
    );
  });
});
