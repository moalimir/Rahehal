import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeSuccessEnvelope } from "@rahhal/contracts";
import {
  buildApiMeta,
  buildChallengeResource,
  buildErrorEnvelope,
  buildMutationSuccess,
} from "@rahhal/testkit";
import { parseChallengeId, parseCorrelationId, parseWorkspaceId } from "@rahhal/domain";
import { createNetworkChallengeGovernanceGateway } from "@/lib/challenges/adapters/network-governance";

const meta = buildApiMeta({
  server_time: "2026-08-29T10:00:00.000Z",
  correlation_id: parseCorrelationId("cor_b7_governance"),
  entity_version: 4,
});
const workspaceId = parseWorkspaceId("wsp_org_alpha");
const challengeId = parseChallengeId("chl_b7_governance_001");

type GatewayFetch = (input: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function approvalsStage() {
  return buildChallengeResource({
    id: challengeId,
    workspace_id: workspaceId,
    stage: "approvals",
    version: 4,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("B7 network challenge governance gateway", () => {
  it("records a gate against the version it read and returns the server's state", async () => {
    const recorded = {
      ...approvalsStage(),
      publication_readiness: {
        ready: false,
        satisfied: ["technical" as const],
        missing: ["legal" as const, "finance" as const, "quality" as const],
      },
    };
    const responses = [
      jsonResponse({ ok: true, data: approvalsStage(), meta } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: challengeId, next_actions: [] }, meta)),
      jsonResponse({ ok: true, data: recorded, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-00000000b701" });

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    await gateway.read(challengeId);
    const result = await gateway.recordApproval(challengeId, {
      gate: "technical",
      decision: "approved",
      reason: "بررسی فنی کامل شد.",
    });

    expect(result.ok).toBe(true);
    // The screen shows the server's readiness, never a locally inferred one.
    expect(result.ok && result.data.publication_readiness.missing).toEqual([
      "legal",
      "finance",
      "quality",
    ]);

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/challenges/${challengeId}/approvals:record`);
    expect(JSON.parse(String(init?.body))).toEqual({
      gate: "technical",
      decision: "approved",
      reason: "بررسی فنی کامل شد.",
      expected_version: 4,
    });
    expect((init?.headers as Record<string, string>)["x-workspace-id"]).toBe(workspaceId);
  });

  it("surfaces a separation-of-duty refusal without changing local state", async () => {
    const responses = [
      jsonResponse({ ok: true, data: approvalsStage(), meta } satisfies ChallengeSuccessEnvelope),
      // The server rejects a second gate from the same actor on one version.
      jsonResponse(buildErrorEnvelope({ code: "CONFLICT" }, meta), 409),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-00000000b702" });

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    await gateway.read(challengeId);
    const result = await gateway.recordApproval(challengeId, {
      gate: "quality",
      decision: "approved",
      reason: "تلاش دوم همان کاربر.",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    // No reload after a refusal: the caller keeps the state it already had.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("publishes through the server command carrying the read version", async () => {
    const published = buildChallengeResource({
      id: challengeId,
      workspace_id: workspaceId,
      stage: "published",
      version: 5,
    });
    const responses = [
      jsonResponse({ ok: true, data: approvalsStage(), meta } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: challengeId, next_actions: [] }, meta)),
      jsonResponse({ ok: true, data: published, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-00000000b703" });

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    await gateway.read(challengeId);
    const result = await gateway.publish(challengeId);

    expect(result.ok && result.data.stage).toBe("published");
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/challenges/${challengeId}:publish`);
    expect(JSON.parse(String(init?.body))).toEqual({ expected_version: 4 });
  });

  it("refuses to command a record it has not read, and without a workspace", async () => {
    const fetchMock = vi.fn<GatewayFetch>();
    vi.stubGlobal("fetch", fetchMock);

    const scoped = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    // No prior read means no known version -- commanding blind would risk
    // overwriting a change the actor never saw.
    await expect(scoped.publish(challengeId)).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });

    const unscoped = createNetworkChallengeGovernanceGateway({ activeWorkspaceId: () => null });
    await expect(unscoped.read(challengeId)).resolves.toMatchObject({
      ok: false,
      error: { code: "NO_ACCESS" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
