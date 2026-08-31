"use client";

import type { ReactNode } from "react";
import { RoleAppShell, type AppNavigationItem, type AppShellRole } from "@/components/app-shell";
import { useWebRuntime } from "@/components/runtime-provider";

const navigation: Record<Exclude<AppShellRole, "solver">, AppNavigationItem[]> = {
  org: [
    { key: "dashboard", label: "داشبورد سازمان", href: "/app/org/dashboard", icon: "grid" },
    {
      key: "challenges",
      label: "مسئله‌ها و چالش‌ها",
      href: "/app/org/challenges",
      matches: ["/app/org/challenges"],
      icon: "brief",
    },
    {
      key: "experts",
      label: "متخصصان و دعوت‌ها",
      href: "/app/org/experts",
      matches: ["/app/org/experts", "/app/org/invitations"],
      icon: "match",
    },
    {
      key: "proposals",
      label: "پیشنهادها",
      href: "/app/org/proposals",
      icon: "decision",
      badge: "۳",
    },
    { key: "pilots", label: "پایلوت‌ها", href: "/app/org/pilots", icon: "impact", badge: "۱" },
    {
      key: "contracts",
      label: "قرارداد و پرداخت",
      href: "/app/org/contracts-payments",
      icon: "shield",
    },
    { key: "reports", label: "گزارش‌ها", href: "/app/org/reports", icon: "history" },
    {
      key: "access",
      label: "تیم و دسترسی‌ها",
      href: "/app/org/access",
      matches: ["/app/org/access", "/app/org/team"],
      icon: "people",
    },
    { key: "profile", label: "پروفایل سازمان", href: "/app/org/profile", icon: "people" },
    { key: "settings", label: "تنظیمات سازمان", href: "/app/org/settings", icon: "shield" },
  ],
  reviewer: [
    {
      key: "assignments",
      label: "مأموریت‌های من",
      href: "/app/reviewer/assignments",
      icon: "grid",
      badge: "۲",
    },
    { key: "messages", label: "پیام‌های داوری", href: "/app/messages", icon: "notification" },
    { key: "help", label: "راهنمای داوری", href: "/guides/review", icon: "shield" },
  ],
  ops: [
    {
      key: "queue",
      label: "صف عملیات",
      href: "/app/ops/queue",
      matches: ["/app/ops/queue", "/app/ops/dashboard"],
      icon: "grid",
      badge: "۸",
    },
    {
      key: "verification",
      label: "اعتبارسنجی",
      href: "/app/ops/verification",
      icon: "shield",
      badge: "۳",
    },
    {
      key: "publication",
      label: "کنترل انتشار",
      href: "/app/ops/publication",
      icon: "brief",
      badge: "۴",
    },
    {
      key: "reviews",
      label: "نظارت داوری",
      href: "/app/ops/reviews",
      icon: "decision",
      badge: "۲",
    },
    {
      key: "disputes",
      label: "اختلاف‌ها",
      href: "/app/ops/disputes",
      icon: "notification",
      badge: "۱",
    },
    { key: "payments", label: "عملیات پرداخت", href: "/app/ops/payments", icon: "impact" },
    { key: "violations", label: "گزارش تخلف", href: "/app/ops/violations", icon: "people" },
    { key: "settings", label: "تنظیمات پایه", href: "/app/ops/settings", icon: "history" },
  ],
};

const accounts = {
  org: {
    workspaceLabel: "فضای سازمان",
    workspaceName: "گروه مپنا",
    userName: "سارا نادری",
    userRole: "مدیر نوآوری",
  },
  reviewer: {
    workspaceLabel: "پنل مستقل داور",
    workspaceName: "مأموریت‌های شخصی",
    userName: "داور نمونه",
    userRole: "داور مستقل",
  },
  ops: {
    workspaceLabel: "مرکز عملیات",
    workspaceName: "عملیات پلتفرم",
    userName: "ندا اکبری",
    userRole: "کارشناس ارشد عملیات",
  },
} as const;

export function ConfiguredRoleShell({
  role,
  currentPath,
  children,
}: {
  role: "org" | "reviewer" | "ops";
  currentPath: string;
  children: ReactNode;
}) {
  const organizationShell = role === "org";
  const runtime = useWebRuntime();
  const connectedOrganization = organizationShell && runtime.mode === "network";
  const organizationWorkspaces = connectedOrganization
    ? (runtime.me?.workspaces.filter((workspace) => workspace.kind === "org") ?? [])
    : [];
  const activeWorkspace = organizationWorkspaces.find(
    (workspace) => workspace.id === runtime.me?.active_context?.workspace_id,
  );
  const activeMembership = runtime.me?.memberships.find(
    (membership) => membership.workspace_id === activeWorkspace?.id,
  );
  const account = connectedOrganization
    ? {
        workspaceLabel: "فضای سازمانی فعال",
        workspaceName: activeWorkspace?.name ?? "انتخاب فضای کاری",
        userName: runtime.me?.user.display_name ?? "کاربر راه‌حل",
        userRole:
          activeMembership?.role === "org:owner"
            ? "مالک سازمان"
            : activeMembership?.role === "org:member"
              ? "عضو سازمان"
              : "عضو بدون فضای فعال",
      }
    : accounts[role];
  return (
    <RoleAppShell
      role={role}
      navigation={navigation[role]}
      currentPath={currentPath}
      account={account}
      rootClassName={organizationShell ? "rh-shell rh-org-shell" : `app-shell app-shell--${role}`}
      contentClassName={organizationShell ? "rh-main rh-org-main" : "app-content"}
      workspaceOptions={organizationWorkspaces.map((workspace) => ({
        id: workspace.id,
        label: workspace.name,
        description: "سازمان",
        space: "org" as const,
      }))}
      activeWorkspaceId={activeWorkspace?.id}
      onWorkspaceChange={
        connectedOrganization
          ? (workspaceId) => {
              void runtime.switchWorkspace(workspaceId);
            }
          : undefined
      }
      onSignOut={
        connectedOrganization
          ? () => {
              // A full document navigation is deliberate after revoking a session:
              // it discards every in-memory gateway, cache, and provider value that
              // a client-side `router.push` would keep alive. The Next rule assumes
              // ordinary in-app navigation, which this is not.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              void runtime.signOut().then(() => window.location.assign("/auth/organization/login"));
            }
          : undefined
      }
    >
      {children}
    </RoleAppShell>
  );
}

export function OrganizationShell({
  currentPath,
  children,
}: {
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <ConfiguredRoleShell role="org" currentPath={currentPath}>
      {children}
    </ConfiguredRoleShell>
  );
}

export function ReviewerShell({
  currentPath,
  children,
}: {
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <ConfiguredRoleShell role="reviewer" currentPath={currentPath}>
      {children}
    </ConfiguredRoleShell>
  );
}

export function OperationsShell({
  currentPath,
  children,
}: {
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <ConfiguredRoleShell role="ops" currentPath={currentPath}>
      {children}
    </ConfiguredRoleShell>
  );
}
