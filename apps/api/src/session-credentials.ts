import { createHmac } from "node:crypto";

import type { SessionId } from "@rahhal/domain";

import type { SessionCredentialIssuerPort } from "./ports.js";
import type { StepUpCredentialIssuerPort } from "./step-up-port.js";

export class HmacSessionCredentialIssuer implements SessionCredentialIssuerPort {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("SESSION_CREDENTIAL_SECRET must contain at least 32 bytes");
    }
  }

  issue(sessionId: SessionId, version: number) {
    const issue = (kind: "access" | "refresh") =>
      `rahhal-${kind === "access" ? "at" : "rt"}-${createHmac("sha256", this.secret)
        .update(`rahhal-session-credential-v1\0${kind}\0${sessionId}\0${version}`)
        .digest("base64url")}`;

    return { accessToken: issue("access"), refreshToken: issue("refresh") };
  }
}

export class HmacStepUpCredentialIssuer implements StepUpCredentialIssuerPort {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("SESSION_CREDENTIAL_SECRET must contain at least 32 bytes");
    }
  }

  issue(attemptId: string, sessionId: SessionId, sessionVersion: number): string {
    return `rahhal-su-${createHmac("sha256", this.secret)
      .update(`rahhal-step-up-credential-v1\0${attemptId}\0${sessionId}\0${sessionVersion}`)
      .digest("base64url")}`;
  }
}
