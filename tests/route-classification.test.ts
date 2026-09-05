import { describe, expect, it } from "vitest";

import {
  classificationTotals,
  classifyRegisteredRoutes,
  classifyRoute,
  connectedMvpRoutes,
} from "@/lib/routing/route-classification";
import { WORKSPACE_RESOLVER_PATH } from "@/lib/routing/workspace-home";

describe("C9 route truthfulness", () => {
  it("classifies every registered route", () => {
    const classified = classifyRegisteredRoutes();
    expect(classified.length).toBeGreaterThan(300);
    for (const route of classified) {
      expect(["live", "preview", "unavailable", "redirect"]).toContain(route.classification);
      expect(route.owner).not.toBe("");
    }
  });

  it("keeps every connected MVP route live", () => {
    // C10 certifies the journey across exactly these surfaces. Downgrading one
    // to preview would let the journey traverse sample material, which is the
    // failure C9 exists to prevent.
    for (const path of connectedMvpRoutes) {
      expect(classifyRoute(path).classification).toBe("live");
    }
  });

  it("registers the workspace resolver as a live route", () => {
    // The audit recorded `/app` as referenced but unregistered. It is the one
    // authenticated entry point, so it has to resolve rather than 404.
    expect(classifyRoute(WORKSPACE_RESOLVER_PATH)).toMatchObject({
      classification: "live",
      owner: "C9",
    });
  });

  it("never marks a later-phase surface live", () => {
    for (const path of [
      "/app/reviewer/assignments",
      "/app/ops/publication",
      "/app/org/contracts",
      "/app/solver/payments",
    ]) {
      expect(classifyRoute(path).classification).toBe("unavailable");
    }
  });

  it("reports the audit totals", () => {
    const totals = classificationTotals();
    expect(totals.live).toBe(connectedMvpRoutes.length);
    expect(totals.live + totals.preview + totals.unavailable + totals.redirect).toBe(
      classifyRegisteredRoutes().length,
    );
  });

  it("keeps connected identity and settings routes out of fixture preview", () => {
    for (const path of [
      "/app/org/profile",
      "/app/org/settings",
      "/app/org/access",
      "/app/solver/profile",
      "/app/solver/verification",
      "/app/solver/settings",
    ]) {
      expect(classifyRoute(path).classification).toBe("live");
    }
  });
});
