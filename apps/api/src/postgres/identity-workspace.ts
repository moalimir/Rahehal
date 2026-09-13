import { createHash } from "node:crypto";

import type {
  MeResource,
  MembershipResource,
  MutationReceipt,
  SessionExchangeBody,
  SessionRefreshBody,
  SessionRevokeBody,
  SessionTokenSet,
  WorkspaceResource,
} from "@rahhal/contracts";
import {
  isMembershipState,
  isTeamKind,
  isWorkspaceKind,
  isWorkspaceRole,
  parseAuditEventId,
  parseMembershipId,
  parsePrefixedId,
  parseReceiptId,
  parseSessionId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type Membership,
  type SessionId,
  type UserId,
  type Workspace,
  type WorkspaceRole,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  AccessDecisionAuditPort,
  AuthenticatedSession,
  Clock,
  IdFactory,
  MutationOutcome,
  OidcExchangePort,
  SessionCommand,
  SessionCredentialIssuerPort,
  SessionPort,
  SessionRevokeOutcome,
  SessionTokenOutcome,
  WorkspaceAccess,
  WorkspaceAuthorityUnitOfWorkPort,
  WorkspaceAuthorization,
  WorkspacePort,
} from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type SessionRow = {
  readonly id: string;
  readonly user_id: string;
  readonly origin_tenant_id: string;
  readonly access_token_digest: string;
  readonly refresh_token_digest: string;
  readonly session_version: string;
  readonly active_tenant_id: string | null;
  readonly active_workspace_id: string | null;
  readonly access_expires_at: Date;
  readonly refresh_expires_at: Date;
  readonly revoked_at: Date | null;
};

type AccessRow = {
  readonly membership_id: string;
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly workspace_kind: string;
  readonly user_id: string;
  readonly role: string;
  readonly state: string;
  readonly membership_created_at: Date;
  readonly membership_updated_at: Date;
  readonly workspace_name: string;
  readonly owner_user_id: string | null;
  readonly team_kind: string | null;
};

type UserRow = {
  readonly id: string;
  readonly display_name: string;
  readonly primary_email: string | null;
  readonly email_verified: boolean;
  readonly primary_phone: string | null;
  readonly phone_verified: boolean;
};

type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

type CachedSessionMutation = {
  readonly kind: "tokens" | "mutation";
  readonly session_id: string;
  readonly actor_user_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly string[];
  readonly access_expires_at?: string;
  readonly refresh_expires_at?: string;
};

type SessionEvidenceAction =
  | "session.exchanged"
  | "session.refreshed"
  | "session.revoked"
  | "session.context.switched";

type TransactionDenialKind =
  | "session_not_current"
  | "workspace_context_mismatch"
  | "workspace_unreachable"
  | "role_capability_denied";

class TransactionDenial extends Error {
  constructor(
    readonly kind: TransactionDenialKind,
    readonly access?: WorkspaceAccess,
  ) {
    super(kind);
  }
}

export function credentialDigest(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function aggregateVersion(value: string): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("Database returned an invalid session version");
  }
  return version;
}

function cachedMutation(value: unknown): CachedSessionMutation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Database returned an invalid idempotency response");
  }
  const record = value as Record<string, unknown>;
  if (
    (record["kind"] !== "tokens" && record["kind"] !== "mutation") ||
    typeof record["session_id"] !== "string" ||
    typeof record["actor_user_id"] !== "string" ||
    !Number.isSafeInteger(record["entity_version"]) ||
    typeof record["receipt_id"] !== "string" ||
    typeof record["audit_event_id"] !== "string" ||
    typeof record["timestamp"] !== "string" ||
    (record["access_expires_at"] !== undefined &&
      typeof record["access_expires_at"] !== "string") ||
    (record["refresh_expires_at"] !== undefined &&
      typeof record["refresh_expires_at"] !== "string") ||
    !Array.isArray(record["next_actions"]) ||
    !record["next_actions"].every((item) => typeof item === "string")
  ) {
    throw new Error("Database returned an invalid idempotency response");
  }
  return record as unknown as CachedSessionMutation;
}

type WorkspaceRow = Pick<
  AccessRow,
  "workspace_id" | "tenant_id" | "workspace_kind" | "workspace_name" | "owner_user_id" | "team_kind"
>;

function workspaceFromRow(row: WorkspaceRow): Workspace {
  const id = parseWorkspaceId(row.workspace_id);
  const tenantId = parseTenantId(row.tenant_id);
  if (!isWorkspaceKind(row.workspace_kind)) throw new Error("Unknown workspace kind in database");

  if (row.workspace_kind === "platform" || row.workspace_kind === "org") {
    return { id, tenantId, kind: row.workspace_kind, name: row.workspace_name };
  }
  const ownerUserId = parseUserId(row.owner_user_id);
  if (row.workspace_kind === "individual") {
    return { id, tenantId, kind: "individual", name: row.workspace_name, ownerUserId };
  }
  if (!isTeamKind(row.team_kind)) throw new Error("Unknown team kind in database");
  return {
    id,
    tenantId,
    kind: "team",
    name: row.workspace_name,
    ownerUserId,
    teamKind: row.team_kind,
  };
}

