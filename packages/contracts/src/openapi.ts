import { challengeManagedStages } from "@rahhal/domain";

import { apiRoutes } from "./routes.js";
import { privateFileRoutes } from "./private-files.js";
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
  "429": errorResponse("The command is temporarily rate limited."),
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

const contactVerificationAttemptIdParameter = {
  in: "path",
  name: "attemptId",
  required: true,
  schema: { type: "string", pattern: "^otp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const teamInvitationIdParameter = {
  in: "path",
  name: "teamInvitationId",
  required: true,
  schema: { type: "string", pattern: "^tiv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const teamMembershipRequestIdParameter = {
  in: "path",
  name: "teamMembershipRequestId",
  required: true,
  schema: { type: "string", pattern: "^tmr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const teamWorkspaceIdParameter = {
  in: "path",
  name: "workspaceId",
  required: true,
  schema: { type: "string", pattern: "^wsp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const membershipIdParameter = {
  in: "path",
  name: "membershipId",
  required: true,
  schema: { type: "string", pattern: "^mem_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const proposalIdParameter = {
  in: "path",
  name: "proposalId",
  required: true,
  schema: { type: "string", pattern: "^prp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const directOfferIdParameter = {
  in: "path",
  name: "directOfferId",
  required: true,
  schema: { type: "string", pattern: "^dof_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
} as const;

const teamCommandOperation = (
  operationId: string,
  summary: string,
  bodySchema: ApiSchemaName,
  pathParameters: readonly Readonly<Record<string, unknown>>[] = [],
) => ({
  operationId,
  tags: ["Team"],
  summary,
  security: [{ bearerAuth: [] }],
  parameters: [workspaceHeader, idempotencyHeader, ...pathParameters],
  requestBody: { required: true, content: jsonContent(bodySchema) },
  responses: {
    "200": {
      description: "The atomic mutation receipt.",
      content: jsonContent("MutationSuccessEnvelope"),
    },
    ...protectedCommandErrors,
  },
});

const proposalCommandOperation = (
  operationId: string,
  summary: string,
  bodySchema: ApiSchemaName,
) => ({
  operationId,
  tags: ["Proposal"],
  summary,
  security: [{ bearerAuth: [] }],
  parameters: [workspaceHeader, idempotencyHeader, proposalIdParameter],
  requestBody: { required: true, content: jsonContent(bodySchema) },
  responses: {
    "200": {
      description: "The atomic proposal mutation receipt.",
      content: jsonContent("MutationSuccessEnvelope"),
    },
    ...protectedCommandErrors,
  },
});

const directOfferCommandOperation = (
  operationId: string,
  summary: string,
  bodySchema: ApiSchemaName,
) => ({
  operationId,
  tags: ["Opportunity"],
  summary,
  security: [{ bearerAuth: [] }],
  parameters: [workspaceHeader, idempotencyHeader, directOfferIdParameter],
  requestBody: { required: true, content: jsonContent(bodySchema) },
  responses: {
    "200": {
      description: "The atomic direct-offer mutation receipt.",
      content: jsonContent("MutationSuccessEnvelope"),
    },
    ...protectedCommandErrors,
  },
});

const teamReadOperation = (
  operationId: string,
  summary: string,
  responseSchema: ApiSchemaName,
) => ({
  operationId,
  tags: ["Team"],
  summary,
  security: [{ bearerAuth: [] }],
  parameters: [workspaceHeader],
  responses: {
    "200": { description: "The scoped team resource.", content: jsonContent(responseSchema) },
    "403": protectedCommandErrors["403"],
    "404": protectedCommandErrors["404"],
    "503": protectedCommandErrors["503"],
  },
});

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
    { name: "Team" },
    { name: "Proposal" },
    { name: "Opportunity" },
  ],
  paths: {
    [privateFileRoutes.list]: {
      get: {
        operationId: "listPrivateFiles",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          {
            in: "query",
            name: "entity_type",
            required: true,
            schema: { type: "string", enum: ["challenge", "proposal"] },
          },
          { in: "query", name: "entity_id", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Only files reachable in the active workspace; no storage keys",
            content: jsonContent("PrivateFileListSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.requestUpload]: {
      post: {
        operationId: "requestPrivatePdfUpload",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("RequestFileUploadBody") },
        responses: {
          "200": {
            description: "Actor/workspace-bound upload URL, expires after five minutes",
            content: jsonContent("PrivateFileUploadSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.file]: {
      get: {
        operationId: "readPrivateFileStatus",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          { in: "path", name: "fileId", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Authorized file metadata and scan status",
            content: jsonContent("PrivateFileSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.upload]: {
      put: {
        operationId: "uploadPrivatePdfBytes",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          idempotencyHeader,
          { in: "path", name: "fileId", required: true, schema: { type: "string" } },
          { in: "query", name: "token", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
        responses: {
          "200": {
            description: "Quarantined immutable bytes; not yet attachable or downloadable",
            content: jsonContent("PrivateFileMutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.complete]: {
      post: {
        operationId: "completePrivatePdfUpload",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          idempotencyHeader,
          { in: "path", name: "fileId", required: true, schema: { type: "string" } },
        ],
        requestBody: { required: true, content: jsonContent("CompleteFileBody") },
        responses: {
          "200": {
            description: "Durable scan queue request; unavailable until clean",
            content: jsonContent("PrivateFileMutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.downloadUrl]: {
      get: {
        operationId: "requestPrivatePdfDownload",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          { in: "path", name: "fileId", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description:
              "Actor/workspace-bound read URL, expires after sixty seconds; access rechecked on use",
            content: jsonContent("PrivateFileDownloadSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [privateFileRoutes.content]: {
      get: {
        operationId: "downloadPrivatePdf",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          { in: "path", name: "fileId", required: true, schema: { type: "string" } },
          { in: "query", name: "token", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Audited authorized download of clean, digest-verified PDF",
            content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
          },
          ...protectedCommandErrors,
        },
      },
    },
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
    [apiRoutes.contactVerificationStart]: {
      post: {
        operationId: "startContactVerification",
        tags: ["Session"],
        summary: "Start provider-owned email or mobile verification without enumerating identity",
        parameters: [idempotencyHeader],
        requestBody: { required: true, content: jsonContent("StartContactVerificationBody") },
        responses: {
          "200": {
            description: "A typed provider verification attempt.",
            content: jsonContent("ContactVerificationAttemptSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.resendContactVerification]: {
      post: {
        operationId: "resendContactVerification",
        tags: ["Session"],
        summary: "Resend a pending provider verification challenge",
        parameters: [idempotencyHeader, contactVerificationAttemptIdParameter],
        requestBody: { required: true, content: jsonContent("ResendContactVerificationBody") },
        responses: {
          "200": {
            description: "The advanced provider verification attempt.",
            content: jsonContent("ContactVerificationAttemptSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.verifyContact]: {
      post: {
        operationId: "verifyContact",
        tags: ["Session"],
        summary: "Verify a provider challenge and receive a one-time provider assertion",
        parameters: [idempotencyHeader, contactVerificationAttemptIdParameter],
        requestBody: { required: true, content: jsonContent("VerifyContactBody") },
        responses: {
          "200": {
            description: "A short-lived assertion for session exchange or first activation.",
            content: jsonContent("VerifiedContactSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.contactSessionExchange]: {
      post: {
        operationId: "exchangeContactSession",
        tags: ["Session"],
        summary: "Consume a verified contact assertion for an existing solver session",
        parameters: [idempotencyHeader],
        requestBody: { required: true, content: jsonContent("ContactSessionExchangeBody") },
        responses: {
          "200": {
            description: "The application session and its mutation receipt.",
            content: jsonContent("SessionSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
    },
    [apiRoutes.solverActivation]: {
      post: {
        operationId: "activateSolver",
        tags: ["Identity"],
        summary: "Activate one human identity and its permanent individual solver workspace",
        parameters: [idempotencyHeader],
        requestBody: { required: true, content: jsonContent("ActivateSolverBody") },
        responses: {
          "200": {
            description: "The durable activation, active individual session, and atomic receipt.",
            content: jsonContent("SolverActivationSuccessEnvelope"),
          },
          ...commonCommandErrors,
        },
      },
      get: {
        operationId: "getSolverActivation",
        tags: ["Identity"],
        summary: "Read the authenticated human's durable solver activation intent",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "The durable solver activation.",
            content: jsonContent("SolverActivationReadSuccessEnvelope"),
          },
          "403": commonCommandErrors["403"],
          "404": errorResponse("The solver activation is unavailable."),
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
        summary: "Publish an exact version as owner, or as delegated publisher after approvals",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("ChallengeTransitionBody") },
        responses: {
          "200": {
            description: "Atomic publication receipt.",
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
    [apiRoutes.solverTeams]: {
      post: teamCommandOperation(
        "createSolverTeam",
        "Create a separate team workspace with an owner membership and not-started verification",
        "CreateTeamBody",
      ),
    },
    [apiRoutes.solverTeam]: {
      get: teamReadOperation(
        "getSolverTeam",
        "Read the active team and its current members",
        "TeamSuccessEnvelope",
      ),
    },
    [apiRoutes.solverTeamPolicy]: {
      patch: teamCommandOperation(
        "updateSolverTeamPolicy",
        "Update the active team's server-enforced role policy",
        "UpdateTeamPolicyBody",
      ),
    },
    [apiRoutes.solverTeamInvitations]: {
      get: teamReadOperation(
        "listSolverTeamInvitations",
        "List invitations in the active team scope",
        "TeamInvitationListSuccessEnvelope",
      ),
      post: teamCommandOperation(
        "createSolverTeamInvitation",
        "Invite one contact to a non-owner team role",
        "CreateTeamInvitationBody",
      ),
    },
    [apiRoutes.revokeSolverTeamInvitation]: {
      post: teamCommandOperation(
        "revokeSolverTeamInvitation",
        "Revoke a current invitation in the active team",
        "RevokeTeamInvitationBody",
        [teamInvitationIdParameter],
      ),
    },
    [apiRoutes.solverTeamIncomingInvitations]: {
      get: teamReadOperation(
        "listIncomingSolverTeamInvitations",
        "List invitations bound to the authenticated human",
        "TeamInvitationListSuccessEnvelope",
      ),
    },
    [apiRoutes.respondSolverTeamInvitation]: {
      post: teamCommandOperation(
        "respondSolverTeamInvitation",
        "Accept or decline an invitation bound to the authenticated human",
        "RespondTeamInvitationBody",
        [teamInvitationIdParameter],
      ),
    },
    [apiRoutes.createSolverTeamMembershipRequest]: {
      post: teamCommandOperation(
        "createSolverTeamMembershipRequest",
        "Request membership in a request-capable active team",
        "CreateTeamMembershipRequestBody",
        [teamWorkspaceIdParameter],
      ),
    },
    [apiRoutes.solverTeamMembershipRequests]: {
      get: teamReadOperation(
        "listSolverTeamMembershipRequests",
        "List membership requests for the active team",
        "TeamMembershipRequestListSuccessEnvelope",
      ),
    },
    [apiRoutes.decideSolverTeamMembershipRequest]: {
      post: teamCommandOperation(
        "decideSolverTeamMembershipRequest",
        "Accept or reject an active-team membership request",
        "DecideTeamMembershipRequestBody",
        [teamMembershipRequestIdParameter],
      ),
    },
    [apiRoutes.solverOwnTeamMembershipRequests]: {
      get: teamReadOperation(
        "listOwnSolverTeamMembershipRequests",
        "List membership requests created by the authenticated human",
        "TeamMembershipRequestListSuccessEnvelope",
      ),
    },
    [apiRoutes.withdrawSolverTeamMembershipRequest]: {
      post: teamCommandOperation(
        "withdrawSolverTeamMembershipRequest",
        "Withdraw a membership request owned by the authenticated human",
        "WithdrawTeamMembershipRequestBody",
        [teamMembershipRequestIdParameter],
      ),
    },
    [apiRoutes.changeSolverTeamMemberRole]: {
      post: teamCommandOperation(
        "changeSolverTeamMemberRole",
        "Change a non-owner member role",
        "ChangeTeamMemberRoleBody",
        [membershipIdParameter],
      ),
    },
    [apiRoutes.suspendSolverTeamMember]: {
      post: teamCommandOperation(
        "suspendSolverTeamMember",
        "Suspend a removable active member immediately",
        "ChangeTeamMemberStateBody",
        [membershipIdParameter],
      ),
    },
    [apiRoutes.restoreSolverTeamMember]: {
      post: teamCommandOperation(
        "restoreSolverTeamMember",
        "Restore a suspended member",
        "ChangeTeamMemberStateBody",
        [membershipIdParameter],
      ),
    },
    [apiRoutes.removeSolverTeamMember]: {
      post: teamCommandOperation(
        "removeSolverTeamMember",
        "Remove a member while preserving team-owned evidence",
        "ChangeTeamMemberStateBody",
        [membershipIdParameter],
      ),
    },
    [apiRoutes.transferSolverTeamOwnership]: {
      post: teamCommandOperation(
        "transferSolverTeamOwnership",
        "Atomically transfer ownership to an active successor",
        "TransferTeamOwnershipBody",
      ),
    },
    [apiRoutes.leaveSolverTeam]: {
      post: teamCommandOperation(
        "leaveSolverTeam",
        "Leave the active team unless ownership must first be transferred",
        "LeaveTeamBody",
      ),
    },
    [apiRoutes.archiveSolverTeam]: {
      post: teamCommandOperation(
        "archiveSolverTeam",
        "Archive the active team and terminate its authority",
        "ArchiveTeamBody",
      ),
    },
    [apiRoutes.proposals]: {
      get: {
        operationId: "listProposals",
        tags: ["Proposal"],
        summary: "List the active solver workspace's own proposals",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The workspace-scoped proposal list.",
            content: jsonContent("ProposalListSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
      post: {
        operationId: "createProposalDraft",
        tags: ["Proposal"],
        summary: "Create an unlocked draft for a reachable call in the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("CreateProposalBody") },
        responses: {
          "201": {
            description: "The atomic draft-creation receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.proposalById]: {
      get: {
        operationId: "getProposalDraft",
        tags: ["Proposal"],
        summary: "Read an editable draft in the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, proposalIdParameter],
        responses: {
          "200": {
            description: "The scoped proposal draft and immutable draft-version metadata.",
            content: jsonContent("ProposalSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
      patch: {
        operationId: "patchProposalDraft",
        tags: ["Proposal"],
        summary: "Append a new unlocked version and advance the active draft pointer",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, proposalIdParameter],
        requestBody: { required: true, content: jsonContent("PatchProposalBody") },
        responses: {
          "200": {
            description: "The atomic draft-save receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.submitProposal]: {
      post: {
        operationId: "submitProposal",
        tags: ["Proposal"],
        summary: "Atomically re-evaluate eligibility and lock the submitted proposal version",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, proposalIdParameter],
        requestBody: { required: true, content: jsonContent("SubmitProposalBody") },
        responses: {
          "200": {
            description: "The atomic submission receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.submitProposalClarification]: {
      post: proposalCommandOperation(
        "submitProposalClarification",
        "Submit one response to the organization's open clarification request",
        "SubmitProposalClarificationBody",
      ),
    },
    [apiRoutes.startProposalRevision]: {
      post: proposalCommandOperation(
        "startProposalRevision",
        "Create an unlocked revision draft from the exact requested locked version",
        "StartProposalRevisionBody",
      ),
    },
    [apiRoutes.resubmitProposal]: {
      post: proposalCommandOperation(
        "resubmitProposal",
        "Lock the completed revision and replace the organization grant with its exact version",
        "ResubmitProposalBody",
      ),
    },
    [apiRoutes.notifications]: {
      get: {
        operationId: "listNotifications",
        tags: ["Notification"],
        summary: "List the active workspace notifications for the authenticated human",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
          {
            name: "unread_only",
            in: "query",
            required: false,
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": {
            description: "A bounded page of notifications with the unread count.",
            content: jsonContent("NotificationListSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.notificationSummary]: {
      get: {
        operationId: "readNotificationSummary",
        tags: ["Notification"],
        summary: "Read the unread notification count for the active workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The authoritative unread count.",
            content: jsonContent("NotificationSummarySuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.markNotificationRead]: {
      post: {
        operationId: "markNotificationRead",
        tags: ["Notification"],
        summary: "Mark one owned notification read",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeader,
          idempotencyHeader,
          {
            name: "notificationId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^ntf_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
          },
        ],
        requestBody: { required: true, content: jsonContent("MarkNotificationReadBody") },
        responses: {
          "200": {
            description: "The atomic mutation receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.markAllNotificationsRead]: {
      post: {
        operationId: "markAllNotificationsRead",
        tags: ["Notification"],
        summary: "Mark every unread notification in the active workspace read",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("MarkAllNotificationsReadBody") },
        responses: {
          "200": {
            description: "The atomic mutation receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.organizationProposalInbox]: {
      get: {
        operationId: "listOrganizationProposalInbox",
        tags: ["Proposal"],
        summary: "List active-grant submissions for challenges owned by the active organization",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The grant-scoped organization proposal inbox.",
            content: jsonContent("OrganizationProposalInboxSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.organizationProposalById]: {
      get: {
        operationId: "getOrganizationProposal",
        tags: ["Proposal"],
        summary: "Read only the exact locked version named by an active proposal grant",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, proposalIdParameter],
        responses: {
          "200": {
            description: "The grant-scoped confidential proposal projection.",
            content: jsonContent("OrganizationProposalSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.startProposalEligibilityReview]: {
      post: proposalCommandOperation(
        "startProposalEligibilityReview",
        "Move a newly submitted proposal into organization eligibility review",
        "StartProposalEligibilityReviewBody",
      ),
    },
    [apiRoutes.decideProposalEligibility]: {
      post: proposalCommandOperation(
        "decideProposalEligibility",
        "Record the organization's reasoned eligibility decision",
        "DecideProposalEligibilityBody",
      ),
    },
    [apiRoutes.requestProposalClarification]: {
      post: proposalCommandOperation(
        "requestProposalClarification",
        "Open a clarification request against the exact granted proposal version",
        "RequestProposalClarificationBody",
      ),
    },
    [apiRoutes.resolveProposalClarification]: {
      post: proposalCommandOperation(
        "resolveProposalClarification",
        "Resolve the submitted clarification and begin proposal review",
        "ResolveProposalClarificationBody",
      ),
    },
    [apiRoutes.requestProposalRevision]: {
      post: proposalCommandOperation(
        "requestProposalRevision",
        "Request a scoped revision of the exact locked proposal version",
        "RequestProposalRevisionBody",
      ),
    },
    [apiRoutes.solverSavedOpportunities]: {
      get: {
        operationId: "listSavedOpportunities",
        tags: ["Opportunity"],
        summary: "List opportunity bookmarks owned by the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The active workspace's saved opportunity identities.",
            content: jsonContent("SavedOpportunityListSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.saveOpportunity]: {
      post: {
        operationId: "saveOpportunity",
        tags: ["Opportunity"],
        summary: "Save the exact currently published opportunity in the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("SaveOpportunityBody") },
        responses: {
          "201": {
            description: "The atomic save receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.unsaveOpportunity]: {
      post: {
        operationId: "unsaveOpportunity",
        tags: ["Opportunity"],
        summary: "Remove one saved opportunity from the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader, challengeIdParameter],
        requestBody: { required: true, content: jsonContent("UnsaveOpportunityBody") },
        responses: {
          "200": {
            description: "The atomic unsave receipt.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.solverDirectOffers]: {
      get: {
        operationId: "listReceivedDirectOffers",
        tags: ["Opportunity"],
        summary: "List active-grant direct offers received by the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The recipient-scoped direct-offer list.",
            content: jsonContent("DirectOfferListSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.solverDirectOfferById]: {
      get: {
        operationId: "getReceivedDirectOffer",
        tags: ["Opportunity"],
        summary: "Read one active-grant direct offer received by the active solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, directOfferIdParameter],
        responses: {
          "200": {
            description: "The recipient-scoped direct offer and response draft.",
            content: jsonContent("DirectOfferSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.viewDirectOffer]: {
      post: directOfferCommandOperation(
        "viewDirectOffer",
        "Record the recipient's first view without accepting the invitation",
        "ViewDirectOfferBody",
      ),
    },
    [apiRoutes.startOfferResponse]: {
      post: directOfferCommandOperation(
        "startOfferResponse",
        "Create one editable response draft before the server deadline",
        "StartOfferResponseBody",
      ),
    },
    [apiRoutes.offerResponse]: {
      patch: directOfferCommandOperation(
        "patchOfferResponse",
        "Update the active workspace's unlocked response draft",
        "PatchOfferResponseBody",
      ),
    },
    [apiRoutes.submitOfferResponse]: {
      post: directOfferCommandOperation(
        "submitOfferResponse",
        "Validate and lock the response before the server deadline",
        "SubmitOfferResponseBody",
      ),
    },
    [apiRoutes.declineDirectOffer]: {
      post: directOfferCommandOperation(
        "declineDirectOffer",
        "Close the received invitation with a reason and revoke its grants",
        "DeclineDirectOfferBody",
      ),
    },
    [apiRoutes.organizationDirectOffers]: {
      get: {
        operationId: "listSentDirectOffers",
        tags: ["Opportunity"],
        summary: "List direct offers sent by the active organization",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader],
        responses: {
          "200": {
            description: "The sending organization's direct-offer list.",
            content: jsonContent("DirectOfferListSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "503": protectedCommandErrors["503"],
        },
      },
      post: {
        operationId: "createDirectOffer",
        tags: ["Opportunity"],
        summary: "Send an exact-challenge-version invitation to one solver workspace",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, idempotencyHeader],
        requestBody: { required: true, content: jsonContent("CreateDirectOfferBody") },
        responses: {
          "201": {
            description: "The atomic send receipt and bilateral access grants.",
            content: jsonContent("MutationSuccessEnvelope"),
          },
          ...protectedCommandErrors,
        },
      },
    },
    [apiRoutes.organizationDirectOfferById]: {
      get: {
        operationId: "getSentDirectOffer",
        tags: ["Opportunity"],
        summary: "Read one direct offer owned by the active organization",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeader, directOfferIdParameter],
        responses: {
          "200": {
            description: "The sender-owned direct offer and submitted response.",
            content: jsonContent("DirectOfferSuccessEnvelope"),
          },
          "403": protectedCommandErrors["403"],
          "404": protectedCommandErrors["404"],
          "503": protectedCommandErrors["503"],
        },
      },
    },
    [apiRoutes.cancelDirectOffer]: {
      post: directOfferCommandOperation(
        "cancelDirectOffer",
        "Cancel an offer owned by the active organization and revoke its grants",
        "CancelDirectOfferBody",
      ),
    },
    [apiRoutes.startDirectOfferNegotiation]: {
      post: directOfferCommandOperation(
        "startDirectOfferNegotiation",
        "Acknowledge a submitted response and open the future controlled negotiation",
        "StartDirectOfferNegotiationBody",
      ),
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
