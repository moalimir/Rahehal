// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GatewayResult } from "@/lib/api/result";
import {
  announceNotificationStateChanged,
  useUnreadNotificationCount,
} from "@/lib/workspace/unread-badge";

const testState = vi.hoisted(() => ({
  unread: 0,
  summary: vi.fn(),
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    mode: "network",
    me: { active_context: { workspace_id: "wsp_test" } },
    workspaceGateways: { notifications: { summary: testState.summary } },
  }),
}));

const meta = { server_time: "2026-09-06T00:00:00.000Z", correlation_id: "cor_test_badge" };

describe("connected unread notification badge", () => {
  beforeEach(() => {
    testState.unread = 3;
    testState.summary.mockReset();
    testState.summary.mockImplementation(
      async (): Promise<GatewayResult<{ unread_count: number }>> => ({
        ok: true,
        data: { unread_count: testState.unread },
        meta,
      }),
    );
  });

  it("re-reads immediately when a notification command invalidates the count", async () => {
    const { result } = renderHook(() => useUnreadNotificationCount());
    await waitFor(() => expect(result.current).toBe(3));
    const callsBeforeInvalidation = testState.summary.mock.calls.length;

    testState.unread = 2;
    act(() => announceNotificationStateChanged());

    await waitFor(() => expect(result.current).toBe(2));
    expect(testState.summary.mock.calls.length).toBeGreaterThan(callsBeforeInvalidation);
  });
});
