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
  return {
    get,
    publicChallenge,
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
    testState.publicChallenge.mockResolvedValue({ ok: false });
    testState.get.mockImplementation(
      async (): Promise<GatewayResult<ReturnType<typeof serverProposal>>> => ({
        ok: true,
        data: serverProposal(),
        meta,
      }),
    );
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

  it("offers draft editing and does not manufacture history before a saved content version", async () => {
    render(<ConnectedProposalRecord />);
    expect(await screen.findByRole("link", { name: "ادامه پیش‌نویس" })).toHaveAttribute(
      "href",
      expect.stringContaining("edit"),
    );
    expect(screen.queryByRole("heading", { name: "تاریخچه نسخه‌ها" })).not.toBeInTheDocument();
  });

  it("shows saved-version history and the organization's clarification feedback", async () => {
    testState.get.mockResolvedValue({
      ok: true,
      meta,
      data: {
        ...serverProposal(),
        state: "revision_requested",
        versions: [
          {
            id: "prv_test",
            version_number: 2,
            locked: true,
            changed_fields: ["title"],
            created_at: meta.server_time,
          },
        ],
        clarifications: [
          {
            id: "clar_test",
            state: "resolved",
            question: "سؤال سازمان",
            response: "پاسخ حل‌گر",
            resolution: "بازخورد قابل پیگیری",
          },
        ],
        revision_requests: [
          {
            id: "rev_test",
            scope: "اصلاح دامنه پیشنهادی",
            state: "requested",
            revision_deadline: "2030-01-01T00:00:00Z",
          },
        ],
      },
    });
    render(<ConnectedProposalRecord />);
    expect(await screen.findByRole("heading", { name: "تاریخچه نسخه‌ها" })).toBeInTheDocument();
    expect(screen.getByText("جمع‌بندی سازمان: بازخورد قابل پیگیری")).toBeInTheDocument();
    expect(screen.getByText("اصلاح دامنه پیشنهادی")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شروع نسخه اصلاح‌شده" })).toBeInTheDocument();
  });
});
