import {
  organizationCapabilities,
  type OrganizationCapabilities,
  type WorkspaceRole,
} from "@rahhal/domain";

import type { AppNavigationItem } from "@/components/app-shell";

const navigationRequirements: Record<string, keyof OrganizationCapabilities | null> = {
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

const connectedNavigation = new Set([
  "dashboard",
  "challenges",
  "experts",
  "proposals",
  "access",
  "profile",
  "settings",
]);

const roleLabels: Partial<Record<WorkspaceRole, string>> = {
  "org:owner": "مالک سازمان",
  "org:member": "عضو سازمان",
  "org:publisher": "منتشرکننده سازمان",
  "org:approver_technical": "تأییدکننده فنی",
  "org:approver_legal": "تأییدکننده حقوقی",
  "org:approver_finance": "تأییدکننده مالی",
};

export function networkOrganizationRoleLabel(role: WorkspaceRole): string {
  return roleLabels[role] ?? "عضو سازمان";
}

export function networkOrganizationNavigation(
  items: readonly AppNavigationItem[],
  role: WorkspaceRole | undefined,
): AppNavigationItem[] {
  const available = items.filter((item) => connectedNavigation.has(item.key));
  if (!role)
    return available
      .filter((item) => navigationRequirements[item.key] === null)
      .map((item) => ({ ...item, badge: undefined }));
  const capabilities = organizationCapabilities(role);
  return available
    .filter((item) => {
      const required = navigationRequirements[item.key];
      return required === null || required === undefined || capabilities[required];
    })
    .map((item) => ({ ...item, badge: undefined }));
}
