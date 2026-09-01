// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionHeaderActions } from "@/components/site-header-session";

const state = vi.hoisted(() => ({
  sessionStatus: "authenticated",
  session: {
    persona: "org",
    displayName: "Synthetic Organization Owner",
    workspaceName: "Synthetic Organization Alpha",
  },
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({ sessionStatus: state.sessionStatus, me: {} }),
}));

vi.mock("@/lib/auth/network-session", () => ({
  networkInternalSession: () => state.session,
}));

afterEach(() => {
  cleanup();
  state.sessionStatus = "authenticated";
});

describe("سربرگ عمومی پس از ورود", () => {
  it("نام شخص و فضای کاری را حذف و فقط مسیر پنل نقش را نمایش می‌دهد", () => {
    render(<SessionHeaderActions fallback={<span>ورود یا ثبت‌نام</span>} />);

    expect(screen.queryByText("Synthetic Organization Owner")).not.toBeInTheDocument();
    expect(screen.queryByText("Synthetic Organization Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "پنل سازمان" })).toHaveAttribute(
      "href",
      "/app/org/challenges",
    );
  });

  it("برای بازدیدکننده ناشناس همان ورودی عمومی را نگه می‌دارد", () => {
    state.sessionStatus = "anonymous";
    render(<SessionHeaderActions fallback={<span>ورود یا ثبت‌نام</span>} />);

    expect(screen.getByText("ورود یا ثبت‌نام")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "پنل سازمان" })).not.toBeInTheDocument();
  });
});
