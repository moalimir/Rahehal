import type { MembershipId, TenantId, UserId, WorkspaceId } from "./id.js";
import type { TeamKind } from "./taxonomy.js";

export const workspaceKinds = ["org", "individual", "team"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

export const platformRoles = [
  "platform:ops",
  "platform:finance",
  "platform:legal",
  "platform:reviewer",
  "platform:admin",
] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const organizationRoles = [
  "org:owner",
  "org:member",
  "org:approver_technical",
  "org:approver_legal",
  "org:approver_finance",
  "org:publisher",
] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

export const teamRole = {
  owner: "team:owner",
  admin: "team:admin",
  proposalManager: "team:proposal-manager",
  contributor: "team:contributor",
  viewer: "team:viewer",
} as const;

export const teamRoles = Object.values(teamRole);
export type TeamRole = (typeof teamRoles)[number];

export const workspaceRoles = [
  ...platformRoles,
  ...organizationRoles,
  ...teamRoles,
  "individual",
] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const membershipStates = [
  "invited",
  "requested",
  "active",
  "rejected",
  "expired",
  "suspended",
  "removed",
] as const;
export type MembershipState = (typeof membershipStates)[number];

type WorkspaceBase = {
  readonly id: WorkspaceId;
  readonly tenantId: TenantId;
  readonly name: string;
};

export type OrganizationWorkspace = WorkspaceBase & {
  readonly kind: "org";
};

export type IndividualWorkspace = WorkspaceBase & {
  readonly kind: "individual";
  readonly ownerUserId: UserId;
};

export type TeamWorkspace = WorkspaceBase & {
  readonly kind: "team";
  readonly teamKind: TeamKind;
  readonly ownerUserId: UserId;
};

export type Workspace = OrganizationWorkspace | IndividualWorkspace | TeamWorkspace;

export type Membership = {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly role: WorkspaceRole;
  readonly state: MembershipState;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ActiveWorkspaceContext = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceKind: WorkspaceKind;
};

export type User = {
  readonly id: UserId;
  readonly displayName: string;
  readonly primaryEmail: string;
  readonly emailVerified: boolean;
};

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return workspaceKinds.includes(value as WorkspaceKind);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return workspaceRoles.includes(value as WorkspaceRole);
}

export function isTeamRole(value: unknown): value is TeamRole {
  return teamRoles.includes(value as TeamRole);
}

export function isMembershipState(value: unknown): value is MembershipState {
  return membershipStates.includes(value as MembershipState);
}

export function isRoleCompatibleWithWorkspace(
  role: WorkspaceRole,
  workspaceKind: WorkspaceKind,
): boolean {
  if (workspaceKind === "org") return role.startsWith("org:");
  if (workspaceKind === "team") return role.startsWith("team:");
  return role === "individual";
}
