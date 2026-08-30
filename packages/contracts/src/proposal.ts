import type {
  ApplicantType,
  ChallengeId,
  EligibilityReasonCode,
  EligibilityStatus,
  ProposalId,
  ProposalState,
  ProposalVersionId,
  TenantId,
  UserId,
  WorkspaceId,
} from "@rahhal/domain";

import type { ApiReadiness, SuccessEnvelope, VersionedCommand } from "./envelopes.js";

export type ProposalContentResource = {
  readonly title: string;
  readonly problem_statement: string;
  readonly value_proposition: string;
  readonly maturity_level: string;
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
  readonly team_summary: string;
  readonly budget_amount_minor: number | null;
  readonly budget_currency: string;
  readonly attachment_ids: readonly string[];
  readonly terms_accepted: boolean;
};

export type ProposalContentPatch = Partial<ProposalContentResource>;

export type ProposalVersionResource = {
  readonly id: ProposalVersionId;
  readonly version_number: number;
  readonly base_version_id: ProposalVersionId | null;
  readonly changed_fields: readonly string[];
  readonly content_hash: string;
  readonly locked: boolean;
  readonly actor_user_id: UserId;
  readonly created_at: string;
};

export type ProposalResource = {
  readonly id: ProposalId;
  readonly current_version_id: ProposalVersionId;
  readonly tenant_id: TenantId;
  readonly owner_workspace_id: WorkspaceId;
  readonly challenge_id: ChallengeId;
  readonly state: ProposalState;
  readonly tracking_code: string | null;
  readonly version: number;
  readonly readiness: ApiReadiness;
  readonly content: ProposalContentResource;
  readonly versions: readonly ProposalVersionResource[];
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
  readonly accepted_challenge_version_id: string;
};

export type WithdrawProposalBody = VersionedCommand & {
  readonly reason: string;
};

export type ProposalNextAction =
  | "edit"
  | "submit"
  | "await_eligibility"
  | "await_review"
  | "answer_clarification"
  | "start_revision"
  | "withdrawn";

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
  readonly evaluated_against_version_id: string;
  readonly applicant_type: ApplicantType | null;
  readonly status: EligibilityStatus;
  readonly reasons: readonly EligibilityReasonResource[];
  readonly next_actions: readonly string[];
  readonly evaluated_at: string;
};

export type ProposalSuccessEnvelope = SuccessEnvelope<ProposalResource>;
export type EligibilitySuccessEnvelope = SuccessEnvelope<EligibilityDecisionResource>;
