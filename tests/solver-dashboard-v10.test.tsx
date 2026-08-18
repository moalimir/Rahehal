// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeDiscoveryApp, challengeDiscoveryPaths } from "@/components/challenge-discovery";
import { SolverDashboardExperience } from "@/components/solver-dashboard";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app/solver/dashboard?space=individual");
});

afterEach(cleanup);

describe("داشبوردهای جدید حل‌کننده", () => {
  it("فضای فردی را با اقدام‌ها، وضعیت‌ها و فرصت‌های پیشنهادی نمایش می‌دهد", async () => {
    render(<SolverDashboardExperience />);
    expect(await screen.findByText("برای حل مسئله بعدی آماده‌اید؟")).toBeInTheDocument();
    expect(screen.getByText("خلاصه وضعیت راه‌حل‌ها")).toBeInTheDocument();
    expect(screen.getByText("فرصت‌های پیشنهادی برای شما")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "دعوت‌نامه‌های تیمی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "پیشنهادهای دریافتی" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تیم‌سازی" })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "مشاهده فرصت" })) {
      expect(link.getAttribute("href")).toMatch(/^\/app\/solver\/opportunities(?:\/|\?)/);
      expect(link.getAttribute("href")).not.toContain("/auth/login");
    }
  });

  it("انتخاب تیم را از Query می‌خواند و داشبورد مستقل تیم را می‌سازد", async () => {
    window.history.replaceState(
      {},
      "",
      "/app/solver/dashboard?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21",
    );
    render(<SolverDashboardExperience />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "تیم نوآوران صنعت" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("فرصت‌های پیشنهادی برای تیم")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "اعضای تیم" })).toBeInTheDocument();
    expect(screen.getByText("درخواست‌های پیوستن")).toBeInTheDocument();
    expect(screen.getByText(/Sara-Mohammadi-Resume\.pdf/)).toBeInTheDocument();
  });
});

describe("سناریوهای چالش و جزئیات", () => {
  it("برای هر ۱۲ چالش مسیر slug و شناسه مستقل تولید می‌کند", () => {
    expect(challengeDiscoveryPaths).toHaveLength(24);
    expect(new Set(challengeDiscoveryPaths).size).toBe(24);
  });

  it("حالت‌های ارسال، ذخیره، پیش‌نویس، بررسی، اصلاح و اولین مشاهده را کنار هم دارد", () => {
    render(<ChallengeDiscoveryApp />);
    for (const label of [
      "راه‌حل ارسال شده",
      "ذخیره‌شده",
      "پیش‌نویس راه‌حل",
      "در حال بررسی",
      "نیازمند اصلاح",
      "جدید برای شما",
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it("جزئیات هر چالش مسیر ارسال، ذخیره و الزامات کامل را نشان می‌دهد", () => {
    window.history.replaceState(
      {},
      "",
      "/app/solver/opportunities/smart-water-recovery?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21",
    );
    render(<ChallengeDiscoveryApp challengeKey="smart-water-recovery" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی" }),
    ).toBeInTheDocument();
    expect(screen.getByText("معیارهای ارزیابی")).toBeInTheDocument();
    expect(screen.getByText("فرایند همکاری")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "اعمال اصلاحات در راه‌حل" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("button", { name: "ذخیره فرصت" })).toBeInTheDocument();
  });
});
