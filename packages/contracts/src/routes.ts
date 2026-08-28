export const apiRoutes = {
  openApi: "/api/v1/openapi.json",
  oidcAuthorizationStart: "/api/v1/auth/oidc:start",
  sessionExchange: "/api/v1/auth/session:exchange",
  sessionRefresh: "/api/v1/auth/session:refresh",
  sessionRevoke: "/api/v1/auth/session:revoke",
  me: "/api/v1/me",
  switchWorkspaceContext: "/api/v1/me/context:switch",
  challenges: "/api/v1/challenges",
  challengeById: "/api/v1/challenges/{challengeId}",
} as const;
