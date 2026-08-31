// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUserId, parseWorkspaceId } from "@rahhal/domain";
import { buildChallengeResource } from "@rahhal/testkit";

const workspaceId = parseWorkspaceId("wsp_governance_decision");
const resource = buildChallengeResource({
  workspace_id: workspaceId,
  stage: "approvals",
  version: 4,
});
const recordApproval = vi.fn(async () => ({
  ok: true as const,
  data: resource,
  meta: { server_time: resource.updated_at, correlation_id: "cor_governance_decision" },
}));
const governance = {
  read: async () => ({
    ok: true as const,
    data: resource,
    meta: { server_time: resource.updated_at, correlation_id: "cor_governance_read" },
  }),
  recordApproval,
};

vi.mock("@/components/runtime-provider", () => ({
  useChallengeGovernance: () => governance,
  useWebRuntime: () => ({
    me: {
      user: { id: parseUserId("usr_governance_approver") },
      active_context: { workspace_id: workspaceId },
      memberships: [
        {
          workspace_id: workspaceId,
          state: "active",
          role: "org:approver_technical",
        },
      ],
    },
  }),
}));

afterEach(() => {
  cleanup();
  recordApproval.mockClear();
});

describe("challenge governance decision", () => {
  it("lets an approver record a reasoned rejection", async () => {
    const { ChallengeGovernancePage } = await import("@/components/challenge-flow/governance-page");
    render(<ChallengeGovernancePage id={resource.id} />);

    await screen.findByRole("heading", { name: resource.content.title });
    expect(screen.getByText("۱٬۰۰۰٬۰۰۰ ریال")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "رد و درخواست اصلاح" }));
    fireEvent.change(screen.getByLabelText("دلیل ثبت تأیید فنی"), {
      target: { value: "دامنه فنی باید اصلاح شود." },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت رد تأیید فنی" }));

    await waitFor(() =>
      expect(recordApproval).toHaveBeenCalledWith(
        resource.id,
        {
          gate: "technical",
          decision: "rejected",
          reason: "دامنه فنی باید اصلاح شود.",
        },
        undefined,
      ),
    );
  });
});
