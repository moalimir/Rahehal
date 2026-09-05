import {
  apiRoutes,
  type ContactVerificationAttemptSuccessEnvelope,
  type ErrorEnvelope,
  type MeSuccessEnvelope,
  type SessionSuccessEnvelope,
  type SolverActivationSuccessEnvelope,
  type TeamSuccessEnvelope,
  type VerifiedContactSuccessEnvelope,
} from "@rahhal/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "../src/app.js";
import { createDemoApiComposition, type DemoApiComposition } from "../src/demo-composition.js";
import { developmentContactVerificationSettings } from "../src/development-contact-verification.js";

class MutableClock {
  private milliseconds = Date.parse("2026-01-01T00:00:00.000Z");

  now() {
    return new Date(this.milliseconds);
  }

  advance(milliseconds: number) {
    this.milliseconds += milliseconds;
  }
}

function key(value: string) {
  return { "idempotency-key": value };
}

describe("C7 self-service solver activation", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;
  let clock: MutableClock;

  beforeEach(() => {
    clock = new MutableClock();
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  async function verifiedContact(destination: string, suffix: string) {
    const started = await app.inject({
      method: "POST",
      url: apiRoutes.contactVerificationStart,
      headers: key(`contact-start-${suffix}`),
      payload: { expected_version: 0, channel: "email", destination },
    });
    expect(started.statusCode).toBe(200);
    const attempt = started.json<ContactVerificationAttemptSuccessEnvelope>().data;
    const verified = await app.inject({
      method: "POST",
      url: apiRoutes.verifyContact.replace("{attemptId}", attempt.attempt_id),
      headers: key(`contact-verify-${suffix}`),
      payload: { expected_version: attempt.version, code: "12345" },
    });
    expect(verified.statusCode).toBe(200);
    return verified.json<VerifiedContactSuccessEnvelope>().data;
  }

  it("accepts a Persian-digit verification code", async () => {
    // The provider normalizes Persian and Arabic-Indic digits, so the contract
    // must let them reach it: a Persian-first product cannot reject the digits
    // its own keyboards produce.
    const started = await app.inject({
      method: "POST",
      url: apiRoutes.contactVerificationStart,
      headers: key("contact-start-persian-01"),
      payload: {
        expected_version: 0,
        channel: "email",
        destination: "persian.digits@example.test",
      },
    });
    expect(started.statusCode).toBe(200);
    const attempt = started.json<ContactVerificationAttemptSuccessEnvelope>().data;
    const verified = await app.inject({
      method: "POST",
      url: apiRoutes.verifyContact.replace("{attemptId}", attempt.attempt_id),
      headers: key("contact-verify-persian-01"),
      payload: { expected_version: attempt.version, code: "۱۲۳۴۵" },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json<VerifiedContactSuccessEnvelope>().data.attempt.state).toBe("verified");
  });

  it("activates one email identity and permanent individual workspace with exact retry", async () => {
    const verified = await verifiedContact("NEW.SOLVER@example.test", "individual-01");
    const request = {
      method: "POST" as const,
      url: apiRoutes.solverActivation,
      headers: key("solver-activate-individual-01"),
      payload: {
        expected_version: 0,
        verification_token: verified.verification_token,
        display_name: "حل‌گر تازه",
        start_intent: "individual",
      },
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    const activated = first.json<SolverActivationSuccessEnvelope>();
    const replay = second.json<SolverActivationSuccessEnvelope>();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(activated.data.receipt.next_actions).toEqual(["continue_individually"]);
    expect(activated.data.receipt.idempotent).toBe(false);
    expect(replay.data).toEqual({
      ...activated.data,
      receipt: { ...activated.data.receipt, idempotent: true },
    });
    expect(composition.solverActivation.snapshot()).toMatchObject({
      activations: [activated.data.activation],
      consumedAssertionCount: 1,
    });

    const me = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${activated.data.tokens.access_token}` },
    });
    const resource = me.json<MeSuccessEnvelope>().data;
    expect(me.statusCode).toBe(200);
    expect(resource.user).toMatchObject({
      id: activated.data.activation.user_id,
      primary_email: "new.solver@example.test",
      email_verified: true,
      primary_phone: null,
      phone_verified: false,
    });
    expect(resource.workspaces).toEqual([
      expect.objectContaining({
        id: activated.data.activation.individual_workspace_id,
        kind: "individual",
      }),
    ]);
    expect(resource.active_context?.workspace_id).toBe(
      activated.data.activation.individual_workspace_id,
    );

    const profile = await app.inject({
      method: "GET",
      url: apiRoutes.solverProfile,
      headers: {
        authorization: `Bearer ${activated.data.tokens.access_token}`,
        "x-workspace-id": activated.data.activation.individual_workspace_id,
      },
    });
    const verification = await app.inject({
      method: "GET",
      url: apiRoutes.solverVerification,
      headers: {
        authorization: `Bearer ${activated.data.tokens.access_token}`,
        "x-workspace-id": activated.data.activation.individual_workspace_id,
      },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().data).toMatchObject({ applicant_type: "individual", version: 1 });
    expect(verification.json().data).toMatchObject({ state: "not_started", version: 1 });
  });

  it("signs an activated human in again and consumes each verified assertion once", async () => {
    const firstProof = await verifiedContact("returning@example.test", "returning-01");
    const activated = await app.inject({
      method: "POST",
      url: apiRoutes.solverActivation,
      headers: key("solver-activate-returning-01"),
      payload: {
        expected_version: 0,
        verification_token: firstProof.verification_token,
        display_name: "حل‌گر بازگشتی",
        start_intent: "individual",
      },
    });
    expect(activated.statusCode).toBe(200);

    const secondProof = await verifiedContact("returning@example.test", "returning-02");
    const request = {
      method: "POST" as const,
      url: apiRoutes.contactSessionExchange,
      headers: key("contact-session-returning-01"),
      payload: { expected_version: 0, verification_token: secondProof.verification_token },
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    const reused = await app.inject({
      ...request,
      headers: key("contact-session-returning-02"),
    });

    expect(first.statusCode).toBe(200);
    expect(first.json<SessionSuccessEnvelope>().data.receipt.next_actions).toEqual([
      "select_workspace",
    ]);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<SessionSuccessEnvelope>().data.receipt.idempotent).toBe(true);
    expect(reused.statusCode).toBe(403);
    expect(reused.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
  });

  it("commits personal activation before a retryable optional C2 team bootstrap", async () => {
    const proof = await verifiedContact("team.intent@example.test", "team-intent-01");
    const activationResponse = await app.inject({
      method: "POST",
      url: apiRoutes.solverActivation,
      headers: key("solver-activate-team-intent-01"),
      payload: {
        expected_version: 0,
        verification_token: proof.verification_token,
        display_name: "مالک تیم آینده",
        start_intent: "team",
      },
    });
    const activated = activationResponse.json<SolverActivationSuccessEnvelope>().data;
    expect(activated.receipt.next_actions).toEqual(["create_team"]);

    const headers = {
      authorization: `Bearer ${activated.tokens.access_token}`,
      "x-workspace-id": activated.activation.individual_workspace_id,
    };
    const failed = await app.inject({
      method: "POST",
      url: apiRoutes.solverTeams,
      headers: { ...headers, ...key("team-bootstrap-invalid-01") },
      payload: { expected_version: 0, name: "", team_kind: "expert-team" },
    });
    expect(failed.statusCode).toBe(422);

    const meAfterFailure = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: headers.authorization },
    });
    expect(meAfterFailure.json<MeSuccessEnvelope>().data.workspaces).toHaveLength(1);

    const created = await app.inject({
      method: "POST",
      url: apiRoutes.solverTeams,
      headers: { ...headers, ...key("team-bootstrap-valid-01") },
      payload: { expected_version: 0, name: "تیم قابل ادامه", team_kind: "expert-team" },
    });
    expect(created.statusCode).toBe(200);
    const teamId = created.json().data.entity_id as string;

    const switched = await app.inject({
      method: "POST",
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: headers.authorization,
        ...key("team-bootstrap-switch-01"),
      },
      payload: { expected_version: 1, workspace_id: teamId },
    });
    expect(switched.statusCode).toBe(200);
    const team = await app.inject({
      method: "GET",
      url: apiRoutes.solverTeam,
      headers: { authorization: headers.authorization, "x-workspace-id": teamId },
    });
    expect(team.json<TeamSuccessEnvelope>().data).toMatchObject({
      workspace_id: teamId,
      owner_user_id: activated.activation.user_id,
      team_kind: "expert-team",
    });
  });

  it("types resend, expiry, lock, rate-limit, and pre-activation exchange states", async () => {
    const start = await app.inject({
      method: "POST",
      url: apiRoutes.contactVerificationStart,
      headers: key("contact-state-start-01"),
      payload: { expected_version: 0, channel: "mobile", destination: "+98 912 123 4567" },
    });
    const attempt = start.json<ContactVerificationAttemptSuccessEnvelope>().data;
    const tooSoon = await app.inject({
      method: "POST",
      url: apiRoutes.resendContactVerification.replace("{attemptId}", attempt.attempt_id),
      headers: key("contact-state-resend-01"),
      payload: { expected_version: 1 },
    });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json<ErrorEnvelope>().error.code).toBe("RATE_LIMITED");
    expect(tooSoon.headers["retry-after"]).toBe("30");

    clock.advance(30_000);
    const resent = await app.inject({
      method: "POST",
      url: apiRoutes.resendContactVerification.replace("{attemptId}", attempt.attempt_id),
      headers: key("contact-state-resend-02"),
      payload: { expected_version: 1 },
    });
    expect(resent.statusCode).toBe(200);
    expect(resent.json<ContactVerificationAttemptSuccessEnvelope>().data.version).toBe(2);

    clock.advance(30_000);
    const resentAgain = await app.inject({
      method: "POST",
      url: apiRoutes.resendContactVerification.replace("{attemptId}", attempt.attempt_id),
      headers: key("contact-state-resend-03"),
      payload: { expected_version: 2 },
    });
    expect(resentAgain.statusCode).toBe(200);
    expect(resentAgain.json<ContactVerificationAttemptSuccessEnvelope>().data.version).toBe(3);

    clock.advance(30_000);
    const resendCeiling = await app.inject({
      method: "POST",
      url: apiRoutes.resendContactVerification.replace("{attemptId}", attempt.attempt_id),
      headers: key("contact-state-resend-04"),
      payload: { expected_version: 3 },
    });
    expect(resendCeiling.statusCode).toBe(429);

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: apiRoutes.verifyContact.replace("{attemptId}", attempt.attempt_id),
        headers: key(`contact-state-wrong-${index}`),
        payload: { expected_version: 3, code: "00000" },
      });
      expect(response.statusCode).toBe(index === 4 ? 409 : 403);
      if (index === 4) {
        expect(response.json<ErrorEnvelope>().error).toMatchObject({
          code: "VERIFICATION_LOCKED",
          current_state: "locked",
        });
      }
    }

    const expiring = await app.inject({
      method: "POST",
      url: apiRoutes.contactVerificationStart,
      headers: key("contact-expiring-start-01"),
      payload: { expected_version: 0, channel: "email", destination: "expires@example.test" },
    });
    const expiringAttempt = expiring.json<ContactVerificationAttemptSuccessEnvelope>().data;
    clock.advance(5 * 60_000 + 1);
    const expired = await app.inject({
      method: "POST",
      url: apiRoutes.verifyContact.replace("{attemptId}", expiringAttempt.attempt_id),
      headers: key("contact-expiring-verify-01"),
      payload: { expected_version: 1, code: "12345" },
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json<ErrorEnvelope>().error.code).toBe("VERIFICATION_EXPIRED");

    const unactivated = await verifiedContact("activation.required@example.test", "required-01");
    const exchange = await app.inject({
      method: "POST",
      url: apiRoutes.contactSessionExchange,
      headers: key("contact-session-required-01"),
      payload: { expected_version: 0, verification_token: unactivated.verification_token },
    });
    expect(exchange.statusCode).toBe(409);
    expect(exchange.json<ErrorEnvelope>().error.code).toBe("ACTIVATION_REQUIRED");
  });

  it("rate-limits repeated starts without revealing whether the contact already exists", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: apiRoutes.contactVerificationStart,
        headers: key(`rate-limited-start-${index}`),
        payload: { expected_version: 0, channel: "email", destination: "same@example.test" },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("C7 provider startup boundary", () => {
  it("refuses the development provider in production", () => {
    expect(() =>
      developmentContactVerificationSettings({
        NODE_ENV: "production",
        SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
        SOLVER_OTP_DEVELOPMENT_CODE: "12345",
        SOLVER_OTP_FLOW_SECRET: "production-must-never-use-this-secret-0001",
      }),
    ).toThrow("refuses production");
  });
});
