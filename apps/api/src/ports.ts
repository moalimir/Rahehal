import type {
  ChallengeApprovalBriefResource,
  ChallengeListQuery,
  ChallengePage,
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
  CreateProposalBody,
  EligibilityDecisionResource,
  PatchProposalBody,
  ProposalNextAction,
  ProposalResource,
  SubmitProposalBody,
  AcceptEligibilityGateBody,
  PatchSolverWorkspaceProfileBody,
  SolverWorkspaceProfileResource,
  SolverVerificationResource,
  StartSolverVerificationBody,
  SolverProfileNextAction,
  SolverVerificationNextAction,
  EligibilityGateNextAction,
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
  ProposalId,
  EligibilityGateAcceptanceId,
  EligibilityGateKind,
  VerificationId,
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
  next(
    prefix: "ses" | "chl" | "chv" | "cap" | "ver" | "ega" | "rcp" | "aud" | "cor" | "evt" | "oat",
  ): string;
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

export type WorkspaceScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly role: WorkspaceRole;
};

export type WorkspaceCommandContext = WorkspaceScope & {
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export type ChallengeScope = WorkspaceScope;
export type ChallengeCommandContext = WorkspaceCommandContext;

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
  /**
   * The active workspace's own challenges. Scoped by `(tenant, workspace)`
   * like every other protected read, so this is a list of what the caller
   * owns rather than a catalogue that happens to be filtered.
   */
  listScoped(scope: ChallengeScope, query: ChallengeListQuery): Promise<ChallengePage>;
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

/**
 * Phase 3. `evaluateEligibility` is a query, not a command: it writes nothing
 * and is safe to call repeatedly. It is a separate port from `ProposalPort`
 * because C1 must answer for a solver who has no proposal yet — that is the
 * whole point of checking eligibility before drafting.
 */
export interface EligibilityPort {
  evaluate(scope: WorkspaceScope, challengeId: string): Promise<EligibilityDecisionResource | null>;
}

export interface SolverWorkspacePort {
  getProfile(scope: WorkspaceScope): Promise<SolverWorkspaceProfileResource | null>;
  patchProfile(
    body: PatchSolverWorkspaceProfileBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, SolverProfileNextAction>>;
  getVerification(scope: WorkspaceScope): Promise<SolverVerificationResource | null>;
  startVerification(
    body: StartSolverVerificationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<VerificationId, SolverVerificationNextAction>>;
  acceptEligibilityGate(
    challengeId: string,
    gate: EligibilityGateKind,
    body: AcceptEligibilityGateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<EligibilityGateAcceptanceId, EligibilityGateNextAction>>;
}

/**
 * Phase 3's proposal aggregate. Same command shape as `ChallengePort`:
 * `expected_version` on every mutation, an idempotency key per command, and a
 * typed receipt whose evidence commits in the same transaction as the change.
 */
export interface ProposalPort {
  create(
    body: CreateProposalBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  getScoped(scope: WorkspaceScope, id: string): Promise<ProposalResource | null>;
  patch(
    id: string,
    body: PatchProposalBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  submit(
    id: string,
    body: SubmitProposalBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
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
  readonly solverWorkspaces: SolverWorkspacePort;
  readonly eligibility: EligibilityPort;
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
