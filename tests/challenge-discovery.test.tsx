// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";

beforeEach(() => {
  document.documentElement.removeAttribute("data-challenge-standalone");
  window.history.replaceState({}, "", "/challenges/");
});

afterEach(cleanup);

describe("صفحه استاندارد کشف چالش‌ها", () => {
  it("پنج نوع متقاضی و لوگوی سازمان را به‌جای حرف اختصاری نمایش می‌دهد", async () => {
    render(<ChallengeDiscoveryApp />);
    const applicant = screen.getByRole("combobox", { name: "متقاضی مجاز" });
    for (const label of [
      "فرد مستقل",
      "شرکت رسمی",
      "تیم مستقل",
      "تیم دانشگاهی مستقل",
      "تیم دانشگاه تحت نظر استاد",
    ]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    fireEvent.change(applicant, { target: { value: "شرکت رسمی" } });
    await waitFor(() => expect(window.location.search).toContain("applicant="));
    expect(screen.getAllByRole("img", { name: /لوگوی/ }).length).toBeGreaterThan(0);
  });

  it("جست‌وجو، فیلتر و پاک‌کردن را روی Query canonical نگه می‌دارد", async () => {
    render(<ChallengeDiscoveryApp />);
    expect(
      screen.getByRole("heading", { level: 1, name: "کشف چالش‌های واقعی" }),
    ).toBeInTheDocument();
    await screen.findByText("۱۲ نتیجه");

    fireEvent.change(screen.getByLabelText("دسته‌بندی"), {
      target: { value: "energy-environment" },
    });
    fireEvent.change(screen.getByPlaceholderText("عنوان، خلاصه، دسته‌بندی یا شناسه"), {
      target: { value: "آب" },
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/challenges/");
      expect(window.location.search).toContain("category=energy-environment");
      expect(window.location.search).toContain("q=%D8%A2%D8%A8");
    });
    expect(screen.getByLabelText("فیلترهای فعال")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "پاک‌کردن فیلترها" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("انتخاب مقایسه را به Query متصل و لینک جزئیات واقعی ایجاد می‌کند", async () => {
    render(<ChallengeDiscoveryApp />);
    await screen.findByText("۱۲ نتیجه");
    const compareBoxes = screen.getAllByRole("checkbox", { name: "مقایسه" });
    fireEvent.click(compareBoxes[0]);
    fireEvent.click(compareBoxes[1]);
    expect(screen.getByRole("heading", { level: 2, name: "مقایسه چالش‌ها" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain("compare="));
    expect(screen.getAllByRole("link", { name: "مشاهده جزئیات" })[0]).toHaveAttribute(
      "href",
      "/challenges/smart-water-recovery",
    );
  });

  it("جزئیات چالش بسته را بدون CTA ارسال نمایش می‌دهد", async () => {
    render(<ChallengeDiscoveryApp challengeKey="boiler-emission" />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "کاهش آلایندگی بویلر بدون افت راندمان",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("این چالش بسته شده و دریافت راه‌حل جدید فعال نیست."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ورود و شروع همکاری" })).not.toBeInTheDocument();
  });
});
