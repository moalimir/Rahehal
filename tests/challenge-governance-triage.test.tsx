// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeApprovalBriefResource } from "@rahhal/contracts";
import { parseUserId, parseWorkspaceId } from "@rahhal/domain";
import { buildChallengeResource } from "@rahhal/testkit";

const workspaceId = parseWorkspaceId("wsp_governance_triage_org");
const platformWorkspaceId = parseWorkspaceId("wsp_governance_triage_platform");
const resource = buildChallengeResource({
  workspace_id: workspaceId,
  stage: "triage",
  version: 2,
});
const brief = {
  id: resource.id,
  current_version_id: resource.current_version_id,
  workspace_id: workspaceId,
  stage: "triage",
  gate: "quality",
  version: 2,
  content: {
    title: resource.content.title,
    summary: resource.content.summary,
    category: resource.content.category,
  },
  approvals: [],
  publication_readiness: resource.publication_readiness,
  updated_at: resource.updated_at,
} as const satisfies ChallengeApprovalBriefResource;

const advanceFormulation = vi.fn(async () => ({
  ok: true as const,
  data: null,
  meta: { server_time: resource.updated_at, correlation_id: "cor_governance_triage" },
}));
const navigateChallenge = vi.fn();
const governance = {
  read: async () => ({
    ok: true as const,
    data: brief,
    meta: { server_time: resource.updated_at, correlation_id: "cor_governance_triage_read" },
  }),
  advanceFormulation,
};

vi.mock("@/components/runtime-provider", () => ({
  useChallengeGovernance: () => governance,
  useWebRuntime: () => ({
    me: {
      user: { id: parseUserId("usr_governance_triage_ops") },
      active_context: { workspace_id: platformWorkspaceId },
      memberships: [
        {
          workspace_id: platformWorkspaceId,
          state: "active",
          role: "platform:ops",
        },
      ],
    },
  }),
}));

vi.mock("@/lib/challenges/navigation", () => ({ navigateChallenge }));

afterEach(() => {
  cleanup();
  advanceFormulation.mockClear();
  navigateChallenge.mockClear();
});

describe("challenge governance triage", () => {
  it("lets platform ops advance a purpose-scoped triage brief", async () => {
    const { ChallengeGovernancePage } = await import("@/components/challenge-flow/governance-page");
    render(<ChallengeGovernancePage id={resource.id} targetWorkspaceId={workspaceId} />);

    await screen.findByRole("heading", { name: resource.content.title });
    expect(screen.queryByRole("list", { name: "وضعیت دروازه‌های انتشار" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تأیید غربالگری و شروع صورت‌بندی" }));

    await waitFor(() => expect(advanceFormulation).toHaveBeenCalledWith(resource.id, workspaceId));
    expect(navigateChallenge).toHaveBeenCalledWith("/app/ops/publication");
  });
});
