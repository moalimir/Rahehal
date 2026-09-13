import { describe, expect, it } from "vitest";

import {
  decodeBrowserAuthorizationFlow,
  encodeBrowserAuthorizationFlow,
} from "../src/browser-session.js";

const baseFlow = {
  state: "browser-step-up-state-with-at-least-thirty-two-characters",
  codeVerifier: "browser-step-up-code-verifier-with-at-least-forty-three-characters",
  expiresAt: "2026-09-10T08:10:00.000Z",
};

describe("browser authorization-flow cookie", () => {
  it("round-trips only the exact decision return route", () => {
    const returnTo = "/app/org/challenges/record/evaluation?id=chl_browser_step_up_alpha";
    const encoded = encodeBrowserAuthorizationFlow({ ...baseFlow, returnTo });

    expect(decodeBrowserAuthorizationFlow(encoded)).toEqual({ ...baseFlow, returnTo });
  });

  it.each([
    "https://attacker.example/app/org/challenges/record/evaluation?id=chl_alpha",
    "//attacker.example/app/org/challenges/record/evaluation?id=chl_alpha",
    "/app/org/challenges/record/evaluation?id=chl_alpha&next=https://attacker.example",
    "/app/org/challenges/record/evaluation?id=not-a-challenge",
    "/app/org/challenges/record/evaluation/../..",
  ])("rejects an unsafe step-up return route: %s", (returnTo) => {
    const encoded = encodeBrowserAuthorizationFlow({ ...baseFlow, returnTo });

    expect(decodeBrowserAuthorizationFlow(encoded)).toBeNull();
  });

  it("keeps ordinary sign-in flows compatible when no return route exists", () => {
    const encoded = encodeBrowserAuthorizationFlow(baseFlow);

    expect(decodeBrowserAuthorizationFlow(encoded)).toEqual(baseFlow);
  });
});
