import type {
  ContactVerificationAttemptId,
  ContactVerificationChannel,
  SolverActivationId,
  SolverStartIntent,
  TenantId,
  UserId,
  WorkspaceId,
} from "@rahhal/domain";

import type {
  MutationReceipt,
  SuccessEnvelope,
  VersionedApiMeta,
  VersionedCommand,
} from "./envelopes.js";
import type { SessionTokenSet } from "./session.js";

export type StartContactVerificationBody = {
  readonly expected_version: 0;
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
};

export type ContactVerificationAttemptResource = {
  readonly attempt_id: ContactVerificationAttemptId;
  readonly channel: ContactVerificationChannel;
  readonly masked_destination: string;
  readonly state: "pending" | "verified";
  readonly version: number;
  readonly expires_at: string;
  readonly resend_available_at: string;
  readonly attempts_remaining: number;
};

export type ResendContactVerificationBody = VersionedCommand;

export type VerifyContactBody = VersionedCommand & {
  readonly code: string;
};

export type VerifiedContactResource = {
  readonly attempt: ContactVerificationAttemptResource & { readonly state: "verified" };
  readonly verification_token: string;
  readonly verification_token_expires_at: string;
};

export type ContactVerificationAttemptSuccessEnvelope = {
  readonly ok: true;
  readonly data: ContactVerificationAttemptResource;
  readonly meta: VersionedApiMeta;
};

export type VerifiedContactSuccessEnvelope = {
  readonly ok: true;
  readonly data: VerifiedContactResource;
  readonly meta: VersionedApiMeta;
};

export type ContactSessionExchangeBody = {
  readonly expected_version: 0;
  readonly verification_token: string;
};

export type ActivateSolverBody = {
  readonly expected_version: 0;
  readonly verification_token: string;
  readonly display_name: string;
  readonly start_intent: SolverStartIntent;
};

export type SolverActivationResource = {
  readonly id: SolverActivationId;
  readonly user_id: UserId;
  readonly tenant_id: TenantId;
  readonly individual_workspace_id: WorkspaceId;
  readonly start_intent: SolverStartIntent;
  readonly version: 1;
  readonly activated_at: string;
};

export type SolverActivationNextAction = "continue_individually" | "create_team";

export type SolverActivationSessionResult = {
  readonly activation: SolverActivationResource;
  readonly tokens: SessionTokenSet;
  readonly receipt: MutationReceipt<SolverActivationId, SolverActivationNextAction>;
};

export type SolverActivationSuccessEnvelope = {
  readonly ok: true;
  readonly data: SolverActivationSessionResult;
  readonly meta: VersionedApiMeta;
};

export type SolverActivationReadSuccessEnvelope = SuccessEnvelope<SolverActivationResource>;
