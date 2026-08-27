import type {
  MembershipId,
  MembershipState,
  SessionId,
  TeamKind,
  TenantId,
  UserId,
  WorkspaceId,
  WorkspaceKind,
  WorkspaceRole,
} from "@rahhal/domain";

import type { MutationSuccessEnvelope, VersionedApiMeta, VersionedCommand } from "./envelopes.js";

export type UserResource = {
  readonly id: UserId;
  readonly display_name: string;
  readonly primary_email: string;
  readonly email_verified: boolean;
};

type WorkspaceResourceBase = {
  readonly id: WorkspaceId;
  readonly tenant_id: TenantId;
  readonly name: string;
};

export type OrganizationWorkspaceResource = WorkspaceResourceBase & {
  readonly kind: "org";
};

export type PlatformWorkspaceResource = WorkspaceResourceBase & {
  readonly kind: "platform";
};

export type IndividualWorkspaceResource = WorkspaceResourceBase & {
  readonly kind: "individual";
  readonly owner_user_id: UserId;
};

export type TeamWorkspaceResource = WorkspaceResourceBase & {
  readonly kind: "team";
  readonly team_kind: TeamKind;
  readonly owner_user_id: UserId;
};

export type WorkspaceResource =
  | PlatformWorkspaceResource
  | OrganizationWorkspaceResource
  | IndividualWorkspaceResource
  | TeamWorkspaceResource;

export type MembershipResource = {
  readonly id: MembershipId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly user_id: UserId;
  readonly role: WorkspaceRole;
  readonly state: MembershipState;
  readonly created_at: string;
  readonly updated_at: string;
};

export type WorkspaceContextResource = {
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly workspace_kind: WorkspaceKind;
};

export type MeResource = {
  readonly user: UserResource;
  readonly memberships: readonly MembershipResource[];
  readonly workspaces: readonly WorkspaceResource[];
  readonly active_context: WorkspaceContextResource | null;
};

export type SwitchWorkspaceContextBody = VersionedCommand & {
  readonly workspace_id: WorkspaceId;
};

export type MeSuccessEnvelope = {
  readonly ok: true;
  readonly data: MeResource;
  readonly meta: VersionedApiMeta;
};
export type WorkspaceContextMutationSuccessEnvelope = MutationSuccessEnvelope<
  SessionId,
  "continue"
>;
