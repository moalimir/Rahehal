import type { SessionId } from "@rahhal/domain";

import type {
  SuccessEnvelope,
  MutationReceipt,
  MutationSuccessEnvelope,
  VersionedApiMeta,
  VersionedCommand,
} from "./envelopes.js";

export type OidcAuthorizationStartBody = {
  readonly expected_version: 0;
  readonly redirect_uri: string;
};

export type OidcAuthorizationStartResult = {
  readonly authorization_url: string;
  readonly state: string;
  readonly code_verifier: string;
  readonly expires_at: string;
};

export type OidcAuthorizationStartSuccessEnvelope = SuccessEnvelope<OidcAuthorizationStartResult>;

export type SessionExchangeBody = {
  readonly expected_version: 0;
  readonly authorization_code: string;
  readonly code_verifier: string;
  readonly redirect_uri: string;
  readonly state: string;
};

export type SessionRefreshBody = VersionedCommand & {
  readonly refresh_token: string;
};

export type SessionRevokeBody = VersionedCommand & {
  readonly session_id: SessionId;
};

export type SessionTokenSet = {
  readonly session_id: SessionId;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly access_token_expires_at: string;
  readonly refresh_token_expires_at: string;
};

export type SessionTokenMutationResult = {
  readonly tokens: SessionTokenSet;
  readonly receipt: MutationReceipt<SessionId, "select_workspace" | "continue">;
};

export type SessionSuccessEnvelope = {
  readonly ok: true;
  readonly data: SessionTokenMutationResult;
  readonly meta: VersionedApiMeta;
};

export type SessionRevocationSuccessEnvelope = MutationSuccessEnvelope<SessionId, "signed_out">;
