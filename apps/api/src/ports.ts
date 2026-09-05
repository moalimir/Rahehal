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
  SubmitProposalBody,
  StartProposalEligibilityReviewBody,
  DecideProposalEligibilityBody,
  RequestProposalClarificationBody,
  SubmitProposalClarificationBody,
  ResolveProposalClarificationBody,
  RequestProposalRevisionBody,
  StartProposalRevisionBody,
  ResubmitProposalBody,
  ProposalNextAction,
  ProposalResource,
  OrganizationProposalInboxResource,
  OrganizationProposalResource,
  AcceptEligibilityGateBody,
  PatchSolverWorkspaceProfileBody,
  SolverWorkspaceProfileResource,
  SolverVerificationResource,
  StartSolverVerificationBody,
  SolverProfileNextAction,
  SolverVerificationNextAction,
  EligibilityGateNextAction,
  ArchiveTeamBody,
  ChangeTeamMemberRoleBody,
  ChangeTeamMemberStateBody,
  CreateTeamBody,
  CreateTeamInvitationBody,
  CreateTeamMembershipRequestBody,
  DecideTeamMembershipRequestBody,
  LeaveTeamBody,
  RespondTeamInvitationBody,
  RevokeTeamInvitationBody,
  TeamInvitationResource,
  TeamMembershipRequestResource,
  TeamNextAction,
  TeamResource,
  TransferTeamOwnershipBody,
  UpdateTeamPolicyBody,
  WithdrawTeamMembershipRequestBody,
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
  CancelDirectOfferBody,
  CreateDirectOfferBody,
  DeclineDirectOfferBody,
  DirectOfferListResource,
  DirectOfferNextAction,
  DirectOfferResource,
  PatchOfferResponseBody,
  SaveOpportunityBody,
  SavedOpportunityListResource,
  SavedOpportunityNextAction,
  StartDirectOfferNegotiationBody,
  StartOfferResponseBody,
  SubmitOfferResponseBody,
  UnsaveOpportunityBody,
  ViewDirectOfferBody,
  ActivateSolverBody,
  ContactSessionExchangeBody,
  ContactVerificationAttemptResource,
  ResendContactVerificationBody,
  SolverActivationResource,
  SolverActivationSessionResult,
  StartContactVerificationBody,
  VerifiedContactResource,
  VerifyContactBody,
} from "@rahhal/contracts";
import type {
  ChallengeApprovalId,
  ChallengeId,
  EntityId,
  Membership,
  CorrelationId,
  ProposalId,
  DirectOfferId,
  EligibilityGateAcceptanceId,
  EligibilityGateKind,
  MembershipId,
  TeamInvitationId,
  TeamMembershipRequestId,
  TeamPolicy,
  VerificationId,
  SavedOpportunityId,
  SessionId,
  TenantId,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRole,
  ContactVerificationChannel,
  ContactVerificationAttemptId,
} from "@rahhal/domain";

export type Clock = {
  now(): Date;
};

