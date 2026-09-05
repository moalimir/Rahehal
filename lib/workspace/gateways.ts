import type {
  CreateDirectOfferBody,
  DirectOfferListSuccessEnvelope,
  DirectOfferResource,
  DirectOfferListResource,
  DirectOfferSuccessEnvelope,
  MutationSuccessEnvelope,
  EligibilitySuccessEnvelope,
  EligibilityDecisionResource,
  NotificationListResource,
  NotificationListSuccessEnvelope,
  NotificationSummaryResource,
  NotificationSummarySuccessEnvelope,
  OrganizationProposalInboxResource,
  OrganizationProposalInboxSuccessEnvelope,
  OrganizationProposalResource,
  OrganizationProposalSuccessEnvelope,
  ProposalListResource,
  ProposalListSuccessEnvelope,
  ProposalResource,
  ProposalSuccessEnvelope,
  SavedOpportunityListResource,
  SavedOpportunityListSuccessEnvelope,
  SolverWorkspaceProfileResource,
  SolverWorkspaceProfileSuccessEnvelope,
  SolverVerificationResource,
  SolverVerificationSuccessEnvelope,
  TeamInvitationListSuccessEnvelope,
  TeamInvitationResource,
  TeamMembershipRequestListSuccessEnvelope,
  TeamMembershipRequestResource,
  TeamResource,
  TeamSuccessEnvelope,
} from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import { idempotencyKey, requestApi } from "@/lib/api/http";
import { toResult, type GatewayResult } from "@/lib/api/result";

/**
 * The connected gateways C9 puts in front of every workspace page family.
 *
 * Each one reads the active workspace at request time through the injected
 * resolver rather than closing over a render-time value, so switching
 * workspaces changes scope for in-flight pages without rebuilding the tree.
 * None of them touch `localStorage`, `sessionStorage`, or the demo repository:
 * in network mode the server is the only authority.
 */
export type WorkspaceScopeResolver = {
  readonly activeWorkspaceId: () => string | null;
};

function headers(scope: WorkspaceScopeResolver, command?: string): HeadersInit {
  const workspaceId = scope.activeWorkspaceId();
  return {
    ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
    ...(command ? { "idempotency-key": idempotencyKey(command) } : {}),
  };
}

function path(template: string, replacements: Readonly<Record<string, string>>): string {
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replace(`{${token}}`, encodeURIComponent(value)),
    template,
  );
}

// ---------------------------------------------------------------- C1 profile

