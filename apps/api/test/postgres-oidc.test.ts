import { PostgresRubricAdapter } from "../src/postgres/rubrics.js";
import { PostgresReviewAdapter } from "../src/postgres/reviews.js";
import { PostgresDecisionAdapter } from "../src/postgres/decisions.js";
import { PostgresStepUpAdapter } from "../src/postgres/step-up.js";
import { PostgresEvaluationAdapter } from "../src/postgres/evaluations.js";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildSessionExchangeBody, buildSessionRevokeBody } from "@rahhal/testkit";
import { parseCorrelationId, parseSessionId } from "@rahhal/domain";

import { buildApi } from "../src/app.js";
import { PostgresAccessDecisionAudit } from "../src/postgres/access-decision-audit.js";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { PostgresPublicChallengeAdapter } from "../src/postgres/public-challenges.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { PostgresSolverWorkspaceAdapter } from "../src/postgres/solver-workspaces.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { PostgresIdentityWorkspaceAdapter } from "../src/postgres/identity-workspace.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { PostgresOidcAuthorizationAdapter } from "../src/postgres/oidc-authorization.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { PostgresNotificationAdapter } from "../src/postgres/notifications.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { PostgresOpportunityAdapter } from "../src/postgres/opportunities.js";
import { commandFingerprint, MonotonicIdFactory, RandomIdFactory } from "../src/primitives.js";
import {
  HmacSessionCredentialIssuer,
  HmacStepUpCredentialIssuer,
} from "../src/session-credentials.js";
import { DevelopmentContactVerificationAdapter } from "../src/development-contact-verification.js";
import { PostgresSolverActivationAdapter } from "../src/postgres/solver-activation.js";
import { FakeOidcProvider } from "./support/fake-oidc-provider.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const adminUrl = testDatabaseAdminUrl();

