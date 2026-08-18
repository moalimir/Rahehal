import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("اصلاحات دیداری نسخه ۱.۵", () => {
  it("سایدبار پوسته RTL را در سمت راست و محتوای اصلی را در ستون باقی‌مانده نگه می‌دارد", () => {
    const css = read("app/app-shell.css");
    expect(css).toContain("inline-size: calc(100% - var(--app-sidebar-width))");
    expect(css).toMatch(/\.unified-sidebar\s*\{[\s\S]*?inset-inline-start:\s*0/);
    expect(css).toMatch(
      /\.unified-main\s*\{[\s\S]*?margin-inline-start:\s*var\(--app-sidebar-width\)/,
    );
  });

  it("پروفایل‌های فرد و تیم را بدون عکس واقعی و با Monogram پایدار نمایش می‌دهد", () => {
    const avatar = read("components/person-avatar.tsx");
    expect(avatar).toContain("getInitials(name)");
    expect(avatar).toContain('bdi dir="ltr"');
    expect(avatar).not.toContain("next/image");
    expect(avatar).not.toContain("profile-01.webp");
  });

  it("هویت تکراری و راهنما و پشتیبانی را از سایدبار حل‌کننده حذف می‌کند", () => {
    const shell = read("components/app-shell.tsx");
    const solver = read("components/solver-shell.tsx");
    const dashboard = read("components/solver-dashboard.tsx");
    expect(shell).toContain('role !== "solver"');
    expect(shell).toContain("unified-topbar__profile");
    expect(solver).toContain("state.currentUser.displayName");
    expect(solver).toContain("workspaceName");
    expect(solver).toContain("team?.name");
    expect(dashboard).toContain("برای حل مسئله بعدی آماده‌اید؟");
    expect(dashboard).not.toContain("سلام سارا");
  });

  it("برای برندهای اصلی دارایی لوگوی محلی و برای سایر سازمان‌ها نشان تولیدشده دارد", () => {
    const registry = read("data/organization-registry.ts");
    const component = read("components/challenge-organization-logo.tsx");
    expect(registry).toContain('"hamrah-avval"');
    expect(registry).toContain('"iran-khodro"');
    expect(registry).toContain('"bank-mellat"');
    expect(registry).toContain('kind: "monogram"');
    expect(component).toContain("organization-logo-asset__monogram");
    expect(component).toContain('objectFit: "contain"');
    expect(component).toContain("unoptimized");
  });

  it("صفحه تنظیمات عرض کامل ستون محتوا و Grid بدون Overflow دارد", () => {
    const component = read("components/solver-profile-settings.tsx");
    const css = read("app/solver-workspace.css");
    expect(component).toContain('className="rh-settings-page"');
    expect(component).toContain('className="rh-settings-nav"');
    expect(css).toMatch(/\.rh-settings-page\s*\{[\s\S]*?inline-size:\s*100%/);
    expect(css).toMatch(
      /\.rh-settings-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(220px, 255px\) minmax\(0, 1fr\)/,
    );
  });
});
