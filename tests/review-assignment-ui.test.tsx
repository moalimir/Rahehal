// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MutationSuccessEnvelope,
  OperationsReviewAssignmentListSuccessEnvelope,
  ReviewAssignmentListSuccessEnvelope,
} from "@rahhal/contracts";
import { parseCorrelationId, parsePrefixedId } from "@rahhal/domain";

const testState = vi.hoisted(() => ({
  requestApi: vi.fn(),
  idempotencyKey: vi.fn(() => "review-assignment-test-key"),
  workspaceId: "wsp_review_assignment_ui",
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    mode: "network",
    me: { active_context: { workspace_id: testState.workspaceId, workspace_kind: "platform" } },
  }),
}));

vi.mock("@/lib/api/http", () => ({
  requestApi: testState.requestApi,
  idempotencyKey: testState.idempotencyKey,
}));

const meta = {
  server_time: "2026-09-08T12:00:00.000Z",
  correlation_id: parseCorrelationId("cor_review_assignment_ui"),
};

const reviewerEnvelope: ReviewAssignmentListSuccessEnvelope = {
  ok: true,
  data: {
    items: [
      {
        id: parsePrefixedId("rva_review_assignment_ui", "rva"),
        state: "coi-gate",
        coi_status: "pending",
        due_at: "2026-09-15T12:00:00.000Z",
        overdue: false,
        version: 1,
      },
    ],
  },
  meta,
};

function operationsEnvelope(withAssignment = false): OperationsReviewAssignmentListSuccessEnvelope {
  return {
    ok: true,
    data: {
      evaluation_proposals: [
        {
          challenge_id: parsePrefixedId("chl_review_assignment_ui", "chl"),
          proposal_id: parsePrefixedId("prp_review_assignment_ui", "prp"),
          proposal_version_id: parsePrefixedId("prv_review_assignment_ui", "prv"),
          proposal_tracking_code: "PRP-1405-101",
          rubric_version_id: parsePrefixedId("rbv_review_assignment_ui", "rbv"),
          evaluation_version: 7,
          required_reviews: 2,
          active_assignment_count: withAssignment ? 1 : 0,
        },
      ],
      reviewers: [
        {
          membership_id: parsePrefixedId("mem_review_assignment_ui", "mem"),
          user_id: parsePrefixedId("usr_review_assignment_ui", "usr"),
          display_name: "داور آزمایشی",
          active_assignment_count: 0,
        },
      ],
      assignments: withAssignment
        ? [
            {
              ...reviewerEnvelope.data.items[0]!,
              challenge_id: parsePrefixedId("chl_review_assignment_ui", "chl"),
              proposal_id: parsePrefixedId("prp_review_assignment_ui", "prp"),
              proposal_version_id: parsePrefixedId("prv_review_assignment_ui", "prv"),
              proposal_tracking_code: "PRP-1405-101",
              rubric_version_id: parsePrefixedId("rbv_review_assignment_ui", "rbv"),
              reviewer_membership_id: parsePrefixedId("mem_review_assignment_ui", "mem"),
              reviewer_user_id: parsePrefixedId("usr_review_assignment_ui", "usr"),
              reviewer_display_name: "داور آزمایشی",
              replaces_assignment_id: null,
              cancellation_reason: null,
              cancelled_at: null,
            },
          ]
        : [],
    },
    meta,
  };
}

const mutationEnvelope: MutationSuccessEnvelope = {
  ok: true,
  data: {
    entity_id: parsePrefixedId("rva_review_assignment_ui", "rva"),
    receipt_id: parsePrefixedId("rcp_review_assignment_ui", "rcp"),
    audit_event_id: parsePrefixedId("aud_review_assignment_ui", "aud"),
    timestamp: meta.server_time,
    idempotent: false,
    next_actions: ["await_coi"],
  },
  meta: { ...meta, entity_version: 1 },
};

beforeEach(() => {
  testState.requestApi.mockReset();
  testState.idempotencyKey.mockClear();
});

afterEach(cleanup);

describe("connected D4 reviewer assignments", () => {
  it("shows reviewers only their own bookkeeping before COI", async () => {
    testState.requestApi.mockResolvedValue(reviewerEnvelope);
    const { ConnectedReviewerAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedReviewerAssignments />);

    expect(await screen.findByText("rva_review_assignment_ui")).toBeVisible();
    expect(screen.getByText("در انتظار اظهار تعارض منافع")).toBeVisible();
    expect(screen.getByText("اظهار COI در D5")).toBeVisible();
    expect(screen.queryByText("PRP-1405-101")).toBeNull();
    expect(testState.requestApi).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/assignments?limit=100"),
      { headers: { "x-workspace-id": testState.workspaceId } },
    );
  });

  it("creates an exact frozen-slot assignment with an idempotency key", async () => {
    testState.requestApi.mockImplementation(async (_path: string, init: RequestInit = {}) =>
      init.method === "POST" ? mutationEnvelope : operationsEnvelope(),
    );
    const { ConnectedOperationsReviewAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedOperationsReviewAssignments />);

    fireEvent.click(await screen.findByRole("button", { name: "ثبت مأموریت" }));
    await waitFor(() =>
      expect(testState.requestApi).toHaveBeenCalledWith(
        "/api/v1/operations/review-assignments",
        expect.objectContaining({
          method: "POST",
          headers: {
            "x-workspace-id": testState.workspaceId,
            "idempotency-key": "review-assignment-test-key",
          },
        }),
      ),
    );
    const createCall = testState.requestApi.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(createCall?.[1]?.body as string)).toMatchObject({
      expected_version: 7,
      challenge_id: "chl_review_assignment_ui",
      proposal_id: "prp_review_assignment_ui",
      reviewer_membership_id: "mem_review_assignment_ui",
      due_at: expect.stringMatching(/Z$/),
    });
    expect(await screen.findByRole("status")).toHaveTextContent("مأموریت داوری ثبت شد");
  });

  it("requires a reason before cancelling and submits the assignment version", async () => {
    testState.requestApi.mockImplementation(async (_path: string, init: RequestInit = {}) =>
      init.method === "POST" ? mutationEnvelope : operationsEnvelope(true),
    );
    const { ConnectedOperationsReviewAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedOperationsReviewAssignments />);

    fireEvent.click(await screen.findByRole("button", { name: "لغو مأموریت" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "برای لغو یا جایگزینی، دلیل را ثبت کنید.",
    );
    expect(testState.requestApi.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("دلیل لغو یا جایگزینی"), {
      target: { value: "داور در این بازه در دسترس نیست." },
    });
    fireEvent.click(screen.getByRole("button", { name: "لغو مأموریت" }));
    await waitFor(() =>
      expect(testState.requestApi).toHaveBeenCalledWith(
        "/api/v1/operations/review-assignments/rva_review_assignment_ui:cancel",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const cancelCall = testState.requestApi.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(cancelCall?.[1]?.body as string)).toEqual({
      expected_version: 1,
      reason: "داور در این بازه در دسترس نیست.",
    });
  });
});
