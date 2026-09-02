import { challengeManagedStages } from "@rahhal/domain";

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
    description:
      "Authoritative contracts for identity, workspace context, governed challenges, and solver eligibility.",
  },
  servers: [{ url: "/", description: "Current origin" }],
  tags: [
    { name: "Contract" },
    { name: "Session" },
    { name: "Identity" },
    { name: "Challenge" },
    { name: "Solver" },
  ],
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
    [apiRoutes.oidcAuthorizationStart]: {
      post: {
        operationId: "startOidcAuthorization",
        tags: ["Session"],
        summary: "Start a server-bound OIDC authorization-code and PKCE flow",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: jsonContent("OidcAuthorizationStartBody"),
        },
        responses: {
          "200": {
            description: "The provider authorization URL and one-time browser-held PKCE values.",
            content: jsonContent("OidcAuthorizationStartSuccessEnvelope"),
          },
          "409": commonCommandErrors["409"],
          "422": commonCommandErrors["422"],
          "503": commonCommandErrors["503"],
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
      get: {
        operationId: "listChallenges",
        tags: ["Challenge"],
        summary: "List the active organization workspace's own challenges",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          {
            name: "stage",
            in: "query",
            required: false,
            schema: { type: "string", enum: [...challengeManagedStages] },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
        ],
        responses: {
          "200": {
            description: "One page of the workspace's challenges, newest first.",
            content: jsonContent("ChallengePageSuccessEnvelope"),
          },
          "403": errorResponse("The session is absent, expired, or revoked."),
          "422": errorResponse("The stage filter or cursor is not readable."),
        },
      },
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
    [apiRoutes.requestChallengeTriage]: {
      post: {
        operationId: "requestChallengeTriage",
        tags: ["Challenge"],
        summary: "Submit the current ready brief for triage and lock its content version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengeTransitionBody") },
        responses: {
          "200": {
            description: "A receipt for the draft to triage transition.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.advanceChallengeFormulation]: {
      post: {
        operationId: "advanceChallengeFormulation",
        tags: ["Challenge"],
        summary: "Record successful triage and open formulation authoring",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengeTransitionBody") },
        responses: {
          "200": {
            description: "A receipt for the triage to formulation transition.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.requestChallengeApprovals]: {
      post: {
        operationId: "requestChallengeApprovals",
        tags: ["Challenge"],
        summary: "Submit the ready formulation for approvals and lock its content version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengeTransitionBody") },
        responses: {
          "200": {
            description: "A receipt for the formulation to approvals transition.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.recordChallengeApproval]: {
      post: {
        operationId: "recordChallengeApproval",
        tags: ["Challenge"],
        summary:
          "Record one publication gate decision (technical/legal/finance/quality) for the locked approvals version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("RecordChallengeApprovalBody") },
        responses: {
          "200": {
            description: "A receipt for the recorded gate decision.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.platformChallengeApprovalQueue]: {
      get: {
        operationId: "listPlatformChallengeApprovals",
        tags: ["Challenge"],
        summary: "List approval-stage challenges awaiting the active platform role's gate",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The role-scoped platform approval queue.",
            content: jsonContent("PlatformChallengeApprovalQueueSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.platformChallengeApprovalBrief]: {
      get: {
        operationId: "getPlatformChallengeApprovalBrief",
        tags: ["Challenge"],
        summary: "Read an allowlisted approval brief through standing platform authority",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, challengeIdParameter],
        responses: {
          "200": {
            description: "The allowlisted approval brief for the locked version.",
            content: jsonContent("ChallengeApprovalBriefSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.extendChallengeDeadline]: {
      post: {
        operationId: "extendChallengeDeadline",
        tags: ["Challenge"],
        summary: "Extend an open call's proposal deadline; never rewrites the approved version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ExtendChallengeDeadlineBody") },
        responses: {
          "200": {
            description: "A receipt for the publication-lifecycle change.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.pauseChallenge]: {
      post: {
        operationId: "pauseChallenge",
        tags: ["Challenge"],
        summary: "Pause a published call: hidden from discovery, record preserved",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengePublicationStateBody") },
        responses: {
          "200": {
            description: "A receipt for the publication-lifecycle change.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.resumeChallenge]: {
      post: {
        operationId: "resumeChallenge",
        tags: ["Challenge"],
        summary: "Resume a paused call",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengePublicationStateBody") },
        responses: {
          "200": {
            description: "A receipt for the publication-lifecycle change.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.closeChallenge]: {
      post: {
        operationId: "closeChallenge",
        tags: ["Challenge"],
        summary: "Close a published call to further proposals (terminal)",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengePublicationStateBody") },
        responses: {
          "200": {
            description: "A receipt for the publication-lifecycle change.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.cancelChallenge]: {
      post: {
        operationId: "cancelChallenge",
        tags: ["Challenge"],
        summary: "Cancel a published call (terminal)",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengePublicationStateBody") },
        responses: {
          "200": {
            description: "A receipt for the publication-lifecycle change.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.publicChallenges]: {
      get: {
        operationId: "listPublicChallenges",
        tags: ["Public"],
        summary:
          "List published challenges from the public projection only; `registered` rows require a session",
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 500 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
        ],
        responses: {
          "200": {
            description: "One page of public challenge projections.",
            content: jsonContent("ChallengePublicPageSuccessEnvelope"),
          },
        },
      },
    },
    [apiRoutes.publicChallengeById]: {
      get: {
        operationId: "getPublicChallenge",
        tags: ["Public"],
        summary:
          "Read one published challenge's public projection; unknown, unpublished, and confidential challenges are indistinguishable",
        parameters: [challengeIdParameter],
        responses: {
          "200": {
            description: "The published challenge's public projection.",
            content: jsonContent("ChallengePublicSuccessEnvelope"),
          },
          "404": {
            description: "No public projection is readable for this id.",
            content: jsonContent("ErrorEnvelope"),
          },
        },
      },
    },
    [apiRoutes.publishChallenge]: {
      post: {
        operationId: "publishChallenge",
        tags: ["Challenge"],
        summary:
          "Publish the fully approved version: lock it, set published_version_id, and write the public projection in one transaction",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengeTransitionBody") },
        responses: {
          "200": {
            description: "A receipt for the approvals to published transition.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.solverProfile]: {
      get: {
        operationId: "getSolverWorkspaceProfile",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The active solver workspace's server-owned profile facts.",
            content: jsonContent("SolverWorkspaceProfileSuccessEnvelope"),
          },
          "403": errorResponse("The active workspace is not a solver workspace."),
          "404": errorResponse("The protected workspace is unavailable."),
        },
      },
      patch: {
        operationId: "patchSolverWorkspaceProfile",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("PatchSolverWorkspaceProfileBody") },
        responses: {
          "200": {
            description: "A receipt for the workspace-scoped profile update.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.solverVerification]: {
      get: {
        operationId: "getSolverWorkspaceVerification",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description:
              "The active workspace's verification state, distinct from contact verification.",
            content: jsonContent("SolverVerificationSuccessEnvelope"),
          },
          "403": errorResponse("The active workspace is not a solver workspace."),
          "404": errorResponse("The protected workspace is unavailable."),
        },
      },
    },
    [apiRoutes.startSolverVerification]: {
      post: {
        operationId: "startSolverWorkspaceVerification",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("StartSolverVerificationBody") },
        responses: {
          "200": {
            description:
              "A receipt for starting the workflow; this never self-approves verification.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.challengeEligibility]: {
      get: {
        operationId: "evaluateChallengeEligibility",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, challengeIdParameter],
        responses: {
          "200": {
            description:
              "An explainable decision against the exact published rule and live call clock.",
            content: jsonContent("EligibilitySuccessEnvelope"),
          },
          "403": errorResponse("The active workspace is not a solver workspace."),
          "404": errorResponse("The challenge or protected workspace is unavailable."),
        },
      },
    },
    [apiRoutes.acceptChallengeEligibilityGate]: {
      post: {
        operationId: "acceptChallengeEligibilityGate",
        tags: ["Solver"],
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          idempotencyHeader,
          challengeIdParameter,
          {
            in: "path",
            name: "gate",
            required: true,
            schema: { type: "string", enum: ["nda", "document_acknowledgement"] },
          },
        ],
        requestBody: { required: true, content: jsonContent("AcceptEligibilityGateBody") },
        responses: {
          "200": {
            description:
              "A receipt for an exact-version gate acknowledgement; this is not upload/review evidence.",
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
