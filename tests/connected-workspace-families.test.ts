import { describe, expect, it } from "vitest";

import type { GatewayResult } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";
import { readNotifications } from "@/lib/workspace/notification-view";
import { readOrganizationInbox } from "@/lib/workspace/organization-inbox";
import { connectedProposalHref, readProposalRecordId } from "@/lib/workspace/proposal-navigation";
import { proposalListScopeLost, toProposalRow } from "@/lib/workspace/proposal-rows";
import { readTeamView, teamViewScopeLost } from "@/lib/workspace/team-view";

const meta = { server_time: "2026-09-05T00:00:00.000Z", correlation_id: "cor_test_0001" };

function ok<Data>(data: Data): GatewayResult<Data> {
  return { ok: true, data, meta };
}

function fail<Data>(code: string): GatewayResult<Data> {
  return { ok: false, error: { code: code as never, message: "denied" }, meta };
}

function gateways(overrides: Record<string, unknown> = {}): WorkspaceGateways {
  return {
    solverProfile: { read: async () => ok({}) },
    proposals: { list: async () => ok({ items: [] }), get: async () => ok({}) },
    notifications: {
      summary: async () => ok({ unread_count: 0 }),
      list: async () => ok({ items: [], unread_count: 0 }),
    },
    team: {
      read: async () => ok({}),
      sentInvitations: async () => ok([]),
      incomingInvitations: async () => ok([]),
      incomingRequests: async () => ok([]),
      ownRequests: async () => ok([]),
    },
    organizationProposals: { inbox: async () => ok({ items: [] }), get: async () => ok({}) },
    savedOpportunities: { list: async () => ok({ items: [] }) },
    directOffers: { list: async () => ok({ items: [] }) },
    ...overrides,
  } as unknown as WorkspaceGateways;
}

describe("C9 connected proposal rows", () => {
  it("never borrows a fixture publisher for a live challenge id", () => {
    // The public projection carries no publisher, so a connected row leaves it
    // null; showing the fixture publisher's name next to a real challenge id
    // is exactly the fake-identity failure C9 removes.
    const row = toProposalRow(
      {
        id: "prp_a",
        challenge_id: "chl_a",
        state: "draft",
        tracking_code: null,
        version: 3,
        readiness: { ready: false, evaluated_version: 3, issues: [] },
        submitted_at: null,
        updated_at: "2026-09-05T00:00:00.000Z",
      } as never,
      new Map([["chl_a", "بازیابی هوشمند آب"]]),
    );
    expect(row).toMatchObject({
      challengeTitle: "بازیابی هوشمند آب",
      publisherName: null,
      versionNumber: 3,
      trackingCode: null,
    });
  });

  it("shows the opaque id when the call is no longer publicly readable", () => {
    const row = toProposalRow(
      {
        id: "prp_a",
        challenge_id: "chl_closed",
        state: "submitted",
        tracking_code: "RH-2026-0001",
        version: 4,
        readiness: { ready: true, evaluated_version: 4, issues: [] },
        submitted_at: "2026-09-05T00:00:00.000Z",
        updated_at: "2026-09-05T00:00:00.000Z",
      } as never,
      new Map(),
    );
    expect(row.challengeTitle).toBeNull();
    expect(row.trackingCode).toBe("RH-2026-0001");
  });

  it("treats a denied list as lost scope so an empty list cannot mean denied", () => {
    expect(proposalListScopeLost({ rows: [], error: { code: "NO_ACCESS", message: "" } })).toBe(
      true,
    );
    expect(proposalListScopeLost({ rows: [], error: null })).toBe(false);
    expect(proposalListScopeLost({ rows: [], error: { code: "STORAGE", message: "" } })).toBe(
      false,
    );
  });
});

