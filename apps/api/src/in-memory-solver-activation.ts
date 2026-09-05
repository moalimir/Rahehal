import type {
  ActivateSolverBody,
  ContactSessionExchangeBody,
  MutationReceipt,
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
  parseWorkspaceId,
  type Membership,
  type User,
  type Workspace,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict } from "./errors.js";
import type { InMemoryCriticalSection } from "./in-memory-critical-section.js";
import type { InMemoryIdentityAdapter } from "./in-memory-identity.js";
import type { InMemorySolverWorkspaceAdapter } from "./in-memory-solver-workspaces.js";
import { commandFingerprint } from "./primitives.js";
import type {
  Clock,
  ContactVerificationProviderPort,
  IdFactory,
  SessionCommand,
  SessionCredentialIssuerPort,
  SessionTokenOutcome,
  SolverActivationOutcome,
  SolverActivationPort,
} from "./ports.js";

type Cached = {
  readonly fingerprint: string;
  readonly kind: "activation" | "session";
  readonly outcome: SolverActivationOutcome | SessionTokenOutcome;
};

export class InMemorySolverActivationAdapter implements SolverActivationPort {
  private readonly activations = new Map<string, SolverActivationResource>();
  private readonly userActivations = new Map<string, SolverActivationResource>();
  private readonly consumedAssertions = new Set<string>();
  private readonly idempotency = new Map<string, Cached>();
  private readonly auditEvents: unknown[] = [];
  private readonly outboxEvents: unknown[] = [];

  constructor(
    private readonly provider: ContactVerificationProviderPort,
    private readonly identity: InMemoryIdentityAdapter,
    private readonly solverWorkspaces: InMemorySolverWorkspaceAdapter,
    private readonly credentials: SessionCredentialIssuerPort,
    private readonly criticalSection: InMemoryCriticalSection,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {}

  private idempotencyKey(token: string, command: SessionCommand): string {
    return `${commandFingerprint(token)}\0${command.idempotencyKey}`;
  }

  private replay<T extends SolverActivationOutcome | SessionTokenOutcome>(
    token: string,
    command: SessionCommand,
    fingerprint: string,
    kind: Cached["kind"],
  ): T | null {
    const cached = this.idempotency.get(this.idempotencyKey(token, command));
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint || cached.kind !== kind) throw idempotencyConflict();
    return {
      ...structuredClone(cached.outcome),
      receipt: { ...cached.outcome.receipt, idempotent: true },
    } as T;
  }

  private tokens(sessionId: ReturnType<typeof parseSessionId>): SessionTokenSet {
    const issued = this.credentials.issue(sessionId, 1);
    const now = this.clock.now();
    return {
      session_id: sessionId,
      access_token: issued.accessToken,
      refresh_token: issued.refreshToken,
      token_type: "Bearer",
      access_token_expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
      refresh_token_expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString(),
    };
  }

  private receipt<Target extends string, Next extends string>(
    target: Target,
    nextActions: readonly Next[],
  ): MutationReceipt<Target, Next> {
    return {
      entity_id: target,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: parseAuditEventId(this.ids.next("aud")),
      timestamp: this.clock.now().toISOString(),
      idempotent: false,
      next_actions: nextActions,
    };
  }

  async exchangeContact(
    body: ContactSessionExchangeBody,
    command: SessionCommand,
  ): Promise<SessionTokenOutcome> {
    const fingerprint = commandFingerprint({
      action: "contact.session.exchanged",
      expectedVersion: body.expected_version,
      assertion: commandFingerprint(body.verification_token),
    });
    return this.criticalSection.run(async () => {
      const replay = this.replay<SessionTokenOutcome>(
        body.verification_token,
        command,
        fingerprint,
        "session",
      );
      if (replay) return replay;
      const assertion = await this.provider.assertion(body.verification_token);
      if (!assertion || this.consumedAssertions.has(assertion.assertionId)) throw forbidden();
      const activation = this.activations.get(`${assertion.issuer}\0${assertion.subject}`);
      if (!activation) {
        throw new ApiProblem(409, "ACTIVATION_REQUIRED", "Solver activation is required", {
          currentState: "verified",
          recovery: "activate_solver",
        });
      }
      const sessionId = parseSessionId(this.ids.next("ses"));
      const tokens = this.tokens(sessionId);
      this.identity.addContactSessionForSolver(activation.user_id, {
        id: sessionId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessExpiresAt: tokens.access_token_expires_at,
        refreshExpiresAt: tokens.refresh_token_expires_at,
      });
      this.consumedAssertions.add(assertion.assertionId);
      const outcome: SessionTokenOutcome = {
        tokens,
        entityVersion: 1,
        receipt: this.receipt(sessionId, ["select_workspace"]),
      };
      this.idempotency.set(this.idempotencyKey(body.verification_token, command), {
        fingerprint,
        kind: "session",
        outcome: structuredClone(outcome),
      });
      this.auditEvents.push({ action: "contact.session.exchanged", sessionId });
      this.outboxEvents.push({
        event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
        event_type: "contact.session.exchanged",
        aggregate_id: sessionId,
      });
      return outcome;
    });
  }

