// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyChallenge } from "@/lib/challenges/model";

const state = vi.hoisted(() => ({
  role: "org:owner",
  ready: true,
  publish: vi.fn(),
  navigate: vi.fn(),
  submit: vi.fn(),
}));
const record = {
  ...emptyChallenge("chl_m1_preview", "2026-09-16T08:30:00Z"),
  title: "چالش مالک",
  summary: "PRIVATE SUMMARY",
  currentState: "PRIVATE CURRENT",
  desiredOutcome: "PRIVATE OUTCOME",
  expectedOutput: "PRIVATE OUTPUT",
  publicSummary: "PUBLIC SUMMARY",
  successCriteria: [
    { id: "m1", title: "PRIVATE CRITERION", target: "PRIVATE TARGET", method: "PRIVATE METHOD" },
  ],
};
vi.mock("@/components/runtime-provider", () => ({
  useChallengeGateway: () => ({ commands: { publish: state.publish, submit: state.submit } }),
  useWebRuntime: () => ({
    mode: "network",
    me: {
      active_context: { workspace_id: "wsp_org_alpha" },
      memberships: [{ workspace_id: "wsp_org_alpha", role: state.role, state: "active" }],
    },
  }),
}));
vi.mock("@/components/challenge-flow/hooks", () => ({
  useChallengeRecord: () => ({
    record,
    stage: "draft",
    lastSavedLabel: "اکنون",
    readiness: { ready: state.ready, issues: [] },
    triageReadiness: { ready: true, issues: [] },
  }),
}));
vi.mock("@/lib/challenges/navigation", () => ({
  challengeHref: (path: string) => path,
  navigateChallenge: state.navigate,
}));
import { ChallengePreviewPage } from "@/components/challenge-flow/preview-page";

beforeEach(() => {
  state.role = "org:owner";
  state.ready = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("M1 owner preview", () => {
  it("publishes the loaded version only after explicit confirmation", async () => {
    state.publish.mockResolvedValue({ ok: true, data: record });
    render(<ChallengePreviewPage id={record.id} />);
    fireEvent.click(screen.getByRole("button", { name: "انتشار چالش" }));
    expect(state.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تأیید و انتشار" }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith(`/app/org/challenges/${record.id}/governance`),
    );
    expect(state.publish).toHaveBeenCalledWith(record.id);
    expect(state.submit).not.toHaveBeenCalled();
  });
  it("requires full readiness, not just intake readiness", () => {
    state.ready = false;
    render(<ChallengePreviewPage id={record.id} />);
    expect(
      (screen.getByRole("button", { name: "انتشار چالش" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("keeps a refused command on the preview and shows its error", async () => {
    state.publish.mockResolvedValue({ ok: false, error: { message: "نسخه تغییر کرده است" } });
    render(<ChallengePreviewPage id={record.id} />);
    fireEvent.click(screen.getByRole("button", { name: "انتشار چالش" }));
    fireEvent.click(screen.getByRole("button", { name: "تأیید و انتشار" }));
    expect((await screen.findByRole("alert")).textContent).toContain("نسخه تغییر کرده است");
    expect(state.navigate).not.toHaveBeenCalled();
  });
  it("retains member authoring without offering owner publication", () => {
    state.role = "org:member";
    render(<ChallengePreviewPage id={record.id} />);
    expect(screen.queryByRole("button", { name: "انتشار چالش" })).toBeNull();
    expect(screen.getByRole("button", { name: "ارسال برای بررسی" })).toBeTruthy();
  });
  it("never presents private problem, outcome or criteria as public", () => {
    render(<ChallengePreviewPage id={record.id} />);
    expect(screen.getByText("PRIVATE OUTCOME")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "نمایش اطلاعات عمومی" }));
    expect(screen.getByText("PUBLIC SUMMARY")).toBeTruthy();
    expect(screen.queryAllByText(/PRIVATE/)).toHaveLength(0);
  });
});
