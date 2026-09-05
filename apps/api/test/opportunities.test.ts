import {
  apiRoutes,
  type DirectOfferSuccessEnvelope,
  type ErrorEnvelope,
  type MutationSuccessEnvelope,
  type SavedOpportunityListSuccessEnvelope,
} from "@rahhal/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "../src/app.js";
import {
  createDemoApiComposition,
  demoApiCredentials,
  demoPublishedChallengeId,
  type DemoApiComposition,
} from "../src/demo-composition.js";

const initialTime = "2026-09-03T09:00:00.000Z";
let currentTime = initialTime;
const clock = { now: () => new Date(currentTime) };

function headers(
  credential: { readonly accessToken: string; readonly workspaceId: string },
  idempotencyKey?: string,
) {
  return {
    authorization: `Bearer ${credential.accessToken}`,
    "x-workspace-id": credential.workspaceId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

const offerUrl = (route: string, id: string) => route.replace("{directOfferId}", id);
const challengeUrl = (route: string) => route.replace("{challengeId}", demoPublishedChallengeId);

const createOfferBody = (recipientWorkspaceId: string, deadline = "2026-09-04T09:00:00.000Z") =>
  ({
    expected_version: 0,
    challenge_id: demoPublishedChallengeId,
    challenge_version_id: "chv_published_public_001",
    recipient_workspace_id: recipientWorkspaceId,
    title: "دعوت مستقیم برای پایش هوشمند انرژی",
    summary: "سازمان بتا از این فضای حل‌گر برای ارائه پاسخ مستقیم دعوت می‌کند.",
    invitation_reasons: ["تجربه مرتبط در پایش انرژی"],
    requested_documents: ["رزومه تیم و برنامه اجرای پایلوت"],
    response_deadline: deadline,
  }) as const;

const readyResponse = {
  approach: "راهکار با جمع‌آوری داده‌های کنتور، تحلیل قطعی و بازبینی انسانی در پایلوت اجرا می‌شود.",
  scope: "دامنه کار شامل اتصال نمونه، داشبورد پایش، خط مبنا، آموزش بهره‌بردار و گزارش نهایی است.",
  start_availability: "دو هفته پس از توافق",
  duration_weeks: 12,
  budget_amount_minor: 125_000_000,
  budget_currency: "IRR" as const,
  payment_model: "پرداخت مرحله‌ای",
  negotiables: "تقویم تحویل و دامنه اتصال قابل مذاکره است.",
  authority_confirmed: true,
  attachment_ids: ["fil_offer_response_metadata_001"],
};

describe("C6 authoritative saved opportunities and direct offers", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;

  beforeEach(() => {
    currentTime = initialTime;
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  it("saves and unsaves an exact public challenge projection with replay and version checks", async () => {
    const save = await app.inject({
      method: "POST",
      url: challengeUrl(apiRoutes.saveOpportunity),
      headers: headers(demoApiCredentials.solver, "c6-save-opportunity-0001"),
      payload: { expected_version: 0 },
    });
    expect(save.statusCode).toBe(201);
    const receipt = save.json<MutationSuccessEnvelope>().data;

    const replay = await app.inject({
      method: "POST",
      url: challengeUrl(apiRoutes.saveOpportunity),
      headers: headers(demoApiCredentials.solver, "c6-save-opportunity-0001"),
      payload: { expected_version: 0 },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({ ...receipt, idempotent: true });

    const list = await app.inject({
      method: "GET",
      url: apiRoutes.solverSavedOpportunities,
      headers: headers(demoApiCredentials.solver),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<SavedOpportunityListSuccessEnvelope>().data.items).toEqual([
      expect.objectContaining({
        id: receipt.entity_id,
        challenge_id: demoPublishedChallengeId,
        challenge_version_id: "chv_published_public_001",
        version: 1,
      }),
    ]);

    const stale = await app.inject({
      method: "POST",
      url: challengeUrl(apiRoutes.unsaveOpportunity),
      headers: headers(demoApiCredentials.solver, "c6-unsave-stale-0001"),
      payload: { expected_version: 2 },
    });
    expect(stale.statusCode).toBe(409);

    const unsave = await app.inject({
      method: "POST",
      url: challengeUrl(apiRoutes.unsaveOpportunity),
      headers: headers(demoApiCredentials.solver, "c6-unsave-opportunity-0001"),
      payload: { expected_version: 1 },
    });
    expect(unsave.statusCode).toBe(200);
    expect(unsave.json<MutationSuccessEnvelope>().meta.entity_version).toBe(2);
    expect(composition.opportunities.snapshot().saved).toEqual([]);
  });

  it("carries a two-party offer through response submission and negotiation atomically", async () => {
    const body = createOfferBody(demoApiCredentials.solver.workspaceId);
    const sent = await app.inject({
      method: "POST",
      url: apiRoutes.organizationDirectOffers,
      headers: headers(demoApiCredentials.foreignOwner, "c6-send-offer-0001"),
      payload: body,
    });
    expect(sent.statusCode).toBe(201);
    const firstReceipt = sent.json<MutationSuccessEnvelope>().data;
    const offerId = firstReceipt.entity_id;

    const replay = await app.inject({
      method: "POST",
      url: apiRoutes.organizationDirectOffers,
      headers: headers(demoApiCredentials.foreignOwner, "c6-send-offer-0001"),
      payload: body,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...firstReceipt,
      idempotent: true,
    });

    const received = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.solverDirectOfferById, offerId),
      headers: headers(demoApiCredentials.solver),
    });
    expect(received.statusCode).toBe(200);
    expect(received.json<DirectOfferSuccessEnvelope>().data).toMatchObject({
      id: offerId,
      state: "received",
      version: 1,
      recipient_workspace_id: demoApiCredentials.solver.workspaceId,
      response: null,
    });

    const view = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.viewDirectOffer, offerId),
      headers: headers(demoApiCredentials.solver, "c6-view-offer-0001"),
      payload: { expected_version: 1 },
    });
    expect(view.json<MutationSuccessEnvelope>().meta.entity_version).toBe(2);

    const start = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.startOfferResponse, offerId),
      headers: headers(demoApiCredentials.solver, "c6-start-response-0001"),
      payload: { expected_version: 2 },
    });
    expect(start.statusCode).toBe(200);

    const patch = await app.inject({
      method: "PATCH",
      url: offerUrl(apiRoutes.offerResponse, offerId),
      headers: headers(demoApiCredentials.solver, "c6-patch-response-0001"),
      payload: { expected_version: 3, patch: readyResponse },
    });
    expect(patch.json<MutationSuccessEnvelope>().meta.entity_version).toBe(4);

    const senderCannotReadDraft = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.organizationDirectOfferById, offerId),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(senderCannotReadDraft.json<DirectOfferSuccessEnvelope>().data.response).toBeNull();

    const submit = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.submitOfferResponse, offerId),
      headers: headers(demoApiCredentials.solver, "c6-submit-response-0001"),
      payload: { expected_version: 4 },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json<MutationSuccessEnvelope>().data.next_actions).toEqual([
      "await_organization",
    ]);

    const submitted = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.organizationDirectOfferById, offerId),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json<DirectOfferSuccessEnvelope>().data).toMatchObject({
      state: "response_submitted",
      version: 5,
      response: {
        state: "submitted",
        version: 3,
        content: readyResponse,
        readiness: { ready: true, evaluated_version: 3, issues: [] },
      },
    });

    const negotiating = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.startDirectOfferNegotiation, offerId),
      headers: headers(demoApiCredentials.foreignOwner, "c6-start-negotiation-0001"),
      payload: { expected_version: 5 },
    });
    expect(negotiating.statusCode).toBe(200);
    expect(negotiating.json<MutationSuccessEnvelope>().meta.entity_version).toBe(6);

    const snapshot = composition.opportunities.snapshot();
    expect(snapshot.grants).toHaveLength(2);
    expect(snapshot.grants.every(({ state }) => state === "active")).toBe(true);
    expect(snapshot.auditEvents.map(({ action }) => action)).toEqual([
      "direct-offer.sent",
      "direct-offer.viewed",
      "direct-offer.response.draft.created",
      "direct-offer.response.draft.updated",
      "direct-offer.response.submitted",
      "direct-offer.negotiation.started",
    ]);
    expect(JSON.stringify(snapshot.outboxEvents)).not.toContain(readyResponse.approach);
  });

  it("expires an in-progress response by server time and removes both recipient grants", async () => {
    const sent = await app.inject({
      method: "POST",
      url: apiRoutes.organizationDirectOffers,
      headers: headers(demoApiCredentials.foreignOwner, "c6-send-expiring-0001"),
      payload: createOfferBody(demoApiCredentials.solver.workspaceId, "2026-09-03T09:10:00.000Z"),
    });
    const offerId = sent.json<MutationSuccessEnvelope>().data.entity_id;
    await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.viewDirectOffer, offerId),
      headers: headers(demoApiCredentials.solver, "c6-view-expiring-0001"),
      payload: { expected_version: 1 },
    });
    await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.startOfferResponse, offerId),
      headers: headers(demoApiCredentials.solver, "c6-draft-expiring-0001"),
      payload: { expected_version: 2 },
    });

    currentTime = "2026-09-03T09:10:00.001Z";
    const noLongerReachable = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.solverDirectOfferById, offerId),
      headers: headers(demoApiCredentials.solver),
    });
    expect(noLongerReachable.statusCode).toBe(404);

    const senderView = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.organizationDirectOfferById, offerId),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(senderView.json<DirectOfferSuccessEnvelope>().data).toMatchObject({
      state: "expired",
      version: 4,
      expired_at: currentTime,
    });
    const snapshot = composition.opportunities.snapshot();
    expect(snapshot.grants.every(({ state }) => state === "expired")).toBe(true);
    expect(snapshot.auditEvents.at(-1)?.action).toBe("direct-offer.expired");
  });

  it("lets viewers read team offers but denies drafting, and revokes grants on cancellation", async () => {
    const sent = await app.inject({
      method: "POST",
      url: apiRoutes.organizationDirectOffers,
      headers: headers(demoApiCredentials.foreignOwner, "c6-send-team-offer-0001"),
      payload: createOfferBody(demoApiCredentials.solverTeam.workspaceId),
    });
    const offerId = sent.json<MutationSuccessEnvelope>().data.entity_id;

    const viewerRead = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.solverDirectOfferById, offerId),
      headers: headers(demoApiCredentials.solverTeamViewer),
    });
    expect(viewerRead.statusCode).toBe(200);
    const viewed = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.viewDirectOffer, offerId),
      headers: headers(demoApiCredentials.solverTeamViewer, "c6-view-team-offer-0001"),
      payload: { expected_version: 1 },
    });
    expect(viewed.statusCode).toBe(200);
    const deniedDraft = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.startOfferResponse, offerId),
      headers: headers(demoApiCredentials.solverTeamViewer, "c6-viewer-draft-denied-0001"),
      payload: { expected_version: 2 },
    });
    expect(deniedDraft.statusCode).toBe(404);
    expect(deniedDraft.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");

    const cancelled = await app.inject({
      method: "POST",
      url: offerUrl(apiRoutes.cancelDirectOffer, offerId),
      headers: headers(demoApiCredentials.foreignOwner, "c6-cancel-offer-0001"),
      payload: { expected_version: 2, reason: "نیاز سازمان تغییر کرده است." },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(
      composition.opportunities.snapshot().grants.every(({ state }) => state === "revoked"),
    ).toBe(true);

    const hiddenAfterCancellation = await app.inject({
      method: "GET",
      url: offerUrl(apiRoutes.solverDirectOfferById, offerId),
      headers: headers(demoApiCredentials.solverTeam),
    });
    expect(hiddenAfterCancellation.statusCode).toBe(404);
  });
});
