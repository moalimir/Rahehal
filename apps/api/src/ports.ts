import type {
  ChallengeApprovalBriefResource,
  ChallengeApprovalNextAction,
  PlatformChallengeApprovalQueueResource,
  ChallengePublicPage,
  ChallengePublicProjectionResource,
  ChallengeResource,
  ChallengeNextAction,
  ChallengeTransitionBody,
  CreateChallengeBody,
  MeResource,
  MutationReceipt,
  OidcAuthorizationStartBody,
  OidcAuthorizationStartResult,
  ChallengePublicationStateBody,
  ExtendChallengeDeadlineBody,
  PatchChallengeBody,
  PublicAudience,
  PublicChallengeQuery,
  PublishChallengeBody,
  RecordChallengeApprovalBody,
  SessionExchangeBody,
  SessionRefreshBody,
  SessionRevokeBody,
  SessionTokenSet,
} from "@rahhal/contracts";
import type {
  ChallengeApprovalId,
  ChallengeId,
  EntityId,
  Membership,
  CorrelationId,
  SessionId,
  TenantId,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRole,
} from "@rahhal/domain";

export type Clock = {
  now(): Date;
};

export type IdFactory = {
  next(prefix: "ses" | "chl" | "chv" | "cap" | "rcp" | "aud" | "cor" | "evt" | "oat"): string;
};

export type AuthenticatedSession = {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly version: number;
  readonly expiresAt: string;
  readonly activeWorkspaceId: WorkspaceId | null;
  readonly credentialFingerprint: string;
};

export type SessionCommand = {
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export type OidcIdentity = {
  readonly authorizationAttemptId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly verifiedEmail: string;
};

export interface OidcExchangePort {
  exchange(body: SessionExchangeBody): Promise<OidcIdentity | null>;
  consume(identity: OidcIdentity): Promise<void>;
}

export interface OidcAuthorizationPort {
  start(
    body: OidcAuthorizationStartBody,
    command: SessionCommand,
  ): Promise<OidcAuthorizationStartResult>;
}

export type IssuedSessionCredentials = {
  readonly accessToken: string;
  readonly refreshToken: string;
};

export interface SessionCredentialIssuerPort {
  issue(sessionId: SessionId, version: number): IssuedSessionCredentials;
}

export type MutationOutcome<
  TargetId extends string = EntityId,
  NextAction extends string = string,
> = {
  readonly receipt: MutationReceipt<TargetId, NextAction>;
  readonly entityVersion: number;
};

export type SessionTokenOutcome = MutationOutcome<SessionId, "select_workspace" | "continue"> & {
  readonly tokens: SessionTokenSet;
};

export type SessionRevokeOutcome = MutationOutcome<SessionId, "signed_out"> & {
  readonly actorUserId: UserId;
};

export interface SessionPort {
  authenticate(accessToken: string): Promise<AuthenticatedSession | null>;
  exchange(body: SessionExchangeBody, command: SessionCommand): Promise<SessionTokenOutcome>;
  refresh(body: SessionRefreshBody, command: SessionCommand): Promise<SessionTokenOutcome>;
  revoke(
    accessToken: string,
    body: SessionRevokeBody,
    command: SessionCommand,
  ): Promise<SessionRevokeOutcome>;
}

export type WorkspaceAccess = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly role: WorkspaceRole;
  readonly workspace: Workspace;
  readonly membership: Membership;
};

export interface WorkspacePort {
  getMe(session: AuthenticatedSession): Promise<MeResource | null>;
  findActive(userId: UserId, workspaceId: string): Promise<WorkspaceAccess | null>;
  switchContext(
    session: AuthenticatedSession,
    targetWorkspaceId: string,
    expectedVersion: number,
    command: SessionCommand,
  ): Promise<MutationOutcome<SessionId, "continue">>;
}

export type WorkspaceAuthorization = {
  readonly action: string;
  readonly correlationId: CorrelationId;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly deferSuccess?: boolean;
  readonly allows?: (access: WorkspaceAccess) => boolean;
};