  async activate(
    body: ActivateSolverBody,
    command: SessionCommand,
  ): Promise<SolverActivationOutcome> {
    const displayName = body.display_name.trim();
    if (displayName.length < 1 || displayName.length > 200) {
      throw new ApiProblem(422, "VALIDATION", "The solver identity is invalid");
    }
    const fingerprint = commandFingerprint({
      action: "solver.activated",
      body: {
        ...body,
        display_name: displayName,
        verification_token: commandFingerprint(body.verification_token),
      },
    });
    return this.criticalSection.run(async () => {
      const replay = this.replay<SolverActivationOutcome>(
        body.verification_token,
        command,
        fingerprint,
        "activation",
      );
      if (replay) return replay;
      const assertion = await this.provider.assertion(body.verification_token);
      if (!assertion || this.consumedAssertions.has(assertion.assertionId)) throw forbidden();
      if (this.activations.has(`${assertion.issuer}\0${assertion.subject}`)) {
        throw new ApiProblem(409, "INVALID_STATE", "The solver identity is already active", {
          currentState: "activated",
          recovery: "exchange_contact_session",
        });
      }
      const userId = parseUserId(this.ids.next("usr"));
      const tenantId = parseTenantId(this.ids.next("ten"));
      const workspaceId = parseWorkspaceId(this.ids.next("wsp"));
      const membershipId = parseMembershipId(this.ids.next("mem"));
      const activationId = parseSolverActivationId(this.ids.next("act"));
      const sessionId = parseSessionId(this.ids.next("ses"));
      const now = this.clock.now().toISOString();
      const user: User = {
        id: userId,
        displayName,
        primaryEmail: assertion.channel === "email" ? assertion.destination : null,
        emailVerified: assertion.channel === "email",
        primaryPhone: assertion.channel === "mobile" ? assertion.destination : null,
        phoneVerified: assertion.channel === "mobile",
      };
      const workspace: Extract<Workspace, { readonly kind: "individual" }> = {
        id: workspaceId,
        tenantId,
        kind: "individual",
        name: `فضای شخصی ${displayName}`.slice(0, 200),
        ownerUserId: userId,
      };
      const membership: Membership = {
        id: membershipId,
        tenantId,
        workspaceId,
        userId,
        role: "individual",
        state: "active",
        createdAt: now,
        updatedAt: now,
      };
      const tokens = this.tokens(sessionId);
      this.identity.addActivatedIndividualForSolver(user, workspace, membership, {
        id: sessionId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessExpiresAt: tokens.access_token_expires_at,
        refreshExpiresAt: tokens.refresh_token_expires_at,
        activeWorkspaceId: workspaceId,
      });
      this.solverWorkspaces.initializeIndividualWorkspaceForActivation(workspace);
      const activation: SolverActivationResource = {
        id: activationId,
        user_id: userId,
        tenant_id: tenantId,
        individual_workspace_id: workspaceId,
        start_intent: body.start_intent,
        version: 1,
        activated_at: now,
      };
      const nextActions: readonly SolverActivationNextAction[] =
        body.start_intent === "team" ? ["create_team"] : ["continue_individually"];
      const outcome: SolverActivationOutcome = {
        activation,
        tokens,
        entityVersion: 1,
        receipt: this.receipt(activationId, nextActions),
      };
      this.activations.set(`${assertion.issuer}\0${assertion.subject}`, activation);
      this.userActivations.set(userId, activation);
      this.consumedAssertions.add(assertion.assertionId);
      this.idempotency.set(this.idempotencyKey(body.verification_token, command), {
        fingerprint,
        kind: "activation",
        outcome: structuredClone(outcome),
      });
      this.auditEvents.push({ action: "solver.activated", activationId });
      this.outboxEvents.push({
        event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
        event_type: "solver.activated",
        aggregate_id: activationId,
      });
      return outcome;
    });
  }

  async get(userId: import("@rahhal/domain").UserId): Promise<SolverActivationResource | null> {
    const activation = this.userActivations.get(userId);
    return activation ? structuredClone(activation) : null;
  }

  snapshot() {
    return {
      activations: structuredClone([...this.userActivations.values()]),
      consumedAssertionCount: this.consumedAssertions.size,
      auditEvents: structuredClone(this.auditEvents),
      outboxEvents: structuredClone(this.outboxEvents),
    };
  }
}
