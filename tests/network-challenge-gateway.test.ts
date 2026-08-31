import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeSuccessEnvelope } from "@rahhal/contracts";
import {
  buildApiMeta,
  buildChallengeResource,
  buildErrorEnvelope,
  buildMutationSuccess,
} from "@rahhal/testkit";
import {
  parseChallengeId,
  parseChallengeVersionId,
  parseCorrelationId,
  parseWorkspaceId,
} from "@rahhal/domain";
import { createNetworkChallengeGateway } from "@/lib/challenges/adapters/network";

const meta = buildApiMeta({
  server_time: "2026-08-28T10:00:00.000Z",
  correlation_id: parseCorrelationId("cor_a3_network_gateway"),
  entity_version: 1,
});

const workspaceId = parseWorkspaceId("wsp_org_alpha");

/** `fetch` is stubbed with the narrow shape this gateway actually calls. */
type GatewayFetch = (input: string, init?: RequestInit) => Promise<Response>;

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
      id: parseChallengeId("chl_a3_gateway_created"),
      workspace_id: workspaceId,
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
      jsonResponse(buildMutationSuccess({ entity_id: resource.id, next_actions: ["edit"] }, meta)),
      jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
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

    expect(result).toMatchObject({
      ok: true,
      data: { id: resource.id, title: resource.content.title },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const createCall = fetchMock.mock.calls[0];
    if (!createCall) throw new Error("the gateway must issue a create request");
    const [createPath, createInit] = createCall;
    expect(createPath).toBe("/api/v1/challenges");
    expect(createInit?.headers).toMatchObject({
      "x-workspace-id": workspaceId,
      "idempotency-key": "web-challenge-create-00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.parse(String(createInit?.body))).toMatchObject({
      expected_version: 0,
      draft: { title: resource.content.title },
    });
  });

  /**
   * The two units the gateway is responsible for translating. A wrong-direction
   * wiring still satisfies the helpers' own unit tests, so the direction is
   * asserted here, on the wire.
   */
  it("sends budget as minor units and the deadline as the end of its Tehran day", async () => {
    const resource = buildChallengeResource({
      id: parseChallengeId("chl_a3_gateway_units"),
      workspace_id: workspaceId,
      content: {
        title: "کاهش مصرف بخار",
        budget: { status: "fixed", amount_minor: 85_000_000_000, currency: "IRR" },
        proposal_deadline: "2030-02-01T20:29:59.999Z",
      },
    });
    const responses = [
      jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: resource.id, next_actions: ["edit"] }, meta)),
      jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
    const loaded = await gateway.queries.get(resource.id);
    if (!loaded.ok) throw new Error("the gateway must load the seeded resource");

    // Read back: the person sees the major unit and the plain calendar date.
    expect(loaded.data.budgetAmount).toBe("850000000");
    expect(loaded.data.proposalDeadline).toBe("2030-02-01");

    await gateway.commands.save(loaded.data);

    const saveCall = fetchMock.mock.calls[1];
    if (!saveCall) throw new Error("the gateway must issue a save request");
    const body = JSON.parse(String(saveCall[1]?.body));
    expect(body.patch.budget).toMatchObject({ amount_minor: 85_000_000_000, currency: "IRR" });
    expect(body.patch.proposal_deadline).toBe("2030-02-01T20:29:59.999Z");
  });

  it("surfaces stale versions as typed conflicts and never falls back to fixtures", async () => {
    const resource = buildChallengeResource({
      id: parseChallengeId("chl_a3_gateway_conflict"),
      version: 4,
    });
    const conflict = buildErrorEnvelope(
      {
        code: "CONFLICT",
        message: "stale",
        current_version: 5,
        recovery: "refetch_and_retry",
      },
      meta,
    );
    const fetchMock = vi
      .fn<GatewayFetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: resource, meta } satisfies ChallengeSuccessEnvelope),
      )
      .mockResolvedValueOnce(jsonResponse(conflict, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
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

  it("publishes through the server command and reflects the published stage", async () => {
    const challengeId = parseChallengeId("chl_b4_gateway_publish");
    const approved = buildChallengeResource({
      id: challengeId,
      workspace_id: workspaceId,
      stage: "approvals",
      version: 4,
    });
    const published = buildChallengeResource({
      id: challengeId,
      workspace_id: workspaceId,
      stage: "published",
      published_version_id: approved.current_version_id,
      version: 5,
    });
    const responses = [
      jsonResponse({ ok: true, data: approved, meta } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: challengeId, next_actions: [] }, meta)),
      jsonResponse({ ok: true, data: published, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
    // The gateway only knows the version it last read, so the record has to be
    // loaded before the command -- exactly as the UI does it.
    await gateway.queries.get(challengeId);
    const result = await gateway.commands.publish(challengeId);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.status).toBe("published");

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/challenges/${challengeId}:publish`);
    expect(init?.method).toBe("POST");
    // The command carries the version it read, so a concurrent edit is a
    // server-side conflict rather than a silent overwrite.
    expect(JSON.parse(String(init?.body))).toEqual({ expected_version: 4 });
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-workspace-id"]).toBe(workspaceId);
    expect(headers["idempotency-key"]).toBeTruthy();
  });

  it("surfaces a refused publish as a typed error and never publishes locally", async () => {
    const challengeId = parseChallengeId("chl_b4_gateway_refused");
    const approved = buildChallengeResource({
      id: challengeId,
      workspace_id: workspaceId,
      stage: "approvals",
      version: 4,
    });
    const responses = [
      jsonResponse({ ok: true, data: approved, meta } satisfies ChallengeSuccessEnvelope),
      // Under-approved, or the actor is not org:publisher -- either way the
      // server refuses and the browser must not invent a published state.
      jsonResponse(buildErrorEnvelope({ code: "INVALID_STATE" }, meta), 409),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000003" });

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
    await gateway.queries.get(challengeId);
    const result = await gateway.commands.publish(challengeId);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to publish without an active workspace and never calls the API", async () => {
    const fetchMock = vi.fn<GatewayFetch>();
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => null });

    await expect(gateway.commands.publish("chl_b4_no_workspace")).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on every read when no workspace is active", async () => {
    const fetchMock = vi.fn<GatewayFetch>();
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => null });

    await expect(gateway.queries.list()).resolves.toMatchObject({
      ok: false,
      error: { code: "NO_ACCESS" },
    });
    await expect(gateway.queries.get("chl_unknown_record")).resolves.toMatchObject({
      ok: false,
      error: { code: "NO_ACCESS" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * The list used to be a hard local failure ("added to the server contract in
   * phase 2"), which is why an organization saw nothing after publishing. It
   * now reads the workspace-scoped server list.
   */
  it("lists the workspace's challenges from the server", async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          items: [
            {
              id: parseChallengeId("chl_a3_gateway_listed"),
              current_version_id: parseChallengeVersionId("chv_a3_gateway_listed"),
              stage: "published",
              authoring_status: "ready",
              publication_state: "open",
              proposal_deadline_at: "2030-02-01T20:29:59.999Z",
              version: 5,
              title: "کاهش مصرف بخار",
              category: "energy",
              ready: true,
              publication_readiness: { ready: true, satisfied: [], missing: [] },
              created_at: "2026-08-30T10:00:00.000Z",
              updated_at: "2026-08-31T10:00:00.000Z",
            },
          ],
          next_cursor: null,
        },
        meta,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const gateway = createNetworkChallengeGateway({ activeWorkspaceId: () => workspaceId });
    const result = await gateway.queries.list();

    expect(result.ok && result.data).toMatchObject([
      { id: "chl_a3_gateway_listed", title: "کاهش مصرف بخار", status: "published" },
    ]);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/challenges");
    expect(init?.headers).toMatchObject({ "x-workspace-id": workspaceId });
  });
});
