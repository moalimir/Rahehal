// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { InternalApp } from "@/components/internal/internal-app";
import { internalRoutes } from "@/data/internal-routes";
import { setReviewCoi } from "@/lib/reviews/access";

describe("پوسته داخلی و تعامل‌های حیاتی", () => {
  const orgDashboard = internalRoutes.find((route) => route.path === "/app/org/dashboard");

  it("پوسته سازمان، صف اقدام و route contract را رندر می‌کند", () => {
    if (!orgDashboard) throw new Error("ORG dashboard missing");
    render(createElement(InternalApp, { route: orgDashboard }));
    expect(
      screen.getByRole("heading", { name: /امروز ۴ اقدام نیازمند توجه است/, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("صف اقدام من")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ثبت مسئله جدید/ })).toHaveAttribute(
      "href",
      "/app/org/challenges/new",
    );
  });

  it("ثبت مسئله را به فلوی اختصاصی و نسخه‌دار هدایت می‌کند", () => {
    if (!orgDashboard) throw new Error("ORG dashboard missing");
    render(createElement(InternalApp, { route: orgDashboard }));
    expect(screen.getByRole("link", { name: /ثبت مسئله جدید/ })).toHaveAttribute(
      "href",
      "/app/org/challenges/new",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("تنظیمات سازمان را در اولین رندر کامل و آماده تعامل نمایش می‌دهد", () => {
    const settings = internalRoutes.find((route) => route.path === "/app/org/settings");
    if (!settings) throw new Error("ORG settings missing");
    const view = render(createElement(InternalApp, { route: settings }));
    expect(view.container.querySelector('[data-layout-ready="true"]')).toBeInTheDocument();
    expect(screen.getByDisplayValue("گروه مپنا")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "امنیت و ورود" }));
    expect(screen.getByText("ورود دومرحله‌ای")).toBeInTheDocument();
  });

  it("پنل داور را مستقل از پوسته سازمان رندر می‌کند", () => {
    const reviewerQueue = internalRoutes.find(
      (route) => route.path === "/app/reviewer/assignments",
    );
    if (!reviewerQueue) throw new Error("Reviewer queue missing");
    render(createElement(InternalApp, { route: reviewerQueue }));
    expect(
      screen.getByRole("heading", { name: "مأموریت‌های داوری", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("ناوبری پنل مستقل داور")).toBeInTheDocument();
  });

  it("داور پیش از اظهار تعارض از Deep Link به مدارک و امتیاز دسترسی ندارد", async () => {
    localStorage.clear();
    const score = internalRoutes.find(
      (route) => route.path === "/app/reviewer/assignments/RV-204/score",
    );
    if (!score) throw new Error("Reviewer score missing");
    const blocked = render(createElement(InternalApp, { route: score }));
    expect(await screen.findByText("محتوای داوری هنوز در دسترس نیست")).toBeInTheDocument();
    expect(screen.queryByText("تناسب راهکار با مسئله")).not.toBeInTheDocument();
    blocked.unmount();
    setReviewCoi("RV-204", "clear");
    render(createElement(InternalApp, { route: score }));
    expect(await screen.findByText("تناسب راهکار با مسئله")).toBeInTheDocument();
  });

  it("تب آینده را واقعاً غیرفعال نگه می‌دارد", () => {
    const caseOverview = internalRoutes.find(
      (route) => route.path === "/app/org/challenges/CH-1405-021/overview",
    );
    if (!caseOverview) throw new Error("Case overview missing");
    render(createElement(InternalApp, { route: caseOverview }));
    const futureLink = screen.getByRole("link", { name: /اثر/ });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(futureLink.getAttribute("aria-disabled")).toBe("true");
    expect(futureLink.dispatchEvent(event)).toBe(false);
  });
});
