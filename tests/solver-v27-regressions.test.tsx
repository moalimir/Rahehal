// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InternalApp } from "@/components/internal/internal-app";
import { SolverDashboardExperience } from "@/components/solver-dashboard";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { getInternalRoute } from "@/data/internal-routes";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.challengeStandalone = "true";
  window.location.hash = "#/app/solver/dashboard?space=individual";
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("رگرسیون‌های رابط فرد و تیم در نسخه ۲۷", () => {
  it("کارت دعوت‌نامه داشبورد دکمه مشاهده رزومه و مودال جدید دارد", () => {
    render(<SolverDashboardExperience embedded space="individual" />);
    fireEvent.click(screen.getByRole("button", { name: /مشاهده رزومه/ }));

    const dialog = screen.getByRole("dialog", {
      name: "رزومه تیم دعوت‌کننده همکاران داده زیست",
    });
    expect(dialog).toHaveTextContent("رزومه تیم دعوت‌کننده");
    expect(dialog).toHaveTextContent("تحلیل داده");
    expect(dialog).toHaveTextContent("رزومه کامل تیم");
    expect(screen.getByRole("button", { name: /دریافت رزومه PDF/ })).toBeInTheDocument();
  });

  it("صفحه دعوت‌نامه تمام اطلاعات تصمیم و مسیر رد دلیل‌دار را نشان می‌دهد", () => {
    window.location.hash = "#/app/solver/invitations?space=individual&workspaceId=WS-PERSONAL-001";
    render(<SolverProfileExperience section="invitations" embedded space="individual" />);
    expect(screen.getByRole("heading", { name: "همکاران داده زیست" })).toBeInTheDocument();
    expect(screen.getByText("پیشنهادها و پرونده‌های مرتبط با پایش آب")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "رد دعوت" }));
    expect(screen.getByRole("dialog", { name: "رد دعوت عضویت" })).toBeInTheDocument();
  });

  it("تاریخچه جدید نسخه‌ها timeline و مقایسه محتوای canonical دارد", () => {
    const route = getInternalRoute("/app/solver/proposals/PR-104/versions");
    if (!route) throw new Error("proposal versions route missing");
    window.location.hash = "#/app/solver/proposals/PR-104/versions?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21";
    render(<InternalApp route={route} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "تاریخچه نسخه‌های پیشنهاد" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("فهرست نسخه‌ها")).toHaveTextContent("نسخه ۱");
    expect(screen.getByLabelText("فهرست نسخه‌ها")).toHaveTextContent("نسخه ۲");
    expect(screen.getByLabelText("فیلدهای تغییرکرده")).toHaveTextContent("زمان‌بندی اجرا");
    expect(screen.getByLabelText("فیلدهای تغییرکرده")).toHaveTextContent("10");
    expect(screen.getByLabelText("فیلدهای تغییرکرده")).toHaveTextContent("12");
    expect(screen.getByLabelText("فهرست نسخه‌ها")).toHaveTextContent("علی رضایی");
  });

  it("تنظیمات پس از ورود از داشبورد، بازکردن دوباره و رندر مستقیم کامل می‌ماند", async () => {
    const dashboard = getInternalRoute("/app/solver/dashboard");
    const settings = getInternalRoute("/app/solver/settings");
    if (!dashboard || !settings) throw new Error("solver route missing");

    const view = render(<InternalApp route={dashboard} />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    view.rerender(<InternalApp route={settings} />);
    expect(await screen.findByRole("heading", { level: 1, name: "تنظیمات" })).toBeInTheDocument();
    expect(document.querySelector(".rh-settings-page")).toHaveAttribute("data-route-ready", "true");
    expect(screen.getByRole("heading", { level: 2, name: "اطلاعات حساب" })).toBeInTheDocument();

    view.rerender(<InternalApp route={dashboard} />);
    view.rerender(<InternalApp route={settings} />);
    expect(await screen.findByRole("button", { name: "امنیت و ورود" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "امنیت و ورود" }));
    expect(screen.getByRole("heading", { level: 2, name: "نشست‌های فعال" })).toBeInTheDocument();

    view.unmount();
    render(<InternalApp route={settings} />);
    expect(await screen.findByRole("heading", { level: 2, name: "اطلاعات حساب" })).toBeInTheDocument();
  });
});
