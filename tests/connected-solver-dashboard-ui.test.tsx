// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectedSolverDashboard } from "@/components/solver/connected-dashboard";

const testState = vi.hoisted(() => ({
  workspaceName: "فضای شخصی آزمایشی",
  runtime: {
    mode: "network",
    me: { user: { display_name: "حل‌گر آزمایشی" } },
  },
  dashboard: {
    state: {
      kind: "ready",
      data: {
        profile: null,
        proposals: { drafts: 0, submitted: 0, inReview: 0, needsAction: 0 },
        proposalRows: [],
        challengeTitles: new Map<string, string>(),
        team: null,
        unreadNotifications: 0,
        failures: [],
      } as unknown as {
        profile: null;
        proposals: { drafts: number; submitted: number; inReview: number; needsAction: number };
        proposalRows: Array<{
          id: string;
          challenge_id: string;
          state: string;
          tracking_code: string | null;
          version: number;
          updated_at: string;
        }>;
        challengeTitles: Map<string, string>;
        team: { name: string; version: number; members: never[] } | null;
        unreadNotifications: number | null;
        failures: never[];
      },
    },
    refresh: vi.fn(),
  },
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => testState.runtime,
}));

vi.mock("@/lib/runtime/mode", () => ({
  isNetworkWebRuntime: true,
}));

vi.mock("@/components/solver/use-connected", () => ({
  useActiveWorkspaceName: () => testState.workspaceName,
}));

vi.mock("@/components/solver/use-connected-dashboard", () => ({
  useConnectedSolverDashboard: () => testState.dashboard,
}));

describe("connected solver dashboard activity hub", () => {
  beforeEach(() => {
    testState.workspaceName = "فضای شخصی آزمایشی";
    testState.dashboard.state.data.team = null;
    testState.dashboard.state.data.proposalRows = [];
    testState.dashboard.state.data.unreadNotifications = 0;
    testState.dashboard.state.data.challengeTitles = new Map();
  });

  it("turns a zero unread count into a reassuring notification state", () => {
    render(<ConnectedSolverDashboard />);

    expect(screen.getByText("همه اعلان‌ها خوانده شده‌اند")).toBeInTheDocument();
    expect(screen.queryByText("۰ اعلان خوانده‌نشده")).not.toBeInTheDocument();
    const notificationLink = screen.getByRole("link", {
      name: "مشاهده مرکز اعلان‌ها؛ همه اعلان‌ها خوانده شده‌اند",
    });
    expect(notificationLink).toHaveAttribute("href", "/app/solver/notifications");
    expect(notificationLink).toHaveClass("rh-connected-notification-status", "is-clear");
    expect(screen.getByText(/نخستین پیش‌نویس خود را از همین فضای کاری بسازید/)).toBeVisible();
  });

  it("uses the edit path and clear action language for an actionable team proposal", () => {
    testState.workspaceName = "تیم انرژی";
    testState.dashboard.state.data.team = {
      name: "تیم انرژی",
      version: 2,
      members: [],
    };
    testState.dashboard.state.data.unreadNotifications = 3;
    testState.dashboard.state.data.proposalRows = [
      {
        id: "prp_c0ffee0000004a1b8000000000000001",
        challenge_id: "chl_energy",
        state: "clarification_requested",
        tracking_code: "RH-1405-21",
        version: 4,
        updated_at: "2026-09-06T08:00:00.000Z",
      },
    ];
    testState.dashboard.state.data.challengeTitles = new Map([["chl_energy", "کاهش مصرف انرژی"]]);

    render(<ConnectedSolverDashboard />);

    expect(screen.getByText("۳ اعلان جدید")).toBeInTheDocument();
    expect(screen.getByText("فعالیت راه‌حل‌های تیم")).toBeInTheDocument();
    expect(screen.getByText("نسخه ۴")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ادامه و اقدام" })).toHaveAttribute(
      "href",
      "/app/solver/proposals/record/edit?id=prp_c0ffee0000004a1b8000000000000001",
    );
  });
});
