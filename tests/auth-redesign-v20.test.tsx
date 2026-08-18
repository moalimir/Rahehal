// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PortalPage } from "@/components/portal-page";
import { getPublicProductRoute } from "@/data/public-product-routes";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.challengeStandalone = "true";
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("صفحات احراز هویت نسخه ۲۰", () => {
  it("بازیابی رمز هویت انسانی را در سه مرحله واقعی اجرا می‌کند", async () => {
    window.location.hash = "/auth/recovery?account=team";
    render(<PortalPage definition={getPublicProductRoute("/auth/recovery")!} />);

    expect(await screen.findByRole("heading", { name: "بازنشانی رمز عبور" })).toBeInTheDocument();
    expect(screen.getByText(/تیم رمز مستقل ندارد/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /بازیابی حساب تیمی/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "ایمیل یا شماره همراه" }), {
      target: { value: "member@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ارسال کد تأیید/ }));
    expect(screen.getByRole("heading", { name: "تأیید کد بازیابی" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("کد تأیید پنج‌رقمی"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^تأیید کد/ }));
    expect(screen.getByRole("heading", { name: "انتخاب رمز جدید" })).toBeInTheDocument();
  });

  it("ورود یک‌بارمصرف را برای هویت واحد تکمیل و به فضای معتبر هدایت می‌کند", async () => {
    window.location.hash = "/auth/otp?role=solver&account=team";
    render(<PortalPage definition={getPublicProductRoute("/auth/otp")!} />);

    expect(
      await screen.findByRole("heading", { name: "ورود با کد یک‌بار مصرف" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/فضای شخصی و تیم‌های دارای عضویت فعال/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حساب تیمی/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "ایمیل یا شماره همراه" }), {
      target: { value: "member@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ارسال کد ورود/ }));
    fireEvent.change(screen.getByLabelText("کد ورود پنج‌رقمی"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأیید و ورود" }));
    expect(localStorage.getItem("rahhal.session.v1")).toContain('"userId":"USR-SOLVER-001"');
    expect(window.location.hash).toContain("/app/solver/dashboard?space=individual");
    expect(window.location.hash).toContain("workspaceId=WS-PERSONAL-001");
  });
});
