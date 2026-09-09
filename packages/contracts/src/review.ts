import type {
  ChallengeId,
  MembershipId,
  ProposalId,
  ProposalVersionId,
  ReviewAssignmentId,
  ReviewCoiRelationshipCategory,
  ReviewCoiState,
  ReviewState,
  RubricCriterion,
  RubricVersionId,
  UserId,
} from "@rahhal/domain";
import type { MutationSuccessEnvelope, SuccessEnvelope, VersionedCommand } from "./envelopes.js";
import type { ProposalContentResource } from "./proposal.js";

/** Explicitly allowlisted context available before a reviewer clears COI. */
export type ReviewPreCoiPacketResource = {
  readonly organization_name: string;
  readonly challenge_title: string;
};

export type ReviewCoiDeclarationResource = {
  readonly status: ReviewCoiState;
  readonly relationship_categories: readonly ReviewCoiRelationshipCategory[];
  readonly reason: string | null;
  readonly declared_at: string | null;
};

/** Assignment bookkeeping plus the deliberately narrow conflict-identification packet. */
export type ReviewAssignmentResource = {
  readonly id: ReviewAssignmentId;
  readonly state: ReviewState;
  readonly coi_status: ReviewCoiState;
  readonly pre_coi_packet: ReviewPreCoiPacketResource;
  readonly coi_declaration: ReviewCoiDeclarationResource;
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

/**
 * The D5 reviewer projection from one exact locked proposal version.
 * Identity, team history, commercial terms, declarations and attachment identifiers
 * stay absent until a later accepted policy explicitly releases them.
 */
export type ReviewProposalContentResource = Pick<
  ProposalContentResource,
  | "title"
  | "problem_statement"
  | "value_proposition"
  | "maturity_level"
  | "prototype_weeks"
  | "technologies"
  | "technical_approach"
  | "architecture"
  | "data_needs"
  | "success_metrics"
  | "ip_status"
  | "duration_weeks"
  | "roadmap"
  | "dependencies"
  | "pilot_location"
  | "risks"
  | "mitigation"
  | "start_availability"
  | "team_availability"
>;

/** Exact frozen, purpose-limited material available only after clear COI and acceptance. */
export type ReviewMaterialsResource = {
  readonly assignment_id: ReviewAssignmentId;
  readonly proposal_version_id: ProposalVersionId;
  readonly rubric_version_id: RubricVersionId;
  readonly organization_name: string;
  readonly challenge_title: string;
  readonly proposal_content: ReviewProposalContentResource;
  readonly rubric_criteria: readonly RubricCriterion[];
};
export type ReviewMaterialsSuccessEnvelope = SuccessEnvelope<ReviewMaterialsResource>;

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

/** Purpose-limited conflict queue: no proposal identity/content or solver identity. */
export type OperationsReviewConflictResource = {
  readonly assignment_id: ReviewAssignmentId;
  readonly reviewer_membership_id: MembershipId;
  readonly reviewer_user_id: UserId;
  readonly reviewer_display_name: string;
  readonly organization_name: string;
  readonly challenge_title: string;
  readonly relationship_categories: readonly ReviewCoiRelationshipCategory[];
  readonly reason: string;
  readonly declared_at: string;
  readonly assignment_version: number;
};
export type OperationsReviewConflictListResource = {
  readonly items: readonly OperationsReviewConflictResource[];
};
export type OperationsReviewConflictListSuccessEnvelope =
  SuccessEnvelope<OperationsReviewConflictListResource>;

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
export type DeclareReviewCoiBody = Pick<VersionedCommand, "expected_version"> & {
  readonly status: Exclude<ReviewCoiState, "pending">;
  readonly relationship_categories: readonly ReviewCoiRelationshipCategory[];
  readonly reason?: string | null;
  readonly attestation: true;
};
export type ReviewAssignmentNextAction = "await_coi" | "assign_replacement" | "review_materials";
export type ReviewAssignmentMutationSuccessEnvelope = MutationSuccessEnvelope<
  ReviewAssignmentId,
  ReviewAssignmentNextAction
>;
