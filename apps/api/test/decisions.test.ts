import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decisionApiRoutes,
  type ChallengeDecisionResource,
  type ChallengeDecisionSuccessEnvelope,
  type ErrorEnvelope,
  type ProposalOutcomeResource,
} from "@rahhal/contracts";
import {
  parseAuditEventId,
  parseCaseId,
  parseChallengeVersionId,
  parseDecisionId,
  parseDecisionShortlistVersionId,
  parseProposalId,
  parseProposalVersionId,
  parseReceiptId,
  parseRubricVersionId,
} from "@rahhal/domain";

import { buildApi } from "../src/app.js";
import {
  createDemoApiComposition,
  demoApiCredentials,
  demoPublishedChallengeId,
} from "../src/demo-composition.js";
import type { ApiPorts } from "../src/ports.js";

const challengeVersionId = parseChallengeVersionId("chv_decision_alpha_001");
const rubricVersionId = parseRubricVersionId("rbv_decision_alpha_001");
const proposalId = parseProposalId("prp_decision_alpha_001");
const proposalVersionId = parseProposalVersionId("prv_decision_alpha_001");
const shortlistId = parseDecisionShortlistVersionId("dsv_decision_alpha_001");
const caseId = parseCaseId("case_decision_alpha_001");

const resource: ChallengeDecisionResource = {
  challenge_id: demoPublishedChallengeId,
  challenge_version_id: challengeVersionId,
  rubric_version_id: rubricVersionId,
  stage: "evaluating",
  review_complete: true,
  proposals: [
    {
      proposal_id: proposalId,
      proposal_version_id: proposalVersionId,
      tracking_code: "PRP-2026-951",
      locked_review_count: 2,
      shortlisted: true,
      outcome: null,
      feedback: null,
    },
  ],
  shortlist: {
    id: shortlistId,
    version_number: 1,
    proposal_versions: [{ proposal_id: proposalId, proposal_version_id: proposalVersionId }],
    rationale: "Evidence-based shortlist",
    recorded_at: "2026-09-10T08:00:00.000Z",
  },
  decision: null,
  case: null,
  version: 9,
};

const proposalOutcome: ProposalOutcomeResource = {
  proposal_id: proposalId,
  proposal_version_id: proposalVersionId,
  tracking_code: "PRP-2026-951",
  status: "selected",
  feedback: "Clear proposal-specific feedback",
  decided_at: "2026-09-10T08:05:00.000Z",
  case_id: caseId,
  version: 7,
};

function mutation(entityVersion: number) {
  return {
    entityVersion,
    receipt: {
      entity_id: demoPublishedChallengeId,
      receipt_id: parseReceiptId(`rcp_decision_${entityVersion}`),
      audit_event_id: parseAuditEventId(`aud_decision_${entityVersion}`),
      timestamp: "2026-09-10T08:00:00.000Z",
      idempotent: false,
      next_actions: ["decision_complete"] as const,
    },
  };
}

let composition: ReturnType<typeof createDemoApiComposition>;
let app: ReturnType<typeof buildApi>;
let decisions: ApiPorts["decisions"];
let stepUp: ApiPorts["stepUp"];

const ownerHeaders = {
  authorization: `Bearer ${demoApiCredentials.owner.accessToken}`,
  "x-workspace-id": demoApiCredentials.owner.workspaceId,
};

beforeEach(() => {
  composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test" });
  decisions = {
    get: vi.fn(async () => resource),
    saveShortlist: vi.fn(async () => ({
      ...mutation(10),
      receipt: { ...mutation(10).receipt, next_actions: ["reauthenticate_decision"] as const },
    })),
    record: vi.fn(async () => ({
      ...mutation(10),
      receipt: { ...mutation(10).receipt, next_actions: ["open_case"] as const },
    })),
    proposalOutcome: vi.fn(async () => proposalOutcome),
    case: vi.fn(async () => ({
      id: caseId,
      challenge_id: demoPublishedChallengeId,
      challenge_version_id: challengeVersionId,
      proposal_id: proposalId,
      proposal_version_id: proposalVersionId,
      decision_id: parseDecisionId("dec_decision_alpha_001"),
      state: "created" as const,
      created_at: "2026-09-10T08:05:00.000Z",
    })),
  };
  stepUp = {
    start: vi.fn(async () => ({
      authorization_url: "http://localhost:5556/auth?request=decision",
      state: "decision-step-up-state-0000000000000001",
      code_verifier: "decision-step-up-verifier-000000000000000000000000",
      expires_at: "2099-09-10T08:05:00.000Z",
      returnTo: `/app/org/challenges/record/evaluation?id=${demoPublishedChallengeId}`,
    })),
    complete: vi.fn(async () => ({
      token: "decision-step-up-proof-0000000000000001",
      expiresAt: "2099-09-10T08:05:00.000Z",
      returnTo: `/app/org/challenges/record/evaluation?id=${demoPublishedChallengeId}`,
    })),
  };
  app = buildApi(
    { ...composition.ports, decisions, stepUp },
    {
      browserSession: {
        origin: "http://localhost:3000",
        redirectUri: "http://localhost:3000/auth/browser/callback",
        secureCookies: false,
      },
    },
  );
});

afterEach(async () => {
  await app?.close();
});

