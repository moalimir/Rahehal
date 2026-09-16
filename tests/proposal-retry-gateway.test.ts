import { afterEach, describe, expect, it, vi } from "vitest";
import { createProposalGateway } from "@/lib/workspace/gateways";

afterEach(() => vi.unstubAllGlobals());

describe("proposal retry transport", () => {
  it("preserves explicit replay keys and active workspace headers for save, submit and resubmit", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: {}, meta: {} }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const gateway = createProposalGateway({ activeWorkspaceId: () => "wsp_solver_test" });
    // A fresh Response is needed for each consumed JSON stream.
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, data: {}, meta: {} }), {
          headers: { "content-type": "application/json" },
        }),
    );
    await gateway.patch("prp_test", {
      expectedVersion: 1,
      patch: { title: "تازه" },
      commandKey: "same-save-key",
    });
    await gateway.submit("prp_test", {
      expectedVersion: 2,
      acceptedChallengeVersionId: "chv_test",
      commandKey: "same-submit-key",
    });
    await gateway.resubmit("prp_test", {
      expectedVersion: 3,
      acceptedChallengeVersionId: "chv_test",
      revisionRequestId: "rev_test",
      commandKey: "same-revision-key",
    });
    for (const [index, key] of [
      "same-save-key",
      "same-submit-key",
      "same-revision-key",
    ].entries()) {
      const init = fetch.mock.calls[index]![1] as RequestInit;
      expect(init.headers).toMatchObject({
        "idempotency-key": key,
        "x-workspace-id": "wsp_solver_test",
      });
      expect(JSON.parse(String(init.body))).not.toHaveProperty("commandKey");
    }
  });
});
