import type {
  ChallengeId,
  MembershipId,
  ProposalId,
  ProposalVersionId,
  ReviewAssignmentId,
  ReviewCoiState,
  ReviewState,
  RubricVersionId,
  UserId,
} from "@rahhal/domain";
import type { MutationSuccessEnvelope, SuccessEnvelope, VersionedCommand } from "./envelopes.js";

/** Assignment bookkeeping only. No proposal, rubric, organization or solver identity. */
export type ReviewAssignmentResource = {
  readonly id: ReviewAssignmentId;
  readonly state: ReviewState;
  readonly coi_status: ReviewCoiState;
  readonly due_at: string;
  readonly overdue: boolean;
  readonly version: number;
};
export type ReviewAssignmentListQuery = {
  readonly limit?: number;
  readonly cursor?: ReviewAssignmentId;
  readonly state?: ReviewState;
};
export type ReviewAssignmentListResource = {
  readonly items: readonly ReviewAssignmentResource[];
  readonly next_cursor?: ReviewAssignmentId;
};
export type ReviewAssignmentSuccessEnvelope = SuccessEnvelope<ReviewAssignmentResource>;
export type ReviewAssignmentListSuccessEnvelope = SuccessEnvelope<ReviewAssignmentListResource>;

export type ReviewerCandidateResource = {
  readonly membership_id: MembershipId;
  readonly user_id: UserId;
  readonly display_name: string;
  readonly active_assignment_count: number;
};

export type OperationsReviewAssignmentResource = ReviewAssignmentResource & {
  readonly challenge_id: ChallengeId;
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly proposal_tracking_code: string;
  readonly rubric_version_id: RubricVersionId;
  readonly reviewer_membership_id: MembershipId;
  readonly reviewer_user_id: UserId;
  readonly reviewer_display_name: string;
  readonly replaces_assignment_id: ReviewAssignmentId | null;
  readonly cancellation_reason: string | null;
  readonly cancelled_at: string | null;
};

/** Frozen evaluation slots visible to Operations without proposal content or solver identity. */
export type OperationsEvaluationProposalResource = {
  readonly challenge_id: ChallengeId;
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly proposal_tracking_code: string;
  readonly rubric_version_id: RubricVersionId;
  readonly evaluation_version: number;
  readonly required_reviews: 2;
  readonly active_assignment_count: number;
};

export type OperationsReviewAssignmentListQuery = {
  readonly challenge_id?: ChallengeId;
};
export type OperationsReviewAssignmentListResource = {
  readonly evaluation_proposals: readonly OperationsEvaluationProposalResource[];
  readonly assignments: readonly OperationsReviewAssignmentResource[];
  readonly reviewers: readonly ReviewerCandidateResource[];
};
export type OperationsReviewAssignmentListSuccessEnvelope =
  SuccessEnvelope<OperationsReviewAssignmentListResource>;

export type CreateReviewAssignmentBody = VersionedCommand & {
  readonly challenge_id: ChallengeId;
  readonly proposal_id: ProposalId;
  readonly reviewer_membership_id: MembershipId;
  readonly due_at: string;
};
export type CancelReviewAssignmentBody = VersionedCommand & {
  readonly reason: string;
};
export type ReplaceReviewAssignmentBody = CancelReviewAssignmentBody & {
  readonly reviewer_membership_id: MembershipId;
  readonly due_at: string;
};
export type ReviewAssignmentNextAction = "await_coi" | "assign_replacement";
export type ReviewAssignmentMutationSuccessEnvelope = MutationSuccessEnvelope<
  ReviewAssignmentId,
  ReviewAssignmentNextAction
>;
