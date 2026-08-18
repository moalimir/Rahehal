// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InternalApp } from "@/components/internal/internal-app";
import { getChallengeFlowRoute } from "@/data/challenge-flow-routes";
import { getInternalRoute } from "@/data/internal-routes";

function renderOrganizationRoute(path: string) {
  const route = getInternalRoute(path);
  if (!route || route.role !== "org") throw new Error(`Organization route missing: ${path}`);
  return render(createElement(InternalApp, { route }));
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
});

afterEach(cleanup);

describe("تطابق کامل فضای سازمان با فرد و تیم در نسخه ۲۵", () => {
  it("فلو ۱: داشبورد، ناوبری و تمام مقصدهای سازمان به مسیر معتبر و اقدام قابل پیگیری می‌رسند", () => {
    const { container } = renderOrganizationRoute("/app/org/dashboard");

    expect(
      screen.getByRole("heading", { level: 1, name: /امروز ۴ اقدام نیازمند توجه است/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ثبت مسئله جدید/ })).toHaveAttribute(
      "href",
      "/app/org/challenges/new",
    );
    expect(screen.getByRole("link", { name: "مشاهده پیشنهادها" })).toHaveAttribute(
      "href",
      "/app/org/proposals",
    );
    expect(screen.getByRole("link", { name: "اعلان‌ها" })).toHaveAttribute(
      "href",
      "/app/org/notifications",
    );

    const primaryNavigation = screen.getByRole("navigation", { name: "ناوبری اصلی" });
    for (const label of [
      "داشبورد سازمان",
      "مسئله‌ها و چالش‌ها",
      "متخصصان و دعوت‌ها",
      "پیشنهادها",
      "پایلوت‌ها",
      "قرارداد و پرداخت",
      "گزارش‌ها",
      "تیم و دسترسی‌ها",
      "پروفایل سازمان",
      "تنظیمات سازمان",
    ]) {
      expect(
        within(primaryNavigation).getByRole("link", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }

    const organizationHrefs = [
      ...container.querySelectorAll<HTMLAnchorElement>('a[href^="/app/org"]'),
    ].map((link) => link.getAttribute("href")?.split("?")[0] ?? "");
    expect(organizationHrefs.length).toBeGreaterThan(15);
    for (const href of organizationHrefs) {
      expect(getInternalRoute(href) ?? getChallengeFlowRoute(href), href).toBeTruthy();
    }

    const action = screen.getByRole("button", { name: /تکمیل داوری مالی پیشنهاد PR-104/ });
    fireEvent.click(action);
    expect(action).toHaveAccessibleName(/بازگردانی/);
  });

  it("فلو ۲: کشف متخصص، مشاهده رزومه، ارسال دعوت و پیگیری وضعیت دوطرفه کامل است", () => {
    const experts = renderOrganizationRoute("/app/org/experts");
    expect(
      screen.getByRole("heading", { level: 1, name: "متخصص یا تیم مناسب را پیدا کنید" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("جست‌وجو براساس نام، تخصص یا مهارت"), {
      target: { value: "سارا محمدی" },
    });
    expect(screen.getByText("تحلیل داده و یادگیری ماشین")).toBeInTheDocument();
    expect(screen.queryByText("تصفیه و بازچرخانی آب صنعتی")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مشاهده پروفایل و رزومه" }));
    const dialog = screen.getByRole("dialog", { name: "پروفایل سارا محمدی" });
    expect(within(dialog).getByRole("button", { name: /رزومه PDF در دسترس نیست/ })).toBeDisabled();
    expect(within(dialog).getByText("پروفایل تأییدشده")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "دعوت به همکاری" }));
    expect(screen.getByRole("status")).toHaveTextContent("دعوت برای سارا محمدی ثبت شد");

    experts.unmount();
    renderOrganizationRoute("/app/org/invitations");
    expect(
      screen.getByRole("heading", { level: 1, name: "دعوت‌های ارسال‌شده" }),
    ).toBeInTheDocument();
    for (const status of ["پذیرفته‌شده", "در انتظار پاسخ", "ردشده"]) {
      expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("OFF-211")).toBeInTheDocument();
  });

  it("فلو ۳: دریافت پیشنهاد تا داوری، تصمیم، قرارداد، پایلوت، تحویل، مالی و اثر بدون شکاف مسیر دارد", () => {
    const proposals = renderOrganizationRoute("/app/org/proposals");
    expect(
      screen.getByRole("heading", { level: 1, name: "پیشنهادهای دریافتی" }),
    ).toBeInTheDocument();
    const choices = screen.getAllByRole("checkbox");
    fireEvent.click(choices[0]);
    fireEvent.click(choices[1]);
    expect(screen.getByRole("link", { name: "مقایسه انتخاب‌ها" })).toHaveAttribute(
      "href",
      "/app/org/challenges/CH-1405-021/proposals/compare",
    );
    expect(screen.getByText("PR-104 · نسخه ۳")).toBeInTheDocument();
    expect(screen.getAllByText("داوری مالی").length).toBeGreaterThan(0);
    proposals.unmount();

    const lifecycle = [
      "/app/org/challenges/CH-1405-021/proposals",
      "/app/org/challenges/CH-1405-021/proposals/compare",
      "/app/org/challenges/CH-1405-021/review",
      "/app/org/challenges/CH-1405-021/decision",
      "/app/org/challenges/CH-1405-021/contract",
      "/app/org/challenges/CH-1405-021/pilot",
      "/app/org/challenges/CH-1405-021/deliverables",
      "/app/org/challenges/CH-1405-021/finance",
      "/app/org/challenges/CH-1405-021/impact",
    ];
    for (const path of lifecycle) {
      const route = getInternalRoute(path);
      expect(route, path).toBeTruthy();
      const view = render(createElement(InternalApp, { route: route! }));
      expect(screen.getAllByText(route!.title).length, path).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it("فلو ۴: مالکیت نقش، پروفایل، تنظیمات آماده در اولین رندر و اعلان‌ها عملیاتی‌اند", () => {
    const access = renderOrganizationRoute("/app/org/access");
    expect(screen.getByLabelText("نقش سارا نادری")).toBeDisabled();
    const memberRole = screen.getByLabelText("نقش امیر توکلی");
    fireEvent.change(memberRole, { target: { value: "مشاهده‌گر" } });
    expect(screen.getByRole("status")).toHaveTextContent("نقش امیر توکلی به «مشاهده‌گر» تغییر کرد");
    expect(
      screen.getByText("مالک سازمان همیشه اختیار بازگردانی نقش‌ها را دارد"),
    ).toBeInTheDocument();
    access.unmount();

    const settings = renderOrganizationRoute("/app/org/settings");
    expect(settings.container.querySelector('[data-layout-ready="true"]')).toBeInTheDocument();
    expect(screen.getByDisplayValue("گروه مپنا")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "امنیت و ورود" }));
    expect(screen.getByText("ورود دومرحله‌ای")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    expect(screen.getByRole("status")).toHaveTextContent("تنظیمات «امنیت و ورود» ذخیره شد");
    settings.unmount();

    const profile = renderOrganizationRoute("/app/org/profile");
    fireEvent.click(screen.getByRole("button", { name: /ویرایش پروفایل/ }));
    expect(screen.getByDisplayValue("صنایع فرایندی و تولید پایدار")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ذخیره پروفایل" }));
    expect(screen.getByRole("status")).toHaveTextContent("پروفایل سازمان ذخیره شد");
    profile.unmount();

    renderOrganizationRoute("/app/org/notifications");
    fireEvent.click(screen.getByRole("button", { name: "خواندن همه" }));
    expect(screen.getAllByRole("button", { name: "خوانده‌شده" })).toHaveLength(4);
  });
});