function accessFromRow(row: AccessRow): WorkspaceAccess {
  if (!isWorkspaceRole(row.role)) throw new Error("Unknown workspace role in database");
  if (!isMembershipState(row.state)) throw new Error("Unknown membership state in database");
  const workspace = workspaceFromRow(row);
  const membership: Membership = {
    id: parseMembershipId(row.membership_id),
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    userId: parseUserId(row.user_id),
    role: row.role,
    state: row.state,
    createdAt: timestamp(row.membership_created_at),
    updatedAt: timestamp(row.membership_updated_at),
  };
  return {
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    role: membership.role,
    workspace,
    membership,
  };
}

function workspaceResource(workspace: Workspace): WorkspaceResource {
  const base = { id: workspace.id, tenant_id: workspace.tenantId, name: workspace.name };
  if (workspace.kind === "platform" || workspace.kind === "org") {
    return { ...base, kind: workspace.kind };
  }
  if (workspace.kind === "individual") {
    return { ...base, kind: "individual", owner_user_id: workspace.ownerUserId };
  }
  return {
    ...base,
    kind: "team",
    owner_user_id: workspace.ownerUserId,
    team_kind: workspace.teamKind,
  };
}

function membershipResource(membership: Membership): MembershipResource {
  return {
    id: membership.id,
    tenant_id: membership.tenantId,
    workspace_id: membership.workspaceId,
    user_id: membership.userId,
    role: membership.role,
    state: membership.state,
    created_at: membership.createdAt,
    updated_at: membership.updatedAt,
  };
}

