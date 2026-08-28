import type { ApiErrorCode, ApiFieldError, ApiReadiness, ErrorEnvelope } from "@rahhal/contracts";
import type { CorrelationId } from "@rahhal/domain";

export type ApiProblemOptions = {
  readonly currentVersion?: number;
  readonly fields?: readonly ApiFieldError[];
  readonly currentState?: string;
  readonly allowedTransitions?: readonly string[];
  readonly readiness?: ApiReadiness;
  readonly recovery?: string;
};

export class ApiProblem extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly options: ApiProblemOptions = {},
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

export function errorEnvelope(
  problem: ApiProblem,
  correlationId: CorrelationId,
  serverTime: string,
): ErrorEnvelope {
  return {
    ok: false,
    error: {
      code: problem.code,
      message: problem.message,
      ...(problem.options.currentVersion === undefined
        ? {}
        : { current_version: problem.options.currentVersion }),
      ...(problem.options.fields === undefined ? {} : { fields: problem.options.fields }),
      ...(problem.options.currentState === undefined
        ? {}
        : { current_state: problem.options.currentState }),
      ...(problem.options.allowedTransitions === undefined
        ? {}
        : { allowed_transitions: problem.options.allowedTransitions }),
      ...(problem.options.readiness === undefined ? {} : { readiness: problem.options.readiness }),
      ...(problem.options.recovery === undefined ? {} : { recovery: problem.options.recovery }),
    },
    meta: { server_time: serverTime, correlation_id: correlationId },
  };
}

export const unauthorized = () => new ApiProblem(403, "NO_ACCESS", "Authentication required");

export const forbidden = () => new ApiProblem(403, "NO_ACCESS", "Action is not allowed");

export const notFound = () =>
  new ApiProblem(404, "NOT_FOUND", "The requested resource is unavailable");

export const staleVersion = (currentVersion: number) =>
  new ApiProblem(409, "CONFLICT", "The aggregate version is stale", {
    currentVersion,
    recovery: "refetch_and_retry",
  });

export const idempotencyConflict = () =>
  new ApiProblem(409, "CONFLICT", "The idempotency key was already used for another command", {
    recovery: "use_a_new_idempotency_key",
  });
