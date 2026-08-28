import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeSuccessEnvelope, ErrorEnvelope, MutationSuccessEnvelope } from "@rahhal/contracts";
import { buildChallengeResource } from "@rahhal/testkit";
import { createNetworkChallengeGateway } from "@/lib/challenges/adapters/network";

const meta = {
  server_time: "2026-08-28T10:00:00.000Z",
  correlation_id: "cor_a3_network_gateway",
  entity_version: 1,
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("A3 network challenge gateway", () => {
  it("creates through the API receipt, reads the authoritative resource, and sends workspace scope", async () => {
    const resource = buildChallengeResource({
      id: "chl_a3_gateway_created",
      workspace_id: "wsp_org_alpha",
      content: {
        title: "کاهش اتلاف انرژی در خط تولید",
        summary: "شرح معتبر برای پیش‌نویس متصل",
        category: "انرژی و بهره‌وری",
        location: "کارخانه یک",
        desired_outcome: "کاهش سنجش‌پذیر اتلاف انرژی",
        contact: { name: "مالک مصنوعی", email: "", phone: "" },
      },
    });
    const responses = [
      jsonResponse({
        ok: true,
        data: {
          entity_id: resource.id,
          receipt_id: "rcp_a3_gateway_create",
          audit_event_id: "aud_a3_gateway_create",
          timestamp: meta.server_time,
          idempotent: false,
          next_actions: ["edit"],
        },
        meta,
      } satisfies MutationSuccessEnvelope),
      jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => "wsp_org_alpha" });
    const result = await gateway.commands.create({
      title: resource.content.title,
      summary: resource.content.summary,
      category: resource.content.category,
      location: resource.content.location,
      ownerName: resource.content.contact.name,
      desiredOutcome: resource.content.desired_outcome,
      urgency: "normal",
      attachments: [],
    });

    expect(result).toMatchObject({ ok: true, data: { id: resource.id, title: resource.content.title } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/challenges");
    const createInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(createInit.headers).toMatchObject({
      "x-workspace-id": "wsp_org_alpha",
      "idempotency-key": "web-challenge-create-00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      expected_version: 0,
      draft: { title: resource.content.title },
    });
  });

  it("surfaces stale versions as typed conflicts and never falls back to fixtures", async () => {
    const resource = buildChallengeResource({ id: "chl_a3_gateway_conflict", version: 4 });
    const conflict = {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "stale",
        current_version: 5,
        recovery: "refetch_and_retry",
      },
      meta,
    } as unknown as ErrorEnvelope;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
      )
      .mockResolvedValueOnce(jsonResponse(conflict, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => "wsp_org_alpha" });
    const loaded = await gateway.queries.get(resource.id);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("authoritative resource must load");
    const saved = await gateway.commands.save({ ...loaded.data, title: "ویرایش همزمان" });

    expect(saved).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", current_version: 5, recovery: "refetch_and_retry" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when no active workspace or list contract exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => null });

    await expect(gateway.queries.list()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_STATE" },
    });
    await expect(gateway.queries.get("chl_unknown_record")).resolves.toMatchObject({
      ok: false,
      error: { code: "NO_ACCESS" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
