// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { requestApi } from "@/lib/api/http";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("connected browser session refresh", () => {
  it("rotates an expired HttpOnly session and retries the original request once", async () => {
    const denied = new Response(
      JSON.stringify({
        ok: false,
        error: { code: "NO_ACCESS", message: "Authentication required" },
        meta: { server_time: "2026-09-05T12:00:00.000Z", correlation_id: "cor_denied" },
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-rahhal-session-refresh": "required",
        },
      },
    );
    const success = new Response(
      JSON.stringify({
        ok: true,
        data: { user: { id: "usr_solver" } },
        meta: { server_time: "2026-09-05T12:00:01.000Z", correlation_id: "cor_ok" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(denied)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(success);
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestApi<{ ok: true; data: { user: { id: string } } }>("/api/v1/me");

    expect(result).toMatchObject({ ok: true, data: { user: { id: "usr_solver" } } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/me",
      "/auth/browser/session:refresh",
      "/api/v1/me",
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "idempotency-key": expect.any(String) }),
      }),
    );
  });
});
