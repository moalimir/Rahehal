import type {
  ApplicantType,
  ChallengeId,
  ChallengeVersionId,
  Currency,
  EligibilityNextAction,
  EligibilityReasonCode,
  EligibilityStatus,
  FileId,
  MembershipId,
  ProposalId,
  ProposalClarificationId,
  ProposalRevisionRequestId,
  ProposalState,
  ProposalVersionId,
  TenantId,
  UserId,
  WorkspaceId,
} from "@rahhal/domain";

import type { SuccessEnvelope, VersionedCommand } from "./envelopes.js";

export type ProposalContentResource = {
  readonly title: string;
  readonly problem_statement: string;
  readonly value_proposition: string;
  readonly maturity_level: string;
  readonly prototype_weeks: string;
  readonly technologies: readonly string[];
  readonly technical_approach: string;
  readonly architecture: string;
  readonly data_needs: string;
  readonly success_metrics: string;
  readonly ip_status: string;
  readonly duration_weeks: string;
  readonly roadmap: string;
  readonly dependencies: string;
  readonly pilot_location: string;
  readonly risks: string;
  readonly mitigation: string;
  readonly lead_name: string;
  readonly team_summary: string;
  readonly relevant_experience: string;
  readonly budget_amount_minor: number | null;
  readonly budget_currency: Currency;
  readonly payment_model: string;
  readonly budget_rationale: string;
  readonly start_availability: string;
  readonly team_availability: string;
  readonly nda_accepted: boolean;
  readonly conflict_declared: boolean;
  readonly ip_accepted: boolean;
  readonly accuracy_confirmed: boolean;
  readonly attachment_ids: readonly FileId[];
};

export type ProposalContentPatch = Partial<ProposalContentResource>;

export type ProposalVersionResource = {
  readonly id: ProposalVersionId;
  readonly version_number: number;
  readonly base_version_id: ProposalVersionId | null;
  readonly accepted_challenge_version_id: ChallengeVersionId | null;
  readonly changed_fields: readonly string[];
  readonly content_hash: string;
  readonly locked: boolean;
  readonly actor_user_id: UserId;
  readonly created_at: string;
};

export type ProposalReadinessIssueResource = {
  readonly path: string;
  readonly code: "required" | "min_length" | "format";
  readonly message: string;
};

export type ProposalReadinessResource = {
  readonly ready: boolean;
  readonly evaluated_version: number;
  readonly issues: readonly ProposalReadinessIssueResource[];
};

