import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChallengeApprovalBriefSuccessEnvelope,
  ChallengeSuccessEnvelope,
  PlatformChallengeApprovalQueueSuccessEnvelope,
} from "@rahhal/contracts";
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

function publishedStage(
  publicationState: "open" | "paused" | "closed" | "cancelled" = "open",
  version = 7,
) {
  return buildChallengeResource({
    id: challengeId,
    workspace_id: workspaceId,
    stage: "published",
    published_version_id: approvalsStage().current_version_id,
    publication_state: publicationState,
    proposal_deadline_at: "2030-02-01T00:00:00.000Z",
    version,
  });
}

function approvalBrief() {
  const resource = approvalsStage();
  const { contact, invitees, attachment_ids: attachmentIds, ...content } = resource.content;
  void contact;
  void invitees;
  void attachmentIds;
  return {
    id: resource.id,
    current_version_id: resource.current_version_id,
    workspace_id: resource.workspace_id,
    stage: "approvals" as const,
    version: resource.version,
    content,
    approvals: [],
    publication_readiness: resource.publication_readiness,
    updated_at: resource.updated_at,
  };
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

  it("extends a live deadline through the versioned server command", async () => {
    const extended = {
      ...publishedStage("open", 8),
      proposal_deadline_at: "2030-03-01T00:00:00.000Z",
    };
    const responses = [
      jsonResponse({ ok: true, data: publishedStage(), meta } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: challengeId, next_actions: [] }, meta)),
      jsonResponse({ ok: true, data: extended, meta } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-00000000b704" });

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    await gateway.read(challengeId);
    const result = await gateway.extendDeadline(
      challengeId,
      "2030-03-01T00:00:00.000Z",
      "زمان بیشتری برای دریافت پیشنهادهای کامل لازم است.",
    );

    expect(
      result.ok && "proposal_deadline_at" in result.data && result.data.proposal_deadline_at,
    ).toBe("2030-03-01T00:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/challenges/${challengeId}:extend-deadline`);
    expect(JSON.parse(String(init?.body))).toEqual({
      proposal_deadline: "2030-03-01T00:00:00.000Z",
      reason: "زمان بیشتری برای دریافت پیشنهادهای کامل لازم است.",
      expected_version: 7,
    });
  });

  it.each([
    ["pause", "open", "paused"],
    ["resume", "paused", "open"],
    ["close", "open", "closed"],
    ["cancel", "open", "cancelled"],
  ] as const)("sends the %s command and reloads authoritative state", async (command, from, to) => {
    const responses = [
      jsonResponse({
        ok: true,
        data: publishedStage(from),
        meta,
      } satisfies ChallengeSuccessEnvelope),
      jsonResponse(buildMutationSuccess({ entity_id: challengeId, next_actions: [] }, meta)),
      jsonResponse({
        ok: true,
        data: publishedStage(to, 8),
        meta,
      } satisfies ChallengeSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => `00000000-0000-4000-8000-${command}0000001` });

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => workspaceId,
    });
    await gateway.read(challengeId);
    const result = await gateway.changePublicationState(
      challengeId,
      command,
      "دلیل روشن و قابل حسابرسی برای تغییر وضعیت.",
    );

    expect(result.ok && "publication_state" in result.data && result.data.publication_state).toBe(
      to,
    );
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/challenges/${challengeId}:${command}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      reason: "دلیل روشن و قابل حسابرسی برای تغییر وضعیت.",
      expected_version: 7,
    });
  });

  it("uses the platform brief route and lists the active role's queue", async () => {
    const queue = {
      items: [
        {
          challenge_id: challengeId,
          current_version_id: approvalsStage().current_version_id,
          workspace_id: workspaceId,
          version: 4,
          title: "چالش آزمون",
          category: "operations",
          gate: "quality" as const,
          updated_at: "2026-08-29T10:00:00.000Z",
        },
      ],
    };
    const responses = [
      jsonResponse({
        ok: true,
        data: approvalBrief(),
        meta,
      } satisfies ChallengeApprovalBriefSuccessEnvelope),
      jsonResponse({
        ok: true,
        data: queue,
        meta,
      } satisfies PlatformChallengeApprovalQueueSuccessEnvelope),
    ];
    const fetchMock = vi.fn<GatewayFetch>(async () => responses.shift() ?? jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = createNetworkChallengeGovernanceGateway({
      activeWorkspaceId: () => parseWorkspaceId("wsp_platform_main"),
    });
    const brief = await gateway.read(challengeId, workspaceId);
    const listed = await gateway.listPendingApprovals();

    expect(brief.ok && brief.data.content).not.toHaveProperty("contact");
    expect(listed.ok && listed.data.items[0]?.gate).toBe("quality");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/platform/challenges/${challengeId}/approval-brief`,
    );
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)["x-workspace-id"],
    ).toBe(workspaceId);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/platform/challenge-approvals");
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
