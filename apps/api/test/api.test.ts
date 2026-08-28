import {
  apiRoutes,
  type ErrorEnvelope,
  type MutationSuccessEnvelope,
  type SessionSuccessEnvelope,
  type SuccessEnvelope,
  type ChallengeResource,
  type MeResource,
} from "@rahhal/contracts";
import {
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
    expect(composition.identity.snapshot().sessions).toHaveLength(4);
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
    expect(snapshot.sessions).toHaveLength(4);
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
        patch: (id, body, context) => challenges.patch(id, body, context),
        transition: (id, command, body, context) =>
          challenges.transition(id, command, body, context),
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
      auditEvents: [],
      outboxEvents: [],
      idempotencyEntryCount: 0,
    });
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
