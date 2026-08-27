import { createHmac } from "node:crypto";

import type { SessionExchangeBody } from "@rahhal/contracts";

import { commandFingerprint } from "../../src/primitives.js";
import type {
  OidcExchangePort,
  OidcIdentity,
  SessionCredentialIssuerPort,
} from "../../src/ports.js";

export type LocalTestOidcRecord = OidcIdentity & {
  readonly authorizationCode: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly state: string;
};

export class LocalTestOidcExchangeAdapter implements OidcExchangePort {
  private readonly consumed = new Set<string>();

  constructor(
    private readonly records: readonly LocalTestOidcRecord[],
    nodeEnv: string | undefined,
  ) {
    if (nodeEnv === "production") {
      throw new Error("The local OIDC exchange adapter is test-only");
    }
  }

  async exchange(body: SessionExchangeBody): Promise<OidcIdentity | null> {
    const record = this.records.find(
      (candidate) =>
        candidate.authorizationCode === body.authorization_code &&
        candidate.codeVerifier === body.code_verifier &&
        candidate.redirectUri === body.redirect_uri &&
        candidate.state === body.state,
    );
    if (!record) return null;

    const exchangeFingerprint = commandFingerprint({
      authorizationCode: body.authorization_code,
      state: body.state,
    });
    if (this.consumed.has(exchangeFingerprint)) return null;
    this.consumed.add(exchangeFingerprint);
    return { issuer: record.issuer, subject: record.subject };
  }
}

export class LocalTestSessionCredentialIssuer implements SessionCredentialIssuerPort {
  constructor(
    private readonly secret: string,
    nodeEnv: string | undefined,
  ) {
    if (nodeEnv === "production") {
      throw new Error("The local session credential issuer is test-only");
    }
    if (secret.length < 32) throw new Error("The local session credential secret is too short");
  }

  issue(sessionId: Parameters<SessionCredentialIssuerPort["issue"]>[0], version: number) {
    const token = (kind: "access" | "refresh") =>
      `rahhal-test-${kind}-${createHmac("sha256", this.secret)
        .update(`${kind}\0${sessionId}\0${version}`)
        .digest("base64url")}`;
    return { accessToken: token("access"), refreshToken: token("refresh") };
  }
}
