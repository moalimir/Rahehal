// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SolverDirectOffersList } from "@/components/solver-direct-offer-experience";
import { SolverDataRoom, SolverVerification } from "@/components/solver-case-continuity";
import { SolverProposalDetail, SolverProposalsList } from "@/components/solver-proposals-list";
import { SolverProfileEditor, SolverSettingsEditor } from "@/components/solver-profile-settings";
import { SolverWorkspaceShell } from "@/components/solver-shell";
import { SolverInvitationsExperience, SolverTeamsOverview } from "@/components/solver-teams-experience";
import { PERSONAL_WORKSPACE_ID, PRIMARY_TEAM_ID, SECONDARY_TEAM_ID } from "@/data/solver-fixtures";
import { parseSolverContext } from "@/lib/solver/context";
import {
  activeWorkspaces,
  createTeam,
  readSolverState,
  resetSolverDemoData,
  reviewMembershipRequest,
  saveAccountSettings,
  submitCaseFeedback,
  unreadNotificationCount,
  viewDirectOffer,
} from "@/lib/solver/repository";

function at(path: string) {
  document.documentElement.removeAttribute("data-challenge-standalone");
  window.history.replaceState({}, "", path);
}

function teamContext(teamId: string) {
  const resolved = parseSolverContext(`space=team&teamId=${teamId}`);
  if (!resolved.ok) throw new Error(resolved.message);
  return resolved.context;
}

beforeEach(() => {
  localStorage.clear();
  resetSolverDemoData();
  at(`/app/solver/dashboard?space=individual&workspaceId=${PERSONAL_WORKSPACE_ID}`);
});

afterEach(cleanup);

