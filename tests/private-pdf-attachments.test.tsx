// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivatePdfAttachments } from "@/components/private-pdf-attachments-panel";

const mocks = vi.hoisted(() => ({
  workspace: "wsp_solver_alpha",
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  retryScan: vi.fn(),
}));
vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    mode: "network",
    me: { active_context: { workspace_id: mocks.workspace } },
  }),
}));
vi.mock("@/lib/workspace/private-files", () => ({ createPrivateFileGateway: () => mocks }));
const meta = { server_time: "2026-09-16T12:00:00Z", correlation_id: "cor_test_001" };
afterEach(cleanup);
const file = {
  id: "fil_synthetic_001",
  entity_type: "proposal",
  entity_id: "prp_synthetic_001",
  filename: "synthetic.pdf",
  size: 32,
  state: "clean",
  version: 4,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace = "wsp_solver_alpha";
  mocks.list.mockResolvedValue({ ok: true, data: [], meta });
});
describe("private PDF interaction", () => {
  it("does not offer unscanned downloads or attachment binding", async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [{ ...file, state: "quarantined" }], meta });
    render(
      <PrivatePdfAttachments
        entity_type="proposal"
        entity_id="prp_synthetic_001"
        onAttach={vi.fn()}
      />,
    );
    await screen.findByText("قرنطینه؛ هنوز قابل استفاده نیست");
    expect(screen.queryByRole("button", { name: "دانلود PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "افزودن به پیوست‌ها" })).toBeNull();
  });
  it("retains the selected file after a failed upload and retries that same object", async () => {
    mocks.upload.mockResolvedValue({
      ok: false,
      error: { code: "STORAGE", message: "خطای ارتباط" },
      meta,
    });
    render(
      <PrivatePdfAttachments
        entity_type="proposal"
        entity_id="prp_synthetic_001"
        expectedVersion={2}
        onAttach={vi.fn()}
      />,
    );
    const selected = new File(["%PDF-test"], "draft.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("انتخاب PDF خصوصی"), { target: { files: [selected] } });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری PDF" }));
    await screen.findByText("خطای ارتباط");
    expect(screen.getByText("draft.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری PDF" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload.mock.calls[0]![0]).toBe(mocks.upload.mock.calls[1]![0]);
  });
  it("binds only the selected clean file and hides stale files on workspace change", async () => {
    mocks.list
      .mockResolvedValueOnce({ ok: true, data: [file], meta })
      .mockResolvedValue({ ok: true, data: [], meta });
    const attach = vi.fn();
    const view = render(
      <PrivatePdfAttachments
        entity_type="proposal"
        entity_id="prp_synthetic_001"
        onAttach={attach}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "افزودن به پیوست‌ها" }));
    expect(attach).toHaveBeenCalledWith(file);
    mocks.workspace = "wsp_solver_beta";
    view.rerender(
      <PrivatePdfAttachments
        entity_type="proposal"
        entity_id="prp_synthetic_001"
        onAttach={attach}
      />,
    );
    expect(screen.queryByText("synthetic.pdf")).toBeNull();
  });
});
