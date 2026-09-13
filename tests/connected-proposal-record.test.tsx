// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectedProposalRecord } from "@/components/solver/connected-proposal-record";
import type { GatewayResult } from "@/lib/api/result";

// The runtime object is hoisted and returned by identity: the connected hook
// keys its effect on the gateways reference, so a fresh literal per render
// would re-read forever instead of settling.
const testState = vi.hoisted(() => {
  const get = vi.fn();
  const publicChallenge = vi.fn();
  const requestApi = vi.fn();
  return {
    get,
    publicChallenge,
    requestApi,
    runtime: {
      mode: "network",
      sessionStatus: "authenticated",
      me: {
        user: { id: "usr_test", display_name: "حل‌گر آزمایشی" },
        memberships: [{ workspace_id: "wsp_test", role: "individual", state: "active" }],
        workspaces: [{ id: "wsp_test", kind: "individual", name: "فضای شخصی آزمایشی" }],
        active_context: { workspace_id: "wsp_test", workspace_kind: "individual" },
      },
      workspaceGateways: { proposals: { get } },
    },
  };
});

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => testState.runtime,
}));

vi.mock("@/lib/challenges/adapters/network-public-challenges", () => ({
  readPublicChallenge: testState.publicChallenge,
}));

vi.mock("@/lib/api/http", () => ({ requestApi: testState.requestApi }));

const meta = { server_time: "2026-09-06T00:00:00.000Z", correlation_id: "cor_test_record" };
const proposalId = "prp_c0ffee0000004a1b8000000000000001";

function serverProposal() {
  return {
    id: proposalId,
    current_version_id: "prv_c0ffee0000004a1b8000000000000009",
    tenant_id: "ten_test",
    owner_workspace_id: "wsp_test",
    owner_workspace_kind: "individual",
    challenge_id: "chl_c0ffee0000004a1b8000000000000002",
    assigned_membership_ids: [],
    state: "draft",
    tracking_code: null,
    version: 3,
    readiness: { ready: false, evaluated_version: 3, issues: [] },
    content: {
      title: "عنوانی که فقط روی سرور وجود دارد",
      problem_statement: "شرح مسئله از پاسخ سرور",
      value_proposition: "",
      maturity_level: "",
      prototype_weeks: "",
      technologies: [],
      technical_approach: "",
      architecture: "",
      data_needs: "",
      success_metrics: "",
      ip_status: "",
      duration_weeks: "",
      roadmap: "",
      dependencies: "",
      pilot_location: "",
      risks: "",
      mitigation: "",
      lead_name: "",
      team_summary: "",
      relevant_experience: "",
      budget_amount_minor: null,
      budget_currency: "IRR",
      payment_model: "",
      budget_rationale: "",
      start_availability: "",
      team_availability: "",
      nda_accepted: false,
      conflict_declared: false,
      ip_accepted: false,
      accuracy_confirmed: false,
      attachment_ids: [],
    },
    versions: [],
    clarifications: [],
    revision_requests: [],
    submitted_at: null,
    created_by: "usr_test",
    created_at: "2026-09-06T00:00:00.000Z",
    updated_at: "2026-09-06T00:00:00.000Z",
  };
}

