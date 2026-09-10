// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChallengeEvaluationMutationSuccessEnvelope,
  ChallengeEvaluationSuccessEnvelope,
  ChallengeReviewComparisonSuccessEnvelope,
} from "@rahhal/contracts";
import { parseCorrelationId, parsePrefixedId } from "@rahhal/domain";

const testState = vi.hoisted(() => ({
  requestApi: vi.fn(),
  idempotencyKey: vi.fn(() => "open-evaluation-test-key"),
  workspaceId: "wsp_evaluation_ui_workspace",
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    mode: "network",
    me: { active_context: { workspace_id: testState.workspaceId, workspace_kind: "org" } },
  }),
}));

vi.mock("@/lib/api/http", () => ({
  requestApi: testState.requestApi,
  idempotencyKey: testState.idempotencyKey,
}));

const challengeId = parsePrefixedId("chl_evaluation_ui", "chl");
const versionId = parsePrefixedId("chv_evaluation_ui", "chv");
const proposalId = parsePrefixedId("prp_evaluation_ui", "prp");
const proposalVersionId = parsePrefixedId("prv_evaluation_ui", "prv");
const rubricVersionId = parsePrefixedId("rbv_evaluation_ui", "rbv");

function envelope(
  overrides: Partial<ChallengeEvaluationSuccessEnvelope["data"]> = {},
): ChallengeEvaluationSuccessEnvelope {
  return {
    ok: true,
    data: {
      challenge_id: challengeId,
      challenge_version_id: versionId,
      stage: "published",
      publication_state: "closed",
      proposal_deadline_at: "2026-09-08T05:00:00.000Z",
      window_closed: true,
      rubric_version_id: rubricVersionId,
      required_reviews: 2,
      qualifying_proposal_count: 1,
      unresolved_proposal_count: 0,
      ready: true,
      blockers: [],
      roster: [
        {
          proposal_id: proposalId,
          proposal_version_id: proposalVersionId,
          tracking_code: "PRP-1405-101",
          source_state: "eligible",
        },
      ],
      opened_at: null,
      version: 7,
      ...overrides,
    },
    meta: {
      entity_version: overrides.version ?? 7,
      server_time: "2026-09-08T06:00:00.000Z",
      correlation_id: parseCorrelationId("cor_evaluation_ui_read"),
    },
  };
}

const mutationEnvelope: ChallengeEvaluationMutationSuccessEnvelope = {
  ok: true,
  data: {
    entity_id: challengeId,
    receipt_id: parsePrefixedId("rcp_evaluation_ui", "rcp"),
    audit_event_id: parsePrefixedId("aud_evaluation_ui", "aud"),
    timestamp: "2026-09-08T06:01:00.000Z",
    idempotent: false,
    next_actions: ["assign_reviewers"],
  },
  meta: {
    entity_version: 8,
    server_time: "2026-09-08T06:01:00.000Z",
    correlation_id: parseCorrelationId("cor_evaluation_ui_open"),
  },
};

function comparisonEnvelope(
  overrides: Partial<ChallengeReviewComparisonSuccessEnvelope["data"]> = {},
): ChallengeReviewComparisonSuccessEnvelope {
  return {
    ok: true,
    data: {
      challenge_id: challengeId,
      challenge_version_id: versionId,
      rubric_version_id: rubricVersionId,
      required_reviews: 2,
      proposal_count: 1,
      completed_proposal_count: 1,
      scores_released: true,
      criteria: [{ id: "quality", label: "کیفیت راهکار", weight: 100, min: 0, max: 5 }],
      proposals: [
        {
          proposal_id: proposalId,
          proposal_version_id: proposalVersionId,
          tracking_code: "PRP-1405-101",
          status: "complete",
          active_assignment_count: 2,
          locked_review_count: 2,
          cancelled_assignment_count: 0,
          invalidated_review_count: 0,
          score_summary: {
            average_weighted_score_tenths: 800,
            criteria: [{ criterion_id: "quality", average_score_tenths: 40 }],
          },
        },
      ],
      version: 8,
      ...overrides,
    },
    meta: {
      entity_version: overrides.version ?? 8,
      server_time: "2026-09-08T06:02:00.000Z",
      correlation_id: parseCorrelationId("cor_evaluation_ui_comparison"),
    },
  };
}

