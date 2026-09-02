export const apiRoutes = {
  openApi: "/api/v1/openapi.json",
  oidcAuthorizationStart: "/api/v1/auth/oidc:start",
  sessionExchange: "/api/v1/auth/session:exchange",
  sessionRefresh: "/api/v1/auth/session:refresh",
  sessionRevoke: "/api/v1/auth/session:revoke",
  me: "/api/v1/me",
  switchWorkspaceContext: "/api/v1/me/context:switch",
  /** POST creates a draft; GET lists the active workspace's own challenges. */
  challenges: "/api/v1/challenges",
  challengeById: "/api/v1/challenges/{challengeId}",
  requestChallengeTriage: "/api/v1/challenges/{challengeId}:request-triage",
  advanceChallengeFormulation: "/api/v1/challenges/{challengeId}:advance-formulation",
  requestChallengeApprovals: "/api/v1/challenges/{challengeId}:request-approvals",
  recordChallengeApproval: "/api/v1/challenges/{challengeId}/approvals:record",
  platformChallengeApprovalQueue: "/api/v1/platform/challenge-approvals",
  platformChallengeApprovalBrief: "/api/v1/platform/challenges/{challengeId}/approval-brief",
  publishChallenge: "/api/v1/challenges/{challengeId}:publish",
  extendChallengeDeadline: "/api/v1/challenges/{challengeId}:extend-deadline",
  pauseChallenge: "/api/v1/challenges/{challengeId}:pause",
  resumeChallenge: "/api/v1/challenges/{challengeId}:resume",
  closeChallenge: "/api/v1/challenges/{challengeId}:close",
  cancelChallenge: "/api/v1/challenges/{challengeId}:cancel",
  publicChallenges: "/api/v1/public/challenges",
  publicChallengeById: "/api/v1/public/challenges/{challengeId}",
  solverProfile: "/api/v1/solver/profile",
  solverVerification: "/api/v1/solver/verification",
  startSolverVerification: "/api/v1/solver/verification:start",
  challengeEligibility: "/api/v1/challenges/{challengeId}/eligibility",
  acceptChallengeEligibilityGate:
    "/api/v1/challenges/{challengeId}/eligibility-gates/{gate}:accept",
  solverTeams: "/api/v1/solver/teams",
  solverTeam: "/api/v1/solver/team",
  solverTeamPolicy: "/api/v1/solver/team/policy",
  solverTeamInvitations: "/api/v1/solver/team/invitations",
  revokeSolverTeamInvitation: "/api/v1/solver/team/invitations/{teamInvitationId}:revoke",
  solverTeamIncomingInvitations: "/api/v1/solver/team-invitations",
  respondSolverTeamInvitation: "/api/v1/solver/team-invitations/{teamInvitationId}:respond",
  createSolverTeamMembershipRequest: "/api/v1/solver/teams/{workspaceId}/membership-requests",
  solverTeamMembershipRequests: "/api/v1/solver/team/membership-requests",
  decideSolverTeamMembershipRequest:
    "/api/v1/solver/team/membership-requests/{teamMembershipRequestId}:decide",
  solverOwnTeamMembershipRequests: "/api/v1/solver/team-membership-requests",
  withdrawSolverTeamMembershipRequest:
    "/api/v1/solver/team-membership-requests/{teamMembershipRequestId}:withdraw",
  changeSolverTeamMemberRole: "/api/v1/solver/team/members/{membershipId}:change-role",
  suspendSolverTeamMember: "/api/v1/solver/team/members/{membershipId}:suspend",
  restoreSolverTeamMember: "/api/v1/solver/team/members/{membershipId}:restore",
  removeSolverTeamMember: "/api/v1/solver/team/members/{membershipId}:remove",
  transferSolverTeamOwnership: "/api/v1/solver/team:transfer-ownership",
  leaveSolverTeam: "/api/v1/solver/team:leave",
  archiveSolverTeam: "/api/v1/solver/team:archive",
} as const;

/**
 * Same-origin browser transport owned by the web runtime. These routes are
 * intentionally separate from the bearer-token OpenAPI surface: they adapt
 * the OIDC/session contract to HttpOnly cookies and never expose credentials
 * to client JavaScript.
 */
export const browserSessionRoutes = {
  oidcAuthorizationStart: "/auth/browser/oidc:start",
  oidcCallback: "/auth/browser/callback",
  sessionRevoke: "/auth/browser/session:revoke",
} as const;
