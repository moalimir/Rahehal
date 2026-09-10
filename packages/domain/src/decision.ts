export const decisionOutcomes = ["selected", "no_award"] as const;
export type DecisionOutcome = (typeof decisionOutcomes)[number];

export const selectedDecisionReasonCodes = [
  "best_overall_fit",
  "strategic_fit",
  "delivery_confidence",
  "risk_adjusted_value",
  "other",
] as const;
export const noAwardDecisionReasonCodes = [
  "no_qualifying_proposal",
  "reviews_inconclusive",
  "budget_or_timing_constraints",
  "risk_too_high",
  "other",
] as const;
export const decisionReasonCodes = [
  "best_overall_fit",
  "strategic_fit",
  "delivery_confidence",
  "risk_adjusted_value",
  "no_qualifying_proposal",
  "reviews_inconclusive",
  "budget_or_timing_constraints",
  "risk_too_high",
  "other",
] as const;
export type DecisionReasonCode = (typeof decisionReasonCodes)[number];

export const proposalDecisionOutcomes = ["selected", "rejected"] as const;
export type ProposalDecisionOutcome = (typeof proposalDecisionOutcomes)[number];

export function isDecisionOutcome(value: unknown): value is DecisionOutcome {
  return decisionOutcomes.includes(value as DecisionOutcome);
}

export function isDecisionReasonCode(value: unknown): value is DecisionReasonCode {
  return decisionReasonCodes.includes(value as DecisionReasonCode);
}

export function isDecisionReasonForOutcome(
  outcome: DecisionOutcome,
  reasonCode: DecisionReasonCode,
): boolean {
  return outcome === "selected"
    ? selectedDecisionReasonCodes.includes(
        reasonCode as (typeof selectedDecisionReasonCodes)[number],
      )
    : noAwardDecisionReasonCodes.includes(
        reasonCode as (typeof noAwardDecisionReasonCodes)[number],
      );
}

/** D8-D9 metadata-only events accepted by the worker boundary. */
export const decisionOutboxEventTypes = [
  "challenge.shortlist.recorded",
  "challenge.decision.recorded",
  "proposal.selected",
  "proposal.rejected",
  "case.created",
] as const;
export type DecisionOutboxEventType = (typeof decisionOutboxEventTypes)[number];
