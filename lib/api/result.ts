import type { ApiErrorCode, ApiFieldError, ErrorEnvelope } from "@rahhal/contracts";

/**
 * The one shape every connected gateway returns.
 *
 * C9 replaces browser repositories with network gateways, and a page can only
 * render honest loading/empty/validation/conflict/revoked states if every
 * family reports failure the same way. Gateways therefore never throw for an
 * API-level problem: an unreachable service, a denied scope, and a stale
 * version are all typed results the caller must handle.
 */
export type GatewayMeta = {
  readonly server_time: string;
  readonly correlation_id: string;
  readonly entity_version?: number;
};

export type GatewayFailure = {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly fields?: readonly ApiFieldError[];
  readonly current_version?: number;
  readonly current_state?: string;
  readonly recovery?: string;
};

export type GatewayResult<Data> =
  | { readonly ok: true; readonly data: Data; readonly meta: GatewayMeta }
  | { readonly ok: false; readonly error: GatewayFailure; readonly meta: GatewayMeta };

type SuccessEnvelopeLike = {
  readonly ok: true;
  readonly data: unknown;
  readonly meta: GatewayMeta;
};

export function isFailure(value: unknown): value is ErrorEnvelope {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}

/** Normalizes an API envelope into the gateway result the UI consumes. */
export function toResult<Data>(
  envelope: SuccessEnvelopeLike | ErrorEnvelope,
  select: (data: unknown) => Data,
): GatewayResult<Data> {
  if (isFailure(envelope)) {
    const error = envelope.error;
    return {
      ok: false,
      meta: envelope.meta,
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.current_version === undefined ? {} : { current_version: error.current_version }),
        ...(error.current_state === undefined ? {} : { current_state: error.current_state }),
        ...(error.recovery === undefined ? {} : { recovery: error.recovery }),
      },
    };
  }
  return { ok: true, data: select(envelope.data), meta: envelope.meta };
}

/**
 * True when a failure means the caller's session or scope no longer holds, so
 * a page must recover rather than retry: re-resolve the session, send the
 * human back to `/app`, or show the non-enumerating unavailable state.
 */
export function isScopeLost(error: GatewayFailure): boolean {
  return error.code === "NO_ACCESS" || error.code === "ACTIVATION_REQUIRED";
}
