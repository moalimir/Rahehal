// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LandingPage } from "@/components/landing";
import { PortalPage } from "@/components/portal-page";
import { publicProductRoutes } from "@/data/public-product-routes";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(window.HTMLElement.prototype, "scrollBy", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
});

afterEach(cleanup);

describe("ناوبری واقعی لندینگ", () => {
  it("بلوک‌های حذف‌شده را نمایش نمی‌دهد و چهار مسیر ورود و ثبت‌نام مستقل دارد", () => {
    render(createElement(LandingPage));

    for (const removed of [
      "Challenge Studio",
      "ارزیابی و انتخاب منصفانه",
      "اعتماد سازمانی در معماری محصول",
      "پایلوت و اثر",
      "نمونه نمایشی",
      "شروع یک پرونده روشن",
    ]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }

    for (const link of screen.getAllByRole("link", { name: "ورود سازمان" })) {
      expect(link).toHaveAttribute("href", "/auth/organization/login");
    }
    for (const link of screen.getAllByRole("link", { name: "ورود فرد یا تیم" })) {
      expect(link).toHaveAttribute("href", "/auth/login?role=solver");
    }
    for (const link of screen.getAllByRole("link", { name: "ثبت نام سازمان" })) {
      expect(link).toHaveAttribute("href", "/auth/organization/register/representative");
    }
    for (const link of screen.getAllByRole("link", { name: "ثبت نام فرد یا تیم" })) {
      expect(link).toHaveAttribute("href", "/auth/solver/register/type");
    }
    expect(screen.getByRole("navigation", { name: "ورود و ثبت‌نام سازمان" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "ورود و ثبت‌نام فرد یا تیم" }),
    ).toBeInTheDocument();
  });

  it("هیچ لینک محصولی را به anchor یا مقصد خالی نمی‌فرستد", () => {
    const { container } = render(createElement(LandingPage));
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(30);
    for (const href of hrefs) {
      expect(href).toBeTruthy();
      expect(href).not.toBe("#");
      expect(href).not.toMatch(/^\/?#/);
      expect(href).not.toMatch(/^javascript:/);
    }
  });

  it("Header، Hero، شرکت، دسته و Footer به مقصد مستقل می‌رسند", () => {
    const { container } = render(createElement(LandingPage));
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].map(
      (link) => link.getAttribute("href") ?? "",
    );
    for (const required of [
      "/organizations",
      "/universities",
      "/how-it-works",
      "/trust-security",
      "/auth/login",
      "/app/org/challenges/new",
      "/organizations/irancell",
      "/challenges?category=energy-environment",
      "/guides/intellectual-property",
      "/legal/privacy",
      "/accessibility",
    ])
      expect(hrefs).toContain(required);
  });
});

