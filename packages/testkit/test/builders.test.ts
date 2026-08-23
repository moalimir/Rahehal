import { describe, expect, it } from "vitest";

import { idPrefixes, isChallengeId } from "@rahhal/domain";

import {
  buildChallengeDraft,
  buildChallengeResource,
  buildErrorEnvelope,
  buildMutationSuccess,
  buildOutboxEvent,
  buildSessionExchangeBody,
  createDeterministicClock,
  createDeterministicIdFactory,
  deterministicId,
} from "../src/index.js";

describe("deterministic test builders", () => {
  it("returns stable defaults without clock or randomness dependencies", () => {
    expect(buildChallengeDraft()).toEqual(buildChallengeDraft());
    expect(buildChallengeResource()).toEqual(buildChallengeResource());
    expect(isChallengeId(buildChallengeResource().id)).toBe(true);
  });

  it("supports explicit overrides without mutating canonical defaults", () => {
    const draft = buildChallengeDraft({
      version: 4,
      content: {
        title: "Overridden title",
        applicantScope: "both",
        allowedApplicantTypes: ["company"],
      },
    });
    expect(draft.version).toBe(4);
    expect(draft.content.title).toBe("Overridden title");
    expect(draft.content.applicantScope).toBe("team");
    expect(draft.content.budget.currency).toBe("IRR");
  });

  it("provides isolated deterministic sequences", () => {
    const firstFactory = createDeterministicIdFactory(10);
    const secondFactory = createDeterministicIdFactory(10);
    expect(firstFactory.next(idPrefixes.user)).toBe(secondFactory.next(idPrefixes.user));
    expect(firstFactory.next(idPrefixes.user)).not.toBe(deterministicId(idPrefixes.user, 10));

    const clock = createDeterministicClock("2026-01-01T00:00:00.000Z", 500);
    expect(clock.now()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now()).toBe("2026-01-01T00:00:00.500Z");
  });

  it("builds complete canonical success and error envelopes", () => {
    const entityId = deterministicId(idPrefixes.challenge);
    const success = buildMutationSuccess({ entity_id: entityId, next_actions: ["edit"] });
    const failure = buildErrorEnvelope({ code: "STEP_UP_REQUIRED" });

    expect(success.data.entity_id).toBe(entityId);
    expect(success.meta.entity_version).toBe(1);
    expect(failure.error.code).toBe("STEP_UP_REQUIRED");
    expect(failure.meta.correlation_id).toMatch(/^cor_/u);
    expect(buildSessionExchangeBody().expected_version).toBe(0);
    expect(buildOutboxEvent({ changed_fields: ["title"] })).toMatchObject({
      event_type: "challenge.draft.updated",
      schema_version: 1,
    });
  });
});
