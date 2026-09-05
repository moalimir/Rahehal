import type {
  MembershipId,
  MembershipState,
  TeamInvitationId,
  TeamInvitationState,
  TeamKind,
  TeamMembershipRequestId,
  TeamMembershipRequestState,
  TeamNonOwnerRole,
  TeamPolicy,
  TeamRole,
  TeamStatus,
  TenantId,
  UserId,
  WorkspaceId,
} from "@rahhal/domain";

import type { MutationReceipt, SuccessEnvelope, VersionedCommand } from "./envelopes.js";

export const teamJoinModes = ["open", "request", "invite-only"] as const;
export type TeamJoinMode = (typeof teamJoinModes)[number];

export type TeamMemberResource = {
  readonly id: MembershipId;
  readonly user_id: UserId;
  readonly display_name: string;
  readonly role: TeamRole;
  readonly state: MembershipState;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export type TeamResource = {
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly name: string;
  readonly team_kind: TeamKind;
  readonly owner_user_id: UserId;
  readonly status: TeamStatus;
  readonly join_mode: TeamJoinMode;
  readonly default_invitation_role: TeamNonOwnerRole;
  readonly policy: TeamPolicy;
  readonly members: readonly TeamMemberResource[];
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export type TeamInvitationResource = {
  readonly id: TeamInvitationId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly team_name: string;
  readonly inviter_user_id: UserId;
  readonly recipient_user_id: UserId | null;
  readonly recipient_email: string;
  readonly proposed_role: TeamNonOwnerRole;
  readonly scope: string;
  readonly message: string;
  readonly commitment: string;
  readonly ip_notice: string;
  readonly state: TeamInvitationState;
  readonly version: number;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type TeamMembershipRequestResource = {
  readonly id: TeamMembershipRequestId;
  readonly tenant_id: TenantId;
  readonly workspace_id: WorkspaceId;
  readonly team_name: string;
  readonly requester_user_id: UserId;
  readonly requester_display_name: string;
  readonly requested_role: TeamNonOwnerRole;
  readonly assigned_role: TeamNonOwnerRole | null;
  readonly introduction: string;
  readonly availability: string;
  readonly state: TeamMembershipRequestState;
  readonly decision_reason: string | null;
  readonly version: number;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CreateTeamBody = {
  readonly expected_version: 0;
  readonly name: string;
  readonly team_kind: TeamKind;
  readonly join_mode?: TeamJoinMode;
};

export type UpdateTeamPolicyBody = VersionedCommand & {
  readonly reason: string;
  readonly join_mode?: TeamJoinMode;
  readonly default_invitation_role?: TeamNonOwnerRole;
  readonly policy?: Partial<TeamPolicy>;
};

export type CreateTeamInvitationBody = VersionedCommand & {
  readonly recipient_email: string;
  readonly proposed_role: TeamNonOwnerRole;
  readonly scope: string;
  readonly message: string;
  readonly commitment: string;
  readonly ip_notice: string;
};

export type RevokeTeamInvitationBody = VersionedCommand & { readonly reason: string };
export type RespondTeamInvitationBody = VersionedCommand & {
  readonly decision: "accept" | "decline";
  readonly reason?: string;
};

export type CreateTeamMembershipRequestBody = {
  readonly expected_version: 0;
  readonly requested_role: TeamNonOwnerRole;
  readonly introduction: string;
  readonly availability: string;
};

export type DecideTeamMembershipRequestBody = VersionedCommand & {
  readonly decision: "accept" | "reject";
  readonly assigned_role?: TeamNonOwnerRole;
  readonly reason: string;
};

export type WithdrawTeamMembershipRequestBody = VersionedCommand & { readonly reason: string };
export type ChangeTeamMemberRoleBody = VersionedCommand & {
  readonly role: TeamNonOwnerRole;
  readonly reason: string;
};
export type ChangeTeamMemberStateBody = VersionedCommand & { readonly reason: string };
export type TransferTeamOwnershipBody = VersionedCommand & {
  readonly successor_membership_id: MembershipId;
  readonly reason: string;
};
export type LeaveTeamBody = VersionedCommand & { readonly reason: string };
export type ArchiveTeamBody = VersionedCommand & { readonly reason: string };

export type TeamNextAction =
  | "continue"
  | "switch_workspace"
  | "review_team"
  | "review_invitations"
  | "review_membership_requests";

export type TeamSuccessEnvelope = SuccessEnvelope<TeamResource>;
export type TeamInvitationListSuccessEnvelope = SuccessEnvelope<{
  readonly items: readonly TeamInvitationResource[];
}>;
export type TeamMembershipRequestListSuccessEnvelope = SuccessEnvelope<{
  readonly items: readonly TeamMembershipRequestResource[];
}>;
export type TeamMutationSuccessEnvelope = SuccessEnvelope<
  MutationReceipt<
    WorkspaceId | MembershipId | TeamInvitationId | TeamMembershipRequestId,
    TeamNextAction
  >
>;
