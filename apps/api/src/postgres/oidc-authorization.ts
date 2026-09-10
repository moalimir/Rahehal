import { createHmac, timingSafeEqual } from "node:crypto";

import {
  AuthorizationResponseError,
  ClientError,
  None,
  ResponseBodyError,
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  enableNonRepudiationChecks,
  type Configuration,
} from "openid-client";

import type {
  OidcAuthorizationStartBody,
  OidcAuthorizationStartResult,
  SessionExchangeBody,
} from "@rahhal/contracts";

import { ApiProblem, forbidden, idempotencyConflict } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  Clock,
  IdFactory,
  OidcAuthorizationPort,
  OidcExchangePort,
  OidcIdentity,
  SessionCommand,
} from "../ports.js";
import type { PostgresUnitOfWork } from "./unit-of-work.js";

const authorizationAttemptLifetimeMs = 10 * 60_000;

type AuthorizationAttemptRow = {
  readonly id: string;
  readonly issuer: string;
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly state_digest: string;
  readonly code_verifier_digest: string;
  readonly nonce_digest: string;
  readonly request_hash: string;
  readonly status: "pending" | "validated" | "consumed";
  readonly subject: string | null;
  readonly verified_email: string | null;
  readonly expires_at: Date;
};

export type OidcRuntimeSettings = {
  readonly issuer: URL;
  readonly clientId: string;
  readonly allowedRedirectUris: ReadonlySet<string>;
  readonly flowSecret: string;
  readonly allowInsecureHttp: boolean;
};

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for PostgreSQL OIDC composition`);
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function exactRedirect(value: string, allowInsecureHttp: boolean): string {
  const url = new URL(value);
  if (url.username || url.password || url.hash)
    throw new Error("OIDC redirect URIs cannot contain credentials or fragments");
  if (url.protocol !== "https:") {
    if (!allowInsecureHttp || url.protocol !== "http:" || !isLoopbackHost(url.hostname)) {
      throw new Error(
        "Insecure OIDC redirect URIs are limited to explicit loopback development URLs",
      );
    }
  }
  return url.toString();
}

export function oidcRuntimeSettings(environment: NodeJS.ProcessEnv): OidcRuntimeSettings {
  const issuer = new URL(required(environment, "OIDC_ISSUER_URL"));
  if (issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new Error("OIDC_ISSUER_URL cannot contain credentials, a query, or a fragment");
  }

  const allowInsecureHttp = environment.OIDC_ALLOW_INSECURE_HTTP === "true";
  if (issuer.protocol !== "https:") {
    if (
      environment.NODE_ENV === "production" ||
      !allowInsecureHttp ||
      issuer.protocol !== "http:" ||
      !isLoopbackHost(issuer.hostname)
    ) {
      throw new Error("HTTP OIDC issuers are allowed only for explicit loopback development");
    }
  }

  const flowSecret = required(environment, "OIDC_FLOW_SECRET");
  if (Buffer.byteLength(flowSecret, "utf8") < 32) {
    throw new Error("OIDC_FLOW_SECRET must contain at least 32 bytes");
  }

  const allowedRedirectUris = new Set(
    required(environment, "OIDC_ALLOWED_REDIRECT_URIS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => exactRedirect(value, allowInsecureHttp)),
  );
  if (allowedRedirectUris.size === 0) throw new Error("At least one OIDC redirect URI is required");

  return {
    issuer,
    clientId: required(environment, "OIDC_CLIENT_ID"),
    allowedRedirectUris,
    flowSecret,
    allowInsecureHttp,
  };
}

function equalDigest(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class PostgresOidcAuthorizationAdapter implements OidcAuthorizationPort, OidcExchangePort {
  private configurationPromise: Promise<Configuration> | undefined;

  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly settings: OidcRuntimeSettings,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private secretValue(label: "state" | "verifier" | "nonce", input: string): string {
    return createHmac("sha256", this.settings.flowSecret)
      .update(`rahhal-oidc-${label}-v1\0${input}`)
      .digest("base64url");
  }

  private nonce(state: string): string {
    return this.secretValue("nonce", state);
  }

  private configuration(): Promise<Configuration> {
    if (this.configurationPromise) return this.configurationPromise;
    const pending = discovery(
      this.settings.issuer,
      this.settings.clientId,
      { token_endpoint_auth_method: "none" },
      None(),
      {
        timeout: 10,
        execute: [
          ...(this.settings.allowInsecureHttp ? [allowInsecureRequests] : []),
          enableNonRepudiationChecks,
        ],
      },
    ).then((configuration) => {
      const metadata = configuration.serverMetadata();
      if (
        !metadata.authorization_endpoint ||
        !metadata.token_endpoint ||
        !metadata.jwks_uri ||
        !metadata.supportsPKCE("S256")
      ) {
        throw new Error(
          "The configured OIDC provider lacks authorization-code, JWKS, or S256 PKCE support",
        );
      }
      return configuration;
    });
    this.configurationPromise = pending.catch((error: unknown) => {
      this.configurationPromise = undefined;
      throw error;
    });
    return this.configurationPromise;
  }

  async start(
    body: OidcAuthorizationStartBody,
    command: SessionCommand,
    options: { readonly forceReauthentication?: boolean } = {},
  ): Promise<OidcAuthorizationStartResult> {
    let redirectUri: string;
    try {
      redirectUri = exactRedirect(body.redirect_uri, this.settings.allowInsecureHttp);
    } catch {
      throw forbidden();
    }
    if (!this.settings.allowedRedirectUris.has(redirectUri)) throw forbidden();

    const configuration = await this.configuration();
    const requestHash = commandFingerprint({
      action: "oidc.authorization.start",
      expectedVersion: body.expected_version,
      redirectUri,
      forceReauthentication: options.forceReauthentication === true,
    });
    const derivationInput = `${command.idempotencyKey}\0${requestHash}`;
    const state = this.secretValue("state", derivationInput);
    const codeVerifier = this.secretValue("verifier", derivationInput);
    const nonce = this.nonce(state);
    const now = this.clock.now();
    const proposedExpiry = new Date(now.getTime() + authorizationAttemptLifetimeMs);
    const idempotencyKeyDigest = commandFingerprint(command.idempotencyKey);

    const attempt = await this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await client.query(
        `
          INSERT INTO oidc_authorization_attempt (
            id, issuer, client_id, redirect_uri, state_digest, code_verifier_digest,
            nonce_digest, idempotency_key_digest, request_hash, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (idempotency_key_digest) DO NOTHING
        `,
        [
          this.ids.next("oat"),
          this.settings.issuer.toString(),
          this.settings.clientId,
          redirectUri,
          commandFingerprint(state),
          commandFingerprint(codeVerifier),
          commandFingerprint(nonce),
          idempotencyKeyDigest,
          requestHash,
          now.toISOString(),
          proposedExpiry.toISOString(),
        ],
      );
      const result = await client.query<AuthorizationAttemptRow>(
        `
          SELECT id, issuer, client_id, redirect_uri, state_digest, code_verifier_digest,
                 nonce_digest, request_hash, status, subject, verified_email, expires_at
          FROM oidc_authorization_attempt
          WHERE idempotency_key_digest = $1
          FOR SHARE
        `,
        [idempotencyKeyDigest],
      );
      const row = result.rows[0];
      if (!row) throw new Error("OIDC authorization attempt was not persisted");
      if (row.request_hash !== requestHash) throw idempotencyConflict();
      if (
        row.issuer !== this.settings.issuer.toString() ||
        row.client_id !== this.settings.clientId ||
        row.redirect_uri !== redirectUri ||
        !equalDigest(row.state_digest, commandFingerprint(state)) ||
        !equalDigest(row.code_verifier_digest, commandFingerprint(codeVerifier)) ||
        !equalDigest(row.nonce_digest, commandFingerprint(nonce))
      ) {
        throw new Error("OIDC authorization attempt configuration does not match runtime settings");
      }
      if (row.expires_at.getTime() <= now.getTime()) {
        throw new ApiProblem(409, "CONFLICT", "The authorization attempt has expired", {
          recovery: "start_a_new_authorization",
        });
      }
      return row;
    });

    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const authorizationUrl = buildAuthorizationUrl(configuration, {
      redirect_uri: redirectUri,
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...(options.forceReauthentication ? { prompt: "login", max_age: "0" } : {}),
    });
    return {
      authorization_url: authorizationUrl.toString(),
      state,
      code_verifier: codeVerifier,
      expires_at: attempt.expires_at.toISOString(),
    };
  }

  async exchange(
    body: SessionExchangeBody,
    options: { readonly maxAgeSeconds?: number } = {},
  ): Promise<OidcIdentity | null> {
    let redirectUri: string;
    try {
      redirectUri = exactRedirect(body.redirect_uri, this.settings.allowInsecureHttp);
    } catch {
      return null;
    }
    const configuration = await this.configuration();
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<AuthorizationAttemptRow>(
        `
          SELECT id, issuer, client_id, redirect_uri, state_digest, code_verifier_digest,
                 nonce_digest, request_hash, status, subject, verified_email, expires_at
          FROM oidc_authorization_attempt
          WHERE state_digest = $1
            AND code_verifier_digest = $2
            AND redirect_uri = $3
          FOR UPDATE
        `,
        [commandFingerprint(body.state), commandFingerprint(body.code_verifier), redirectUri],
      );
      const attempt = result.rows[0];
      if (!attempt || attempt.expires_at.getTime() <= this.clock.now().getTime()) return null;
      if (
        attempt.issuer !== this.settings.issuer.toString() ||
        attempt.client_id !== this.settings.clientId ||
        !equalDigest(attempt.nonce_digest, commandFingerprint(this.nonce(body.state)))
      ) {
        return null;
      }
      if (attempt.status === "consumed") return null;
      if (attempt.status === "validated") {
        if (!attempt.subject || !attempt.verified_email) return null;
        return {
          authorizationAttemptId: attempt.id,
          issuer: attempt.issuer,
          subject: attempt.subject,
          verifiedEmail: attempt.verified_email,
        };
      }

      const callbackUrl = new URL(attempt.redirect_uri);
      callbackUrl.searchParams.set("code", body.authorization_code);
      callbackUrl.searchParams.set("state", body.state);
      let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>;
      try {
        tokens = await authorizationCodeGrant(configuration, callbackUrl, {
          expectedState: body.state,
          expectedNonce: this.nonce(body.state),
          pkceCodeVerifier: body.code_verifier,
          idTokenExpected: true,
          ...(options.maxAgeSeconds === undefined ? {} : { maxAge: options.maxAgeSeconds }),
        });
      } catch (error) {
        if (
          error instanceof ClientError ||
          error instanceof AuthorizationResponseError ||
          (error instanceof ResponseBodyError && error.error === "invalid_grant")
        ) {
          throw forbidden();
        }
        throw error;
      }
      const claims = tokens.claims();
      if (
        !claims ||
        typeof claims.sub !== "string" ||
        claims.sub.length === 0 ||
        typeof claims.email !== "string" ||
        claims.email_verified !== true
      ) {
        throw forbidden();
      }
      const verifiedEmail = claims.email.trim().toLowerCase();
      if (verifiedEmail.length < 3 || verifiedEmail.length > 320) throw forbidden();
      const validatedAt = this.clock.now().toISOString();
      await client.query(
        `
          UPDATE oidc_authorization_attempt
          SET status = 'validated', subject = $2, verified_email = $3, validated_at = $4
          WHERE id = $1 AND status = 'pending'
        `,
        [attempt.id, claims.sub, verifiedEmail, validatedAt],
      );
      return {
        authorizationAttemptId: attempt.id,
        issuer: attempt.issuer,
        subject: claims.sub,
        verifiedEmail,
        ...(typeof claims.auth_time === "number"
          ? { authenticatedAt: new Date(claims.auth_time * 1_000).toISOString() }
          : {}),
      };
    });
  }

  async consume(identity: OidcIdentity): Promise<void> {
    const client = this.unitOfWork.currentClient();
    const result = await client.query(
      `
        UPDATE oidc_authorization_attempt
        SET status = 'consumed', consumed_at = $5
        WHERE id = $1
          AND issuer = $2
          AND subject = $3
          AND verified_email = $4
          AND status = 'validated'
      `,
      [
        identity.authorizationAttemptId,
        identity.issuer,
        identity.subject,
        identity.verifiedEmail,
        this.clock.now().toISOString(),
      ],
    );
    if (result.rowCount !== 1) throw forbidden();
  }
}
