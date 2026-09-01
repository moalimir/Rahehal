/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function mockRuntime(network: boolean) {
  vi.doMock("@/lib/runtime/mode", () => ({
    isNetworkWebRuntime: network,
    webRuntimeMode: network ? "network" : "demo",
  }));
  vi.doMock("@/components/runtime-provider", () => ({
    useWebRuntime: () => ({ me: network ? me : null, mode: network ? "network" : "demo" }),
    useChallengeGateway: () => ({ commands: { create: vi.fn() }, queries: {} }),
  }));
}

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.doUnmock("@/lib/runtime/mode");
  vi.doUnmock("@/components/runtime-provider");
});

/**
 * The owner field is written to `contact.name` on the created challenge, so a
 * fixture default does not merely look wrong — it records a person who does not
 * exist as the owner of a real row in PostgreSQL.
 */
describe("challenge intake owner", () => {
  it("defaults to the signed-in user in the connected runtime", async () => {
    mockRuntime(true);
    const { ChallengeIntakePage } = await import("@/components/challenge-flow/intake-page");

    render(<ChallengeIntakePage />);

    const owner = screen.getByLabelText(/مالک مسئله/);
    await waitFor(() => expect(owner).toHaveValue("Synthetic Organization Owner"));
    expect(owner).not.toHaveValue("سارا نادری");
  });

  it("never overwrites a name the person typed", async () => {
    mockRuntime(true);
    const { ChallengeIntakePage } = await import("@/components/challenge-flow/intake-page");

    render(<ChallengeIntakePage />);
    const owner = screen.getByLabelText(/مالک مسئله/);
    await waitFor(() => expect(owner).toHaveValue("Synthetic Organization Owner"));

    fireEvent.change(owner, { target: { value: "همکار دیگر" } });

    expect(owner).toHaveValue("همکار دیگر");
    // The effect re-runs on every render; an untouched field would be refilled.
    await waitFor(() => expect(owner).toHaveValue("همکار دیگر"));
  });

  it("keeps the sample name in the static demo, which has no session to ask", async () => {
    mockRuntime(false);
    const { ChallengeIntakePage } = await import("@/components/challenge-flow/intake-page");

    render(<ChallengeIntakePage />);

    expect(screen.getByLabelText(/مالک مسئله/)).toHaveValue("سارا نادری");
  });
});
