// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { clearObsoleteConnectedBrowserState } from "@/lib/auth/network-browser-state";

describe("connected browser state cleanup", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("removes demo authority while preserving harmless UI preferences", () => {
    for (const key of [
      "rahhal.session.v1",
      "rahhal.solver.v4.user.current",
      "rahhal.solver.active-workspace.v2.current",
      "rahhal.organization-challenges.v9",
      "rahhal.demo-direct-offers.v1",
      "rahhal:proposal:CH-1:individual",
      "rahhal:solver-team-draft",
      "rahhal:saved:CH-1",
    ]) {
      localStorage.setItem(key, "stale-demo-value");
    }
    localStorage.setItem("rahhal.solver.ui.v1.proposals.view", "list");
    localStorage.setItem("unrelated.application.preference", "keep");
    sessionStorage.setItem("rahhal.solver-registration", "stale");
    sessionStorage.setItem("rahhal.organization-registration.representative", "stale");

    clearObsoleteConnectedBrowserState();

    expect(Object.keys(localStorage)).toEqual([
      "rahhal.solver.ui.v1.proposals.view",
      "unrelated.application.preference",
    ]);
    expect(sessionStorage.length).toBe(0);
  });
});
