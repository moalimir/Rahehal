import type {
  BrowserSolverActivationSuccessEnvelope,
  ContactVerificationAttemptResource,
  ContactVerificationAttemptSuccessEnvelope,
  MutationSuccessEnvelope,
  VerifiedContactSuccessEnvelope,
} from "@rahhal/contracts";
import { apiRoutes, browserSessionRoutes } from "@rahhal/contracts";
import type { ContactVerificationChannel, SolverStartIntent } from "@rahhal/domain";

import { idempotencyKey, requestApi } from "@/lib/api/http";
import { toResult, type GatewayResult } from "@/lib/api/result";

/**
 * The connected solver sign-in and activation flow.
 *
 * Start and verify are ordinary unauthenticated API calls: they carry no
 * credential and return none. The two steps that mint a session -- returning
 * sign-in and first activation -- go through the same-origin browser routes
 * instead, which run the same commands and put the tokens in HttpOnly cookies.
 * A session token never reaches this file, and nothing here is stored in
 * `localStorage` or `sessionStorage`: the browser is not the authority for
 * who is signed in.
 */
export type ContactVerificationStart = {
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
};

export function startContactVerification(
  input: ContactVerificationStart,
): Promise<GatewayResult<ContactVerificationAttemptResource>> {
  return requestApi<ContactVerificationAttemptSuccessEnvelope>(apiRoutes.contactVerificationStart, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("contact-start") },
    body: JSON.stringify({ expected_version: 0, ...input }),
  }).then((envelope) => toResult(envelope, (data) => data as ContactVerificationAttemptResource));
}

export function resendContactVerification(
  attemptId: string,
  expectedVersion: number,
): Promise<GatewayResult<ContactVerificationAttemptResource>> {
  return requestApi<ContactVerificationAttemptSuccessEnvelope>(
    apiRoutes.resendContactVerification.replace("{attemptId}", encodeURIComponent(attemptId)),
    {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey("contact-resend") },
      body: JSON.stringify({ expected_version: expectedVersion }),
    },
  ).then((envelope) => toResult(envelope, (data) => data as ContactVerificationAttemptResource));
}

export type VerifiedContact = {
  readonly verificationToken: string;
  readonly expiresAt: string;
};

/**
 * Exchanges the code for a short-lived verification token.
 *
 * The code is sent as typed. The provider normalizes Persian and Arabic-Indic
 * digits itself, so a human entering `۱۲۳۴۵` is not asked to retype it in
 * Latin numerals on a Persian-first product.
 */
export function verifyContact(
  attemptId: string,
  input: { readonly expectedVersion: number; readonly code: string },
): Promise<GatewayResult<VerifiedContact>> {
  return requestApi<VerifiedContactSuccessEnvelope>(
    apiRoutes.verifyContact.replace("{attemptId}", encodeURIComponent(attemptId)),
    {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey("contact-verify") },
      body: JSON.stringify({ expected_version: input.expectedVersion, code: input.code }),
    },
  ).then((envelope) =>
    toResult(envelope, (data) => {
      const verified = data as {
        verification_token: string;
        verification_token_expires_at: string;
      };
      return {
        verificationToken: verified.verification_token,
        expiresAt: verified.verification_token_expires_at,
      };
    }),
  );
}

/** Returning sign-in: the session becomes cookies, not a value this code holds. */
export function signInWithVerifiedContact(
  verificationToken: string,
): Promise<GatewayResult<MutationSuccessEnvelope["data"]>> {
  return requestApi<MutationSuccessEnvelope>(browserSessionRoutes.contactSessionExchange, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("contact-session") },
    body: JSON.stringify({ expected_version: 0, verification_token: verificationToken }),
  }).then((envelope) => toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]));
}

export type ActivatedSolver = BrowserSolverActivationSuccessEnvelope["data"];

/**
 * First activation. Creates one human identity and exactly one permanent
 * individual workspace; `start_intent` is only intent, and a team continues
 * through the separate C2 command afterwards.
 */
export function activateSolver(input: {
  readonly verificationToken: string;
  readonly displayName: string;
  readonly startIntent: SolverStartIntent;
}): Promise<GatewayResult<ActivatedSolver>> {
  return requestApi<BrowserSolverActivationSuccessEnvelope>(browserSessionRoutes.solverActivation, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey("solver-activation") },
    body: JSON.stringify({
      expected_version: 0,
      verification_token: input.verificationToken,
      display_name: input.displayName,
      start_intent: input.startIntent,
    }),
  }).then((envelope) => toResult(envelope, (data) => data as ActivatedSolver));
}
