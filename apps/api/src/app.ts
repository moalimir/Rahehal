import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifySchemaValidationError,
} from "fastify";
import {
  apiRoutes,
  apiSchemas,
  browserSessionRoutes,
  type BrowserOidcAuthorizationStartBody,
  type BrowserOidcAuthorizationStartSuccessEnvelope,
  openApiDocument,
  type CreateChallengeBody,
  type ChallengeTransitionBody,
  type MeResource,
  type MutationSuccessEnvelope,
  type OidcAuthorizationStartBody,
  type OidcAuthorizationStartSuccessEnvelope,
  type PatchChallengeBody,
  type SessionExchangeBody,
  type SessionRefreshBody,
  type SessionRevokeBody,
  type SessionSuccessEnvelope,
  type SuccessEnvelope,
  type SwitchWorkspaceContextBody,
  type VersionedApiMeta,
} from "@rahhal/contracts";
import {
  authorizationFlowCookie,
  browserCookieNames,
  clearBrowserAuthorizationFlowCookie,
  clearBrowserSessionCookies,
  decodeBrowserAuthorizationFlow,
  parseCookies,
  sessionCookies,
  type BrowserSessionRuntimeSettings,
} from "./browser-session.js";
import { ApiProblem, errorEnvelope, notFound } from "./errors.js";
import type {
  ApiPorts,
  AuthenticatedSession,
  ChallengeScope,
  ChallengeTransitionCommand,
  MutationOutcome,
  WorkspaceAccess,
  WorkspaceAuthorization,
} from "./ports.js";
import {
  commandFingerprint,
  correlationId,
  bearerToken,
  requireSession,
  requiredHeader,
} from "./primitives.js";

const challengeIdParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["challengeId"],
  properties: {
    challengeId: {
      type: "string",
      pattern: "^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$",
    },
  },
} as const;

type ChallengeIdParams = { challengeId: string };

type BrowserOidcCallbackQuery = {
  readonly code: string;
  readonly state: string;
};

export type ApiRuntimeOptions = {
  readonly browserSession?: BrowserSessionRuntimeSettings;
};

const apiErrorResponses = {
  403: apiSchemas.ErrorEnvelope,
  404: apiSchemas.ErrorEnvelope,
  409: apiSchemas.ErrorEnvelope,
  422: apiSchemas.ErrorEnvelope,
  503: apiSchemas.ErrorEnvelope,
} as const;

type VersionedSuccessEnvelope<T> = {
  readonly ok: true;
  readonly data: T;
  readonly meta: VersionedApiMeta;
};

function versionedSuccess<T>(
  data: T,
  request: FastifyRequest,
  ports: ApiPorts,
  entityVersion: number,
): VersionedSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      server_time: ports.clock.now().toISOString(),
      correlation_id: correlationId(request),
      entity_version: entityVersion,
    },
  };
}

function mutationSuccess<TargetId extends string, NextAction extends string>(
  outcome: MutationOutcome<TargetId, NextAction>,
  request: FastifyRequest,
  ports: ApiPorts,
): MutationSuccessEnvelope<TargetId, NextAction> {
  return versionedSuccess(outcome.receipt, request, ports, outcome.entityVersion);
}

function validationIssues(error: unknown): readonly FastifySchemaValidationError[] | null {
  if (!(error instanceof Error) || !("validation" in error)) return null;
  const validation = error.validation;
  return Array.isArray(validation) ? (validation as readonly FastifySchemaValidationError[]) : null;
}

async function runAuthorizedWorkspace<Result>(
  request: FastifyRequest,
  ports: ApiPorts,
  session: AuthenticatedSession,
  authorization: Omit<WorkspaceAuthorization, "correlationId">,
  operation: (access: WorkspaceAccess) => Result | Promise<Result>,
): Promise<Result> {
  const workspaceId = requiredHeader(request, "X-Workspace-Id");
  return ports.authority.runAuthorizedWorkspace(
    session,
    workspaceId,
    { ...authorization, correlationId: correlationId(request) },
    operation,
  );
}

