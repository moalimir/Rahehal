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
  // Every member reads their own workspace's notifications; nothing about the
  // read model is gated on authoring or managing the organization.
  notifications: null,
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
  "notifications",
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

/**
 * Platform staff roles, for the operations and review chrome.
 *
 * Those shells previously showed a fixture person, so no label was needed.
 * Naming the signed-in human means naming their role too, and a raw
 * `platform:ops` in the sidebar is the identifier problem in another place.
 */
const platformRoleLabels: Partial<Record<WorkspaceRole, string>> = {
  "platform:ops": "کارشناس عملیات پلتفرم",
  "platform:finance": "کارشناس مالی پلتفرم",
  "platform:legal": "کارشناس حقوقی پلتفرم",
  "platform:reviewer": "داور پلتفرم",
  "platform:admin": "مدیر پلتفرم",
};

/** The label for any workspace role a connected shell might display. */
export function networkWorkspaceRoleLabel(role: WorkspaceRole, fallback: string): string {
  return roleLabels[role] ?? platformRoleLabels[role] ?? fallback;
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
