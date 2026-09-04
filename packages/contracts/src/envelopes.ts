import type {
  AuditEventId,
  ChallengeReadinessIssue,
  CorrelationId,
  EntityId,
  ReceiptId,
  WorkspaceId,
} from "@rahhal/domain";
import type { EligibilityDecisionResource } from "./proposal.js";

export const apiErrorCodes = [
  "VALIDATION",
  "NO_ACCESS",
  "NOT_FOUND",
  "INVALID_STATE",
  "CONFLICT",
  "STEP_UP_REQUIRED",
  "STORAGE",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorStatus: Readonly<Record<ApiErrorCode, number>> = {
  VALIDATION: 422,
  NO_ACCESS: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT: 409,
  STEP_UP_REQUIRED: 403,
  STORAGE: 503,
};

export type ApiFieldError = {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly step?: 1 | 2 | 3 | 4;
};

export type ApiReadiness = {
  readonly ready: boolean;
  readonly evaluated_version: number;
  readonly issues: readonly ChallengeReadinessIssue[];
};

export type ApiError = {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly fields?: readonly ApiFieldError[];
  readonly current_version?: number;
  readonly current_state?: string;
  readonly allowed_transitions?: readonly string[];
  readonly readiness?: ApiReadiness;
  readonly recovery?: string;
  readonly eligibility?: EligibilityDecisionResource;
};

export type ApiMeta = {
  readonly server_time: string;
  readonly correlation_id: CorrelationId;
  readonly entity_version?: number;
};

export type VersionedApiMeta = ApiMeta & {
  readonly entity_version: number;
};

export type SuccessEnvelope<Data> = {
  readonly ok: true;
  readonly data: Data;
  readonly meta: ApiMeta;
};

export type ErrorEnvelope = {
  readonly ok: false;
  readonly error: ApiError;
  readonly meta: ApiMeta;
};

export type ApiEnvelope<Data> = SuccessEnvelope<Data> | ErrorEnvelope;

export type MutationReceipt<
  TargetId extends string = EntityId,
  NextAction extends string = string,
> = {
  readonly entity_id: TargetId;
  readonly receipt_id: ReceiptId;
  readonly audit_event_id: AuditEventId;
  readonly timestamp: string;
  readonly idempotent: boolean;
  readonly next_actions: readonly NextAction[];
};

export type MutationSuccessEnvelope<
  TargetId extends string = EntityId,
  NextAction extends string = string,
> = {
  readonly ok: true;
  readonly data: MutationReceipt<TargetId, NextAction>;
  readonly meta: VersionedApiMeta;
};

export type VersionedCommand = {
  readonly expected_version: number;
  readonly reason?: string;
  readonly step_up_token?: string;
};

export const apiHeaderNames = {
  workspaceId: "X-Workspace-Id",
  idempotencyKey: "Idempotency-Key",
} as const;

export type IdempotencyHeaders = {
  readonly "idempotency-key": string;
};

export type WorkspaceCommandHeaders = IdempotencyHeaders & {
  readonly "x-workspace-id": WorkspaceId;
};
