// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectedSolverAuth } from "@/components/portal/connected-solver-auth";

const auth = vi.hoisted(() => ({
  activate: vi.fn(),
  resend: vi.fn(),
  signIn: vi.fn(),
  start: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({ sessionStatus: "anonymous" }),
}));

vi.mock("@/lib/auth/contact-session", () => ({
  activateSolver: auth.activate,
  resendContactVerification: auth.resend,
  signInWithVerifiedContact: auth.signIn,
  startContactVerification: auth.start,
  verifyContact: auth.verify,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/auth/login/?role=solver");
});

describe("ورود و فعال‌سازی متصل حل‌گر", () => {
  it("ورود را به‌صورت یک هویت و سه مرحله روشن نمایش می‌دهد", () => {
    render(<ConnectedSolverAuth />);

    expect(screen.getByRole("heading", { name: "ورود یا شروع همکاری" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "مرحله ۱ از ۳" })).toBeInTheDocument();
    expect(screen.getByText("یک ورود برای همه فضاهای کاری")).toBeInTheDocument();
    expect(screen.queryByLabelText(/رمز عبور/)).not.toBeInTheDocument();

    const mobile = screen.getByRole("button", { name: "شماره همراه" });
    const email = screen.getByRole("button", { name: "رایانامه" });
    expect(mobile).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(email);
    expect(email).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: /رایانامه/ })).toHaveAttribute(
      "placeholder",
      "name@example.com",
    );
  });

  it("از OTP به انتخاب توضیح‌دار شروع شخصی یا ساخت تیم می‌رسد", async () => {
    auth.start.mockResolvedValue({
      ok: true,
      data: {
        attempt_id: "attempt-1",
        version: 1,
        masked_destination: "s•••@example.test",
        attempts_remaining: 5,
        resend_available_at: new Date(Date.now() + 90_000).toISOString(),
      },
    });
    auth.verify.mockResolvedValue({
      ok: true,
      data: { verificationToken: "verified-contact", expiresAt: new Date().toISOString() },
    });
    auth.signIn.mockResolvedValue({
      ok: false,
      error: { code: "ACTIVATION_REQUIRED", message: "فعال‌سازی لازم است" },
    });

    render(<ConnectedSolverAuth />);
    fireEvent.click(screen.getByRole("button", { name: "رایانامه" }));
    fireEvent.change(screen.getByRole("textbox", { name: /رایانامه/ }), {
      target: { value: "solver@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "دریافت کد و ادامه" }));

    expect(
      await screen.findByRole("heading", { name: "کد تأیید را وارد کنید" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "مرحله ۲ از ۳" })).toBeInTheDocument();
    expect(screen.getByText("s•••@example.test")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "کد تأیید" }), {
      target: { value: "۱۲۳۴۵" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأیید و ورود" }));

    expect(
      await screen.findByRole("heading", { name: "حضور خود را در راه‌حل بسازید" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "مرحله ۳ از ۳" })).toBeInTheDocument();
    expect(screen.getByText(/تیم یک فضای کاری جداست/)).toBeInTheDocument();

    const teamIntent = screen.getByRole("button", { name: /با ساخت یک تیم/ });
    fireEvent.click(teamIntent);
    expect(teamIntent).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("textbox", { name: /نام و نام خانوادگی/ }), {
      target: { value: "حل‌گر آزمایشی" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "فعال‌سازی و ساخت تیم" })).toBeEnabled(),
    );
  });
});