describe("محصول canonical فرد و تیم نسخه ۲۸", () => {
  it("drawer موبایل Escape، aria-expanded و بازگشت focus را رعایت می‌کند", async () => {
    render(<SolverWorkspaceShell space="individual"><p>محتوا</p></SolverWorkspaceShell>);
    const opener = screen.getByRole("button", { name: "بازکردن منو" });
    opener.focus();
    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(opener).toHaveAttribute("aria-controls", "app-navigation-drawer");
    const drawer = document.getElementById("app-navigation-drawer");
    await waitFor(() => expect(drawer).toContainElement(document.activeElement as HTMLElement));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener).toHaveAttribute("aria-expanded", "false");
  });

  it("نام انسان ثابت و نام و نقش دو تیم مستقل است", async () => {
    const personal = render(<SolverWorkspaceShell space="individual"><p>محتوا</p></SolverWorkspaceShell>);
    await screen.findByText("فضای شخصی سارا احمدی");
    expect(personal.container).toHaveTextContent("سارا احمدی");
    expect(screen.getByText("فضای شخصی سارا احمدی")).toBeInTheDocument();
    personal.unmount();

    at("/app/solver/dashboard?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    const first = render(<SolverWorkspaceShell space="team"><p>محتوا</p></SolverWorkspaceShell>);
    await screen.findByText("تیم نوآوران صنعت");
    expect(first.container).toHaveTextContent("سارا احمدی");
    expect(screen.getByText("تیم نوآوران صنعت")).toBeInTheDocument();
    expect(screen.getAllByText("مالک تیم").length).toBeGreaterThan(0);
    first.unmount();

    at("/app/solver/dashboard?space=team&teamId=TEAM-34&workspaceId=WS-TEAM-34");
    render(<SolverWorkspaceShell space="team"><p>محتوا</p></SolverWorkspaceShell>);
    expect(await screen.findByText("آزمایشگاه پایش سبز")).toBeInTheDocument();
    expect(screen.getAllByText("همکار").length).toBeGreaterThan(0);
    expect(document.body).toHaveTextContent("سارا احمدی");
  });

  it("ساخت تیم، workspace، مالک، پروفایل، تنظیمات و احراز مستقل می‌سازد", () => {
    const result = createTeam({
      name: "تیم آزمون یکپارچه",
      teamType: "lab",
      introduction: "تیم نمونه برای آزمون جریان ساخت و دعوت اولیه.",
      expertise: ["سنجش"],
      publicContact: "new-team@example.test",
      initialInviteEmail: "invitee@example.test",
      policy: { proposalManagersCanSubmit: false, approvalBeforeSubmit: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = readSolverState();
    const team = state.teams.find((item) => item.id === result.entityId)!;
    expect(activeWorkspaces(state).some((item) => item.type === "team" && item.teamId === team.id)).toBe(true);
    expect(state.memberships.find((item) => item.teamId === team.id)?.role).toBe("owner");
    expect(state.teamProfiles.some((item) => item.teamId === team.id)).toBe(true);
    expect(state.teamSettings.find((item) => item.teamId === team.id)?.policy.approvalBeforeSubmit).toBe(true);
    expect(state.verifications.find((item) => item.subjectId === team.id)?.documents[0].label).toBe("مجوز آزمایشگاه");
    expect(state.invitations.some((item) => item.teamId === team.id && item.recipientEmail === "invitee@example.test")).toBe(true);
  });

  it("کارت هر تیم و هر پیشنهاد به شناسه خودش و context کامل می‌رود", async () => {
    render(<SolverTeamsOverview />);
    const team21 = (await screen.findAllByRole("link", { name: /مدیریت تیم/ }))[0];
    const hrefs = screen.getAllByRole("link", { name: /مدیریت تیم/ }).map((link) => link.getAttribute("href"));
    expect(team21).toBeInTheDocument();
    expect(hrefs.some((href) => href?.includes("/teams/TEAM-21") && href.includes("teamId=TEAM-21"))).toBe(true);
    expect(hrefs.some((href) => href?.includes("/teams/TEAM-34") && href.includes("teamId=TEAM-34"))).toBe(true);
    cleanup();

    at("/app/solver/proposals?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    render(<SolverProposalsList />);
    const proposalLinks = await screen.findAllByRole("link", { name: /نسخه قفل‌شده|ادامه پرونده/ });
    expect(proposalLinks.some((link) => link.getAttribute("href")?.includes("/proposals/PR-104/"))).toBe(true);
    expect(proposalLinks.some((link) => link.getAttribute("href")?.includes("/proposals/PR-127/"))).toBe(true);
    proposalLinks.forEach((link) => expect(link.getAttribute("href")).toContain("teamId=TEAM-21"));
  });

  it("جزئیات پیشنهاد از نسخه جاری همان رکورد ساخته می‌شود", () => {
    at("/app/solver/proposals/PR-109/preview?space=individual&workspaceId=WS-PERSONAL-001");
    render(<SolverProposalDetail proposalId="PR-109" />);
    expect(screen.getByRole("heading", { level: 1, name: "پایش پیش‌بینانه تجهیزات دوار" })).toBeInTheDocument();
    expect(screen.getAllByText("PV-109-1", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText("PR-104", { exact: false })).not.toBeInTheDocument();
  });

  it("مشاهده پیشنهاد مستقیم accepted نمی‌سازد و فقط همان workspace را به‌روز می‌کند", async () => {
    render(<SolverDirectOffersList />);
    fireEvent.click(await screen.findByRole("button", { name: "جزئیات پیشنهاد" }));
    await waitFor(() => expect(readSolverState().directOffers.find((item) => item.id === "OFF-226")?.state).toBe("viewed"));
    expect(readSolverState().directOffers.find((item) => item.id === "OFF-226")?.state).not.toBe("selected");
    expect(viewDirectOffer("OFF-218", PERSONAL_WORKSPACE_ID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(screen.queryByText(/٪ تطابق/)).not.toBeInTheDocument();
  });

  it("پذیرش درخواست عضویت roster و اعلان را در یک mutation به‌روز می‌کند", () => {
    const context = teamContext(PRIMARY_TEAM_ID);
    const before = readSolverState();
    const request = before.membershipRequests.find((item) => item.teamId === PRIMARY_TEAM_ID && item.state === "requested")!;
    const memberCount = before.memberships.filter((item) => item.teamId === PRIMARY_TEAM_ID && item.state === "active").length;
    expect(reviewMembershipRequest(context, request.id, "accepted", "contributor").ok).toBe(true);
    const after = readSolverState();
    expect(after.memberships.filter((item) => item.teamId === PRIMARY_TEAM_ID && item.state === "active")).toHaveLength(memberCount + 1);
    expect(after.notifications.some((item) => item.entityId === request.id)).toBe(true);
    expect(after.auditEvents.some((item) => item.entityId === request.id)).toBe(true);
  });

  it("تنظیمات مقدار واقعی و نشست‌ها را persist می‌کند", () => {
    const current = readSolverState().accountSettings;
    expect(saveAccountSettings({ ...current, timezone: "Europe/Berlin", smsNotifications: true }).ok).toBe(true);
    const persisted = readSolverState().accountSettings;
    expect(persisted.timezone).toBe("Europe/Berlin");
    expect(persisted.smsNotifications).toBe(true);
    render(<SolverSettingsEditor />);
    expect(screen.getByRole("heading", { level: 1, name: "تنظیمات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "امنیت و ورود" })).toBeInTheDocument();
  });

  it("تغییر تب پروفایل draft را نگه می‌دارد و انصراف snapshot را بازمی‌گرداند", () => {
    render(<SolverProfileEditor />);
    const headline = screen.getByLabelText("عنوان حرفه‌ای") as HTMLInputElement;
    fireEvent.change(headline, { target: { value: "عنوان ذخیره‌نشده" } });
    fireEvent.click(screen.getByRole("tab", { name: "تخصص‌ها" }));
    fireEvent.click(screen.getByRole("tab", { name: "اطلاعات پایه" }));
    expect(screen.getByLabelText("عنوان حرفه‌ای")).toHaveValue("عنوان ذخیره‌نشده");
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    fireEvent.click(screen.getByRole("button", { name: "لغو تغییرات" }));
    expect(screen.getByLabelText("عنوان حرفه‌ای")).toHaveValue("متخصص طراحی مکانیک و پایش صنعتی");
  });

  it("اعلان خوانده‌نشده واقعی و feedback پایان پرونده یک‌باره است", () => {
    expect(unreadNotificationCount(PERSONAL_WORKSPACE_ID)).toBeGreaterThan(0);
    const first = submitCaseFeedback({ type: "individual", workspaceId: PERSONAL_WORKSPACE_ID }, "CASE-138", "موفق", "خروجی‌ها پذیرفته و تسویه شد.");
    const duplicate = submitCaseFeedback({ type: "individual", workspaceId: PERSONAL_WORKSPACE_ID }, "CASE-138", "موفق", "تکرار");
    expect(first.ok).toBe(true);
    expect(duplicate).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("metadata سند محدود پیش از NDA در DOM نیست و دسترسی به workspace دیگر نشت نمی‌کند", () => {
    at("/app/solver/data-room?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21&entity=CH-1405-021");
    const team21 = render(<SolverDataRoom />);
    expect(screen.queryByText("restricted-process-map-v2.pdf")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /متن و دامنه NDA نسخه ۲/ }));
    const trigger = screen.getByRole("button", { name: "پذیرش NDA و دریافت دسترسی" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "پذیرش NDA نسخه ۲؟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تأیید و فعال‌کردن دسترسی" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "پذیرش NDA نسخه ۲؟" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "تأیید و فعال‌کردن دسترسی" }));
    expect(screen.getByText("restricted-process-map-v2.pdf")).toBeInTheDocument();
    team21.unmount();

    at("/app/solver/data-room?space=team&teamId=TEAM-34&workspaceId=WS-TEAM-34&entity=CH-1405-021");
    render(<SolverDataRoom />);
    expect(screen.queryByText("restricted-process-map-v2.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "درخواست دسترسی محرمانه" })).toBeInTheDocument();
  });

  it("احراز تیم Contributor فقط‌خواندنی و احراز تیم مالک قابل ارسال است", () => {
    at("/app/solver/verification?space=team&teamId=TEAM-34&workspaceId=WS-TEAM-34");
    const contributor = render(<SolverVerification />);
    expect(screen.getByRole("heading", { name: "پرونده فقط‌خواندنی است" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ارسال یا ارسال مجدد مدارک" })).toBeDisabled();
    contributor.unmount();

    at("/app/solver/verification?space=team&teamId=TEAM-21&workspaceId=WS-TEAM-21");
    render(<SolverVerification />);
    expect(screen.queryByRole("heading", { name: "پرونده فقط‌خواندنی است" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ارسال یا ارسال مجدد مدارک" })).toBeEnabled();
  });

  it("آپلود نمونه احراز validation، progress، موفقیت و remove قابل آزمون دارد", async () => {
    render(<SolverVerification />);
    const input = screen.getByLabelText("انتخاب فایل مدرک تخصص") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["sample"], "degree-v2.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("progressbar", { name: "پیشرفت بارگذاری مدرک تخصص" })).toHaveAttribute("value", "25");
    await waitFor(() => expect(screen.getByText("degree-v2.pdf")).toBeInTheDocument());
    expect(screen.getByRole("progressbar", { name: "پیشرفت بارگذاری مدرک تخصص" })).toHaveAttribute("value", "100");
    fireEvent.click(screen.getByRole("button", { name: "حذف فایل انتخابی" }));
    expect(screen.queryByText("degree-v2.pdf")).not.toBeInTheDocument();
  });

  it("دعوت ورودی پیش از پذیرش نقش، scope، تعهد، انقضا و IP را نشان می‌دهد", () => {
    render(<SolverInvitationsExperience />);
    expect(screen.getAllByText("همکاران داده زیست").length).toBeGreaterThan(0);
    expect(screen.getByText("مدیر پیشنهاد")).toBeInTheDocument();
    expect(screen.getByText(/پیشنهادها و پرونده‌های مرتبط/)).toBeInTheDocument();
    expect(screen.getByText(/هفته‌ای ۸ ساعت/)).toBeInTheDocument();
    expect(screen.getByText("مالکیت فکری")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "پذیرش دعوت" })).toBeInTheDocument();
  });

  it("Contributor در تیم دوم رابط مدیریت حساس دریافت نمی‌کند", async () => {
    at(`/app/solver/teams/${SECONDARY_TEAM_ID}?space=team&teamId=${SECONDARY_TEAM_ID}&workspaceId=WS-TEAM-34`);
    render(<SolverTeamsOverview />);
    expect(await screen.findByRole("heading", { name: "دسترسی مطالعه" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "بایگانی تیم" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "خروج از تیم" })).toBeEnabled();
  });
});
