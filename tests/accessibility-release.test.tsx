// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { run as runAxe, type AxeResults } from "axe-core";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { InternalApp } from "@/components/internal/internal-app";
import { PortalPage } from "@/components/portal-page";
import { internalRoutes } from "@/data/internal-routes";
import { publicProductRoutes } from "@/data/public-product-routes";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function importantViolations(results: AxeResults) {
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
}

async function expectNoImportantAxeViolation(container: HTMLElement) {
  let results: AxeResults | undefined;
  await act(async () => {
    results = await runAxe(container, {
      rules: {
        // jsdom has no layout/canvas implementation; contrast is guarded by the
        // semantic token contrast test and browser visual review.
        "color-contrast": { enabled: false },
      },
    });
  });
  if (!results) throw new Error("axe did not return a result");
  expect(importantViolations(results)).toEqual([]);
}

describe("Release accessibility regression", () => {
  it("public challenge discovery has no critical or serious automated violation", async () => {
    const view = render(
      <main id="main-content">
        <ChallengeDiscoveryApp publicMode />
      </main>,
    );
    await expectNoImportantAxeViolation(view.container);
  }, 20_000);

  it("organization dashboard shell has no critical or serious automated violation", async () => {
    const route = internalRoutes.find(({ path }) => path === "/app/org/dashboard");
    if (!route) throw new Error("Organization dashboard route missing");
    const view = render(<InternalApp route={route} />);
    await expectNoImportantAxeViolation(view.container);
  }, 20_000);

  it("OTP entry page has no critical or serious automated violation", async () => {
    const route = publicProductRoutes.find(({ path }) => path === "/auth/otp");
    if (!route) throw new Error("OTP route missing");
    const view = render(<PortalPage definition={route} />);
    await expectNoImportantAxeViolation(view.container);
  }, 20_000);

  it("workspaceهای canonical حل‌کننده در نماهای فردی، مالک و Contributor نقض جدی ندارند", async () => {
    const scenarios = [
      ["/app/solver/dashboard", "?space=individual&workspaceId=WS-PERSONAL-001"],
      ["/app/solver/teams", "?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21"],
      ["/app/solver/verification", "?space=team&teamId=TEAM-34&workspaceId=WS-TEAM-34"],
    ] as const;
    for (const [path, query] of scenarios) {
      const route = internalRoutes.find((candidate) => candidate.path === path);
      if (!route) throw new Error(`Solver route missing: ${path}`);
      window.history.replaceState({}, "", `${path}${query}`);
      const view = render(<InternalApp route={route} />);
      await act(async () => Promise.resolve());
      await expectNoImportantAxeViolation(view.container);
      view.unmount();
    }
  }, 30_000);
});
