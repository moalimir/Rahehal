// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MutationSuccessEnvelope,
  OperationsReviewConflictListSuccessEnvelope,
  OperationsReviewAssignmentListSuccessEnvelope,
  ReviewAssignmentListSuccessEnvelope,
  ReviewMaterialsSuccessEnvelope,
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
        pre_coi_packet: {
          organization_name: "سازمان آزمایشی",
          challenge_title: "کاهش مصرف انرژی",
        },
        coi_declaration: {
          status: "pending",
          relationship_categories: [],
          reason: null,
          declared_at: null,
        },
        due_at: "2026-09-15T12:00:00.000Z",
        overdue: false,
        version: 1,
      },
    ],
  },
  meta,
};

const conflictsEnvelope: OperationsReviewConflictListSuccessEnvelope = {
  ok: true,
  data: { items: [] },
  meta,
};

function operationsEnvelope(
  withAssignment = false,
  state: "coi-gate" | "accepted" = "coi-gate",
): OperationsReviewAssignmentListSuccessEnvelope {
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
              state,
              coi_status: state === "accepted" ? "clear" : "pending",
              coi_declaration:
                state === "accepted"
                  ? {
                      status: "clear",
                      relationship_categories: [],
                      reason: null,
                      declared_at: "2026-09-08T12:00:00.000Z",
                    }
                  : reviewerEnvelope.data.items[0]!.coi_declaration,
              version: state === "accepted" ? 2 : 1,
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

const materialsEnvelope: ReviewMaterialsSuccessEnvelope = {
  ok: true,
  data: {
    assignment_id: parsePrefixedId("rva_review_assignment_ui", "rva"),
    proposal_version_id: parsePrefixedId("prv_review_assignment_ui", "prv"),
    rubric_version_id: parsePrefixedId("rbv_review_assignment_ui", "rbv"),
    organization_name: "سازمان آزمایشی",
    challenge_title: "کاهش مصرف انرژی",
    proposal_content: {
      title: "راهکار پایش هوشمند",
      problem_statement: "مصرف انرژی بدون بازخورد دقیق ثبت می‌شود.",
      value_proposition: "کاهش قابل سنجش مصرف",
      maturity_level: "نمونه اولیه",
      prototype_weeks: "4",
      technologies: ["حسگر", "تحلیل داده"],
      technical_approach: "اندازه‌گیری و تحلیل مرحله‌ای",
      architecture: "درگاه محلی و داشبورد",
      data_needs: "داده مصرف ساعتی",
      success_metrics: "کاهش ده درصدی",
      ip_status: "مالکیت راهکار متعلق به تیم است",
      duration_weeks: "12",
      roadmap: "پایش، پایلوت و ارزیابی",
      dependencies: "دسترسی به کنتور",
      pilot_location: "تهران",
      risks: "کیفیت داده",
      mitigation: "اعتبارسنجی خودکار",
      start_availability: "دو هفته پس از انتخاب",
      team_availability: "نیمه‌وقت",
    },
    rubric_criteria: [{ id: "quality", label: "کیفیت فنی", weight: 100, min: 0, max: 5 }],
  },
  meta,
};

beforeEach(() => {
  testState.requestApi.mockReset();
  testState.idempotencyKey.mockClear();
});

afterEach(cleanup);

describe("connected D5 reviewer assignments", () => {
  it("shows only the pre-COI packet and does not request protected materials", async () => {
    testState.requestApi.mockResolvedValue(reviewerEnvelope);
    const { ConnectedReviewerAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedReviewerAssignments />);

    expect(await screen.findByText("rva_review_assignment_ui")).toBeVisible();
    expect(screen.getByText("کاهش مصرف انرژی")).toBeVisible();
    expect(screen.getByText("سازمان آزمایشی")).toBeVisible();
    expect(screen.getByRole("group", { name: "اظهار تعارض منافع" })).toBeVisible();
    expect(screen.queryByText("PRP-1405-101")).toBeNull();
    expect(
      testState.requestApi.mock.calls.some(([path]) => String(path).endsWith("/materials")),
    ).toBe(false);
    expect(testState.requestApi).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/assignments?limit=100"),
      { headers: { "x-workspace-id": testState.workspaceId } },
    );
  });

  it("submits a clear declaration with attestation and the assignment version", async () => {
    testState.requestApi.mockImplementation(async (_path: string, init: RequestInit = {}) =>
      init.method === "POST"
        ? {
            ...mutationEnvelope,
            data: { ...mutationEnvelope.data, next_actions: ["review_materials"] },
            meta: { ...mutationEnvelope.meta, entity_version: 2 },
          }
        : reviewerEnvelope,
    );
    const { ConnectedReviewerAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedReviewerAssignments />);

    fireEvent.click(
      await screen.findByLabelText("صحت این اظهار و بررسی روابط ۲۴ ماه گذشته را تأیید می‌کنم."),
    );
    fireEvent.click(screen.getByRole("button", { name: "ثبت نهایی اظهار" }));
    await waitFor(() =>
      expect(testState.requestApi).toHaveBeenCalledWith(
        "/api/v1/assignments/rva_review_assignment_ui/coi:declare",
        expect.objectContaining({
          method: "POST",
          headers: {
            "x-workspace-id": testState.workspaceId,
            "idempotency-key": "review-assignment-test-key",
          },
        }),
      ),
    );
    const declarationCall = testState.requestApi.mock.calls.find(
      ([path, init]) => String(path).includes("coi:declare") && init?.method === "POST",
    );
    expect(JSON.parse(declarationCall?.[1]?.body as string)).toEqual({
      expected_version: 1,
      status: "clear",
      relationship_categories: [],
      reason: null,
      attestation: true,
    });
  });

  it("loads the exact purpose-limited proposal and rubric after clear COI", async () => {
    const acceptedEnvelope: ReviewAssignmentListSuccessEnvelope = {
      ...reviewerEnvelope,
      data: {
        items: [
          {
            ...reviewerEnvelope.data.items[0]!,
            state: "accepted",
            coi_status: "clear",
            version: 2,
            coi_declaration: {
              status: "clear",
              relationship_categories: [],
              reason: null,
              declared_at: meta.server_time,
            },
          },
        ],
      },
    };
    testState.requestApi.mockImplementation(async (path: string) =>
      path.endsWith("/materials") ? materialsEnvelope : acceptedEnvelope,
    );
    const { ConnectedReviewerAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedReviewerAssignments />);

    expect(await screen.findByText("راهکار پایش هوشمند")).toBeVisible();
    expect(screen.getByText("کیفیت فنی · وزن ۱۰۰٪ · امتیاز ۰ تا ۵")).toBeVisible();
    expect(
      screen.getByText("این نما فقط محتوای فنی و اجرایی مجاز همان نسخه را نشان می‌دهد."),
    ).toBeVisible();
    expect(testState.requestApi).toHaveBeenCalledWith(
      "/api/v1/assignments/rva_review_assignment_ui/materials",
      { headers: { "x-workspace-id": testState.workspaceId } },
    );
  });

  it("creates an exact frozen-slot assignment with an idempotency key", async () => {
    testState.requestApi.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === "/api/v1/operations/review-conflicts") return conflictsEnvelope;
      return init.method === "POST" ? mutationEnvelope : operationsEnvelope();
    });
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
    testState.requestApi.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if (path === "/api/v1/operations/review-conflicts") return conflictsEnvelope;
      return init.method === "POST" ? mutationEnvelope : operationsEnvelope(true);
    });
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

  it("keeps reasoned cancellation and replacement available after COI clears", async () => {
    testState.requestApi.mockImplementation(async (path: string) =>
      path === "/api/v1/operations/review-conflicts"
        ? conflictsEnvelope
        : operationsEnvelope(true, "accepted"),
    );
    const { ConnectedOperationsReviewAssignments } = await import(
      "@/components/internal/connected-review-assignments"
    );
    render(<ConnectedOperationsReviewAssignments />);

    expect(
      await screen.findByText("داور تعارضی اعلام نکرده و مأموریت را پذیرفته است."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "لغو مأموریت" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ثبت جایگزین" })).toBeEnabled();
  });
});