export class PostgresIdentityWorkspaceAdapter
  implements SessionPort, WorkspacePort, WorkspaceAuthorityUnitOfWorkPort
{
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly oidc: OidcExchangePort,
    private readonly credentials: SessionCredentialIssuerPort,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
    private readonly decisionAudit: AccessDecisionAuditPort,
  ) {}

  private async sessionByAccess(
    client: PoolClient,
    session: Pick<AuthenticatedSession, "id" | "userId" | "credentialFingerprint">,
    lock: "share" | "update",
  ): Promise<SessionRow | null> {
    const result = await client.query<SessionRow>(
      `
        SELECT
          id,
          user_id,
          origin_tenant_id,
          access_token_digest,
          refresh_token_digest,
          session_version,
          active_tenant_id,
          active_workspace_id,
          access_expires_at,
          refresh_expires_at,
          revoked_at
        FROM app_session
        WHERE id = $1 AND access_token_digest = $2 AND user_id = $3
        FOR ${lock === "update" ? "UPDATE" : "SHARE"}
      `,
      [session.id, session.credentialFingerprint, session.userId],
    );
    return result.rows[0] ?? null;
  }

  private sessionIsUsable(row: SessionRow | null, now: Date): row is SessionRow {
    return (
      row !== null && row.revoked_at === null && row.access_expires_at.getTime() > now.getTime()
    );
  }

  private async activeAccess(
    client: PoolClient,
    userId: UserId,
    workspaceId: string,
  ): Promise<WorkspaceAccess | null> {
    const result = await client.query<AccessRow>(
      `
        SELECT
          m.id AS membership_id,
          m.tenant_id,
          m.workspace_id,
          m.workspace_kind,
          m.user_id,
          m.role,
          m.state,
          m.created_at AS membership_created_at,
          m.updated_at AS membership_updated_at,
          w.name AS workspace_name,
          w.owner_user_id,
          w.team_kind
        FROM membership AS m
        JOIN workspace AS w
          ON w.id = m.workspace_id
         AND w.tenant_id = m.tenant_id
         AND w.kind = m.workspace_kind
        WHERE m.user_id = $1 AND m.workspace_id = $2 AND m.state = 'active'
          AND (
            w.kind <> 'team'
            OR EXISTS (
              SELECT 1
              FROM team_workspace AS team
              WHERE team.tenant_id = w.tenant_id
                AND team.workspace_id = w.id
                AND team.status = 'active'
            )
          )
        FOR SHARE OF m, w
      `,
      [userId, workspaceId],
    );
    return result.rows[0] ? accessFromRow(result.rows[0]) : null;
  }

  private async loadCredentialReplay(
    client: PoolClient,
    credentialFingerprint: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CachedSessionMutation | null> {
    await client.query(
      `
        DELETE FROM idempotency_key
        WHERE scope_kind = 'credential'
          AND tenant_id IS NULL
          AND credential_fingerprint = $1
          AND idempotency_key = $2
          AND expires_at <= $3
      `,
      [credentialFingerprint, idempotencyKey, this.clock.now().toISOString()],
    );
    const result = await client.query<IdempotencyRow>(
      `
        SELECT request_hash, status, response_body
        FROM idempotency_key
        WHERE scope_kind = 'credential'
          AND tenant_id IS NULL
          AND credential_fingerprint = $1
          AND idempotency_key = $2
        FOR UPDATE
      `,
      [credentialFingerprint, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Idempotency record is incomplete");
    return cachedMutation(row.response_body);
  }

  private async storeCredentialReplay(
    client: PoolClient,
    credentialFingerprint: string,
    command: SessionCommand,
    requestHash: string,
    response: CachedSessionMutation,
    expiresAt: string,
  ): Promise<void> {
    const id = `idk_${commandFingerprint({ credentialFingerprint, key: command.idempotencyKey })}`;
    await client.query(
      `
        INSERT INTO idempotency_key (
          id,
          scope_kind,
          tenant_id,
          credential_fingerprint,
          idempotency_key,
          request_hash,
          status,
          response_status,
          response_body,
          created_at,
          expires_at
        ) VALUES ($1, 'credential', NULL, $2, $3, $4, 'completed', 200, $5::jsonb, $6, $7)
      `,
      [
        id,
        credentialFingerprint,
        command.idempotencyKey,
        requestHash,
        JSON.stringify(response),
        response.timestamp,
        expiresAt,
      ],
    );
  }

  private receipt<NextAction extends "select_workspace" | "continue" | "signed_out">(
    cached: CachedSessionMutation,
    idempotent: boolean,
  ): MutationOutcome<SessionId, NextAction> {
    const receipt: MutationReceipt<SessionId, NextAction> = {
      entity_id: parseSessionId(cached.session_id),
      receipt_id: parseReceiptId(cached.receipt_id),
      audit_event_id: parseAuditEventId(cached.audit_event_id),
      timestamp: timestamp(cached.timestamp),
      idempotent,
      next_actions: cached.next_actions as readonly NextAction[],
    };
    return { receipt, entityVersion: cached.entity_version };
  }

  private tokenOutcome(cached: CachedSessionMutation, idempotent: boolean): SessionTokenOutcome {
    if (
      cached.kind !== "tokens" ||
      cached.access_expires_at === undefined ||
      cached.refresh_expires_at === undefined
    ) {
      throw new Error("Idempotency response does not contain session token metadata");
    }
    const sessionId = parseSessionId(cached.session_id);
    const issued = this.credentials.issue(sessionId, cached.entity_version);
    const tokens: SessionTokenSet = {
      session_id: sessionId,
      access_token: issued.accessToken,
      refresh_token: issued.refreshToken,
      token_type: "Bearer",
      access_token_expires_at: cached.access_expires_at,
      refresh_token_expires_at: cached.refresh_expires_at,
    };
    return { ...this.receipt(cached, idempotent), tokens };
  }

  private async sessionEvidence(
    client: PoolClient,
    session: Pick<SessionRow, "id" | "user_id" | "origin_tenant_id"> & {
      readonly session_version: number;
    },
    action: SessionEvidenceAction,
    command: SessionCommand,
    nextActions: readonly string[],
    occurredAt: string,
  ): Promise<CachedSessionMutation> {
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const outboxId = parsePrefixedId(this.ids.next("evt"), "evt");
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    await client.query(
      `
        INSERT INTO audit_event (
          id, correlation_id, tenant_id, actor_kind, actor_user_id, action, outcome,
          reason_code, target_type, target_id, metadata, occurred_at
        ) VALUES (
          $1, $2, $3, 'user', $4, $5, 'success', 'MUTATION_COMMITTED',
          'session', $6, jsonb_build_object('entity_version', $7::bigint), $8
        )
      `,
      [
        auditId,
        command.correlationId,
        session.origin_tenant_id,
        session.user_id,
        action,
        session.id,
        session.session_version,
        occurredAt,
      ],
    );
    await client.query(
      `
        INSERT INTO outbox_event (
          id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
          aggregate_id, payload, dedupe_key, occurred_at, available_at
        ) VALUES (
          $1, $2, $3, $4, 1, 'session', $5,
          jsonb_build_object('entity_version', $6::bigint), $7, $8, $8
        )
      `,
      [
        outboxId,
        session.origin_tenant_id,
        command.correlationId,
        action,
        session.id,
        session.session_version,
        `${action}:${session.id}:${session.session_version}`,
        occurredAt,
      ],
    );
    return {
      kind: "mutation",
      session_id: session.id,
      actor_user_id: session.user_id,
      entity_version: session.session_version,
      receipt_id: receiptId,
      audit_event_id: auditId,
      timestamp: occurredAt,
      next_actions: nextActions,
    };
  }

  async authenticate(accessToken: string): Promise<AuthenticatedSession | null> {
    const digest = credentialDigest(accessToken);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<SessionRow>(
        `
          SELECT
            id, user_id, origin_tenant_id, access_token_digest, refresh_token_digest,
            session_version, active_tenant_id, active_workspace_id, access_expires_at,
            refresh_expires_at, revoked_at
          FROM app_session
          WHERE access_token_digest = $1
          FOR SHARE
        `,
        [digest],
      );
      const row = result.rows[0] ?? null;
      if (!this.sessionIsUsable(row, this.clock.now())) return null;
      return {
        id: parseSessionId(row.id),
        userId: parseUserId(row.user_id),
        version: aggregateVersion(row.session_version),
        expiresAt: timestamp(row.access_expires_at),
        activeWorkspaceId: row.active_workspace_id
          ? parseWorkspaceId(row.active_workspace_id)
          : null,
        credentialFingerprint: digest,
      };
    });
  }

  async exchange(body: SessionExchangeBody, command: SessionCommand): Promise<SessionTokenOutcome> {
    const credentialScope = commandFingerprint({
      authorizationCode: credentialDigest(body.authorization_code),
      state: credentialDigest(body.state),
    });
    const requestHash = commandFingerprint({
      action: "session.exchange",
      expectedVersion: body.expected_version,
      authorizationCode: credentialDigest(body.authorization_code),
      codeVerifier: credentialDigest(body.code_verifier),
      redirectUri: body.redirect_uri,
      state: credentialDigest(body.state),
    });

    const replay = await this.unitOfWork.run(() =>
      this.loadCredentialReplay(
        this.unitOfWork.currentClient(),
        credentialScope,
        command.idempotencyKey,
        requestHash,
      ),
    );
    if (replay) return this.tokenOutcome(replay, true);

    const identity = await this.oidc.exchange(body);
    if (!identity) throw forbidden();

    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const concurrentReplay = await this.loadCredentialReplay(
        client,
        credentialScope,
        command.idempotencyKey,
        requestHash,
      );
      if (concurrentReplay) return this.tokenOutcome(concurrentReplay, true);

      const principal = await client.query<{
        user_id: string;
        tenant_id: string;
        primary_email: string | null;
      }>(
        `
          SELECT link.user_id, membership.tenant_id, app_user.primary_email
          FROM identity_link AS link
          JOIN app_user ON app_user.id = link.user_id
          JOIN membership
            ON membership.user_id = link.user_id
           AND membership.state = 'active'
          WHERE link.issuer = $1 AND link.subject = $2
          ORDER BY membership.created_at, membership.id
          LIMIT 1
          FOR SHARE OF link, app_user, membership
        `,
        [identity.issuer, identity.subject],
      );
      const actor = principal.rows[0];
      if (!actor) throw forbidden();
      if (
        !actor.primary_email ||
        actor.primary_email.trim().toLowerCase() !== identity.verifiedEmail
      ) {
        throw forbidden();
      }

      await this.oidc.consume(identity);

      await client.query(
        `
          UPDATE identity_link
          SET last_authenticated_at = $3
          WHERE issuer = $1 AND subject = $2
        `,
        [identity.issuer, identity.subject, this.clock.now().toISOString()],
      );
      await client.query(
        `
          UPDATE app_user
          SET email_verified = true, updated_at = GREATEST(updated_at, $2::timestamptz)
          WHERE id = $1
        `,
        [actor.user_id, this.clock.now().toISOString()],
      );

      /**
       * A single reachable workspace is not a choice.
       *
       * The exchange left the active context null and always answered
       * `select_workspace`, so every sign-in landed on a chooser -- even for a
       * platform operator or an organization member who has exactly one
       * workspace and no decision to make. `/app`'s contract already says one
       * reachable workspace enters it; this is the server half of that. Two or
       * more still resolve to null, because then the choice is real.
       */
      const reachable = await client.query<{ tenant_id: string; workspace_id: string }>(
        `
          SELECT membership.tenant_id, membership.workspace_id
          FROM membership
          JOIN workspace ON workspace.id = membership.workspace_id
          WHERE membership.user_id = $1 AND membership.state = 'active'
          LIMIT 2
        `,
        [actor.user_id],
      );
      const onlyWorkspace = reachable.rowCount === 1 ? reachable.rows[0] : null;

      const sessionId = parseSessionId(this.ids.next("ses"));
      const version = 1;
      const issued = this.credentials.issue(sessionId, version);
      const issuedAt = this.clock.now();
      const accessExpiresAt = new Date(issuedAt.getTime() + 15 * 60_000).toISOString();
      const refreshExpiresAt = new Date(issuedAt.getTime() + 14 * 24 * 60 * 60_000).toISOString();
      await client.query(
        `
          INSERT INTO app_session (
            id, user_id, origin_tenant_id, token_family_id, access_token_digest,
            refresh_token_digest, session_version, active_tenant_id, active_workspace_id,
            issued_at, access_expires_at, refresh_expires_at, last_used_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $11, $12, $8, $9, $10, $8)
        `,
        [
          sessionId,
          actor.user_id,
          actor.tenant_id,
          `family_${commandFingerprint({ sessionId, userId: actor.user_id })}`,
          credentialDigest(issued.accessToken),
          credentialDigest(issued.refreshToken),
          version,
          issuedAt.toISOString(),
          accessExpiresAt,
          refreshExpiresAt,
          onlyWorkspace?.tenant_id ?? null,
          onlyWorkspace?.workspace_id ?? null,
        ],
      );
      const evidence = await this.sessionEvidence(
        client,
        {
          id: sessionId,
          user_id: actor.user_id,
          origin_tenant_id: actor.tenant_id,
          session_version: version,
        },
        "session.exchanged",
        command,
        [onlyWorkspace ? "continue" : "select_workspace"],
        issuedAt.toISOString(),
      );
      const cached = {
        ...evidence,
        kind: "tokens" as const,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
      };
      await this.storeCredentialReplay(
        client,
        credentialScope,
        command,
        requestHash,
        cached,
        refreshExpiresAt,
      );
      return this.tokenOutcome(cached, false);
    });
  }

  async refresh(body: SessionRefreshBody, command: SessionCommand): Promise<SessionTokenOutcome> {
    const refreshDigest = credentialDigest(body.refresh_token);
    const requestHash = commandFingerprint({
      action: "session.refresh",
      expectedVersion: body.expected_version,
      refreshDigest,
      reason: body.reason,
      stepUpDigest: body.step_up_token ? credentialDigest(body.step_up_token) : null,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const replay = await this.loadCredentialReplay(
        client,
        refreshDigest,
        command.idempotencyKey,
        requestHash,
      );
      if (replay) return this.tokenOutcome(replay, true);

      const result = await client.query<SessionRow>(
        `
          SELECT
            id, user_id, origin_tenant_id, access_token_digest, refresh_token_digest,
            session_version, active_tenant_id, active_workspace_id, access_expires_at,
            refresh_expires_at, revoked_at
          FROM app_session
          WHERE refresh_token_digest = $1
          FOR UPDATE
        `,
        [refreshDigest],
      );
      const current = result.rows[0];
      const now = this.clock.now();
      if (
        !current ||
        current.revoked_at !== null ||
        current.refresh_expires_at.getTime() <= now.getTime()
      ) {
        const concurrentReplay = await this.loadCredentialReplay(
          client,
          refreshDigest,
          command.idempotencyKey,
          requestHash,
        );
        if (concurrentReplay) return this.tokenOutcome(concurrentReplay, true);
        throw forbidden();
      }
      const currentVersion = aggregateVersion(current.session_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);

      const version = currentVersion + 1;
      const issued = this.credentials.issue(parseSessionId(current.id), version);
      const accessExpiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
      const refreshExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
      await client.query(
        `
          UPDATE app_session
          SET
            access_token_digest = $2,
            refresh_token_digest = $3,
            session_version = $4,
            access_expires_at = $5,
            refresh_expires_at = $6,
            last_used_at = $7
          WHERE id = $1
        `,
        [
          current.id,
          credentialDigest(issued.accessToken),
          credentialDigest(issued.refreshToken),
          version,
          accessExpiresAt,
          refreshExpiresAt,
          now.toISOString(),
        ],
      );
      const evidence = await this.sessionEvidence(
        client,
        { ...current, session_version: version },
        "session.refreshed",
        command,
        ["continue"],
        now.toISOString(),
      );
      const cached = {
        ...evidence,
        kind: "tokens" as const,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
      };
      await this.storeCredentialReplay(
        client,
        refreshDigest,
        command,
        requestHash,
        cached,
        refreshExpiresAt,
      );
      return this.tokenOutcome(cached, false);
    });
  }

  async refreshBrowser(
    refreshToken: string,
    command: SessionCommand,
  ): Promise<SessionTokenOutcome> {
    const refreshDigest = credentialDigest(refreshToken);
    const requestHash = commandFingerprint({
      action: "session.browser-refresh",
      refreshDigest,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const replay = await this.loadCredentialReplay(
        client,
        refreshDigest,
        command.idempotencyKey,
        requestHash,
      );
      if (replay) return this.tokenOutcome(replay, true);

      const result = await client.query<SessionRow>(
        `
          SELECT
            id, user_id, origin_tenant_id, access_token_digest, refresh_token_digest,
            session_version, active_tenant_id, active_workspace_id, access_expires_at,
            refresh_expires_at, revoked_at
          FROM app_session
          WHERE refresh_token_digest = $1
          FOR UPDATE
        `,
        [refreshDigest],
      );
      const current = result.rows[0];
      const now = this.clock.now();
      if (
        !current ||
        current.revoked_at !== null ||
        current.refresh_expires_at.getTime() <= now.getTime()
      ) {
        const concurrentReplay = await this.loadCredentialReplay(
          client,
          refreshDigest,
          command.idempotencyKey,
          requestHash,
        );
        if (concurrentReplay) return this.tokenOutcome(concurrentReplay, true);
        throw forbidden();
      }

      const version = aggregateVersion(current.session_version) + 1;
      const issued = this.credentials.issue(parseSessionId(current.id), version);
      const accessExpiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
      const refreshExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
      await client.query(
        `
          UPDATE app_session
          SET
            access_token_digest = $2,
            refresh_token_digest = $3,
            session_version = $4,
            access_expires_at = $5,
            refresh_expires_at = $6,
            last_used_at = $7
          WHERE id = $1
        `,
        [
          current.id,
          credentialDigest(issued.accessToken),
          credentialDigest(issued.refreshToken),
          version,
          accessExpiresAt,
          refreshExpiresAt,
          now.toISOString(),
        ],
      );
      const evidence = await this.sessionEvidence(
        client,
        { ...current, session_version: version },
        "session.refreshed",
        command,
        ["continue"],
        now.toISOString(),
      );
      const cached = {
        ...evidence,
        kind: "tokens" as const,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
      };
      await this.storeCredentialReplay(
        client,
        refreshDigest,
        command,
        requestHash,
        cached,
        refreshExpiresAt,
      );
      return this.tokenOutcome(cached, false);
    });
  }

  async revoke(
    accessToken: string,
    body: SessionRevokeBody,
    command: SessionCommand,
  ): Promise<SessionRevokeOutcome> {
    const accessDigest = credentialDigest(accessToken);
    const requestHash = commandFingerprint({
      action: "session.revoke",
      accessDigest,
      body: {
        ...body,
        step_up_token: body.step_up_token ? credentialDigest(body.step_up_token) : undefined,
      },
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const replay = await this.loadCredentialReplay(
        client,
        accessDigest,
        command.idempotencyKey,
        requestHash,
      );
      if (replay) {
        return {
          ...this.receipt<"signed_out">(replay, true),
          actorUserId: parseUserId(replay.actor_user_id),
        };
      }

      const result = await client.query<SessionRow>(
        `
          SELECT
            id, user_id, origin_tenant_id, access_token_digest, refresh_token_digest,
            session_version, active_tenant_id, active_workspace_id, access_expires_at,
            refresh_expires_at, revoked_at
          FROM app_session
          WHERE access_token_digest = $1
          FOR UPDATE
        `,
        [accessDigest],
      );
      const current = result.rows[0];
      if (!current || current.revoked_at !== null) {
        const concurrentReplay = await this.loadCredentialReplay(
          client,
          accessDigest,
          command.idempotencyKey,
          requestHash,
        );
        if (concurrentReplay) {
          return {
            ...this.receipt<"signed_out">(concurrentReplay, true),
            actorUserId: parseUserId(concurrentReplay.actor_user_id),
          };
        }
        throw forbidden();
      }
      if (body.session_id !== current.id) throw notFound();
      const currentVersion = aggregateVersion(current.session_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);

      const now = this.clock.now();
      const version = currentVersion + 1;
      await client.query(
        `
          UPDATE app_session
          SET session_version = $2, revoked_at = $3, revocation_reason = $4
          WHERE id = $1
        `,
        [current.id, version, now.toISOString(), body.reason ?? "user_sign_out"],
      );
      const cached = await this.sessionEvidence(
        client,
        { ...current, session_version: version },
        "session.revoked",
        command,
        ["signed_out"],
        now.toISOString(),
      );
      await this.storeCredentialReplay(
        client,
        accessDigest,
        command,
        requestHash,
        cached,
        new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      );
      return {
        ...this.receipt<"signed_out">(cached, false),
        actorUserId: parseUserId(current.user_id),
      };
    });
  }

  async getMe(session: AuthenticatedSession): Promise<MeResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const current = await this.sessionByAccess(client, session, "share");
      if (
        !this.sessionIsUsable(current, this.clock.now()) ||
        aggregateVersion(current.session_version) !== session.version
      ) {
        throw forbidden();
      }

      const userResult = await client.query<UserRow>(
        `
          SELECT id, display_name, primary_email::text, email_verified,
                 primary_phone, phone_verified
          FROM app_user
          WHERE id = $1
          FOR SHARE
        `,
        [current.user_id],
      );
      const user = userResult.rows[0];
      if (!user) return null;

      const accessResult = await client.query<AccessRow & { reachable: boolean }>(
        `
          SELECT
            m.id AS membership_id,
            m.tenant_id,
            m.workspace_id,
            m.workspace_kind,
            m.user_id,
            m.role,
            m.state,
            m.created_at AS membership_created_at,
            m.updated_at AS membership_updated_at,
            w.name AS workspace_name,
            w.owner_user_id,
            w.team_kind,
            (
              m.state = 'active'
              AND (
                w.kind <> 'team'
                OR EXISTS (
                  SELECT 1
                  FROM team_workspace AS team
                  WHERE team.tenant_id = w.tenant_id
                    AND team.workspace_id = w.id
                    AND team.status = 'active'
                )
              )
            ) AS reachable
          FROM membership AS m
          JOIN workspace AS w
            ON w.id = m.workspace_id
           AND w.tenant_id = m.tenant_id
           AND w.kind = m.workspace_kind
          WHERE m.user_id = $1
          ORDER BY m.created_at, m.id
          FOR SHARE OF m, w
        `,
        [current.user_id],
      );
      const accesses = accessResult.rows.map((row) => ({
        access: accessFromRow(row),
        reachable: row.reachable,
      }));
      const active = current.active_workspace_id
        ? await this.activeAccess(client, parseUserId(current.user_id), current.active_workspace_id)
        : null;
      return {
        user: {
          id: parseUserId(user.id),
          display_name: user.display_name,
          primary_email: user.primary_email,
          email_verified: user.email_verified,
          primary_phone: user.primary_phone,
          phone_verified: user.phone_verified,
        },
        // A membership stays listed whatever its state -- a removed one is a
        // true fact about this person, and its `state` is what says so. A
        // workspace does not: this list is the set a human can actually enter,
        // and the application chrome builds the switcher and «تیم‌های من» from
        // it. Listing a workspace they have left, been removed from, been
        // suspended in, or whose team is archived offered a door that the
        // authority check then refuses -- the same reachability rule
        // `activeAccess` enforces, so the two now answer alike.
        memberships: accesses.map(({ access }) => membershipResource(access.membership)),
        workspaces: accesses
          .filter(({ reachable }) => reachable)
          .map(({ access }) => workspaceResource(access.workspace)),
        active_context: active
          ? {
              tenant_id: active.tenantId,
              workspace_id: active.workspaceId,
              workspace_kind: active.workspace.kind,
            }
          : null,
      };
    });
  }

  async findActive(userId: UserId, workspaceId: string): Promise<WorkspaceAccess | null> {
    return this.unitOfWork.run(() =>
      this.activeAccess(this.unitOfWork.currentClient(), userId, workspaceId),
    );
  }

  /**
   * Resolution primitive only — private, and takes the caller's `client` so
   * platform authority can never be resolved outside the unit of work that
   * performs the write. Resolving it in its own transaction would release the
   * `FOR SHARE` locks before the mutation ran, reopening the revocation race.
   */
  private async activePlatformAccess(
    client: PoolClient,
    userId: UserId,
    roles: readonly WorkspaceRole[],
    targetWorkspaceId: string,
  ): Promise<WorkspaceAccess | null> {
    if (roles.length === 0) return null;
    {
      const platformResult = await client.query<AccessRow>(
        `
          SELECT
            m.id AS membership_id,
            m.tenant_id,
            m.workspace_id,
            m.workspace_kind,
            m.user_id,
            m.role,
            m.state,
            m.created_at AS membership_created_at,
            m.updated_at AS membership_updated_at,
            w.name AS workspace_name,
            w.owner_user_id,
            w.team_kind
          FROM membership AS m
          JOIN workspace AS w
            ON w.id = m.workspace_id
           AND w.tenant_id = m.tenant_id
           AND w.kind = m.workspace_kind
          WHERE m.user_id = $1
            AND m.workspace_kind = 'platform'
            AND m.role = ANY($2::text[])
            AND m.state = 'active'
          FOR SHARE OF m, w
        `,
        [userId, roles],
      );
      const platformRow = platformResult.rows[0];
      if (!platformRow) return null;
      if (!isWorkspaceRole(platformRow.role)) throw new Error("Unknown workspace role in database");
      if (!isMembershipState(platformRow.state)) {
        throw new Error("Unknown membership state in database");
      }

      const targetResult = await client.query<WorkspaceRow>(
        `
          SELECT
            id AS workspace_id,
            tenant_id,
            kind AS workspace_kind,
            name AS workspace_name,
            owner_user_id,
            team_kind
          FROM workspace
          WHERE id = $1
          FOR SHARE
        `,
        [targetWorkspaceId],
      );
      const targetRow = targetResult.rows[0];
      if (!targetRow) return null;
      const target = workspaceFromRow(targetRow);

      const membership: Membership = {
        id: parseMembershipId(platformRow.membership_id),
        tenantId: parseTenantId(platformRow.tenant_id),
        workspaceId: parseWorkspaceId(platformRow.workspace_id),
        userId: parseUserId(platformRow.user_id),
        role: platformRow.role,
        state: platformRow.state,
        createdAt: timestamp(platformRow.membership_created_at),
        updatedAt: timestamp(platformRow.membership_updated_at),
      };
      return {
        tenantId: target.tenantId,
        workspaceId: target.id,
        role: platformRow.role,
        workspace: target,
        membership,
      };
    }
  }

  async switchContext(
    session: AuthenticatedSession,
    targetWorkspaceId: string,
    expectedVersion: number,
    command: SessionCommand,
  ): Promise<MutationOutcome<SessionId, "continue">> {
    try {
      return await this.unitOfWork.run(async () => {
        const client = this.unitOfWork.currentClient();
        const current = await this.sessionByAccess(client, session, "update");
        if (!this.sessionIsUsable(current, this.clock.now())) {
          throw new TransactionDenial("session_not_current");
        }
        const target = await this.activeAccess(client, session.userId, targetWorkspaceId);
        if (!target) throw new TransactionDenial("workspace_unreachable");

        const requestHash = commandFingerprint({
          action: "session.context.switch",
          sessionId: session.id,
          targetWorkspaceId,
          expectedVersion,
        });
        const replay = await this.loadCredentialReplay(
          client,
          session.credentialFingerprint,
          command.idempotencyKey,
          requestHash,
        );
        if (replay) return this.receipt<"continue">(replay, true);

        const currentVersion = aggregateVersion(current.session_version);
        if (currentVersion !== session.version) {
          throw new TransactionDenial("session_not_current");
        }
        if (expectedVersion !== currentVersion) throw staleVersion(currentVersion);
        const version = currentVersion + 1;
        const now = this.clock.now();
        await client.query(
          `
            UPDATE app_session
            SET
              session_version = $2,
              active_tenant_id = $3,
              active_workspace_id = $4,
              last_used_at = $5
            WHERE id = $1
          `,
          [current.id, version, target.tenantId, target.workspaceId, now.toISOString()],
        );
        await this.decisionAudit.record({
          outcome: "success",
          actorUserId: session.userId,
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
          action: "workspace.context.switch",
          correlationId: command.correlationId,
          occurredAt: now.toISOString(),
        });
        const cached = await this.sessionEvidence(
          client,
          { ...current, session_version: version },
          "session.context.switched",
          command,
          ["continue"],
          now.toISOString(),
        );
        await this.storeCredentialReplay(
          client,
          session.credentialFingerprint,
          command,
          requestHash,
          cached,
          new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
        );
        return this.receipt<"continue">(cached, false);
      });
    } catch (error) {
      if (!(error instanceof TransactionDenial)) throw error;
      await this.decisionAudit.record({
        outcome: "denied",
        actorUserId: session.userId,
        workspaceId: targetWorkspaceId,
        action: "workspace.context.switch",
        reason: error.kind,
        correlationId: command.correlationId,
        occurredAt: this.clock.now().toISOString(),
      });
      if (error.kind === "session_not_current") throw forbidden();
      throw notFound();
    }
  }

  async runAuthorizedWorkspace<Result>(
    session: AuthenticatedSession,
    workspaceId: string,
    authorization: WorkspaceAuthorization,
    operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  ): Promise<Result> {
    let authorizedAccess: WorkspaceAccess | undefined;
    try {
      return await this.unitOfWork.run(async () => {
        const client = this.unitOfWork.currentClient();
        const current = await this.sessionByAccess(client, session, "share");
        if (
          !this.sessionIsUsable(current, this.clock.now()) ||
          aggregateVersion(current.session_version) !== session.version
        ) {
          throw new TransactionDenial("session_not_current");
        }
        if (current.active_workspace_id !== workspaceId) {
          throw new TransactionDenial("workspace_context_mismatch");
        }
        const access = await this.activeAccess(client, session.userId, workspaceId);
        if (!access) throw new TransactionDenial("workspace_unreachable");
        if (authorization.allows && !authorization.allows(access)) {
          throw new TransactionDenial("role_capability_denied", access);
        }
        authorizedAccess = access;
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
    } catch (error) {
      if (!(error instanceof TransactionDenial)) {
        // The deferred authorization decision is recorded outside the rolled-back
        // operation: 403/404 is a denial, while later validation/conflict failures
        // still mean that authorization itself succeeded.
        if (authorization.deferSuccess && authorizedAccess && error instanceof ApiProblem) {
          const denied = error.statusCode === 404 || error.statusCode === 403;
          await this.decisionAudit.record({
            outcome: denied ? "denied" : "success",
            actorUserId: session.userId,
            tenantId: authorizedAccess.tenantId,
            workspaceId: authorizedAccess.workspaceId,
            action: authorization.action,
            entityType: authorization.entityType,
            entityId: authorization.entityId,
            ...(denied
              ? {
                  reason:
                    error.options.auditReason ??
                    (error.statusCode === 404 ? "record_unreachable" : "command_denied"),
                }
              : {}),
            correlationId: authorization.correlationId,
            occurredAt: this.clock.now().toISOString(),
          });
        }
        throw error;
      }
      await this.decisionAudit.record({
        outcome: "denied",
        actorUserId: session.userId,
        tenantId: error.access?.tenantId,
        workspaceId: error.access?.workspaceId ?? workspaceId,
        action: authorization.action,
        entityType: authorization.entityType,
        entityId: authorization.entityId,
        reason: error.kind,
        correlationId: authorization.correlationId,
        occurredAt: this.clock.now().toISOString(),
      });
      if (error.kind === "session_not_current" || error.kind === "role_capability_denied") {
        throw forbidden();
      }
      throw notFound();
    }
  }

  async runAuthorizedPlatformRole<Result>(
    session: AuthenticatedSession,
    roles: readonly WorkspaceRole[],
    targetWorkspaceId: string,
    authorization: WorkspaceAuthorization,
    operation: (access: WorkspaceAccess) => Result | Promise<Result>,
  ): Promise<Result> {
    let authorizedAccess: WorkspaceAccess | undefined;
    try {
      return await this.unitOfWork.run(async () => {
        const client = this.unitOfWork.currentClient();
        // Revalidated inside the transaction, not from the request-time
        // snapshot: a session revoked after authentication must deny here.
        const current = await this.sessionByAccess(client, session, "share");
        if (
          !this.sessionIsUsable(current, this.clock.now()) ||
          aggregateVersion(current.session_version) !== session.version
        ) {
          throw new TransactionDenial("session_not_current");
        }
        // Deliberately no active_workspace_id check: the whole point is that
        // the actor's active context is their platform workspace, never the
        // org workspace they are acting on.
        const access = await this.activePlatformAccess(
          client,
          session.userId,
          roles,
          targetWorkspaceId,
        );
        if (!access) throw new TransactionDenial("workspace_unreachable");
        if (authorization.allows && !authorization.allows(access)) {
          throw new TransactionDenial("role_capability_denied", access);
        }
        authorizedAccess = access;
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
    } catch (error) {
      if (!(error instanceof TransactionDenial)) {
        // The deferred authorization decision is recorded outside the rolled-back
        // operation: 403/404 is a denial, while later validation/conflict failures
        // still mean that authorization itself succeeded.
        if (authorization.deferSuccess && authorizedAccess && error instanceof ApiProblem) {
          const denied = error.statusCode === 404 || error.statusCode === 403;
          await this.decisionAudit.record({
            outcome: denied ? "denied" : "success",
            actorUserId: session.userId,
            tenantId: authorizedAccess.tenantId,
            workspaceId: authorizedAccess.workspaceId,
            action: authorization.action,
            entityType: authorization.entityType,
            entityId: authorization.entityId,
            ...(denied
              ? {
                  reason:
                    error.options.auditReason ??
                    (error.statusCode === 404 ? "record_unreachable" : "command_denied"),
                }
              : {}),
            correlationId: authorization.correlationId,
            occurredAt: this.clock.now().toISOString(),
          });
        }
        throw error;
      }
      await this.decisionAudit.record({
        outcome: "denied",
        actorUserId: session.userId,
        tenantId: error.access?.tenantId,
        workspaceId: error.access?.workspaceId ?? targetWorkspaceId,
        action: authorization.action,
        entityType: authorization.entityType,
        entityId: authorization.entityId,
        reason:
          error.kind === "workspace_unreachable" ? "platform_authority_unreachable" : error.kind,
        correlationId: authorization.correlationId,
        occurredAt: this.clock.now().toISOString(),
      });
      if (error.kind === "session_not_current" || error.kind === "role_capability_denied") {
        throw forbidden();
      }
      throw notFound();
    }
  }
}
