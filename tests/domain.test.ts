import { describe, expect, it } from "vitest";
import {
  canPerform,
  canTransition,
  formatToman,
  normalizePersian,
  publicationGates,
} from "@/domain/product";

describe("مجوزهای deny-by-default", () => {
  const base = {
    role: "org" as const,
    membershipActive: true,
    caseMember: true,
    twoFactorVerified: true,
    conflictDeclared: true,
  };

  it("اقدام حساس را بدون 2FA رد می‌کند", () => {
    expect(canPerform({ ...base, twoFactorVerified: false }, "decide")).toBe(false);
    expect(canPerform(base, "decide")).toBe(true);
  });

  it("نقش و عضویت پرونده‌ای را مستقل کنترل می‌کند", () => {
    expect(canPerform({ ...base, caseMember: false }, "view")).toBe(false);
    expect(canPerform({ ...base, role: "solver" }, "approve-payment")).toBe(false);
  });

  it("داور پیش از اظهار تعارض نمی‌تواند داوری کند", () => {
    expect(canPerform({ ...base, role: "reviewer", conflictDeclared: false }, "review")).toBe(
      false,
    );
    expect(canPerform({ ...base, role: "reviewer" }, "review")).toBe(true);
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
    expect(canTransition("draft", "triage")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("closed", "pilot")).toBe(false);
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
