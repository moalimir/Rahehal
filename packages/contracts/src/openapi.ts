import { apiRoutes } from "./routes.js";
import { apiSchemas, type ApiSchemaName } from "./schemas.js";

const schemaRef = (name: ApiSchemaName) => ({
  $ref: `#/components/schemas/${name}`,
});

const jsonContent = (schemaName: ApiSchemaName) => ({
  "application/json": { schema: schemaRef(schemaName) },
});

const errorResponse = (description: string) => ({
  description,
  content: jsonContent("ErrorEnvelope"),
});

const commonCommandErrors = {
  "403": errorResponse("The subject is not allowed to perform this action or step-up is required."),
  "409": errorResponse("The aggregate version or state conflicts with the command."),
  "422": errorResponse("The command failed schema or domain validation."),
  "503": errorResponse("The authoritative store is temporarily unavailable."),
} as const;

const protectedCommandErrors = {
  ...commonCommandErrors,
  "404": errorResponse("The protected resource is unavailable in the active workspace."),
} as const;

const idempotencyHeader = {
  in: "header",
  name: "Idempotency-Key",
  required: true,
  description: "A client-generated key reused only when retrying the same command.",
  schema: { type: "string", minLength: 8, maxLength: 200 },
} as const;

const workspaceHeader = {
  in: "header",
  name: "X-Workspace-Id",
  required: true,
  description: "The active workspace, validated against the authenticated subject's membership.",
  schema: { type: "string", pattern: "^wsp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const challengeIdParameter = {
  in: "path",
  name: "challengeId",
  required: true,
  schema: { type: "string", pattern: "^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "Rahhal API",
    version: "0.1.0",
    description: "Authoritative contracts for identity, workspace context, and challenge drafts.",
  },
  servers: [{ url: "/", description: "Current origin" }],
  tags: [{ name: "Contract" }, { name: "Session" }, { name: "Identity" }, { name: "Challenge" }],
  paths: {
    [apiRoutes.openApi]: {
      get: {
        operationId: "getOpenApiDocument",
        tags: ["Contract"],
        summary: "Read the API's exact OpenAPI specification",
        responses: {
          "200": {
            description: "The OpenAPI 3.1 specification.",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    [apiRoutes.sessionExchange]: {
      post: {
        operationId: "exchangeSession",
        tags: ["Session"],
        summary: "Exchange a validated OIDC authorization flow for an application session",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("SessionExchangeBody"),
        },
        responses: {
          "200": {
            description: "The application session and its mutation receipt.",
            content: jsonContent("SessionSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.sessionRefresh]: {
      post: {
        operationId: "refreshSession",
        tags: ["Session"],
        summary: "Rotate a current refresh token and advance the session version",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("SessionRefreshBody"),
        },
        responses: {
          "200": {
            description: "The rotated application session and its mutation receipt.",
            content: jsonContent("SessionSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.sessionRevoke]: {
      post: {
        operationId: "revokeSession",
        tags: ["Session"],
        summary: "Revoke an application session",
        security: [{ bearerAuth: [] }],
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("SessionRevokeBody"),
        },
        responses: {
          "200": {
            description: "A receipt for the revoked session.",
            content: jsonContent("SessionRevocationSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.me]: {
      get: {
        operationId: "getMe",
        tags: ["Identity"],
        summary: "Read the subject, memberships, available workspaces, and active context",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "The authenticated subject and current context.",
            content: jsonContent("MeSuccessEnvelope"),
          },
          "403": errorResponse("The session is absent, expired, or revoked."),
        },
      },
    },
    [apiRoutes.switchWorkspaceContext]: {
      post: {
        operationId: "switchWorkspaceContext",
        tags: ["Identity"],
        summary: "Switch the session to an actively held workspace membership",
        security: [{ bearerAuth: [] }],
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("SwitchWorkspaceContextBody"),
        },
        responses: {
          "200": {
            description: "A receipt for the session context mutation; read /me for the resource.",
            content: jsonContent("WorkspaceContextMutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.challenges]: {
      post: {
        operationId: "createChallengeDraft",
        tags: ["Challenge"],
        summary: "Create an organization-owned challenge draft",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("CreateChallengeBody"),
        },
        responses: {
          "201": {
            description: "A receipt for the created draft.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.challengeById]: {
      get: {
        operationId: "getChallengeDraft",
        tags: ["Challenge"],
        summary: "Read a private challenge draft scoped to its organization workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, challengeIdParameter],
        responses: {
          "200": {
            description: "The current challenge draft aggregate.",
            content: jsonContent("ChallengeSuccessEnvelope"),
          },
          "403": errorResponse("The session is absent, expired, or revoked."),
          "404": errorResponse("The protected resource is unavailable in the active workspace."),
        },
      },
      patch: {
        operationId: "saveChallengeDraft",
        tags: ["Challenge"],
        summary: "Save a non-empty patch against the expected challenge version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: {
          required: true,
          content: jsonContent("PatchChallengeBody"),
        },
        responses: {
          "200": {
            description: "A receipt for the saved challenge draft.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    schemas: apiSchemas,
  },
} as const;

export type OpenApiDocument = typeof openApiDocument;
