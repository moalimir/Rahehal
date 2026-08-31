import type {
  ApplicantScope,
  ApplicantType,
  ApprovalDecision,
  ChallengeApprovalId,
  ChallengeBudgetStatus,
  ChallengeDraftAuthoringStatus,
  ChallengeManagedStage,
  ChallengePublicationState,
  ChallengeId,
  ChallengeIpTerms,
  ChallengeOutputType,
  ChallengeSourcingModel,
  ChallengeVersionId,
  ChallengeVisibility,
  ProjectableVisibility,
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
  SuccessEnvelope,
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
  readonly verification_required: boolean;
  readonly nda_required: boolean;
  readonly document_gate_required: boolean;
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

/**
 * The content a standing platform gate approver may review. Contact details,
 * invitees, and private file identifiers are deliberately absent.
 */
export type ChallengeApprovalBriefContentResource = Omit<
  ChallengeDraftContentResource,
  "contact" | "invitees" | "attachment_ids"
>;

/** Platform-facing approval evidence without another user's stable identifier. */
export type ChallengeApprovalSummaryResource = {
  readonly gate: PublicationGate;
  readonly decision: ApprovalDecision;
  readonly reason: string;
  readonly recorded_by_role: WorkspaceRole;
  readonly recorded_at: string;
  readonly recorded_by_current_actor: boolean;
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
  readonly stage: ChallengeManagedStage;
  readonly published_version_id: ChallengeVersionId | null;
  /** Null until the challenge is published (B6). */
  readonly publication_state: ChallengePublicationState | null;
  readonly proposal_deadline_at: string | null;
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

/** A structurally separate, allowlisted read model for platform approval work. */
export type ChallengeApprovalBriefResource = {
  readonly id: ChallengeId;
  readonly current_version_id: ChallengeVersionId;
  readonly workspace_id: WorkspaceId;
  readonly stage: "approvals";
  readonly version: number;
  readonly content: ChallengeApprovalBriefContentResource;
  readonly approvals: readonly ChallengeApprovalSummaryResource[];
  readonly publication_readiness: PublicationReadinessResource;
  readonly updated_at: string;
};

export type PlatformChallengeApprovalQueueItem = {
  readonly challenge_id: ChallengeId;
  readonly current_version_id: ChallengeVersionId;
  readonly workspace_id: WorkspaceId;
  readonly version: number;
  readonly title: string;
  readonly category: string;
  readonly gate: PublicationGate;
  readonly updated_at: string;
};

export type PlatformChallengeApprovalQueueResource = {
  readonly items: readonly PlatformChallengeApprovalQueueItem[];
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

/**
 * B6's publication-lifecycle commands. Every one carries a required structured
 * reason: unlike routine publication, each of these overrides or curtails what
 * solvers were already told, so "why" is the whole record.
 */
export type ExtendChallengeDeadlineBody = VersionedCommand & {
  readonly proposal_deadline: string;
  readonly reason: string;
};

export type ChallengePublicationStateBody = VersionedCommand & {
  readonly reason: string;
};

export type ChallengeNextAction =
  | "edit"
  | "request_triage"
  | "advance_formulation"
  | "request_approvals"
  | "await_approvals"
  | "await_proposals"
  | "await_resume"
  | "closed";

/**
 * Publishing carries no payload beyond the optimistic-concurrency envelope:
 * every publishable fact is already locked into the approved version, so the
 * command deliberately offers no field that could differ from what the four
 * gates actually approved.
 */
export type PublishChallengeBody = VersionedCommand;

/**
 * The public face of a published challenge — the structurally separate
 * projection written at publish time from `challengePublicProjectionFields`.
 * It is a distinct resource, never `ChallengeResource` with fields removed at
 * render time.
 */
export type ChallengePublicProjectionResource = {
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly title: string;
  readonly category: string;
  readonly location: string;
  readonly public_summary: string;
  readonly output_type: ChallengeOutputType;
  readonly sourcing_model: ChallengeSourcingModel;
  readonly applicant_scope: ApplicantScope;
  readonly allowed_applicant_types: readonly ApplicantType[];
  readonly work_mode: ChallengeWorkMode;
  readonly proposal_deadline: string;
  readonly preferred_start_date: string | null;
  readonly budget: ChallengeBudgetResource;
  readonly visibility: ProjectableVisibility;
  readonly verification_required: boolean;
  readonly nda_required: boolean;
  readonly document_gate_required: boolean;
  readonly ip_terms: ChallengeIpTerms;
  readonly state: ChallengePublicationState;
  readonly published_at: string;
};

export type ChallengeApprovalNextAction = "await_remaining_gates" | "ready_for_publish";

export type ChallengeSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeResource;
  readonly meta: VersionedApiMeta;
};
export type ChallengeApprovalBriefSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeApprovalBriefResource;
  readonly meta: VersionedApiMeta;
};
export type PlatformChallengeApprovalQueueSuccessEnvelope =
  SuccessEnvelope<PlatformChallengeApprovalQueueResource>;
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

/**
 * One page of the public challenge catalogue (B5). The cursor is opaque to
 * callers: it encodes the keyset position of the last row, so a challenge
 * published mid-scan cannot silently shift a page boundary the way an
 * offset would.
 */
export type ChallengePublicPage = {
  readonly items: readonly ChallengePublicProjectionResource[];
  readonly next_cursor: string | null;
};

/**
 * What a public reader is allowed to see, decided by whether the request
 * carries a valid session — never by a client-supplied flag. Anonymous
 * readers see `public` rows only; `registered` rows additionally require an
 * authenticated caller.
 */
export type PublicAudience = "anonymous" | "registered";

export type PublicChallengeQuery = {
  readonly category?: string;
  readonly cursor?: string;
};

export type ChallengePublicPageSuccessEnvelope = SuccessEnvelope<ChallengePublicPage>;
export type ChallengePublicSuccessEnvelope = SuccessEnvelope<ChallengePublicProjectionResource>;
