import type {
  ChallengeApprovalNextAction,
  ChallengeResource,
  ChallengeNextAction,
  ChallengeTransitionBody,
  CreateChallengeBody,
  MeResource,
  MutationReceipt,
  OidcAuthorizationStartBody,
  OidcAuthorizationStartResult,
  PatchChallengeBody,
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

export interface ChallengePort {
  create(
    body: CreateChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeNextAction>>;
  getScoped(scope: ChallengeScope, id: string): Promise<ChallengeResource | null>;
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
