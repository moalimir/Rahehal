// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolverCases, SolverProposalVersions, SolverVerification } from "@/components/solver-case-continuity";
import { getInternalRoute } from "@/data/internal-routes";
import {
  isOpportunitySaved,
  SAVED_OPPORTUNITIES_EVENT,
  setOpportunitySaved,
} from "@/lib/solver/saved-opportunities";
import { identifierError, otpError, passwordError, urlError } from "@/lib/validation/user-input";
import { resetSolverDemoData } from "@/lib/solver/repository";

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  resetSolverDemoData();
  window.history.replaceState({}, "", "/app/solver/dashboard?space=individual&workspaceId=WS-PERSONAL-001");
});

function solverRoute(path: string) {
  const route = getInternalRoute(path);
  if (!route) throw new Error(`مسیر آزمون پیدا نشد: ${path}`);
  return route;
}

describe("جریان‌های محصول فرد و تیم در نسخه ۱۶", () => {
  it("برای هر ورودی پیام خطای همان فیلد را برمی‌گرداند", () => {
    expect(identifierError("09123")).toBe(
      "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود؛ نمونه: ۰۹۱۲۱۲۳۴۵۶۷",
    );
    expect(identifierError("wrong@email")).toBe("ساختار ایمیل درست نیست؛ نمونه: name@example.com");
    expect(passwordError("12345678")).toBe("رمز عبور باید دست‌کم یک حرف و یک عدد داشته باشد.");
    expect(otpError("۱۲۳")).toBe("رمز یک‌بارمصرف باید دقیقاً ۵ رقم باشد.");
    expect(urlError("rahhal.ir/profile")).toBe(
      "پیوند نمونه‌کار معتبر نیست؛ نشانی کامل را وارد کنید.",
    );
  });

  it("ذخیره فرصت را پایدار و بین نماها قابل همگام‌سازی می‌کند", () => {
    const listener = vi.fn();
    window.addEventListener(SAVED_OPPORTUNITIES_EVENT, listener);
    setOpportunitySaved("CH-1405-001", true);
    expect(isOpportunitySaved("CH-1405-001")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setOpportunitySaved("CH-1405-001", false);
    expect(isOpportunitySaved("CH-1405-001")).toBe(false);
    window.removeEventListener(SAVED_OPPORTUNITIES_EVENT, listener);
  });

  it("احراز هویت، نبود مدرک و فرمت نامعتبر را با پیام اختصاصی مشخص می‌کند", () => {
    render(<SolverVerification />);
    const uploads = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(uploads[0], { target: { files: [new File(["x"], "identity.exe")] } });
    expect(screen.getByRole("status")).toHaveTextContent("فرمت فایل باید PDF، PNG یا JPG");
    expect(screen.getByRole("button", { name: "ارسال یا ارسال مجدد مدارک" })).toBeEnabled();
  });

  it("پرداخت پرونده از milestoneهای canonical محاسبه و به workspace محدود می‌شود", () => {
    window.history.replaceState({}, "", "/app/solver/cases/CASE-127/payments?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    render(<SolverCases route={solverRoute("/app/solver/cases/CASE-127/payments")} />);
    expect(screen.getByRole("heading", { level: 1, name: "پرداخت‌های پرونده" })).toBeInTheDocument();
    expect(screen.getByText("رسید نمونه")).toBeInTheDocument();
    expect(screen.getByText("REC-PAY-127-1")).toBeInTheDocument();
  });

  it("تاریخچه نسخه پیشنهاد، نویسنده و مقایسه واقعی دارد", () => {
    window.history.replaceState({}, "", "/app/solver/proposals/PR-104/versions?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    render(<SolverProposalVersions route={solverRoute("/app/solver/proposals/PR-104/versions")} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "تاریخچه نسخه‌های پیشنهاد" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/سارا احمدی/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("فیلدهای تغییرکرده")).toBeInTheDocument();
    expect(screen.getAllByText("زمان‌بندی اجرا").length).toBeGreaterThan(0);
  });
});
