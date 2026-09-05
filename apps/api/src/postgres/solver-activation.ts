import type {
  ActivateSolverBody,
  ContactSessionExchangeBody,
  SessionTokenSet,
  SolverActivationNextAction,
  SolverActivationResource,
} from "@rahhal/contracts";
import {
  parseAuditEventId,
  parseMembershipId,
  parsePrefixedId,
  parseReceiptId,
  parseSessionId,
  parseSolverActivationId,
  parseTenantId,
  parseUserId,
  parseVerificationId,
  parseWorkspaceId,
  type SessionId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import type {
  Clock,
  ContactVerificationProviderPort,
  IdFactory,
  SessionCommand,
  SessionCredentialIssuerPort,
  SessionTokenOutcome,
  SolverActivationOutcome,
  SolverActivationPort,
  VerifiedContactAssertion,
} from "../ports.js";
import { credentialDigest } from "./identity-workspace.js";
import type { PostgresUnitOfWork } from "./unit-of-work.js";

type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

type CachedSession = {
  readonly kind: "contact_session";
  readonly session_id: string;
  readonly entity_version: number;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly ["select_workspace"];
  readonly access_expires_at: string;
  readonly refresh_expires_at: string;
};

type CachedActivation = {
  readonly kind: "solver_activation";
  readonly activation: SolverActivationResource;
  readonly session_id: string;
  readonly entity_version: 1;
  readonly receipt_id: string;
  readonly audit_event_id: string;
  readonly timestamp: string;
  readonly next_actions: readonly SolverActivationNextAction[];
  readonly access_expires_at: string;
  readonly refresh_expires_at: string;
};

type CachedOutcome = CachedSession | CachedActivation;

type ActivationRow = {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly individual_workspace_id: string;
  readonly start_intent: "individual" | "team";
  readonly lock_version: string;
  readonly activated_at: Date;
};

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function activationResource(row: ActivationRow): SolverActivationResource {
  if (Number(row.lock_version) !== 1)
    throw new Error("Database returned invalid activation version");
  return {
    id: parseSolverActivationId(row.id),
    user_id: parseUserId(row.user_id),
    tenant_id: parseTenantId(row.tenant_id),
    individual_workspace_id: parseWorkspaceId(row.individual_workspace_id),
    start_intent: row.start_intent,
    version: 1,
    activated_at: timestamp(row.activated_at),
  };
}

function cachedOutcome(value: unknown): CachedOutcome {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Database returned invalid activation idempotency data");
  }
  const record = value as Record<string, unknown>;
  if (
    (record["kind"] !== "contact_session" && record["kind"] !== "solver_activation") ||
    typeof record["session_id"] !== "string" ||
    record["entity_version"] !== 1 ||
    typeof record["receipt_id"] !== "string" ||
    typeof record["audit_event_id"] !== "string" ||
    typeof record["timestamp"] !== "string" ||
    typeof record["access_expires_at"] !== "string" ||
    typeof record["refresh_expires_at"] !== "string" ||
    !Array.isArray(record["next_actions"])
  ) {
    throw new Error("Database returned invalid activation idempotency data");
  }
  return record as unknown as CachedOutcome;
}