async function recordWorkspaceAccessSuccess(
  request: FastifyRequest,
  ports: ApiPorts,
  session: AuthenticatedSession,
  access: WorkspaceAccess,
  authorization: {
    readonly action: string;
    readonly entityType?: string;
    readonly entityId?: string;
  },
): Promise<void> {
  await ports.decisionAudit.record({
    outcome: "success",
    actorUserId: session.userId,
    tenantId: access.tenantId,
    workspaceId: access.workspaceId,
    action: authorization.action,
    entityType: authorization.entityType,
    entityId: authorization.entityId,
    correlationId: correlationId(request),
    occurredAt: ports.clock.now().toISOString(),
  });
}

function challengeScope(session: AuthenticatedSession, access: WorkspaceAccess): ChallengeScope {
  return {
    actorUserId: session.userId,
    tenantId: access.tenantId,
    workspaceId: access.workspaceId,
    role: access.role,
  };
}

const canReadChallenge = (access: WorkspaceAccess) => access.workspace.kind === "org";

const canEditChallenge = (access: WorkspaceAccess) =>
  access.workspace.kind === "org" && (access.role === "org:owner" || access.role === "org:member");

function idempotencyCommand(request: FastifyRequest) {
  const idempotencyKey = requiredHeader(request, "Idempotency-Key");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    const code = idempotencyKey.length < 8 ? "minLength" : "maxLength";
    throw new ApiProblem(422, "VALIDATION", "Idempotency-Key must contain 8 to 200 characters", {
      fields: [
        {
          path: "Idempotency-Key",
          code,
          message: "Idempotency-Key must contain 8 to 200 characters",
        },
      ],
    });
  }
  return {
    idempotencyKey,
    correlationId: correlationId(request),
  };
}

async function recordSessionAuthentication(
  request: FastifyRequest,
  ports: ApiPorts,
  decision: {
    readonly outcome: "success" | "denied";
    readonly action?: "session:authenticate" | "session:revoke:replay";
    readonly session?: AuthenticatedSession;
    readonly actorUserId?: AuthenticatedSession["userId"];
    readonly entityId?: string;
    readonly reason?: string;
  },
) {
  await ports.decisionAudit.record({
    outcome: decision.outcome,
    actorUserId: decision.session?.userId ?? decision.actorUserId,
    action: decision.action ?? "session:authenticate",
    entityType: "session",
    entityId: decision.session?.id ?? decision.entityId,
    reason: decision.reason,
    correlationId: correlationId(request),
    occurredAt: ports.clock.now().toISOString(),
  });
}

async function revokeSession(request: FastifyRequest, ports: ApiPorts, body: SessionRevokeBody) {
  let accessToken: string;
  try {
    accessToken = bearerToken(request);
  } catch (error) {
    await recordSessionAuthentication(request, ports, {
      outcome: "denied",
      reason: "bearer_missing_or_malformed",
    });
    throw error;
  }

  const session = await ports.sessions.authenticate(accessToken);
  if (session) {
    await recordSessionAuthentication(request, ports, { outcome: "success", session });
  }

  try {
    const outcome = await ports.sessions.revoke(accessToken, body, idempotencyCommand(request));
    if (!session) {
      await recordSessionAuthentication(request, ports, {
        outcome: "success",
        action: "session:revoke:replay",
        actorUserId: outcome.actorUserId,
        entityId: outcome.receipt.entity_id,
        reason: "credential_bound_idempotent_replay",
      });
    }
    return outcome;
  } catch (error) {
    if (!session) {
      await recordSessionAuthentication(request, ports, {
        outcome: "denied",
        reason: "session_unavailable",
      });
    }
    throw error;
  }
}

// find-my-way treats a single colon as a path parameter marker. Its double-colon
// escape preserves the literal command separators in the published API paths.
const fastifyLiteralPath = (path: string) => path.replaceAll(":", "::");

const fastifyChallengeCommandPath = (path: string) =>
  fastifyLiteralPath(path).replace(
    "{challengeId}",
    `:challengeId(${challengeIdParamsSchema.properties.challengeId.pattern})`,
  );