describe("D8-D9 decision and case HTTP boundary", () => {
  it("serves the exact organization decision projection and denies a reviewer", async () => {
    const path = decisionApiRoutes.challengeDecision.replace(
      "{challengeId}",
      demoPublishedChallengeId,
    );
    const allowed = await app.inject({ url: path, headers: ownerHeaders });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json<ChallengeDecisionSuccessEnvelope>()).toMatchObject({
      data: resource,
      meta: { entity_version: 9 },
    });

    const denied = await app.inject({
      url: path,
      headers: {
        authorization: `Bearer ${demoApiCredentials.reviewer.accessToken}`,
        "x-workspace-id": demoApiCredentials.reviewer.workspaceId,
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
  });

  it("keeps the step-up proof in HttpOnly cookies and binds it to final recording", async () => {
    const start = await app.inject({
      method: "POST",
      url: decisionApiRoutes.browserDecisionStepUpStart.replace(
        "{challengeId}",
        demoPublishedChallengeId,
      ),
      headers: {
        cookie: `rahhal-access=${demoApiCredentials.owner.accessToken}`,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "decision-step-up-start-001",
      },
      payload: { expected_version: 9 },
    });
    expect(start.statusCode).toBe(200);
    const flowCookie = String(start.headers["set-cookie"]);
    expect(flowCookie).toContain("rahhal-step-up-flow=");
    expect(flowCookie).toContain("HttpOnly");
    expect(start.body).not.toContain("code_verifier");
    expect(start.body).not.toContain("state");
    expect(composition.decisionAudit.snapshot()).toContainEqual(
      expect.objectContaining({
        action: "challenge:decision-step-up",
        outcome: "success",
        entityType: "challenge",
        entityId: demoPublishedChallengeId,
      }),
    );

    const callback = await app.inject({
      url: "/auth/browser/callback?code=fresh-login-code&state=decision-step-up-state-0000000000000001",
      headers: {
        cookie: `${flowCookie.split(";", 1)[0]}; rahhal-access=${demoApiCredentials.owner.accessToken}`,
      },
    });
    expect(callback.statusCode).toBe(303);
    const proofCookies = callback.headers["set-cookie"];
    expect(JSON.stringify(proofCookies)).toContain("rahhal-step-up=");
    expect(JSON.stringify(proofCookies)).toContain("HttpOnly");
    expect(callback.headers.location).toContain("stepUp=ready");
    expect(stepUp.complete).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: demoApiCredentials.owner.sessionId }),
      expect.objectContaining({ correlationId: expect.stringMatching(/^cor_/) }),
    );

    const response = await app.inject({
      method: "POST",
      url: decisionApiRoutes.recordDecision.replace("{challengeId}", demoPublishedChallengeId),
      headers: {
        cookie: `rahhal-access=${demoApiCredentials.owner.accessToken}; rahhal-step-up=decision-step-up-proof-0000000000000001`,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "record-final-decision-001",
      },
      payload: {
        expected_version: 9,
        challenge_version_id: challengeVersionId,
        rubric_version_id: rubricVersionId,
        shortlist_version_id: shortlistId,
        outcome: "selected",
        selected_proposal_id: proposalId,
        selected_proposal_version_id: proposalVersionId,
        reason_code: "best_overall_fit",
        rationale: "Final rationale",
        proposal_feedback: [
          {
            proposal_id: proposalId,
            proposal_version_id: proposalVersionId,
            feedback: "Useful feedback",
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.headers["set-cookie"])).toContain("rahhal-step-up=; ");
    expect(decisions.record).toHaveBeenCalledWith(
      demoPublishedChallengeId,
      expect.any(Object),
      expect.objectContaining({
        sessionId: demoApiCredentials.owner.sessionId,
        sessionVersion: 1,
        stepUpToken: "decision-step-up-proof-0000000000000001",
      }),
    );
  });

  it("returns a failed step-up callback to the exact decision page", async () => {
    const start = await app.inject({
      method: "POST",
      url: decisionApiRoutes.browserDecisionStepUpStart.replace(
        "{challengeId}",
        demoPublishedChallengeId,
      ),
      headers: {
        cookie: `rahhal-access=${demoApiCredentials.owner.accessToken}`,
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "x-workspace-id": demoApiCredentials.owner.workspaceId,
        "idempotency-key": "decision-step-up-start-failure-001",
      },
      payload: { expected_version: 9 },
    });
    const flowCookie = String(start.headers["set-cookie"]);
    vi.mocked(stepUp.complete).mockRejectedValueOnce(new Error("synthetic provider failure"));

    const callback = await app.inject({
      url: "/auth/browser/callback?code=failed-login-code&state=decision-step-up-state-0000000000000001",
      headers: {
        cookie: `${flowCookie.split(";", 1)[0]}; rahhal-access=${demoApiCredentials.owner.accessToken}`,
      },
    });

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe(
      `/app/org/challenges/record/evaluation?id=${demoPublishedChallengeId}&stepUp=failed`,
    );
    expect(JSON.stringify(callback.headers["set-cookie"])).toContain("rahhal-step-up-flow=;");
  });

  it("returns only an owned solver outcome and its granted case", async () => {
    const solverHeaders = {
      authorization: `Bearer ${demoApiCredentials.solver.accessToken}`,
      "x-workspace-id": demoApiCredentials.solver.workspaceId,
    };
    const outcome = await app.inject({
      url: decisionApiRoutes.proposalOutcome.replace("{proposalId}", proposalId),
      headers: solverHeaders,
    });
    expect(outcome.statusCode).toBe(200);
    expect(outcome.json().data).toEqual(proposalOutcome);

    const record = await app.inject({
      url: decisionApiRoutes.case.replace("{caseId}", caseId),
      headers: solverHeaders,
    });
    expect(record.statusCode).toBe(200);
    expect(record.json().data).toMatchObject({ id: caseId, proposal_id: proposalId });
  });
});
