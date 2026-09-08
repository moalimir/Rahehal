// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChallengeSuccessEnvelope,
  RubricMutationSuccessEnvelope,
  RubricSuccessEnvelope,
} from "@rahhal/contracts";
import { parseCorrelationId, parsePrefixedId } from "@rahhal/domain";
import { buildChallengeResource } from "@rahhal/testkit";

const testState = vi.hoisted(() => ({
  requestApi: vi.fn(),
  idempotencyKey: vi.fn(() => "rubric-version-test-key"),
  workspaceId: "wsp_rubric_ui_workspace",
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    mode: "network",
    me: {
      active_context: {
        workspace_id: testState.workspaceId,
        workspace_kind: "org",
      },
    },
  }),
}));

vi.mock("@/lib/api/http", () => ({
  requestApi: testState.requestApi,
  idempotencyKey: testState.idempotencyKey,
}));

const baseChallenge = buildChallengeResource();
const challengeEnvelope: ChallengeSuccessEnvelope = {
  ok: true,
  data: {
    ...baseChallenge,
    stage: "published",
    published_version_id: baseChallenge.current_version_id,
  },
  meta: {
    entity_version: 1,
    server_time: "2026-09-08T06:00:00.000Z",
    correlation_id: parseCorrelationId("cor_rubric_ui_challenge"),
  },
};

const emptyRubricEnvelope: RubricSuccessEnvelope = {
  ok: true,
  data: null,
  meta: {
    server_time: "2026-09-08T06:00:00.000Z",
    correlation_id: parseCorrelationId("cor_rubric_ui_read"),
  },
};

const mutationEnvelope: RubricMutationSuccessEnvelope = {
  ok: true,
  data: {
    entity_id: parsePrefixedId("rub_rubric_ui", "rub"),
    receipt_id: parsePrefixedId("rcp_rubric_ui", "rcp"),
    audit_event_id: parsePrefixedId("aud_rubric_ui", "aud"),
    timestamp: "2026-09-08T06:01:00.000Z",
    idempotent: false,
    next_actions: ["edit_rubric", "open_evaluation"],
  },
  meta: {
    entity_version: 1,
    server_time: "2026-09-08T06:01:00.000Z",
    correlation_id: parseCorrelationId("cor_rubric_ui_create"),
  },
};

beforeEach(() => {
  testState.requestApi.mockReset();
  testState.idempotencyKey.mockClear();
  testState.requestApi.mockImplementation(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") return mutationEnvelope;
    if (path.endsWith("/rubric")) return emptyRubricEnvelope;
    return challengeEnvelope;
  });
});

afterEach(cleanup);

describe("connected challenge rubric", () => {
  it("loads the exact published version and appends a valid 0–5 rubric version", async () => {
    const { ChallengeRubricPage } = await import("@/components/challenge-flow/rubric-page");
    render(<ChallengeRubricPage id={baseChallenge.id} />);

    const label = await screen.findByLabelText("عنوان معیار");
    fireEvent.change(label, { target: { value: "تناسب فنی راهکار" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت نخستین نسخه" }));

    await waitFor(() =>
      expect(testState.requestApi).toHaveBeenCalledWith(
        expect.stringContaining("/rubric-versions"),
        expect.objectContaining({
          method: "POST",
          headers: {
            "X-Workspace-Id": testState.workspaceId,
            "Idempotency-Key": "rubric-version-test-key",
          },
        }),
      ),
    );
    const createCall = testState.requestApi.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      expected_version: 0,
      challenge_version_id: baseChallenge.current_version_id,
      criteria: [
        {
          id: "criterion_1",
          label: "تناسب فنی راهکار",
          weight: 100,
          min: 0,
          max: 5,
        },
      ],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("نسخه ۱ معیارها ثبت شد.");
  });

  it("blocks an incomplete weight total before creating an idempotency key", async () => {
    const { ChallengeRubricPage } = await import("@/components/challenge-flow/rubric-page");
    render(<ChallengeRubricPage id={baseChallenge.id} />);

    fireEvent.change(await screen.findByLabelText("عنوان معیار"), {
      target: { value: "امکان اجرا" },
    });
    fireEvent.change(screen.getByLabelText("وزن (درصد)"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت نخستین نسخه" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "جمع وزن معیارها باید دقیقاً ۱۰۰ درصد باشد.",
    );
    expect(testState.idempotencyKey).not.toHaveBeenCalled();
    expect(testState.requestApi.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
