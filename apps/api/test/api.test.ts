import {
  apiRoutes,
  type ErrorEnvelope,
  type ChallengePageSuccessEnvelope,
  type MutationSuccessEnvelope,
  type SessionSuccessEnvelope,
  type SuccessEnvelope,
  type ChallengeDraftContentResource,
  type ChallengeApprovalBriefResource,
  type PlatformChallengeApprovalQueueResource,
  type ChallengePublicPage,
  type ChallengePublicProjectionResource,
  type ChallengeResource,
  type MeResource,
} from "@rahhal/contracts";
import {
  challengeOutboxEventTypes,
  idPrefixes,
  parseChallengeId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import {
  buildCreateChallengeBody,
  buildChallengeContentResource,
  buildChallengeResource,
  buildPatchChallengeBody,
  buildSessionExchangeBody,
  buildSessionRefreshBody,
  buildSessionRevokeBody,
  buildSwitchWorkspaceContextBody,
  deterministicId,
  fixedTimestamp,
} from "@rahhal/testkit";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import {
  createDemoApiComposition,
  demoApiCredentials,
  demoForeignChallengeId,
  type DemoApiComposition,
} from "../src/demo-composition.js";
import { InMemoryChallengeRepository } from "../src/in-memory-challenges.js";
import { MonotonicIdFactory } from "../src/primitives.js";

const clock = { now: () => new Date(fixedTimestamp) };

function exchangeBody() {
  return buildSessionExchangeBody({
    authorization_code: demoApiCredentials.exchange.authorizationCode,
    code_verifier: demoApiCredentials.exchange.codeVerifier,
    redirect_uri: demoApiCredentials.exchange.redirectUri,
    state: demoApiCredentials.exchange.state,
  });
}

function ownerHeaders(idempotencyKey?: string) {
  return {
    authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
    "x-workspace-id": demoApiCredentials.owner.workspaceId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

/**
 * Builds headers for a gate-recording request against the alpha org's
 * challenge. Platform actors (platformOps/platformFinance/platformLegal)
 * are never members of wsp_org_alpha, so their session stays active in
 * their own platform workspace -- the request still targets wsp_org_alpha
 * via X-Workspace-Id, exactly modeling the B2 cross-tenant path.
 */
function gateHeaders(
  credential: { readonly accessToken: string },
  idempotencyKey?: string,
  targetWorkspaceId: string = demoApiCredentials.owner.workspaceId,
) {
  return {
    authorization: `Bearer ${credential.accessToken}`,
    "x-workspace-id": targetWorkspaceId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

type ChallengeRaceOperation = "create" | "read" | "patch";

function challengeRaceRequest(
  app: FastifyInstance,
  operation: ChallengeRaceOperation,
  challengeId: string,
) {
  if (operation === "create") {
    return app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("race-create-after-invalidation"),
      payload: buildCreateChallengeBody(),
    });
  }
  if (operation === "read") {
    return app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
  }
  return app.inject({
    method: "PATCH",
    url: `/api/v1/challenges/${challengeId}`,
    headers: ownerHeaders("race-patch-after-invalidation"),
    payload: buildPatchChallengeBody({ expected_version: 1 }),
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function pauseAfterSuccessfulAuthentication(composition: DemoApiComposition) {
  const authenticated = deferred();
  const release = deferred();
  const decisionAudit = {
    async record(decision: Parameters<DemoApiComposition["decisionAudit"]["record"]>[0]) {
      await composition.decisionAudit.record(decision);
      if (decision.action === "session:authenticate" && decision.outcome === "success") {
        authenticated.resolve();
        await release.promise;
      }
    },
  };
  return {
    app: buildApi({ ...composition.ports, decisionAudit }),
    authenticated: authenticated.promise,
    release: release.resolve,
  };
}

describe("authoritative Fastify API foundation", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;

  beforeEach(() => {
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  it("publishes the exact contracts OpenAPI document without authentication", async () => {
    const response = await app.inject({ method: "GET", url: apiRoutes.openApi });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      openapi: "3.1.0",
      paths: {
        [apiRoutes.sessionExchange]: { post: { operationId: "exchangeSession" } },
        [apiRoutes.challengeById]: { get: {}, patch: {} },
      },
    });
  });

  it("serializes private responses through the canonical response schema", async () => {
    const challengeId = parseChallengeId("chl_private_extra_001");
    const leakyAdapterResource = {
      ...buildChallengeResource({
        id: challengeId,
        tenant_id: parseTenantId("ten_alpha_org"),
        workspace_id: demoApiCredentials.owner.workspaceId,
        created_by: parseUserId("usr_owner_alpha"),
      }),
      internal_notes: "must never cross the private API boundary",
    };
    composition.challenges.seed(leakyAdapterResource);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SuccessEnvelope<ChallengeResource>>().data).not.toHaveProperty(
      "internal_notes",
    );
    expect(response.body).not.toContain("must never cross");
  });

  it("exchanges an injected OIDC flow and replays the same receipt without another effect", async () => {
    const request = {
      method: "POST" as const,
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "exchange-owner-0001" },
      payload: exchangeBody(),
    };

    const first = await app.inject(request);
    const second = await app.inject(request);
    const firstBody = first.json<SessionSuccessEnvelope>();
    const secondBody = second.json<SessionSuccessEnvelope>();

    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(firstBody.data.receipt.entity_id).toBe(firstBody.data.tokens.session_id);
    expect(firstBody.data.receipt.idempotent).toBe(false);
    expect(secondBody.data.receipt).toEqual({ ...firstBody.data.receipt, idempotent: true });
    expect(secondBody.data.tokens).toEqual(firstBody.data.tokens);
    expect(composition.identity.snapshot().sessions).toHaveLength(8);
    expect(composition.identity.snapshot().auditEvents).toHaveLength(1);
    expect(composition.identity.snapshot().outboxEvents).toHaveLength(1);
  });

  it("consumes an OIDC authorization code once while preserving exact-key replay", async () => {
    const first = await app.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "exchange-code-once-0001" },
      payload: exchangeBody(),
    });
    const replayWithNewKey = await app.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "exchange-code-once-0002" },
      payload: exchangeBody(),
    });

    expect(first.statusCode).toBe(200);
    expect(replayWithNewKey.statusCode).toBe(403);
    expect(replayWithNewKey.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
    const snapshot = composition.identity.snapshot();
    expect(snapshot.sessions).toHaveLength(8);
    expect(snapshot.auditEvents).toHaveLength(1);
    expect(snapshot.outboxEvents).toHaveLength(1);
    expect(snapshot.consumedOidcExchangeCount).toBe(1);
  });

  it.each([
    ["code verifier", { code_verifier: "x".repeat(43) }],
    ["state", { state: "wrong-state-owner-alpha" }],
    ["redirect URI", { redirect_uri: "http://localhost:3000/auth/other-callback" }],
  ])(
    "rejects an OIDC %s mismatch without consuming the valid exchange",
    async (_name, mismatch) => {
      const before = composition.identity.snapshot();
      const denied = await app.inject({
        method: "POST",
        url: apiRoutes.sessionExchange,
        headers: { "idempotency-key": `exchange-mismatch-${_name.replaceAll(" ", "-")}` },
        payload: { ...exchangeBody(), ...mismatch },
      });

      expect(denied.statusCode).toBe(403);
      expect(denied.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
      expect(composition.identity.snapshot()).toEqual(before);

      const valid = await app.inject({
        method: "POST",
        url: apiRoutes.sessionExchange,
        headers: { "idempotency-key": `exchange-after-${_name.replaceAll(" ", "-")}` },
        payload: exchangeBody(),
      });
      expect(valid.statusCode).toBe(200);
      expect(composition.identity.snapshot().consumedOidcExchangeCount).toBe(1);
    },
  );

  it("rotates and revokes a session with version and idempotency enforcement", async () => {
    const refreshed = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRefresh,
      headers: { "idempotency-key": "refresh-owner-0001" },
      payload: buildSessionRefreshBody({
        expected_version: 1,
        refresh_token: demoApiCredentials.owner.refreshToken,
      }),
    });
    const refreshedBody = refreshed.json<SessionSuccessEnvelope>();
    expect(refreshed.statusCode).toBe(200);
    expect(refreshedBody.meta.entity_version).toBe(2);

    const oldSession = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    expect(oldSession.statusCode).toBe(403);

    const revokeRequest = {
      method: "POST" as const,
      url: apiRoutes.sessionRevoke,
      headers: {
        authorization: `Bearer ${refreshedBody.data.tokens.access_token}`,
        "idempotency-key": "revoke-owner-0001",
      },
      payload: buildSessionRevokeBody({
        expected_version: 2,
        session_id: refreshedBody.data.tokens.session_id,
      }),
    };
    const firstRevoke = await app.inject(revokeRequest);
    const replayedRevoke = await app.inject(revokeRequest);
    const firstReceipt = firstRevoke.json<MutationSuccessEnvelope>();
    const replayedReceipt = replayedRevoke.json<MutationSuccessEnvelope>();

    expect(firstRevoke.statusCode).toBe(200);
    expect(firstReceipt.meta.entity_version).toBe(3);
    expect(replayedReceipt.data).toEqual({ ...firstReceipt.data, idempotent: true });
    const revokedSession = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${refreshedBody.data.tokens.access_token}` },
    });
    expect(revokedSession.statusCode).toBe(403);
  });

  it("audits malformed, unknown, valid, and replayed revoke credentials without tokens", async () => {
    const payload = buildSessionRevokeBody({
      expected_version: 1,
      session_id: demoApiCredentials.owner.sessionId,
    });
    const malformed = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRevoke,
      headers: { "idempotency-key": "revoke-audit-malformed" },
      payload,
    });
    const unknown = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRevoke,
      headers: {
        authorization: "Bearer unknown-access-credential",
        "idempotency-key": "revoke-audit-unknown",
      },
      payload,
    });
    const request = {
      method: "POST" as const,
      url: apiRoutes.sessionRevoke,
      headers: {
        authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
        "idempotency-key": "revoke-audit-valid",
      },
      payload,
    };
    const valid = await app.inject(request);
    const replay = await app.inject(request);

    expect(malformed.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    expect(valid.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data.idempotent).toBe(true);
    const decisions = composition.decisionAudit.snapshot();
    const authentication = decisions.filter(({ action }) => action === "session:authenticate");
    expect(authentication).toEqual([
      expect.objectContaining({
        outcome: "denied",
        reason: "bearer_missing_or_malformed",
      }),
      expect.objectContaining({ outcome: "denied", reason: "session_unavailable" }),
      expect.objectContaining({
        outcome: "success",
        actorUserId: parseUserId("usr_owner_alpha"),
        entityId: demoApiCredentials.owner.sessionId,
      }),
    ]);
    expect(decisions).toContainEqual(
      expect.objectContaining({
        outcome: "success",
        action: "session:revoke:replay",
        actorUserId: parseUserId("usr_owner_alpha"),
        entityId: demoApiCredentials.owner.sessionId,
        reason: "credential_bound_idempotent_replay",
      }),
    );
    const serializedDecisions = JSON.stringify(decisions);
    expect(serializedDecisions).not.toContain(demoApiCredentials.owner.accessToken);
    expect(serializedDecisions).not.toContain("unknown-access-credential");
  });

  it("scopes refresh and revoke idempotency keys to each session credential", async () => {
    const ownerRefresh = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRefresh,
      headers: { "idempotency-key": "shared-refresh-key-0001" },
      payload: buildSessionRefreshBody({
        expected_version: 1,
        refresh_token: demoApiCredentials.owner.refreshToken,
      }),
    });
    const approverRefresh = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRefresh,
      headers: { "idempotency-key": "shared-refresh-key-0001" },
      payload: buildSessionRefreshBody({
        expected_version: 1,
        refresh_token: demoApiCredentials.approver.refreshToken,
      }),
    });
    const ownerTokens = ownerRefresh.json<SessionSuccessEnvelope>().data.tokens;
    const approverTokens = approverRefresh.json<SessionSuccessEnvelope>().data.tokens;

    expect(ownerRefresh.statusCode).toBe(200);
    expect(approverRefresh.statusCode).toBe(200);
    expect(ownerTokens.session_id).not.toBe(approverTokens.session_id);

    const ownerRevoke = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRevoke,
      headers: {
        authorization: `Bearer ${ownerTokens.access_token}`,
        "idempotency-key": "shared-revoke-key-0001",
      },
      payload: buildSessionRevokeBody({
        expected_version: 2,
        session_id: ownerTokens.session_id,
      }),
    });
    const approverRevoke = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRevoke,
      headers: {
        authorization: `Bearer ${approverTokens.access_token}`,
        "idempotency-key": "shared-revoke-key-0001",
      },
      payload: buildSessionRevokeBody({
        expected_version: 2,
        session_id: approverTokens.session_id,
      }),
    });

    expect(ownerRevoke.statusCode).toBe(200);
    expect(approverRevoke.statusCode).toBe(200);
    const snapshot = composition.identity.snapshot();
    expect(snapshot.tokenIdempotencyEntryCount).toBe(2);
    expect(snapshot.mutationIdempotencyEntryCount).toBe(2);
    expect(snapshot.auditEvents).toHaveLength(4);
    expect(snapshot.outboxEvents).toHaveLength(4);
  });

  it("selects the first held workspace without a pre-existing workspace header", async () => {
    const exchange = await app.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "exchange-for-context-01" },
      payload: exchangeBody(),
    });
    const session = exchange.json<SessionSuccessEnvelope>();
    const beforeSwitch = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: {
        authorization: `Bearer ${session.data.tokens.access_token}`,
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "create-before-context-switch",
      },
      payload: buildCreateChallengeBody(),
    });
    expect(beforeSwitch.statusCode).toBe(404);
    expect(beforeSwitch.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");

    const switchRequest = {
      method: "POST" as const,
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: `Bearer ${session.data.tokens.access_token}`,
        "idempotency-key": "switch-context-alpha-01",
      },
      payload: buildSwitchWorkspaceContextBody({
        expected_version: 1,
        workspace_id: demoApiCredentials.owner.workspaceId,
      }),
    };

    const switched = await app.inject(switchRequest);
    const replayed = await app.inject(switchRequest);
    expect(switched.statusCode).toBe(200);
    expect(switched.json<MutationSuccessEnvelope>().meta.entity_version).toBe(2);
    expect(replayed.json<MutationSuccessEnvelope>().data.idempotent).toBe(true);

    const afterSwitch = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: {
        authorization: `Bearer ${session.data.tokens.access_token}`,
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "create-after-context-switch-01",
      },
      payload: buildCreateChallengeBody(),
    });
    expect(afterSwitch.statusCode).toBe(201);

    const me = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${session.data.tokens.access_token}` },
    });
    expect(me.json<SuccessEnvelope<MeResource>>().data.active_context?.workspace_id).toBe(
      demoApiCredentials.owner.workspaceId,
    );
  });

  it("returns NOT_FOUND and audits an unreachable context target", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
        "idempotency-key": "switch-context-unknown",
      },
      payload: buildSwitchWorkspaceContextBody({
        workspace_id: parseWorkspaceId("wsp_unknown_target"),
      }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    expect(composition.decisionAudit.snapshot()).toContainEqual(
      expect.objectContaining({
        outcome: "denied",
        action: "workspace.context.switch",
        reason: "target_workspace_unreachable",
      }),
    );
  });

  it("creates, reads, and patches a scoped challenge with atomic evidence", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-create-happy-01"),
      payload: buildCreateChallengeBody(),
    });
    const createdBody = created.json<MutationSuccessEnvelope>();
    expect(created.statusCode).toBe(201);
    expect(createdBody.meta.entity_version).toBe(1);
    expect(createdBody.data.next_actions).toEqual(["edit"]);

    const challengeId = createdBody.data.entity_id;
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    const readBody = read.json<SuccessEnvelope<ChallengeResource>>();
    expect(read.statusCode).toBe(200);
    expect(readBody.data).toMatchObject({
      id: challengeId,
      tenant_id: parseTenantId("ten_alpha_org"),
      workspace_id: demoApiCredentials.owner.workspaceId,
      version: 1,
      content: { applicant_scope: "both" },
    });

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders("challenge-patch-happy-01"),
      payload: buildPatchChallengeBody({
        expected_version: 1,
        patch: { summary: "نسخه دوم صورت‌مسئله" },
      }),
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<MutationSuccessEnvelope>().meta.entity_version).toBe(2);

    const snapshot = composition.challenges.snapshot();
    const challengeAudits = snapshot.auditEvents.filter(({ entityId }) => entityId === challengeId);
    const challengeOutbox = snapshot.outboxEvents.filter(
      ({ aggregate_id }) => aggregate_id === challengeId,
    );
    expect(snapshot.versions.filter(({ id }) => id === challengeId)).toHaveLength(2);
    expect(challengeAudits.map(({ action }) => action)).toEqual([
      "challenge.draft.created",
      "challenge.draft.updated",
    ]);
    expect(challengeOutbox.map(({ event_type }) => event_type)).toEqual([
      "challenge.draft.created",
      "challenge.draft.updated",
    ]);
    expect(challengeAudits[1]?.correlationId).toBe(challengeOutbox[1]?.correlation_id);
    expect(composition.decisionAudit.snapshot()).toContainEqual(
      expect.objectContaining({
        outcome: "success",
        action: "challenge:read",
        entityId: challengeId,
      }),
    );
  });

  it("returns the same authoritative readiness issues from draft read and triage submit", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("b1-readiness-create-01"),
      payload: buildCreateChallengeBody({ draft: { title: "کوتاه" } }),
    });
    const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    const resource = read.json<SuccessEnvelope<ChallengeResource>>().data;

    const submitted = await app.inject({
      method: "POST",
      url: apiRoutes.requestChallengeTriage.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b1-readiness-submit-01"),
      payload: { expected_version: resource.version },
    });
    const failure = submitted.json<ErrorEnvelope>();

    expect(resource.readiness.ready).toBe(false);
    expect(submitted.statusCode).toBe(422);
    expect(failure.error).toMatchObject({
      code: "VALIDATION",
      current_version: resource.version,
      readiness: resource.readiness,
      fields: resource.readiness.issues,
    });
    expect(composition.challenges.snapshot().auditEvents).toHaveLength(1);
  });

  it("rejects an expired eligibility deadline before creating a challenge version", async () => {
    const versionsBefore = composition.challenges.snapshot().versions.length;
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("b3-expired-rule-create-01"),
      payload: buildCreateChallengeBody({
        draft: { proposal_deadline: "2025-12-31T23:59:59.000Z" },
      }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorEnvelope>().error).toMatchObject({
      code: "VALIDATION",
      fields: [expect.objectContaining({ path: "/content/proposal_deadline", code: "future" })],
    });
    expect(composition.challenges.snapshot().versions).toHaveLength(versionsBefore);
  });

  it("advances only along the canonical B1 lifecycle with versioned atomic receipts", async () => {
    const content = buildChallengeContentResource();
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("b1-lifecycle-create-01"),
      payload: buildCreateChallengeBody({ draft: content }),
    });
    const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;

    const skipped = await app.inject({
      method: "POST",
      url: apiRoutes.requestChallengeApprovals.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b1-lifecycle-skip-01"),
      payload: { expected_version: 1 },
    });
    expect(skipped.statusCode).toBe(409);
    expect(skipped.json<ErrorEnvelope>().error).toMatchObject({
      code: "INVALID_STATE",
      current_state: "draft",
      allowed_transitions: ["triage"],
    });

    const triageRequest = {
      method: "POST" as const,
      url: apiRoutes.requestChallengeTriage.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b1-lifecycle-triage-01"),
      payload: { expected_version: 1 },
    };
    const triage = await app.inject(triageRequest);
    const triageReplay = await app.inject(triageRequest);
    expect(triage.statusCode).toBe(200);
    expect(triage.json<MutationSuccessEnvelope>()).toMatchObject({
      data: { idempotent: false, next_actions: ["advance_formulation"] },
      meta: { entity_version: 2 },
    });
    expect(triageReplay.json<MutationSuccessEnvelope>()).toMatchObject({
      data: { idempotent: true },
      meta: { entity_version: 2 },
    });

    const formulation = await app.inject({
      method: "POST",
      url: apiRoutes.advanceChallengeFormulation.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b1-lifecycle-formulation-01"),
      payload: { expected_version: 2 },
    });
    expect(formulation.statusCode).toBe(200);
    expect(formulation.json<MutationSuccessEnvelope>().meta.entity_version).toBe(3);

    const save = await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders("b1-lifecycle-save-01"),
      payload: { expected_version: 3, patch: { summary: "نسخه دقیق صورت‌بندی نهایی" } },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json<MutationSuccessEnvelope>().meta.entity_version).toBe(4);

    const approvals = await app.inject({
      method: "POST",
      url: apiRoutes.requestChallengeApprovals.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b1-lifecycle-approvals-01"),
      payload: { expected_version: 4 },
    });
    expect(approvals.statusCode).toBe(200);
    expect(approvals.json<MutationSuccessEnvelope>()).toMatchObject({
      data: { next_actions: ["await_approvals"] },
      meta: { entity_version: 5 },
    });

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    expect(read.json<SuccessEnvelope<ChallengeResource>>().data).toMatchObject({
      stage: "approvals",
      version: 5,
      content_version: 2,
      readiness: { ready: true, evaluated_version: 5, issues: [] },
    });
    const snapshot = composition.challenges.snapshot();
    expect(snapshot.versions.filter(({ id }) => id === challengeId)).toHaveLength(2);
    expect(snapshot.auditEvents.filter(({ entityId }) => entityId === challengeId)).toHaveLength(5);
    expect(
      snapshot.outboxEvents.filter(({ aggregate_id }) => aggregate_id === challengeId),
    ).toHaveLength(5);
  });

  async function createChallengeAtApprovalsStage(
    keyPrefix: string,
    draft: ChallengeDraftContentResource = buildChallengeContentResource(),
  ): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders(`${keyPrefix}-create`),
      payload: buildCreateChallengeBody({ draft }),
    });
    const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;
    await app.inject({
      method: "POST",
      url: apiRoutes.requestChallengeTriage.replace("{challengeId}", challengeId),
      headers: ownerHeaders(`${keyPrefix}-triage`),
      payload: { expected_version: 1 },
    });
    await app.inject({
      method: "POST",
      url: apiRoutes.advanceChallengeFormulation.replace("{challengeId}", challengeId),
      headers: ownerHeaders(`${keyPrefix}-formulation`),
      payload: { expected_version: 2 },
    });
    const approvals = await app.inject({
      method: "POST",
      url: apiRoutes.requestChallengeApprovals.replace("{challengeId}", challengeId),
      headers: ownerHeaders(`${keyPrefix}-approvals`),
      payload: { expected_version: 3 },
    });
    expect(approvals.statusCode).toBe(200);
    return challengeId;
  }

  it("records all four B2 publication gates across the org and platform authorization paths", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b2-full");
    const recordUrl = apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId);

    const technical = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.approver, "b2-full-technical"),
      payload: {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "طرح فنی از نظر امکان‌سنجی بررسی و تأیید شد.",
      },
    });
    expect(technical.statusCode).toBe(200);
    const technicalBody = technical.json<MutationSuccessEnvelope>();
    expect(technicalBody.data).toMatchObject({
      idempotent: false,
      next_actions: ["await_remaining_gates"],
    });
    expect(technicalBody.meta.entity_version).toBe(1);

    const technicalReplay = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.approver, "b2-full-technical"),
      payload: {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "طرح فنی از نظر امکان‌سنجی بررسی و تأیید شد.",
      },
    });
    expect(technicalReplay.json<MutationSuccessEnvelope>()).toMatchObject({
      data: {
        entity_id: technicalBody.data.entity_id,
        receipt_id: technicalBody.data.receipt_id,
        audit_event_id: technicalBody.data.audit_event_id,
        idempotent: true,
      },
      meta: { entity_version: 1 },
    });

    // legal/finance/quality are all recorded cross-tenant: each platform
    // actor's own session stays active in wsp_platform_main, never in
    // wsp_org_alpha, so this is the narrow platform-authority path (B2),
    // not the ordinary org-membership path.
    const legal = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.platformLegal, "b2-full-legal"),
      payload: {
        expected_version: 4,
        gate: "legal",
        decision: "approved",
        reason: "بند حقوقی بررسی و تأیید شد.",
      },
    });
    expect(legal.statusCode).toBe(200);
    expect(legal.json<MutationSuccessEnvelope>().data.next_actions).toEqual([
      "await_remaining_gates",
    ]);

    const finance = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.platformFinance, "b2-full-finance"),
      payload: {
        expected_version: 4,
        gate: "finance",
        decision: "approved",
        reason: "بودجه بررسی و تأیید شد.",
      },
    });
    expect(finance.statusCode).toBe(200);
    expect(finance.json<MutationSuccessEnvelope>().data.next_actions).toEqual([
      "await_remaining_gates",
    ]);

    const quality = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.platformOps, "b2-full-quality"),
      payload: {
        expected_version: 4,
        gate: "quality",
        decision: "approved",
        reason: "بررسی کیفیت مستقل انجام و تأیید شد.",
      },
    });
    expect(quality.statusCode).toBe(200);
    expect(quality.json<MutationSuccessEnvelope>().data.next_actions).toEqual([
      "ready_for_publish",
    ]);

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    const resource = read.json<SuccessEnvelope<ChallengeResource>>().data;
    expect(resource.publication_readiness).toEqual({
      ready: true,
      satisfied: ["technical", "legal", "finance", "quality"],
      missing: [],
    });
    expect(resource.approvals.map((approval) => approval.gate).sort()).toEqual([
      "finance",
      "legal",
      "quality",
      "technical",
    ]);
    // Gate recording never touches the challenge's own aggregate version --
    // challenge_approval is a separate, independently-versioned aggregate.
    expect(resource.version).toBe(4);

    const snapshot = composition.challenges.snapshot();
    expect(
      snapshot.auditEvents.filter((event) => event.action === "challenge.approval.recorded"),
    ).toHaveLength(4);
    expect(
      snapshot.outboxEvents.filter((event) => event.event_type === "challenge.approval.recorded"),
    ).toHaveLength(4);

    // The worker dead-letters any event type outside its supported set, so an
    // event the challenge slice emits but the domain list omits is silent data
    // loss rather than a visible failure.
    const emitted = [...new Set(snapshot.outboxEvents.map((event) => event.event_type))].sort();
    expect(emitted.length).toBeGreaterThan(0);
    expect(
      emitted.filter((type) => !(challengeOutboxEventTypes as readonly string[]).includes(type)),
    ).toEqual([]);
  });

  it("denies gate recording for an ineligible role and for an unreachable cross-tenant target", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b2-denied");
    const recordUrl = apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId);
    const technicalPayload = {
      expected_version: 4,
      gate: "technical" as const,
      decision: "approved" as const,
      reason: "تلاش نامعتبر.",
    };

    // The org's own owner is a real member of the workspace but holds no
    // gate-eligible role -- denied via the ordinary org-context path.
    const ownerAttempt = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: ownerHeaders("b2-denied-owner"),
      payload: technicalPayload,
    });
    expect(ownerAttempt.statusCode).toBe(403);
    expect(ownerAttempt.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    // A platform actor with no standing authority for this gate (platformOps
    // only ever holds "quality") cannot reach it cross-tenant either -- and
    // the denial reads as NOT_FOUND, not NO_ACCESS, so it cannot be used to
    // probe whether the challenge exists.
    const platformOpsAttempt = await app.inject({
      method: "POST",
      url: recordUrl,
      headers: gateHeaders(demoApiCredentials.platformOps, "b2-denied-platform-ops-technical"),
      payload: technicalPayload,
    });
    expect(platformOpsAttempt.statusCode).toBe(404);
    expect(platformOpsAttempt.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
  });

  /** Drives a challenge to `approvals` and clears all four gates. */
  async function createFullyApprovedChallenge(
    keyPrefix: string,
    draft?: ChallengeDraftContentResource,
  ): Promise<string> {
    const challengeId = await createChallengeAtApprovalsStage(keyPrefix, draft);
    const recordUrl = apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId);
    const gates = [
      ["technical", demoApiCredentials.approver],
      ["legal", demoApiCredentials.platformLegal],
      ["finance", demoApiCredentials.platformFinance],
      ["quality", demoApiCredentials.platformOps],
    ] as const;
    for (const [gate, credential] of gates) {
      const response = await app.inject({
        method: "POST",
        url: recordUrl,
        headers: gateHeaders(credential, `${keyPrefix}-${gate}`),
        payload: {
          expected_version: 4,
          gate,
          decision: "approved",
          reason: `تأیید دروازه ${gate}.`,
        },
      });
      expect(response.statusCode).toBe(200);
    }
    return challengeId;
  }

  const publishUrl = (challengeId: string) =>
    apiRoutes.publishChallenge.replace("{challengeId}", challengeId);

  function publisherHeaders(idempotencyKey?: string) {
    return {
      authorization: `Bearer ${demoApiCredentials.publisher.accessToken}`,
      "x-workspace-id": demoApiCredentials.publisher.workspaceId,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    };
  }

  it("publishes a fully approved version and writes only allowlisted public fields", async () => {
    const challengeId = await createFullyApprovedChallenge(
      "b4-publish",
      // `legal_notes` is empty in the shared fixture; the leak assertion below
      // is only meaningful when every confidential field carries real text.
      buildChallengeContentResource({ legal_notes: "شرایط حقوقی داخلی و محرمانه." }),
    );
    const before = composition.challenges.snapshot();
    const approvedVersionId = before.challenges.find(
      ({ id }) => id === challengeId,
    )?.current_version_id;

    const published = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: publisherHeaders("b4-publish-command-01"),
      payload: { expected_version: 4 },
    });
    expect(published.statusCode).toBe(200);
    const receipt = published.json<MutationSuccessEnvelope>();
    expect(receipt.data.next_actions).toEqual(["await_proposals"]);
    expect(receipt.meta.entity_version).toBe(5);

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    const resource = read.json<SuccessEnvelope<ChallengeResource>>().data;
    expect(resource.stage).toBe("published");
    // The published pointer is the exact version the four gates cleared.
    expect(resource.published_version_id).toBe(approvedVersionId);

    const snapshot = composition.challenges.snapshot();
    const projections = snapshot.publicProjections.filter(
      (projection) => projection.challenge_id === challengeId,
    );
    expect(projections).toHaveLength(1);

    // The public row's field set is the allowlist and nothing else: every
    // confidential content field is structurally absent, not blanked out.
    const projection = projections[0];
    expect(Object.keys(projection ?? {}).sort()).toEqual(
      [
        "allowed_applicant_types",
        "applicant_scope",
        "budget",
        "category",
        "challenge_id",
        "challenge_version_id",
        "document_gate_required",
        "ip_terms",
        "location",
        "nda_required",
        "output_type",
        "preferred_start_date",
        "proposal_deadline",
        "public_summary",
        "published_at",
        "sourcing_model",
        "state",
        "title",
        "verification_required",
        "visibility",
        "work_mode",
      ].sort(),
    );
    const serialized = JSON.stringify(projection);
    for (const confidential of [
      resource.content.summary,
      resource.content.current_state,
      resource.content.desired_outcome,
      resource.content.expected_output,
      resource.content.legal_notes,
      resource.content.contact.email,
      resource.content.contact.phone,
    ]) {
      expect(confidential.length).toBeGreaterThan(0);
      expect(serialized).not.toContain(confidential);
    }

    expect(
      snapshot.auditEvents.filter(
        (event) => event.entityId === challengeId && event.action === "challenge.published",
      ),
    ).toHaveLength(1);
    expect(
      snapshot.outboxEvents.filter(
        (event) => event.aggregate_id === challengeId && event.event_type === "challenge.published",
      ),
    ).toHaveLength(1);
    const emitted = [...new Set(snapshot.outboxEvents.map((event) => event.event_type))];
    expect(
      emitted.filter((type) => !(challengeOutboxEventTypes as readonly string[]).includes(type)),
    ).toEqual([]);

    // A replay is the same receipt and produces no second publication.
    const replay = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: publisherHeaders("b4-publish-command-01"),
      payload: { expected_version: 4 },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...receipt.data,
      idempotent: true,
    });
    expect(composition.challenges.snapshot().publicProjections).toHaveLength(
      snapshot.publicProjections.length,
    );
  });

  it("refuses to publish an under-approved version and leaves no public row", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b4-partial");
    // Three of four gates: `quality` is deliberately never recorded.
    for (const [gate, credential] of [
      ["technical", demoApiCredentials.approver],
      ["legal", demoApiCredentials.platformLegal],
      ["finance", demoApiCredentials.platformFinance],
    ] as const) {
      await app.inject({
        method: "POST",
        url: apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId),
        headers: gateHeaders(credential, `b4-partial-${gate}`),
        payload: { expected_version: 4, gate, decision: "approved", reason: "تأیید جزئی." },
      });
    }
    const before = composition.challenges.snapshot();

    const denied = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: publisherHeaders("b4-partial-publish-01"),
      payload: { expected_version: 4 },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json<ErrorEnvelope>().error).toMatchObject({
      code: "INVALID_STATE",
      current_state: "approvals",
    });
    expect(composition.challenges.snapshot()).toEqual(before);

    // The outstanding gate is named on the record the caller already reads.
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    expect(
      read.json<SuccessEnvelope<ChallengeResource>>().data.publication_readiness.missing,
    ).toEqual(["quality"]);
  });

  it("denies publication to every role except the org publisher", async () => {
    const challengeId = await createFullyApprovedChallenge("b4-role");
    const before = composition.challenges.snapshot();

    // The owner authored the brief; separation of duty keeps release out of
    // the authoring role's hands even when every gate is green.
    const ownerAttempt = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: ownerHeaders("b4-role-owner-publish"),
      payload: { expected_version: 4 },
    });
    expect(ownerAttempt.statusCode).toBe(403);
    expect(ownerAttempt.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    // The technical approver is likewise not a publisher.
    const approverAttempt = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: gateHeaders(demoApiCredentials.approver, "b4-role-approver-publish"),
      payload: { expected_version: 4 },
    });
    expect(approverAttempt.statusCode).toBe(403);
    expect(approverAttempt.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    expect(composition.challenges.snapshot()).toEqual(before);
  });

  it("publishes an NDA-only challenge without ever entering the public table", async () => {
    const ndaChallengeId = await createFullyApprovedChallenge(
      "b4-nda",
      buildChallengeContentResource({ visibility: "nda" }),
    );

    const published = await app.inject({
      method: "POST",
      url: publishUrl(ndaChallengeId),
      headers: publisherHeaders("b4-nda-publish"),
      payload: { expected_version: 4 },
    });
    expect(published.statusCode).toBe(200);

    const snapshot = composition.challenges.snapshot();
    expect(snapshot.challenges.find(({ id }) => id === ndaChallengeId)?.stage).toBe("published");
    expect(
      snapshot.publicProjections.filter((projection) => projection.challenge_id === ndaChallengeId),
    ).toHaveLength(0);
  });

  /** Drives one challenge all the way to `published`. */
  async function publishChallenge(
    keyPrefix: string,
    draft?: ChallengeDraftContentResource,
  ): Promise<string> {
    const challengeId = await createFullyApprovedChallenge(keyPrefix, draft);
    const published = await app.inject({
      method: "POST",
      url: publishUrl(challengeId),
      headers: publisherHeaders(`${keyPrefix}-publish`),
      payload: { expected_version: 4 },
    });
    expect(published.statusCode).toBe(200);
    return challengeId;
  }

  const publicChallengeUrl = (challengeId: string) =>
    apiRoutes.publicChallengeById.replace("{challengeId}", challengeId);

  it("serves public discovery from the projection with no confidential field", async () => {
    const challengeId = await publishChallenge(
      "b5-public",
      buildChallengeContentResource({
        visibility: "public",
        legal_notes: "یادداشت حقوقی محرمانه.",
      }),
    );

    const list = await app.inject({ method: "GET", url: apiRoutes.publicChallenges });
    expect(list.statusCode).toBe(200);
    const page = list.json<SuccessEnvelope<ChallengePublicPage>>().data;
    const item = page.items.find((row) => row.challenge_id === challengeId);
    expect(item).toBeDefined();
    expect(page.next_cursor).toBeNull();

    const detail = await app.inject({ method: "GET", url: publicChallengeUrl(challengeId) });
    expect(detail.statusCode).toBe(200);
    const projection = detail.json<SuccessEnvelope<ChallengePublicProjectionResource>>().data;

    // The response's field set is the allowlist exactly -- a confidential
    // field added to the aggregate cannot arrive here by accident.
    expect(Object.keys(projection).sort()).toEqual(
      [
        "allowed_applicant_types",
        "applicant_scope",
        "budget",
        "category",
        "challenge_id",
        "challenge_version_id",
        "document_gate_required",
        "ip_terms",
        "location",
        "nda_required",
        "output_type",
        "preferred_start_date",
        "proposal_deadline",
        "public_summary",
        "published_at",
        "sourcing_model",
        "state",
        "title",
        "verification_required",
        "visibility",
        "work_mode",
      ].sort(),
    );
    expect(item).toEqual(projection);

    // Nothing the private record holds appears anywhere in the public payload.
    const serialized = detail.payload;
    for (const confidential of [
      "A deterministic challenge draft for tests.",
      "The current process is manual.",
      "یادداشت حقوقی محرمانه.",
      "contact@example.test",
      "+980000000000",
    ]) {
      expect(serialized).not.toContain(confidential);
    }
    // The public envelope carries no aggregate version either.
    expect(detail.json<SuccessEnvelope<unknown>>().meta).not.toHaveProperty("entity_version");
  });

  it("hides a registered-only challenge from anonymous readers and shows it to a session", async () => {
    const registeredId = await publishChallenge(
      "b5-registered",
      buildChallengeContentResource({ visibility: "registered" }),
    );

    const anonymousList = await app.inject({ method: "GET", url: apiRoutes.publicChallenges });
    expect(
      anonymousList
        .json<SuccessEnvelope<ChallengePublicPage>>()
        .data.items.map((row) => row.challenge_id),
    ).not.toContain(registeredId);

    // The detail denial is a plain NOT_FOUND, identical to an unknown id, so
    // an anonymous scan cannot learn that this challenge exists.
    const anonymousDetail = await app.inject({
      method: "GET",
      url: publicChallengeUrl(registeredId),
    });
    expect(anonymousDetail.statusCode).toBe(404);
    expect(anonymousDetail.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");

    const signedIn = await app.inject({
      method: "GET",
      url: publicChallengeUrl(registeredId),
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    expect(signedIn.statusCode).toBe(200);
    expect(
      signedIn.json<SuccessEnvelope<ChallengePublicProjectionResource>>().data.challenge_id,
    ).toBe(registeredId);
  });

  it("never exposes an unpublished, confidential, or unknown challenge", async () => {
    // Approved but not yet published.
    const unpublishedId = await createFullyApprovedChallenge("b5-unpublished");
    // Published, but NDA-only: it has no projection row at all.
    const ndaId = await publishChallenge(
      "b5-nda",
      buildChallengeContentResource({ visibility: "nda" }),
    );

    for (const challengeId of [unpublishedId, ndaId, parseChallengeId("chl_absent_00000001")]) {
      const response = await app.inject({
        method: "GET",
        url: publicChallengeUrl(challengeId),
        // Even a fully authenticated org owner gets nothing from the public
        // surface: reaching a private record is the authoring API's job.
        headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    }

    const list = await app.inject({
      method: "GET",
      url: apiRoutes.publicChallenges,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    const ids = list
      .json<SuccessEnvelope<ChallengePublicPage>>()
      .data.items.map((row) => row.challenge_id);
    expect(ids).not.toContain(unpublishedId);
    expect(ids).not.toContain(ndaId);
  });

  it("degrades an unusable credential to the anonymous audience instead of failing", async () => {
    const registeredId = await publishChallenge(
      "b5-degrade",
      buildChallengeContentResource({ visibility: "registered" }),
    );

    for (const authorization of ["Bearer not-a-real-token", "Basic abc", ""]) {
      const response = await app.inject({
        method: "GET",
        url: apiRoutes.publicChallenges,
        ...(authorization ? { headers: { authorization } } : {}),
      });
      // A public catalogue must answer, not 403, on a stale or malformed
      // credential -- but the degraded answer still withholds registered rows.
      expect(response.statusCode).toBe(200);
      expect(
        response
          .json<SuccessEnvelope<ChallengePublicPage>>()
          .data.items.map((row) => row.challenge_id),
      ).not.toContain(registeredId);
    }
  });

  it("filters by category and rejects a corrupt cursor", async () => {
    const matching = await publishChallenge(
      "b5-cat-match",
      buildChallengeContentResource({ visibility: "public", category: "logistics" }),
    );
    const other = await publishChallenge(
      "b5-cat-other",
      buildChallengeContentResource({ visibility: "public", category: "operations" }),
    );

    const filtered = await app.inject({
      method: "GET",
      url: `${apiRoutes.publicChallenges}?category=logistics`,
    });
    const ids = filtered
      .json<SuccessEnvelope<ChallengePublicPage>>()
      .data.items.map((row) => row.challenge_id);
    expect(ids).toContain(matching);
    expect(ids).not.toContain(other);

    const corrupt = await app.inject({
      method: "GET",
      url: `${apiRoutes.publicChallenges}?cursor=not-a-cursor`,
    });
    expect(corrupt.statusCode).toBe(422);
    expect(corrupt.json<ErrorEnvelope>().error.code).toBe("VALIDATION");
  });

  it("gives platform gate approvers an allowlisted brief, never the org aggregate", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b8a-read");
    const technical = await app.inject({
      method: "POST",
      url: apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId),
      headers: gateHeaders(demoApiCredentials.approver, "b8a-technical"),
      payload: {
        expected_version: 4,
        gate: "technical",
        decision: "approved",
        reason: "بررسی فنی انجام شد.",
      },
    });
    expect(technical.statusCode).toBe(200);

    const privateRead = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: gateHeaders(demoApiCredentials.platformOps),
    });
    expect(privateRead.statusCode).toBe(404);

    const opsRead = await app.inject({
      method: "GET",
      url: apiRoutes.platformChallengeApprovalBrief.replace("{challengeId}", challengeId),
      headers: gateHeaders(demoApiCredentials.platformOps),
    });
    expect(opsRead.statusCode).toBe(200);
    const resource = opsRead.json<SuccessEnvelope<ChallengeApprovalBriefResource>>().data;
    expect(resource.id).toBe(challengeId);
    expect(resource.stage).toBe("approvals");
    expect(resource.publication_readiness.missing).toContain("quality");
    expect(resource.content.title).not.toBe("");
    expect(resource.content).not.toHaveProperty("contact");
    expect(resource.content).not.toHaveProperty("invitees");
    expect(resource.content).not.toHaveProperty("attachment_ids");
    expect(resource).not.toHaveProperty("tenant_id");
    expect(resource).not.toHaveProperty("created_by");
    expect(resource.approvals[0]).toMatchObject({
      gate: "technical",
      recorded_by_role: "org:approver_technical",
      recorded_by_current_actor: false,
    });
    expect(resource.approvals[0]).not.toHaveProperty("recorded_by");

    for (const credential of [
      demoApiCredentials.platformLegal,
      demoApiCredentials.platformFinance,
    ]) {
      const response = await app.inject({
        method: "GET",
        url: apiRoutes.platformChallengeApprovalBrief.replace("{challengeId}", challengeId),
        headers: gateHeaders(credential),
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it("lists only approval work for the active platform role", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b8b-queue");
    const response = await app.inject({
      method: "GET",
      url: apiRoutes.platformChallengeApprovalQueue,
      headers: gateHeaders(
        demoApiCredentials.platformOps,
        undefined,
        demoApiCredentials.platformOps.workspaceId,
      ),
    });
    expect(response.statusCode).toBe(200);
    const queue = response.json<SuccessEnvelope<PlatformChallengeApprovalQueueResource>>().data;
    expect(queue.items).toContainEqual(
      expect.objectContaining({
        challenge_id: challengeId,
        workspace_id: demoApiCredentials.owner.workspaceId,
        gate: "quality",
      }),
    );
    expect(JSON.stringify(queue)).not.toContain("contact");
  });

  it("keeps the platform read inside the approvals window and off other stages", async () => {
    // Created but never advanced: no gate authority applies, so ops must not
    // be able to read it -- and the denial must not reveal that it exists.
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("b8a-draft-create"),
      payload: buildCreateChallengeBody({ draft: buildChallengeContentResource() }),
    });
    const draftId = created.json<MutationSuccessEnvelope>().data.entity_id;

    const draftRead = await app.inject({
      method: "GET",
      url: apiRoutes.platformChallengeApprovalBrief.replace("{challengeId}", draftId),
      headers: gateHeaders(demoApiCredentials.platformOps),
    });
    expect(draftRead.statusCode).toBe(404);
    expect(draftRead.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");

    // An unknown id answers identically, so the two are indistinguishable.
    const unknownRead = await app.inject({
      method: "GET",
      url: apiRoutes.platformChallengeApprovalBrief.replace(
        "{challengeId}",
        parseChallengeId("chl_absent_00000002"),
      ),
      headers: gateHeaders(demoApiCredentials.platformOps),
    });
    expect(unknownRead.statusCode).toBe(404);
    expect(unknownRead.json<ErrorEnvelope>().error.code).toBe(
      draftRead.json<ErrorEnvelope>().error.code,
    );
  });

  it("denies the cross-tenant read to a foreign org and to a gateless platform role", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b8a-denied");

    // Another organization is not a platform role: no standing authority, and
    // no membership in wsp_org_alpha either.
    const foreign = await app.inject({
      method: "GET",
      url: apiRoutes.platformChallengeApprovalBrief.replace("{challengeId}", challengeId),
      headers: gateHeaders(demoApiCredentials.foreignOwner),
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
  });

  it("runs the publication lifecycle through the publisher only, and hides a paused call", async () => {
    const challengeId = await publishChallenge(
      "b6-lifecycle",
      buildChallengeContentResource({ visibility: "public" }),
    );
    const listed = async () => {
      const response = await app.inject({ method: "GET", url: apiRoutes.publicChallenges });
      return response
        .json<SuccessEnvelope<ChallengePublicPage>>()
        .data.items.map((row) => row.challenge_id);
    };
    expect(await listed()).toContain(challengeId);

    // The org owner authored the brief; changing a live call's terms is a
    // release decision, so it is the publisher's alone.
    const ownerPause = await app.inject({
      method: "POST",
      url: apiRoutes.pauseChallenge.replace("{challengeId}", challengeId),
      headers: ownerHeaders("b6-owner-pause"),
      payload: { expected_version: 5, reason: "تلاش مالک." },
    });
    expect(ownerPause.statusCode).toBe(403);
    expect(await listed()).toContain(challengeId);

    const paused = await app.inject({
      method: "POST",
      url: apiRoutes.pauseChallenge.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-publisher-pause"),
      payload: { expected_version: 5, reason: "توقف موقت." },
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json<MutationSuccessEnvelope>().data.next_actions).toEqual(["await_resume"]);
    expect(await listed()).not.toContain(challengeId);

    // A paused call keeps its record for anyone already holding the link.
    const detail = await app.inject({
      method: "GET",
      url: apiRoutes.publicChallengeById.replace("{challengeId}", challengeId),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<SuccessEnvelope<ChallengePublicProjectionResource>>().data.state).toBe(
      "paused",
    );

    // Extending is refused while paused: only an open call has a live deadline.
    const extendPaused = await app.inject({
      method: "POST",
      url: apiRoutes.extendChallengeDeadline.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-extend-paused"),
      payload: {
        expected_version: 6,
        proposal_deadline: "2031-01-01T00:00:00.000Z",
        reason: "تمدید در حالت توقف.",
      },
    });
    expect(extendPaused.statusCode).toBe(409);

    const resumed = await app.inject({
      method: "POST",
      url: apiRoutes.resumeChallenge.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-publisher-resume"),
      payload: { expected_version: 6, reason: "ادامه فراخوان." },
    });
    expect(resumed.statusCode).toBe(200);
    expect(await listed()).toContain(challengeId);

    const extended = await app.inject({
      method: "POST",
      url: apiRoutes.extendChallengeDeadline.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-extend-open"),
      payload: {
        expected_version: 7,
        proposal_deadline: "2031-01-01T00:00:00.000Z",
        reason: "تمدید مهلت.",
      },
    });
    expect(extended.statusCode).toBe(200);

    // Shortening is refused; a deadline solvers already saw only moves forward.
    const shortened = await app.inject({
      method: "POST",
      url: apiRoutes.extendChallengeDeadline.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-extend-back"),
      payload: {
        expected_version: 8,
        proposal_deadline: "2030-02-01T00:00:00.000Z",
        reason: "کوتاه‌کردن مهلت.",
      },
    });
    expect(shortened.statusCode).toBe(422);

    const cancelled = await app.inject({
      method: "POST",
      url: apiRoutes.cancelChallenge.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-publisher-cancel"),
      payload: { expected_version: 8, reason: "لغو با اطلاع‌رسانی." },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<MutationSuccessEnvelope>().data.next_actions).toEqual(["closed"]);

    // Terminal: a cancelled call cannot be resumed.
    const reopened = await app.inject({
      method: "POST",
      url: apiRoutes.resumeChallenge.replace("{challengeId}", challengeId),
      headers: publisherHeaders("b6-publisher-reopen"),
      payload: { expected_version: 9, reason: "تلاش بازگشایی." },
    });
    expect(reopened.statusCode).toBe(409);

    // Every lifecycle event stays inside the worker's supported set.
    const emitted = [
      ...new Set(composition.challenges.snapshot().outboxEvents.map((event) => event.event_type)),
    ];
    expect(
      emitted.filter((type) => !(challengeOutboxEventTypes as readonly string[]).includes(type)),
    ).toEqual([]);
    const lifecycleAudits = composition.challenges
      .snapshot()
      .auditEvents.filter((event) => event.entityId === challengeId);
    expect(lifecycleAudits.find((event) => event.action === "challenge.paused")?.reason).toBe(
      "توقف موقت.",
    );
    expect(
      lifecycleAudits.find((event) => event.action === "challenge.deadline.extended")?.reason,
    ).toBe("تمدید مهلت.");
  });

  it("revalidates session revocation inside the cross-tenant platform gate unit of work", async () => {
    const challengeId = await createChallengeAtApprovalsStage("b2-revoke");
    const before = composition.challenges.snapshot();
    const paused = pauseAfterSuccessfulAuthentication(composition);
    await app.close();
    app = paused.app;

    const request = app.inject({
      method: "POST",
      url: apiRoutes.recordChallengeApproval.replace("{challengeId}", challengeId),
      headers: gateHeaders(demoApiCredentials.platformOps, "b2-revoke-quality"),
      payload: {
        expected_version: 4,
        gate: "quality",
        decision: "approved",
        reason: "بررسی کیفیت پس از ابطال نشست.",
      },
    });
    await paused.authenticated;
    await composition.identity.revoke(
      demoApiCredentials.platformOps.accessToken,
      buildSessionRevokeBody({
        expected_version: 1,
        session_id: demoApiCredentials.platformOps.sessionId,
      }),
      {
        idempotencyKey: "b2-revoke-platform-session",
        correlationId: deterministicId(idPrefixes.correlation, 70),
      },
    );
    paused.release();
    const response = await request;

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
    expect(composition.challenges.snapshot()).toEqual(before);
  });

  it("replays a challenge command with the same receipt and one aggregate effect", async () => {
    const request = {
      method: "POST" as const,
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-create-replay-01"),
      payload: buildCreateChallengeBody(),
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    const firstBody = first.json<MutationSuccessEnvelope>();
    const secondBody = second.json<MutationSuccessEnvelope>();

    expect(second.statusCode).toBe(201);
    expect(secondBody.data).toEqual({ ...firstBody.data, idempotent: true });
    const snapshot = composition.challenges.snapshot();
    expect(snapshot.challenges.filter(({ id }) => id === firstBody.data.entity_id)).toHaveLength(1);
    expect(
      snapshot.auditEvents.filter(({ entityId }) => entityId === firstBody.data.entity_id),
    ).toHaveLength(1);
    expect(
      snapshot.outboxEvents.filter(({ aggregate_id }) => aggregate_id === firstBody.data.entity_id),
    ).toHaveLength(1);
  });

  it("returns CONFLICT when an idempotency key is reused with a different body", async () => {
    const idempotencyKey = "challenge-body-conflict-01";
    const first = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders(idempotencyKey),
      payload: buildCreateChallengeBody(),
    });
    expect(first.statusCode).toBe(201);
    const afterFirst = composition.challenges.snapshot();

    const conflicting = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders(idempotencyKey),
      payload: buildCreateChallengeBody({ draft: { summary: "متن متفاوت" } }),
    });

    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json<ErrorEnvelope>().error).toMatchObject({
      code: "CONFLICT",
      recovery: "use_a_new_idempotency_key",
    });
    expect(composition.challenges.snapshot()).toEqual(afterFirst);
  });

  it("rejects stale writes without audit, outbox, or version side effects", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-create-stale-01"),
      payload: buildCreateChallengeBody(),
    });
    const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;
    const before = composition.challenges.snapshot();

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders("challenge-patch-stale-01"),
      payload: buildPatchChallengeBody({ expected_version: 0 }),
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json<ErrorEnvelope>().error).toMatchObject({
      code: "CONFLICT",
      current_version: 1,
      recovery: "refetch_and_retry",
    });
    expect(composition.challenges.snapshot()).toEqual(before);
  });

  it("denies absent authentication and a role without challenge edit capability", async () => {
    const unauthenticated = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: {
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "challenge-no-auth-0001",
      },
      payload: buildCreateChallengeBody(),
    });
    expect(unauthenticated.statusCode).toBe(403);
    expect(unauthenticated.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    const wrongRole = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: {
        authorization: `Bearer ${demoApiCredentials.approver.accessToken}`,
        "x-workspace-id": demoApiCredentials.approver.workspaceId,
        "idempotency-key": "challenge-wrong-role-01",
      },
      payload: buildCreateChallengeBody(),
    });
    expect(wrongRole.statusCode).toBe(403);
    expect(wrongRole.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
  });

  it("audits bearer authentication allow and deny without recording credentials", async () => {
    const denied = await app.inject({ method: "GET", url: apiRoutes.me });
    const allowed = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    const authentication = composition.decisionAudit
      .snapshot()
      .filter(({ action }) => action === "session:authenticate");
    expect(authentication).toEqual([
      expect.objectContaining({
        outcome: "denied",
        reason: "bearer_missing_or_malformed",
      }),
      expect.objectContaining({
        outcome: "success",
        actorUserId: parseUserId("usr_owner_alpha"),
        entityId: demoApiCredentials.owner.sessionId,
      }),
    ]);
    expect(JSON.stringify(authentication)).not.toContain(demoApiCredentials.owner.accessToken);
  });

  it("denies an expired access session immediately and audits authentication denial", async () => {
    let currentTime = new Date(fixedTimestamp);
    const expiringComposition = createDemoApiComposition({
      mode: "demo",
      nodeEnv: "test",
      clock: { now: () => new Date(currentTime) },
    });
    const expiringApp = buildApi(expiringComposition.ports);

    try {
      currentTime = new Date(currentTime.getTime() + 16 * 60_000);
      const response = await expiringApp.inject({
        method: "GET",
        url: apiRoutes.me,
        headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
      expect(expiringComposition.decisionAudit.snapshot()).toContainEqual(
        expect.objectContaining({
          outcome: "denied",
          action: "session:authenticate",
          reason: "session_unavailable",
        }),
      );
      expect(JSON.stringify(expiringComposition.decisionAudit.snapshot())).not.toContain(
        demoApiCredentials.owner.accessToken,
      );
    } finally {
      await expiringApp.close();
    }
  });

  it("makes unknown and cross-workspace challenge IDs indistinguishable and audits denial", async () => {
    const unknownId = parseChallengeId("chl_unknown_record_001");
    const [foreign, unknown, wrongWorkspace] = await Promise.all([
      app.inject({
        method: "GET",
        url: `/api/v1/challenges/${demoForeignChallengeId}`,
        headers: ownerHeaders(),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/challenges/${unknownId}`,
        headers: ownerHeaders(),
      }),
      app.inject({
        method: "GET",
        url: `/api/v1/challenges/${demoForeignChallengeId}`,
        headers: {
          authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
          "x-workspace-id": demoApiCredentials.foreignOwner.workspaceId,
        },
      }),
    ]);

    for (const response of [foreign, unknown, wrongWorkspace]) {
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().error).toEqual({
        code: "NOT_FOUND",
        message: "The requested resource is unavailable",
      });
    }
    const audit = composition.decisionAudit.snapshot();
    expect(audit.filter(({ outcome }) => outcome === "denied").length).toBeGreaterThanOrEqual(3);
    expect(
      audit.filter(
        ({ outcome, entityId }) =>
          outcome === "success" && (entityId === demoForeignChallengeId || entityId === unknownId),
      ),
    ).toEqual([]);
    expect(JSON.stringify(audit)).not.toContain("چالش محرمانه سازمان بتا");

    const swappedPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${demoForeignChallengeId}`,
      headers: ownerHeaders("challenge-cross-scope-patch"),
      payload: buildPatchChallengeBody(),
    });
    expect(swappedPatch.statusCode).toBe(404);
    expect(swappedPatch.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
  });

  it("denies protected reads and context switches immediately after membership suspension", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-before-suspend"),
      payload: buildCreateChallengeBody(),
    });
    const challengeId = created.json<MutationSuccessEnvelope>().data.entity_id;
    const ownerUserId = parseUserId("usr_owner_alpha");
    await composition.identity.setMembershipStateForTest(
      ownerUserId,
      demoApiCredentials.owner.workspaceId,
      "suspended",
    );

    await expect(
      composition.identity.findActive(ownerUserId, demoApiCredentials.owner.workspaceId),
    ).resolves.toBeNull();

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: ownerHeaders(),
    });
    const contextSwitch = await app.inject({
      method: "POST",
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
        "idempotency-key": "switch-after-suspend",
      },
      payload: buildSwitchWorkspaceContextBody({
        workspace_id: demoApiCredentials.owner.workspaceId,
      }),
    });

    for (const response of [read, contextSwitch]) {
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().error).toEqual({
        code: "NOT_FOUND",
        message: "The requested resource is unavailable",
      });
    }
    const me = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    const meBody = me.json<SuccessEnvelope<MeResource>>();
    expect(meBody.data.active_context).toBeNull();
    expect(meBody.data.memberships[0]?.state).toBe("suspended");
  });

  it.each(["create", "read", "patch"] as const)(
    "revalidates membership inside the %s challenge unit of work",
    async (operation) => {
      const baseline = await app.inject({
        method: "POST",
        url: apiRoutes.challenges,
        headers: ownerHeaders(`race-baseline-${operation}`),
        payload: buildCreateChallengeBody(),
      });
      const challengeId = baseline.json<MutationSuccessEnvelope>().data.entity_id;
      const before = composition.challenges.snapshot();
      const paused = pauseAfterSuccessfulAuthentication(composition);
      await app.close();
      app = paused.app;

      const request = challengeRaceRequest(app, operation, challengeId);
      await paused.authenticated;
      await composition.identity.setMembershipStateForTest(
        parseUserId("usr_owner_alpha"),
        demoApiCredentials.owner.workspaceId,
        "suspended",
      );
      paused.release();
      const response = await request;

      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
      expect(composition.challenges.snapshot()).toEqual(before);
    },
  );

  it.each(["create", "read", "patch"] as const)(
    "revalidates session revocation inside the %s challenge unit of work",
    async (operation) => {
      const baseline = await app.inject({
        method: "POST",
        url: apiRoutes.challenges,
        headers: ownerHeaders(`revocation-baseline-${operation}`),
        payload: buildCreateChallengeBody(),
      });
      const challengeId = baseline.json<MutationSuccessEnvelope>().data.entity_id;
      const before = composition.challenges.snapshot();
      const paused = pauseAfterSuccessfulAuthentication(composition);
      await app.close();
      app = paused.app;

      const request = challengeRaceRequest(app, operation, challengeId);
      await paused.authenticated;
      await composition.identity.revoke(
        demoApiCredentials.owner.accessToken,
        buildSessionRevokeBody({
          expected_version: 1,
          session_id: demoApiCredentials.owner.sessionId,
        }),
        {
          idempotencyKey: `race-revoke-${operation}`,
          correlationId: deterministicId(idPrefixes.correlation, 40),
        },
      );
      paused.release();
      const response = await request;

      expect(response.statusCode).toBe(403);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
      expect(composition.challenges.snapshot()).toEqual(before);
    },
  );

  it("keeps challenge authorization and mutation in one serialized unit of work", async () => {
    const enteredMutation = deferred();
    const releaseMutation = deferred();
    let membershipObservedInsideMutation: unknown;
    const challenges = composition.ports.challenges;
    await app.close();
    app = buildApi({
      ...composition.ports,
      challenges: {
        async create(body, context) {
          enteredMutation.resolve();
          await releaseMutation.promise;
          membershipObservedInsideMutation = await composition.identity.findActive(
            context.actorUserId,
            context.workspaceId,
          );
          return challenges.create(body, context);
        },
        getScoped: (scope, id) => challenges.getScoped(scope, id),
        listScoped: (scope, query) => challenges.listScoped(scope, query),
        getApprovalBrief: (scope, id) => challenges.getApprovalBrief(scope, id),
        listApprovalQueue: (scope) => challenges.listApprovalQueue(scope),
        patch: (id, body, context) => challenges.patch(id, body, context),
        transition: (id, command, body, context) =>
          challenges.transition(id, command, body, context),
        recordApproval: (id, body, context) => challenges.recordApproval(id, body, context),
        publish: (id, body, context) => challenges.publish(id, body, context),
        extendDeadline: (id, body, context) => challenges.extendDeadline(id, body, context),
        changePublicationState: (id, command, body, context) =>
          challenges.changePublicationState(id, command, body, context),
      },
    });

    const request = app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("serialized-authority-create"),
      payload: buildCreateChallengeBody(),
    });
    await enteredMutation.promise;
    const suspension = composition.identity.setMembershipStateForTest(
      parseUserId("usr_owner_alpha"),
      demoApiCredentials.owner.workspaceId,
      "suspended",
    );
    await Promise.resolve();
    releaseMutation.resolve();

    const response = await request;
    await suspension;
    expect(response.statusCode).toBe(201);
    expect(membershipObservedInsideMutation).toEqual(
      expect.objectContaining({ workspaceId: demoApiCredentials.owner.workspaceId }),
    );

    const deniedAfterCommit = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${response.json<MutationSuccessEnvelope>().data.entity_id}`,
      headers: ownerHeaders(),
    });
    expect(deniedAfterCommit.statusCode).toBe(404);
  });

  it("revalidates target membership inside the context-switch transaction", async () => {
    const identityBefore = composition.identity.snapshot();
    const paused = pauseAfterSuccessfulAuthentication(composition);
    await app.close();
    app = paused.app;

    const request = app.inject({
      method: "POST",
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
        "idempotency-key": "race-context-membership",
      },
      payload: buildSwitchWorkspaceContextBody({
        expected_version: 1,
        workspace_id: demoApiCredentials.owner.workspaceId,
      }),
    });
    await paused.authenticated;
    await composition.identity.setMembershipStateForTest(
      parseUserId("usr_owner_alpha"),
      demoApiCredentials.owner.workspaceId,
      "suspended",
    );
    paused.release();
    const response = await request;

    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    const identityAfter = composition.identity.snapshot();
    expect(identityAfter.sessions).toEqual(identityBefore.sessions);
    expect(identityAfter.auditEvents).toEqual(identityBefore.auditEvents);
    expect(identityAfter.outboxEvents).toEqual(identityBefore.outboxEvents);
    expect(identityAfter.mutationIdempotencyEntryCount).toBe(
      identityBefore.mutationIdempotencyEntryCount,
    );
  });

  it("revalidates session revocation inside context switch and /me reads", async () => {
    const pausedContext = pauseAfterSuccessfulAuthentication(composition);
    await app.close();
    app = pausedContext.app;
    const contextRequest = app.inject({
      method: "POST",
      url: apiRoutes.switchWorkspaceContext,
      headers: {
        authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
        "idempotency-key": "race-context-revocation",
      },
      payload: buildSwitchWorkspaceContextBody({
        expected_version: 1,
        workspace_id: demoApiCredentials.owner.workspaceId,
      }),
    });
    await pausedContext.authenticated;
    await composition.identity.revoke(
      demoApiCredentials.owner.accessToken,
      buildSessionRevokeBody({
        expected_version: 1,
        session_id: demoApiCredentials.owner.sessionId,
      }),
      {
        idempotencyKey: "race-revoke-before-context",
        correlationId: deterministicId(idPrefixes.correlation, 41),
      },
    );
    pausedContext.release();
    const contextResponse = await contextRequest;
    expect(contextResponse.statusCode).toBe(403);
    expect(contextResponse.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    const meAfterRevocation = await app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    expect(meAfterRevocation.statusCode).toBe(403);
  });

  it("prevents a /me response when revocation wins after initial authentication", async () => {
    const paused = pauseAfterSuccessfulAuthentication(composition);
    await app.close();
    app = paused.app;
    const request = app.inject({
      method: "GET",
      url: apiRoutes.me,
      headers: { authorization: `Bearer ${demoApiCredentials.owner.accessToken}` },
    });
    await paused.authenticated;
    await composition.identity.revoke(
      demoApiCredentials.owner.accessToken,
      buildSessionRevokeBody({
        expected_version: 1,
        session_id: demoApiCredentials.owner.sessionId,
      }),
      {
        idempotencyKey: "race-revoke-before-me-read",
        correlationId: deterministicId(idPrefixes.correlation, 42),
      },
    );
    paused.release();

    const response = await request;
    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
  });

  it("maps body and command-header validation to the canonical VALIDATION envelope", async () => {
    const invalidBody = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-invalid-body-01"),
      payload: { expected_version: 0, draft: { applicant_scope: "everyone" } },
    });
    expect(invalidBody.statusCode).toBe(422);
    expect(invalidBody.json<ErrorEnvelope>()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: expect.any(Array) },
      meta: { server_time: fixedTimestamp, correlation_id: expect.stringMatching(/^cor_/) },
    });

    const contradictoryScope = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-contradictory-scope-01"),
      payload: {
        expected_version: 0,
        draft: {
          applicant_scope: "team",
          allowed_applicant_types: ["individual"],
        },
      },
    });
    expect(contradictoryScope.statusCode).toBe(422);
    expect(contradictoryScope.json<ErrorEnvelope>()).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fields: [expect.objectContaining({ code: "derived_value" })],
      },
    });

    const missingKey = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders(),
      payload: buildCreateChallengeBody(),
    });
    expect(missingKey.statusCode).toBe(422);
    expect(missingKey.json<ErrorEnvelope>().error).toMatchObject({
      code: "VALIDATION",
      fields: [{ path: "Idempotency-Key", code: "required" }],
    });

    for (const [idempotencyKey, code] of [
      ["short", "minLength"],
      ["x".repeat(201), "maxLength"],
    ] as const) {
      const invalidKey = await app.inject({
        method: "POST",
        url: apiRoutes.challenges,
        headers: ownerHeaders(idempotencyKey),
        payload: buildCreateChallengeBody(),
      });
      expect(invalidKey.statusCode).toBe(422);
      expect(invalidKey.json<ErrorEnvelope>().error).toMatchObject({
        code: "VALIDATION",
        fields: [{ path: "Idempotency-Key", code }],
      });
    }

    const unsafeMoney = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders("challenge-unsafe-money-01"),
      payload: buildCreateChallengeBody({
        draft: {
          budget: {
            status: "fixed",
            amount_minor: Number.MAX_SAFE_INTEGER + 1,
            currency: "IRR",
          },
        },
      }),
    });
    expect(unsafeMoney.statusCode).toBe(422);
    expect(unsafeMoney.json<ErrorEnvelope>().error.code).toBe("VALIDATION");
  });

  it("refuses the demo composition in production or without explicit demo mode", () => {
    expect(() => createDemoApiComposition({ mode: "demo", nodeEnv: "production" })).toThrow(
      "demo-only",
    );
    expect(() => createDemoApiComposition({ mode: undefined, nodeEnv: "development" })).toThrow(
      "demo-only",
    );
  });
});

describe("organization challenge list", () => {
  let app: FastifyInstance;
  let composition: ReturnType<typeof createDemoApiComposition>;

  beforeEach(() => {
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test" });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  const createDraft = async (key: string, title: string) => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.challenges,
      headers: ownerHeaders(key),
      payload: buildCreateChallengeBody({
        draft: buildChallengeContentResource({ title, category: "energy" }),
      }),
    });
    expect(created.statusCode).toBe(201);
    return created.json<MutationSuccessEnvelope>().data.entity_id;
  };

  const list = (query = "", headers = ownerHeaders()) =>
    app.inject({ method: "GET", url: `${apiRoutes.challenges}${query}`, headers });

  it("returns the workspace's own challenges, newest first, with narrow rows", async () => {
    await createDraft("list-first", "قدیمی‌ترین پرونده");
    const newest = await createDraft("list-second", "تازه‌ترین پرونده");

    const response = await list();

    expect(response.statusCode).toBe(200);
    const page = response.json<ChallengePageSuccessEnvelope>();
    expect(page.data.items).toHaveLength(2);
    expect(page.data.items[0]?.id).toBe(newest);
    expect(page.data.next_cursor).toBeNull();

    // The row is the closed list contract -- no `content`, no contact, no
    // attachment ids. A list is the easiest place for those to arrive unseen.
    expect(Object.keys(page.data.items[0] ?? {}).sort()).toEqual([
      "authoring_status",
      "category",
      "created_at",
      "current_version_id",
      "id",
      "proposal_deadline_at",
      "publication_readiness",
      "publication_state",
      "ready",
      "stage",
      "title",
      "updated_at",
      "version",
    ]);
  });

  it("never lists another workspace's challenges", async () => {
    const alpha = await createDraft("list-scope-alpha", "پرونده آلفا");

    const foreign = await list("", {
      authorization: `Bearer ${demoApiCredentials.foreignOwner.accessToken}`,
      "x-workspace-id": demoApiCredentials.foreignOwner.workspaceId,
    });

    // Beta has its own seeded challenge, so an empty page would prove nothing.
    // What must hold is that alpha's row is absent and every row beta sees is
    // its own.
    expect(foreign.statusCode).toBe(200);
    const items = foreign.json<ChallengePageSuccessEnvelope>().data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((item) => item.id)).not.toContain(alpha);

    const alphaItems = (await list()).json<ChallengePageSuccessEnvelope>().data.items;
    expect(alphaItems.map((item) => item.id)).toContain(alpha);
    expect(alphaItems.map((item) => item.id)).not.toContain(items[0]?.id);
  });

  it("filters by stage without leaking challenges at other stages", async () => {
    await createDraft("list-stage-draft", "پیش‌نویس");

    const drafts = await list("?stage=draft");
    const published = await list("?stage=published");

    expect(drafts.json<ChallengePageSuccessEnvelope>().data.items).toHaveLength(1);
    expect(published.json<ChallengePageSuccessEnvelope>().data.items).toEqual([]);
  });

  it("rejects an unreadable cursor and an unknown stage rather than ignoring them", async () => {
    expect((await list("?cursor=not-a-cursor")).statusCode).toBe(422);
    expect((await list("?stage=evaluating")).statusCode).toBe(422);
  });

  it("refuses a caller with no session and one outside an org workspace", async () => {
    expect((await app.inject({ method: "GET", url: apiRoutes.challenges })).statusCode).toBe(403);

    const platform = await list("", {
      authorization: `Bearer ${demoApiCredentials.platformOps.accessToken}`,
      "x-workspace-id": demoApiCredentials.platformOps.workspaceId,
    });
    expect(platform.statusCode).toBe(403);
  });
});

describe("in-memory challenge transaction", () => {
  it("binds a reused tenant command key to the actor and workspace fingerprint", async () => {
    const repository = new InMemoryChallengeRepository(clock, new MonotonicIdFactory());
    const tenantId = deterministicId(idPrefixes.tenant, 20);
    const actorUserId = deterministicId(idPrefixes.user, 20);
    const idempotencyKey = "same-tenant-two-workspaces";
    const firstContext = {
      tenantId,
      workspaceId: deterministicId(idPrefixes.workspace, 20),
      actorUserId,
      role: "org:owner" as const,
      idempotencyKey,
      correlationId: deterministicId(idPrefixes.correlation, 20),
    };

    await repository.create(buildCreateChallengeBody(), firstContext);
    const afterFirst = repository.snapshot();

    await expect(
      repository.create(buildCreateChallengeBody(), {
        ...firstContext,
        workspaceId: deterministicId(idPrefixes.workspace, 21),
        correlationId: deterministicId(idPrefixes.correlation, 21),
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    await expect(
      repository.create(buildCreateChallengeBody(), {
        ...firstContext,
        actorUserId: deterministicId(idPrefixes.user, 21),
        correlationId: deterministicId(idPrefixes.correlation, 22),
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(repository.snapshot()).toEqual(afterFirst);
  });

  it("rolls back aggregate, audit, outbox, and idempotency together on commit failure", async () => {
    const repository = new InMemoryChallengeRepository(clock, new MonotonicIdFactory(), () => {
      throw new Error("commit failed");
    });

    await expect(
      repository.create(buildCreateChallengeBody(), {
        tenantId: deterministicId(idPrefixes.tenant, 10),
        workspaceId: deterministicId(idPrefixes.workspace, 10),
        actorUserId: deterministicId(idPrefixes.user, 10),
        role: "org:owner",
        idempotencyKey: "atomic-create-0001",
        correlationId: deterministicId(idPrefixes.correlation, 10),
      }),
    ).rejects.toThrow("commit failed");

    expect(repository.snapshot()).toEqual({
      challenges: [],
      versions: [],
      publicProjections: [],
      approvals: [],
      auditEvents: [],
      outboxEvents: [],
      idempotencyEntryCount: 0,
    });
  });

  async function createChallengeAtApprovals(repository: InMemoryChallengeRepository, seed: number) {
    const tenantId = deterministicId(idPrefixes.tenant, seed);
    const workspaceId = deterministicId(idPrefixes.workspace, seed);
    const base = {
      tenantId,
      workspaceId,
      actorUserId: deterministicId(idPrefixes.user, seed),
      role: "org:owner" as const,
      correlationId: deterministicId(idPrefixes.correlation, seed),
    };
    const created = await repository.create(
      buildCreateChallengeBody({ draft: buildChallengeContentResource() }),
      { ...base, idempotencyKey: `b2-setup-create-${seed}` },
    );
    const challengeId = created.receipt.entity_id;
    await repository.transition(
      challengeId,
      "request-triage",
      { expected_version: 1 },
      { ...base, idempotencyKey: `b2-setup-triage-${seed}` },
    );
    await repository.transition(
      challengeId,
      "advance-formulation",
      { expected_version: 2 },
      { ...base, idempotencyKey: `b2-setup-formulation-${seed}` },
    );
    await repository.transition(
      challengeId,
      "request-approvals",
      { expected_version: 3 },
      { ...base, idempotencyKey: `b2-setup-approvals-${seed}` },
    );
    return { challengeId, tenantId, workspaceId };
  }

  it("enforces separation of duty and rejects a duplicate gate on one version", async () => {
    const repository = new InMemoryChallengeRepository(clock, new MonotonicIdFactory());
    const { challengeId, tenantId, workspaceId } = await createChallengeAtApprovals(repository, 40);
    const actorA = deterministicId(idPrefixes.user, 41);
    const actorB = deterministicId(idPrefixes.user, 42);
    const base = {
      tenantId,
      workspaceId,
      correlationId: deterministicId(idPrefixes.correlation, 40),
    };

    const recorded = await repository.recordApproval(
      challengeId,
      { expected_version: 4, gate: "technical", decision: "approved", reason: "بررسی فنی." },
      {
        ...base,
        actorUserId: actorA,
        role: "org:approver_technical",
        idempotencyKey: "b2-conflict-technical",
      },
    );
    expect(recorded.entityVersion).toBe(1);

    await expect(
      repository.recordApproval(
        challengeId,
        { expected_version: 4, gate: "technical", decision: "approved", reason: "بررسی دوباره." },
        {
          ...base,
          actorUserId: actorB,
          role: "org:approver_technical",
          idempotencyKey: "b2-conflict-technical-again",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });

    await expect(
      repository.recordApproval(
        challengeId,
        { expected_version: 4, gate: "quality", decision: "approved", reason: "بررسی کیفیت." },
        {
          ...base,
          actorUserId: actorA,
          role: "platform:ops",
          idempotencyKey: "b2-conflict-second-gate",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });

    const snapshot = repository.snapshot();
    expect(
      snapshot.approvals.filter((approval) => approval.challenge_id === challengeId),
    ).toHaveLength(1);
  });

  it("rejects a gate recording before the challenge reaches the approvals stage", async () => {
    const repository = new InMemoryChallengeRepository(clock, new MonotonicIdFactory());
    const tenantId = deterministicId(idPrefixes.tenant, 50);
    const workspaceId = deterministicId(idPrefixes.workspace, 50);
    const created = await repository.create(
      buildCreateChallengeBody({ draft: buildChallengeContentResource() }),
      {
        tenantId,
        workspaceId,
        actorUserId: deterministicId(idPrefixes.user, 50),
        role: "org:owner",
        correlationId: deterministicId(idPrefixes.correlation, 50),
        idempotencyKey: "b2-wrong-stage-create",
      },
    );

    await expect(
      repository.recordApproval(
        created.receipt.entity_id,
        { expected_version: 1, gate: "technical", decision: "approved", reason: "زودهنگام." },
        {
          tenantId,
          workspaceId,
          actorUserId: deterministicId(idPrefixes.user, 51),
          role: "org:approver_technical",
          correlationId: deterministicId(idPrefixes.correlation, 50),
          idempotencyKey: "b2-wrong-stage-record",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATE" });
  });

  it("rejects a gate recording from a role that is not eligible for that gate", async () => {
    const repository = new InMemoryChallengeRepository(clock, new MonotonicIdFactory());
    const { challengeId, tenantId, workspaceId } = await createChallengeAtApprovals(repository, 60);

    await expect(
      repository.recordApproval(
        challengeId,
        { expected_version: 4, gate: "quality", decision: "approved", reason: "نامعتبر." },
        {
          tenantId,
          workspaceId,
          actorUserId: deterministicId(idPrefixes.user, 61),
          role: "org:owner",
          correlationId: deterministicId(idPrefixes.correlation, 60),
          idempotencyKey: "b2-wrong-role",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "NO_ACCESS" });
  });

  it("rolls back session, audit, outbox, OIDC consumption, and idempotency on commit failure", async () => {
    const failingComposition = createDemoApiComposition({
      mode: "demo",
      nodeEnv: "test",
      clock,
      identityBeforeCommit: () => {
        throw new Error("identity commit failed");
      },
    });
    const identityBefore = failingComposition.identity.snapshot();
    const decisionAuditBefore = failingComposition.decisionAudit.snapshot();

    await expect(
      failingComposition.identity.exchange(exchangeBody(), {
        idempotencyKey: "atomic-exchange-0001",
        correlationId: deterministicId(idPrefixes.correlation, 30),
      }),
    ).rejects.toThrow("identity commit failed");

    expect(failingComposition.identity.snapshot()).toEqual(identityBefore);
    expect(failingComposition.decisionAudit.snapshot()).toEqual(decisionAuditBefore);
  });
});
