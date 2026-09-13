import type {
  ChallengeId,
  ChallengeStage,
  ChallengeVersionId,
  EvaluationReadinessBlocker,
  EvaluationRosterProposalState,
  ProposalId,
  ProposalVersionId,
  RubricVersionId,
  RubricCriterion,
} from "@rahhal/domain";

import type { MutationSuccessEnvelope, VersionedApiMeta, VersionedCommand } from "./envelopes.js";

export type EvaluationRosterProposalResource = {
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly tracking_code: string;
  readonly source_state: EvaluationRosterProposalState;
};

export type ChallengeEvaluationResource = {
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId | null;
  readonly stage: ChallengeStage;
  readonly publication_state: "open" | "paused" | "closed" | "cancelled" | null;
  readonly proposal_deadline_at: string | null;
  readonly window_closed: boolean;
  readonly rubric_version_id: RubricVersionId | null;
  readonly required_reviews: 2;
  readonly qualifying_proposal_count: number;
  readonly unresolved_proposal_count: number;
  readonly ready: boolean;
  readonly blockers: readonly EvaluationReadinessBlocker[];
  readonly roster: readonly EvaluationRosterProposalResource[];
  readonly opened_at: string | null;
  readonly version: number;
};

export type ChallengeEvaluationSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeEvaluationResource;
  readonly meta: VersionedApiMeta;
};

export type ReviewComparisonScoreSummaryResource = {
  /** Exact aggregate mean in integer tenths, displayed out of 100. */
  readonly average_weighted_score_tenths: number;
  readonly criteria: readonly {
    readonly criterion_id: string;
    /** Exact aggregate mean in integer tenths, displayed out of 5. */
    readonly average_score_tenths: number;
  }[];
};

export type ReviewComparisonProposalResource = {
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly tracking_code: string;
  readonly status: "needs_assignment" | "reviews_in_progress" | "complete";
  readonly active_assignment_count: number;
  readonly locked_review_count: number;
  readonly cancelled_assignment_count: number;
  readonly invalidated_review_count: number;
  /** Null for every proposal until the entire frozen roster is complete. */
  readonly score_summary: ReviewComparisonScoreSummaryResource | null;
};

/**
 * D7's organization-only, identity-free comparison projection. Individual
 * reviews, rationales, reviewer identity and solver identity are absent.
 */
export type ChallengeReviewComparisonResource = {
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly rubric_version_id: RubricVersionId;
  readonly required_reviews: 2;
  readonly proposal_count: number;
  readonly completed_proposal_count: number;
  readonly scores_released: boolean;
  readonly criteria: readonly RubricCriterion[];
  readonly proposals: readonly ReviewComparisonProposalResource[];
  readonly version: number;
};
export type ChallengeReviewComparisonSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeReviewComparisonResource;
  readonly meta: VersionedApiMeta;
};

export type OpenChallengeEvaluationBody = Pick<VersionedCommand, "expected_version">;
export type ChallengeEvaluationNextAction = "assign_reviewers" | "record_no_award";
export type ChallengeEvaluationMutationSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeId,
  ChallengeEvaluationNextAction
>;
