import type {
  MeResource,
  MembershipResource,
  MutationReceipt,
  OutboxEvent,
  SessionExchangeBody,
  SessionRefreshBody,
  SessionRevokeBody,
  SessionTokenSet,
  WorkspaceResource,
} from "@rahhal/contracts";
import {
  isWorkspaceId,
  parseAuditEventId,
  parsePrefixedId,
  parseReceiptId,
  parseSessionId,
  type AuditEventId,
  type MembershipId,
  type MembershipState,
  type SessionId,
  type TenantId,
  type UserId,
  type WorkspaceId,
} from "@rahhal/domain";
import { forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import { InMemoryCriticalSection } from "./in-memory-critical-section.js";
import { commandFingerprint } from "./primitives.js";
import type {
  AccessDecisionAuditPort,
  AuthenticatedSession,
  Clock,
  DemoIdentitySeed,
  IdFactory,
  MutationOutcome,
  SessionCommand,
  SessionPort,
  SessionRevokeOutcome,
  SessionTokenOutcome,
  WorkspaceAccess,
  WorkspaceAuthorityUnitOfWorkPort,
  WorkspaceAuthorization,
  WorkspacePort,
} from "./ports.js";

type StoredSession = {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly version: number;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
  readonly activeWorkspaceId: WorkspaceId | null;
  readonly revoked: boolean;
};

type IdentityAuditRecord = {
  readonly id: AuditEventId;
  readonly actorUserId: UserId;
  readonly tenantId: TenantId;
  readonly entityId: SessionId;
  readonly entityVersion: number;
  readonly action:
    | "session.exchanged"
    | "session.refreshed"
    | "session.revoked"
    | "session.context.switched";
  readonly correlationId: SessionCommand["correlationId"];
  readonly occurredAt: string;
};

type CachedTokenOutcome = {
  readonly fingerprint: string;
  readonly outcome: SessionTokenOutcome;
};

type CachedMutationOutcome<NextAction extends "continue" | "signed_out"> = {
  readonly fingerprint: string;
  readonly outcome: MutationOutcome<SessionId, NextAction>;
};

type IdentityState = {
  readonly sessions: Map<SessionId, StoredSession>;
  readonly accessIndex: Map<string, SessionId>;
  readonly refreshIndex: Map<string, SessionId>;
  readonly tokenIdempotency: Map<string, CachedTokenOutcome>;
  readonly revokeIdempotency: Map<string, CachedMutationOutcome<"signed_out">>;
  readonly contextIdempotency: Map<string, CachedMutationOutcome<"continue">>;
  readonly consumedOidcExchanges: Set<string>;
  readonly membershipStates: Map<MembershipId, MembershipState>;
  readonly auditEvents: IdentityAuditRecord[];
  readonly outboxEvents: OutboxEvent[];
};

function copyState(state: IdentityState): IdentityState {
  return {
    sessions: new Map([...state.sessions].map(([key, value]) => [key, structuredClone(value)])),
    accessIndex: new Map(state.accessIndex),
    refreshIndex: new Map(state.refreshIndex),
    tokenIdempotency: new Map(
      [...state.tokenIdempotency].map(([key, value]) => [key, structuredClone(value)]),
    ),
    revokeIdempotency: new Map(
      [...state.revokeIdempotency].map(([key, value]) => [key, structuredClone(value)]),
    ),
    contextIdempotency: new Map(
      [...state.contextIdempotency].map(([key, value]) => [key, structuredClone(value)]),
    ),
    consumedOidcExchanges: new Set(state.consumedOidcExchanges),
    membershipStates: new Map(state.membershipStates),
    auditEvents: structuredClone(state.auditEvents),
    outboxEvents: structuredClone(state.outboxEvents),
  };
}

function workspaceResource(seed: DemoIdentitySeed): WorkspaceResource {
  const { workspace } = seed;
  if (workspace.kind === "org") {
    return { id: workspace.id, tenant_id: workspace.tenantId, kind: "org", name: workspace.name };
  }
  if (workspace.kind === "individual") {
    return {
      id: workspace.id,
      tenant_id: workspace.tenantId,
      kind: "individual",
      name: workspace.name,
      owner_user_id: workspace.ownerUserId,
    };
  }
  return {
    id: workspace.id,
    tenant_id: workspace.tenantId,
    kind: "team",
    name: workspace.name,
    team_kind: workspace.teamKind,
    owner_user_id: workspace.ownerUserId,
  };
}

function membershipResource(seed: DemoIdentitySeed, state: MembershipState): MembershipResource {
  const { membership } = seed;
  return {
    id: membership.id,
    tenant_id: membership.tenantId,
    workspace_id: membership.workspaceId,
    user_id: membership.userId,
    role: membership.role,
    state,
    created_at: membership.createdAt,
    updated_at: membership.updatedAt,
  };
}

export class InMemoryIdentityAdapter
  implements SessionPort, WorkspacePort, WorkspaceAuthorityUnitOfWorkPort
{
  private state: IdentityState = {
    sessions: new Map(),
    accessIndex: new Map(),
    refreshIndex: new Map(),
    tokenIdempotency: new Map(),
    revokeIdempotency: new Map(),
    contextIdempotency: new Map(),
    consumedOidcExchanges: new Set(),
    membershipStates: new Map(),
    auditEvents: [],
    outboxEvents: [],
  };

  constructor(
    private readonly seeds: readonly DemoIdentitySeed[],
    private readonly clock: Clock,
    private readonly ids: IdFactory,
    private readonly decisionAudit: AccessDecisionAuditPort,
    private readonly criticalSection: InMemoryCriticalSection,
    private readonly beforeCommit?: () => void,
  ) {
    for (const seed of seeds) {
      this.state.membershipStates.set(seed.membership.id, seed.membership.state);
      const session: StoredSession = {
        id: seed.sessionId,
        userId: seed.user.id,
        tenantId: seed.workspace.tenantId,
        version: 1,
        accessToken: seed.accessToken,
        refreshToken: seed.refreshToken,
        accessExpiresAt: new Date(clock.now().getTime() + 15 * 60_000).toISOString(),
        refreshExpiresAt: new Date(clock.now().getTime() + 14 * 24 * 60 * 60_000).toISOString(),
        activeWorkspaceId: seed.workspace.id,
        revoked: false,
      };
      this.state.sessions.set(session.id, session);
      this.state.accessIndex.set(session.accessToken, session.id);
      this.state.refreshIndex.set(session.refreshToken, session.id);
    }
  }

  private transact<Result>(work: (draft: IdentityState) => Result): Result {
    const draft = copyState(this.state);
    const result = work(draft);
    this.beforeCommit?.();
    this.state = draft;
    return result;
  }

  private tokens(session: StoredSession): SessionTokenSet {
    return {
      session_id: session.id,
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: "Bearer",
      access_token_expires_at: session.accessExpiresAt,
      refresh_token_expires_at: session.refreshExpiresAt,
    };
  }

  private receipt<NextAction extends "select_workspace" | "continue" | "signed_out">(
    state: IdentityState,
    session: StoredSession,
    action: IdentityAuditRecord["action"],
    command: SessionCommand,
    nextActions: readonly NextAction[],
  ): MutationOutcome<SessionId, NextAction> {
    const timestamp = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    state.auditEvents.push({
      id: auditId,
      actorUserId: session.userId,
      tenantId: session.tenantId,
      entityId: session.id,
      entityVersion: session.version,
      action,
      correlationId: command.correlationId,
      occurredAt: timestamp,
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: action,
      schema_version: 1,
      aggregate_type: "session",
      aggregate_id: session.id,
      tenant_id: session.tenantId,
      correlation_id: command.correlationId,
      occurred_at: timestamp,
      payload: { entity_version: session.version },
    });
    const receipt: MutationReceipt<SessionId, NextAction> = {
      entity_id: session.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp,
      idempotent: false,
      next_actions: nextActions,
    };
    return { receipt, entityVersion: session.version };
  }

  private replayToken(key: string, fingerprint: string) {
    const cached = this.state.tokenIdempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      ...structuredClone(cached.outcome),
      receipt: { ...cached.outcome.receipt, idempotent: true },
    };
  }

  private replayMutation<NextAction extends "continue" | "signed_out">(
    cache: ReadonlyMap<string, CachedMutationOutcome<NextAction>>,
    key: string,
    fingerprint: string,
  ): MutationOutcome<SessionId, NextAction> | null {
    const cached = cache.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      ...structuredClone(cached.outcome),
      receipt: { ...cached.outcome.receipt, idempotent: true },
    };
  }

  private credentialSession(session: AuthenticatedSession): StoredSession | null {
    const current = this.state.sessions.get(session.id);
    if (
      !current ||
      current.revoked ||
      commandFingerprint(current.accessToken) !== session.credentialFingerprint ||
      Date.parse(current.accessExpiresAt) <= this.clock.now().getTime()
    ) {
      return null;
    }
    return current;
  }

  private currentSession(session: AuthenticatedSession): StoredSession | null {
    const current = this.credentialSession(session);
    return current?.version === session.version ? current : null;
  }

  private findActiveCurrent(userId: UserId, workspaceId: string): WorkspaceAccess | null {
    if (!isWorkspaceId(workspaceId)) return null;
    const seed = this.seeds.find(
      (candidate) =>
        candidate.user.id === userId &&
        candidate.workspace.id === workspaceId &&
        this.state.membershipStates.get(candidate.membership.id) === "active",
    );
    if (!seed) return null;
    return {
      tenantId: seed.workspace.tenantId,
      workspaceId: seed.workspace.id,
      role: seed.membership.role,
      workspace: seed.workspace,
      membership: seed.membership,
    };
  }

  async runAuthorizedWorkspace<Result>(
    session: AuthenticatedSession,
    workspaceId: string,
    authorization: WorkspaceAuthorization,
    operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.criticalSection.run(async () => {
      const current = this.currentSession(session);
      if (!current) {
        await this.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          workspaceId,
          action: authorization.action,
          entityType: authorization.entityType,
          entityId: authorization.entityId,
          reason: "session_not_current",
          correlationId: authorization.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
        throw forbidden();
      }
      if (current.activeWorkspaceId !== workspaceId) {
        await this.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          workspaceId,
          action: authorization.action,
          entityType: authorization.entityType,
          entityId: authorization.entityId,
          reason: "workspace_context_mismatch",
          correlationId: authorization.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
        throw notFound();
      }
      const access = this.findActiveCurrent(session.userId, workspaceId);
      if (!access) {
        await this.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          workspaceId,
          action: authorization.action,
          entityType: authorization.entityType,
          entityId: authorization.entityId,
          reason: "workspace_unreachable",
          correlationId: authorization.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
        throw notFound();
      }
      if (authorization.allows && !authorization.allows(access)) {
        await this.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          tenantId: access.tenantId,
          workspaceId: access.workspaceId,
          action: authorization.action,
          entityType: authorization.entityType,
          entityId: authorization.entityId,
          reason: "role_capability_denied",
          correlationId: authorization.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
        throw forbidden();
      }
      if (!authorization.deferSuccess) {
        await this.decisionAudit.record({
          outcome: "success",
          actorUserId: session.userId,
          tenantId: access.tenantId,
          workspaceId: access.workspaceId,
          action: authorization.action,
          entityType: authorization.entityType,
          entityId: authorization.entityId,
          correlationId: authorization.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
      }
      return operation(access);
    });
  }

  async authenticate(accessToken: string): Promise<AuthenticatedSession | null> {
    const sessionId = this.state.accessIndex.get(accessToken);
    const session = sessionId ? this.state.sessions.get(sessionId) : undefined;
    if (
      !session ||
      session.revoked ||
      Date.parse(session.accessExpiresAt) <= this.clock.now().getTime()
    ) {
      return null;
    }
    return {
      id: session.id,
      userId: session.userId,
      version: session.version,
      expiresAt: session.accessExpiresAt,
      activeWorkspaceId: session.activeWorkspaceId,
      credentialFingerprint: commandFingerprint(accessToken),
    };
  }

  async exchange(body: SessionExchangeBody, command: SessionCommand): Promise<SessionTokenOutcome> {
    return this.criticalSection.run(() => {
      const credentialScope = commandFingerprint({
        authorizationCode: body.authorization_code,
        state: body.state,
      });
      const key = `session:exchange\u0000${credentialScope}\u0000${command.idempotencyKey}`;
      const fingerprint = commandFingerprint(body);
      const replay = this.replayToken(key, fingerprint);
      if (replay) return replay;
      const seed = this.seeds.find(
        (candidate) =>
          candidate.authorizationCode === body.authorization_code &&
          candidate.codeVerifier === body.code_verifier &&
          candidate.redirectUri === body.redirect_uri &&
          candidate.oidcState === body.state,
      );
      if (!seed) throw forbidden();

      return this.transact((state) => {
        if (state.consumedOidcExchanges.has(credentialScope)) throw forbidden();
        state.consumedOidcExchanges.add(credentialScope);
        const id = parseSessionId(this.ids.next("ses"));
        const session: StoredSession = {
          id,
          userId: seed.user.id,
          tenantId: seed.workspace.tenantId,
          version: 1,
          accessToken: `rahhal-access-${id}-version-1`,
          refreshToken: `rahhal-refresh-${id}-version-1`,
          accessExpiresAt: new Date(this.clock.now().getTime() + 15 * 60_000).toISOString(),
          refreshExpiresAt: new Date(
            this.clock.now().getTime() + 14 * 24 * 60 * 60_000,
          ).toISOString(),
          activeWorkspaceId: null,
          revoked: false,
        };
        state.sessions.set(id, session);
        state.accessIndex.set(session.accessToken, id);
        state.refreshIndex.set(session.refreshToken, id);
        const mutation = this.receipt(state, session, "session.exchanged", command, [
          "select_workspace",
        ]);
        const outcome = { ...mutation, tokens: this.tokens(session) };
        state.tokenIdempotency.set(key, { fingerprint, outcome: structuredClone(outcome) });
        return outcome;
      });
    });
  }

  async refresh(body: SessionRefreshBody, command: SessionCommand): Promise<SessionTokenOutcome> {
    return this.criticalSection.run(() => {
      const credentialScope = commandFingerprint(body.refresh_token);
      const key = `session:refresh\u0000${credentialScope}\u0000${command.idempotencyKey}`;
      const fingerprint = commandFingerprint(body);
      const replay = this.replayToken(key, fingerprint);
      if (replay) return replay;
      const sessionId = this.state.refreshIndex.get(body.refresh_token);
      const current = sessionId ? this.state.sessions.get(sessionId) : undefined;
      if (
        !current ||
        current.revoked ||
        Date.parse(current.refreshExpiresAt) <= this.clock.now().getTime()
      ) {
        throw forbidden();
      }
      if (body.expected_version !== current.version) throw staleVersion(current.version);

      return this.transact((state) => {
        const next: StoredSession = {
          ...current,
          version: current.version + 1,
          accessToken: `rahhal-access-${current.id}-version-${current.version + 1}`,
          refreshToken: `rahhal-refresh-${current.id}-version-${current.version + 1}`,
          accessExpiresAt: new Date(this.clock.now().getTime() + 15 * 60_000).toISOString(),
          refreshExpiresAt: new Date(
            this.clock.now().getTime() + 14 * 24 * 60 * 60_000,
          ).toISOString(),
        };
        state.accessIndex.delete(current.accessToken);
        state.refreshIndex.delete(current.refreshToken);
        state.sessions.set(next.id, next);
        state.accessIndex.set(next.accessToken, next.id);
        state.refreshIndex.set(next.refreshToken, next.id);
        const mutation = this.receipt(state, next, "session.refreshed", command, ["continue"]);
        const outcome = { ...mutation, tokens: this.tokens(next) };
        state.tokenIdempotency.set(key, { fingerprint, outcome: structuredClone(outcome) });
        return outcome;
      });
    });
  }

  async revoke(
    accessToken: string,
    body: SessionRevokeBody,
    command: SessionCommand,
  ): Promise<SessionRevokeOutcome> {
    return this.criticalSection.run(() => {
      const credentialScope = commandFingerprint(accessToken);
      const key = `session:revoke\u0000${credentialScope}\u0000${command.idempotencyKey}`;
      const fingerprint = commandFingerprint({ body, accessToken });
      const sessionId = this.state.accessIndex.get(accessToken);
      const credentialOwner = sessionId ? this.state.sessions.get(sessionId) : undefined;
      const replay = this.replayMutation(this.state.revokeIdempotency, key, fingerprint);
      if (replay && credentialOwner) return { ...replay, actorUserId: credentialOwner.userId };
      const current = credentialOwner;
      if (!current || current.revoked) throw forbidden();
      if (body.session_id !== current.id) throw notFound();
      if (body.expected_version !== current.version) throw staleVersion(current.version);

      return this.transact((state) => {
        const revoked = { ...current, version: current.version + 1, revoked: true };
        state.sessions.set(revoked.id, revoked);
        const outcome = this.receipt(state, revoked, "session.revoked", command, ["signed_out"]);
        state.revokeIdempotency.set(key, { fingerprint, outcome: structuredClone(outcome) });
        return { ...outcome, actorUserId: revoked.userId };
      });
    });
  }

  async getMe(session: AuthenticatedSession): Promise<MeResource | null> {
    return this.criticalSection.run(() => {
      const userSeed = this.seeds.find((seed) => seed.user.id === session.userId);
      const storedSession = this.currentSession(session);
      if (!storedSession) throw forbidden();
      if (!userSeed) return null;
      const seeds = this.seeds.filter((seed) => seed.user.id === session.userId);
      const activeSeed = seeds.find(
        (seed) =>
          seed.workspace.id === storedSession.activeWorkspaceId &&
          this.state.membershipStates.get(seed.membership.id) === "active",
      );
      return {
        user: {
          id: userSeed.user.id,
          display_name: userSeed.user.displayName,
          primary_email: userSeed.user.primaryEmail,
          email_verified: userSeed.user.emailVerified,
        },
        memberships: seeds.map((seed) =>
          membershipResource(
            seed,
            this.state.membershipStates.get(seed.membership.id) ?? "removed",
          ),
        ),
        workspaces: seeds.map(workspaceResource),
        active_context: activeSeed
          ? {
              tenant_id: activeSeed.workspace.tenantId,
              workspace_id: activeSeed.workspace.id,
              workspace_kind: activeSeed.workspace.kind,
            }
          : null,
      };
    });
  }

  async findActive(userId: UserId, workspaceId: string): Promise<WorkspaceAccess | null> {
    return this.findActiveCurrent(userId, workspaceId);
  }

  async switchContext(
    session: AuthenticatedSession,
    targetWorkspaceId: string,
    expectedVersion: number,
    command: SessionCommand,
  ): Promise<MutationOutcome<SessionId, "continue">> {
    return this.criticalSection.run(async () => {
      const current = this.credentialSession(session);
      if (!current) throw forbidden();
      const target = this.findActiveCurrent(session.userId, targetWorkspaceId);
      if (!target) {
        await this.decisionAudit.record({
          outcome: "denied",
          actorUserId: session.userId,
          workspaceId: targetWorkspaceId,
          action: "workspace.context.switch",
          reason: "target_workspace_unreachable",
          correlationId: command.correlationId,
          occurredAt: this.clock.now().toISOString(),
        });
        throw notFound();
      }

      const key = `session:context-switch\u0000${session.id}\u0000${command.idempotencyKey}`;
      const fingerprint = commandFingerprint({ targetWorkspaceId, expectedVersion });
      const replay = this.replayMutation(this.state.contextIdempotency, key, fingerprint);
      if (replay) return replay;
      if (expectedVersion !== current.version) throw staleVersion(current.version);

      await this.decisionAudit.record({
        outcome: "success",
        actorUserId: session.userId,
        tenantId: target.tenantId,
        workspaceId: target.workspaceId,
        action: "workspace.context.switch",
        correlationId: command.correlationId,
        occurredAt: this.clock.now().toISOString(),
      });
      return this.transact((state) => {
        const switched = {
          ...current,
          version: current.version + 1,
          activeWorkspaceId: target.workspaceId,
        };
        state.sessions.set(switched.id, switched);
        const outcome = this.receipt(state, switched, "session.context.switched", command, [
          "continue",
        ]);
        state.contextIdempotency.set(key, { fingerprint, outcome: structuredClone(outcome) });
        return outcome;
      });
    });
  }

  snapshot() {
    return {
      sessions: structuredClone([...this.state.sessions.values()]),
      auditEvents: structuredClone(this.state.auditEvents),
      outboxEvents: structuredClone(this.state.outboxEvents),
      tokenIdempotencyEntryCount: this.state.tokenIdempotency.size,
      mutationIdempotencyEntryCount:
        this.state.revokeIdempotency.size + this.state.contextIdempotency.size,
      consumedOidcExchangeCount: this.state.consumedOidcExchanges.size,
      membershipStates: structuredClone([...this.state.membershipStates]),
    };
  }

  async setMembershipStateForTest(
    userId: UserId,
    workspaceId: WorkspaceId,
    state: MembershipState,
  ): Promise<void> {
    await this.criticalSection.run(() => {
      const seed = this.seeds.find(
        (candidate) => candidate.user.id === userId && candidate.workspace.id === workspaceId,
      );
      if (!seed) throw new Error("Unknown demo membership");
      this.state.membershipStates.set(seed.membership.id, state);
    });
  }
}
