import type { ProposalState } from "./proposal.js";

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