beforeEach(() => {
  testState.requestApi.mockReset();
  testState.idempotencyKey.mockClear();
});

afterEach(cleanup);

describe("connected challenge evaluation", () => {
  it("explains every blocker and keeps the irreversible command disabled", async () => {
    testState.requestApi.mockResolvedValue(
      envelope({
        ready: false,
        rubric_version_id: null,
        unresolved_proposal_count: 1,
        qualifying_proposal_count: 0,
        roster: [],
        blockers: ["rubric_missing", "proposal_workflow_unresolved"],
      }),
    );
    const { ChallengeEvaluationPage } = await import("@/components/challenge-flow/evaluation-page");
    render(<ChallengeEvaluationPage id={challengeId} />);

    expect(await screen.findByText("نسخه معیارهای ارزیابی ثبت نشده است.")).toBeVisible();
    expect(screen.getByText("رسیدگی به دست‌کم یک پیشنهاد ارسال‌شده هنوز باز است.")).toBeVisible();
    expect(screen.getByRole("button", { name: "قفل فهرست و شروع ارزیابی" })).toBeDisabled();
    expect(testState.idempotencyKey).not.toHaveBeenCalled();
  });

  it("opens the exact ready version once and then renders the frozen roster", async () => {
    let opened = false;
    testState.requestApi.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        opened = true;
        return mutationEnvelope;
      }
      if (path.includes("review-comparison")) return comparisonEnvelope();
      return opened
        ? envelope({ stage: "evaluating", opened_at: "2026-09-08T06:01:00.000Z", version: 8 })
        : envelope();
    });
    const { ChallengeEvaluationPage } = await import("@/components/challenge-flow/evaluation-page");
    render(<ChallengeEvaluationPage id={challengeId} />);

    expect(await screen.findByText("PRP-1405-101")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "قفل فهرست و شروع ارزیابی" }));
    await waitFor(() =>
      expect(testState.requestApi).toHaveBeenCalledWith(
        expect.stringContaining(":open-evaluation"),
        expect.objectContaining({
          method: "POST",
          headers: {
            "X-Workspace-Id": testState.workspaceId,
            "Idempotency-Key": "open-evaluation-test-key",
          },
        }),
      ),
    );
    const createCall = testState.requestApi.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({ expected_version: 7 });
    expect(await screen.findByText("فهرست ارزیابی قفل شده است")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "مقایسه نتیجه داوری" })).toBeVisible();
    expect(screen.getByText("۸۰ از ۱۰۰")).toBeVisible();
    expect(screen.getByText("۴ از ۵")).toBeVisible();
    expect(screen.queryByRole("button", { name: "قفل فهرست و شروع ارزیابی" })).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "فهرست دقیق پیشنهادها قفل شد و ارزیابی آغاز شد.",
    );
  });

  it("shows incomplete and invalidated evidence while withholding every score", async () => {
    testState.requestApi.mockImplementation(async (path: string) => {
      if (path.includes("review-comparison")) {
        return comparisonEnvelope({
          completed_proposal_count: 0,
          scores_released: false,
          proposals: [
            {
              proposal_id: proposalId,
              proposal_version_id: proposalVersionId,
              tracking_code: "PRP-1405-101",
              status: "needs_assignment",
              active_assignment_count: 1,
              locked_review_count: 1,
              cancelled_assignment_count: 1,
              invalidated_review_count: 1,
              score_summary: null,
            },
          ],
        });
      }
      return envelope({
        stage: "evaluating",
        opened_at: "2026-09-08T06:01:00.000Z",
        version: 8,
      });
    });
    const { ChallengeEvaluationPage } = await import("@/components/challenge-flow/evaluation-page");
    render(<ChallengeEvaluationPage id={challengeId} />);

    expect(await screen.findByText("در انتظار تکمیل")).toBeVisible();
    expect(screen.getByText("نیازمند تخصیص جایگزین")).toBeVisible();
    expect(screen.getByText("امتیاز این پیشنهاد تا تکمیل کل فهرست منتشر نمی‌شود.")).toBeVisible();
    expect(screen.queryByText(/میانگین کل/)).toBeNull();
    expect(screen.getByText("داوری باطل‌شده").parentElement).toHaveTextContent("۱");
  });
});
