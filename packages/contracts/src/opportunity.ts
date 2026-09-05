import type {
  ChallengeId,
  ChallengeVersionId,
  Currency,
  DirectOfferId,
  DirectOfferState,
  FileId,
  OfferResponseId,
  OfferResponseState,
  SavedOpportunityId,
  WorkspaceId,
} from "@rahhal/domain";

import type { SuccessEnvelope, VersionedCommand } from "./envelopes.js";

export type SavedOpportunityResource = {
  readonly id: SavedOpportunityId;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly version: 1;
  readonly saved_at: string;
};

export type SavedOpportunityListResource = {
  readonly items: readonly SavedOpportunityResource[];
};

export type SaveOpportunityBody = { readonly expected_version: 0 };
export type UnsaveOpportunityBody = VersionedCommand;

export type OfferResponseContentResource = {
  readonly approach: string;
  readonly scope: string;
  readonly start_availability: string;
  readonly duration_weeks: number | null;
  readonly budget_amount_minor: number | null;
  readonly budget_currency: Currency;
  readonly payment_model: string;
  readonly negotiables: string;
  readonly authority_confirmed: boolean;
  readonly attachment_ids: readonly FileId[];
};

export type OfferResponseContentPatch = Partial<OfferResponseContentResource>;

export type OfferResponseReadinessIssueResource = {
  readonly path: string;
  readonly code: "required" | "min_length" | "format";
  readonly message: string;
};

export type OfferResponseResource = {
  readonly id: OfferResponseId;
  readonly state: OfferResponseState;
  readonly version: number;
  readonly content: OfferResponseContentResource;
  readonly readiness: {
    readonly ready: boolean;
    readonly evaluated_version: number;
    readonly issues: readonly OfferResponseReadinessIssueResource[];
  };
  readonly submitted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DirectOfferResource = {
  readonly id: DirectOfferId;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly sender_organization_workspace_id: WorkspaceId;
  readonly recipient_workspace_id: WorkspaceId;
  readonly recipient_workspace_kind: "individual" | "team";
  readonly title: string;
  readonly summary: string;
  readonly invitation_reasons: readonly string[];
  readonly requested_documents: readonly string[];
  readonly response_deadline: string;
  readonly state: DirectOfferState;
  readonly version: number;
  readonly response: OfferResponseResource | null;
  readonly viewed_at: string | null;
  readonly decline_reason: string | null;
  readonly declined_at: string | null;
  readonly cancellation_reason: string | null;
  readonly cancelled_at: string | null;
  readonly expired_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type DirectOfferListResource = {
  readonly items: readonly DirectOfferResource[];
};

export type CreateDirectOfferBody = {
  readonly expected_version: 0;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly recipient_workspace_id: WorkspaceId;
  readonly title: string;
  readonly summary: string;
  readonly invitation_reasons: readonly string[];
  readonly requested_documents: readonly string[];
  readonly response_deadline: string;
};

export type ViewDirectOfferBody = VersionedCommand;
export type StartOfferResponseBody = VersionedCommand;
export type PatchOfferResponseBody = VersionedCommand & {
  readonly patch: OfferResponseContentPatch;
};
export type SubmitOfferResponseBody = VersionedCommand;
export type DeclineDirectOfferBody = VersionedCommand & { readonly reason: string };
export type CancelDirectOfferBody = VersionedCommand & { readonly reason: string };
export type StartDirectOfferNegotiationBody = VersionedCommand;

export type SavedOpportunityNextAction = "unsave" | "saved";
export type DirectOfferNextAction =
  | "await_response"
  | "view"
  | "start_response"
  | "edit_response"
  | "submit_response"
  | "decline"
  | "cancel"
  | "await_organization"
  | "continue_negotiation"
  | "closed";

export type SavedOpportunityListSuccessEnvelope = SuccessEnvelope<SavedOpportunityListResource>;
export type DirectOfferSuccessEnvelope = SuccessEnvelope<DirectOfferResource>;
export type DirectOfferListSuccessEnvelope = SuccessEnvelope<DirectOfferListResource>;