describe("صفحات عمومی اختصاصی", () => {
  it("فهرست سازمان‌ها جست‌وجوی واقعی و کارت مقصد دارد", () => {
    const route = publicProductRoutes.find((item) => item.path === "/organizations");
    if (!route) throw new Error("organizations route missing");
    render(createElement(PortalPage, { definition: route }));
    expect(
      screen.getByRole("heading", { level: 1, name: "شرکت‌های فعال در راه‌حل" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "۴۸ شرکت" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("جست‌وجوی نام شرکت یا صنعت..."), {
      target: { value: "ایرانسل" },
    });
    expect(screen.getByRole("link", { name: /ایرانسل/ })).toHaveAttribute(
      "href",
      "/organizations/irancell",
    );
    expect(screen.queryByRole("link", { name: /دیجی‌کالا/ })).not.toBeInTheDocument();
  });

  it("فیلتر صنعت و تغییر نوع نمایش فهرست سازمان‌ها فعال است", () => {
    const route = publicProductRoutes.find((item) => item.path === "/organizations");
    if (!route) throw new Error("organizations route missing");
    const { container } = render(createElement(PortalPage, { definition: route }));

    fireEvent.click(screen.getByRole("button", { name: "انرژی" }));
    expect(screen.getByRole("link", { name: /گروه مپنا/ })).toHaveAttribute(
      "href",
      "/organizations/mapna",
    );
    expect(screen.queryByRole("link", { name: /دیجی‌کالا/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "نمایش فهرستی" }));
    expect(container.querySelector(".organization-directory__cards--list")).toBeInTheDocument();
  });

  it("ثبت‌نام انتخاب نقش را به onboarding مستقل وصل می‌کند", () => {
    const route = publicProductRoutes.find((item) => item.path === "/auth/register");
    if (!route) throw new Error("register route missing");
    render(createElement(PortalPage, { definition: route }));
    fireEvent.click(screen.getByRole("button", { name: /حل‌کننده/ }));
    expect(screen.getByRole("link", { name: "شروع مسیر حل‌کننده" })).toHaveAttribute(
      "href",
      "/onboarding/solver/contact",
    );
  });

  it("ورود سازمان و دو مرحله ثبت‌نام را با ترتیب صحیح نمایش می‌دهد", () => {
    const login = publicProductRoutes.find((item) => item.path === "/auth/organization/login");
    if (!login) throw new Error("organization login route missing");
    const { unmount } = render(createElement(PortalPage, { definition: login }));
    expect(
      screen.getByRole("heading", { level: 1, name: "ورود به حساب سازمانی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ثبت‌نام سازمان" })).toHaveAttribute(
      "href",
      "/auth/organization/register/representative",
    );
    unmount();

    const representative = publicProductRoutes.find(
      (item) => item.path === "/auth/organization/register/representative",
    );
    if (!representative) throw new Error("organization representative route missing");
    render(createElement(PortalPage, { definition: representative }));
    expect(screen.getByText("اطلاعات نماینده")).toBeInTheDocument();
    expect(screen.getByText("اطلاعات سازمان")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادامه و ثبت اطلاعات سازمان" })).toBeInTheDocument();
  });

  it("ورود حل‌کننده یک هویت انسانی و کنترل امن رمز دارد", () => {
    const login = publicProductRoutes.find((item) => item.path === "/auth/login");
    if (!login) throw new Error("solver login route missing");
    render(createElement(PortalPage, { definition: login }));

    expect(screen.getByRole("heading", { level: 1, name: "ورود حل‌کننده" })).toBeInTheDocument();
    expect(screen.getByText(/تیم رمز عبور مستقل ندارد/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حساب تیمی" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نمایش رمز عبور" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ایجاد حساب" })).toHaveAttribute(
      "href",
      "/auth/solver/register/type",
    );
  });

  it("ثبت‌نام حل‌کننده سه مرحله انسانی و پروفایل دارد", () => {
    const type = publicProductRoutes.find((item) => item.path === "/auth/solver/register/type");
    const account = publicProductRoutes.find(
      (item) => item.path === "/auth/solver/register/account",
    );
    const profile = publicProductRoutes.find(
      (item) => item.path === "/auth/solver/register/profile",
    );
    if (!type || !account || !profile) throw new Error("solver registration routes missing");

    const { unmount } = render(createElement(PortalPage, { definition: type }));
    expect(screen.getByRole("heading", { level: 1, name: "ثبت‌نام حل‌کننده" })).toBeInTheDocument();
    expect(screen.getByText(/یک حساب انسانی/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /تیم تخصصی/ })).not.toBeInTheDocument();
    unmount();

    const accountRender = render(createElement(PortalPage, { definition: account }));
    expect(screen.getByRole("heading", { level: 1, name: "اطلاعات حساب" })).toBeInTheDocument();
    expect(screen.getByText("شماره همراه")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نمایش رمز عبور" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نمایش تکرار رمز عبور" })).toBeInTheDocument();
    accountRender.unmount();

    render(createElement(PortalPage, { definition: profile }));
    expect(screen.getByRole("heading", { level: 1, name: "پروفایل تخصصی" })).toBeInTheDocument();
    expect(screen.getByText("معرفی کوتاه و توانمندی‌ها")).toBeInTheDocument();
    expect(screen.getByText("بارگذاری رزومه")).toBeInTheDocument();
  });

  it("ثبت‌نام انسانی را تکمیل و ساخت تیم را به workspace پس از ورود واگذار می‌کند", async () => {
    const type = publicProductRoutes.find((item) => item.path === "/auth/solver/register/type");
    const account = publicProductRoutes.find(
      (item) => item.path === "/auth/solver/register/account",
    );
    const profile = publicProductRoutes.find(
      (item) => item.path === "/auth/solver/register/profile",
    );
    if (!type || !account || !profile) throw new Error("solver registration routes missing");

    document.documentElement.dataset.challengeStandalone = "true";
    window.sessionStorage.clear();
    window.location.hash = "#/auth/solver/register/type";

    const typeStep = render(createElement(PortalPage, { definition: type }));
    fireEvent.click(screen.getByRole("button", { name: "ادامه و ثبت اطلاعات حساب" }));
    expect(window.location.hash).toContain("/auth/solver/register/account");
    typeStep.unmount();

    const accountStep = render(createElement(PortalPage, { definition: account }));
    fireEvent.change(screen.getByLabelText("نام و نام خانوادگی"), {
      target: { value: "علی رضایی" },
    });
    fireEvent.change(screen.getByLabelText("شماره همراه"), { target: { value: "09121234567" } });
    fireEvent.change(screen.getByLabelText("ایمیل"), { target: { value: "team@example.com" } });
    fireEvent.change(screen.getByLabelText("رمز عبور"), { target: { value: "Password123" } });
    fireEvent.change(screen.getByLabelText("تکرار رمز عبور"), { target: { value: "Password123" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه و تکمیل پروفایل" }));
    expect(window.location.hash).toContain("/auth/solver/register/profile");
    const persistedDraft = window.sessionStorage.getItem("rahhal.solver-registration") ?? "";
    expect(persistedDraft).toContain('"version":2');
    expect(persistedDraft).not.toContain("Password123");
    expect(persistedDraft).not.toContain("team@example.com");
    expect(persistedDraft).not.toContain("09121234567");
    expect(persistedDraft).not.toContain("علی رضایی");
    accountStep.unmount();

    render(createElement(PortalPage, { definition: profile }));
    fireEvent.change(screen.getByLabelText("عنوان حرفه‌ای"), {
      target: { value: "اتوماسیون و طراحی صنعتی" },
    });
    fireEvent.change(screen.getByLabelText("حوزه تخصص اصلی"), { target: { value: "engineering" } });
    fireEvent.change(screen.getByLabelText("سابقه فعالیت"), { target: { value: "3-7" } });
    fireEvent.change(
      screen.getByPlaceholderText(/درباره تخصص، تجربه و نوع مسئله‌هایی که می‌توانید حل کنید/),
      { target: { value: "تجربه طراحی، ساخت و اجرای پایلوت صنعتی دارم." } },
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "ایجاد حساب و ورود به داشبورد" }));

    await waitFor(
      () => expect(window.location.hash).toContain("/app/solver/dashboard?space=individual"),
      { timeout: 1200 },
    );
    expect(localStorage.getItem("rahhal.session.v1")).toContain('"userId":"USR-SOLVER-001"');
    expect(window.location.hash).toContain("workspaceId=WS-PERSONAL-001");
    delete document.documentElement.dataset.challengeStandalone;
  });

  it("صفحه دانشگاه‌ها دوازده دانشگاه و فیلتر واقعی دارد", () => {
    const route = publicProductRoutes.find((item) => item.path === "/universities");
    if (!route) throw new Error("universities route missing");
    render(createElement(PortalPage, { definition: route }));
    expect(screen.getByRole("heading", { level: 1, name: "تیم‌های دانشگاهی" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /مشاهده تیم‌ها/ })).toHaveLength(12);
    fireEvent.change(screen.getByPlaceholderText("جست‌وجوی دانشگاه"), {
      target: { value: "شریف" },
    });
    expect(screen.getAllByRole("link", { name: /مشاهده تیم‌ها/ })).toHaveLength(1);
    expect(screen.getByText("دانشگاه صنعتی شریف")).toBeInTheDocument();
  });
});
