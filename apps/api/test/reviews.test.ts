import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apiRoutes,
  reviewCoiApiRoutes,
  reviewScoringApiRoutes,
  type ErrorEnvelope,
  type ReviewAssignmentListSuccessEnvelope,
  type ReviewAssignmentSuccessEnvelope,
} from "@rahhal/contracts";
import {
  parseMembershipId,
  parseReviewAssignmentId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { buildApi } from "../src/app.js";
import { createDemoApiComposition, demoApiCredentials } from "../src/demo-composition.js";
import { InMemoryReviewAdapter, type DemoReviewAssignment } from "../src/in-memory-reviews.js";
import type { ReviewerScope } from "../src/ports.js";

const scope = (suffix: string): ReviewerScope => ({
  tenantId: parseTenantId("ten_platform"),
  workspaceId: parseWorkspaceId("wsp_platform_main"),
  actorUserId: parseUserId(`usr_reviewer_${suffix}`),
  membershipId: parseMembershipId(`mem_reviewer_${suffix}`),
  role: "platform:reviewer",
});
const assignment = (id: string, reviewer: string): DemoReviewAssignment => ({
  id: parseReviewAssignmentId(id),
  scope: scope(reviewer),
  state: "coi-gate",
  coi_status: "pending",
  due_at: "2027-01-01T00:00:00.000Z",
  version: 1,
});
const headers = (
  key: "reviewer" | "otherReviewer" | "owner" | "solver" | "platformOps" = "reviewer",
) => ({
  authorization: `Bearer ${demoApiCredentials[key].accessToken}`,
  "x-workspace-id": demoApiCredentials[key].workspaceId,
});
let composition: ReturnType<typeof createDemoApiComposition>;
let app: ReturnType<typeof buildApi>;
beforeEach(() => {
  composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test" });
  app = buildApi({
    ...composition.ports,
    reviews: new InMemoryReviewAdapter([
      assignment("rva_alpha_001", "alpha"),
      assignment("rva_alpha_002", "alpha"),
      assignment("rva_beta_001", "beta"),
    ]),
  });
});
afterEach(async () => {
  await app?.close();
});

describe("D1 reviewer boundary", () => {
  it("returns a real empty queue for a newly provisioned reviewer", async () => {
    const emptyApp = buildApi(composition.ports);
    try {
      const response = await emptyApp.inject({
        url: apiRoutes.reviewAssignments,
        headers: headers(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<ReviewAssignmentListSuccessEnvelope>().data).toEqual({ items: [] });
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await emptyApp.close();
    }
  });
  it("scopes pages to the exact human membership inside a shared platform workspace", async () => {
    const first = await app.inject({
      url: `${apiRoutes.reviewAssignments}?limit=1`,
      headers: headers(),
    });
    const page = first.json<ReviewAssignmentListSuccessEnvelope>().data;
    expect(first.statusCode).toBe(200);
    expect(page.items.map((row) => row.id)).toEqual(["rva_alpha_001"]);
    expect(page.next_cursor).toBe("rva_alpha_001");
    expect(Object.keys(page.items[0]!).sort()).toEqual([
      "coi_declaration",
      "coi_status",
      "due_at",
      "id",
      "overdue",
      "pre_coi_packet",
      "state",
      "version",
    ]);
    const next = await app.inject({
      url: `${apiRoutes.reviewAssignments}?limit=1&cursor=${page.next_cursor}`,
      headers: headers(),
    });
    expect(next.json<ReviewAssignmentListSuccessEnvelope>().data).toMatchObject({
      items: [{ id: "rva_alpha_002" }],
    });
    expect(next.json<ReviewAssignmentListSuccessEnvelope>().data.next_cursor).toBeUndefined();
    const beta = await app.inject({
      url: apiRoutes.reviewAssignments,
      headers: headers("otherReviewer"),
    });
    expect(
      beta.json<ReviewAssignmentListSuccessEnvelope>().data.items.map((row) => row.id),
    ).toEqual(["rva_beta_001"]);
  });
  it("returns the same denial for a foreign and missing assignment, including no cache", async () => {
    const results = await Promise.all(
      ["rva_beta_001", "rva_missing_001"].map((id) =>
        app.inject({ url: `${apiRoutes.reviewAssignments}/${id}`, headers: headers() }),
      ),
    );
    for (const response of results) {
      expect(response.statusCode).toBe(404);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(results[0]!.json<ErrorEnvelope>().error).toEqual(
      results[1]!.json<ErrorEnvelope>().error,
    );
    expect(
      composition.decisionAudit
        .snapshot()
        .filter((event) => event.action === "review-assignment:read")
        .map((event) => event.outcome),
    ).toEqual(["denied", "denied"]);
  });
  it("reads only bookkeeping before COI and exposes no material or scoring endpoint", async () => {
    const response = await app.inject({
      url: `${apiRoutes.reviewAssignments}/rva_alpha_001`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<ReviewAssignmentSuccessEnvelope>().data).toEqual({
      id: "rva_alpha_001",
      state: "coi-gate",
      coi_status: "pending",
      pre_coi_packet: {
        organization_name: "سازمان نمایشی",
        challenge_title: "چالش نمایشی",
      },
      coi_declaration: {
        status: "pending",
        relationship_categories: [],
        reason: null,
        declared_at: null,
      },
      due_at: "2027-01-01T00:00:00.000Z",
      overdue: false,
      version: 1,
    });
    const materials = await app.inject({
      url: reviewCoiApiRoutes.reviewAssignmentMaterials.replace("{assignmentId}", "rva_alpha_001"),
      headers: headers(),
    });
    expect(materials.statusCode).toBe(503);
    expect(materials.json<ErrorEnvelope>().error.code).toBe("STORAGE");
    const declaration = await app.inject({
      method: "POST",
      url: reviewCoiApiRoutes.declareReviewCoi.replace("{assignmentId}", "rva_alpha_001"),
      headers: { ...headers(), "idempotency-key": "demo-coi-is-unavailable" },
      payload: {
        expected_version: 1,
        status: "clear",
        relationship_categories: [],
        reason: null,
        attestation: true,
      },
    });
    expect(declaration.statusCode).toBe(503);
    expect(declaration.json<ErrorEnvelope>().error.code).toBe("STORAGE");
    const draft = await app.inject({
      method: "POST",
      url: reviewScoringApiRoutes.saveReviewDraft.replace("{assignmentId}", "rva_alpha_001"),
      headers: { ...headers(), "idempotency-key": "demo-review-draft-unavailable" },
      payload: { expected_version: 1, scores: [] },
    });
    expect(draft.statusCode).toBe(503);
    expect(draft.json<ErrorEnvelope>().error.code).toBe("STORAGE");
  });
  it.each(["owner", "solver", "platformOps"] as const)(
    "denies %s rather than treating a platform role as a reviewer grant",
    async (key) => {
      const response = await app.inject({
        url: apiRoutes.reviewAssignments,
        headers: headers(key),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
    },
  );
  it("rejects anonymous, foreign workspace and removed membership access", async () => {
    expect((await app.inject({ url: apiRoutes.reviewAssignments })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: apiRoutes.reviewAssignments,
          headers: { ...headers(), "x-workspace-id": demoApiCredentials.owner.workspaceId },
        })
      ).statusCode,
    ).toBe(404);
    await composition.identity.setMembershipStateForTest(
      scope("alpha").actorUserId,
      scope("alpha").workspaceId,
      "removed",
    );
    expect(
      (await app.inject({ url: apiRoutes.reviewAssignments, headers: headers() })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: `${apiRoutes.reviewAssignments}/rva_alpha_001`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(404);
  });
  it("denies immediately after revoking the session", async () => {
    const revoked = await app.inject({
      method: "POST",
      url: apiRoutes.sessionRevoke,
      headers: { ...headers(), "idempotency-key": "d1-revoke-reviewer-session" },
      payload: { expected_version: 1, session_id: demoApiCredentials.reviewer.sessionId },
    });
    expect(revoked.statusCode).toBe(200);
    expect(
      (await app.inject({ url: apiRoutes.reviewAssignments, headers: headers() })).statusCode,
    ).toBe(403);
  });
  it("validates paging/filter inputs and never falls back after a store failure", async () => {
    for (const query of [
      "limit=0",
      "limit=101",
      "cursor=invalid",
      "state=unknown",
      "reviewer_user_id=usr_reviewer_beta",
    ]) {
      expect(
        (await app.inject({ url: `${apiRoutes.reviewAssignments}?${query}`, headers: headers() }))
          .statusCode,
      ).toBe(422);
    }
    const unavailable = buildApi({
      ...composition.ports,
      reviews: {
        async list() {
          throw new Error("store unavailable");
        },
        async get() {
          throw new Error("store unavailable");
        },
        async materials() {
          throw new Error("store unavailable");
        },
        async review() {
          throw new Error("store unavailable");
        },
        async declareCoi() {
          throw new Error("store unavailable");
        },
        async saveDraft() {
          throw new Error("store unavailable");
        },
        async submit() {
          throw new Error("store unavailable");
        },
        async listConflicts() {
          throw new Error("store unavailable");
        },
        async listOperations() {
          throw new Error("store unavailable");
        },
        async create() {
          throw new Error("store unavailable");
        },
        async cancel() {
          throw new Error("store unavailable");
        },
        async replace() {
          throw new Error("store unavailable");
        },
        async lock() {
          throw new Error("store unavailable");
        },
        async invalidate() {
          throw new Error("store unavailable");
        },
      },
    });
    try {
      const response = await unavailable.inject({
        url: apiRoutes.reviewAssignments,
        headers: headers(),
      });
      expect(response.statusCode).toBe(503);
      expect(response.json<ErrorEnvelope>().error.code).toBe("STORAGE");
    } finally {
      await unavailable.close();
    }
  });
  it("exchanges a reviewer identity through the existing OIDC boundary", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.sessionExchange,
      headers: { "idempotency-key": "d1-reviewer-oidc-sign-in" },
      payload: {
        expected_version: 0,
        authorization_code: "demo-oidc-code-reviewer-alpha",
        code_verifier: "demo-code-verifier-reviewer-alpha-0000000000000000",
        redirect_uri: demoApiCredentials.exchange.redirectUri,
        state: "demo-state-reviewer-alpha",
      },
    });
    expect(response.statusCode).toBe(200);
    const token = response.json<{ data: { tokens: { access_token: string } } }>().data.tokens
      .access_token;
    expect(
      (
        await app.inject({
          url: apiRoutes.reviewAssignments,
          headers: { ...headers(), authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("keeps D4 Operations routes unavailable in the demo adapter and denies other roles", async () => {
    const denied = await app.inject({
      url: apiRoutes.operationsReviewAssignments,
      headers: headers("owner"),
    });
    expect(denied.statusCode).toBe(403);

    const unavailable = await app.inject({
      url: apiRoutes.operationsReviewAssignments,
      headers: headers("platformOps"),
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json<ErrorEnvelope>().error.code).toBe("STORAGE");
  });

  it("keeps D6 review evidence commands connected-only and role-scoped", async () => {
    const ownReview = await app.inject({
      url: reviewScoringApiRoutes.reviewAssignmentReview.replace("{assignmentId}", "rva_alpha_001"),
      headers: headers(),
    });
    expect(ownReview.statusCode).toBe(503);
    expect(ownReview.json<ErrorEnvelope>().error.code).toBe("STORAGE");

    const deniedReviewer = await app.inject({
      method: "POST",
      url: reviewScoringApiRoutes.saveReviewDraft.replace("{assignmentId}", "rva_alpha_001"),
      headers: { ...headers("owner"), "idempotency-key": "denied-review-draft" },
      payload: { expected_version: 1, scores: [] },
    });
    expect(deniedReviewer.statusCode).toBe(403);

    const unavailableOps = await app.inject({
      method: "POST",
      url: reviewScoringApiRoutes.lockReview.replace("{assignmentId}", "rva_alpha_001"),
      headers: { ...headers("platformOps"), "idempotency-key": "demo-review-lock-unavailable" },
      payload: { expected_version: 1, reason: "کنترل کامل بودن داوری" },
    });
    expect(unavailableOps.statusCode).toBe(503);
  });
});
