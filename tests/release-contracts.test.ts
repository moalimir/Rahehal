// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  canTransition,
  challengeTransitions,
  contractTransitions,
  invitationTransitions,
  membershipTransitions,
  paymentTransitions,
  pilotTransitions,
  proposalTransitions,
  reviewTransitions,
} from "@/domain/state-machines";
import { createDemoSession, readDemoSession, canAccessInternalRole } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { demoChallengeGateway, demoOpportunityGateway } from "@/lib/challenges/runtime";
import { createDirectOffer, listDirectOffers, transitionDirectOffer } from "@/lib/offers/store";
import { getLegacyResolution } from "@/data/legacy-redirects";
import {
  shouldHandleStandaloneAnchor,
  standaloneDestination,
} from "@/lib/routing/standalone-navigation";
import { performProductAction } from "@/lib/services/internal-service";
import { challengeUploadError, safeUploadName } from "@/lib/validation/upload";
import {
  approveFinance,
  confirmProviderPayment,
  readPayment,
  requestFinanceApproval,
} from "@/lib/payments/store";

describe("قرارداد انتشار: مسیر، مجوز، Transition و Mutation", () => {
  beforeEach(() => localStorage.clear());

  it("هشت ماشین وضعیت Transition نامعتبر یا actor نامجاز را رد می‌کنند", () => {
    expect(
      canTransition(challengeTransitions, "draft", "published", "org:publisher", ["brief-valid"]),
    ).toBe(false);
    expect(
      canTransition(proposalTransitions, "draft", "submitted", "individual", [
        "form-valid",
        "sender-authorized",
        "terms-accepted",
      ]),
    ).toBe(true);
    expect(
      canTransition(invitationTransitions, "pending", "cancelled", "individual", [
        "reason-recorded",
      ]),
    ).toBe(false);
    expect(
      canTransition(membershipTransitions, "active", "removed", "team:admin", ["not-last-manager"]),
    ).toBe(false);
    expect(
      canTransition(reviewTransitions, "coi-gate", "accepted", "platform:reviewer", ["coi-clear"]),
    ).toBe(true);
    expect(
      canTransition(contractTransitions, "approval", "signature", "platform:legal", [
        "legal-approved",
      ]),
    ).toBe(false);
    expect(
      canTransition(
        pilotTransitions,
        "deliverable-submitted",
        "accepted",
        "org:approver_technical",
        ["technical-evidence-approved"],
      ),
    ).toBe(true);
    expect(
      canTransition(paymentTransitions, "triggered", "approval", "platform:finance", [
        "technical-accepted",
      ]),
    ).toBe(false);
  });

  it("Session منقضی یا نقش ناسازگار را مجاز نمی‌کند", () => {
    const session = createDemoSession("org", "org-mapna");
    expect(readDemoSession()).toEqual(session);
    expect(canAccessInternalRole(session, "org")).toBe(true);
    expect(canAccessInternalRole(session, "solver")).toBe(false);
    localStorage.setItem("rahhal.session.v1", JSON.stringify({ ...session, expiresAt: 1 }));
    expect(readDemoSession()).toBeNull();
  });

  it("دعوت سازمان در Store مشترک ساخته و پاسخ حل‌کننده در همان Entity ثبت می‌شود", () => {
    const offer = createDirectOffer({ recipientName: "سارا محمدی" });
    expect(listDirectOffers().find((item) => item.id === offer.id)?.state).toBe("pending");
    transitionDirectOffer(offer.id, "accepted");
    expect(listDirectOffers().find((item) => item.id === offer.id)?.state).toBe("accepted");
    expect(transitionDirectOffer(offer.id, "declined")?.state).toBe("accepted");
  });

  it("legacy نامرتبط unavailable است و router کلیک فایل یا modifier را capture نمی‌کند", () => {
    expect(getLegacyResolution("/solver/contracts")?.kind).toBe("unavailable");
    expect(getLegacyResolution("/org/triage")).toMatchObject({
      kind: "redirect",
      target: "/app/org/challenges/triage",
    });
    expect(getLegacyResolution("/org/team")).toMatchObject({
      kind: "redirect",
      target: "/app/org/team",
    });
    expect(getLegacyResolution("/org/challenges/CH-UNKNOWN/studio")).toBeUndefined();
    const click = {
      button: 0,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    const anchor = (href: string) => ({ target: "", download: "", getAttribute: () => href });
    expect(shouldHandleStandaloneAnchor(click, anchor("/app/org/dashboard"))).toBe(true);
    expect(shouldHandleStandaloneAnchor(click, anchor("/file.pdf"))).toBe(false);
    expect(
      shouldHandleStandaloneAnchor({ ...click, ctrlKey: true }, anchor("/app/org/dashboard")),
    ).toBe(false);
    expect(standaloneDestination("/app/solver/opportunities?space=team")).toContain("space=team");
  });

  it("returnTo فقط مسیر همان نقش را می‌پذیرد و Query و Hash را حفظ می‌کند", () => {
    expect(safeReturnTo("//evil.example/app/org/dashboard", "org")).toBe("");
    expect(safeReturnTo("/app/org/dashboard", "solver")).toBe("");
    expect(safeReturnTo("/app/solver/opportunities?space=team&sort=latest#filters", "solver")).toBe(
      "/app/solver/opportunities?space=team&sort=latest#filters",
    );
  });

  it("انتشار سازمان همان Entity را در کاتالوگ عمومی و حل‌کننده قابل مشاهده می‌کند", async () => {
    const ready = await demoChallengeGateway.queries.get("CH-1405-052");
    expect(ready.ok).toBe(true);
    if (!ready.ok) throw new Error(ready.error.message);
    const saved = await demoChallengeGateway.commands.save({
      ...ready.data,
      visibility: "public",
      sourcingModel: "public",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error.message);
    const submitted = await demoChallengeGateway.commands.submit(saved.data);
    expect(submitted).toMatchObject({ ok: true, data: { status: "under_review" } });
    if (!submitted.ok) throw new Error(submitted.error.message);
    const published = await demoChallengeGateway.commands.publish(submitted.data.id);
    expect(published).toMatchObject({ ok: true, data: { status: "published" } });
    const opportunities = await demoOpportunityGateway.queries.list();
    if (!opportunities.ok) throw new Error(opportunities.error.message);
    expect(opportunities.data.find((item) => item.id === submitted.data.id)?.title).toBe(
      submitted.data.title,
    );
  });

  it("Action حساس idempotent است و Receipt و Audit پایدار می‌سازد", async () => {
    const command = {
      action: "ثبت تصمیم",
      entityRef: "proposal:PR-104",
      actorRole: "org" as const,
      idempotencyKey: "decision-104",
    };
    const first = await performProductAction(command);
    const second = await performProductAction(command);
    expect(first.id).toBe(second.id);
    expect(first.auditEventId).toMatch(/^AUD-/);
  });

  it("بارگذاری فایل نوع، حجم و نام امن را پیش از ذخیره کنترل می‌کند", () => {
    expect(safeUploadName("../secret\u0000.pdf")).toBe("secret.pdf");
    expect(
      challengeUploadError(new File(["x"], "evidence.exe", { type: "application/pdf" })),
    ).toContain("فرمت");
    expect(challengeUploadError(new File(["x"], "evidence.pdf", { type: "text/html" }))).toContain(
      "نوع واقعی",
    );
    expect(
      challengeUploadError(new File(["%PDF"], "evidence.pdf", { type: "application/pdf" })),
    ).toBe("");
  });

  it("پرداخت فقط پس از پذیرش فنی، تأیید مالی و قرارداد مؤثر جلو می‌رود", () => {
    expect(readPayment().state).toBe("triggered");
    expect(confirmProviderPayment()).toBeNull();
    expect(requestFinanceApproval()?.state).toBe("approval");
    expect(confirmProviderPayment()).toBeNull();
    expect(approveFinance()?.state).toBe("processing");
    expect(confirmProviderPayment()?.state).toBe("paid");
  });
});
