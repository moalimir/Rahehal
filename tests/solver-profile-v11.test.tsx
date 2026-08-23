// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { readSolverState } from "@/lib/solver/repository";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/app/solver/proposals?space=individual");
});

afterEach(cleanup);

describe("فضای حرفه‌ای حل‌کننده", () => {
  it("پیشنهاد دریافتی را بدون ورود مجدد به جزئیات داخلی پروژه وصل می‌کند", async () => {
    const received = render(<SolverProfileExperience section="received" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "پیشنهادهای مستقیم دریافتی" }),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "مشاهده جزئیات فرصت" })) {
      expect(link.getAttribute("href")).toMatch(/^\/app\/solver\/opportunities\//);
      expect(link.getAttribute("href")).toContain("space=individual");
      expect(link.getAttribute("href")).not.toContain("/auth/login");
    }
    const respondLinks = screen.getAllByRole("link", { name: "تدوین پاسخ" });
    expect(respondLinks[0]).toHaveAttribute(
      "href",
      "/app/solver/received-proposals/OFF-226/respond?space=individual&workspaceId=WS-PERSONAL-001",
    );
    received.unmount();
  });

  it("برای حساب فردی ابتدا تعریف تیم و برای فضای تیمی جذب عضو را نمایش می‌دهد", async () => {
    const individual = render(<SolverProfileExperience section="team-building" />);
    expect(screen.getByRole("heading", { level: 1, name: "ساخت تیم جدید" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ادامه و تعریف نیاز اعضا" }));
    expect(screen.getByRole("alert")).toHaveTextContent("نام تیم باید حداقل ۳ کاراکتر باشد");
    individual.unmount();

    window.history.replaceState(
      {},
      "",
      "/app/solver/team-building?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21",
    );
    render(<SolverProfileExperience section="team-building" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "تکمیل اعضای تیم" }),
    ).toBeInTheDocument();
    const invite = screen.getAllByRole("button", { name: "دعوت به همکاری" })[0];
    fireEvent.click(invite);
    expect(screen.getByRole("button", { name: "دعوت ارسال شد" })).toBeDisabled();
  });

  it("ساخت تیم از حساب فردی را با تعریف هدف، بلوغ و نقش موردنیاز کامل می‌کند", () => {
    render(<SolverProfileExperience section="team-building" />);
    fireEvent.change(screen.getByPlaceholderText("مثلاً تیم پایش هوشمند انرژی"), {
      target: { value: "تیم پایش سبز" },
    });
    fireEvent.change(screen.getByLabelText("حوزه اصلی فعالیت"), {
      target: { value: "انرژی و محیط‌زیست" },
    });
    fireEvent.change(screen.getByLabelText("نوع تیم"), { target: { value: "expert-team" } });
    fireEvent.change(screen.getByLabelText(/مرحله فعلی تیم/), {
      target: { value: "در حال شکل‌گیری" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "مسئله هدف، خروجی مورد انتظار و توانمندی فعلی تیم را توضیح دهید.",
      ),
      { target: { value: "طراحی راهکار پایش و کاهش مصرف انرژی در خطوط صنعتی" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "ادامه و تعریف نیاز اعضا" }));

    fireEvent.change(screen.getByLabelText("اولین نقش موردنیاز"), {
      target: { value: "تحلیلگر داده" },
    });
    fireEvent.change(screen.getByLabelText("شیوه همکاری"), {
      target: { value: "پروژه‌ای و پاره‌وقت" },
    });
    fireEvent.change(screen.getByPlaceholderText("مثلاً بینایی ماشین، پایتون و تحلیل داده صنعتی"), {
      target: { value: "پایتون و تحلیل داده صنعتی" },
    });
    fireEvent.change(screen.getByPlaceholderText("مثلاً تهران یا دورکار"), {
      target: { value: "دورکار" },
    });
    fireEvent.click(screen.getByRole("button", { name: "پیش‌نمایش و سیاست‌ها" }));
    expect(screen.getByRole("heading", { name: "سیاست ارسال و پیش‌نمایش" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تأیید و ساخت فضای تیم" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "فضای تیم آماده شد" }),
    ).toBeInTheDocument();
    const created = readSolverState().teams.find((team) => team.name === "تیم پایش سبز");
    expect(created).toBeDefined();
    expect(created?.teamKind).toBe("expert-team");
    expect(
      screen.getByRole("link", { name: "ورود به فضای تیم و جذب عضو" }).getAttribute("href"),
    ).toContain(`teamId=${created?.id}`);
  });

  it.each([
    ["تیم مستقل", { type: "تیم مستقل" }, "expert-team"],
    ["هسته استارتاپی", { type: "هسته استارتاپی" }, "expert-team"],
    ["تیم دانشگاهی", { type: "تیم دانشگاهی" }, "academic-group"],
    ["آزمایشگاه", { type: "آزمایشگاه" }, "lab"],
    ["شرکت رسمی", { type: "شرکت رسمی" }, "company"],
    ["canonical مقدم", { teamKind: "company", type: "آزمایشگاه" }, "company"],
    ["برچسب ناشناخته", { type: "تعاونی" }, ""],
  ])("draft قدیمی %s را به TeamKind پایدار تبدیل می‌کند", async (_label, value, expected) => {
    localStorage.setItem(
      "rahhal.solver.ui.v1:team-creation-draft",
      JSON.stringify({
        version: 1,
        value,
        updatedAt: "2026-08-20T10:00:00.000Z",
      }),
    );

    render(<SolverProfileExperience section="team-building" />);

    await waitFor(() => expect(screen.getByLabelText("نوع تیم")).toHaveValue(expected));
  });

  it("درخواست‌ها را با وضعیت، فیلتر و اقدام بعدی نمایش می‌دهد", async () => {
    render(<SolverProfileExperience section="proposals" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "پیشنهادها و پرونده‌های من" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("خلاصه وضعیت پیشنهادها")).toBeInTheDocument();
    expect(screen.getAllByText("نیازمند اصلاح").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("جست‌وجو در عنوان فرصت، سازمان یا شناسه"), {
      target: { value: "شوری" },
    });
    expect(screen.getAllByText("پایش شوری آب کشاورزی با حسگر کم‌هزینه").length).toBeGreaterThan(0);
  });

  it("فرصت‌های ذخیره‌شده را در فضای تیمی با قابلیت حذف می‌سازد", async () => {
    window.history.replaceState(
      {},
      "",
      "/app/solver/saved?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21",
    );
    render(<SolverProfileExperience section="saved" />);
    expect(
      await screen.findByText("چالش‌هایی که برای بررسی و اقدام بعدی در فضای تیمی ذخیره کرده‌اید."),
    ).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: /حذف .* از ذخیره‌شده‌ها/ });
    expect(removeButtons).toHaveLength(1);
    fireEvent.click(removeButtons[0]);
    expect(screen.queryAllByRole("button", { name: /حذف .* از ذخیره‌شده‌ها/ })).toHaveLength(0);
    expect(screen.getByText("فرصت ذخیره‌شده‌ای با این فیلتر وجود ندارد")).toBeInTheDocument();
  });

  it("پذیرش و رد دعوت را با بازخورد و دلیل اجباری پوشش می‌دهد", async () => {
    render(<SolverProfileExperience section="invitations" />);
    await screen.findAllByRole("button", { name: "پذیرش دعوت" });
    fireEvent.click(screen.getByRole("button", { name: "رد دعوت" }));
    const submit = screen.getByRole("button", { name: "ثبت رد دعوت" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("دلیل تصمیم را مشخص و قابل‌پیگیری بنویسید."), {
      target: { value: "در حال حاضر ظرفیت همکاری ندارم" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت رد دعوت" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      readSolverState().invitations.find((item) => item.id === "INV-301")?.decisionReason,
    ).toContain("ظرفیت همکاری");
  });

  it("پروفایل و رزومه تب‌های کامل و ذخیره تغییرات دارد", async () => {
    render(<SolverProfileExperience section="profile" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "پروفایل و رزومه" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "نمونه‌کار و مدارک" }));
    const projects = screen.getByLabelText("پروژه‌ها");
    fireEvent.change(projects, {
      target: { value: "پایش مصرف آب\nسامانه پیش‌بینی خرابی تجهیزات" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    expect(screen.getByRole("status")).toHaveTextContent("ذخیره");
  });

  it("تنظیمات حساب، اعلان، امنیت، حریم خصوصی و ترجیحات را مستقل می‌کند", async () => {
    render(<SolverProfileExperience section="settings" />);
    expect(await screen.findByRole("heading", { level: 1, name: "تنظیمات" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "امنیت و ورود" }));
    expect(screen.getByText("نشست‌های فعال")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حریم خصوصی" }));
    expect(screen.getByText(/نمایش پروفایل در نتایج جست‌وجوی سازمان‌ها/)).toBeInTheDocument();
  });
});