export type IdFactory = {
  next(
    prefix:
      | "usr"
      | "ten"
      | "ses"
      | "chl"
      | "chv"
      | "cap"
      | "ver"
      | "ega"
      | "tiv"
      | "tmr"
      | "prp"
      | "prv"
      | "pcl"
      | "prr"
      | "sop"
      | "dof"
      | "ofr"
      | "agr"
      | "wsp"
      | "mem"
      | "rcp"
      | "aud"
      | "cor"
      | "evt"
      | "oat"
      | "act"
      | "otp",
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

export type VerifiedContactAssertion = {
  readonly assertionId: ContactVerificationAttemptId;
  readonly issuer: string;
  readonly subject: string;
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
  readonly expiresAt: string;
};

export interface ContactVerificationProviderPort {
  start(
    body: StartContactVerificationBody,
    command: SessionCommand,
  ): Promise<ContactVerificationAttemptResource>;
  resend(
    attemptId: string,
    body: ResendContactVerificationBody,
    command: SessionCommand,
  ): Promise<ContactVerificationAttemptResource>;
  verify(
    attemptId: string,
    body: VerifyContactBody,
    command: SessionCommand,
  ): Promise<VerifiedContactResource>;
  assertion(verificationToken: string): Promise<VerifiedContactAssertion | null>;
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

export type SolverActivationOutcome = {
  readonly activation: SolverActivationResource;
  readonly tokens: SessionTokenSet;
  readonly receipt: SolverActivationSessionResult["receipt"];
  readonly entityVersion: number;
};

export interface SolverActivationPort {
  exchangeContact(
    body: ContactSessionExchangeBody,
    command: SessionCommand,
  ): Promise<SessionTokenOutcome>;
  activate(body: ActivateSolverBody, command: SessionCommand): Promise<SolverActivationOutcome>;
  get(userId: UserId): Promise<SolverActivationResource | null>;
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
  /** C2 policy snapshot resolved inside the authorized team transaction. */
  readonly teamPolicy?: TeamPolicy;
};

export type ProposalScope = WorkspaceScope & {
  readonly membershipId: MembershipId;
};

export type ProposalCommandContext = ProposalScope & {
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export type OpportunityScope = WorkspaceScope & {
  readonly membershipId: MembershipId;
};

export type OpportunityCommandContext = OpportunityScope & {
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

export interface TeamPort {
  create(
    body: CreateTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>>;
  get(scope: WorkspaceScope): Promise<TeamResource | null>;
  updatePolicy(
    body: UpdateTeamPolicyBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>>;
  listInvitations(scope: WorkspaceScope): Promise<readonly TeamInvitationResource[]>;
  invite(
    body: CreateTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>>;
  revokeInvitation(
    invitationId: string,
    body: RevokeTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>>;
  listIncomingInvitations(actorUserId: UserId): Promise<readonly TeamInvitationResource[]>;
  respondInvitation(
    invitationId: string,
    body: RespondTeamInvitationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamInvitationId, TeamNextAction>>;
  requestMembership(
    teamWorkspaceId: string,
    body: CreateTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>>;
  listMembershipRequests(scope: WorkspaceScope): Promise<readonly TeamMembershipRequestResource[]>;
  decideMembershipRequest(
    requestId: string,
    body: DecideTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>>;
  listOwnMembershipRequests(actorUserId: UserId): Promise<readonly TeamMembershipRequestResource[]>;
  withdrawMembershipRequest(
    requestId: string,
    body: WithdrawTeamMembershipRequestBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<TeamMembershipRequestId, TeamNextAction>>;
  changeMemberRole(
    membershipId: string,
    body: ChangeTeamMemberRoleBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>>;
  suspendMember(
    membershipId: string,
    body: ChangeTeamMemberStateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>>;
  restoreMember(
    membershipId: string,
    body: ChangeTeamMemberStateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>>;
  removeMember(
    membershipId: string,
    body: ChangeTeamMemberStateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>>;
  transferOwnership(
    body: TransferTeamOwnershipBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>>;
  leave(
    body: LeaveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<MembershipId, TeamNextAction>>;
  archive(
    body: ArchiveTeamBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, TeamNextAction>>;
}

/**
 * Phase 3's proposal aggregate. Same command shape as `ChallengePort`:
 * `expected_version` on every mutation, an idempotency key per command, and a
 * typed receipt whose evidence commits in the same transaction as the change.
 */
export interface ProposalPort {
  create(
    body: CreateProposalBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  getScoped(scope: ProposalScope, id: string): Promise<ProposalResource | null>;
  patch(
    id: string,
    body: PatchProposalBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  submit(
    id: string,
    body: SubmitProposalBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  startEligibilityReview(
    id: string,
    body: StartProposalEligibilityReviewBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  decideEligibility(
    id: string,
    body: DecideProposalEligibilityBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  requestClarification(
    id: string,
    body: RequestProposalClarificationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  submitClarification(
    id: string,
    body: SubmitProposalClarificationBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  resolveClarification(
    id: string,
    body: ResolveProposalClarificationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  requestRevision(
    id: string,
    body: RequestProposalRevisionBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  startRevision(
    id: string,
    body: StartProposalRevisionBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  resubmit(
    id: string,
    body: ResubmitProposalBody,
    context: ProposalCommandContext,
  ): Promise<MutationOutcome<ProposalId, ProposalNextAction>>;
  listForOrganization(scope: WorkspaceScope): Promise<OrganizationProposalInboxResource>;
  getForOrganization(
    scope: WorkspaceScope,
    id: string,
  ): Promise<OrganizationProposalResource | null>;
}

export interface OpportunityPort {
  listSaved(scope: OpportunityScope): Promise<SavedOpportunityListResource>;
  save(
    challengeId: string,
    body: SaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<SavedOpportunityId, SavedOpportunityNextAction>>;
  unsave(
    challengeId: string,
    body: UnsaveOpportunityBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<SavedOpportunityId, SavedOpportunityNextAction>>;
  listReceived(scope: OpportunityScope): Promise<DirectOfferListResource>;
  getReceived(scope: OpportunityScope, id: string): Promise<DirectOfferResource | null>;
  view(
    id: string,
    body: ViewDirectOfferBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  startResponse(
    id: string,
    body: StartOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  patchResponse(
    id: string,
    body: PatchOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  submitResponse(
    id: string,
    body: SubmitOfferResponseBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  decline(
    id: string,
    body: DeclineDirectOfferBody,
    context: OpportunityCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  listSent(scope: WorkspaceScope): Promise<DirectOfferListResource>;
  getSent(scope: WorkspaceScope, id: string): Promise<DirectOfferResource | null>;
  send(
    body: CreateDirectOfferBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  cancel(
    id: string,
    body: CancelDirectOfferBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
  startNegotiation(
    id: string,
    body: StartDirectOfferNegotiationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<DirectOfferId, DirectOfferNextAction>>;
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
  readonly contactVerification: ContactVerificationProviderPort;
  readonly sessions: SessionPort;
  readonly solverActivation: SolverActivationPort;
  readonly workspaces: WorkspacePort;
  readonly authority: WorkspaceAuthorityUnitOfWorkPort;
  readonly challenges: ChallengePort;
  readonly publicChallenges: PublicChallengePort;
  readonly solverWorkspaces: SolverWorkspacePort;
  readonly eligibility: EligibilityPort;
  readonly teams: TeamPort;
  readonly proposals: ProposalPort;
  readonly opportunities: OpportunityPort;
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