export class PostgresSolverActivationAdapter implements SolverActivationPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly provider: ContactVerificationProviderPort,
    private readonly credentials: SessionCredentialIssuerPort,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private tokens(cached: CachedOutcome): SessionTokenSet {
    const sessionId = parseSessionId(cached.session_id);
    const issued = this.credentials.issue(sessionId, 1);
    return {
      session_id: sessionId,
      access_token: issued.accessToken,
      refresh_token: issued.refreshToken,
      token_type: "Bearer",
      access_token_expires_at: cached.access_expires_at,
      refresh_token_expires_at: cached.refresh_expires_at,
    };
  }

  private sessionReceipt(cached: CachedSession, idempotent: boolean): SessionTokenOutcome {
    return {
      tokens: this.tokens(cached),
      entityVersion: 1,
      receipt: {
        entity_id: parseSessionId(cached.session_id),
        receipt_id: parseReceiptId(cached.receipt_id),
        audit_event_id: parseAuditEventId(cached.audit_event_id),
        timestamp: cached.timestamp,
        idempotent,
        next_actions: cached.next_actions,
      },
    };
  }

  private activationOutcome(
    cached: CachedActivation,
    idempotent: boolean,
  ): SolverActivationOutcome {
    return {
      activation: cached.activation,
      tokens: this.tokens(cached),
      entityVersion: 1,
      receipt: {
        entity_id: cached.activation.id,
        receipt_id: parseReceiptId(cached.receipt_id),
        audit_event_id: parseAuditEventId(cached.audit_event_id),
        timestamp: cached.timestamp,
        idempotent,
        next_actions: cached.next_actions,
      },
    };
  }

  private async loadReplay(
    client: PoolClient,
    credentialFingerprint: string,
    command: SessionCommand,
    requestHash: string,
  ): Promise<CachedOutcome | null> {
    const result = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, response_body
       FROM idempotency_key
       WHERE scope_kind = 'credential' AND tenant_id IS NULL
         AND credential_fingerprint = $1 AND idempotency_key = $2
         AND expires_at > $3
       FOR UPDATE`,
      [credentialFingerprint, command.idempotencyKey, this.clock.now().toISOString()],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    if (row.status !== "completed") throw new Error("Activation idempotency record is incomplete");
    return cachedOutcome(row.response_body);
  }

  private async storeReplay(
    client: PoolClient,
    credentialFingerprint: string,
    command: SessionCommand,
    requestHash: string,
    cached: CachedOutcome,
  ): Promise<void> {
    await client.query(
      `INSERT INTO idempotency_key (
         id, scope_kind, tenant_id, credential_fingerprint, idempotency_key,
         request_hash, status, response_status, response_body, created_at, expires_at
       ) VALUES ($1,'credential',NULL,$2,$3,$4,'completed',200,$5::jsonb,$6,$7)`,
      [
        `idk_${commandFingerprint({ credentialFingerprint, key: command.idempotencyKey })}`,
        credentialFingerprint,
        command.idempotencyKey,
        requestHash,
        JSON.stringify(cached),
        cached.timestamp,
        cached.refresh_expires_at,
      ],
    );
  }

  private async assertion(token: string): Promise<VerifiedContactAssertion> {
    const assertion = await this.provider.assertion(token);
    if (!assertion) throw forbidden();
    return assertion;
  }

  private async lockAssertion(
    client: PoolClient,
    assertion: VerifiedContactAssertion,
  ): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      commandFingerprint({ issuer: assertion.issuer, subject: assertion.subject }),
    ]);
  }

  private async requireUnused(
    client: PoolClient,
    assertion: VerifiedContactAssertion,
  ): Promise<void> {
    const consumed = await client.query(
      `SELECT 1 FROM contact_verification_consumption
       WHERE provider_issuer = $1 AND assertion_id = $2`,
      [assertion.issuer, assertion.assertionId],
    );
    if (consumed.rowCount !== 0) throw forbidden();
  }

  private issuedSession(sessionId: SessionId) {
    const issuedAt = this.clock.now();
    return {
      issuedAt: issuedAt.toISOString(),
      accessExpiresAt: new Date(issuedAt.getTime() + 15 * 60_000).toISOString(),
      refreshExpiresAt: new Date(issuedAt.getTime() + 14 * 24 * 60 * 60_000).toISOString(),
      credentials: this.credentials.issue(sessionId, 1),
    };
  }

  private async insertSession(
    client: PoolClient,
    values: {
      readonly sessionId: SessionId;
      readonly userId: string;
      readonly tenantId: string;
      readonly activeWorkspaceId: string | null;
      readonly issuedAt: string;
      readonly accessExpiresAt: string;
      readonly refreshExpiresAt: string;
      readonly accessToken: string;
      readonly refreshToken: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO app_session (
         id, user_id, origin_tenant_id, token_family_id, access_token_digest,
         refresh_token_digest, session_version, active_tenant_id, active_workspace_id,
         issued_at, access_expires_at, refresh_expires_at, last_used_at
       ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$9)`,
      [
        values.sessionId,
        values.userId,
        values.tenantId,
        `family_${commandFingerprint({ sessionId: values.sessionId, userId: values.userId })}`,
        credentialDigest(values.accessToken),
        credentialDigest(values.refreshToken),
        values.activeWorkspaceId ? values.tenantId : null,
        values.activeWorkspaceId,
        values.issuedAt,
        values.accessExpiresAt,
        values.refreshExpiresAt,
      ],
    );
  }

  private async consumeAssertion(
    client: PoolClient,
    assertion: VerifiedContactAssertion,
    userId: string,
    sessionId: SessionId,
    consumedAt: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO contact_verification_consumption (
         provider_issuer, assertion_id, provider_subject, user_id, session_id, consumed_at
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [assertion.issuer, assertion.assertionId, assertion.subject, userId, sessionId, consumedAt],
    );
  }

  async exchangeContact(
    body: ContactSessionExchangeBody,
    command: SessionCommand,
  ): Promise<SessionTokenOutcome> {
    const credentialFingerprint = credentialDigest(body.verification_token);
    const requestHash = commandFingerprint({
      action: "contact.session.exchanged",
      expectedVersion: body.expected_version,
      assertion: credentialFingerprint,
    });
    const firstReplay = await this.unitOfWork.run(() =>
      this.loadReplay(this.unitOfWork.currentClient(), credentialFingerprint, command, requestHash),
    );
    if (firstReplay) {
      if (firstReplay.kind !== "contact_session") throw idempotencyConflict();
      return this.sessionReceipt(firstReplay, true);
    }
    const assertion = await this.assertion(body.verification_token);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockAssertion(client, assertion);
      const replay = await this.loadReplay(client, credentialFingerprint, command, requestHash);
      if (replay) {
        if (replay.kind !== "contact_session") throw idempotencyConflict();
        return this.sessionReceipt(replay, true);
      }
      await this.requireUnused(client, assertion);
      const principal = await client.query<{
        user_id: string;
        tenant_id: string;
        individual_workspace_id: string;
      }>(
        `SELECT link.user_id, activation.tenant_id, activation.individual_workspace_id
         FROM identity_link AS link
         JOIN solver_activation AS activation ON activation.user_id = link.user_id
         WHERE link.issuer = $1 AND link.subject = $2
         FOR SHARE OF link, activation`,
        [assertion.issuer, assertion.subject],
      );
      const actor = principal.rows[0];
      if (!actor) {
        throw new ApiProblem(409, "ACTIVATION_REQUIRED", "Solver activation is required", {
          currentState: "verified",
          recovery: "activate_solver",
        });
      }
      const sessionId = parseSessionId(this.ids.next("ses"));
      const session = this.issuedSession(sessionId);
      await this.insertSession(client, {
        sessionId,
        userId: actor.user_id,
        tenantId: actor.tenant_id,
        // A returning solver enters the permanent individual workspace the
        // activation created, exactly as a first activation does. Leaving the
        // context null produced a signed-in session no workspace-scoped read
        // could use: `/app` showed a chooser for the one workspace it had, and
        // every connected page fell back to its anonymous state. Switching
        // afterwards remains a normal command.
        activeWorkspaceId: actor.individual_workspace_id,
        issuedAt: session.issuedAt,
        accessExpiresAt: session.accessExpiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
        accessToken: session.credentials.accessToken,
        refreshToken: session.credentials.refreshToken,
      });
      await this.consumeAssertion(client, assertion, actor.user_id, sessionId, session.issuedAt);
      const auditId = parseAuditEventId(this.ids.next("aud"));
      const receiptId = parseReceiptId(this.ids.next("rcp"));
      const eventId = parsePrefixedId(this.ids.next("evt"), "evt");
      await client.query(
        `INSERT INTO audit_event (
           id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id, action, outcome,
           reason_code, target_type, target_id, metadata, occurred_at
         ) VALUES ($1,$2,$3,$4,'user',$5,'contact.session.exchanged','success',
           'MUTATION_COMMITTED','session',$6,jsonb_build_object('entity_version',1),$7)`,
        [
          auditId,
          command.correlationId,
          actor.tenant_id,
          actor.individual_workspace_id,
          actor.user_id,
          sessionId,
          session.issuedAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_event (
           id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
           aggregate_id, payload, dedupe_key, occurred_at, available_at
         ) VALUES ($1,$2,$3,'contact.session.exchanged',1,'session',$4,
           jsonb_build_object('entity_version',1),$5,$6,$6)`,
        [
          eventId,
          actor.tenant_id,
          command.correlationId,
          sessionId,
          `contact.session.exchanged:${sessionId}:1`,
          session.issuedAt,
        ],
      );
      const cached: CachedSession = {
        kind: "contact_session",
        session_id: sessionId,
        entity_version: 1,
        receipt_id: receiptId,
        audit_event_id: auditId,
        timestamp: session.issuedAt,
        next_actions: ["select_workspace"],
        access_expires_at: session.accessExpiresAt,
        refresh_expires_at: session.refreshExpiresAt,
      };
      await client.query(
        `INSERT INTO mutation_receipt (
           id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
           audit_event_id, correlation_id, next_actions, occurred_at
         ) VALUES ($1,$2,$3,'session',$4,1,$5,$6,'["select_workspace"]'::jsonb,$7)`,
        [
          receiptId,
          actor.tenant_id,
          actor.individual_workspace_id,
          sessionId,
          auditId,
          command.correlationId,
          session.issuedAt,
        ],
      );
      await this.storeReplay(client, credentialFingerprint, command, requestHash, cached);
      return this.sessionReceipt(cached, false);
    });
  }

  async activate(
    body: ActivateSolverBody,
    command: SessionCommand,
  ): Promise<SolverActivationOutcome> {
    const displayName = body.display_name.trim();
    if (displayName.length < 1 || displayName.length > 200) {
      throw new ApiProblem(422, "VALIDATION", "The solver identity is invalid", {
        fields: [
          {
            path: "/display_name",
            code: displayName.length < 1 ? "minLength" : "maxLength",
            message: "Display name must contain 1 to 200 characters",
          },
        ],
      });
    }
    const credentialFingerprint = credentialDigest(body.verification_token);
    const requestHash = commandFingerprint({
      action: "solver.activated",
      body: { ...body, display_name: displayName, verification_token: credentialFingerprint },
    });
    const firstReplay = await this.unitOfWork.run(() =>
      this.loadReplay(this.unitOfWork.currentClient(), credentialFingerprint, command, requestHash),
    );
    if (firstReplay) {
      if (firstReplay.kind !== "solver_activation") throw idempotencyConflict();
      return this.activationOutcome(firstReplay, true);
    }
    const assertion = await this.assertion(body.verification_token);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockAssertion(client, assertion);
      const replay = await this.loadReplay(client, credentialFingerprint, command, requestHash);
      if (replay) {
        if (replay.kind !== "solver_activation") throw idempotencyConflict();
        return this.activationOutcome(replay, true);
      }
      await this.requireUnused(client, assertion);
      const existing = await client.query(
        "SELECT 1 FROM identity_link WHERE issuer = $1 AND subject = $2 FOR SHARE",
        [assertion.issuer, assertion.subject],
      );
      if (existing.rowCount !== 0) {
        throw new ApiProblem(409, "INVALID_STATE", "The solver identity is already active", {
          currentState: "activated",
          recovery: "exchange_contact_session",
        });
      }

      const userId = parseUserId(this.ids.next("usr"));
      const tenantId = parseTenantId(this.ids.next("ten"));
      const workspaceId = parseWorkspaceId(this.ids.next("wsp"));
      const membershipId = parseMembershipId(this.ids.next("mem"));
      const verificationId = parseVerificationId(this.ids.next("ver"));
      const activationId = parseSolverActivationId(this.ids.next("act"));
      const sessionId = parseSessionId(this.ids.next("ses"));
      const session = this.issuedSession(sessionId);
      const personalWorkspaceName = `فضای شخصی ${displayName}`.slice(0, 200);
      const contact =
        assertion.channel === "email"
          ? [assertion.destination, true, null, false]
          : [null, false, assertion.destination, true];
      await client.query(
        `INSERT INTO app_user (
           id, display_name, primary_email, email_verified, primary_phone,
           phone_verified, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [userId, displayName, ...contact, session.issuedAt],
      );
      await client.query(
        `INSERT INTO identity_link (
           id, user_id, issuer, subject, created_at, last_authenticated_at
         ) VALUES ($1,$2,$3,$4,$5,$5)`,
        [
          `idl_${commandFingerprint({ issuer: assertion.issuer, subject: assertion.subject })}`,
          userId,
          assertion.issuer,
          assertion.subject,
          session.issuedAt,
        ],
      );
      await client.query(
        "INSERT INTO tenant (id, kind, name, created_at) VALUES ($1,'solver',$2,$3)",
        [tenantId, displayName, session.issuedAt],
      );
      await client.query(
        `INSERT INTO workspace (
           id, tenant_id, tenant_kind, kind, name, owner_user_id, created_at, updated_at
         ) VALUES ($1,$2,'solver','individual',$3,$4,$5,$5)`,
        [workspaceId, tenantId, personalWorkspaceName, userId, session.issuedAt],
      );
      await client.query(
        `INSERT INTO membership (
           id, tenant_id, workspace_id, workspace_kind, user_id, role, state,
           lock_version, created_at, updated_at
         ) VALUES ($1,$2,$3,'individual',$4,'individual','active',1,$5,$5)`,
        [membershipId, tenantId, workspaceId, userId, session.issuedAt],
      );
      await client.query(
        `INSERT INTO solver_workspace_profile (
           workspace_id, tenant_id, workspace_kind, applicant_type,
           lock_version, created_at, updated_at
         ) VALUES ($1,$2,'individual','individual',1,$3,$3)`,
        [workspaceId, tenantId, session.issuedAt],
      );
      await client.query(
        `INSERT INTO verification_record (
           id, tenant_id, workspace_id, state, lock_version, created_at, updated_at
         ) VALUES ($1,$2,$3,'not_started',1,$4,$4)`,
        [verificationId, tenantId, workspaceId, session.issuedAt],
      );
      await client.query(
        `INSERT INTO solver_activation (
           id, user_id, tenant_id, individual_workspace_id, individual_membership_id,
           provider_issuer, provider_subject, contact_channel, start_intent,
           lock_version, activated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`,
        [
          activationId,
          userId,
          tenantId,
          workspaceId,
          membershipId,
          assertion.issuer,
          assertion.subject,
          assertion.channel,
          body.start_intent,
          session.issuedAt,
        ],
      );
      await this.insertSession(client, {
        sessionId,
        userId,
        tenantId,
        activeWorkspaceId: workspaceId,
        issuedAt: session.issuedAt,
        accessExpiresAt: session.accessExpiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
        accessToken: session.credentials.accessToken,
        refreshToken: session.credentials.refreshToken,
      });
      await this.consumeAssertion(client, assertion, userId, sessionId, session.issuedAt);

      const auditId = parseAuditEventId(this.ids.next("aud"));
      const receiptId = parseReceiptId(this.ids.next("rcp"));
      const eventId = parsePrefixedId(this.ids.next("evt"), "evt");
      const nextActions: readonly SolverActivationNextAction[] =
        body.start_intent === "team" ? ["create_team"] : ["continue_individually"];
      await client.query(
        `INSERT INTO audit_event (
           id, correlation_id, tenant_id, workspace_id, actor_kind, actor_user_id,
           action, outcome, reason_code, target_type, target_id, metadata, occurred_at
         ) VALUES ($1,$2,$3,$4,'user',$5,'solver.activated','success','MUTATION_COMMITTED',
           'solver_activation',$6,
           jsonb_build_object(
             'entity_version',1,'contact_channel',$7::text,'start_intent',$8::text
           ),$9)`,
        [
          auditId,
          command.correlationId,
          tenantId,
          workspaceId,
          userId,
          activationId,
          assertion.channel,
          body.start_intent,
          session.issuedAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_event (
           id, tenant_id, correlation_id, event_type, schema_version, aggregate_type,
           aggregate_id, payload, dedupe_key, occurred_at, available_at
         ) VALUES ($1,$2,$3,'solver.activated',1,'solver_activation',$4,
           jsonb_build_object(
             'entity_version',1,'user_id',$5::text,'workspace_id',$6::text,
             'start_intent',$7::text
           ),
           $8,$9,$9)`,
        [
          eventId,
          tenantId,
          command.correlationId,
          activationId,
          userId,
          workspaceId,
          body.start_intent,
          `solver.activated:${activationId}:1`,
          session.issuedAt,
        ],
      );
      await client.query(
        `INSERT INTO mutation_receipt (
           id, tenant_id, workspace_id, entity_type, entity_id, entity_version,
           audit_event_id, correlation_id, next_actions, occurred_at
         ) VALUES ($1,$2,$3,'solver_activation',$4,1,$5,$6,$7::jsonb,$8)`,
        [
          receiptId,
          tenantId,
          workspaceId,
          activationId,
          auditId,
          command.correlationId,
          JSON.stringify(nextActions),
          session.issuedAt,
        ],
      );
      const activation: SolverActivationResource = {
        id: activationId,
        user_id: userId,
        tenant_id: tenantId,
        individual_workspace_id: workspaceId,
        start_intent: body.start_intent,
        version: 1,
        activated_at: session.issuedAt,
      };
      const cached: CachedActivation = {
        kind: "solver_activation",
        activation,
        session_id: sessionId,
        entity_version: 1,
        receipt_id: receiptId,
        audit_event_id: auditId,
        timestamp: session.issuedAt,
        next_actions: nextActions,
        access_expires_at: session.accessExpiresAt,
        refresh_expires_at: session.refreshExpiresAt,
      };
      await this.storeReplay(client, credentialFingerprint, command, requestHash, cached);
      return this.activationOutcome(cached, false);
    });
  }

  async get(userId: import("@rahhal/domain").UserId): Promise<SolverActivationResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<ActivationRow>(
        `SELECT id, user_id, tenant_id, individual_workspace_id, start_intent,
                lock_version, activated_at
         FROM solver_activation WHERE user_id = $1 FOR SHARE`,
        [userId],
      );
      return result.rows[0] ? activationResource(result.rows[0]) : null;
    });
  }
}
