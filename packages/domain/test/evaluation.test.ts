import { describe, expect, it } from "vitest";

import {
  challengeTransitions,
  calculateReviewComparisonScore,
  canReleaseReviewComparisonScores,
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

  it("releases only a complete two-review roster and calculates exact aggregate means", () => {
    expect(canReleaseReviewComparisonScores([])).toBe(true);
    expect(canReleaseReviewComparisonScores([2, 2])).toBe(true);
    expect(canReleaseReviewComparisonScores([2, 1])).toBe(false);
    expect(canReleaseReviewComparisonScores([3])).toBe(false);

    const criteria = [
      { id: "quality", label: "کیفیت", weight: 60, min: 0 as const, max: 5 as const },
      { id: "impact", label: "اثر", weight: 40, min: 0 as const, max: 5 as const },
    ];
    const score = calculateReviewComparisonScore(criteria, [
      {
        weighted_score_tenths: 720,
        scores: [
          { criterion_id: "quality", value: 4, rationale: "شواهد کافی است." },
          { criterion_id: "impact", value: 3, rationale: "اثر سنجش‌پذیر است." },
        ],
      },
      {
        weighted_score_tenths: 840,
        scores: [
          { criterion_id: "quality", value: 5, rationale: "کیفیت قوی است." },
          { criterion_id: "impact", value: 3, rationale: "اثر روشن است." },
        ],
      },
    ]);
    expect(score).toEqual({
      average_weighted_score_tenths: 780,
      criteria: [
        { criterion_id: "quality", average_score_tenths: 45 },
        { criterion_id: "impact", average_score_tenths: 30 },
      ],
    });
    expect(() =>
      calculateReviewComparisonScore(criteria, [
        {
          weighted_score_tenths: 721,
          scores: [
            { criterion_id: "quality", value: 4, rationale: "شواهد کافی است." },
            { criterion_id: "impact", value: 3, rationale: "اثر سنجش‌پذیر است." },
          ],
        },
        {
          weighted_score_tenths: 840,
          scores: [
            { criterion_id: "quality", value: 5, rationale: "کیفیت قوی است." },
            { criterion_id: "impact", value: 3, rationale: "اثر روشن است." },
          ],
        },
      ]),
    ).toThrow("Invalid locked review score evidence");
  });
});
