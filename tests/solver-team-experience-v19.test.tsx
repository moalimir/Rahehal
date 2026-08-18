// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntellectualPropertyGuidePage } from "@/components/intellectual-property-guide";
import { SolverProfileExperience } from "@/components/solver-profile-experience";
import { readSolverState } from "@/lib/solver/repository";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.challengeStandalone = "true";
  window.location.hash = "#/app/solver/teams/TEAM-21?space=team&workspaceId=WS-TEAM-21&teamId=TEAM-21";
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.challengeStandalone;
});

describe("اصلاحات تیم در نسخه ۱۹", () => {
  it("فقط نقش سازنده تیم را محافظت می‌کند و مدیر منصوب‌شده دوباره قابل تنزل است", () => {
    const firstRender = render(<SolverProfileExperience section="teams" embedded space="team" />);
    fireEvent.click(screen.getByRole("tab", { name: "اعضا" }));

    const ownerRole = screen.getByRole("combobox", { name: "نقش سارا احمدی" });
    const memberRole = screen.getByRole("combobox", { name: "نقش علی رضایی" });
    expect(ownerRole).toBeDisabled();
    expect(memberRole).not.toBeDisabled();

    fireEvent.change(memberRole, { target: { value: "contributor" } });
    expect(screen.getByRole("heading", { name: "تغییر نقش علی رضایی" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تأیید اقدام" }));
    expect(memberRole).toHaveValue("contributor");
    expect(memberRole).not.toBeDisabled();

    firstRender.unmount();
    render(<SolverProfileExperience section="teams" embedded space="team" />);
    fireEvent.click(screen.getByRole("tab", { name: "اعضا" }));
    const persistedManagerRole = screen.getByRole("combobox", { name: "نقش علی رضایی" });
    expect(persistedManagerRole).toHaveValue("contributor");
    expect(persistedManagerRole).not.toBeDisabled();

    fireEvent.change(persistedManagerRole, { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "تأیید اقدام" }));
    expect(persistedManagerRole).toHaveValue("viewer");
    expect(readSolverState().memberships.find((item) => item.id === "MEM-21-002")?.role).toBe("viewer");
  });

  it("فیلترهای تخصص، دانشگاه، شیوه همکاری، مرتب‌سازی و نوع نمایش را واقعاً اعمال می‌کند", () => {
    render(<SolverProfileExperience section="team-building" embedded space="team" />);

    expect(screen.getByRole("combobox", { name: "دانشگاه" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "دانشگاه" }), {
      target: { value: "دانشگاه صنعتی امیرکبیر" },
    });

    const results = screen.getByRole("region", { name: "متخصصان پیشنهادی" });
    expect(within(results).getByText("نگار محمدی")).toBeInTheDocument();
    expect(within(results).queryByText("مریم شریفی")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نمایش فهرستی" }));
    expect(results).toHaveClass("rh-team-building-grid--list");
    fireEvent.click(screen.getByRole("button", { name: /پاک‌کردن فیلترها/ }));
    expect(within(results).getByText("مریم شریفی")).toBeInTheDocument();
  });

  it("درخواست‌های عضویت را با رزومه و مرتب‌سازی عملی مطابق دیزاین تازه نمایش می‌دهد", () => {
    render(<SolverProfileExperience section="invitations" embedded space="team" />);
    expect(screen.getAllByText("Sara-Mohammadi-Resume.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("۹۴٪ تطابق")).not.toBeInTheDocument();
    expect(screen.getByText("پژوهشگر یادگیری ماشین با تجربه پایش صنعتی.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "پذیرش با نقش همکار" })).toBeInTheDocument();
  });

  it("راهنمای مالکیت فکری را در پوسته تیمی و با سه بخش طراحی جدید می‌سازد", () => {
    render(<IntellectualPropertyGuidePage space="team" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "راهنمای مالکیت فکری" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("وضعیت راهنما")).toHaveTextContent("نسخه‌دار");
    expect(screen.getByRole("heading", { name: "کنترل و اعتماد" })).toBeInTheDocument();
    expect(screen.getByText("اقدام حساس همیشه مسیر و تاریخچه دارد")).toBeInTheDocument();
  });
});
