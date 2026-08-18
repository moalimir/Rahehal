// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { longestNavigationMatch, type AppNavigationItem } from "@/components/app-shell";
import { RahhalLogo, Brand } from "@/components/brand";
import { OrganizationLogo } from "@/components/challenge-organization-logo";
import { InternalApp } from "@/components/internal/internal-app";
import { challenges } from "@/data/mock";
import { internalRoutes } from "@/data/internal-routes";
import { legacyRedirectEntries, getLegacyRedirect } from "@/data/legacy-redirects";
import { getOrganization, organizationRegistry } from "@/data/organization-registry";
import { getInitials } from "@/lib/identity";

describe("معماری یکپارچه نسخه ۱۳", () => {
  it("مسیرهای قدیمی فقط یک مقصد Canonical و یکتا دارند", () => {
    expect(new Set(legacyRedirectEntries.map(({ source }) => source)).size).toBe(
      legacyRedirectEntries.length,
    );
    for (const { source, target } of legacyRedirectEntries) {
      expect(getLegacyRedirect(`${source}?space=team#section`)).toBe(target);
      expect(target === "/trust-security" || target.startsWith("/app/")).toBe(true);
    }
  });

  it("Longest Match مسیر را مستقل از Query و بدون انتخاب والد محاسبه می‌کند", () => {
    const items: AppNavigationItem[] = [
      { key: "root", label: "فرصت‌ها", href: "/app/solver/opportunities", icon: "brief" },
      {
        key: "detail",
        label: "جزئیات",
        href: "/app/solver/opportunities/smart-water-recovery",
        icon: "match",
      },
    ];
    expect(
      longestNavigationMatch(
        items,
        "/app/solver/opportunities/smart-water-recovery?space=team#requirements",
      )?.key,
    ).toBe("detail");
  });

  it("تمام تجربه‌های Canonical حل‌کننده دقیقاً یک Shell پایه دارند", () => {
    const route = internalRoutes.find(({ path }) => path === "/app/solver/team-building");
    if (!route) throw new Error("Canonical solver route missing");
    const { container } = render(<InternalApp route={route} />);
    expect(container.querySelectorAll(".unified-shell--solver")).toHaveLength(1);
    expect(container.querySelectorAll(".unified-sidebar")).toHaveLength(1);
    expect(
      container.querySelectorAll(".workspace-sidebar, .app-sidebar, .rh-sidebar"),
    ).toHaveLength(0);
    expect(screen.getAllByLabelText("ناوبری اصلی")).toHaveLength(1);
    expect(container.querySelector(".unified-sidebar__bottom")).not.toBeInTheDocument();
    expect(
      container.querySelector(".unified-workspace-identity .person-avatar"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".unified-topbar__profile")).toHaveLength(1);
  });

  it("لوگوی راه‌حل یک کامپوننت و نوشتار ثابت دارد", () => {
    const { container, rerender } = render(<Brand />);
    expect(screen.getByLabelText("راه‌حل، صفحهٔ اصلی")).toBeInTheDocument();
    expect(screen.getByText("راه‌حل")).toBeInTheDocument();
    expect(container.querySelectorAll(".rahhal-logo svg")).toHaveLength(1);
    rerender(<RahhalLogo variant="mark" size="sm" />);
    expect(container.querySelector(".rahhal-logo--mark svg")).toBeInTheDocument();
    expect(screen.queryByText("راه‌حل")).not.toBeInTheDocument();
  });

  it("نام و نشان هر چالش از Registry واحد می‌آیند", () => {
    for (const challenge of challenges) {
      const organization = getOrganization(challenge.organizationId);
      expect(organization.id).toBe(challenge.organizationId);
      expect(organization.logoAlt).toContain(organization.name);
      expect(organization.name).not.toContain("نمایشی");
    }
    const { container } = render(<OrganizationLogo organization={organizationRegistry.digikala} />);
    expect(container.firstElementChild).toHaveAttribute("data-organization-id", "digikala");
    expect(
      screen.getByRole("img", { name: organizationRegistry.digikala.logoAlt }),
    ).toBeInTheDocument();
  });

  it("Monogram فارسی در همه‌جا از Utility مشترک و پایدار تولید می‌شود", () => {
    expect(getInitials("علی رضایی")).toBe("ع‌ر");
    expect(getInitials("  سارا   محمدی  ")).toBe("س‌م");
  });

  it("توکن Layout و کف تایپوگرافی در CSS نهایی برقرار است", () => {
    const css = [
      "app/design-system.css",
      "app/globals.css",
      "app/internal.css",
      "app/solver-workspace.css",
      "app/challenge-flow.css",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(css).toContain("--app-sidebar-width");
    expect(css).toContain("minmax(0, 1fr)");
    const tinySizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .map((match) => Number(match[1]))
      .filter((size) => size < 12);
    expect(tinySizes).toEqual([]);
  });
});
