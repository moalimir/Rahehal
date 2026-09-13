import { describe, expect, it, vi } from "vitest";

import { connectedChallengeHref } from "@/lib/challenges/navigation";

/**
 * A server-generated challenge id is never a pre-generated static route, so a
 * connected build addresses a record by query parameter. Every `<Link href>`
 * in the challenge flow used to emit the canonical path verbatim, which
 * resolved to 404 the moment the organization's list started returning real
 * records instead of fixtures.
 */
describe("connected challenge links", () => {
  it("rewrites every record view a list or record page links to", () => {
    const id = "chl_4c6aabe8f0a24d2f9d4b1a0f2e6c7d81";
    for (const view of [
      "",
      "overview",
      "edit",
      "studio",
      "preview",
      "submitted",
      "governance",
      "rubric",
      "evaluation",
    ]) {
      const canonical = `/app/org/challenges/${id}${view ? `/${view}` : ""}`;
      expect(connectedChallengeHref(canonical)).toBe(
        `/app/org/challenges/record${view ? `/${view}` : ""}/?id=${id}`,
      );
    }
  });

  it("keeps other query parameters while moving the id into the query", () => {
    expect(connectedChallengeHref("/app/org/challenges/chl_abc123def456/edit?step=3")).toBe(
      "/app/org/challenges/record/edit/?id=chl_abc123def456&step=3",
    );
  });

  it("leaves a fixture path untouched so the static demo keeps its routes", () => {
    expect(connectedChallengeHref("/app/org/challenges/CH-1405-021")).toBe(
      "/app/org/challenges/CH-1405-021",
    );
    expect(connectedChallengeHref("/app/org/challenges/new")).toBe("/app/org/challenges/new");
    expect(connectedChallengeHref("/app/org/challenges")).toBe("/app/org/challenges");
  });

  it("only rewrites in the connected runtime", async () => {
    vi.resetModules();
    vi.doMock("@/lib/runtime/mode", () => ({
      isNetworkWebRuntime: false,
      webRuntimeMode: "demo",
    }));
    const demo = await import("@/lib/challenges/navigation");
    const canonical = "/app/org/challenges/chl_abc123def456";
    expect(demo.challengeHref(canonical)).toBe(canonical);
    vi.doUnmock("@/lib/runtime/mode");
    vi.resetModules();
  });
});