const testDatabaseName = `rahhal_a2_oidc_${process.pid}_${Date.now()}`;
const testDatabaseUrl = new URL(adminUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;
const redirectUri = "http://localhost:3000/auth/callback";
const browserRedirectUri = "http://localhost:3000/auth/browser/callback";
const alternateRedirectUri = "http://localhost:3000/auth/alternate-callback";
const flowSecret = "a2-oidc-flow-secret-with-at-least-thirty-two-bytes";
const credentialSecret = "a2-session-secret-with-at-least-thirty-two-bytes";

let admin: Client;
let database: Pool;
let provider: FakeOidcProvider;
let app: ReturnType<typeof buildApi>;
let oidc: PostgresOidcAuthorizationAdapter;
let currentTime = new Date();

function quotedIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

type StartResponse = { data: Record<string, string> };
type ExchangeResponse = {
  data: {
    tokens: Record<string, string>;
    receipt: { idempotent: boolean };
  };
};
type MeResponse = {
  data: {
    user: { email_verified: boolean };
    active_context: { workspace_id: string } | null;
    workspaces: readonly { id: string; kind: string }[];
  };
  meta: { entity_version: number };
};

function jsonBody<Result>(response: { body: string }): Result {
  return JSON.parse(response.body) as Result;
}

function setCookieValues(response: { headers: Record<string, unknown> }): readonly string[] {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
}

function cookiePair(values: readonly string[], name: string): string {
  const value = values.find((candidate) => candidate.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value.split(";", 1)[0];
}

function authorizationCallback(authorizationUrl: string): Promise<URL> {
  return fetch(authorizationUrl, { redirect: "manual" }).then((response) => {
    const location = response.headers.get("location");
    if (response.status !== 302 || !location) throw new Error("Fake provider did not redirect");
    return new URL(location);
  });
}

beforeAll(async () => {
  provider = new FakeOidcProvider();
  await provider.start();

  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quotedIdentifier(testDatabaseName)}`);
  database = new Pool({ connectionString: testDatabaseUrl.toString(), max: 6 });
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  await database.query(
    `
      INSERT INTO identity_link (id, user_id, issuer, subject)
      VALUES ('idl_owner_alpha_fake_oidc', 'usr_owner_alpha', $1, 'owner-alpha')
    `,
    [new URL(provider.issuer).toString()],
  );

  const clock = { now: () => new Date(currentTime) };
  const ids = new MonotonicIdFactory();
  const unitOfWork = new PostgresUnitOfWork(database);
  const audit = new PostgresAccessDecisionAudit(unitOfWork, ids);
  oidc = new PostgresOidcAuthorizationAdapter(
    unitOfWork,
    {
      issuer: new URL(provider.issuer),
      clientId: "rahhal-test-web",
      allowedRedirectUris: new Set([redirectUri, alternateRedirectUri, browserRedirectUri]),
      flowSecret,
      allowInsecureHttp: true,
    },
    clock,
    ids,
  );
  const identity = new PostgresIdentityWorkspaceAdapter(
    unitOfWork,
    oidc,
    new HmacSessionCredentialIssuer(credentialSecret),
    clock,
    ids,
    audit,
  );
  const solverWorkspaces = new PostgresSolverWorkspaceAdapter(unitOfWork, clock, ids);
  const contactVerification = new DevelopmentContactVerificationAdapter(
    { code: "12345", flowSecret: "postgres-oidc-contact-secret-0000000001" },
    clock,
    ids,
  );
  const solverActivation = new PostgresSolverActivationAdapter(
    unitOfWork,
    contactVerification,
    new HmacSessionCredentialIssuer(credentialSecret),
    clock,
    ids,
  );
  const teams = new PostgresTeamAdapter(unitOfWork, clock, ids);
  app = buildApi(
    {
      evaluations: new PostgresEvaluationAdapter(unitOfWork, ids),
      decisions: new PostgresDecisionAdapter(unitOfWork, ids),
      reviews: new PostgresReviewAdapter(unitOfWork, ids),
      rubrics: new PostgresRubricAdapter(unitOfWork, ids),
      oidcAuthorization: oidc,
      stepUp: new PostgresStepUpAdapter(
        unitOfWork,
        oidc,
        new HmacStepUpCredentialIssuer(credentialSecret),
        ids,
      ),
      contactVerification,
      sessions: identity,
      solverActivation,
      workspaces: identity,
      authority: identity,
      challenges: new PostgresChallengeAdapter(unitOfWork, clock, ids),
      publicChallenges: new PostgresPublicChallengeAdapter(unitOfWork),
      solverWorkspaces,
      eligibility: solverWorkspaces,
      teams,
      proposals: new PostgresProposalAdapter(unitOfWork, teams, clock, ids),
      opportunities: new PostgresOpportunityAdapter(unitOfWork, teams, clock, ids),
      notifications: new PostgresNotificationAdapter(unitOfWork, clock, ids),
      decisionAudit: audit,
      clock,
      ids,
    },
    {
      browserSession: {
        origin: "http://localhost:3000",
        redirectUri: browserRedirectUri,
        secureCookies: false,
      },
    },
  );
}, 60_000);

beforeEach(() => {
  currentTime = new Date();
});

afterAll(async () => {
  if (app) await app.close();
  if (database) await database.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(testDatabaseName)}`);
    await admin.end();
  }
  if (provider) await provider.close();
});