export type SolverProfileGateway = {
  read(): Promise<GatewayResult<SolverWorkspaceProfileResource>>;
  update(input: {
    readonly expectedVersion: number;
    readonly patch: Partial<
      Pick<SolverWorkspaceProfileResource, "headline" | "overview" | "expertise" | "geography">
    >;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  readVerification(): Promise<GatewayResult<SolverVerificationResource>>;
  startVerification(
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  evaluateEligibility(challengeId: string): Promise<GatewayResult<EligibilityDecisionResource>>;
  acceptEligibilityGate(input: {
    readonly challengeId: string;
    readonly challengeVersionId: string;
    readonly gate: "nda" | "document_acknowledgement";
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createSolverProfileGateway(scope: WorkspaceScopeResolver): SolverProfileGateway {
  return {
    async read() {
      const envelope = await requestApi<SolverWorkspaceProfileSuccessEnvelope>(
        apiRoutes.solverProfile,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as SolverWorkspaceProfileResource);
    },
    async update({ expectedVersion, patch: profilePatch }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(apiRoutes.solverProfile, {
        method: "PATCH",
        headers: headers(scope, "solver-profile-update"),
        body: JSON.stringify({ expected_version: expectedVersion, patch: profilePatch }),
      });
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async readVerification() {
      const envelope = await requestApi<SolverVerificationSuccessEnvelope>(
        apiRoutes.solverVerification,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as SolverVerificationResource);
    },
    async startVerification(expectedVersion) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        apiRoutes.startSolverVerification,
        {
          method: "POST",
          headers: headers(scope, "solver-verification-start"),
          body: JSON.stringify({ expected_version: expectedVersion }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async evaluateEligibility(challengeId) {
      const envelope = await requestApi<EligibilitySuccessEnvelope>(
        path(apiRoutes.challengeEligibility, { challengeId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as EligibilityDecisionResource);
    },
    async acceptEligibilityGate({ challengeId, challengeVersionId, gate }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.acceptChallengeEligibilityGate, { challengeId, gate }),
        {
          method: "POST",
          headers: headers(scope, `eligibility-${gate}`),
          body: JSON.stringify({
            expected_version: 0,
            challenge_version_id: challengeVersionId,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

// ------------------------------------------------------------------ C2 teams

export type TeamGateway = {
  /**
   * The active team workspace, with its policy and full membership.
   *
   * There is deliberately no team *list* here: the set of teams a human can
   * reach is already the workspace list `/me` returns, and a second list route
   * would be a second answer to the same authorization question.
   */
  read(): Promise<GatewayResult<TeamResource>>;
  /** Invitations this human has received, across teams. */
  incomingInvitations(): Promise<GatewayResult<readonly TeamInvitationResource[]>>;
  /** Invitations the active team has sent. */
  sentInvitations(): Promise<GatewayResult<readonly TeamInvitationResource[]>>;
  /** Membership requests addressed to the active team. */
  incomingRequests(): Promise<GatewayResult<readonly TeamMembershipRequestResource[]>>;
  /** Membership requests this human has sent to other teams. */
  ownRequests(): Promise<GatewayResult<readonly TeamMembershipRequestResource[]>>;

  // C2 commands. Every one carries the aggregate version it acted on, so a
  // stale page is refused with a typed conflict instead of overwriting a
  // decision someone else already made.
  create(input: {
    readonly name: string;
    readonly teamKind: string;
    readonly joinMode?: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  updatePolicy(input: {
    readonly expectedVersion: number;
    readonly reason: string;
    readonly joinMode?: string;
    readonly defaultInvitationRole?: string;
    readonly policy?: Readonly<Record<string, unknown>>;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  invite(input: {
    readonly expectedVersion: number;
    readonly recipientEmail: string;
    readonly proposedRole: string;
    readonly scope: string;
    readonly message: string;
    readonly commitment: string;
    readonly ipNotice: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  revokeInvitation(
    teamInvitationId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  respondToInvitation(
    teamInvitationId: string,
    input: {
      readonly expectedVersion: number;
      readonly decision: "accept" | "decline";
      readonly reason?: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  requestMembership(
    workspaceId: string,
    input: {
      readonly requestedRole: string;
      readonly introduction: string;
      readonly availability: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  decideRequest(
    teamMembershipRequestId: string,
    input: {
      readonly expectedVersion: number;
      readonly decision: "accept" | "reject";
      readonly assignedRole?: string;
      readonly reason: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  withdrawRequest(
    teamMembershipRequestId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  changeMemberRole(
    membershipId: string,
    input: { readonly expectedVersion: number; readonly role: string; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  suspendMember(
    membershipId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  restoreMember(
    membershipId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  removeMember(
    membershipId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  transferOwnership(input: {
    readonly expectedVersion: number;
    readonly successorMembershipId: string;
    readonly reason: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  leave(input: {
    readonly expectedVersion: number;
    readonly reason: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  archive(input: {
    readonly expectedVersion: number;
    readonly reason: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createTeamGateway(scope: WorkspaceScopeResolver): TeamGateway {
  const invitations = async (route: string) => {
    const envelope = await requestApi<TeamInvitationListSuccessEnvelope>(route, {
      headers: headers(scope),
    });
    return toResult(
      envelope,
      (data) => (data as { items: readonly TeamInvitationResource[] }).items,
    );
  };
  const requests = async (route: string) => {
    const envelope = await requestApi<TeamMembershipRequestListSuccessEnvelope>(route, {
      headers: headers(scope),
    });
    return toResult(
      envelope,
      (data) => (data as { items: readonly TeamMembershipRequestResource[] }).items,
    );
  };
  const send = async (
    route: string,
    idempotency: string,
    body: Readonly<Record<string, unknown>>,
    method: "POST" | "PATCH" = "POST",
  ) => {
    const envelope = await requestApi<MutationSuccessEnvelope>(route, {
      method,
      headers: headers(scope, idempotency),
      body: JSON.stringify(body),
    });
    return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
  };
  return {
    incomingInvitations: () => invitations(apiRoutes.solverTeamIncomingInvitations),
    sentInvitations: () => invitations(apiRoutes.solverTeamInvitations),
    incomingRequests: () => requests(apiRoutes.solverTeamMembershipRequests),
    ownRequests: () => requests(apiRoutes.solverOwnTeamMembershipRequests),
    async read() {
      const envelope = await requestApi<TeamSuccessEnvelope>(apiRoutes.solverTeam, {
        headers: headers(scope),
      });
      return toResult(envelope, (data) => data as TeamResource);
    },

    create: ({ name, teamKind, joinMode }) =>
      send(apiRoutes.solverTeams, "team-create", {
        expected_version: 0,
        name,
        team_kind: teamKind,
        ...(joinMode ? { join_mode: joinMode } : {}),
      }),
    updatePolicy: ({ expectedVersion, reason, joinMode, defaultInvitationRole, policy }) =>
      send(
        apiRoutes.solverTeamPolicy,
        "team-policy",
        {
          expected_version: expectedVersion,
          reason,
          ...(joinMode ? { join_mode: joinMode } : {}),
          ...(defaultInvitationRole ? { default_invitation_role: defaultInvitationRole } : {}),
          ...(policy ? { policy } : {}),
        },
        "PATCH",
      ),
    invite: ({
      expectedVersion,
      recipientEmail,
      proposedRole,
      scope: invitationScope,
      message,
      commitment,
      ipNotice,
    }) =>
      send(apiRoutes.solverTeamInvitations, "team-invite", {
        expected_version: expectedVersion,
        recipient_email: recipientEmail,
        proposed_role: proposedRole,
        scope: invitationScope,
        message,
        commitment,
        ip_notice: ipNotice,
      }),
    revokeInvitation: (teamInvitationId, { expectedVersion, reason }) =>
      send(path(apiRoutes.revokeSolverTeamInvitation, { teamInvitationId }), "team-invite-revoke", {
        expected_version: expectedVersion,
        reason,
      }),
    respondToInvitation: (teamInvitationId, { expectedVersion, decision, reason }) =>
      send(
        path(apiRoutes.respondSolverTeamInvitation, { teamInvitationId }),
        "team-invite-respond",
        {
          expected_version: expectedVersion,
          decision,
          ...(reason === undefined ? {} : { reason }),
        },
      ),
    requestMembership: (workspaceId, { requestedRole, introduction, availability }) =>
      send(path(apiRoutes.createSolverTeamMembershipRequest, { workspaceId }), "team-request", {
        expected_version: 0,
        requested_role: requestedRole,
        introduction,
        availability,
      }),
    decideRequest: (teamMembershipRequestId, { expectedVersion, decision, assignedRole, reason }) =>
      send(
        path(apiRoutes.decideSolverTeamMembershipRequest, { teamMembershipRequestId }),
        "team-request-decide",
        {
          expected_version: expectedVersion,
          decision,
          ...(assignedRole ? { assigned_role: assignedRole } : {}),
          reason,
        },
      ),
    withdrawRequest: (teamMembershipRequestId, { expectedVersion, reason }) =>
      send(
        path(apiRoutes.withdrawSolverTeamMembershipRequest, { teamMembershipRequestId }),
        "team-request-withdraw",
        { expected_version: expectedVersion, reason },
      ),
    changeMemberRole: (membershipId, { expectedVersion, role, reason }) =>
      send(path(apiRoutes.changeSolverTeamMemberRole, { membershipId }), "team-role", {
        expected_version: expectedVersion,
        role,
        reason,
      }),
    suspendMember: (membershipId, { expectedVersion, reason }) =>
      send(path(apiRoutes.suspendSolverTeamMember, { membershipId }), "team-suspend", {
        expected_version: expectedVersion,
        reason,
      }),
    restoreMember: (membershipId, { expectedVersion, reason }) =>
      send(path(apiRoutes.restoreSolverTeamMember, { membershipId }), "team-restore", {
        expected_version: expectedVersion,
        reason,
      }),
    removeMember: (membershipId, { expectedVersion, reason }) =>
      send(path(apiRoutes.removeSolverTeamMember, { membershipId }), "team-remove", {
        expected_version: expectedVersion,
        reason,
      }),
    transferOwnership: ({ expectedVersion, successorMembershipId, reason }) =>
      send(apiRoutes.transferSolverTeamOwnership, "team-transfer", {
        expected_version: expectedVersion,
        successor_membership_id: successorMembershipId,
        reason,
      }),
    leave: ({ expectedVersion, reason }) =>
      send(apiRoutes.leaveSolverTeam, "team-leave", {
        expected_version: expectedVersion,
        reason,
      }),
    archive: ({ expectedVersion, reason }) =>
      send(apiRoutes.archiveSolverTeam, "team-archive", {
        expected_version: expectedVersion,
        reason,
      }),
  };
}

// ------------------------------------------------------------- C3–C5 proposals

export type ProposalGateway = {
  list(): Promise<GatewayResult<ProposalListResource>>;
  get(proposalId: string): Promise<GatewayResult<ProposalResource>>;
  create(input: {
    readonly challengeId: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  patch(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly patch: Readonly<Record<string, unknown>>;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  submit(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly acceptedChallengeVersionId: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  submitClarification(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly clarificationId: string;
      readonly response: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  startRevision(
    proposalId: string,
    input: { readonly expectedVersion: number; readonly revisionRequestId: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  resubmit(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly revisionRequestId: string;
      readonly acceptedChallengeVersionId: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createProposalGateway(scope: WorkspaceScopeResolver): ProposalGateway {
  return {
    async list() {
      const envelope = await requestApi<ProposalListSuccessEnvelope>(apiRoutes.proposals, {
        headers: headers(scope),
      });
      return toResult(envelope, (data) => data as ProposalListResource);
    },
    async get(proposalId) {
      const envelope = await requestApi<ProposalSuccessEnvelope>(
        path(apiRoutes.proposalById, { proposalId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as ProposalResource);
    },
    async create({ challengeId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(apiRoutes.proposals, {
        method: "POST",
        headers: headers(scope, "proposal-create"),
        body: JSON.stringify({ expected_version: 0, challenge_id: challengeId }),
      });
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async patch(proposalId, { expectedVersion, patch }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.proposalById, { proposalId }),
        {
          method: "PATCH",
          headers: headers(scope, "proposal-patch"),
          body: JSON.stringify({ expected_version: expectedVersion, patch }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async submit(proposalId, { expectedVersion, acceptedChallengeVersionId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.submitProposal, { proposalId }),
        {
          method: "POST",
          headers: headers(scope, "proposal-submit"),
          body: JSON.stringify({
            expected_version: expectedVersion,
            accepted_challenge_version_id: acceptedChallengeVersionId,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async submitClarification(proposalId, { expectedVersion, clarificationId, response }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.submitProposalClarification, { proposalId }),
        {
          method: "POST",
          headers: headers(scope, "proposal-clarification-submit"),
          body: JSON.stringify({
            expected_version: expectedVersion,
            clarification_id: clarificationId,
            response,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async startRevision(proposalId, { expectedVersion, revisionRequestId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.startProposalRevision, { proposalId }),
        {
          method: "POST",
          headers: headers(scope, "proposal-revision-start"),
          body: JSON.stringify({
            expected_version: expectedVersion,
            revision_request_id: revisionRequestId,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async resubmit(proposalId, { expectedVersion, revisionRequestId, acceptedChallengeVersionId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.resubmitProposal, { proposalId }),
        {
          method: "POST",
          headers: headers(scope, "proposal-resubmit"),
          body: JSON.stringify({
            expected_version: expectedVersion,
            revision_request_id: revisionRequestId,
            accepted_challenge_version_id: acceptedChallengeVersionId,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

// ------------------------------------------------- C4 organization proposal reads

export type OrganizationProposalGateway = {
  inbox(): Promise<GatewayResult<OrganizationProposalInboxResource>>;
  get(proposalId: string): Promise<GatewayResult<OrganizationProposalResource>>;

  // C4/C5 organization commands. Each one names the proposal version it acted
  // on, so a decision recorded against a superseded version is refused rather
  // than silently applied to a newer one.
  startEligibilityReview(
    proposalId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  decideEligibility(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly decision: "eligible" | "ineligible";
      readonly reason: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  requestClarification(
    proposalId: string,
    input: { readonly expectedVersion: number; readonly question: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  resolveClarification(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly clarificationId: string;
      readonly resolution: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  requestRevision(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly scope: string;
      readonly revisionDeadline: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createOrganizationProposalGateway(
  scope: WorkspaceScopeResolver,
): OrganizationProposalGateway {
  const command = async (
    template: string,
    proposalId: string,
    idempotency: string,
    body: Readonly<Record<string, unknown>>,
  ) => {
    const envelope = await requestApi<MutationSuccessEnvelope>(path(template, { proposalId }), {
      method: "POST",
      headers: headers(scope, idempotency),
      body: JSON.stringify(body),
    });
    return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
  };
  return {
    async inbox() {
      const envelope = await requestApi<OrganizationProposalInboxSuccessEnvelope>(
        apiRoutes.organizationProposalInbox,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as OrganizationProposalInboxResource);
    },
    async get(proposalId) {
      const envelope = await requestApi<OrganizationProposalSuccessEnvelope>(
        path(apiRoutes.organizationProposalById, { proposalId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as OrganizationProposalResource);
    },

    startEligibilityReview: (proposalId, expectedVersion) =>
      command(apiRoutes.startProposalEligibilityReview, proposalId, "org-eligibility-start", {
        expected_version: expectedVersion,
      }),
    decideEligibility: (proposalId, { expectedVersion, decision, reason }) =>
      command(apiRoutes.decideProposalEligibility, proposalId, "org-eligibility-decide", {
        expected_version: expectedVersion,
        decision,
        reason,
      }),
    requestClarification: (proposalId, { expectedVersion, question }) =>
      command(apiRoutes.requestProposalClarification, proposalId, "org-clarify-request", {
        expected_version: expectedVersion,
        question,
      }),
    resolveClarification: (proposalId, { expectedVersion, clarificationId, resolution }) =>
      command(apiRoutes.resolveProposalClarification, proposalId, "org-clarify-resolve", {
        expected_version: expectedVersion,
        clarification_id: clarificationId,
        resolution,
      }),
    requestRevision: (proposalId, { expectedVersion, scope: revisionScope, revisionDeadline }) =>
      command(apiRoutes.requestProposalRevision, proposalId, "org-revision-request", {
        expected_version: expectedVersion,
        scope: revisionScope,
        revision_deadline: revisionDeadline,
      }),
  };
}

// -------------------------------------------- C6 saved opportunities and offers

export type SavedOpportunityGateway = {
  list(): Promise<GatewayResult<SavedOpportunityListResource>>;
  save(challengeId: string): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  unsave(
    challengeId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createSavedOpportunityGateway(
  scope: WorkspaceScopeResolver,
): SavedOpportunityGateway {
  return {
    async list() {
      const envelope = await requestApi<SavedOpportunityListSuccessEnvelope>(
        apiRoutes.solverSavedOpportunities,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as SavedOpportunityListResource);
    },
    async save(challengeId) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.saveOpportunity, { challengeId }),
        {
          method: "POST",
          headers: headers(scope, "opportunity-save"),
          body: JSON.stringify({ expected_version: 0 }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async unsave(challengeId, expectedVersion) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.unsaveOpportunity, { challengeId }),
        {
          method: "POST",
          headers: headers(scope, "opportunity-unsave"),
          body: JSON.stringify({ expected_version: expectedVersion }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

export type DirectOfferGateway = {
  list(): Promise<GatewayResult<DirectOfferListResource>>;
  get(directOfferId: string): Promise<GatewayResult<DirectOfferResource>>;
  view(
    directOfferId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  startResponse(
    directOfferId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  saveResponse(
    directOfferId: string,
    input: {
      readonly expectedVersion: number;
      readonly patch: Readonly<Record<string, unknown>>;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  submitResponse(
    directOfferId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  decline(
    directOfferId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createDirectOfferGateway(scope: WorkspaceScopeResolver): DirectOfferGateway {
  const command = async (
    template: string,
    directOfferId: string,
    idempotency: string,
    body: Readonly<Record<string, unknown>>,
  ) => {
    const envelope = await requestApi<MutationSuccessEnvelope>(path(template, { directOfferId }), {
      method: "POST",
      headers: headers(scope, idempotency),
      body: JSON.stringify(body),
    });
    return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
  };
  return {
    async list() {
      const envelope = await requestApi<DirectOfferListSuccessEnvelope>(
        apiRoutes.solverDirectOffers,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as DirectOfferListResource);
    },
    async get(directOfferId) {
      const envelope = await requestApi<DirectOfferSuccessEnvelope>(
        path(apiRoutes.solverDirectOfferById, { directOfferId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as DirectOfferResource);
    },
    view: (directOfferId, expectedVersion) =>
      command(apiRoutes.viewDirectOffer, directOfferId, "offer-view", {
        expected_version: expectedVersion,
      }),
    startResponse: (directOfferId, expectedVersion) =>
      command(apiRoutes.startOfferResponse, directOfferId, "offer-response-start", {
        expected_version: expectedVersion,
      }),
    async saveResponse(directOfferId, { expectedVersion, patch }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.offerResponse, { directOfferId }),
        {
          method: "PATCH",
          headers: headers(scope, "offer-response-save"),
          body: JSON.stringify({ expected_version: expectedVersion, patch }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    submitResponse: (directOfferId, expectedVersion) =>
      command(apiRoutes.submitOfferResponse, directOfferId, "offer-response-submit", {
        expected_version: expectedVersion,
      }),
    decline: (directOfferId, { expectedVersion, reason }) =>
      command(apiRoutes.declineDirectOffer, directOfferId, "offer-decline", {
        expected_version: expectedVersion,
        reason,
      }),
  };
}

export type OrganizationDirectOfferGateway = {
  list(): Promise<GatewayResult<DirectOfferListResource>>;
  get(directOfferId: string): Promise<GatewayResult<DirectOfferResource>>;
  send(
    input: Omit<CreateDirectOfferBody, "expected_version">,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  cancel(
    directOfferId: string,
    input: { readonly expectedVersion: number; readonly reason: string },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  startNegotiation(
    directOfferId: string,
    expectedVersion: number,
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createOrganizationDirectOfferGateway(
  scope: WorkspaceScopeResolver,
): OrganizationDirectOfferGateway {
  return {
    async list() {
      const envelope = await requestApi<DirectOfferListSuccessEnvelope>(
        apiRoutes.organizationDirectOffers,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as DirectOfferListResource);
    },
    async get(directOfferId) {
      const envelope = await requestApi<DirectOfferSuccessEnvelope>(
        path(apiRoutes.organizationDirectOfferById, { directOfferId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as DirectOfferResource);
    },
    async send(input) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        apiRoutes.organizationDirectOffers,
        {
          method: "POST",
          headers: headers(scope, "direct-offer-send"),
          body: JSON.stringify({ expected_version: 0, ...input }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async cancel(directOfferId, { expectedVersion, reason }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.cancelDirectOffer, { directOfferId }),
        {
          method: "POST",
          headers: headers(scope, "direct-offer-cancel"),
          body: JSON.stringify({ expected_version: expectedVersion, reason }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async startNegotiation(directOfferId, expectedVersion) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.startDirectOfferNegotiation, { directOfferId }),
        {
          method: "POST",
          headers: headers(scope, "direct-offer-negotiate"),
          body: JSON.stringify({ expected_version: expectedVersion }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

// ---------------------------------------------------------- C8 notifications

export type NotificationGateway = {
  list(query?: {
    readonly limit?: number;
    readonly cursor?: string;
    readonly unreadOnly?: boolean;
  }): Promise<GatewayResult<NotificationListResource>>;
  summary(): Promise<GatewayResult<NotificationSummaryResource>>;
  markRead(notificationId: string): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  markAllRead(): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createNotificationGateway(scope: WorkspaceScopeResolver): NotificationGateway {
  return {
    async list(query = {}) {
      const search = new URLSearchParams();
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      if (query.unreadOnly) search.set("unread_only", "true");
      const suffix = search.size > 0 ? `?${search.toString()}` : "";
      const envelope = await requestApi<NotificationListSuccessEnvelope>(
        `${apiRoutes.notifications}${suffix}`,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as NotificationListResource);
    },
    async summary() {
      const envelope = await requestApi<NotificationSummarySuccessEnvelope>(
        apiRoutes.notificationSummary,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as NotificationSummaryResource);
    },
    async markRead(notificationId) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.markNotificationRead, { notificationId }),
        {
          method: "POST",
          headers: headers(scope, "notification-read"),
          body: JSON.stringify({ expected_version: 0 }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async markAllRead() {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        apiRoutes.markAllNotificationsRead,
        {
          method: "POST",
          headers: headers(scope, "notification-read-all"),
          body: JSON.stringify({ expected_version: 0 }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

export type WorkspaceGateways = {
  readonly solverProfile: SolverProfileGateway;
  readonly team: TeamGateway;
  readonly proposals: ProposalGateway;
  readonly organizationProposals: OrganizationProposalGateway;
  readonly savedOpportunities: SavedOpportunityGateway;
  readonly directOffers: DirectOfferGateway;
  readonly organizationDirectOffers: OrganizationDirectOfferGateway;
  readonly notifications: NotificationGateway;
};

export function createWorkspaceGateways(scope: WorkspaceScopeResolver): WorkspaceGateways {
  return {
    solverProfile: createSolverProfileGateway(scope),
    team: createTeamGateway(scope),
    proposals: createProposalGateway(scope),
    organizationProposals: createOrganizationProposalGateway(scope),
    savedOpportunities: createSavedOpportunityGateway(scope),
    directOffers: createDirectOfferGateway(scope),
    organizationDirectOffers: createOrganizationDirectOfferGateway(scope),
    notifications: createNotificationGateway(scope),
  };
}
