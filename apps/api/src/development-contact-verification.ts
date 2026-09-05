import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  ContactVerificationAttemptResource,
  ResendContactVerificationBody,
  StartContactVerificationBody,
  VerifiedContactResource,
  VerifyContactBody,
} from "@rahhal/contracts";
import {
  parseContactVerificationAttemptId,
  type ContactVerificationAttemptId,
  type ContactVerificationChannel,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict, staleVersion } from "./errors.js";
import { commandFingerprint } from "./primitives.js";
import type {
  Clock,
  ContactVerificationProviderPort,
  IdFactory,
  SessionCommand,
  VerifiedContactAssertion,
} from "./ports.js";

const attemptLifetimeMs = 5 * 60_000;
const assertionLifetimeMs = 10 * 60_000;
const resendDelayMs = 30_000;
const startWindowMs = 10 * 60_000;
const maxStartsPerWindow = 3;
const maxSendsPerAttempt = 3;
const maxFailedVerifications = 5;
const issuer = "urn:rahhal:identity:development-otp";

type Attempt = {
  readonly id: ContactVerificationAttemptId;
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
  state: "pending" | "verified" | "expired" | "locked";
  version: number;
  expiresAt: string;
  resendAvailableAt: string;
  sends: number;
  failedVerifications: number;
  verificationToken: string | null;
  verificationTokenExpiresAt: string | null;
};

type Cached<Result> = {
  readonly fingerprint: string;
  readonly result: Result;
};

type AssertionPayload = {
  readonly assertion_id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
  readonly expires_at: string;
};

