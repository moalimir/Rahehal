import { describe, expect, it } from "vitest";

import {
  challengeTransitions,
  evaluationBlockingProposalStates,
  evaluationRosterProposalStates,
  isEvaluationBlockingProposalState,
  isEvaluationRosterProposalState,
  requiredReviewsPerEligibleProposal,
} from "../src/index.js";

describe("D3 evaluation policy", () => {
  it("freezes only eligible current proposal states and requires two reviews", () => {
    expect(evaluationRosterProposalStates).toEqual(["eligible", "reviewing", "resubmitted"]);
    expect(requiredReviewsPerEligibleProposal).toBe(2);
    expect(isEvaluationRosterProposalState("resubmitted")).toBe(true);
    expect(isEvaluationRosterProposalState("revision_draft")).toBe(false);
  });

  it("blocks every unfinished submitted workflow before opening evaluation", () => {
    expect(evaluationBlockingProposalStates).toEqual([
      "submitted",
      "eligibility_review",
      "clarification_requested",
      "clarification_submitted",
      "revision_requested",
      "revision_draft",
    ]);
    expect(isEvaluationBlockingProposalState("clarification_submitted")).toBe(true);
    expect(isEvaluationBlockingProposalState("draft")).toBe(false);
    expect(isEvaluationBlockingProposalState("ineligible")).toBe(false);
  });

  it("aligns evaluation and final-decision authority with DEC-2026-018", () => {
    const open = challengeTransitions.find(
      ({ from, to }) => from === "published" && to === "evaluating",
    );
    const decide = challengeTransitions.find(
      ({ from, to }) => from === "evaluating" && to === "decided",
    );
    expect(open?.roles).toEqual(["org:owner", "org:member"]);
    expect(open?.preconditions).toEqual(
      expect.arrayContaining(["rubric-version-locked", "proposal-roster-ready"]),
    );
    expect(decide?.roles).toEqual(["org:owner", "org:member"]);
  });
});
