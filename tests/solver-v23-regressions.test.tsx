// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { InternalApp } from "@/components/internal/internal-app";
import { SolverProposalWizard } from "@/components/solver-proposal-wizard";
import { getInternalRoute } from "@/data/internal-routes";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app/solver/opportunities/smart-water-recovery");
});

afterEach(cleanup);

describe("رگرسیون‌های رابط کاربری نسخه ۲۳", () => {
  it("فایل‌های نمونه جزئیات چالش هیچ لینک یا تغییر مسیری ندارند", () => {
    render(<ChallengeDiscoveryApp challengeKey="smart-water-recovery" />);

    expect(screen.queryByText("شرح فنی و داده‌های خط پایه")).not.toBeInTheDocument();
    expect(screen.queryByText("نقشه جانمایی تجهیزات")).not.toBeInTheDocument();
    expect(screen.getByText("دسترسی پس از پذیرش NDA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "بررسی شرایط دسترسی" })).toHaveAttribute(
      "href",
      expect.stringContaining("entity=CH-1405-021"),
    );
  });

  it("شماره مرحله همکاری در سمت راست دایره قرار می‌گیرد", () => {
    const css = readFileSync("app/solver-workspace.css", "utf8");
    expect(css).toMatch(
      /\.rh-process article > span[\s\S]*?right:\s*auto;[\s\S]*?left:\s*calc\(50% \+ 20px\)/,
    );
  });

  it("برای دو فیلد فنی نمونه و راهنمای قابل استفاده نشان می‌دهد", () => {
    render(
      <SolverProposalWizard
        path="/app/solver/proposals/new/technical"
        space="individual"
        onSubmit={() => undefined}
      />,
    );

    expect(screen.getByLabelText(/معماری و اجزای اصلی/)).toHaveAttribute(
      "placeholder",
      expect.stringContaining("حسگرها"),
    );
    expect(screen.getByLabelText(/داده و زیرساخت موردنیاز/)).toHaveAttribute(
      "placeholder",
      expect.stringContaining("دسترسی API"),
    );
    expect(screen.getByText(/اجزای نرم‌افزاری و سخت‌افزاری/)).toBeInTheDocument();
    expect(screen.getByText(/محدودیت‌های امنیتی/)).toBeInTheDocument();
  });

  it("ارسال نهایی اقدام سبز خوانا و مسیر بازگشت روشن دارد", async () => {
    const repeated =
      "این متن نمونه برای تکمیل معتبر بخش و توضیح روشن مسئله و راهکار و نتیجه مورد انتظار نوشته شده است. ";
    localStorage.setItem(
      "rahhal:proposal:CH-1405-022:team",
      JSON.stringify({
        title: "سامانه نگهداری پیش‌بینانه خط تولید",
        executiveSummary: repeated.repeat(2),
        stage: "prototype",
        prototypeWeeks: "8",
        value: repeated,
        technologies: "یادگیری ماشین، حسگر صنعتی",
        problemUnderstanding: repeated,
        technicalApproach: repeated.repeat(2),
        architecture: repeated,
        requiredData: repeated,
        successMetrics: repeated,
        ipStatus: "owned",
        milestones: repeated.repeat(2),
        durationWeeks: "12",
        pilotLocation: "خط نورد گرم",
        dependencies: repeated,
        risks: repeated,
        mitigation: repeated,
        teamLead: "علی رضایی",
        teamComposition: repeated,
        relevantExperience: repeated,
        teamAvailability: "20h",
        requestedBudget: "780000000",
        paymentModel: "milestone",
        budgetRationale: repeated,
        startAvailability: "2weeks",
        ndaAccepted: true,
        conflictDeclared: true,
        ipAccepted: true,
        accuracyConfirmed: true,
      }),
    );
    window.history.replaceState(
      {},
      "",
      "/app/solver/proposals/new/review?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21&challenge=CH-1405-022",
    );
    const route = getInternalRoute("/app/solver/proposals/new/review");
    if (!route) throw new Error("proposal review route missing");
    render(<InternalApp route={route} />);

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /صحت اطلاعات/ })).toBeChecked(),
    );
    fireEvent.click(screen.getByRole("button", { name: "ارسال نهایی راه‌حل" }));

    expect(
      screen.getByRole("heading", { name: "ارسال نهایی پیشنهاد؟" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تأیید و ارسال" })).toBeInTheDocument();
  });
});