describe("connected proposal record", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", `/app/solver/proposals/record/?id=${proposalId}`);
    testState.get.mockReset();
    testState.publicChallenge.mockReset();
    testState.requestApi.mockReset();
    testState.publicChallenge.mockResolvedValue({ ok: false });
    testState.get.mockImplementation(
      async (): Promise<GatewayResult<ReturnType<typeof serverProposal>>> => ({
        ok: true,
        data: serverProposal(),
        meta,
      }),
    );
    testState.requestApi.mockResolvedValue({
      ok: true,
      data: {
        proposal_id: proposalId,
        proposal_version_id: "prv_c0ffee0000004a1b8000000000000009",
        tracking_code: "PRP-2026-951",
        status: "pending",
        feedback: null,
        decided_at: null,
        case_id: null,
        version: 3,
      },
      meta: { ...meta, entity_version: 3 },
    });
  });

  it("reads the record from the server rather than the demo repository", async () => {
    // This route used to render the demo repository's detail, so a real
    // `prp_…` was never found there: every connected record answered "not
    // found" without asking the server at all. Asserting the gateway was
    // called with this id is what makes that regression impossible to
    // reintroduce -- a fixture fallback would render without any call.
    render(<ConnectedProposalRecord />);

    await waitFor(() => expect(testState.get).toHaveBeenCalledWith(proposalId));
    expect(await screen.findByText("عنوانی که فقط روی سرور وجود دارد")).toBeInTheDocument();
    expect(screen.queryByText("پیشنهاد پیدا نشد یا به این فضای کاری تعلق ندارد")).toBeNull();
  });

  it("shows the non-enumerating screen when the server refuses the record", async () => {
    testState.get.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "پرونده در فضای کاری فعال در دسترس نیست." },
      meta,
    });

    render(<ConnectedProposalRecord />);

    await waitFor(() => expect(testState.get).toHaveBeenCalled());
    expect(
      await screen.findByText("پیشنهاد پیدا نشد یا به این فضای کاری تعلق ندارد"),
    ).toBeInTheDocument();
  });

  it("never asks the server for an id that is not a server proposal id", async () => {
    // A record page must not fall back to a known fixture, and it must not
    // send a fabricated id either.
    window.history.replaceState({}, "", "/app/solver/proposals/record/?id=PR-104");

    render(<ConnectedProposalRecord />);

    expect(await screen.findByText("شناسه پرونده مشخص نیست")).toBeInTheDocument();
    expect(testState.get).not.toHaveBeenCalled();
  });

  it("shows only the solver's own decision feedback and granted case", async () => {
    const caseId = "case_c0ffee0000004a1b8000000000000001";
    testState.requestApi
      .mockResolvedValueOnce({
        ok: true,
        data: {
          proposal_id: proposalId,
          proposal_version_id: "prv_c0ffee0000004a1b8000000000000009",
          tracking_code: "PRP-2026-951",
          status: "selected",
          feedback: "این بازخورد فقط برای پیشنهاد خود حل‌گر است.",
          decided_at: "2026-09-10T08:05:00.000Z",
          case_id: caseId,
          version: 4,
        },
        meta: { ...meta, entity_version: 4 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: caseId,
          challenge_id: "chl_c0ffee0000004a1b8000000000000002",
          challenge_version_id: "chv_c0ffee0000004a1b8000000000000002",
          proposal_id: proposalId,
          proposal_version_id: "prv_c0ffee0000004a1b8000000000000009",
          decision_id: "dec_c0ffee0000004a1b8000000000000001",
          state: "created",
          created_at: "2026-09-10T08:05:00.000Z",
        },
        meta: { ...meta, entity_version: 1 },
      });

    render(<ConnectedProposalRecord />);

    expect(await screen.findByText("پیشنهاد شما انتخاب شد")).toBeVisible();
    expect(screen.getByText("این بازخورد فقط برای پیشنهاد خود حل‌گر است.")).toBeVisible();
    expect(screen.getByText(caseId)).toBeVisible();
  });

  it("keeps the decision outcome visible when the granted case read fails", async () => {
    const caseId = "case_c0ffee0000004a1b8000000000000002";
    testState.requestApi
      .mockResolvedValueOnce({
        ok: true,
        data: {
          proposal_id: proposalId,
          proposal_version_id: "prv_c0ffee0000004a1b8000000000000009",
          tracking_code: "PRP-2026-951",
          status: "selected",
          feedback: "نتیجه قطعی باید حتی با خطای پرونده دیده شود.",
          decided_at: "2026-09-10T08:05:00.000Z",
          case_id: caseId,
          version: 4,
        },
        meta: { ...meta, entity_version: 4 },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "NO_ACCESS", message: "دسترسی پرونده موقتاً در دسترس نیست." },
        meta,
      });

    render(<ConnectedProposalRecord />);

    expect(await screen.findByText("پیشنهاد شما انتخاب شد")).toBeVisible();
    expect(screen.getByText("نتیجه قطعی باید حتی با خطای پرونده دیده شود.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "نتیجه تصمیم دریافت شد، اما پرونده همکاری اکنون در دسترس نیست",
    );
    expect(screen.queryByText("نتیجه تصمیم دریافت نشد")).toBeNull();
  });
});
