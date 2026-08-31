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