function registerChallengeTransition(
  app: FastifyInstance,
  ports: ApiPorts,
  route: string,
  command: ChallengeTransitionCommand,
  action: string,
): void {
  app.post<{ Params: ChallengeIdParams; Body: ChallengeTransitionBody }>(
    fastifyChallengeCommandPath(route),
    {
      schema: {
        params: challengeIdParamsSchema,
        body: apiSchemas.ChallengeTransitionBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<MutationSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action,
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: canEditChallenge,
          deferSuccess: true,
        },
        async (access) => {
          const visible = await ports.challenges.getScoped(
            challengeScope(session, access),
            request.params.challengeId,
          );
          if (!visible) {
            await ports.decisionAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: access.tenantId,
              workspaceId: access.workspaceId,
              action,
              entityType: "challenge",
              entityId: request.params.challengeId,
              reason: "record_unreachable",
              correlationId: correlationId(request),
              occurredAt: ports.clock.now().toISOString(),
            });
            throw notFound();
          }
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action,
            entityType: "challenge",
            entityId: request.params.challengeId,
          });
          const outcome = await ports.challenges.transition(
            request.params.challengeId,
            command,
            request.body,
            {
              ...challengeScope(session, access),
              ...idempotencyCommand(request),
            },
          );
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );
}

function requireBrowserOrigin(request: FastifyRequest, settings: BrowserSessionRuntimeSettings) {
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (
    origin !== settings.origin ||
    (typeof fetchSite === "string" && fetchSite !== "same-origin")
  ) {
    throw new ApiProblem(403, "NO_ACCESS", "A same-origin browser request is required");
  }
}

