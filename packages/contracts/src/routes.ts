export const apiRoutes = {
  challengeRubric: "/api/v1/challenges/{challengeId}/rubric",
  createRubricVersion: "/api/v1/challenges/{challengeId}/rubric-versions",
  challengeEvaluation: "/api/v1/challenges/{challengeId}/evaluation",
  openChallengeEvaluation: "/api/v1/challenges/{challengeId}:open-evaluation",
  reviewAssignments: "/api/v1/assignments",
  reviewAssignmentById: "/api/v1/assignments/{assignmentId}",
  openApi: "/api/v1/openapi.json",
  oidcAuthorizationStart: "/api/v1/auth/oidc:start",
  contactVerificationStart: "/api/v1/auth/contact-verification:start",
  resendContactVerification: "/api/v1/auth/contact-verifications/{attemptId}:resend",
  verifyContact: "/api/v1/auth/contact-verifications/{attemptId}:verify",
  contactSessionExchange: "/api/v1/auth/contact-session:exchange",
  solverActivation: "/api/v1/solver/activation",
  notifications: "/api/v1/notifications",
  notificationSummary: "/api/v1/notifications/summary",
  markNotificationRead: "/api/v1/notifications/{notificationId}:read",
  markAllNotificationsRead: "/api/v1/notifications:read-all",
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
  proposals: "/api/v1/proposals",
  proposalById: "/api/v1/proposals/{proposalId}",
  submitProposal: "/api/v1/proposals/{proposalId}:submit",
  submitProposalClarification: "/api/v1/proposals/{proposalId}:submit-clarification",
  startProposalRevision: "/api/v1/proposals/{proposalId}:start-revision",
  resubmitProposal: "/api/v1/proposals/{proposalId}:resubmit",
  organizationProposalInbox: "/api/v1/organization/proposals",
  organizationProposalById: "/api/v1/organization/proposals/{proposalId}",
  startProposalEligibilityReview:
    "/api/v1/organization/proposals/{proposalId}:start-eligibility-review",
  decideProposalEligibility: "/api/v1/organization/proposals/{proposalId}:decide-eligibility",
  requestProposalClarification: "/api/v1/organization/proposals/{proposalId}:request-clarification",
  resolveProposalClarification: "/api/v1/organization/proposals/{proposalId}:resolve-clarification",
  requestProposalRevision: "/api/v1/organization/proposals/{proposalId}:request-revision",
  solverSavedOpportunities: "/api/v1/solver/saved-opportunities",
  saveOpportunity: "/api/v1/challenges/{challengeId}:save",
  unsaveOpportunity: "/api/v1/challenges/{challengeId}:unsave",
  solverDirectOffers: "/api/v1/solver/direct-offers",
  solverDirectOfferById: "/api/v1/solver/direct-offers/{directOfferId}",
  viewDirectOffer: "/api/v1/solver/direct-offers/{directOfferId}:view",
  startOfferResponse: "/api/v1/solver/direct-offers/{directOfferId}:start-response",
  offerResponse: "/api/v1/solver/direct-offers/{directOfferId}/response",
  submitOfferResponse: "/api/v1/solver/direct-offers/{directOfferId}/response:submit",
  declineDirectOffer: "/api/v1/solver/direct-offers/{directOfferId}:decline",
  organizationDirectOffers: "/api/v1/organization/direct-offers",
  organizationDirectOfferById: "/api/v1/organization/direct-offers/{directOfferId}",
  cancelDirectOffer: "/api/v1/organization/direct-offers/{directOfferId}:cancel",
  startDirectOfferNegotiation:
    "/api/v1/organization/direct-offers/{directOfferId}:start-negotiation",
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
  sessionRefresh: "/auth/browser/session:refresh",
  sessionRevoke: "/auth/browser/session:revoke",
  /**
   * The contact-verification siblings of the OIDC callback.
   *
   * `POST /api/v1/auth/contact-session:exchange` and `POST
   * /api/v1/solver/activation` both return bearer tokens in their response
   * body, which is correct for a service client and wrong for a browser: the
   * web runtime keeps credentials in HttpOnly cookies and never exposes them
   * to client JavaScript. These two routes run the same commands and set the
   * cookies instead, so a solver can sign in and activate from the browser
   * without a token ever reaching a script.
   */
  contactSessionExchange: "/auth/browser/contact-session:exchange",
  solverActivation: "/auth/browser/solver:activate",
} as const;