export type DevelopmentContactVerificationSettings = {
  readonly code: string;
  readonly flowSecret: string;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for development OTP composition`);
  return value;
}

export function developmentContactVerificationSettings(
  environment: NodeJS.ProcessEnv,
): DevelopmentContactVerificationSettings {
  if (environment.NODE_ENV === "production") {
    throw new Error("The development OTP provider refuses production startup");
  }
  if (environment.SOLVER_CONTACT_VERIFICATION_PROVIDER !== "development") {
    throw new Error(
      "SOLVER_CONTACT_VERIFICATION_PROVIDER must be development until an approved provider adapter is connected",
    );
  }
  const code = required(environment, "SOLVER_OTP_DEVELOPMENT_CODE");
  if (!/^\d{5}$/.test(code)) {
    throw new Error("SOLVER_OTP_DEVELOPMENT_CODE must contain exactly five ASCII digits");
  }
  const flowSecret = required(environment, "SOLVER_OTP_FLOW_SECRET");
  if (Buffer.byteLength(flowSecret, "utf8") < 32) {
    throw new Error("SOLVER_OTP_FLOW_SECRET must contain at least 32 bytes");
  }
  return { code, flowSecret };
}

function normalizeDigits(value: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

function normalizeDestination(channel: ContactVerificationChannel, value: string): string {
  if (channel === "email") {
    const normalized = value.trim().toLocaleLowerCase("en-US");
    if (
      normalized.length < 3 ||
      normalized.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw new ApiProblem(422, "VALIDATION", "The contact destination is invalid", {
        fields: [{ path: "/destination", code: "format", message: "A valid email is required" }],
      });
    }
    return normalized;
  }
  const normalized = normalizeDigits(value)
    .replace(/[\s\-()]/g, "")
    .replace(/^\+98/, "0")
    .replace(/^0098/, "0");
  if (!/^09\d{9}$/.test(normalized)) {
    throw new ApiProblem(422, "VALIDATION", "The contact destination is invalid", {
      fields: [
        { path: "/destination", code: "format", message: "A valid Iranian mobile is required" },
      ],
    });
  }
  return normalized;
}

function mask(channel: ContactVerificationChannel, destination: string): string {
  if (channel === "mobile") return `${destination.slice(0, 4)}••••${destination.slice(-3)}`;
  const [local = "", domain = ""] = destination.split("@", 2);
  return `${local.slice(0, 1)}•••@${domain}`;
}

function attemptResource(attempt: Attempt): ContactVerificationAttemptResource {
  return {
    attempt_id: attempt.id,
    channel: attempt.channel,
    masked_destination: mask(attempt.channel, attempt.destination),
    state: attempt.state === "verified" ? "verified" : "pending",
    version: attempt.version,
    expires_at: attempt.expiresAt,
    resend_available_at: attempt.resendAvailableAt,
    attempts_remaining: Math.max(0, maxFailedVerifications - attempt.failedVerifications),
  };
}

function invalidState(state: "expired" | "locked"): ApiProblem {
  return new ApiProblem(
    409,
    state === "expired" ? "VERIFICATION_EXPIRED" : "VERIFICATION_LOCKED",
    "The contact verification attempt is unavailable",
    { currentState: state, recovery: "start_contact_verification_again" },
  );
}

export class DevelopmentContactVerificationAdapter implements ContactVerificationProviderPort {
  private readonly attempts = new Map<ContactVerificationAttemptId, Attempt>();
  private readonly startHistory = new Map<string, number[]>();
  private readonly startIdempotency = new Map<string, Cached<ContactVerificationAttemptResource>>();
  private readonly commandIdempotency = new Map<string, Cached<unknown>>();

  constructor(
    private readonly settings: DevelopmentContactVerificationSettings,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private signature(encodedPayload: string): string {
    return createHmac("sha256", this.settings.flowSecret)
      .update(`rahhal-development-otp-assertion-v1\0${encodedPayload}`)
      .digest("base64url");
  }

  private assertionToken(attempt: Attempt, expiresAt: string): string {
    const payload: AssertionPayload = {
      assertion_id: attempt.id,
      issuer,
      subject: `contact:${attempt.channel}:${commandFingerprint(attempt.destination)}`,
      channel: attempt.channel,
      destination: attempt.destination,
      expires_at: expiresAt,
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  private currentAttempt(attemptId: string): Attempt {
    let id: ContactVerificationAttemptId;
    try {
      id = parseContactVerificationAttemptId(attemptId);
    } catch {
      throw forbidden();
    }
    const attempt = this.attempts.get(id);
    if (!attempt) throw forbidden();
    if (
      attempt.state === "pending" &&
      Date.parse(attempt.expiresAt) <= this.clock.now().getTime()
    ) {
      attempt.state = "expired";
      attempt.version += 1;
    }
    if (attempt.state === "expired" || attempt.state === "locked")
      throw invalidState(attempt.state);
    return attempt;
  }

  private replay<Result>(key: string, fingerprint: string): Result | null {
    const cached = this.commandIdempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return structuredClone(cached.result) as Result;
  }

  async start(
    body: StartContactVerificationBody,
    command: SessionCommand,
  ): Promise<ContactVerificationAttemptResource> {
    const destination = normalizeDestination(body.channel, body.destination);
    const fingerprint = commandFingerprint({
      action: "contact.start",
      body: { ...body, destination },
    });
    const cached = this.startIdempotency.get(command.idempotencyKey);
    if (cached) {
      if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
      return structuredClone(cached.result);
    }
    const now = this.clock.now();
    const scope = `${body.channel}:${destination}`;
    const recent = (this.startHistory.get(scope) ?? []).filter(
      (value) => value > now.getTime() - startWindowMs,
    );
    if (recent.length >= maxStartsPerWindow) {
      throw new ApiProblem(429, "RATE_LIMITED", "Contact verification is temporarily unavailable", {
        currentState: "rate_limited",
        recovery: "retry_later",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((recent[0]! + startWindowMs - now.getTime()) / 1_000),
        ),
      });
    }
    recent.push(now.getTime());
    this.startHistory.set(scope, recent);
    const id = parseContactVerificationAttemptId(this.ids.next("otp"));
    const attempt: Attempt = {
      id,
      channel: body.channel,
      destination,
      state: "pending",
      version: 1,
      expiresAt: new Date(now.getTime() + attemptLifetimeMs).toISOString(),
      resendAvailableAt: new Date(now.getTime() + resendDelayMs).toISOString(),
      sends: 1,
      failedVerifications: 0,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    };
    this.attempts.set(id, attempt);
    const resource = attemptResource(attempt);
    this.startIdempotency.set(command.idempotencyKey, { fingerprint, result: resource });
    return structuredClone(resource);
  }

  async resend(
    attemptId: string,
    body: ResendContactVerificationBody,
    command: SessionCommand,
  ): Promise<ContactVerificationAttemptResource> {
    const fingerprint = commandFingerprint({ action: "contact.resend", attemptId, body });
    const key = `resend:${attemptId}:${command.idempotencyKey}`;
    const replay = this.replay<ContactVerificationAttemptResource>(key, fingerprint);
    if (replay) return replay;
    const attempt = this.currentAttempt(attemptId);
    if (attempt.state !== "pending") {
      throw new ApiProblem(
        409,
        "INVALID_STATE",
        "The contact verification attempt is unavailable",
        {
          currentState: attempt.state,
          recovery: "continue_with_verified_contact",
        },
      );
    }
    if (body.expected_version !== attempt.version) throw staleVersion(attempt.version);
    const now = this.clock.now();
    if (
      attempt.sends >= maxSendsPerAttempt ||
      Date.parse(attempt.resendAvailableAt) > now.getTime()
    ) {
      throw new ApiProblem(429, "RATE_LIMITED", "Contact verification is temporarily unavailable", {
        currentState: "rate_limited",
        recovery: "retry_later",
        retryAfterSeconds:
          attempt.sends >= maxSendsPerAttempt
            ? Math.max(1, Math.ceil((Date.parse(attempt.expiresAt) - now.getTime()) / 1_000))
            : Math.max(
                1,
                Math.ceil((Date.parse(attempt.resendAvailableAt) - now.getTime()) / 1_000),
              ),
      });
    }
    attempt.sends += 1;
    attempt.version += 1;
    attempt.expiresAt = new Date(now.getTime() + attemptLifetimeMs).toISOString();
    attempt.resendAvailableAt = new Date(now.getTime() + resendDelayMs).toISOString();
    const resource = attemptResource(attempt);
    this.commandIdempotency.set(key, { fingerprint, result: resource });
    return structuredClone(resource);
  }

  async verify(
    attemptId: string,
    body: VerifyContactBody,
    command: SessionCommand,
  ): Promise<VerifiedContactResource> {
    const normalizedCode = normalizeDigits(body.code).replace(/\s/g, "");
    const fingerprint = commandFingerprint({
      action: "contact.verify",
      attemptId,
      expectedVersion: body.expected_version,
      code: commandFingerprint(normalizedCode),
    });
    const key = `verify:${attemptId}:${command.idempotencyKey}`;
    const replay = this.replay<VerifiedContactResource>(key, fingerprint);
    if (replay) return replay;
    const attempt = this.currentAttempt(attemptId);
    if (attempt.state !== "pending") {
      throw new ApiProblem(
        409,
        "INVALID_STATE",
        "The contact verification attempt is unavailable",
        {
          currentState: attempt.state,
          recovery: "start_contact_verification_again",
        },
      );
    }
    if (body.expected_version !== attempt.version) throw staleVersion(attempt.version);
    if (normalizedCode !== this.settings.code) {
      attempt.failedVerifications += 1;
      if (attempt.failedVerifications >= maxFailedVerifications) {
        attempt.state = "locked";
        attempt.version += 1;
        throw invalidState("locked");
      }
      throw forbidden();
    }
    const now = this.clock.now();
    attempt.state = "verified";
    attempt.version += 1;
    attempt.verificationTokenExpiresAt = new Date(
      now.getTime() + assertionLifetimeMs,
    ).toISOString();
    attempt.verificationToken = this.assertionToken(attempt, attempt.verificationTokenExpiresAt);
    const result: VerifiedContactResource = {
      attempt: { ...attemptResource(attempt), state: "verified" },
      verification_token: attempt.verificationToken,
      verification_token_expires_at: attempt.verificationTokenExpiresAt,
    };
    this.commandIdempotency.set(key, { fingerprint, result });
    return structuredClone(result);
  }

  async assertion(verificationToken: string): Promise<VerifiedContactAssertion | null> {
    const [encoded, suppliedSignature, extra] = verificationToken.split(".");
    if (!encoded || !suppliedSignature || extra) return null;
    const expected = Buffer.from(this.signature(encoded));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    let payload: AssertionPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AssertionPayload;
    } catch {
      return null;
    }
    if (
      payload.issuer !== issuer ||
      (payload.channel !== "email" && payload.channel !== "mobile") ||
      Date.parse(payload.expires_at) <= this.clock.now().getTime()
    ) {
      return null;
    }
    let assertionId: ContactVerificationAttemptId;
    try {
      assertionId = parseContactVerificationAttemptId(payload.assertion_id);
    } catch {
      return null;
    }
    const attempt = this.attempts.get(assertionId);
    if (
      !attempt ||
      attempt.state !== "verified" ||
      attempt.verificationToken !== verificationToken ||
      attempt.destination !== payload.destination ||
      attempt.channel !== payload.channel
    ) {
      return null;
    }
    return {
      assertionId,
      issuer,
      subject: payload.subject,
      channel: payload.channel,
      destination: payload.destination,
      expiresAt: payload.expires_at,
    };
  }
}
