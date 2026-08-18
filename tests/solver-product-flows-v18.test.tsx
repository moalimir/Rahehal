// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { SolverProposalWizard } from "@/components/solver-proposal-wizard";
import { getInternalRoute } from "@/data/internal-routes";
import { readProposalDraft, readSolverState } from "@/lib/solver/repository";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.challengeStandalone = "true";
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("جریان‌های اصلاح‌شده فرد و تیم در نسخه ۱۸", () => {
  it("شش صفحه مستقل تدوین راه‌حل را در مسیرهای استاتیک ثبت می‌کند", () => {
    for (const step of ["summary", "technical", "execution", "team", "budget", "review"]) {
      expect(getInternalRoute(`/app/solver/proposals/new/${step}`)?.experience).toBe(
        "proposal-builder",
      );
    }
  });

  it("مرحله خلاصه خطای دقیق همان فیلدها را پیش از ادامه نشان می‌دهد", () => {
    render(
      <SolverProposalWizard
        path="/app/solver/proposals/new/summary"
        space="individual"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "تدوین راه‌حل" })).toBeInTheDocument();
    expect(document.querySelectorAll(".rh-wizard-stepper button")).toHaveLength(6);
    fireEvent.change(screen.getByLabelText(/عنوان پیشنهادی راه‌حل/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /ذخیره و ادامه: راهکار فنی/ }));
    expect(screen.getByText(/عنوان راه‌حل باید حداقل ۵ کاراکتر/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/برای ادامه، خطاهای مشخص‌شده/);
  });

  it("پیوست proposal دارای progress است و پس از موفقیت در draft همان workspace می‌ماند", async () => {
    window.location.hash =
      "#/app/solver/proposals/new/team?space=individual&workspaceId=WS-PERSONAL-001&challenge=CH-1405-022";
    render(
      <SolverProposalWizard
        path="/app/solver/proposals/new/team"
        space="individual"
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/بارگذاری رزومه و سوابق مرتبط/) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["resume"], "proposal-resume.pdf", { type: "application/pdf" })] },
    });
    expect(
      screen.getByRole("progressbar", { name: "پیشرفت بارگذاری پیوست پیشنهاد" }),
    ).toHaveAttribute("value", "25");
    await waitFor(() =>
      expect(screen.getAllByText(/proposal-resume\.pdf/).length).toBeGreaterThan(0),
    );
    expect(readProposalDraft("CH-1405-022", "WS-PERSONAL-001")?.content.attachmentNames).toContain(
      "proposal-resume.pdf",
    );
  });

  it("فضای تیم درخواست عضویت افراد را همراه رزومه و تعیین نقش بررسی می‌کند", () => {
    window.location.hash =
      "#/app/solver/invitations?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21";
    render(<SolverProfileExperience section="invitations" embedded space="team" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "درخواست‌های عضویت" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sara-Mohammadi-Resume.pdf").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "پذیرش با نقش همکار" }));
    expect(screen.getByRole("heading", { name: /پذیرش عضویت/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تأیید اقدام" }));
    expect(screen.getByRole("status")).toHaveTextContent("عضویت پذیرفته شد");
    expect(
      readSolverState().memberships.some(
        (item) => item.userId === "USR-041" && item.teamId === "TEAM-21" && item.state === "active",
      ),
    ).toBe(true);
  });

  it("تنظیمات فردی از اولین رندر ساختار کامل و عرض قطعی دارد", () => {
    render(<SolverProfileExperience section="settings" embedded space="individual" />);
    expect(screen.getByRole("heading", { level: 1, name: "تنظیمات" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "اطلاعات حساب" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "امنیت و ورود" })).toBeInTheDocument();
    const css = readFileSync("app/solver-workspace.css", "utf8");
    const appShellCss = readFileSync("app/app-shell.css", "utf8");
    const shell = readFileSync("components/solver-shell.tsx", "utf8");
    expect(appShellCss).toMatch(
      /\.unified-main[\s\S]*?margin-inline-start:\s*var\(--app-sidebar-width\)/,
    );
    expect(css).toMatch(/\.rh-settings-page[\s\S]*?contain:\s*none/);
    expect(shell).toContain("useLayoutEffect");
  });

  it("فرم آمادگی تیم ردیف‌های تخصص و بلوغ را هم‌تراز نگه می‌دارد", () => {
    const source = readFileSync("components/portal/registration-experiences.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    expect(source).toContain("solver-registration-fields--team-profile");
    expect(source).toContain('aria-label="حوزه تخصص اصلی"');
    expect(source).toContain("مرحله بلوغ و آمادگی تیم");
    expect(css).toMatch(
      /\.solver-registration-fields--team-profile[\s\S]*?grid-template-columns:\s*repeat\(2/,
    );
    expect(css).toMatch(/organization-auth-field--matched-row[\s\S]*?grid-template-rows/);
  });
});
