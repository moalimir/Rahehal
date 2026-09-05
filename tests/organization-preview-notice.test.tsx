/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeStub = {
  prdId: "ORG-01",
  path: "/app/org/dashboard",
  role: "org" as const,
  title: "میز کار سازمان",
  experience: "dashboard" as const,
  primaryAction: "ثبت مسئله جدید",
  description: "",
  eyebrow: "",
  summary: "",
};

const me = {
  user: {
    id: "usr_owner_alpha",
    display_name: "Synthetic Organization Owner",
    primary_email: "owner-alpha@synthetic.invalid",
    email_verified: true,
  },
  memberships: [],
  workspaces: [],
  active_context: null,
};

const meta = { server_time: "2026-09-05T00:00:00.000Z", correlation_id: "cor_test_0001" };
const ok = (data: unknown) => ({ ok: true as const, data, meta });

/** Enough of the connected runtime for the dashboard to finish its reads. */
const workspaceGateways = {
  organizationProposals: { inbox: async () => ok({ items: [] }) },
  notifications: { summary: async () => ok({ unread_count: 0 }) },
};
const challengeGateway = { queries: { list: async () => ok([]) } };

// A page that is still sample data and is not a later phase, so it carries the
// notice rather than the "not in this phase" boundary.
const previewRouteStub = { ...routeStub, prdId: "ORG-10", path: "/app/org/team" };

/** Each test sets the runtime mode the component should see. */
let runtimeMode: "demo" | "network" = "network";

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.doUnmock("@/lib/runtime/mode");
  vi.doUnmock("@/components/runtime-provider");
});

/**
 * The connected shell holds both PostgreSQL-backed pages and fixture pages.
 * Nothing on screen said which was which, so a signed-in owner met another
 * person's name above counts that disagreed with their own challenge list.
 */
describe("organization workspace preview notice", () => {
  beforeEach(() => {
    vi.doMock("@/components/runtime-provider", () => ({
      useWebRuntime: () => ({ me, mode: runtimeMode, workspaceGateways, challengeGateway }),
      useChallengeGateway: () => challengeGateway,
    }));
  });

  it("greets the signed-in user and marks no notice on a live page", async () => {
    runtimeMode = "network";
    vi.doMock("@/lib/runtime/mode", () => ({
      isNetworkWebRuntime: true,
      webRuntimeMode: "network",
    }));
    const { OrganizationWorkspaceExperience } = await import("@/components/organization-workspace");

    render(<OrganizationWorkspaceExperience route={routeStub} />);

    // The dashboard reads the workspace's own challenges, proposals, and
    // notifications, so it is classified live and carries no sample-data
    // notice. Labelling a page that reads real rows as sample data is as
    // misleading as the reverse.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Synthetic Organization Owner",
    );
    expect(screen.queryByText("داده نمونه")).not.toBeInTheDocument();
    // The fixture's own name must not survive into a real session.
    expect(screen.queryByText(/سلام سارا/)).not.toBeInTheDocument();
  });

  it("still labels a page that is genuinely sample data", async () => {
    runtimeMode = "network";
    vi.doMock("@/lib/runtime/mode", () => ({
      isNetworkWebRuntime: true,
      webRuntimeMode: "network",
    }));
    const { OrganizationWorkspaceExperience } = await import("@/components/organization-workspace");

    render(<OrganizationWorkspaceExperience route={previewRouteStub} />);

    expect(screen.getByText("داده نمونه")).toBeInTheDocument();
  });

  it("stays out of the static demo, which is sample data end to end", async () => {
    runtimeMode = "demo";
    vi.doMock("@/lib/runtime/mode", () => ({
      isNetworkWebRuntime: false,
      webRuntimeMode: "demo",
    }));
    const { OrganizationWorkspaceExperience } = await import("@/components/organization-workspace");

    render(<OrganizationWorkspaceExperience route={routeStub} />);

    expect(screen.queryByText("داده نمونه")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("سلام سارا");
  });
});