export function buildApi(ports: ApiPorts, options: ApiRuntimeOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } });
  const cookieAuthenticatedRequests = new WeakSet<FastifyRequest>();

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("cache-control", "no-store");
    if (options.browserSession && !request.headers.authorization) {
      const accessToken = parseCookies(request.headers.cookie).get(browserCookieNames.access);
      if (accessToken) {
        request.headers.authorization = `Bearer ${accessToken}`;
        cookieAuthenticatedRequests.add(request);
      }
    }
  });

  app.addHook("preValidation", async (request) => {
    if (
      options.browserSession &&
      cookieAuthenticatedRequests.has(request) &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      requireBrowserOrigin(request, options.browserSession);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const validation = validationIssues(error);
    const problem =
      error instanceof ApiProblem
        ? error
        : validation
          ? new ApiProblem(422, "VALIDATION", "Request validation failed", {
              fields: validation.map((issue) => ({
                path: issue.instancePath || String(issue.params["missingProperty"] ?? "request"),
                code: issue.keyword,
                message: issue.message ?? "invalid",
              })),
            })
          : new ApiProblem(503, "STORAGE", "The service could not complete the request", {
              recovery: "retry_with_same_idempotency_key",
            });
    void reply
      .status(problem.statusCode)
      .send(errorEnvelope(problem, correlationId(request), ports.clock.now().toISOString()));
  });

  app.get(apiRoutes.openApi, async (_request, reply) => {
    void reply.header("cache-control", "no-store");
    return openApiDocument;
  });

  if (options.browserSession) {
    const settings = options.browserSession;

    app.post<{ Body: BrowserOidcAuthorizationStartBody }>(
      fastifyLiteralPath(browserSessionRoutes.oidcAuthorizationStart),
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["expected_version"],
            properties: { expected_version: { const: 0 } },
          },
          response: {
            200: {
              type: "object",
              additionalProperties: false,
              required: ["ok", "data", "meta"],
              properties: {
                ok: { const: true },
                data: {
                  type: "object",
                  additionalProperties: false,
                  required: ["authorization_url", "expires_at"],
                  properties: {
                    authorization_url: { type: "string", format: "uri", maxLength: 4_096 },
                    expires_at: { type: "string", format: "date-time" },
                  },
                },
                meta: apiSchemas.ApiMeta,
              },
            },
            ...apiErrorResponses,
          },
        },
      },
      async (request, reply): Promise<BrowserOidcAuthorizationStartSuccessEnvelope> => {
        requireBrowserOrigin(request, settings);
        const result = await ports.oidcAuthorization.start(
          { expected_version: request.body.expected_version, redirect_uri: settings.redirectUri },
          idempotencyCommand(request),
        );
        void reply.header(
          "set-cookie",
          authorizationFlowCookie(
            {
              state: result.state,
              codeVerifier: result.code_verifier,
              expiresAt: result.expires_at,
            },
            settings,
            ports.clock.now(),
          ),
        );
        return {
          ok: true,
          data: {
            authorization_url: result.authorization_url,
            expires_at: result.expires_at,
          },
          meta: {
            server_time: ports.clock.now().toISOString(),
            correlation_id: correlationId(request),
          },
        };
      },
    );

    app.get<{ Querystring: BrowserOidcCallbackQuery }>(
      browserSessionRoutes.oidcCallback,
      {
        schema: {
          querystring: {
            type: "object",
            additionalProperties: false,
            required: ["code", "state"],
            properties: {
              code: { type: "string", minLength: 1, maxLength: 4_096 },
              state: { type: "string", minLength: 32, maxLength: 1_024 },
            },
          },
        },
      },
      async (request, reply) => {
        const fail = () => {
          void reply
            .code(303)
            .header("set-cookie", clearBrowserAuthorizationFlowCookie(settings))
            .header("location", "/auth/organization/login?authError=callback_failed")
            .send();
        };
        const flowValue = parseCookies(request.headers.cookie).get(browserCookieNames.flow);
        const flow = flowValue ? decodeBrowserAuthorizationFlow(flowValue) : null;
        if (
          !flow ||
          flow.state !== request.query.state ||
          Date.parse(flow.expiresAt) <= ports.clock.now().getTime()
        ) {
          return fail();
        }

        try {
          const outcome = await ports.sessions.exchange(
            {
              expected_version: 0,
              authorization_code: request.query.code,
              code_verifier: flow.codeVerifier,
              redirect_uri: settings.redirectUri,
              state: request.query.state,
            },
            {
              idempotencyKey: `browser-exchange-${commandFingerprint({
                code: request.query.code,
                state: request.query.state,
              })}`,
              correlationId: correlationId(request),
            },
          );
          void reply
            .code(303)
            .header("set-cookie", [
              ...sessionCookies(outcome.tokens, settings, ports.clock.now()),
              clearBrowserAuthorizationFlowCookie(settings),
            ])
            .header("location", "/app/org/challenges/new")
            .send();
        } catch {
          return fail();
        }
      },
    );

    app.post(fastifyLiteralPath(browserSessionRoutes.sessionRevoke), async (request, reply) => {
      requireBrowserOrigin(request, settings);
      try {
        const accessToken = bearerToken(request);
        const session = await ports.sessions.authenticate(accessToken);
        if (!session) throw new ApiProblem(403, "NO_ACCESS", "Authentication required");
        const outcome = await revokeSession(request, ports, {
          expected_version: session.version,
          session_id: session.id,
        });
        return mutationSuccess(outcome, request, ports);
      } finally {
        void reply.header("set-cookie", clearBrowserSessionCookies(settings));
      }
    });
  }

  app.post<{ Body: OidcAuthorizationStartBody }>(
    fastifyLiteralPath(apiRoutes.oidcAuthorizationStart),
    {
      schema: {
        body: apiSchemas.OidcAuthorizationStartBody,
        response: { 200: apiSchemas.OidcAuthorizationStartSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<OidcAuthorizationStartSuccessEnvelope> => ({
      ok: true,
      data: await ports.oidcAuthorization.start(request.body, idempotencyCommand(request)),
      meta: {
        server_time: ports.clock.now().toISOString(),
        correlation_id: correlationId(request),
      },
    }),
  );

  app.post<{ Body: SessionExchangeBody }>(
    fastifyLiteralPath(apiRoutes.sessionExchange),
    {
      schema: {
        body: apiSchemas.SessionExchangeBody,
        response: { 200: apiSchemas.SessionSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SessionSuccessEnvelope> => {
      const outcome = await ports.sessions.exchange(request.body, idempotencyCommand(request));
      return versionedSuccess(
        { tokens: outcome.tokens, receipt: outcome.receipt },
        request,
        ports,
        outcome.entityVersion,
      );
    },
  );

  app.post<{ Body: SessionRefreshBody }>(
    fastifyLiteralPath(apiRoutes.sessionRefresh),
    {
      schema: {
        body: apiSchemas.SessionRefreshBody,
        response: { 200: apiSchemas.SessionSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SessionSuccessEnvelope> => {
      const outcome = await ports.sessions.refresh(request.body, idempotencyCommand(request));
      return versionedSuccess(
        { tokens: outcome.tokens, receipt: outcome.receipt },
        request,
        ports,
        outcome.entityVersion,
      );
    },
  );

  app.post<{ Body: SessionRevokeBody }>(
    fastifyLiteralPath(apiRoutes.sessionRevoke),
    {
      schema: {
        body: apiSchemas.SessionRevokeBody,
        response: { 200: apiSchemas.SessionRevocationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const outcome = await revokeSession(request, ports, request.body);
      return mutationSuccess(outcome, request, ports);
    },
  );

  app.get(
    apiRoutes.me,
    { schema: { response: { 200: apiSchemas.MeSuccessEnvelope, ...apiErrorResponses } } },
    async (request): Promise<SuccessEnvelope<MeResource>> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const me = await ports.workspaces.getMe(session);
      if (!me) throw notFound();
      return versionedSuccess(me, request, ports, session.version);
    },
  );

  app.post<{ Body: SwitchWorkspaceContextBody }>(
    fastifyLiteralPath(apiRoutes.switchWorkspaceContext),
    {
      schema: {
        body: apiSchemas.SwitchWorkspaceContextBody,
        response: {
          200: apiSchemas.WorkspaceContextMutationSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request): Promise<MutationSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const outcome = await ports.workspaces.switchContext(
        session,
        request.body.workspace_id,
        request.body.expected_version,
        idempotencyCommand(request),
      );
      return mutationSuccess(outcome, request, ports);
    },
  );

  app.post<{ Body: CreateChallengeBody }>(
    apiRoutes.challenges,
    {
      schema: {
        body: apiSchemas.CreateChallengeBody,
        response: { 201: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request, reply): Promise<MutationSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "challenge:create",
          entityType: "challenge",
          allows: canEditChallenge,
        },
        async (access) => {
          const outcome = await ports.challenges.create(request.body, {
            ...challengeScope(session, access),
            ...idempotencyCommand(request),
          });
          void reply.status(201);
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  app.get<{ Params: ChallengeIdParams }>(
    "/api/v1/challenges/:challengeId",
    {
      schema: {
        params: challengeIdParamsSchema,
        response: { 200: apiSchemas.ChallengeSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "challenge:read",
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: canReadChallenge,
          deferSuccess: true,
        },
        async (access) => {
          const resource = await ports.challenges.getScoped(
            challengeScope(session, access),
            request.params.challengeId,
          );
          if (!resource) {
            await ports.decisionAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: access.tenantId,
              workspaceId: access.workspaceId,
              action: "challenge:read",
              entityType: "challenge",
              entityId: request.params.challengeId,
              reason: "record_unreachable",
              correlationId: correlationId(request),
              occurredAt: ports.clock.now().toISOString(),
            });
            throw notFound();
          }
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action: "challenge:read",
            entityType: "challenge",
            entityId: request.params.challengeId,
          });
          return versionedSuccess(resource, request, ports, resource.version);
        },
      );
    },
  );

  app.patch<{ Params: ChallengeIdParams; Body: PatchChallengeBody }>(
    "/api/v1/challenges/:challengeId",
    {
      schema: {
        params: challengeIdParamsSchema,
        body: apiSchemas.PatchChallengeBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<MutationSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "challenge:edit",
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: canEditChallenge,
          deferSuccess: true,
        },
        async (access) => {
          const visible = await ports.challenges.getScoped(
            challengeScope(session, access),
            request.params.challengeId,
          );
          if (!visible) {
            await ports.decisionAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: access.tenantId,
              workspaceId: access.workspaceId,
              action: "challenge:edit",
              entityType: "challenge",
              entityId: request.params.challengeId,
              reason: "record_unreachable",
              correlationId: correlationId(request),
              occurredAt: ports.clock.now().toISOString(),
            });
            throw notFound();
          }
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action: "challenge:edit",
            entityType: "challenge",
            entityId: request.params.challengeId,
          });
          const outcome = await ports.challenges.patch(request.params.challengeId, request.body, {
            ...challengeScope(session, access),
            ...idempotencyCommand(request),
          });
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  registerChallengeTransition(
    app,
    ports,
    apiRoutes.requestChallengeTriage,
    "request-triage",
    "challenge:request-triage",
  );
  registerChallengeTransition(
    app,
    ports,
    apiRoutes.advanceChallengeFormulation,
    "advance-formulation",
    "challenge:advance-formulation",
  );
  registerChallengeTransition(
    app,
    ports,
    apiRoutes.requestChallengeApprovals,
    "request-approvals",
    "challenge:request-approvals",
  );

  return app;
}
