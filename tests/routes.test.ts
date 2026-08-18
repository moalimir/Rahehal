import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/[...slug]/page";
import { allRoutePaths, routeDefinitions } from "@/data/routes";
import { internalRoutes } from "@/data/internal-routes";
import { publicProductRoutes } from "@/data/public-product-routes";
import { challenges, pilots, reviewers, submissions } from "@/data/mock";

const pathsForRole = (role: "org" | "solver" | "reviewer" | "ops") =>
  internalRoutes.filter((route) => route.role === role).map((route) => route.path);

describe("موجودی مسیرهای محصول", () => {
  it("برای Deep Link عنوان تب و شرح Route را متمایز می‌کند", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ["app", "reviewer", "assignments"] }),
    });

    expect(metadata.title).toBe("مأموریت‌های داوری");
    expect(metadata.description).toMatch(/داوری|تعارض|مأموریت/);
  });

  it("مسیرهای نسخه قبلی را برای سازگاری حفظ می‌کند", () => {
    expect(allRoutePaths).toHaveLength(45);
    expect(new Set(allRoutePaths).size).toBe(45);
  });

  it("route map جدید PRD یکتا و شامل پنج پوسته است", () => {
    const publicPaths = routeDefinitions
      .filter((route) => route.role === "public")
      .map((route) => route.path);
    const paths = [
      "/",
      ...publicPaths,
      ...publicProductRoutes.map((route) => route.path),
      ...internalRoutes.map((route) => route.path),
    ];
    expect(paths.length).toBeGreaterThanOrEqual(140);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(internalRoutes.map((route) => route.role))).toEqual(
      new Set(["org", "solver", "reviewer", "ops"]),
    );
  });

  it("تمام صفحات هسته و پنل مستقل داور را دارد", () => {
    const ids = new Set(internalRoutes.map((route) => route.prdId));
    for (const id of [
      "ORG-01",
      "ORG-04",
      "ORG-09",
      "ORG-16",
      "SOL-01",
      "SOL-05",
      "REV-01",
      "REV-04",
      "OPS-01",
      "OPS-06",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(
      internalRoutes.filter((route) => route.role === "reviewer").length,
    ).toBeGreaterThanOrEqual(11);
    expect(pathsForRole("org")).toContain("/app/org/challenges/CH-1405-021/studio");
    expect(pathsForRole("solver")).toContain("/app/solver/proposals/PR-104/edit");
    expect(pathsForRole("ops")).toContain("/app/ops/verification/KYB-882");
  });

  it("همه مسیرهای عمومی، احراز و onboarding قرارداد صفحه دارند", () => {
    expect(publicProductRoutes.length).toBeGreaterThanOrEqual(30);
    for (const route of publicProductRoutes) {
      expect(route.title.length).toBeGreaterThan(4);
      expect(route.summary.length).toBeGreaterThan(40);
      expect(route.sections).toHaveLength(3);
      expect(route.primaryAction.length).toBeGreaterThan(3);
    }
  });

  it("همه مسیرهای غیرخانه محتوای اختصاصی و اقدام دارند", () => {
    for (const route of routeDefinitions) {
      expect(route.title.length).toBeGreaterThan(4);
      expect(route.summary.length).toBeGreaterThan(40);
      expect(route.sections).toHaveLength(3);
      expect(route.records.length).toBeGreaterThanOrEqual(4);
      expect(route.primaryAction).not.toMatch(/به.?زودی/);
    }
  });

  it("تقسیم‌بندی ۴۵ مسیر قبلی بدون شکست باقی مانده است", () => {
    expect(routeDefinitions.filter((route) => route.role === "public")).toHaveLength(7);
    expect(routeDefinitions.filter((route) => route.role === "solver")).toHaveLength(13);
    expect(routeDefinitions.filter((route) => route.role === "org")).toHaveLength(16);
    expect(routeDefinitions.filter((route) => route.role === "ops")).toHaveLength(8);
  });
});

describe("داده‌های نمایشی دامنه", () => {
  it("حداقل‌های PRD را پوشش می‌دهد", () => {
    expect(challenges).toHaveLength(12);
    expect(submissions).toHaveLength(8);
    expect(reviewers).toHaveLength(6);
    expect(pilots).toHaveLength(4);
  });

  it("سه صنعت اولویت‌دار را دارد", () => {
    expect(new Set(challenges.map((item) => item.industry))).toEqual(
      new Set(["ساخت‌وتولید", "انرژی و آب", "صنایع غذایی"]),
    );
  });

  it("چهار سطح انتشار را پوشش می‌دهد", () => {
    expect(new Set(challenges.map((item) => item.visibility))).toEqual(
      new Set(["عمومی", "ناشناسِ تأییدشده", "دعوتی", "خصوصی"]),
    );
  });
});
