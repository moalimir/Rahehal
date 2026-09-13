import type { ProposalState } from "./proposal.js";
import { calculateRubricScore, type CriterionScore, type RubricCriterion } from "./rubric.js";

/** DEC-2026-018: each eligible proposal needs two distinct human reviews. */
export const requiredReviewsPerEligibleProposal = 2 as const;

/**
 * Current locked proposal versions admitted to the evaluation snapshot.
 * `reviewing` retains an earlier eligible decision after clarification, and
 * `resubmitted` is the locked replacement requested from that eligible work.
 */
export const evaluationRosterProposalStates = [
  "eligible",
  "reviewing",
  "resubmitted",
] as const satisfies readonly ProposalState[];
export type EvaluationRosterProposalState = (typeof evaluationRosterProposalStates)[number];

/** Submitted workflows that must resolve before the roster can be frozen. */
export const evaluationBlockingProposalStates = [
  "submitted",
  "eligibility_review",
  "clarification_requested",
  "clarification_submitted",
  "revision_requested",
  "revision_draft",
] as const satisfies readonly ProposalState[];
export type EvaluationBlockingProposalState = (typeof evaluationBlockingProposalStates)[number];

export const evaluationReadinessBlockers = [
  "challenge_not_published",
  "submission_window_open",
  "rubric_missing",
  "proposal_workflow_unresolved",
  "proposal_roster_unavailable",
] as const;
export type EvaluationReadinessBlocker = (typeof evaluationReadinessBlockers)[number];

export function isEvaluationRosterProposalState(
  value: unknown,
): value is EvaluationRosterProposalState {
  return evaluationRosterProposalStates.includes(value as EvaluationRosterProposalState);
}

export function isEvaluationBlockingProposalState(
  value: unknown,
): value is EvaluationBlockingProposalState {
  return evaluationBlockingProposalStates.includes(value as EvaluationBlockingProposalState);
}

export function isEvaluationReadinessBlocker(value: unknown): value is EvaluationReadinessBlocker {
  return evaluationReadinessBlockers.includes(value as EvaluationReadinessBlocker);
}

export type LockedReviewScore = {
  readonly weighted_score_tenths: number;
  readonly scores: readonly CriterionScore[];
};

export type ReviewComparisonScore = {
  /** Exact mean of two integer-tenths weighted totals, displayed out of 100. */
  readonly average_weighted_score_tenths: number;
  /** Exact mean criterion score in tenths, displayed out of 5. */
  readonly criteria: readonly {
    readonly criterion_id: string;
    readonly average_score_tenths: number;
  }[];
};

/** DEC-2026-022 releases no scores until the complete frozen roster is review-complete. */
export function canReleaseReviewComparisonScores(lockedReviewCounts: readonly number[]): boolean {
  return lockedReviewCounts.every((count) => count === requiredReviewsPerEligibleProposal);
}

/**
 * Revalidates persisted score evidence before producing the identity-free D7 aggregate.
 * With exactly two integer reviews, both means remain exact integers in tenths.
 */
export function calculateReviewComparisonScore(
  criteria: readonly RubricCriterion[],
  reviews: readonly LockedReviewScore[],
): ReviewComparisonScore {
  if (reviews.length !== requiredReviewsPerEligibleProposal) {
    throw new Error("Review comparison requires exactly two locked reviews");
  }
  for (const review of reviews) {
    const calculated = calculateRubricScore(criteria, review.scores);
    if (!calculated.ok || calculated.weighted_score_tenths !== review.weighted_score_tenths) {
      throw new Error("Invalid locked review score evidence");
    }
  }
  const averageWeighted =
    reviews.reduce((sum, review) => sum + review.weighted_score_tenths, 0) /
    requiredReviewsPerEligibleProposal;
  if (!Number.isInteger(averageWeighted)) {
    throw new Error("Review comparison weighted mean is not exact");
  }
  return {
    average_weighted_score_tenths: averageWeighted,
    criteria: criteria.map((criterion) => {
      const total = reviews.reduce((sum, review) => {
        const score = review.scores.find((item) => item.criterion_id === criterion.id);
        if (!score) throw new Error("Locked review criterion is missing");
        return sum + score.value;
      }, 0);
      return {
        criterion_id: criterion.id,
        average_score_tenths: (total * 10) / requiredReviewsPerEligibleProposal,
      };
    }),
  };
}
