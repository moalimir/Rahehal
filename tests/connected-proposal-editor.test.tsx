// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedProposalEditor } from "@/components/solver/connected-proposal-editor";

const state = vi.hoisted(() => {
  const proposals = { get: vi.fn(), patch: vi.fn(), submit: vi.fn(), resubmit: vi.fn() };
  const evaluateEligibility = vi.fn();
  return {
    proposals,
    evaluateEligibility,
    runtime: {
      me: { active_context: { workspace_id: "wsp_individual_alpha" } },
      workspaceGateways: { proposals, solverProfile: { evaluateEligibility } },
    },
  };
});
vi.mock("@/components/runtime-provider", () => ({ useWebRuntime: () => state.runtime }));
const id = "prp_c0ffee0000004a1b8000000000000001";
const meta = { correlation_id: "cor_test", server_time: "2026-09-16T00:00:00Z" };
const failure = (code = "STORAGE") => ({
  ok: false,
  error: { code, message: "درخواست انجام نشد" },
  meta,
});
const receipt = (version: number) => ({
  ok: true,
  data: { entity_id: id },
  meta: { ...meta, entity_version: version },
});
function record(ready = false) {
  return {
    id,
    challenge_id: "chl_test",
    state: "draft",
    version: 1,
    readiness: { ready, evaluated_version: 1, issues: [] },
    content: {
      title: "عنوان اولیه",
      problem_statement: "",
      value_proposition: "",
      technical_approach: "",
      success_metrics: "",
      maturity_level: "",
      prototype_weeks: "",
      duration_weeks: "",
      ip_status: "",
      technologies: ["داده قبلی"],
      architecture: "",
      data_needs: "",
      roadmap: "",
      dependencies: "",
      risks: "",
      mitigation: "",
      team_summary: "",
      relevant_experience: "",
      budget_rationale: "",
      pilot_location: "محل قبلی",
      lead_name: "",
      start_availability: "",
      team_availability: "",
      budget_amount_minor: null,
      budget_currency: "IRR",
      payment_model: "",
      nda_accepted: false,
      conflict_declared: false,
      ip_accepted: false,
      accuracy_confirmed: false,
      attachment_ids: [],
    },
    clarifications: [],
    revision_requests: [],
    versions: [],
  };
}
async function open(ready = false) {
  state.proposals.get.mockResolvedValue({ ok: true, data: record(ready), meta });
  render(<ConnectedProposalEditor />);
  return screen.findByRole("textbox", { name: "عنوان پیشنهاد *" });
}
const save = () => screen.getByRole("button", { name: "ذخیره نسخه" });
const submit = () => screen.getByRole("button", { name: /ارسال نهایی و قفل نسخه/ });

