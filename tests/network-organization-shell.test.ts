import { describe, expect, it } from "vitest";

import type { AppNavigationItem } from "@/components/app-shell";
import { networkOrganizationNavigation } from "@/lib/auth/network-organization-shell";
import { workspacesForPersona } from "@/lib/auth/network-session";

const items: AppNavigationItem[] = [
  { key: "dashboard", label: "داشبورد", href: "/app/org/dashboard", icon: "grid" },
  { key: "challenges", label: "مسئله‌ها", href: "/app/org/challenges", icon: "brief" },
  { key: "experts", label: "دعوت‌ها", href: "/app/org/experts", icon: "match" },
  {
    key: "proposals",
    label: "پیشنهادها",
    href: "/app/org/proposals",
    icon: "decision",
    badge: "۳",
  },
  { key: "pilots", label: "پایلوت", href: "/app/org/pilots", icon: "impact", badge: "۱" },
  { key: "access", label: "دسترسی", href: "/app/org/access", icon: "people" },
  { key: "profile", label: "پروفایل", href: "/app/org/profile", icon: "people" },
  { key: "settings", label: "تنظیمات", href: "/app/org/settings", icon: "shield" },
];

describe("connected organization navigation", () => {
  it("exposes only Phase 3 live families and removes fixture badges", () => {
    const result = networkOrganizationNavigation(items, "org:owner");
    expect(result.map((item) => item.key)).toEqual([
      "dashboard",
      "challenges",
      "experts",
      "proposals",
      "access",
      "profile",
      "settings",
    ]);
    expect(result.every((item) => item.badge === undefined)).toBe(true);
  });

  it("keeps capability filtering for roles that cannot manage direct offers", () => {
    const result = networkOrganizationNavigation(items, "org:publisher");
    expect(result.map((item) => item.key)).toEqual(["dashboard", "challenges", "profile"]);
  });
});

describe("organization login shortcut", () => {
  it("offers the workspace only to a session that can reach one", () => {
    // A solver session is authenticated but has no organization workspace.
    // Offering "enter the organization workspace" sent them to a page that
    // refuses them, which is chrome promising what the session cannot do.
    const solver = {
      workspaces: [{ id: "wsp_a", kind: "individual", tenant_id: "ten_a", name: "شخصی" }],
      memberships: [{ id: "mem_a", workspace_id: "wsp_a", state: "active", role: "individual" }],
    } as never;
    const organization = {
      workspaces: [{ id: "wsp_o", kind: "org", tenant_id: "ten_o", name: "سازمان" }],
      memberships: [{ id: "mem_o", workspace_id: "wsp_o", state: "active", role: "org:owner" }],
    } as never;
    expect(workspacesForPersona(solver, "org")).toHaveLength(0);
    expect(workspacesForPersona(organization, "org")).toHaveLength(1);
    expect(workspacesForPersona(null, "org")).toHaveLength(0);
  });
});