describe("A2 PostgreSQL OIDC authorization", () => {
  it("starts an idempotent server-bound PKCE flow without persisting browser secrets", async () => {
    const request = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/oidc:start",
        headers: { "idempotency-key": "a2-start-owner-alpha-0001" },
        payload: { expected_version: 0, redirect_uri: redirectUri },
      });
    const first = await request();
    const replay = await request();
    expect(first.statusCode).toBe(200);
    expect(jsonBody<StartResponse>(replay).data).toEqual(jsonBody<StartResponse>(first).data);

    const data = jsonBody<StartResponse>(first).data;
    const authorizationUrl = new URL(data.authorization_url ?? "");
    expect(authorizationUrl.origin).toBe(provider.issuer);
    expect(authorizationUrl.searchParams.get("state")).toBe(data.state);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(data.code_verifier).toHaveLength(43);

    const persisted = await database.query<{ serialized: string }>(`
      SELECT row_to_json(attempt)::text AS serialized
      FROM oidc_authorization_attempt AS attempt
      WHERE idempotency_key_digest IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const serialized = persisted.rows[0]?.serialized ?? "";
    expect(serialized).not.toContain(data.state);
    expect(serialized).not.toContain(data.code_verifier);
    expect(serialized).not.toContain(authorizationUrl.searchParams.get("nonce"));

    const conflict = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc:start",
      headers: { "idempotency-key": "a2-start-owner-alpha-0001" },
      payload: { expected_version: 0, redirect_uri: alternateRedirectUri },
    });
    expect(conflict.statusCode).toBe(409);

    const malformedRedirect = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc:start",
      headers: { "idempotency-key": "a2-start-fragment-redirect" },
      payload: { expected_version: 0, redirect_uri: `${redirectUri}#credential-fragment` },
    });
    expect(malformedRedirect.statusCode).toBe(403);
  });

  it("asks the provider for an immediate fresh authentication during decision step-up", async () => {
    const started = await oidc.start(
      { expected_version: 0, redirect_uri: browserRedirectUri },
      {
        idempotencyKey: "d8-provider-step-up-start-001",
        correlationId: parseCorrelationId("cor_d8_provider_step_up_start_001"),
      },
      { forceReauthentication: true },
    );
    const authorizationUrl = new URL(started.authorization_url);
    expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
    expect(authorizationUrl.searchParams.get("max_age")).toBe("0");
  });

  it("validates a signed provider response against issuer, audience, nonce, and PKCE", async () => {
    const start = await oidc.start(
      { expected_version: 0, redirect_uri: redirectUri },
      {
        idempotencyKey: "a2-direct-validation-start",
        correlationId: parseCorrelationId("cor_a2_direct_validation_start"),
      },
    );
    const callback = await authorizationCallback(start.authorization_url);
    const identity = await oidc.exchange(
      buildSessionExchangeBody({
        authorization_code: callback.searchParams.get("code") ?? "",
        code_verifier: start.code_verifier,
        redirect_uri: redirectUri,
        state: callback.searchParams.get("state") ?? "",
      }),
    );
    expect(identity).toMatchObject({
      issuer: new URL(provider.issuer).toString(),
      subject: "owner-alpha",
      verifiedEmail: "owner-alpha@synthetic.invalid",
    });
    if (!identity) throw new Error("Validated identity is required for rollback evidence");

    const rollbackUnitOfWork = new PostgresUnitOfWork(database, () => {
      throw new Error("forced application-session commit failure");
    });
    const rollbackOidc = new PostgresOidcAuthorizationAdapter(
      rollbackUnitOfWork,
      {
        issuer: new URL(provider.issuer),
        clientId: "rahhal-test-web",
        allowedRedirectUris: new Set([redirectUri]),
        flowSecret,
        allowInsecureHttp: true,
      },
      { now: () => new Date(currentTime) },
      new RandomIdFactory(),
    );
    await expect(rollbackUnitOfWork.run(() => rollbackOidc.consume(identity))).rejects.toThrow(
      "forced application-session commit failure",
    );
    const persisted = await database.query<{ status: string }>(
      "SELECT status FROM oidc_authorization_attempt WHERE id = $1",
      [identity.authorizationAttemptId],
    );
    expect(persisted.rows[0]?.status).toBe("validated");
  });

  it("exchanges a signed verified identity once, issues a revocable session, and replays safely", async () => {
    const tokenExchangesBefore = provider.tokenExchangeCount;
    const start = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc:start",
      headers: { "idempotency-key": "a2-start-owner-alpha-0002" },
      payload: { expected_version: 0, redirect_uri: redirectUri },
    });
    const startData = jsonBody<StartResponse>(start).data;
    const callback = await authorizationCallback(startData.authorization_url ?? "");
    const exchangePayload = buildSessionExchangeBody({
      authorization_code: callback.searchParams.get("code") ?? "",
      code_verifier: startData.code_verifier,
      redirect_uri: redirectUri,
      state: callback.searchParams.get("state") ?? "",
    });
    const exchange = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/session:exchange",
        headers: { "idempotency-key": "a2-exchange-owner-alpha-0001" },
        payload: exchangePayload,
      });
    const first = await exchange();
    const replay = await exchange();
    expect(first.statusCode).toBe(200);
    expect(jsonBody<ExchangeResponse>(replay).data.receipt.idempotent).toBe(true);
    expect(provider.tokenExchangeCount).toBe(tokenExchangesBefore + 1);

    const tokens = jsonBody<ExchangeResponse>(first).data.tokens;
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(jsonBody<MeResponse>(me).data.user.email_verified).toBe(true);

    const reused = await app.inject({
      method: "POST",
      url: "/api/v1/auth/session:exchange",
      headers: { "idempotency-key": "a2-exchange-owner-alpha-reuse" },
      payload: exchangePayload,
    });
    expect(reused.statusCode).toBe(403);
    expect(provider.tokenExchangeCount).toBe(tokenExchangesBefore + 1);

    const rows = await database.query<{ status: string; persisted: string }>(
      `
        SELECT attempt.status, row_to_json(session)::text AS persisted
        FROM oidc_authorization_attempt AS attempt
        JOIN app_session AS session ON session.id = $1
        WHERE attempt.state_digest = $2
      `,
      [tokens.session_id, commandFingerprint(exchangePayload.state)],
    );
    expect(rows.rows[0]?.status).toBe("consumed");
    expect(rows.rows[0]?.persisted).not.toContain(tokens.access_token);
    expect(rows.rows[0]?.persisted).not.toContain(tokens.refresh_token);
    expect(rows.rows[0]?.persisted).not.toContain(exchangePayload.authorization_code);

    const revoke = await app.inject({
      method: "POST",
      url: "/api/v1/auth/session:revoke",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "idempotency-key": "a2-revoke-owner-alpha-0001",
      },
      payload: buildSessionRevokeBody({
        expected_version: 1,
        session_id: parseSessionId(tokens.session_id ?? ""),
      }),
    });
    expect(revoke.statusCode).toBe(200);
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("keeps browser credentials HttpOnly, enforces same-origin writes, and refreshes an expired access cookie", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/auth/browser/oidc:start",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "idempotency-key": "a3-browser-start-owner-alpha",
      },
      payload: { expected_version: 0 },
    });
    expect(start.statusCode).toBe(200);
    expect(start.body).not.toContain("code_verifier");
    expect(start.body).not.toContain('"state"');
    const flowCookie = cookiePair(setCookieValues(start), "rahhal-oidc-flow");
    expect(setCookieValues(start).join(";")).toContain("HttpOnly");
    expect(setCookieValues(start).join(";")).toContain("SameSite=Lax");

    const startData = jsonBody<{ data: { authorization_url: string } }>(start).data;
    const callback = await authorizationCallback(startData.authorization_url);
    expect(callback.toString()).not.toContain("code_verifier");
    const exchange = await app.inject({
      method: "GET",
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: flowCookie },
    });
    expect(exchange.statusCode).toBe(303);
    // `/app` resolves whichever workspace this human reaches. Landing everyone
    // on the organization's challenge form sent a platform operator and a
    // reviewer to a page they have no authority for, one navigation after
    // signing in successfully.
    expect(exchange.headers.location).toBe("/app");
    expect(exchange.body).not.toContain("rahhal-at-");
    expect(exchange.body).not.toContain("rahhal-rt-");
    const sessionCookieValues = setCookieValues(exchange);
    const accessCookie = cookiePair(sessionCookieValues, "rahhal-access");
    const refreshCookie = cookiePair(sessionCookieValues, "rahhal-refresh");
    expect(sessionCookieValues.join(";")).toContain("HttpOnly");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: accessCookie },
    });
    expect(me.statusCode).toBe(200);
    const signedIn = jsonBody<MeResponse>(me);
    expect(signedIn.data.user.email_verified).toBe(true);
    // This human holds exactly one workspace, so the exchange enters it rather
    // than answering a chooser with a single button on it. The two-workspace
    // case, where the choice is real and the context stays null, is covered in
    // the identity suite.
    expect(signedIn.data.active_context?.workspace_id).toBe("wsp_org_alpha");
    expect(signedIn.data.workspaces.some((workspace) => workspace.id === "wsp_org_alpha")).toBe(
      true,
    );

    const deniedWrite = await app.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: {
        cookie: accessCookie,
        "x-workspace-id": "wsp_org_alpha",
        "idempotency-key": "a3-browser-create-denied",
      },
      payload: { expected_version: 0, draft: { title: "Denied cross-site write" } },
    });
    expect(deniedWrite.statusCode).toBe(403);

    // A workspace this session does not hold is still refused, and the refusal
    // does not confirm whether it exists. Entering the one workspace a human
    // holds widens nothing: scope is still checked per request.
    const foreignWorkspace = await app.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: {
        cookie: accessCookie,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-workspace-id": "wsp_org_beta",
        "idempotency-key": "a3-browser-create-foreign-workspace",
      },
      payload: { expected_version: 0, draft: { title: "Write into a foreign workspace" } },
    });
    expect(foreignWorkspace.statusCode).toBe(404);
    expect(jsonBody<{ error: { code: string } }>(foreignWorkspace).error.code).toBe("NOT_FOUND");

    const selectWorkspace = await app.inject({
      method: "POST",
      url: "/api/v1/me/context:switch",
      headers: {
        cookie: accessCookie,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "idempotency-key": "a3-browser-select-workspace-alpha",
      },
      payload: {
        expected_version: signedIn.meta.entity_version,
        workspace_id: "wsp_org_alpha",
      },
    });
    expect(selectWorkspace.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: {
        cookie: accessCookie,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-workspace-id": "wsp_org_alpha",
        "idempotency-key": "a3-browser-create-allowed",
      },
      payload: { expected_version: 0, draft: { title: "Browser authoritative draft" } },
    });
    expect(created.statusCode).toBe(201);

    currentTime = new Date(currentTime.getTime() + 16 * 60_000);
    const expired = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: accessCookie },
    });
    expect(expired.statusCode).toBe(403);

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/browser/session:refresh",
      headers: {
        cookie: `${accessCookie}; ${refreshCookie}`,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "idempotency-key": "a3-browser-refresh-owner-alpha",
      },
    });
    expect(refresh.statusCode).toBe(204);
    const refreshedCookieValues = setCookieValues(refresh);
    const refreshedAccessCookie = cookiePair(refreshedCookieValues, "rahhal-access");
    const afterRefresh = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: refreshedAccessCookie },
    });
    expect(afterRefresh.statusCode).toBe(200);
    expect(jsonBody<MeResponse>(afterRefresh).data.active_context?.workspace_id).toBe(
      "wsp_org_alpha",
    );

    const revoke = await app.inject({
      method: "POST",
      url: "/auth/browser/session:revoke",
      headers: {
        cookie: refreshedAccessCookie,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "idempotency-key": "a3-browser-revoke-owner-alpha",
      },
      payload: {},
    });
    expect(revoke.statusCode).toBe(200);
    expect(setCookieValues(revoke).join(";")).toContain("Max-Age=0");
    const deniedAfterRevoke = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: refreshedAccessCookie },
    });
    expect(deniedAfterRevoke.statusCode).toBe(403);
  });

  it("denies an expired authorization attempt before contacting the provider", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc:start",
      headers: { "idempotency-key": "a2-start-expired-attempt" },
      payload: { expected_version: 0, redirect_uri: redirectUri },
    });
    const startData = jsonBody<StartResponse>(start).data;
    const callback = await authorizationCallback(startData.authorization_url ?? "");
    const before = provider.tokenExchangeCount;
    currentTime = new Date(currentTime.getTime() + 11 * 60_000);
    const exchange = await app.inject({
      method: "POST",
      url: "/api/v1/auth/session:exchange",
      headers: { "idempotency-key": "a2-exchange-expired-attempt" },
      payload: buildSessionExchangeBody({
        authorization_code: callback.searchParams.get("code") ?? "",
        code_verifier: startData.code_verifier,
        redirect_uri: redirectUri,
        state: callback.searchParams.get("state") ?? "",
      }),
    });
    expect(exchange.statusCode).toBe(403);
    expect(provider.tokenExchangeCount).toBe(before);
  });

  it("denies protected calls when the issued access credential expires", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc:start",
      headers: { "idempotency-key": "a2-start-session-expiry" },
      payload: { expected_version: 0, redirect_uri: redirectUri },
    });
    const startData = jsonBody<StartResponse>(start).data;
    const callback = await authorizationCallback(startData.authorization_url ?? "");
    const exchange = await app.inject({
      method: "POST",
      url: "/api/v1/auth/session:exchange",
      headers: { "idempotency-key": "a2-exchange-session-expiry" },
      payload: buildSessionExchangeBody({
        authorization_code: callback.searchParams.get("code") ?? "",
        code_verifier: startData.code_verifier,
        redirect_uri: redirectUri,
        state: callback.searchParams.get("state") ?? "",
      }),
    });
    expect(exchange.statusCode).toBe(200);
    const accessToken = jsonBody<ExchangeResponse>(exchange).data.tokens.access_token;
    currentTime = new Date(currentTime.getTime() + 16 * 60_000);
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("rejects a provider contact that is not verified", async () => {
    const unverifiedProvider = new FakeOidcProvider({ emailVerified: false });
    await unverifiedProvider.start();
    try {
      await database.query(
        `
          INSERT INTO identity_link (id, user_id, issuer, subject)
          VALUES ('idl_owner_unverified_oidc', 'usr_owner_alpha', $1, 'owner-alpha')
        `,
        [new URL(unverifiedProvider.issuer).toString()],
      );
      const clock = { now: () => new Date(currentTime) };
      const ids = new RandomIdFactory();
      const unitOfWork = new PostgresUnitOfWork(database);
      const audit = new PostgresAccessDecisionAudit(unitOfWork, ids);
      const oidc = new PostgresOidcAuthorizationAdapter(
        unitOfWork,
        {
          issuer: new URL(unverifiedProvider.issuer),
          clientId: "rahhal-unverified-test-web",
          allowedRedirectUris: new Set([redirectUri]),
          flowSecret,
          allowInsecureHttp: true,
        },
        clock,
        ids,
      );
      const identity = new PostgresIdentityWorkspaceAdapter(
        unitOfWork,
        oidc,
        new HmacSessionCredentialIssuer(credentialSecret),
        clock,
        ids,
        audit,
      );
      const start = await oidc.start(
        { expected_version: 0, redirect_uri: redirectUri },
        {
          idempotencyKey: "a2-unverified-start-0001",
          correlationId: parseCorrelationId("cor_a2_unverified_start_0001"),
        },
      );
      const callback = await authorizationCallback(start.authorization_url);
      await expect(
        identity.exchange(
          buildSessionExchangeBody({
            authorization_code: callback.searchParams.get("code") ?? "",
            code_verifier: start.code_verifier,
            redirect_uri: redirectUri,
            state: callback.searchParams.get("state") ?? "",
          }),
          {
            idempotencyKey: "a2-unverified-exchange-0001",
            correlationId: parseCorrelationId("cor_a2_unverified_exchange_0001"),
          },
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
    } finally {
      await unverifiedProvider.close();
    }
  });
});