export interface WorkspaceAuthorityUnitOfWorkPort {
  runAuthorizedWorkspace<Result>(
    session: AuthenticatedSession,
    workspaceId: string,
    authorization: WorkspaceAuthorization,
    operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  ): Promise<Result>;
  /**
   * The cross-tenant sibling of `runAuthorizedWorkspace` (ADR-0015). Platform
   * roles (platform:ops/finance/legal) hold no membership in an org's
   * workspace, so `runAuthorizedWorkspace` can never authorize them there;
   * this resolves their standing platform authority against a target
   * workspace they do not belong to.
   *
   * It deliberately mirrors `runAuthorizedWorkspace`'s guarantees rather than
   * exposing a bare lookup: the session and the platform membership are both
   * revalidated *inside* the same unit of work that runs `operation`, so a
   * session revoked or a membership suspended mid-flight denies the write
   * instead of racing past it. Resolving platform access outside the unit of
   * work would reintroduce exactly that race.
   */
  runAuthorizedPlatformRole<Result>(
    session: AuthenticatedSession,
    roles: readonly WorkspaceRole[],
    targetWorkspaceId: string,
    authorization: WorkspaceAuthorization,
    operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  ): Promise<Result>;
}

export type ChallengeScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly role: WorkspaceRole;
};

export type ChallengeCommandContext = ChallengeScope & {
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export type ChallengeTransitionCommand =
  | "request-triage"
  | "advance-formulation"
  | "request-approvals";

/**
 * B6's publication-lifecycle commands. They move `publication_state` on an
 * already-published challenge; they never touch the approved version, because
 * the four gates approved that exact content.
 */
export type ChallengePublicationCommand = "pause" | "resume" | "close" | "cancel";

export interface ChallengePort {
  create(
    body: CreateChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  getScoped(scope: ChallengeScope, id: string): Promise<ChallengeResource | null>;
  getApprovalBrief(
    scope: ChallengeScope,
    id: string,
  ): Promise<ChallengeApprovalBriefResource | null>;
  listApprovalQueue(scope: ChallengeScope): Promise<PlatformChallengeApprovalQueueResource>;
  patch(
    id: string,
    body: PatchChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  transition(
    id: string,
    command: ChallengeTransitionCommand,
    body: ChallengeTransitionBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  recordApproval(
    id: string,
    body: RecordChallengeApprovalBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeApprovalId, ChallengeApprovalNextAction>>;
  /**
   * B4's `approvals -> published` command. It is a first-class command rather
   * than another `ChallengeTransitionCommand` because it does strictly more
   * than move a stage: it pins `published_version_id` to the exact version the
   * four gates cleared and writes the structurally separate public projection,
   * both inside the transaction that records the receipt.
   */
  publish(
    id: string,
    body: PublishChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  extendDeadline(
    id: string,
    body: ExtendChallengeDeadlineBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  changePublicationState(
    id: string,
    command: ChallengePublicationCommand,
    body: ChallengePublicationStateBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
}

/**
 * The public read surface, deliberately a separate port from `ChallengePort`.
 * Its implementations may only reach `challenge_public_projection`; they hold
 * no reference to the private aggregate, so an unauthenticated path cannot
 * read one even by mistake (70_SECURITY_AND_AUTHZ, load-bearing constraint 7).
 *
 * `audience` is decided by the server from the presence of a valid session,
 * never by a client-supplied parameter.
 */
export interface PublicChallengePort {
  list(audience: PublicAudience, query: PublicChallengeQuery): Promise<ChallengePublicPage>;
  get(audience: PublicAudience, id: string): Promise<ChallengePublicProjectionResource | null>;
}

export type AccessDecisionRecord = {
  readonly outcome: "success" | "denied";
  readonly actorUserId?: UserId;
  readonly tenantId?: TenantId;
  readonly workspaceId?: string;
  readonly action: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly reason?: string;
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
};

export interface AccessDecisionAuditPort {
  record(decision: AccessDecisionRecord): Promise<void>;
}

export type ApiPorts = {
  readonly oidcAuthorization: OidcAuthorizationPort;
  readonly sessions: SessionPort;
  readonly workspaces: WorkspacePort;
  readonly authority: WorkspaceAuthorityUnitOfWorkPort;
  readonly challenges: ChallengePort;
  readonly publicChallenges: PublicChallengePort;
  readonly decisionAudit: AccessDecisionAuditPort;
  readonly clock: Clock;
  readonly ids: IdFactory;
};

export type DemoIdentitySeed = {
  readonly user: User;
  readonly workspace: Workspace;
  readonly membership: Membership;
  readonly authorizationCode: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly oidcState: string;
  readonly sessionId: SessionId;
  readonly accessToken: string;
  readonly refreshToken: string;
};
