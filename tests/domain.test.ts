import { describe, expect, it } from "vitest";
import { canPerform, formatToman, normalizePersian, publicationGates } from "@/domain/product";
import { canTransition, challengeTransitions } from "@/domain/state-machines";

describe("مجوزهای deny-by-default", () => {
  const base = {
    role: "org:owner" as const,
    membershipActive: true,
    caseMember: true,
    twoFactorVerified: true,
    coiClear: true,
  };

  it("اقدام حساس را بدون 2FA رد می‌کند", () => {
    expect(canPerform({ ...base, twoFactorVerified: false }, "decide")).toBe(false);
    expect(canPerform(base, "decide")).toBe(true);
  });

  it("نقش و عضویت پرونده‌ای را مستقل کنترل می‌کند", () => {
    expect(canPerform({ ...base, caseMember: false }, "view")).toBe(false);
    expect(canPerform({ ...base, role: "individual" }, "approve-payment")).toBe(false);
  });

  it("داور پیش از اظهار تعارض نمی‌تواند داوری کند", () => {
    expect(canPerform({ ...base, role: "platform:reviewer", coiClear: false }, "review")).toBe(
      false,
    );
    expect(canPerform({ ...base, role: "platform:reviewer" }, "review")).toBe(true);
  });
});

describe("Gate و ماشین وضعیت", () => {
  it("Gateهای انتشار را با Evidence برمی‌گرداند", () => {
    const gates = publicationGates({
      business: true,
      technical: true,
      finance: false,
      legal: true,
      quality: false,
    });
    expect(gates).toHaveLength(5);
    expect(gates.filter((gate) => gate.passed)).toHaveLength(3);
    expect(gates.every((gate) => gate.evidence.length > 3)).toBe(true);
  });

  it("پرش نامعتبر در چرخه پرونده را رد می‌کند", () => {
    expect(challengeTransitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "draft->published",
      "triage->published",
      "formulation->published",
      "approvals->published",
      "draft->triage",
      "triage->formulation",
      "formulation->approvals",
      "approvals->published",
      "published->evaluating",
      "evaluating->decided",
      "decided->contracting",
      "contracting->pilot",
      "pilot->impact",
      "impact->closed",
    ]);
    expect(
      canTransition(challengeTransitions, "draft", "triage", "org:member", ["brief-valid"]),
    ).toBe(true);
    expect(canTransition(challengeTransitions, "draft", "published", "org:publisher")).toBe(false);
    expect(canTransition(challengeTransitions, "pilot", "closed", "individual", [])).toBe(false);
    expect(
      canTransition(challengeTransitions, "pilot", "impact", "org:member", [
        "deliverables-resolved",
      ]),
    ).toBe(true);
    expect(
      canTransition(challengeTransitions, "impact", "closed", "org:member", [
        "payments-reconciled",
      ]),
    ).toBe(true);
  });
});

describe("بومی‌سازی", () => {
  it("حروف عربی و ارقام فارسی را نرمال می‌کند", () => {
    expect(normalizePersian("كیفیت ۱۲۳")).toBe("کیفیت 123");
  });

  it("مبلغ را با واحد صریح تومان نمایش می‌دهد", () => {
    expect(formatToman(780_000_000)).toContain("تومان");
  });
});
