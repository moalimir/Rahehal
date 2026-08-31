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
      useWebRuntime: () => ({ me, mode: "network" }),
      useChallengeGateway: () => ({}),
    }));
  });

  it("labels sample pages and greets the signed-in user in the connected runtime", async () => {
    vi.doMock("@/lib/runtime/mode", () => ({
      isNetworkWebRuntime: true,
      webRuntimeMode: "network",
    }));
    const { OrganizationWorkspaceExperience } = await import("@/components/organization-workspace");

    render(<OrganizationWorkspaceExperience route={routeStub} />);

    expect(screen.getByText("داده نمونه")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Synthetic Organization Owner",
    );
    // The fixture's own name must not survive into a real session.
    expect(screen.queryByText(/سلام سارا/)).not.toBeInTheDocument();
  });

  it("stays out of the static demo, which is sample data end to end", async () => {
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
