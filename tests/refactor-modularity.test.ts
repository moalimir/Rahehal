import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const lineCount = (source: string) => source.split(/\r?\n/).length;

describe("مرزبندی ماژول‌های نقاط پرتراکم", () => {
  it("مسیریاب صفحات داخلی نقش‌ها و پرونده را از ماژول‌های مستقل می‌گیرد", () => {
    const facade = read("components/internal/pages.tsx");
    expect(facade).toContain('from "@/components/internal/organization-pages"');
    expect(facade).toContain('from "@/components/internal/case-pages"');
    expect(facade).toContain('from "@/components/internal/reviewer-pages"');
    expect(facade).toContain('from "@/components/internal/operations-pages"');
    expect(lineCount(facade)).toBeLessThanOrEqual(250);
  });

  it("مخزن حل‌کننده API قبلی را از لایه‌های ذخیره، انتخاب و فرمان بازصادر می‌کند", () => {
    const facade = read("lib/solver/repository.ts");
    expect(facade).toContain('repository/storage"');
    expect(facade).toContain('repository/selectors"');
    expect(facade).toContain('repository/queries"');
    expect(facade).toContain('repository/commands"');
    expect(lineCount(facade)).toBeLessThanOrEqual(20);
  });

  it("ویزارد پیشنهاد، مدل و فیلدهای مرحله را بیرون از پوسته نگه می‌دارد", () => {
    const facade = read("components/solver-proposal-wizard.tsx");
    expect(facade).toContain('from "@/components/solver-proposal/model"');
    expect(facade).toContain('from "@/components/solver-proposal/step-fields"');
    expect(lineCount(facade)).toBeLessThanOrEqual(750);
  });

  it("کشف چالش، کاتالوگ، کارت، فهرست و جزئیات را مستقل ترکیب می‌کند", () => {
    const facade = read("components/challenge-discovery.tsx");
    expect(facade).toContain('challenge-discovery/challenge-directory"');
    expect(facade).toContain('challenge-discovery/challenge-detail"');
    expect(facade).toContain('challenge-discovery/catalog"');
    expect(lineCount(facade)).toBeLessThanOrEqual(120);
  });

  it("تجربه پروفایل صفحات ذخیره‌شده، ساخت تیم و کشف عضو را جدا نگه می‌دارد", () => {
    const facade = read("components/solver-profile-experience.tsx");
    const creation = read("components/solver-profile/team-creation-page.tsx");
    expect(facade).toContain('solver-profile/saved-page"');
    expect(facade).toContain('solver-profile/team-creation-page"');
    expect(creation).toContain('solver-profile/team-discovery-page"');
    expect(lineCount(facade)).toBeLessThanOrEqual(100);
  });
});
