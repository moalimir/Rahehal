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
  type ChallengeNextAction,
  type ChallengeListQuery,
  type ChallengeTransitionBody,
  type MeResource,
  type MutationSuccessEnvelope,
  type OidcAuthorizationStartBody,
  type OidcAuthorizationStartSuccessEnvelope,
  type ChallengePublicationStateBody,
  type ExtendChallengeDeadlineBody,
  type PatchChallengeBody,
  type PublicAudience,
  type PublicChallengeQuery,
  type RecordChallengeApprovalBody,
  type SessionExchangeBody,
  type SessionRefreshBody,
  type SessionRevokeBody,
  type BrowserSolverActivationSuccessEnvelope,
  type SessionSuccessEnvelope,
  type SuccessEnvelope,
  type SwitchWorkspaceContextBody,
  type VersionedApiMeta,
  type AcceptEligibilityGateBody,
  type PatchSolverWorkspaceProfileBody,
  type StartSolverVerificationBody,
  type ArchiveTeamBody,
  type ChangeTeamMemberRoleBody,
  type ChangeTeamMemberStateBody,
  type CreateTeamBody,
  type CreateTeamInvitationBody,
  type CreateTeamMembershipRequestBody,
  type CreateProposalBody,
  type DecideTeamMembershipRequestBody,
  type LeaveTeamBody,
  type MarkAllNotificationsReadBody,
  type MarkNotificationReadBody,
  type NotificationListSuccessEnvelope,
  type NotificationSummarySuccessEnvelope,
  type PatchProposalBody,
  type SubmitProposalBody,
  type StartProposalEligibilityReviewBody,
  type DecideProposalEligibilityBody,
  type RequestProposalClarificationBody,
  type SubmitProposalClarificationBody,
  type ResolveProposalClarificationBody,
  type RequestProposalRevisionBody,
  type StartProposalRevisionBody,
  type ResubmitProposalBody,
  type ProposalListSuccessEnvelope,
  type ProposalSuccessEnvelope,
  type OrganizationProposalInboxSuccessEnvelope,
  type OrganizationProposalSuccessEnvelope,
  type RespondTeamInvitationBody,
  type RevokeTeamInvitationBody,
  type TransferTeamOwnershipBody,
  type UpdateTeamPolicyBody,
  type WithdrawTeamMembershipRequestBody,
  type CancelDirectOfferBody,
  type CreateDirectOfferBody,
  type DeclineDirectOfferBody,
  type DirectOfferListSuccessEnvelope,
  type DirectOfferSuccessEnvelope,
  type PatchOfferResponseBody,
  type SaveOpportunityBody,
  type SavedOpportunityListSuccessEnvelope,
  type StartDirectOfferNegotiationBody,
  type StartOfferResponseBody,
  type SubmitOfferResponseBody,
  type UnsaveOpportunityBody,
  type ViewDirectOfferBody,
  type ActivateSolverBody,
  type ContactSessionExchangeBody,
  type ContactVerificationAttemptSuccessEnvelope,
  type ResendContactVerificationBody,
  type SolverActivationReadSuccessEnvelope,
  type SolverActivationSuccessEnvelope,
  type StartContactVerificationBody,
  type VerifiedContactSuccessEnvelope,
  type VerifyContactBody,
} from "@rahhal/contracts";
import {
  decideTeamPermission,
  eligibilityGateKinds,
  gateApproverRoles,
  isGateApproverRole,
  isPlatformRole,
  organizationCapabilities,
  type ChallengeId,
  type CorrelationId,
  type DirectOfferId,
  type WorkspaceRole,
  type EligibilityGateKind,
  type TeamAction,
  isTeamRole,
} from "@rahhal/domain";
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
import { ApiProblem, errorEnvelope, forbidden, notFound } from "./errors.js";
import type {
  ApiPorts,
  AuthenticatedSession,
  ChallengeScope,
  ChallengeTransitionCommand,
  MutationOutcome,
  OpportunityScope,
  ProposalScope,
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
type EligibilityGateParams = { challengeId: string; gate: EligibilityGateKind };
type TeamInvitationParams = { teamInvitationId: string };
type TeamMembershipRequestParams = { teamMembershipRequestId: string };
type TeamWorkspaceParams = { workspaceId: string };
type TeamMemberParams = { membershipId: string };
type ProposalParams = { proposalId: string };
type DirectOfferParams = { directOfferId: string };
type ContactVerificationParams = { attemptId: string };

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
  429: apiSchemas.ErrorEnvelope,
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

/**
 * The unversioned envelope. Public projections carry no aggregate version --
 * exposing one would leak how often a private record has been edited.
 */
function success<T>(data: T, request: FastifyRequest, ports: ApiPorts): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      server_time: ports.clock.now().toISOString(),
      correlation_id: correlationId(request),
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

/**
 * Notifications belong to the authenticated human inside whichever workspace is
 * active, so the guard resolves access without narrowing by workspace kind. It
 * still runs the full authority check, which is what makes a revoked session,
 * removed membership, or switched context deny the list and its deep links
 * immediately rather than serving a stale projection.
 */
async function runAuthorizedWorkspaceRead<Result>(
  request: FastifyRequest,
  ports: ApiPorts,
  session: AuthenticatedSession,
  action: string,
  operation: (access: WorkspaceAccess) => Result | Promise<Result>,
): Promise<Result> {
  return runAuthorizedWorkspace(
    request,
    ports,
    session,
    { action, entityType: "notification", allows: () => true },
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

function proposalScope(session: AuthenticatedSession, access: WorkspaceAccess): ProposalScope {
  return {
    ...challengeScope(session, access),
    membershipId: access.membership.id,
  };
}

function opportunityScope(
  session: AuthenticatedSession,
  access: WorkspaceAccess,
): OpportunityScope {
  return proposalScope(session, access);
}

const canReadChallenge = (access: WorkspaceAccess) => access.workspace.kind === "org";
const canReadSolverWorkspace = (access: WorkspaceAccess) =>
  access.workspace.kind === "individual" || access.workspace.kind === "team";
const canManageSolverWorkspace = (access: WorkspaceAccess) =>
  access.role === "individual" || access.role === "team:owner" || access.role === "team:admin";
const canEditSolverProfile = (access: WorkspaceAccess) =>
  canManageSolverWorkspace(access) || access.role === "team:proposal-manager";

/**
 * Every platform role that owns at least one publication gate, derived from
 * `gateApproverRoles` rather than restated, so a gate added later cannot leave
 * its approver without the read that makes the gate meaningful.
 */
const platformGateApproverRoles = [...new Set(Object.values(gateApproverRoles).flat())].filter(
  isPlatformRole,
);

const canEditChallenge = (access: WorkspaceAccess) =>
  access.workspace.kind === "org" && organizationCapabilities(access.role).authorChallenges;

/**
 * Publication is `org:publisher` only -- the one role on the
 * `approvals -> published` transition. Deliberately not `canEditChallenge`:
 * the actor who authored the brief must not also be the actor who releases it
 * (70_SECURITY_AND_AUTHZ §6).
 *
 * Both predicates read `organizationCapabilities`, the same shared definition
 * the web navigation derives from, so what a role is offered and what the
 * server accepts cannot drift apart.
 */
const canPublishChallenge = (access: WorkspaceAccess) =>
  access.workspace.kind === "org" && organizationCapabilities(access.role).publishChallenges;

const canManageDirectOffers = (access: WorkspaceAccess) =>
  access.workspace.kind === "org" && organizationCapabilities(access.role).manageDirectOffers;

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

const fastifyEligibilityGatePath = (path: string) =>
  fastifyChallengeCommandPath(path).replace("{gate}", `:gate(${eligibilityGateKinds.join("|")})`);

const fastifyTeamPath = (path: string) =>
  fastifyLiteralPath(path)
    .replace("{teamInvitationId}", ":teamInvitationId(^tiv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)")
    .replace(
      "{teamMembershipRequestId}",
      ":teamMembershipRequestId(^tmr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)",
    )
    .replace("{workspaceId}", ":workspaceId(^wsp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)")
    .replace("{membershipId}", ":membershipId(^mem_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)");

const fastifyProposalPath = (path: string) =>
  fastifyLiteralPath(path).replace(
    "{proposalId}",
    ":proposalId(^prp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)",
  );

const fastifyDirectOfferPath = (path: string) =>
  fastifyLiteralPath(path).replace(
    "{directOfferId}",
    ":directOfferId(^dof_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)",
  );

const fastifyContactVerificationPath = (path: string) =>
  fastifyLiteralPath(path).replace(
    "{attemptId}",
    ":attemptId(^otp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)",
  );

async function runTeamAction<Result>(
  request: FastifyRequest,
  ports: ApiPorts,
  session: AuthenticatedSession,
  action: string,
  permission: TeamAction,
  entityType: string,
  entityId: string | undefined,
  operation: (access: WorkspaceAccess) => Result | Promise<Result>,
): Promise<Result> {
  return runAuthorizedWorkspace(
    request,
    ports,
    session,
    {
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      allows: (access) => access.workspace.kind === "team",
      deferSuccess: true,
    },
    async (access) => {
      const scope = challengeScope(session, access);
      const team = await ports.teams.get(scope);
      if (!team || !isTeamRole(access.role)) throw notFound();
      const decision = decideTeamPermission(permission, {
        role: access.role,
        policy: team.policy,
      });
      if (!decision.allowed) {
        await ports.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          tenantId: access.tenantId,
          workspaceId: access.workspaceId,
          action,
          entityType,
          ...(entityId ? { entityId } : {}),
          reason: "role_capability_denied",
          correlationId: correlationId(request),
          occurredAt: ports.clock.now().toISOString(),
        });
        // The record above only survives on adapters that audit outside a
        // transaction; the PostgreSQL adapter rolls it back with the throw
        // and re-records from the reason carried here.
        throw forbidden("role_capability_denied");
      }
      let result: Result;
      try {
        result = await operation(access);
      } catch (error) {
        if (
          error instanceof ApiProblem &&
          (error.code === "NO_ACCESS" || error.code === "NOT_FOUND")
        ) {
          await ports.decisionAudit.record({
            outcome: "denied",
            actorUserId: session.userId,
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            action,
            entityType,
            ...(entityId ? { entityId } : {}),
            reason: error.code === "NOT_FOUND" ? "record_unreachable" : "command_denied",
            correlationId: correlationId(request),
            occurredAt: ports.clock.now().toISOString(),
          });
        }
        throw error;
      }
      await recordWorkspaceAccessSuccess(request, ports, session, access, {
        action,
        entityType,
        ...(entityId ? { entityId } : {}),
      });
      return result;
    },
  );
}

async function runSolverActorAction<Result>(
  request: FastifyRequest,
  ports: ApiPorts,
  session: AuthenticatedSession,
  action: string,
  entityType: string,
  entityId: string | undefined,
  operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  allows: (access: WorkspaceAccess) => boolean = canReadSolverWorkspace,
): Promise<Result> {
  return runAuthorizedWorkspace(
    request,
    ports,
    session,
    {
      action,
      entityType,
      ...(entityId ? { entityId } : {}),
      allows,
      deferSuccess: true,
    },
    async (access) => {
      let result: Result;
      try {
        result = await operation(access);
      } catch (error) {
        if (
          error instanceof ApiProblem &&
          (error.code === "NO_ACCESS" || error.code === "NOT_FOUND")
        ) {
          await ports.decisionAudit.record({
            outcome: "denied",
            actorUserId: session.userId,
            tenantId: access.tenantId,
            workspaceId: access.workspaceId,
            action,
            entityType,
            ...(entityId ? { entityId } : {}),
            reason: error.code === "NOT_FOUND" ? "record_unreachable" : "command_denied",
            correlationId: correlationId(request),
            occurredAt: ports.clock.now().toISOString(),
          });
        }
        throw error;
      }
      await recordWorkspaceAccessSuccess(request, ports, session, access, {
        action,
        entityType,
        ...(entityId ? { entityId } : {}),
      });
      return result;
    },
  );
}

/**
 * One registration for every versioned challenge command that reads the record
 * inside the authorized unit of work, audits reachability, then delegates to a
 * port command. `allows` and `invoke` are parameters rather than a branch,
 * because publication uses a different role guard and a different port command
 * from the three stage transitions.
 */
function registerChallengeCommand(
  app: FastifyInstance,
  ports: ApiPorts,
  route: string,
  action: string,
  allows: (access: WorkspaceAccess) => boolean,
  invoke: (
    id: string,
    body: ChallengeTransitionBody,
    context: ChallengeScope & { idempotencyKey: string; correlationId: CorrelationId },
  ) => Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>,
  bodySchema: (typeof apiSchemas)[keyof typeof apiSchemas] = apiSchemas.ChallengeTransitionBody,
  standingPlatformRoles: readonly WorkspaceRole[] = [],
): void {
  app.post<{ Params: ChallengeIdParams; Body: ChallengeTransitionBody }>(
    fastifyChallengeCommandPath(route),
    {
      schema: {
        params: challengeIdParamsSchema,
        body: bodySchema,
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
      const command = idempotencyCommand(request);
      const targetWorkspaceId = requiredHeader(request, "X-Workspace-Id");
      const authorization = {
        action,
        entityType: "challenge",
        entityId: request.params.challengeId,
        allows,
        deferSuccess: true,
      } as const;
      const commandOnAccess = async (access: WorkspaceAccess) => {
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
        const outcome = await invoke(request.params.challengeId, request.body, {
          ...challengeScope(session, access),
          ...command,
        });
        return mutationSuccess(outcome, request, ports);
      };
      if (standingPlatformRoles.length > 0 && session.activeWorkspaceId !== targetWorkspaceId) {
        return ports.authority.runAuthorizedPlatformRole(
          session,
          standingPlatformRoles,
          targetWorkspaceId,
          { ...authorization, correlationId: correlationId(request) },
          commandOnAccess,
        );
      }
      return runAuthorizedWorkspace(request, ports, session, authorization, commandOnAccess);
    },
  );
}

/**
 * Records one publication gate. Unlike every other challenge route, the
 * eligible actor is not always a member of the challenge's own workspace:
 * platform:legal/finance/ops hold standing authority over specific gates
 * (gateApproverRoles) but no membership in the org's workspace, so their
 * session is never "active" there. `session.activeWorkspaceId` tells us
 * upfront which case this is -- no try-the-org-path-then-catch fallback,
 * since a caught 404 from runAuthorizedWorkspace can't be told apart from
 * "challenge not found in this (correct) workspace".
 */
function registerRecordChallengeApproval(app: FastifyInstance, ports: ApiPorts): void {
  const action = "challenge:record-approval";

  app.post<{ Params: ChallengeIdParams; Body: RecordChallengeApprovalBody }>(
    fastifyChallengeCommandPath(apiRoutes.recordChallengeApproval),
    {
      schema: {
        params: challengeIdParamsSchema,
        body: apiSchemas.RecordChallengeApprovalBody,
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
      const workspaceId = requiredHeader(request, "X-Workspace-Id");
      const gate = request.body.gate;
      const command = idempotencyCommand(request);

      const recordOnAccess = async (access: WorkspaceAccess) => {
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
        const outcome = await ports.challenges.recordApproval(
          request.params.challengeId,
          request.body,
          { ...challengeScope(session, access), ...command },
        );
        return mutationSuccess(outcome, request, ports);
      };

      if (session.activeWorkspaceId !== workspaceId) {
        return ports.authority.runAuthorizedPlatformRole(
          session,
          gateApproverRoles[gate].filter(isPlatformRole),
          workspaceId,
          {
            action,
            correlationId: correlationId(request),
            entityType: "challenge",
            entityId: request.params.challengeId,
            allows: (access) => isGateApproverRole(gate, access.role),
            deferSuccess: true,
          },
          recordOnAccess,
        );
      }

      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action,
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: (access) => isGateApproverRole(gate, access.role),
          deferSuccess: true,
        },
        recordOnAccess,
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
    if (problem.options.retryAfterSeconds !== undefined) {
      void reply.header("retry-after", problem.options.retryAfterSeconds.toString());
    }
    if (options.browserSession && problem.code === "NO_ACCESS") {
      const cookies = parseCookies(request.headers.cookie);
      if (!cookies.has(browserCookieNames.access) && cookies.has(browserCookieNames.refresh)) {
        void reply.header("x-rahhal-session-refresh", "required");
      }
    }
    void reply
      .status(problem.statusCode)
      .send(errorEnvelope(problem, correlationId(request), ports.clock.now().toISOString()));
  });

  /**
   * Public discovery (B5). These are the only unauthenticated data routes:
   * they read `ports.publicChallenges`, which can only reach the public
   * projection, and never `ports.challenges`.
   *
   * A caller with a valid session sees `registered` challenges too. An
   * absent, malformed, expired, or revoked credential degrades to the
   * anonymous audience rather than failing the request -- a public catalogue
   * that 403s on a stale cookie is broken, and the degraded view still
   * cannot reveal a `registered` row.
   */
  const publicAudience = async (request: FastifyRequest): Promise<PublicAudience> => {
    try {
      const session = await ports.sessions.authenticate(bearerToken(request));
      return session ? "registered" : "anonymous";
    } catch {
      return "anonymous";
    }
  };

  app.get<{ Querystring: PublicChallengeQuery }>(
    apiRoutes.publicChallenges,
    {
      schema: {
        querystring: apiSchemas.PublicChallengeQuery,
        response: {
          200: apiSchemas.ChallengePublicPageSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request) => {
      const page = await ports.publicChallenges.list(await publicAudience(request), request.query);
      return success(page, request, ports);
    },
  );

  app.get<{ Params: ChallengeIdParams }>(
    "/api/v1/public/challenges/:challengeId",
    {
      schema: {
        params: challengeIdParamsSchema,
        response: {
          200: apiSchemas.ChallengePublicSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request) => {
      const projection = await ports.publicChallenges.get(
        await publicAudience(request),
        request.params.challengeId,
      );
      // Unknown, still-private, confidential, and session-gated challenges are
      // all one answer, so the catalogue cannot be used to enumerate them.
      if (!projection) throw notFound();
      return success(projection, request, ports);
    },
  );

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

    app.post(fastifyLiteralPath(browserSessionRoutes.sessionRefresh), async (request, reply) => {
      requireBrowserOrigin(request, settings);
      const cookies = parseCookies(request.headers.cookie);
      const accessToken = cookies.get(browserCookieNames.access);
      if (accessToken && (await ports.sessions.authenticate(accessToken))) {
        return reply.code(204).send();
      }

      const refreshToken = cookies.get(browserCookieNames.refresh);
      if (!refreshToken) {
        return reply.header("set-cookie", clearBrowserSessionCookies(settings)).code(204).send();
      }
      try {
        const outcome = await ports.sessions.refreshBrowser(
          refreshToken,
          idempotencyCommand(request),
        );
        return reply
          .header("set-cookie", sessionCookies(outcome.tokens, settings, ports.clock.now()))
          .code(204)
          .send();
      } catch {
        return reply.header("set-cookie", clearBrowserSessionCookies(settings)).code(204).send();
      }
    });

    /**
     * Returning sign-in for a solver who already activated.
     *
     * Runs the same command as `POST /api/v1/auth/contact-session:exchange`
     * but returns the receipt only: the tokens go into HttpOnly cookies, so a
     * browser can complete an OTP sign-in without a credential ever reaching
     * client JavaScript.
     */
    app.post<{ Body: ContactSessionExchangeBody }>(
      fastifyLiteralPath(browserSessionRoutes.contactSessionExchange),
      {
        schema: {
          body: apiSchemas.ContactSessionExchangeBody,
          response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
        },
      },
      async (request, reply) => {
        requireBrowserOrigin(request, settings);
        const outcome = await ports.solverActivation.exchangeContact(
          request.body,
          idempotencyCommand(request),
        );
        void reply.header(
          "set-cookie",
          sessionCookies(outcome.tokens, settings, ports.clock.now()),
        );
        return mutationSuccess(outcome, request, ports);
      },
    );

    /**
     * First activation from the browser.
     *
     * Same command as `POST /api/v1/solver/activation`; the response carries
     * the activation facts a caller needs to continue -- which workspace was
     * created, and whether a team bootstrap is the next action -- and never
     * the session tokens, which become cookies here.
     */
    app.post<{ Body: ActivateSolverBody }>(
      fastifyLiteralPath(browserSessionRoutes.solverActivation),
      {
        schema: {
          body: apiSchemas.ActivateSolverBody,
          response: {
            200: apiSchemas.BrowserSolverActivationSuccessEnvelope,
            ...apiErrorResponses,
          },
        },
      },
      async (request, reply): Promise<BrowserSolverActivationSuccessEnvelope> => {
        requireBrowserOrigin(request, settings);
        const outcome = await ports.solverActivation.activate(
          request.body,
          idempotencyCommand(request),
        );
        void reply.header(
          "set-cookie",
          sessionCookies(outcome.tokens, settings, ports.clock.now()),
        );
        return versionedSuccess(
          { activation: outcome.activation, receipt: outcome.receipt },
          request,
          ports,
          outcome.entityVersion,
        );
      },
    );
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

  app.post<{ Body: StartContactVerificationBody }>(
    fastifyLiteralPath(apiRoutes.contactVerificationStart),
    {
      schema: {
        body: apiSchemas.StartContactVerificationBody,
        response: {
          200: apiSchemas.ContactVerificationAttemptSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request): Promise<ContactVerificationAttemptSuccessEnvelope> => {
      const attempt = await ports.contactVerification.start(
        request.body,
        idempotencyCommand(request),
      );
      return versionedSuccess(attempt, request, ports, attempt.version);
    },
  );

  app.post<{ Params: ContactVerificationParams; Body: ResendContactVerificationBody }>(
    fastifyContactVerificationPath(apiRoutes.resendContactVerification),
    {
      schema: {
        body: apiSchemas.ResendContactVerificationBody,
        response: {
          200: apiSchemas.ContactVerificationAttemptSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request): Promise<ContactVerificationAttemptSuccessEnvelope> => {
      const attempt = await ports.contactVerification.resend(
        request.params.attemptId,
        request.body,
        idempotencyCommand(request),
      );
      return versionedSuccess(attempt, request, ports, attempt.version);
    },
  );

  app.post<{ Params: ContactVerificationParams; Body: VerifyContactBody }>(
    fastifyContactVerificationPath(apiRoutes.verifyContact),
    {
      schema: {
        body: apiSchemas.VerifyContactBody,
        response: { 200: apiSchemas.VerifiedContactSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<VerifiedContactSuccessEnvelope> => {
      const verified = await ports.contactVerification.verify(
        request.params.attemptId,
        request.body,
        idempotencyCommand(request),
      );
      return versionedSuccess(verified, request, ports, verified.attempt.version);
    },
  );

  app.post<{ Body: ContactSessionExchangeBody }>(
    fastifyLiteralPath(apiRoutes.contactSessionExchange),
    {
      schema: {
        body: apiSchemas.ContactSessionExchangeBody,
        response: { 200: apiSchemas.SessionSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SessionSuccessEnvelope> => {
      const outcome = await ports.solverActivation.exchangeContact(
        request.body,
        idempotencyCommand(request),
      );
      return versionedSuccess(
        { tokens: outcome.tokens, receipt: outcome.receipt },
        request,
        ports,
        outcome.entityVersion,
      );
    },
  );

  app.post<{ Body: ActivateSolverBody }>(
    apiRoutes.solverActivation,
    {
      schema: {
        body: apiSchemas.ActivateSolverBody,
        response: { 200: apiSchemas.SolverActivationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SolverActivationSuccessEnvelope> => {
      const outcome = await ports.solverActivation.activate(
        request.body,
        idempotencyCommand(request),
      );
      return versionedSuccess(
        {
          activation: outcome.activation,
          tokens: outcome.tokens,
          receipt: outcome.receipt,
        },
        request,
        ports,
        outcome.entityVersion,
      );
    },
  );

  app.get(
    apiRoutes.solverActivation,
    {
      schema: {
        response: { 200: apiSchemas.SolverActivationReadSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SolverActivationReadSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const activation = await ports.solverActivation.get(session.userId);
      if (!activation) throw notFound();
      return success(activation, request, ports);
    },
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
      const command = idempotencyCommand(request);
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
            ...command,
          });
          void reply.status(201);
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  /**
   * The active organization workspace's own challenges. Any org role may read
   * the list — the same rule `GET /challenges/{id}` uses — because an approver
   * who cannot find the challenge awaiting their gate cannot do their job.
   * The rows themselves are scoped by `(tenant, workspace)` in the adapter.
   */
  app.get<{ Querystring: ChallengeListQuery }>(
    apiRoutes.challenges,
    {
      schema: {
        querystring: apiSchemas.ChallengeListQuery,
        response: { 200: apiSchemas.ChallengePageSuccessEnvelope, ...apiErrorResponses },
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
          action: "challenge:list",
          entityType: "challenge",
          allows: canReadChallenge,
        },
        async (access) =>
          success(
            await ports.challenges.listScoped(challengeScope(session, access), request.query),
            request,
            ports,
          ),
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

  app.get(
    apiRoutes.platformChallengeApprovalQueue,
    {
      schema: {
        response: {
          200: apiSchemas.PlatformChallengeApprovalQueueSuccessEnvelope,
          ...apiErrorResponses,
        },
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
          action: "challenge:list-platform-approvals",
          entityType: "challenge",
          allows: (access) =>
            access.workspace.kind === "platform" &&
            platformGateApproverRoles.some((role) => role === access.role),
        },
        async (access) =>
          success(
            await ports.challenges.listApprovalQueue(challengeScope(session, access)),
            request,
            ports,
          ),
      );
    },
  );

  app.get<{ Params: ChallengeIdParams }>(
    "/api/v1/platform/challenges/:challengeId/approval-brief",
    {
      schema: {
        params: challengeIdParamsSchema,
        response: { 200: apiSchemas.ChallengeApprovalBriefSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const targetWorkspaceId = requiredHeader(request, "X-Workspace-Id");
      return ports.authority.runAuthorizedPlatformRole(
        session,
        platformGateApproverRoles,
        targetWorkspaceId,
        {
          action: "challenge:read-approval-brief",
          correlationId: correlationId(request),
          entityType: "challenge",
          entityId: request.params.challengeId,
          deferSuccess: true,
        },
        async (access) => {
          const resource = await ports.challenges.getApprovalBrief(
            challengeScope(session, access),
            request.params.challengeId,
          );
          if (!resource) throw notFound();
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action: "challenge:read-approval-brief",
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
      const command = idempotencyCommand(request);
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
            ...command,
          });
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  const registerTransition = (
    route: string,
    command: ChallengeTransitionCommand,
    action: string,
    allows = canEditChallenge,
    standingPlatformRoles: readonly WorkspaceRole[] = [],
  ) =>
    registerChallengeCommand(
      app,
      ports,
      route,
      action,
      allows,
      (id, body, context) => ports.challenges.transition(id, command, body, context),
      apiSchemas.ChallengeTransitionBody,
      standingPlatformRoles,
    );

  registerTransition(
    apiRoutes.requestChallengeTriage,
    "request-triage",
    "challenge:request-triage",
  );
  registerTransition(
    apiRoutes.advanceChallengeFormulation,
    "advance-formulation",
    "challenge:advance-formulation",
    (access) => canEditChallenge(access) || access.role === "platform:ops",
    ["platform:ops"],
  );
  registerTransition(
    apiRoutes.requestChallengeApprovals,
    "request-approvals",
    "challenge:request-approvals",
  );
  registerRecordChallengeApproval(app, ports);
  /**
   * B6 publication lifecycle. Same `org:publisher` authority as publication:
   * extending, pausing or cancelling a live call changes what solvers were
   * already told, which is a release decision, not an authoring one.
   */
  registerChallengeCommand(
    app,
    ports,
    apiRoutes.extendChallengeDeadline,
    "challenge:extend-deadline",
    canPublishChallenge,
    (id, body, context) =>
      ports.challenges.extendDeadline(id, body as ExtendChallengeDeadlineBody, context),
    apiSchemas.ExtendChallengeDeadlineBody,
  );
  for (const [route, command, action] of [
    [apiRoutes.pauseChallenge, "pause", "challenge:pause"],
    [apiRoutes.resumeChallenge, "resume", "challenge:resume"],
    [apiRoutes.closeChallenge, "close", "challenge:close"],
    [apiRoutes.cancelChallenge, "cancel", "challenge:cancel"],
  ] as const) {
    registerChallengeCommand(
      app,
      ports,
      route,
      action,
      canPublishChallenge,
      (id, body, context) =>
        ports.challenges.changePublicationState(
          id,
          command,
          body as ChallengePublicationStateBody,
          context,
        ),
      apiSchemas.ChallengePublicationStateBody,
    );
  }

  registerChallengeCommand(
    app,
    ports,
    apiRoutes.publishChallenge,
    "challenge:publish",
    canPublishChallenge,
    (id, body, context) => ports.challenges.publish(id, body, context),
  );

  app.get(
    apiRoutes.solverProfile,
    {
      schema: {
        response: {
          200: apiSchemas.SolverWorkspaceProfileSuccessEnvelope,
          ...apiErrorResponses,
        },
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
          action: "solver:profile:read",
          entityType: "solver_workspace_profile",
          allows: canReadSolverWorkspace,
        },
        async (access) => {
          const resource = await ports.solverWorkspaces.getProfile(challengeScope(session, access));
          if (!resource) throw notFound();
          return versionedSuccess(resource, request, ports, resource.version);
        },
      );
    },
  );

  app.patch<{ Body: PatchSolverWorkspaceProfileBody }>(
    apiRoutes.solverProfile,
    {
      schema: {
        body: apiSchemas.PatchSolverWorkspaceProfileBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "solver:profile:update",
          entityType: "solver_workspace_profile",
          allows: canEditSolverProfile,
          deferSuccess: true,
        },
        async (access) => {
          const team =
            access.workspace.kind === "team"
              ? await ports.teams.get(challengeScope(session, access))
              : null;
          if (
            access.role === "team:proposal-manager" &&
            (!team ||
              !decideTeamPermission("edit-team-profile", {
                role: access.role,
                policy: team.policy,
              }).allowed)
          ) {
            await ports.decisionAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: access.tenantId,
              workspaceId: access.workspaceId,
              action: "solver:profile:update",
              entityType: "solver_workspace_profile",
              reason: "role_capability_denied",
              correlationId: correlationId(request),
              occurredAt: ports.clock.now().toISOString(),
            });
            throw forbidden("role_capability_denied");
          }
          const result = mutationSuccess(
            await ports.solverWorkspaces.patchProfile(request.body, {
              ...challengeScope(session, access),
              ...command,
              ...(team ? { teamPolicy: team.policy } : {}),
            }),
            request,
            ports,
          );
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action: "solver:profile:update",
            entityType: "solver_workspace_profile",
          });
          return result;
        },
      );
    },
  );

  app.get(
    apiRoutes.solverVerification,
    {
      schema: {
        response: { 200: apiSchemas.SolverVerificationSuccessEnvelope, ...apiErrorResponses },
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
          action: "solver:verification:read",
          entityType: "verification_record",
          allows: canReadSolverWorkspace,
        },
        async (access) => {
          const resource = await ports.solverWorkspaces.getVerification(
            challengeScope(session, access),
          );
          if (!resource) throw notFound();
          return versionedSuccess(resource, request, ports, resource.version);
        },
      );
    },
  );

  app.post<{ Body: StartSolverVerificationBody }>(
    fastifyLiteralPath(apiRoutes.startSolverVerification),
    {
      schema: {
        body: apiSchemas.StartSolverVerificationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "solver:verification:start",
          entityType: "verification_record",
          allows: canManageSolverWorkspace,
        },
        async (access) =>
          mutationSuccess(
            await ports.solverWorkspaces.startVerification(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get<{
    Params: ChallengeIdParams;
  }>(
    fastifyChallengeCommandPath(apiRoutes.challengeEligibility),
    {
      schema: {
        params: challengeIdParamsSchema,
        response: { 200: apiSchemas.EligibilitySuccessEnvelope, ...apiErrorResponses },
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
          action: "challenge:eligibility:evaluate",
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: canReadSolverWorkspace,
          deferSuccess: true,
        },
        async (access) => {
          const resource = await ports.eligibility.evaluate(
            challengeScope(session, access),
            request.params.challengeId,
          );
          if (!resource) {
            await ports.decisionAudit.record({
              outcome: "denied",
              actorUserId: session.userId,
              tenantId: access.tenantId,
              workspaceId: access.workspaceId,
              action: "challenge:eligibility:evaluate",
              entityType: "challenge",
              entityId: request.params.challengeId,
              reason: "record_unreachable",
              correlationId: correlationId(request),
              occurredAt: ports.clock.now().toISOString(),
            });
            throw notFound();
          }
          await recordWorkspaceAccessSuccess(request, ports, session, access, {
            action: "challenge:eligibility:evaluate",
            entityType: "challenge",
            entityId: request.params.challengeId,
          });
          return success(resource, request, ports);
        },
      );
    },
  );

  app.post<{ Params: EligibilityGateParams; Body: AcceptEligibilityGateBody }>(
    fastifyEligibilityGatePath(apiRoutes.acceptChallengeEligibilityGate),
    {
      schema: {
        params: apiSchemas.EligibilityGateParams,
        body: apiSchemas.AcceptEligibilityGateBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runAuthorizedWorkspace(
        request,
        ports,
        session,
        {
          action: "challenge:eligibility-gate:accept",
          entityType: "challenge",
          entityId: request.params.challengeId,
          allows: canManageSolverWorkspace,
        },
        async (access) =>
          mutationSuccess(
            await ports.solverWorkspaces.acceptEligibilityGate(
              request.params.challengeId,
              request.params.gate,
              request.body,
              { ...challengeScope(session, access), ...command },
            ),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Body: CreateTeamBody }>(
    apiRoutes.solverTeams,
    {
      schema: {
        body: apiSchemas.CreateTeamBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:create",
        "team",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.create(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverTeam,
    { schema: { response: { 200: apiSchemas.TeamSuccessEnvelope, ...apiErrorResponses } } },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runTeamAction(
        request,
        ports,
        session,
        "team:read",
        "view-workspace",
        "team",
        undefined,
        async (access) => {
          const team = await ports.teams.get(challengeScope(session, access));
          if (!team) throw notFound();
          return versionedSuccess(team, request, ports, team.version);
        },
      );
    },
  );

  app.patch<{ Body: UpdateTeamPolicyBody }>(
    apiRoutes.solverTeamPolicy,
    {
      schema: {
        body: apiSchemas.UpdateTeamPolicyBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runTeamAction(
        request,
        ports,
        session,
        "team:policy:update",
        "manage-team-settings",
        "team",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.updatePolicy(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverTeamInvitations,
    {
      schema: {
        response: { 200: apiSchemas.TeamInvitationListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runTeamAction(
        request,
        ports,
        session,
        "team:invitations:list",
        "invite-member",
        "team_invitation",
        undefined,
        async (access) =>
          success(
            { items: await ports.teams.listInvitations(challengeScope(session, access)) },
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Body: CreateTeamInvitationBody }>(
    apiRoutes.solverTeamInvitations,
    {
      schema: {
        body: apiSchemas.CreateTeamInvitationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runTeamAction(
        request,
        ports,
        session,
        "team:invitation:send",
        "invite-member",
        "team_invitation",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.invite(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: TeamInvitationParams; Body: RevokeTeamInvitationBody }>(
    fastifyTeamPath(apiRoutes.revokeSolverTeamInvitation),
    {
      schema: {
        params: apiSchemas.TeamInvitationParams,
        body: apiSchemas.RevokeTeamInvitationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      const id = request.params.teamInvitationId;
      return runTeamAction(
        request,
        ports,
        session,
        "team:invitation:revoke",
        "invite-member",
        "team_invitation",
        id,
        async (access) =>
          mutationSuccess(
            await ports.teams.revokeInvitation(id, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverTeamIncomingInvitations,
    {
      schema: {
        response: { 200: apiSchemas.TeamInvitationListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:invitation:list-incoming",
        "team_invitation",
        undefined,
        async () =>
          success(
            { items: await ports.teams.listIncomingInvitations(session.userId) },
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: TeamInvitationParams; Body: RespondTeamInvitationBody }>(
    fastifyTeamPath(apiRoutes.respondSolverTeamInvitation),
    {
      schema: {
        params: apiSchemas.TeamInvitationParams,
        body: apiSchemas.RespondTeamInvitationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      const id = request.params.teamInvitationId;
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:invitation:respond",
        "team_invitation",
        id,
        async (access) =>
          mutationSuccess(
            await ports.teams.respondInvitation(id, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: TeamWorkspaceParams; Body: CreateTeamMembershipRequestBody }>(
    fastifyTeamPath(apiRoutes.createSolverTeamMembershipRequest),
    {
      schema: {
        params: apiSchemas.TeamWorkspaceParams,
        body: apiSchemas.CreateTeamMembershipRequestBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:membership-request:create",
        "team",
        request.params.workspaceId,
        async (access) =>
          mutationSuccess(
            await ports.teams.requestMembership(request.params.workspaceId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverTeamMembershipRequests,
    {
      schema: {
        response: {
          200: apiSchemas.TeamMembershipRequestListSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runTeamAction(
        request,
        ports,
        session,
        "team:membership-requests:list",
        "review-membership-request",
        "team_membership_request",
        undefined,
        async (access) =>
          success(
            { items: await ports.teams.listMembershipRequests(challengeScope(session, access)) },
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: TeamMembershipRequestParams; Body: DecideTeamMembershipRequestBody }>(
    fastifyTeamPath(apiRoutes.decideSolverTeamMembershipRequest),
    {
      schema: {
        params: apiSchemas.TeamMembershipRequestParams,
        body: apiSchemas.DecideTeamMembershipRequestBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      const id = request.params.teamMembershipRequestId;
      return runTeamAction(
        request,
        ports,
        session,
        "team:membership-request:decide",
        "review-membership-request",
        "team_membership_request",
        id,
        async (access) =>
          mutationSuccess(
            await ports.teams.decideMembershipRequest(id, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverOwnTeamMembershipRequests,
    {
      schema: {
        response: {
          200: apiSchemas.TeamMembershipRequestListSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:membership-request:list-own",
        "team_membership_request",
        undefined,
        async () =>
          success(
            { items: await ports.teams.listOwnMembershipRequests(session.userId) },
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: TeamMembershipRequestParams; Body: WithdrawTeamMembershipRequestBody }>(
    fastifyTeamPath(apiRoutes.withdrawSolverTeamMembershipRequest),
    {
      schema: {
        params: apiSchemas.TeamMembershipRequestParams,
        body: apiSchemas.WithdrawTeamMembershipRequestBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      const id = request.params.teamMembershipRequestId;
      return runSolverActorAction(
        request,
        ports,
        session,
        "team:membership-request:withdraw",
        "team_membership_request",
        id,
        async (access) =>
          mutationSuccess(
            await ports.teams.withdrawMembershipRequest(id, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  const registerMemberCommand = (
    route: string,
    action: string,
    bodySchema: (typeof apiSchemas)[keyof typeof apiSchemas],
    invoke: (
      id: string,
      body: ChangeTeamMemberStateBody | ChangeTeamMemberRoleBody,
      context: ReturnType<typeof challengeScope> & ReturnType<typeof idempotencyCommand>,
    ) => Promise<MutationOutcome<string, string>>,
  ) => {
    app.post<{
      Params: TeamMemberParams;
      Body: ChangeTeamMemberStateBody | ChangeTeamMemberRoleBody;
    }>(
      fastifyTeamPath(route),
      {
        schema: {
          params: apiSchemas.TeamMemberParams,
          body: bodySchema,
          response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
        },
      },
      async (request) => {
        const session = await requireSession(
          request,
          ports.sessions,
          ports.decisionAudit,
          ports.clock,
        );
        const command = idempotencyCommand(request);
        const id = request.params.membershipId;
        return runTeamAction(
          request,
          ports,
          session,
          action,
          "change-member-role",
          "membership",
          id,
          async (access) =>
            mutationSuccess(
              await invoke(id, request.body, { ...challengeScope(session, access), ...command }),
              request,
              ports,
            ),
        );
      },
    );
  };

  registerMemberCommand(
    apiRoutes.changeSolverTeamMemberRole,
    "team:member:change-role",
    apiSchemas.ChangeTeamMemberRoleBody,
    (id, body, context) =>
      ports.teams.changeMemberRole(id, body as ChangeTeamMemberRoleBody, context),
  );
  registerMemberCommand(
    apiRoutes.suspendSolverTeamMember,
    "team:member:suspend",
    apiSchemas.ChangeTeamMemberStateBody,
    (id, body, context) =>
      ports.teams.suspendMember(id, body as ChangeTeamMemberStateBody, context),
  );
  registerMemberCommand(
    apiRoutes.restoreSolverTeamMember,
    "team:member:restore",
    apiSchemas.ChangeTeamMemberStateBody,
    (id, body, context) =>
      ports.teams.restoreMember(id, body as ChangeTeamMemberStateBody, context),
  );
  registerMemberCommand(
    apiRoutes.removeSolverTeamMember,
    "team:member:remove",
    apiSchemas.ChangeTeamMemberStateBody,
    (id, body, context) => ports.teams.removeMember(id, body as ChangeTeamMemberStateBody, context),
  );

  app.post<{ Body: TransferTeamOwnershipBody }>(
    fastifyLiteralPath(apiRoutes.transferSolverTeamOwnership),
    {
      schema: {
        body: apiSchemas.TransferTeamOwnershipBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runTeamAction(
        request,
        ports,
        session,
        "team:ownership:transfer",
        "transfer-ownership",
        "team",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.transferOwnership(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Body: LeaveTeamBody }>(
    fastifyLiteralPath(apiRoutes.leaveSolverTeam),
    {
      schema: {
        body: apiSchemas.LeaveTeamBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runTeamAction(
        request,
        ports,
        session,
        "team:leave",
        "leave-team",
        "membership",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.leave(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Body: ArchiveTeamBody }>(
    fastifyLiteralPath(apiRoutes.archiveSolverTeam),
    {
      schema: {
        body: apiSchemas.ArchiveTeamBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runTeamAction(
        request,
        ports,
        session,
        "team:archive",
        "archive-team",
        "team",
        undefined,
        async (access) =>
          mutationSuccess(
            await ports.teams.archive(request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.proposals,
    {
      schema: {
        response: { 200: apiSchemas.ProposalListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<ProposalListSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:list",
        "proposal",
        undefined,
        async (access) =>
          success(await ports.proposals.listScoped(proposalScope(session, access)), request, ports),
      );
    },
  );

  app.post<{ Body: CreateProposalBody }>(
    apiRoutes.proposals,
    {
      schema: {
        body: apiSchemas.CreateProposalBody,
        response: { 201: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request, reply) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:create",
        "proposal",
        undefined,
        async (access) => {
          const outcome = await ports.proposals.create(request.body, {
            ...proposalScope(session, access),
            ...command,
          });
          void reply.status(201);
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  app.get<{ Params: ProposalParams }>(
    fastifyProposalPath(apiRoutes.proposalById),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        response: { 200: apiSchemas.ProposalSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<ProposalSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:read-draft",
        "proposal",
        request.params.proposalId,
        async (access) => {
          const resource = await ports.proposals.getScoped(
            proposalScope(session, access),
            request.params.proposalId,
          );
          if (!resource) throw notFound();
          return versionedSuccess(resource, request, ports, resource.version);
        },
      );
    },
  );

  app.patch<{ Params: ProposalParams; Body: PatchProposalBody }>(
    fastifyProposalPath(apiRoutes.proposalById),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.PatchProposalBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:edit-draft",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.patch(request.params.proposalId, request.body, {
              ...proposalScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: SubmitProposalBody }>(
    fastifyProposalPath(apiRoutes.submitProposal),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.SubmitProposalBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:submit",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.submit(request.params.proposalId, request.body, {
              ...proposalScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: SubmitProposalClarificationBody }>(
    fastifyProposalPath(apiRoutes.submitProposalClarification),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.SubmitProposalClarificationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:submit-clarification",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.submitClarification(request.params.proposalId, request.body, {
              ...proposalScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: StartProposalRevisionBody }>(
    fastifyProposalPath(apiRoutes.startProposalRevision),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.StartProposalRevisionBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:start-revision",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.startRevision(request.params.proposalId, request.body, {
              ...proposalScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: ResubmitProposalBody }>(
    fastifyProposalPath(apiRoutes.resubmitProposal),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.ResubmitProposalBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "proposal:resubmit",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.resubmit(request.params.proposalId, request.body, {
              ...proposalScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.organizationProposalInbox,
    {
      schema: {
        response: {
          200: apiSchemas.OrganizationProposalInboxSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request): Promise<OrganizationProposalInboxSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal-inbox:list",
        "proposal",
        undefined,
        async (access) =>
          success(
            await ports.proposals.listForOrganization(challengeScope(session, access)),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.get<{ Params: ProposalParams }>(
    fastifyProposalPath(apiRoutes.organizationProposalById),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        response: {
          200: apiSchemas.OrganizationProposalSuccessEnvelope,
          ...apiErrorResponses,
        },
      },
    },
    async (request): Promise<OrganizationProposalSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:read",
        "proposal",
        request.params.proposalId,
        async (access) => {
          const resource = await ports.proposals.getForOrganization(
            challengeScope(session, access),
            request.params.proposalId,
          );
          if (!resource) throw notFound();
          // Versioned like the solver's own read: the organization's C4/C5
          // commands all require `expected_version`, so the read has to supply it.
          return versionedSuccess(resource, request, ports, resource.version);
        },
        canReadChallenge,
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: StartProposalEligibilityReviewBody }>(
    fastifyProposalPath(apiRoutes.startProposalEligibilityReview),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.StartProposalEligibilityReviewBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:start-eligibility-review",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.startEligibilityReview(request.params.proposalId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: DecideProposalEligibilityBody }>(
    fastifyProposalPath(apiRoutes.decideProposalEligibility),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.DecideProposalEligibilityBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:decide-eligibility",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.decideEligibility(request.params.proposalId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: RequestProposalClarificationBody }>(
    fastifyProposalPath(apiRoutes.requestProposalClarification),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.RequestProposalClarificationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:request-clarification",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.requestClarification(request.params.proposalId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: ResolveProposalClarificationBody }>(
    fastifyProposalPath(apiRoutes.resolveProposalClarification),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.ResolveProposalClarificationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:resolve-clarification",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.resolveClarification(request.params.proposalId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.post<{ Params: ProposalParams; Body: RequestProposalRevisionBody }>(
    fastifyProposalPath(apiRoutes.requestProposalRevision),
    {
      schema: {
        params: apiSchemas.ProposalParams,
        body: apiSchemas.RequestProposalRevisionBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "organization:proposal:request-revision",
        "proposal",
        request.params.proposalId,
        async (access) =>
          mutationSuccess(
            await ports.proposals.requestRevision(request.params.proposalId, request.body, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
        canReadChallenge,
      );
    },
  );

  app.get(
    apiRoutes.solverSavedOpportunities,
    {
      schema: {
        response: { 200: apiSchemas.SavedOpportunityListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<SavedOpportunityListSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "opportunity:list-saved",
        "saved_opportunity",
        undefined,
        async (access) =>
          success(
            await ports.opportunities.listSaved(opportunityScope(session, access)),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: ChallengeIdParams; Body: SaveOpportunityBody }>(
    fastifyChallengeCommandPath(apiRoutes.saveOpportunity),
    {
      schema: {
        params: challengeIdParamsSchema,
        body: apiSchemas.SaveOpportunityBody,
        response: { 201: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request, reply) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "opportunity:save",
        "saved_opportunity",
        request.params.challengeId,
        async (access) => {
          const outcome = await ports.opportunities.save(request.params.challengeId, request.body, {
            ...opportunityScope(session, access),
            ...command,
          });
          void reply.status(201);
          return mutationSuccess(outcome, request, ports);
        },
      );
    },
  );

  app.post<{ Params: ChallengeIdParams; Body: UnsaveOpportunityBody }>(
    fastifyChallengeCommandPath(apiRoutes.unsaveOpportunity),
    {
      schema: {
        params: challengeIdParamsSchema,
        body: apiSchemas.UnsaveOpportunityBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "opportunity:unsave",
        "saved_opportunity",
        request.params.challengeId,
        async (access) =>
          mutationSuccess(
            await ports.opportunities.unsave(request.params.challengeId, request.body, {
              ...opportunityScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.solverDirectOffers,
    {
      schema: {
        response: { 200: apiSchemas.DirectOfferListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<DirectOfferListSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "direct-offer:list-received",
        "direct_offer",
        undefined,
        async (access) =>
          success(
            await ports.opportunities.listReceived(opportunityScope(session, access)),
            request,
            ports,
          ),
      );
    },
  );

  app.get<{ Params: DirectOfferParams }>(
    fastifyDirectOfferPath(apiRoutes.solverDirectOfferById),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        response: { 200: apiSchemas.DirectOfferSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<DirectOfferSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "direct-offer:read-received",
        "direct_offer",
        request.params.directOfferId,
        async (access) => {
          const resource = await ports.opportunities.getReceived(
            opportunityScope(session, access),
            request.params.directOfferId,
          );
          if (!resource) throw notFound();
          return versionedSuccess(resource, request, ports, resource.version);
        },
      );
    },
  );

  const receivedOfferCommand = async <Body extends { readonly expected_version: number }>(
    request: FastifyRequest<{ Params: DirectOfferParams; Body: Body }>,
    action: string,
    invoke: (
      access: WorkspaceAccess,
      session: AuthenticatedSession,
      command: ReturnType<typeof idempotencyCommand>,
    ) => Promise<MutationOutcome<DirectOfferId, string>>,
  ) => {
    const session = await requireSession(request, ports.sessions, ports.decisionAudit, ports.clock);
    const command = idempotencyCommand(request);
    return runSolverActorAction(
      request,
      ports,
      session,
      action,
      "direct_offer",
      request.params.directOfferId,
      async (access) => mutationSuccess(await invoke(access, session, command), request, ports),
    );
  };

  app.post<{ Params: DirectOfferParams; Body: ViewDirectOfferBody }>(
    fastifyDirectOfferPath(apiRoutes.viewDirectOffer),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.ViewDirectOfferBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      receivedOfferCommand(request, "direct-offer:view", async (access, session, command) =>
        ports.opportunities.view(request.params.directOfferId, request.body, {
          ...opportunityScope(session, access),
          ...command,
        }),
      ),
  );

  app.post<{ Params: DirectOfferParams; Body: StartOfferResponseBody }>(
    fastifyDirectOfferPath(apiRoutes.startOfferResponse),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.StartOfferResponseBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      receivedOfferCommand(
        request,
        "direct-offer:start-response",
        async (access, session, command) =>
          ports.opportunities.startResponse(request.params.directOfferId, request.body, {
            ...opportunityScope(session, access),
            ...command,
          }),
      ),
  );

  app.patch<{ Params: DirectOfferParams; Body: PatchOfferResponseBody }>(
    fastifyDirectOfferPath(apiRoutes.offerResponse),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.PatchOfferResponseBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      receivedOfferCommand(
        request,
        "direct-offer:patch-response",
        async (access, session, command) =>
          ports.opportunities.patchResponse(request.params.directOfferId, request.body, {
            ...opportunityScope(session, access),
            ...command,
          }),
      ),
  );

  app.post<{ Params: DirectOfferParams; Body: SubmitOfferResponseBody }>(
    fastifyDirectOfferPath(apiRoutes.submitOfferResponse),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.SubmitOfferResponseBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      receivedOfferCommand(
        request,
        "direct-offer:submit-response",
        async (access, session, command) =>
          ports.opportunities.submitResponse(request.params.directOfferId, request.body, {
            ...opportunityScope(session, access),
            ...command,
          }),
      ),
  );

  app.post<{ Params: DirectOfferParams; Body: DeclineDirectOfferBody }>(
    fastifyDirectOfferPath(apiRoutes.declineDirectOffer),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.DeclineDirectOfferBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      receivedOfferCommand(request, "direct-offer:decline", async (access, session, command) =>
        ports.opportunities.decline(request.params.directOfferId, request.body, {
          ...opportunityScope(session, access),
          ...command,
        }),
      ),
  );

  app.get(
    apiRoutes.organizationDirectOffers,
    {
      schema: {
        response: { 200: apiSchemas.DirectOfferListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<DirectOfferListSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "direct-offer:list-sent",
        "direct_offer",
        undefined,
        async (access) =>
          success(
            await ports.opportunities.listSent(challengeScope(session, access)),
            request,
            ports,
          ),
        canManageDirectOffers,
      );
    },
  );

  app.post<{ Body: CreateDirectOfferBody }>(
    apiRoutes.organizationDirectOffers,
    {
      schema: {
        body: apiSchemas.CreateDirectOfferBody,
        response: { 201: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request, reply) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runSolverActorAction(
        request,
        ports,
        session,
        "direct-offer:send",
        "direct_offer",
        undefined,
        async (access) => {
          const outcome = await ports.opportunities.send(request.body, {
            ...challengeScope(session, access),
            ...command,
          });
          void reply.status(201);
          return mutationSuccess(outcome, request, ports);
        },
        canManageDirectOffers,
      );
    },
  );

  app.get<{ Params: DirectOfferParams }>(
    fastifyDirectOfferPath(apiRoutes.organizationDirectOfferById),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        response: { 200: apiSchemas.DirectOfferSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<DirectOfferSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runSolverActorAction(
        request,
        ports,
        session,
        "direct-offer:read-sent",
        "direct_offer",
        request.params.directOfferId,
        async (access) => {
          const resource = await ports.opportunities.getSent(
            challengeScope(session, access),
            request.params.directOfferId,
          );
          if (!resource) throw notFound();
          return versionedSuccess(resource, request, ports, resource.version);
        },
        canManageDirectOffers,
      );
    },
  );

  const sentOfferCommand = async <Body extends { readonly expected_version: number }>(
    request: FastifyRequest<{ Params: DirectOfferParams; Body: Body }>,
    action: string,
    invoke: (
      access: WorkspaceAccess,
      session: AuthenticatedSession,
      command: ReturnType<typeof idempotencyCommand>,
    ) => Promise<MutationOutcome<DirectOfferId, string>>,
  ) => {
    const session = await requireSession(request, ports.sessions, ports.decisionAudit, ports.clock);
    const command = idempotencyCommand(request);
    return runSolverActorAction(
      request,
      ports,
      session,
      action,
      "direct_offer",
      request.params.directOfferId,
      async (access) => mutationSuccess(await invoke(access, session, command), request, ports),
      canManageDirectOffers,
    );
  };

  app.post<{ Params: DirectOfferParams; Body: CancelDirectOfferBody }>(
    fastifyDirectOfferPath(apiRoutes.cancelDirectOffer),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.CancelDirectOfferBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      sentOfferCommand(request, "direct-offer:cancel", async (access, session, command) =>
        ports.opportunities.cancel(request.params.directOfferId, request.body, {
          ...challengeScope(session, access),
          ...command,
        }),
      ),
  );

  app.post<{ Params: DirectOfferParams; Body: StartDirectOfferNegotiationBody }>(
    fastifyDirectOfferPath(apiRoutes.startDirectOfferNegotiation),
    {
      schema: {
        params: apiSchemas.DirectOfferParams,
        body: apiSchemas.StartDirectOfferNegotiationBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) =>
      sentOfferCommand(
        request,
        "direct-offer:start-negotiation",
        async (access, session, command) =>
          ports.opportunities.startNegotiation(request.params.directOfferId, request.body, {
            ...challengeScope(session, access),
            ...command,
          }),
      ),
  );

  // `fastifyLiteralPath` escapes the action suffix's colon; without it the
  // `:read` in `/notifications/{id}:read` is parsed as a second route
  // parameter and the params schema rejects the extra property.
  const fastifyNotificationPath = (path: string) =>
    fastifyLiteralPath(path).replace(
      "{notificationId}",
      ":notificationId(^ntf_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$)",
    );

  app.get<{ Querystring: { limit?: number; cursor?: string; unread_only?: boolean } }>(
    apiRoutes.notifications,
    {
      schema: {
        querystring: apiSchemas.NotificationListQuery,
        response: { 200: apiSchemas.NotificationListSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<NotificationListSuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspaceRead(
        request,
        ports,
        session,
        "notification:list",
        async (access) =>
          success(
            await ports.notifications.list(challengeScope(session, access), {
              ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
              ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
              ...(request.query.unread_only === undefined
                ? {}
                : { unreadOnly: request.query.unread_only }),
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.get(
    apiRoutes.notificationSummary,
    {
      schema: {
        response: { 200: apiSchemas.NotificationSummarySuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request): Promise<NotificationSummarySuccessEnvelope> => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      return runAuthorizedWorkspaceRead(
        request,
        ports,
        session,
        "notification:summary",
        async (access) =>
          success(
            await ports.notifications.summary(challengeScope(session, access)),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Params: { notificationId: string }; Body: MarkNotificationReadBody }>(
    fastifyNotificationPath(apiRoutes.markNotificationRead),
    {
      schema: {
        params: apiSchemas.NotificationParams,
        body: apiSchemas.MarkNotificationReadBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runAuthorizedWorkspaceRead(
        request,
        ports,
        session,
        "notification:read",
        async (access) =>
          mutationSuccess(
            await ports.notifications.markRead(request.params.notificationId, {
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  app.post<{ Body: MarkAllNotificationsReadBody }>(
    fastifyLiteralPath(apiRoutes.markAllNotificationsRead),
    {
      schema: {
        body: apiSchemas.MarkAllNotificationsReadBody,
        response: { 200: apiSchemas.MutationSuccessEnvelope, ...apiErrorResponses },
      },
    },
    async (request) => {
      const session = await requireSession(
        request,
        ports.sessions,
        ports.decisionAudit,
        ports.clock,
      );
      const command = idempotencyCommand(request);
      return runAuthorizedWorkspaceRead(
        request,
        ports,
        session,
        "notification:read-all",
        async (access) =>
          mutationSuccess(
            await ports.notifications.markAllRead({
              ...challengeScope(session, access),
              ...command,
            }),
            request,
            ports,
          ),
      );
    },
  );

  return app;
}