describe("C9 connected team view", () => {
  it("does not report a failure when an individual workspace has no team", async () => {
    // An individual workspace is refused the team read by design. Reporting it
    // would put an error banner on a page that is working correctly, and
    // ejecting the human would lose the invitation list they came for.
    const view = await readTeamView(
      gateways({
        team: {
          read: async () => fail("NO_ACCESS"),
          sentInvitations: async () => fail("NO_ACCESS"),
          incomingInvitations: async () => ok([{ id: "tin_a" }]),
          incomingRequests: async () => fail("NO_ACCESS"),
          ownRequests: async () => ok([]),
        },
      }),
    );
    expect(view.team).toBeNull();
    expect(view.failures).toEqual([]);
    expect(view.incomingInvitations).toHaveLength(1);
    expect(teamViewScopeLost(view)).toBe(false);
  });

  it("calls a denied own-invitation list lost scope", async () => {
    // That list is workspace-independent, so a denial there means the session
    // itself no longer holds.
    const view = await readTeamView(
      gateways({
        team: {
          read: async () => fail("NO_ACCESS"),
          sentInvitations: async () => ok([]),
          incomingInvitations: async () => fail("NO_ACCESS"),
          incomingRequests: async () => ok([]),
          ownRequests: async () => ok([]),
        },
      }),
    );
    expect(teamViewScopeLost(view)).toBe(true);
  });

  it("reports a genuine team read failure rather than hiding it", async () => {
    const view = await readTeamView(
      gateways({
        team: {
          read: async () => fail("STORAGE"),
          sentInvitations: async () => ok([]),
          incomingInvitations: async () => ok([]),
          incomingRequests: async () => ok([]),
          ownRequests: async () => ok([]),
        },
      }),
    );
    expect(view.failures.map((failure) => failure.family)).toEqual(["team"]);
  });
});

describe("C9 connected notifications", () => {
  it("takes the unread count from the response, not from the returned page", async () => {
    // The list is bounded, so counting the rows that came back would
    // under-report the moment there is a second page.
    const view = await readNotifications(
      gateways({
        notifications: {
          list: async () => ok({ items: [{ id: "ntf_a" }], unread_count: 12, next_cursor: "c2" }),
        },
      }),
    );
    expect(view.unreadCount).toBe(12);
    expect(view.items).toHaveLength(1);
    expect(view.nextCursor).toBe("c2");
  });
});

describe("C9 organization inbox", () => {
  it("keeps the row closed and resolves each call once", async () => {
    let reads = 0;
    const view = await readOrganizationInbox(
      gateways({
        organizationProposals: {
          inbox: async () => {
            reads += 1;
            return ok({
              items: [
                { id: "prp_a", challenge_id: "chl_a", state: "submitted" },
                { id: "prp_b", challenge_id: "chl_a", state: "submitted" },
              ],
            });
          },
        },
      }),
    );
    expect(reads).toBe(1);
    expect(view.rows).toHaveLength(2);
    for (const row of view.rows) expect(row.item).not.toHaveProperty("content");
  });
});

describe("C9 connected record paths", () => {
  it("rewrites a server proposal id into the pre-generated record path", () => {
    // `dynamicParams` takes a literal, so a server id can never be its own
    // static route; it travels as `?id=` exactly as challenge records do.
    expect(connectedProposalHref("/app/solver/proposals/prp_abc123/preview")).toBe(
      "/app/solver/proposals/record/preview/?id=prp_abc123",
    );
    expect(connectedProposalHref("/app/org/proposals/prp_abc123")).toBe(
      "/app/org/proposals/record/?id=prp_abc123",
    );
  });

  it("preserves an existing query and drops a conflicting id", () => {
    expect(connectedProposalHref("/app/solver/proposals/prp_abc123/edit?space=team&id=stale")).toBe(
      "/app/solver/proposals/record/edit/?id=prp_abc123&space=team",
    );
  });

  it("leaves fixture and list paths untouched", () => {
    expect(connectedProposalHref("/app/solver/proposals/PR-104/preview")).toBe(
      "/app/solver/proposals/PR-104/preview",
    );
    expect(connectedProposalHref("/app/solver/proposals")).toBe("/app/solver/proposals");
    expect(connectedProposalHref("/app/solver/proposals/new")).toBe("/app/solver/proposals/new");
  });

  it("refuses an id that is not a server proposal id", () => {
    // A record page must never fall back to a known fixture, so anything that
    // is not a server id resolves to null and the page says so.
    expect(readProposalRecordId("?id=prp_abc123")).toBe("prp_abc123");
    expect(readProposalRecordId("?id=PR-104")).toBeNull();
    expect(readProposalRecordId("?id=../../etc/passwd")).toBeNull();
    expect(readProposalRecordId("")).toBeNull();
  });
});
