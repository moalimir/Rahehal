"use client";

import type { ReactNode } from "react";
import { RoleAppShell, type AppNavigationItem, type AppShellRole } from "@/components/app-shell";
import {
  organizationCapabilities,
  type OrganizationCapabilities,
  type WorkspaceRole,
} from "@rahhal/domain";

import { useWebRuntime } from "@/components/runtime-provider";

/**
 * Which capability a nav entry needs before it is worth offering.
 *
 * `null` means every member of the organization: the dashboard, the challenge
 * list and the organization's own profile are the surfaces an approver or a
 * publisher still has to reach to do their one job.
 *
 * This filters what is *offered*, never what is allowed. The server decides
 * every request regardless (70_SECURITY_AND_AUTHZ §2), so a hidden link is a
 * courtesy, not a control — which is exactly why it is keyed on the same
 * `organizationCapabilities` the API authorizes with instead of a second list
 * that would quietly disagree with it.
 */
const organizationNavigationRequirements: Record<string, keyof OrganizationCapabilities | null> = {
  dashboard: null,
  challenges: null,
  profile: null,
  experts: "authorChallenges",
  proposals: "authorChallenges",
  pilots: "authorChallenges",
  reports: "authorChallenges",
  contracts: "manageOrganization",
  access: "manageOrganization",
  settings: "manageOrganization",
};

const organizationRoleLabels: Partial<Record<WorkspaceRole, string>> = {
  "org:owner": "مالک سازمان",
  "org:member": "عضو سازمان",
  "org:publisher": "منتشرکننده سازمان",
  "org:approver_technical": "تأییدکننده فنی",
  "org:approver_legal": "تأییدکننده حقوقی",
  "org:approver_finance": "تأییدکننده مالی",
};

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
        // Every organization role gets its own name. The old mapping knew only
        // owner and member, so a publisher or an approver — the two roles the
        // separation of duty exists for — were labelled as having no active
        // workspace while they were signed into one.
        userRole: activeMembership
          ? (organizationRoleLabels[activeMembership.role] ?? "عضو سازمان")
          : "عضو بدون فضای فعال",
      }
    : accounts[role];

  const capabilities = activeMembership ? organizationCapabilities(activeMembership.role) : null;
  const roleScopedNavigation =
    connectedOrganization && capabilities
      ? navigation[role].filter((item) => {
          const required = organizationNavigationRequirements[item.key];
          return required === null || required === undefined || capabilities[required];
        })
      : navigation[role];

  return (
    <RoleAppShell
      role={role}
      navigation={roleScopedNavigation}
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
