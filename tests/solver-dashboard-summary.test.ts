import { describe, expect, it } from "vitest";

import type { GatewayResult } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";
import {
  countProposals,
  readSolverDashboardSummary,
  summaryScopeLost,
} from "@/lib/workspace/solver-summary";

const meta = { server_time: "2026-09-05T00:00:00.000Z", correlation_id: "cor_test_0001" };

function ok<Data>(data: Data): GatewayResult<Data> {
  return { ok: true, data, meta };
}

function denied<Data>(): GatewayResult<Data> {
  return { ok: false, error: { code: "NO_ACCESS", message: "denied" }, meta };
}

function unavailable<Data>(): GatewayResult<Data> {
  return { ok: false, error: { code: "STORAGE", message: "unavailable" }, meta };
}

function proposal(state: string) {
  return {
    id: "prp_x",
    challenge_id: "chl_x",
    state,
    tracking_code: null,
    version: 1,
    readiness: { ready: false, evaluated_version: 1, issues: [] },
    submitted_at: null,
    updated_at: "2026-09-05T00:00:00.000Z",
  };
}

function gateways(overrides: Partial<Record<string, unknown>> = {}): WorkspaceGateways {
  return {
    solverProfile: { read: async () => ok({ workspace_id: "wsp_x" }) },
    proposals: { list: async () => ok({ items: [] }) },
    notifications: { summary: async () => ok({ unread_count: 0 }) },
    team: { read: async () => ok({}) },
    organizationProposals: { inbox: async () => ok({ items: [] }), get: async () => ok({}) },
    ...overrides,
  } as unknown as WorkspaceGateways;
}

describe("C9 connected solver dashboard summary", () => {
  it("counts each proposal state into its own card", () => {
    const counts = countProposals({
      items: [
        proposal("draft"),
        proposal("revision_draft"),
        proposal("submitted"),
        proposal("resubmitted"),
        proposal("reviewing"),
        proposal("clarification_requested"),
      ],
    } as never);
    expect(counts).toEqual({ drafts: 2, submitted: 2, inReview: 1, needsAction: 1 });
  });

  it("reads every family concurrently and reports live numbers", async () => {
    const summary = await readSolverDashboardSummary(
      gateways({
        proposals: { list: async () => ok({ items: [proposal("draft"), proposal("submitted")] }) },
        notifications: { summary: async () => ok({ unread_count: 3 }) },
      }),
    );
    expect(summary.proposals).toMatchObject({ drafts: 1, submitted: 1 });
    expect(summary.unreadNotifications).toBe(3);
    expect(summary.failures).toHaveLength(0);
  });

  it("reports a failed family as null rather than zero", async () => {
    // A dashboard that shows "0 drafts" when the drafts request failed is the
    // fake-count failure C9 exists to remove, so the count must be absent.
    const summary = await readSolverDashboardSummary(
      gateways({ proposals: { list: async () => unavailable() } }),
    );
    expect(summary.proposals).toBeNull();
    expect(summary.unreadNotifications).toBe(0);
    expect(summary.failures).toEqual([
      { family: "proposals", error: { code: "STORAGE", message: "unavailable" } },
    ]);
  });

  it("degrades one card without failing the whole page", async () => {
    const summary = await readSolverDashboardSummary(
      gateways({ notifications: { summary: async () => unavailable() } }),
    );
    expect(summary.proposals).not.toBeNull();
    expect(summary.unreadNotifications).toBeNull();
    expect(summaryScopeLost(summary)).toBe(false);
  });

  it("treats an all-denied read as lost scope so the page can recover", async () => {
    const summary = await readSolverDashboardSummary(
      gateways({
        solverProfile: { read: async () => denied() },
        proposals: { list: async () => denied() },
        notifications: { summary: async () => denied() },
      }),
    );
    expect(summaryScopeLost(summary)).toBe(true);
  });

  it("does not call a revoked session lost scope when only one family denies", async () => {
    const summary = await readSolverDashboardSummary(
      gateways({ solverProfile: { read: async () => denied() } }),
    );
    expect(summaryScopeLost(summary)).toBe(false);
    expect(summary.profile).toBeNull();
  });
});
