import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const facade = readFileSync("components/portal-page.tsx", "utf8");

describe("مرزبندی ماژول‌های پرتال", () => {
  it("ورودی سازگار پرتال تجربه‌های عمومی، احراز و آن‌بوردینگ را از ماژول‌های مستقل می‌گیرد", () => {
    expect(facade).toContain('from "@/components/portal/public-experiences"');
    expect(facade).toContain('from "@/components/portal/auth-experiences"');
    expect(facade).toContain('from "@/components/portal/registration-experiences"');
    expect(facade).toContain('from "@/components/portal/onboarding-experience"');
  });

  it("فایل ترکیب پرتال دوباره به مونولیت چهارهزارخطی تبدیل نمی‌شود", () => {
    expect(facade.split(/\r?\n/).length).toBeLessThanOrEqual(1_200);
  });
});
