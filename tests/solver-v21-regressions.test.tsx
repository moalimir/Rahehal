// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { InternalApp } from "@/components/internal/internal-app";
import { SolverProposalDetail } from "@/components/solver-proposals-list";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { getInternalRoute } from "@/data/internal-routes";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app/solver/opportunities?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("رگرسیون‌های رابط کاربری نسخه ۲۱", () => {
  it("نمایش فهرستی چالش‌ها را فعال و برای بازدید بعدی ذخیره می‌کند", () => {
    render(<ChallengeDiscoveryApp embedded space="team" />);
    expect(document.querySelector(".rh-challenge-grid")).toHaveAttribute("data-layout", "grid");

    fireEvent.click(screen.getByRole("button", { name: "نمایش فهرستی" }));

    expect(document.querySelector(".rh-challenge-grid")).toHaveAttribute("data-layout", "list");
    expect(screen.getByRole("button", { name: "نمایش فهرستی" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(localStorage.getItem("rahhal.solver.ui.v1:challenge-layout")).toContain('"value":"list"');
    document.querySelectorAll(".rh-challenge-card--list").forEach((card) => {
      expect(card.children).toHaveLength(3);
      expect(card.querySelector(":scope > .rh-challenge-card__primary")).toBeInTheDocument();
      expect(card.querySelector(":scope > .rh-challenge-card__facts")).toBeInTheDocument();
      expect(card.querySelector(":scope > .rh-challenge-card__actions")).toBeInTheDocument();
    });
  });

  it("پیش‌نمایش پیشنهاد از نسخه canonical همان رکورد ساخته می‌شود", () => {
    const route = getInternalRoute("/app/solver/proposals/PR-104/preview");
    expect(route).toBeDefined();
    window.history.replaceState({}, "", "/app/solver/proposals/PR-104/preview?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    render(<SolverProposalDetail proposalId="PR-104" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "سامانه بازیابی هوشمند آب صنعتی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "نسخه جاری قفل‌شده" })).toBeInTheDocument();
    expect(screen.getAllByText("PV-104-2", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "اعمال اصلاحات" }).getAttribute("href")).toContain("teamId=TEAM-21");
  });

  it("تنظیمات تیم در اولین رندر کامل است و پوسته آفست دوگانه ندارد", () => {
    document.documentElement.dataset.challengeStandalone = "true";
    window.location.hash = "/app/solver/settings?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21";
    const route = getInternalRoute("/app/solver/settings");
    render(<InternalApp route={route!} />);
    expect(screen.getByRole("heading", { level: 1, name: "تنظیمات تیم" })).toBeInTheDocument();
    expect(screen.getByText("عضویت و اختیار پیشنهاد")).toBeInTheDocument();
    expect(document.querySelector(".rh-settings-page")).toHaveAttribute(
      "data-layout-ready",
      "true",
    );

    const workspaceCss = readFileSync("app/solver-workspace.css", "utf8");
    const shellCss = readFileSync("app/app-shell.css", "utf8");
    expect(workspaceCss).toMatch(/\.rh-settings-page[\s\S]*?contain:\s*none/);
    expect(workspaceCss).not.toContain("padding-inline-start: var(--app-sidebar-width)");
    expect(shellCss).toMatch(
      /\.unified-main[\s\S]*?inline-size:\s*calc\(100% - var\(--app-sidebar-width\)\)/,
    );
    expect(shellCss).toMatch(
      /\.unified-main[\s\S]*?margin-inline-start:\s*var\(--app-sidebar-width\)/,
    );
  });

  it("خط استپر ورود یک‌بارمصرف و بازیابی فقط بین مرحله‌ها قرار می‌گیرد", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.solver-code-stepper--2::before[\s\S]*?inset-inline:\s*25%/);
    expect(css).toMatch(
      /\.solver-code-stepper--3::before[\s\S]*?inset-inline:\s*calc\(100% \/ 6\)/,
    );
    expect(css).toMatch(
      /\.solver-code-stepper li:not\(:last-child\)::after[\s\S]*?display:\s*none/,
    );
  });

  it("دعوت‌نامه تیمی جزئیات نقش، تعهد، مالکیت فکری و رد دلیل‌دار دارد", () => {
    window.history.replaceState({}, "", "/app/solver/invitations?space=individual&workspaceId=WS-PERSONAL-001");
    render(<SolverProfileExperience section="invitations" embedded space="individual" />);
    expect(screen.getByText("مدیر پیشنهاد")).toBeInTheDocument();
    expect(screen.getByText("هفته‌ای ۸ ساعت تا پایان پایلوت")).toBeInTheDocument();
    expect(screen.getByText(/دانش پیشین متعلق به صاحب آن/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "رد دعوت" }));
    expect(screen.getByRole("dialog", { name: "رد دعوت عضویت" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت رد دعوت" })).toBeDisabled();
  });

  it("کارت سازمان تدوین راه‌حل لوگو و مشخصات را در ستون‌های مستقل نگه می‌دارد", () => {
    const source = readFileSync("components/solver-proposal-wizard.tsx", "utf8");
    const css = readFileSync("app/solver-workspace.css", "utf8");
    expect(source).toContain('className="rh-wizard-challenge__logo"');
    expect(source).toContain('className="rh-wizard-challenge__meta"');
    expect(css).toMatch(/\.rh-wizard-challenge__logo[\s\S]*?overflow:\s*hidden/);
  });
});
