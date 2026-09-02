import type {
  ApplicantType,
  ChallengeVersionId,
  EligibilityGateAcceptanceId,
  EligibilityGateKind,
  TenantId,
  UserId,
  VerificationId,
  VerificationState,
  WorkspaceId,
} from "@rahhal/domain";

import type { MutationReceipt, SuccessEnvelope, VersionedCommand } from "./envelopes.js";

export type SolverProfileReadinessResource = {
  readonly ready: boolean;
  readonly issues: readonly {
    readonly path: string;
    readonly code: "required" | "min_length";
    readonly message: string;
  }[];
};

export type SolverWorkspaceProfileResource = {
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly workspace_kind: "individual" | "team";
  readonly applicant_type: ApplicantType;
  readonly headline: string;
  readonly overview: string;
  readonly expertise: readonly string[];
  readonly geography: readonly string[];
  readonly readiness: SolverProfileReadinessResource;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export type PatchSolverWorkspaceProfileBody = VersionedCommand & {
  readonly patch: Partial<
    Pick<SolverWorkspaceProfileResource, "headline" | "overview" | "expertise" | "geography">
  >;
};

export type SolverVerificationResource = {
  readonly id: VerificationId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly state: VerificationState;
  readonly version: number;
  readonly requested_at: string | null;
  readonly submitted_at: string | null;
  readonly verified_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type StartSolverVerificationBody = VersionedCommand;

export type AcceptEligibilityGateBody = {
  readonly expected_version: 0;
  readonly challenge_version_id: ChallengeVersionId;
};

export type EligibilityGateAcceptanceResource = {
  readonly id: EligibilityGateAcceptanceId;
  readonly workspace_id: WorkspaceId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly gate: EligibilityGateKind;
  readonly accepted_by: UserId;
  readonly accepted_at: string;
};

export type SolverProfileNextAction = "continue" | "review_profile";
export type SolverVerificationNextAction = "complete_verification_request";
export type EligibilityGateNextAction = "recheck_eligibility";

export type SolverWorkspaceProfileSuccessEnvelope = SuccessEnvelope<SolverWorkspaceProfileResource>;
export type SolverVerificationSuccessEnvelope = SuccessEnvelope<SolverVerificationResource>;
export type EligibilityGateAcceptanceMutationSuccessEnvelope = SuccessEnvelope<
  MutationReceipt<EligibilityGateAcceptanceId, EligibilityGateNextAction>
>;
