// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SolverProposalVersions } from "@/components/solver-case-continuity";
import { SolverDashboardExperience } from "@/components/solver-dashboard";
import { SolverInvitationsExperience } from "@/components/solver-teams-experience";
import { getInternalRoute } from "@/data/internal-routes";
import { resetSolverDemoData } from "@/lib/solver/repository";

function at(path: string) {
  document.documentElement.removeAttribute("data-challenge-standalone");
  window.history.replaceState({}, "", path);
}

function solverRoute(path: string) {
  const route = getInternalRoute(path);
  if (!route) throw new Error(`مسیر آزمون پیدا نشد: ${path}`);
  return route;
}

beforeEach(() => {
  localStorage.clear();
  resetSolverDemoData();
  at("/app/solver/dashboard?space=individual&workspaceId=WS-PERSONAL-001");
});

afterEach(cleanup);

describe("اصلاحات رابط Solver نسخه ۲۹", () => {
  it("قهرمان داشبورد را از راست آغاز و برچسب فضای شخصی را غیر دکمه‌ای نمایش می‌دهد", () => {
    const { container } = render(<SolverDashboardExperience />);
    const contextLabel = screen.getByText("فضای شخصی");
    expect(contextLabel.tagName).toBe("SMALL");
    expect(contextLabel).toHaveClass("rh-dashboard-hero__context");
    expect(
      container.querySelector(".rh-dashboard-hero > div:not(.rh-network)"),
    ).toBeInTheDocument();
  });

  it("هر کارت خلاصه یک CTA با فیلتر وضعیت و context فضای فعال دارد", () => {
    render(<SolverDashboardExperience />);
    const expected = [
      ["مشاهده پیش‌نویس‌ها", "status=draft"],
      ["مشاهده ارسال‌شده‌ها", "status=submitted"],
      ["مشاهده موارد در حال بررسی", "status=reviewing"],
      ["مشاهده موارد نیازمند اقدام", "status=revision_requested"],
    ] as const;
    expected.forEach(([name, status]) => {
      const href = screen.getByRole("link", { name }).getAttribute("href");
      expect(href).toContain("/app/solver/proposals?");
      expect(href).toContain(status);
      expect(href).toContain("space=individual");
      expect(href).toContain("workspaceId=WS-PERSONAL-001");
    });
  });

  it("رزومه تیم دعوت‌کننده را از دعوت واقعی در دیالوگ کامل باز می‌کند", () => {
    render(<SolverInvitationsExperience />);
    fireEvent.click(screen.getByRole("button", { name: /مشاهده رزومه تیم/ }));
    const dialog = screen.getByRole("dialog", { name: /رزومه تیم دعوت‌کننده/ });
    expect(dialog).toHaveTextContent("همکاران داده زیست");
    expect(dialog).toHaveTextContent("مدیر پیشنهاد");
    expect(dialog).toHaveTextContent("احراز تیم در حال تکمیل");
    expect(screen.getByRole("button", { name: /دریافت رزومه PDF/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "بستن" }));
    expect(screen.queryByRole("dialog", { name: /رزومه تیم دعوت‌کننده/ })).not.toBeInTheDocument();
  });

  it("تاریخچه پیشنهاد timeline و diff واقعی نسخه‌های canonical را نمایش می‌دهد", () => {
    const path = "/app/solver/proposals/PR-104/versions";
    at(`${path}?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21`);
    render(<SolverProposalVersions route={solverRoute(path)} />);
    expect(screen.getByLabelText("خلاصه تاریخچه نسخه‌ها")).toHaveTextContent("نسخه ۲");
    expect(screen.getByLabelText("فهرست نسخه‌ها")).toHaveTextContent("سارا احمدی");
    const changes = screen.getByLabelText("فیلدهای تغییرکرده");
    expect(changes).toHaveTextContent("زمان‌بندی اجرا");
    expect(changes).toHaveTextContent("10");
    expect(changes).toHaveTextContent("12");
    expect(screen.queryByText("نسخه ۳")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "مشاهده جزئیات ثبت" }));
    expect(screen.getByText(/نسخه مبنا توسط سارا احمدی/)).toBeInTheDocument();
  });

  it("قرارداد CSS جهت RTL، ارتفاع کنترل، پیکان ادامه و اعلان بالای صفحه را تثبیت می‌کند", () => {
    const css = readFileSync(join(process.cwd(), "app/solver-workspace.css"), "utf8");
    expect(css).toMatch(/\.rh-dashboard-hero > div:not\(\.rh-network\)[\s\S]*?margin:\s*0;/);
    expect(css).toContain("--rh-action-height: 44px");
    expect(css).toMatch(/\.rh-wizard-actions \.rh-wizard-next-icon[\s\S]*?scaleX\(-1\)/);
    expect(css).toMatch(
      /\.rh-flow-toast[\s\S]*?top:\s*calc\(var\(--app-topbar-height, 72px\) \+ 16px\)/,
    );
    expect(css).toMatch(/\.rh-flow-toast button[\s\S]*?grid-column:\s*1/);
  });
});