describe("connected proposal editing reliability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState({}, "", `/app/solver/proposals/record/edit/?id=${id}`);
    state.evaluateEligibility.mockResolvedValue({
      ok: true,
      data: { status: "eligible", evaluated_against_version_id: "chv_test", reasons: [] },
      meta,
    });
    state.proposals.patch.mockResolvedValue(receipt(2));
    // Avoid jsdom navigation; assert the exact submitted command and preserve failed submit work.
    state.proposals.submit.mockResolvedValue(failure("VALIDATION"));
    state.proposals.resubmit.mockResolvedValue(failure("VALIDATION"));
  });
  afterEach(cleanup);

  it("saves current edits before submitting even when the previously saved draft was incomplete", async () => {
    const title = await open();
    fireEvent.change(title, { target: { value: "آخرین ویرایش برای ارسال" } });
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    await waitFor(() => expect(state.proposals.submit).toHaveBeenCalled());
    expect(state.proposals.patch).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        expectedVersion: 1,
        patch: expect.objectContaining({ title: "آخرین ویرایش برای ارسال" }),
      }),
    );
    expect(state.proposals.submit).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ expectedVersion: 2 }),
    );
    expect(state.proposals.patch.mock.invocationCallOrder[0]).toBeLessThan(
      state.proposals.submit.mock.invocationCallOrder[0]!,
    );
    expect(title).toHaveValue("آخرین ویرایش برای ارسال");
  });

  it("never submits after a failed save, and keeps all visible edits", async () => {
    const title = await open(true);
    state.proposals.patch.mockResolvedValue(failure());
    fireEvent.change(title, { target: { value: "ویرایش نگهداری‌شده" } });
    fireEvent.click(submit());
    await waitFor(() => expect(state.proposals.patch).toHaveBeenCalled());
    expect(state.proposals.submit).not.toHaveBeenCalled();
    expect(title).toHaveValue("ویرایش نگهداری‌شده");
  });

  it("does not replace newer typing with the response to an earlier save", async () => {
    const title = await open();
    let finish!: (value: unknown) => void;
    state.proposals.patch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.change(title, { target: { value: "متن هنگام ذخیره" } });
    fireEvent.submit(save().closest("form")!);
    fireEvent.change(title, { target: { value: "متن جدید هنگام انتظار" } });
    await act(async () => finish(receipt(2)));
    expect(screen.getByRole("textbox", { name: "عنوان پیشنهاد *" })).toHaveValue(
      "متن جدید هنگام انتظار",
    );
  });

  it("keeps the editor after a successful save followed by an unavailable read", async () => {
    const title = await open();
    fireEvent.change(title, { target: { value: "ذخیره شده و قابل مشاهده" } });
    state.proposals.get.mockResolvedValue(failure());
    fireEvent.submit(save().closest("form")!);
    await waitFor(() => expect(state.proposals.patch).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "عنوان پیشنهاد *" })).toHaveValue(
      "ذخیره شده و قابل مشاهده",
    );
    expect(screen.queryByText("پیشنهاد در دسترس نیست")).not.toBeInTheDocument();
  });

  it("allows partial drafts to save without native required-field validation", async () => {
    await open();
    expect(save()).toHaveAttribute("formnovalidate");
  });

  it("omits deferred inputs without deleting existing stored values", async () => {
    await open();
    expect(screen.queryByRole("textbox", { name: "فناوری‌ها" })).not.toBeInTheDocument();
    expect(screen.queryByText("برنامه همکاری و تحویل")).not.toBeInTheDocument();
    fireEvent.submit(save().closest("form")!);
    await waitFor(() =>
      expect(state.proposals.patch).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          patch: expect.objectContaining({
            technologies: ["داده قبلی"],
            pilot_location: "محل قبلی",
          }),
        }),
      ),
    );
  });

  it("replays an uncertain save before saving subsequent edits, with stable keys and versions", async () => {
    const title = await open();
    state.proposals.patch
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(receipt(2))
      .mockResolvedValueOnce(receipt(3));
    fireEvent.change(title, { target: { value: "متن درخواست اول" } });
    fireEvent.submit(save().closest("form")!);
    await screen.findByRole("alert");
    const first = state.proposals.patch.mock.calls[0]![1];
    fireEvent.change(title, { target: { value: "ویرایش بعد از قطع ارتباط" } });
    fireEvent.submit(save().closest("form")!);
    await waitFor(() => expect(state.proposals.patch).toHaveBeenCalledTimes(3));
    expect(state.proposals.patch.mock.calls[1]![1]).toEqual(first);
    expect(state.proposals.patch.mock.calls[2]![1]).toMatchObject({
      expectedVersion: 2,
      patch: { title: "ویرایش بعد از قطع ارتباط" },
    });
    expect(state.proposals.patch.mock.calls[2]![1].commandKey).not.toBe(first.commandKey);
    expect(title).toHaveValue("ویرایش بعد از قطع ارتباط");
  });

  it("retries an uncertain submission without another save or changed idempotency key", async () => {
    const title = await open();
    state.proposals.submit.mockResolvedValue(failure());
    fireEvent.click(submit());
    await screen.findByRole("alert");
    expect(title).toBeDisabled();
    expect(save()).toBeDisabled();
    fireEvent.click(submit());
    await waitFor(() => expect(state.proposals.submit).toHaveBeenCalledTimes(2));
    expect(state.proposals.patch).toHaveBeenCalledTimes(1);
    expect(state.proposals.submit.mock.calls[1]).toEqual(state.proposals.submit.mock.calls[0]);
  });

  it("serializes duplicate clicks and freezes editing while save-and-submit runs", async () => {
    const title = await open();
    let finish!: (value: unknown) => void;
    state.proposals.patch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(submit());
    fireEvent.click(submit());
    expect(title).toBeDisabled();
    expect(state.proposals.patch).toHaveBeenCalledTimes(1);
    await act(async () => finish(receipt(2)));
    expect(state.proposals.submit).toHaveBeenCalledTimes(1);
    expect(title).toBeEnabled();
  });

  it("saves the latest revision before resubmitting against its exact request", async () => {
    const revised = {
      ...record(),
      state: "revision_draft",
      revision_requests: [{ id: "rev_test", state: "in_progress" }],
    };
    state.proposals.get.mockResolvedValue({ ok: true, data: revised, meta });
    render(<ConnectedProposalEditor />);
    const title = await screen.findByRole("textbox", { name: "عنوان پیشنهاد *" });
    fireEvent.change(title, { target: { value: "ویرایش نهایی نسخه اصلاحی" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال نسخه اصلاحی" }));
    await waitFor(() =>
      expect(state.proposals.resubmit).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          expectedVersion: 2,
          revisionRequestId: "rev_test",
          acceptedChallengeVersionId: "chv_test",
        }),
      ),
    );
    expect(state.proposals.submit).not.toHaveBeenCalled();
    expect(state.proposals.patch.mock.calls[0]![1].patch.title).toBe("ویرایش نهایی نسخه اصلاحی");
  });

  it("preserves edits on conflicts and shows server field-level validation feedback", async () => {
    const title = await open();
    state.proposals.patch.mockResolvedValue(failure("CONFLICT"));
    fireEvent.change(title, { target: { value: "متن دارای تعارض" } });
    fireEvent.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "نسخه سرور را در پنجره‌ای جدا بررسی کنید",
    );
    expect(title).toHaveValue("متن دارای تعارض");
    expect(state.proposals.submit).not.toHaveBeenCalled();
    state.proposals.patch.mockResolvedValue(receipt(2));
    state.proposals.submit.mockResolvedValue({
      ...failure("VALIDATION"),
      error: {
        code: "VALIDATION",
        message: "ناقص",
        fields: [{ path: "/content/title", message: "عنوان کامل‌تر لازم است" }],
      },
    });
    fireEvent.click(submit());
    expect(await screen.findByRole("alert", { name: "موارد نیازمند اصلاح" })).toHaveTextContent(
      "عنوان کامل‌تر لازم است",
    );
  });

  it("warns about unsaved work and clears the warning once acknowledged by the server", async () => {
    const title = await open();
    fireEvent.change(title, { target: { value: "کار ذخیره‌نشده" } });
    const unsaved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unsaved);
    expect(unsaved.defaultPrevented).toBe(true);
    fireEvent.submit(save().closest("form")!);
    await screen.findByText("نسخه پیش‌نویس ذخیره شد.");
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });

  it("shows a missing-record error instead of an endless spinner", async () => {
    window.history.replaceState({}, "", "/app/solver/proposals/record/edit/");
    render(<ConnectedProposalEditor />);
    expect(
      await screen.findByRole("heading", { name: "پیشنهاد در دسترس نیست" }),
    ).toBeInTheDocument();
    expect(state.proposals.get).not.toHaveBeenCalled();
  });

  it("can cancel workspace switching without discarding unsaved proposal text", async () => {
    const title = await open();
    const change = vi.fn();
    render(
      <label className="unified-space-switcher">
        <select aria-label="انتخاب فضای کاری" defaultValue="wsp_individual_alpha" onChange={change}>
          <option value="wsp_individual_alpha">شخصی</option>
          <option value="wsp_team">تیم</option>
        </select>
      </label>,
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(title, { target: { value: "ویرایش ذخیره‌نشده" } });
    const select = screen.getByRole("combobox", { name: "انتخاب فضای کاری" });
    fireEvent.change(select, { target: { value: "wsp_team" } });
    expect(change).not.toHaveBeenCalled();
    expect(select).toHaveValue("wsp_individual_alpha");
    expect(title).toHaveValue("ویرایش ذخیره‌نشده");
    confirm.mockRestore();
  });
});
