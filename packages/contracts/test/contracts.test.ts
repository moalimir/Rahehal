import { describe, expect, expectTypeOf, it } from "vitest";

import {
  apiErrorCodes,
  apiRoutes,
  apiSchemas,
  isOutboxEvent,
  openApiDocument,
  type ApiError,
  type ApiErrorCode,
  type CreateChallengeBody,
  type ErrorEnvelope,
  type PatchChallengeBody,
  type OutboxEvent,
  type OidcAuthorizationStartBody,
  type SessionExchangeBody,
  type SuccessEnvelope,
} from "../src/index.js";

describe("authoritative API contracts", () => {
  it("keeps access denial, absence, and step-up as distinct stable codes", () => {
    expect(apiErrorCodes).toContain("NO_ACCESS");
    expect(apiErrorCodes).toContain("NOT_FOUND");
    expect(apiErrorCodes).toContain("STEP_UP_REQUIRED");
    expect(new Set(apiErrorCodes).size).toBe(apiErrorCodes.length);
    expectTypeOf<ApiError["code"]>().toEqualTypeOf<ApiErrorCode>();
  });

  it("carries optimistic concurrency in every implemented command body", () => {
    expect(apiSchemas.OidcAuthorizationStartBody.required).toContain("expected_version");
    expect(apiSchemas.SessionExchangeBody.required).toContain("expected_version");
    expect(apiSchemas.SessionRefreshBody.required).toContain("expected_version");
    expect(apiSchemas.SessionRevokeBody.required).toContain("expected_version");
    expect(apiSchemas.SwitchWorkspaceContextBody.required).toContain("expected_version");
    expect(apiSchemas.CreateChallengeBody.required).toContain("expected_version");
    expect(apiSchemas.PatchChallengeBody.required).toContain("expected_version");
    expect(apiSchemas.ChallengeTransitionBody.required).toContain("expected_version");

    expectTypeOf<CreateChallengeBody["expected_version"]>().toEqualTypeOf<0>();
    expectTypeOf<PatchChallengeBody["expected_version"]>().toEqualTypeOf<number>();
    expectTypeOf<SessionExchangeBody["state"]>().toEqualTypeOf<string>();
    expectTypeOf<OidcAuthorizationStartBody["expected_version"]>().toEqualTypeOf<0>();
  });

  it("defines the complete canonical mutation receipt", () => {
    expect(apiSchemas.MutationReceipt.required).toEqual([
      "entity_id",
      "receipt_id",
      "audit_event_id",
      "timestamp",
      "idempotent",
      "next_actions",
    ]);
    expect(apiSchemas.VersionedApiMeta.required).toContain("entity_version");
  });

  it("publishes the exact Phase 1 routes as OpenAPI 3.1", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(Object.keys(openApiDocument.paths)).toEqual(
      expect.arrayContaining([
        apiRoutes.openApi,
        apiRoutes.oidcAuthorizationStart,
        apiRoutes.sessionExchange,
        apiRoutes.sessionRefresh,
        apiRoutes.sessionRevoke,
        apiRoutes.me,
        apiRoutes.switchWorkspaceContext,
        apiRoutes.challenges,
        apiRoutes.challengeById,
        apiRoutes.requestChallengeTriage,
        apiRoutes.advanceChallengeFormulation,
        apiRoutes.requestChallengeApprovals,
        apiRoutes.platformChallengeApprovalQueue,
        apiRoutes.platformChallengeApprovalBrief,
      ]),
    );

    const createOperation = openApiDocument.paths[apiRoutes.challenges].post;
    expect(createOperation.parameters.map((parameter) => parameter.name)).toEqual([
      "X-Workspace-Id",
      "Idempotency-Key",
    ]);
    expect(apiSchemas.ChallengeResource.required).toEqual(
      expect.arrayContaining(["version", "content_version", "readiness"]),
    );
  });

  it("keeps the platform approval brief structurally narrower than the org aggregate", () => {
    const properties = Object.keys(apiSchemas.ChallengeApprovalBrief.properties.content.properties);
    expect(properties).not.toContain("contact");
    expect(properties).not.toContain("invitees");
    expect(properties).not.toContain("attachment_ids");
    expect(apiSchemas.ChallengeApprovalBrief.properties).not.toHaveProperty("tenant_id");
    expect(apiSchemas.ChallengeApprovalBrief.properties).not.toHaveProperty("created_by");
  });

  it("keeps transport contracts language-neutral", () => {
    expect(JSON.stringify({ apiSchemas, openApiDocument })).not.toMatch(/[\u0600-\u06ff]/u);
    expectTypeOf<SuccessEnvelope<{ value: string }> | ErrorEnvelope>().toMatchTypeOf<{
      ok: boolean;
    }>();
  });

  it("publishes every canonical workspace kind, including the operator workspace", () => {
    expect(
      apiSchemas.WorkspaceResource.oneOf.map((schema) => schema.properties.kind.const),
    ).toEqual(["platform", "org", "individual", "team"]);
  });

  it("validates untrusted outbox records at runtime", () => {
    const valid = {
      event_id: "evt_00000001",
      event_type: "challenge.draft.updated",
      schema_version: 1,
      aggregate_type: "challenge",
      aggregate_id: "chl_00000001",
      tenant_id: "ten_00000001",
      correlation_id: "cor_00000001",
      occurred_at: "2026-01-01T00:00:00.000Z",
      payload: { entity_version: 2 },
    };

    expect(isOutboxEvent(valid)).toBe(true);
    expect(isOutboxEvent({ ...valid, schema_version: 2 })).toBe(true);
    expect(isOutboxEvent({ ...valid, event_id: "not-an-event-id" })).toBe(false);
    expect(isOutboxEvent({ ...valid, aggregate_id: "aud_00000001" })).toBe(false);
    expect(isOutboxEvent({ ...valid, aggregate_id: "evt_00000002" })).toBe(false);
    expect(isOutboxEvent({ ...valid, occurred_at: "yesterday" })).toBe(false);
    expect(isOutboxEvent({ ...valid, payload: undefined })).toBe(false);
    expect(isOutboxEvent({ ...valid, unexpected: true })).toBe(false);

    const candidate: unknown = valid;
    if (!isOutboxEvent(candidate)) throw new Error("valid event did not narrow");
    expectTypeOf(candidate).toEqualTypeOf<OutboxEvent>();
  });
});