export type ProposalResource = {
  readonly id: ProposalId;
  readonly current_version_id: ProposalVersionId;
  readonly tenant_id: TenantId;
  readonly owner_workspace_id: WorkspaceId;
  readonly owner_workspace_kind: "individual" | "team";
  readonly challenge_id: ChallengeId;
  readonly assigned_membership_ids: readonly MembershipId[];
  readonly state: ProposalState;
  readonly tracking_code: string | null;
  readonly version: number;
  readonly readiness: ProposalReadinessResource;
  readonly content: ProposalContentResource;
  readonly versions: readonly ProposalVersionResource[];
  readonly clarifications: readonly ProposalClarificationResource[];
  readonly revision_requests: readonly ProposalRevisionRequestResource[];
  readonly submitted_at: string | null;
  readonly created_by: UserId;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CreateProposalBody = {
  readonly expected_version: 0;
  readonly challenge_id: ChallengeId;
  readonly draft?: ProposalContentPatch;
};

export type PatchProposalBody = VersionedCommand & {
  readonly patch: ProposalContentPatch;
};

/**
 * Submission and resubmission both carry an explicit acceptance of the call's
 * terms: the organization must be able to prove the solver agreed to the exact
 * published version, not merely that a row exists.
 */
export type SubmitProposalBody = VersionedCommand & {
  readonly accepted_challenge_version_id: ChallengeVersionId;
};

export type StartProposalEligibilityReviewBody = VersionedCommand;

export type DecideProposalEligibilityBody = VersionedCommand & {
  readonly decision: "eligible" | "ineligible";
  readonly reason: string;
};

export type RequestProposalClarificationBody = VersionedCommand & {
  readonly question: string;
};

export type SubmitProposalClarificationBody = VersionedCommand & {
  readonly clarification_id: ProposalClarificationId;
  readonly response: string;
};

export type ResolveProposalClarificationBody = VersionedCommand & {
  readonly clarification_id: ProposalClarificationId;
  readonly resolution: string;
};

export type RequestProposalRevisionBody = VersionedCommand & {
  readonly scope: string;
  readonly revision_deadline: string;
};

export type StartProposalRevisionBody = VersionedCommand & {
  readonly revision_request_id: ProposalRevisionRequestId;
};

export type ResubmitProposalBody = SubmitProposalBody & {
  readonly revision_request_id: ProposalRevisionRequestId;
};

export type ProposalNextAction =
  | "edit"
  | "submit"
  | "await_eligibility"
  | "record_eligibility"
  | "request_clarification"
  | "respond_to_clarification"
  | "resolve_clarification"
  | "request_revision"
  | "start_revision"
  | "edit_revision"
  | "resubmit"
  | "await_review";

export type ProposalClarificationResource = {
  readonly id: ProposalClarificationId;
  readonly proposal_version_id: ProposalVersionId;
  readonly state: "requested" | "submitted" | "resolved";
  readonly question: string;
  readonly response: string | null;
  readonly resolution: string | null;
  readonly requested_at: string;
  readonly submitted_at: string | null;
  readonly resolved_at: string | null;
};

export type ProposalRevisionRequestResource = {
  readonly id: ProposalRevisionRequestId;
  readonly base_version_id: ProposalVersionId;
  readonly resubmitted_version_id: ProposalVersionId | null;
  readonly state: "requested" | "in_progress" | "resubmitted";
  readonly scope: string;
  readonly revision_deadline: string;
  readonly requested_at: string;
  readonly started_at: string | null;
  readonly resubmitted_at: string | null;
};

export type OrganizationProposalVersionResource = {
  readonly id: ProposalVersionId;
  readonly version_number: number;
  readonly base_version_id: ProposalVersionId;
  readonly accepted_challenge_version_id: ChallengeVersionId;
  readonly changed_fields: readonly string[];
  readonly content_hash: string;
  readonly locked_at: string;
};

/** Closed inbox row. Proposal content is available only from the grant-scoped detail read. */
export type OrganizationProposalInboxItemResource = {
  readonly id: ProposalId;
  readonly challenge_id: ChallengeId;
  readonly owner_workspace_kind: "individual" | "team";
  readonly state: ProposalState;
  readonly tracking_code: string;
  readonly submitted_at: string;
  readonly submitted_version: OrganizationProposalVersionResource;
};

export type OrganizationProposalResource = OrganizationProposalInboxItemResource & {
  readonly content: ProposalContentResource;
  readonly clarifications: readonly ProposalClarificationResource[];
  readonly revision_requests: readonly ProposalRevisionRequestResource[];
};

export type OrganizationProposalInboxResource = {
  readonly items: readonly OrganizationProposalInboxItemResource[];
};

/**
 * C1's decision, returned for one (challenge, active workspace) pair. It names
 * the challenge version it judged, so a solver can tell which published terms
 * the answer refers to.
 */
export type EligibilityReasonResource = {
  readonly code: EligibilityReasonCode;
  readonly message: string;
};

export type EligibilityDecisionResource = {
  readonly challenge_id: ChallengeId;
  readonly evaluated_against_version_id: ChallengeVersionId;
  readonly applicant_type: ApplicantType | null;
  readonly status: EligibilityStatus;
  readonly reasons: readonly EligibilityReasonResource[];
  readonly next_actions: readonly EligibilityNextAction[];
  readonly evaluated_at: string;
};

export type ProposalSuccessEnvelope = SuccessEnvelope<ProposalResource>;
export type OrganizationProposalSuccessEnvelope = SuccessEnvelope<OrganizationProposalResource>;
export type OrganizationProposalInboxSuccessEnvelope =
  SuccessEnvelope<OrganizationProposalInboxResource>;
export type EligibilitySuccessEnvelope = SuccessEnvelope<EligibilityDecisionResource>;
