import type {
  ApplicantScope,
  ApplicantType,
  ApprovalDecision,
  ChallengeApprovalId,
  ChallengeBudgetStatus,
  ChallengeAuthoringStage,
  ChallengeDraftAuthoringStatus,
  ChallengeId,
  ChallengeIpTerms,
  ChallengeOutputType,
  ChallengeSourcingModel,
  ChallengeVersionId,
  ChallengeVisibility,
  ChallengeWorkMode,
  Currency,
  FileId,
  PublicationGate,
  TenantId,
  UserId,
  WorkspaceId,
  WorkspaceRole,
} from "@rahhal/domain";

import type {
  ApiReadiness,
  MutationSuccessEnvelope,
  VersionedApiMeta,
  VersionedCommand,
} from "./envelopes.js";

export type ChallengeSuccessCriterionResource = {
  readonly id: string;
  readonly title: string;
  readonly target: string;
  readonly method: string;
};

export type ChallengeBudgetResource = {
  readonly status: ChallengeBudgetStatus;
  readonly amount_minor: number | null;
  readonly currency: Currency;
};

export type ChallengeContactResource = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
};

export type ChallengeDraftContentResource = {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly location: string;
  readonly desired_outcome: string;
  readonly current_state: string;
  readonly consequence: string;
  readonly expected_output: string;
  readonly success_criteria: readonly ChallengeSuccessCriterionResource[];
  readonly in_scope: string;
  readonly constraints: string;
  readonly organization_support: string;
  readonly previous_attempts: string;
  readonly output_type: ChallengeOutputType | null;
  readonly sourcing_model: ChallengeSourcingModel | null;
  readonly applicant_scope: ApplicantScope | null;
  readonly allowed_applicant_types: readonly ApplicantType[];
  readonly work_mode: ChallengeWorkMode | null;
  readonly proposal_deadline: string | null;
  readonly preferred_start_date: string | null;
  readonly budget: ChallengeBudgetResource;
  readonly invitees: readonly string[];
  readonly visibility: ChallengeVisibility | null;
  readonly public_summary: string;
  readonly nda_required: boolean;
  readonly ip_terms: ChallengeIpTerms | null;
  readonly contact: ChallengeContactResource;
  readonly accuracy_confirmed: boolean;
  readonly legal_notes: string;
  readonly attachment_ids: readonly FileId[];
};

export type ChallengeDraftPatch = Partial<ChallengeDraftContentResource> & {
  readonly authoring_status?: ChallengeDraftAuthoringStatus;
};

export type ChallengeApprovalResource = {
  readonly id: ChallengeApprovalId;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly gate: PublicationGate;
  readonly decision: ApprovalDecision;
  readonly reason: string;
  readonly recorded_by: UserId;
  readonly recorded_by_role: WorkspaceRole;
  readonly recorded_at: string;
};

export type PublicationReadinessResource = {
  readonly ready: boolean;
  readonly satisfied: readonly PublicationGate[];
  readonly missing: readonly PublicationGate[];
};

export type ChallengeResource = {
  readonly id: ChallengeId;
  readonly current_version_id: ChallengeVersionId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly stage: ChallengeAuthoringStage;
  readonly authoring_status: ChallengeDraftAuthoringStatus;
  readonly version: number;
  readonly content_version: number;
  readonly readiness: ApiReadiness;
  readonly content: ChallengeDraftContentResource;
  readonly approvals: readonly ChallengeApprovalResource[];
  readonly publication_readiness: PublicationReadinessResource;
  readonly created_by: UserId;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CreateChallengeBody = {
  readonly expected_version: 0;
  readonly draft?: ChallengeDraftPatch;
};

export type PatchChallengeBody = VersionedCommand & {
  readonly patch: ChallengeDraftPatch;
};

export type ChallengeTransitionBody = VersionedCommand;

export type RecordChallengeApprovalBody = VersionedCommand & {
  readonly gate: PublicationGate;
  readonly decision: ApprovalDecision;
  readonly reason: string;
};

export type ChallengeNextAction =
  | "edit"
  | "request_triage"
  | "advance_formulation"
  | "request_approvals"
  | "await_approvals";

export type ChallengeApprovalNextAction = "await_remaining_gates" | "ready_for_publish";

export type ChallengeSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeResource;
  readonly meta: VersionedApiMeta;
};
export type ChallengeMutationSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeId,
  ChallengeNextAction
>;
export type ChallengeApprovalMutationSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeApprovalId,
  ChallengeApprovalNextAction
>;

export function hasChallengeDraftChanges(patch: ChallengeDraftPatch): boolean {
  return Object.keys(patch).length > 0;
}
