import { describe, expect, it } from "vitest";
import {
  canTransition,
  isReviewCoiState,
  isReviewState,
  reviewStates,
  reviewTransitions,
  workspaceRoles,
} from "../src/index.js";

describe("canonical review lifecycle", () => {
  it("requires every declared gate and exactly the permitted role for every edge", () => {
    for (const edge of reviewTransitions) {
      for (const role of workspaceRoles) {
        expect(canTransition(reviewTransitions, edge.from, edge.to, role, edge.preconditions)).toBe(
          edge.roles.includes(role),
        );
      }
      for (const missing of edge.preconditions) {
        expect(
          canTransition(
            reviewTransitions,
            edge.from,
            edge.to,
            edge.roles[0]!,
            edge.preconditions.filter((gate) => gate !== missing),
          ),
        ).toBe(false);
      }
    }
  });
  it("never allows skipping the COI gate or reopening submitted evidence", () => {
    for (const from of reviewStates) {
      for (const to of reviewStates) {
        if (reviewTransitions.some((edge) => edge.from === from && edge.to === to)) continue;
        for (const role of workspaceRoles)
          expect(
            canTransition(reviewTransitions, from, to, role, [
              "coi-clear",
              "reason-recorded",
              "receipt-valid",
            ]),
          ).toBe(false);
      }
    }
  });
  it("rejects unknown state values and keeps COI separate from lifecycle", () => {
    expect(isReviewCoiState("pending")).toBe(true);
    expect(isReviewCoiState("accepted")).toBe(false);
    expect(isReviewState("clear")).toBe(false);
    expect(isReviewState(null)).toBe(false);
    expect(reviewTransitions.find((edge) => edge.to === "submitted")?.sideEffects).toContain(
      "freeze-score",
    );
  });
  it("lets Operations cancel unfinished assignments only with a recorded reason", () => {
    for (const state of ["coi-gate", "accepted", "draft"] as const)
      expect(
        canTransition(reviewTransitions, state, "cancelled", "platform:ops", ["reason-recorded"]),
      ).toBe(true);
    expect(
      canTransition(reviewTransitions, "coi-gate", "cancelled", "platform:reviewer", [
        "reason-recorded",
      ]),
    ).toBe(false);
    expect(canTransition(reviewTransitions, "draft", "cancelled", "platform:ops", [])).toBe(false);
    expect(
      canTransition(reviewTransitions, "submitted", "cancelled", "platform:ops", [
        "reason-recorded",
      ]),
    ).toBe(false);
  });
});
