// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InternalApp } from "@/components/internal/internal-app";
import { PortalPage } from "@/components/portal-page";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { getInternalRoute } from "@/data/internal-routes";
import { getPublicProductRoute } from "@/data/public-product-routes";
import { readSolverState } from "@/lib/solver/repository";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app/solver/received-proposals?space=individual");
});

afterEach(cleanup);

describe("جریان پاسخ به پیشنهاد سازمان در نسخه ۲۴", () => {
  it("پذیرش دعوت را به تدوین پاسخ مستقل و غیرانحصاری هدایت می‌کند", () => {
    render(<SolverProfileExperience section="received" embedded space="individual" />);

    fireEvent.click(screen.getAllByRole("button", { name: "جزئیات پیشنهاد" })[0]);
    expect(screen.getByText(/این دعوت ممکن است برای چند فرد یا تیم ارسال شده باشد/)).toBeVisible();
    expect(screen.getByText(/انتخاب نهایی یا قرارداد ایجاد نمی‌کند/)).toBeInTheDocument();
    expect(readSolverState().directOffers.find((offer) => offer.id === "OFF-226")?.state).toBe("viewed");
    expect(screen.getAllByRole("link", { name: "تدوین پاسخ" })[0]).toHaveAttribute(
      "href",
      "/app/solver/received-proposals/OFF-226/respond?space=individual&workspaceId=WS-PERSONAL-001",
    );
  });

  it("هر سه دعوت مسیر استاتیک پاسخ فنی و مالی دارد", () => {
    for (const offerId of ["OFF-226", "OFF-218", "OFF-241"]) {
      expect(
        getInternalRoute(`/app/solver/received-proposals/${offerId}/respond`)?.experience,
      ).toBe("invitations");
    }
  });

  it("پاسخ فنی، مبلغ، زمان و شروط را اعتبارسنجی و ثبت می‌کند", () => {
    const route = getInternalRoute("/app/solver/received-proposals/OFF-226/respond");
    if (!route) throw new Error("offer response route missing");
    render(<InternalApp route={route} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "تدوین پاسخ به پیشنهاد همکاری" }),
    ).toBeInTheDocument();
    expect(screen.getByText("این دعوت انحصاری نیست")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ پیشنهادی برای سازمان" }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(3);

    const complete =
      "راهکار پیشنهادی شامل تحلیل داده صنعتی، طراحی پایلوت کنترل‌شده و سنجش نتیجه با شاخص‌های روشن و قابل تأیید است.";
    fireEvent.change(screen.getByLabelText(/رویکرد و ارزش پیشنهادی/), {
      target: { value: complete },
    });
    fireEvent.change(screen.getByLabelText(/دامنه کار و خروجی‌های پیشنهادی/), {
      target: { value: complete },
    });
    fireEvent.change(screen.getByLabelText(/آمادگی برای شروع/), {
      target: { value: "2weeks" },
    });
    fireEvent.change(screen.getByLabelText(/مدت پیشنهادی اجرا/), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText(/مبلغ پیشنهادی کل/), {
      target: { value: "780000000" },
    });
    fireEvent.change(screen.getByLabelText(/مدل پرداخت پیشنهادی/), {
      target: { value: "milestone" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /اختیار ارسال این پاسخ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ پیشنهادی برای سازمان" }));

    expect(screen.getByRole("status")).toHaveTextContent("پاسخ به دعوت OFF-226 ثبت شد");
    expect(screen.getByText(/انتخاب نهایی یا قرارداد نیست/)).toBeInTheDocument();
    const state = readSolverState();
    expect(state.offerResponses.find((response) => response.offerId === "OFF-226")?.budget)
      .toBe("780000000");
    expect(state.directOffers.find((offer) => offer.id === "OFF-226")?.state)
      .toBe("response_submitted");
  });
});

describe("پروفایل جدید سازمان", () => {
  it("هویت، آمار، سیاست همکاری و چالش فعال را مطابق طراحی جدید نمایش می‌دهد", () => {
    const route = getPublicProductRoute("/organizations/kalleh");
    if (!route) throw new Error("kalleh public profile missing");
    render(<PortalPage definition={route} />);

    expect(screen.getByRole("heading", { level: 1, name: "کاله" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "همکاری در راه‌حل" })).toBeInTheDocument();
    expect(screen.getByLabelText("خلاصه همکاری سازمان")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "بخش‌های پروفایل سازمان" })).toHaveTextContent(
      "حوزه‌های نیاز",
    );
    expect(screen.getByRole("heading", { name: "سیاست همکاری" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "چالش‌های فعال" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /مشاهده چالش‌های فعال/ })).toHaveAttribute(
      "href",
      "/challenges?organization=kalleh",
    );
  });
});
