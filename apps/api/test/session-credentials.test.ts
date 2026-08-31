import { describe, expect, it } from "vitest";

import { parseSessionId } from "@rahhal/domain";

import { HmacSessionCredentialIssuer } from "../src/session-credentials.js";

describe("A2 session credential issuer", () => {
  it("reconstructs exact idempotent credentials while separating kind and version", () => {
    const issuer = new HmacSessionCredentialIssuer(
      "session-credential-test-secret-with-more-than-thirty-two-bytes",
    );
    const sessionId = parseSessionId("ses_credential_test_0001");
    const first = issuer.issue(sessionId, 1);

    expect(issuer.issue(sessionId, 1)).toEqual(first);
    expect(issuer.issue(sessionId, 2)).not.toEqual(first);
    expect(first.accessToken).not.toBe(first.refreshToken);
    expect(first.accessToken).toMatch(/^rahhal-at-[A-Za-z0-9_-]{43}$/);
    expect(first.refreshToken).toMatch(/^rahhal-rt-[A-Za-z0-9_-]{43}$/);
  });

  it("refuses a weak credential secret", () => {
    expect(() => new HmacSessionCredentialIssuer("too-short")).toThrow("at least 32 bytes");
  });
});
