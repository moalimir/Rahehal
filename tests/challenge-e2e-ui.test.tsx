// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeFlowApp } from "@/components/challenge-flow/challenge-flow-app";
import { getChallengeFlowRoute } from "@/data/challenge-flow-routes";

function route(path: string) {
  const resolved = getChallengeFlowRoute(path);
  if (!resolved) throw new Error(`Route پیدا نشد: ${path}`);
  return resolved;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.challengeStandalone = "true";
  window.location.hash = "#/app/org/challenges/new";
  Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  });
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("E2E رابط چهارمرحله‌ای مسئله سازمانی", () => {
  it("از ثبت اولیه تا رسید و بازگشت به فهرست را با Persistence کامل می‌کند", async () => {
    render(<ChallengeFlowApp route={route("/app/org/challenges/new")} />);

    fireEvent.change(screen.getByLabelText(/عنوان مسئله/), {
      target: { value: "کاهش مصرف انرژی سامانه هوای فشرده" },
    });
    fireEvent.change(screen.getByLabelText(/دسته‌بندی اصلی/), {
      target: { value: "انرژی و بهره‌وری" },
    });
    fireEvent.change(screen.getByLabelText(/شرح یک‌جمله‌ای مشکل/), {
      target: {
        value: "نشتی و تنظیم نامناسب کمپرسورها مصرف برق سامانه هوای فشرده را افزایش داده است.",
      },
    });
    fireEvent.change(screen.getByLabelText(/واحد، سایت یا محل درگیر/), {
      target: { value: "کارخانه مرکزی، واحد تأسیسات" },
    });
    fireEvent.change(screen.getByLabelText(/نتیجه‌ای که سازمان به‌دنبال آن است/), {
      target: { value: "کاهش حداقل پانزده درصدی مصرف برق بدون افت فشار شبکه" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و ادامه" }));

    await screen.findByRole("heading", { level: 1, name: "تکمیل مسئله" });
    expect(window.location.hash).toContain("/edit?step=2");
    const recordsAfterCreate = JSON.parse(
      window.localStorage.getItem("rahhal.organization-challenges.v6") || "[]",
    );
    const created = recordsAfterCreate.find(
      (record: { title: string }) => record.title === "کاهش مصرف انرژی سامانه هوای فشرده",
    );
    expect(created.id).toBe("CH-DRAFT-001");

    fireEvent.change(screen.getByLabelText(/شرح وضعیت فعلی/), {
      target: {
        value:
          "سه کمپرسور بدون توالی بهینه کار می‌کنند و نرخ نشتی شبکه در آخرین آزمون حدود بیست درصد بوده است.",
      },
    });
    fireEvent.change(screen.getByLabelText(/خروجی نهایی مورد انتظار/), {
      target: { value: "طرح بهینه‌سازی، رفع نشتی و برنامه پایلوت روی یک شاخه شبکه" },
    });
    fireEvent.click(screen.getByRole("button", { name: "افزودن معیار" }));
    fireEvent.change(screen.getByLabelText(/عنوان معیار/), { target: { value: "مصرف ویژه برق" } });
    fireEvent.change(screen.getByLabelText(/مقدار هدف/), {
      target: { value: "کاهش حداقل ۱۵ درصد" },
    });
    fireEvent.change(screen.getByLabelText(/روش اندازه‌گیری/), {
      target: { value: "مقایسه کنتور برق و دبی تولید در چهار هفته" },
    });
    fireEvent.change(screen.getByLabelText(/موارد داخل دامنه/), {
      target: { value: "کمپرسورها، خشک‌کن، شبکه اصلی و نقاط نشتی سالن تولید" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و ادامه" }));

    await waitFor(() => expect(window.location.hash).toContain("step=3"));
    fireEvent.click(screen.getByLabelText("نمونه اولیه یا PoC"));
    fireEvent.click(screen.getByLabelText("خصوصی و دعوتی"));
    fireEvent.change(await screen.findByLabelText(/دعوت‌شوندگان یا گروه هدف/), {
      target: { value: "شرکت بهینه‌سازان انرژی، دانشگاه صنعتی" },
    });
    fireEvent.click(screen.getByLabelText("تیم تخصصی"));
    fireEvent.click(screen.getByLabelText("استارتاپ یا شرکت"));
    fireEvent.click(screen.getByLabelText("هر دو"));
    fireEvent.click(
      within(screen.getByRole("group", { name: /شیوه انجام/ })).getByLabelText("ترکیبی"),
    );
    fireEvent.change(screen.getByLabelText(/مهلت دریافت پیشنهاد/), {
      target: { value: "2026-11-15" },
    });
    fireEvent.click(screen.getByLabelText("مبلغ مشخص"));
    fireEvent.change(await screen.findByPlaceholderText("مثلاً 2500000000"), {
      target: { value: "2500000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره و ادامه" }));

    await waitFor(() => expect(window.location.hash).toContain("step=4"));
    fireEvent.click(screen.getByLabelText("فقط کاربران ثبت‌شده"));
    fireEvent.click(screen.getByLabelText("توافق مشترک در قرارداد نهایی"));
    fireEvent.click(screen.getByLabelText(/صحت اطلاعات و اختیار ارسال/));
    fireEvent.click(screen.getByRole("button", { name: "مشاهده پیش‌نمایش" }));

    await screen.findByRole("heading", { level: 2, name: "پرونده هنوز آماده ارسال نیست" });
    expect(screen.getByRole("button", { name: "ارسال برای بررسی" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "بازگشت و ویرایش" }));

    const publicSummary = await screen.findByLabelText(/خلاصه عمومی مسئله/);
    fireEvent.change(publicSummary, {
      target: {
        value:
          "بهینه‌سازی مصرف انرژی سامانه هوای فشرده با تمرکز بر کنترل کمپرسورها و کاهش نشتی شبکه",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "مشاهده پیش‌نمایش" }));
    await waitFor(() =>
      expect(screen.queryByText("پرونده هنوز آماده ارسال نیست")).not.toBeInTheDocument(),
    );
    const submit = await screen.findByRole("button", { name: "ارسال برای بررسی" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button", { name: "تأیید و ارسال" }));

    await screen.findByRole("heading", { level: 2, name: "پرونده با موفقیت برای بررسی ارسال شد" });
    const finalRecords = JSON.parse(
      window.localStorage.getItem("rahhal.organization-challenges.v6") || "[]",
    );
    expect(finalRecords.find((record: { id: string }) => record.id === created.id)).toMatchObject({
      status: "under_review",
    });
    fireEvent.click(screen.getByRole("link", { name: "بازگشت به مسئله‌ها" }));
    await screen.findByText("کاهش مصرف انرژی سامانه هوای فشرده");
    expect(window.location.hash).toMatch(/#\/app\/org\/challenges\/?$/);
  });

  it("فهرست، جست‌وجو، فیلتر، جزئیات و حذف Dialog را اجرا می‌کند", async () => {
    window.location.hash = "#/app/org/challenges";
    render(<ChallengeFlowApp route={route("/app/org/challenges")} />);
    await screen.findByText("پایش هوشمند خوردگی تجهیزات");

    fireEvent.change(screen.getByPlaceholderText("جست‌وجوی عنوان یا شناسه"), {
      target: { value: "CH-1405-034" },
    });
    fireEvent.change(screen.getByLabelText("فیلتر وضعیت"), { target: { value: "under_review" } });
    expect(screen.getByText("پایش هوشمند خوردگی تجهیزات")).toBeInTheDocument();
    expect(screen.queryByText("بهینه‌سازی بازیافت حرارت")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "مشاهده پرونده" }));
    await screen.findByRole("heading", { level: 2, name: "خط زمانی" });
    fireEvent.click(screen.getByRole("link", { name: "بازگشت به فهرست" }));

    await screen.findByText("کاهش ضایعات بسته‌بندی");
    fireEvent.click(screen.getByRole("button", { name: /حذف پیش‌نویس کاهش ضایعات بسته‌بندی/ }));
    expect(screen.getByRole("dialog", { name: "حذف پیش‌نویس؟" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف پیش‌نویس" }));
    await waitFor(() =>
      expect(screen.queryByText("کاهش ضایعات بسته‌بندی")).not.toBeInTheDocument(),
    );
  });
});
