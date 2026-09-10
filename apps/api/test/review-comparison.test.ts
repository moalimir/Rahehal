import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  reviewComparisonApiRoutes,
  type ChallengeReviewComparisonResource,
  type ChallengeReviewComparisonSuccessEnvelope,
  type ErrorEnvelope,
} from "@rahhal/contracts";
import {
  parseChallengeVersionId,
  parseProposalId,
  parseProposalVersionId,
  parseRubricVersionId,
} from "@rahhal/domain";

import { buildApi } from "../src/app.js";
import {
  createDemoApiComposition,
  demoApiCredentials,
  demoPublishedChallengeId,
} from "../src/demo-composition.js";

let composition: ReturnType<typeof createDemoApiComposition>;
let app: ReturnType<typeof buildApi>;
const path = reviewComparisonApiRoutes.challengeReviewComparison.replace(
  "{challengeId}",
  demoPublishedChallengeId,
);
const headers = (key: "owner" | "reviewer" = "owner") => ({
  authorization: `Bearer ${demoApiCredentials[key].accessToken}`,
  "x-workspace-id": demoApiCredentials[key].workspaceId,
});

const comparison: ChallengeReviewComparisonResource = {
  challenge_id: demoPublishedChallengeId,
  challenge_version_id: parseChallengeVersionId("chv_comparison_alpha_001"),
  rubric_version_id: parseRubricVersionId("rbv_comparison_alpha_001"),
  required_reviews: 2,
  proposal_count: 1,
  completed_proposal_count: 1,
  scores_released: true,
  criteria: [{ id: "quality", label: "Quality", weight: 100, min: 0, max: 5 }],
  proposals: [
    {
      proposal_id: parseProposalId("prp_comparison_alpha_001"),
      proposal_version_id: parseProposalVersionId("prv_comparison_alpha_001"),
      tracking_code: "PRP-2026-901",
      status: "complete",
      active_assignment_count: 2,
      locked_review_count: 2,
      cancelled_assignment_count: 1,
      invalidated_review_count: 1,
      score_summary: {
        average_weighted_score_tenths: 800,
        criteria: [{ criterion_id: "quality", average_score_tenths: 40 }],
      },
    },
  ],
  version: 9,
};

beforeEach(() => {
  composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test" });
  const unavailable = composition.ports.evaluations;
  app = buildApi({
    ...composition.ports,
    evaluations: {
      get: unavailable.get.bind(unavailable),
      open: unavailable.open.bind(unavailable),
      async comparison() {
        return comparison;
      },
    },
  });
});

afterEach(async () => {
  await app?.close();
});

describe("D7 review comparison boundary", () => {
  it("returns only aggregate completeness and scores to an organization decision actor", async () => {
    const response = await app.inject({ url: path, headers: headers() });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json<ChallengeReviewComparisonSuccessEnvelope>()).toMatchObject({
      data: comparison,
      meta: { entity_version: 9 },
    });
    const serialized = JSON.stringify(response.json().data);
    expect(serialized).not.toMatch(/reviewer|rationale|solver|workspace|user_id/);
  });

  it("denies reviewers and keeps the demo runtime explicitly unavailable", async () => {
    const denied = await app.inject({ url: path, headers: headers("reviewer") });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    const demoApp = buildApi(composition.ports);
    try {
      const unavailable = await demoApp.inject({ url: path, headers: headers() });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json<ErrorEnvelope>().error.code).toBe("STORAGE");
    } finally {
      await demoApp.close();
    }
  });
});
