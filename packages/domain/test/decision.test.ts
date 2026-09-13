import { describe, expect, it } from "vitest";

import {
  decisionOutboxEventTypes,
  isDecisionOutcome,
  isDecisionReasonForOutcome,
  notificationProjectionFor,
} from "../src/index.js";

describe("Phase 4 decision policy", () => {
  it("keeps selected and no-award reasons in separate allowlists", () => {
    expect(isDecisionOutcome("selected")).toBe(true);
    expect(isDecisionOutcome("no_award")).toBe(true);
    expect(isDecisionOutcome("rejected")).toBe(false);
    expect(isDecisionReasonForOutcome("selected", "best_overall_fit")).toBe(true);
    expect(isDecisionReasonForOutcome("selected", "no_qualifying_proposal")).toBe(false);
    expect(isDecisionReasonForOutcome("no_award", "no_qualifying_proposal")).toBe(true);
    expect(isDecisionReasonForOutcome("no_award", "strategic_fit")).toBe(false);
  });

  it("routes final proposal outcomes only to the proposal owner", () => {
    expect(notificationProjectionFor("proposal.selected")).toEqual({
      kind: "proposal.selected",
      audience: "proposal-owner",
    });
    expect(notificationProjectionFor("proposal.rejected")).toEqual({
      kind: "proposal.rejected",
      audience: "proposal-owner",
    });
    expect(notificationProjectionFor("challenge.decision.recorded")).toBeNull();
    expect(decisionOutboxEventTypes).toEqual([
      "challenge.shortlist.recorded",
      "challenge.decision.recorded",
      "proposal.selected",
      "proposal.rejected",
      "case.created",
    ]);
  });
});
