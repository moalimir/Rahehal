import type {
  ChallengeApprovalBriefResource,
  ChallengeApprovalNextAction,
  ChallengeApprovalResource,
  ChallengeNextAction,
  ChallengePublicationStateBody,
  ChallengePublicPage,
  ChallengePublicProjectionResource,
  ChallengeListItemResource,
  ChallengeListQuery,
  ChallengePage,
  ChallengeResource,
  ChallengeTransitionBody,
  CreateChallengeBody,
  ExtendChallengeDeadlineBody,
  MutationReceipt,
  OutboxEvent,
  PlatformChallengeApprovalQueueResource,
  PatchChallengeBody,
  PublicAudience,
  PublicChallengeQuery,
  PublishChallengeBody,
  RecordChallengeApprovalBody,
} from "@rahhal/contracts";
import {
  canTransition,
  challengeTransitions,
  evaluatePublicationReadiness,
  gateApproverRoles,
  isAggregateVersion,
  canChangePublicationState,
  isGateApproverRole,
  isPlatformRole,
  isPubliclyProjectable,
  parseAuditEventId,
  parseChallengeApprovalId,
  parseChallengeId,
  parseChallengeVersionId,
  parsePrefixedId,
  parseReceiptId,
  publicationGates,
  type AuditEventId,
  type ChallengeApprovalId,
  type ChallengeId,
  type CorrelationId,
  type TenantId,
  type UserId,
  type WorkspaceId,
  type PublicationGate,
  type WorkspaceRole,
} from "@rahhal/domain";
import {
  assertEligibilityRuleAttachable,
  challengeApprovalBriefContent,
  challengePublicProjection,
  challengeReadiness,
  challengeTriageReadiness,
  emptyChallengeContent,
  mergeChallengeDraftPatch,
  satisfiedTransitionPreconditions,
} from "./challenge-draft.js";
import {
  challengePageSize,
  compareChallenges,
  decodeChallengeCursor,
  encodeChallengeCursor,
} from "./challenge-list.js";
import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import { commandFingerprint } from "./primitives.js";
import {
  comparePublicChallenges,
  decodePublicChallengeCursor,
  encodePublicChallengeCursor,
  publicChallengePageSize,
  visibleVisibilities,
} from "./public-catalogue.js";
import type {
  ChallengeCommandContext,
  ChallengePort,
  ChallengePublicationCommand,
  ChallengeScope,
  ChallengeTransitionCommand,
  Clock,
  IdFactory,
  MutationOutcome,
  PublicChallengePort,
} from "./ports.js";

export type ChallengeAuditRecord = {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly entityId: ChallengeId;
  readonly entityVersion: number;
  readonly action:
    | "challenge.draft.created"
    | "challenge.draft.updated"
    | "challenge.triage.requested"
    | "challenge.formulation.started"
    | "challenge.approvals.requested"
    | "challenge.approval.recorded"
    | "challenge.published"
    | "challenge.deadline.extended"
    | "challenge.paused"
    | "challenge.resumed"
    | "challenge.closed"
    | "challenge.cancelled";
  readonly outcome: "success";
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
  readonly reason?: string;
};

type StoredChallenge = {
  readonly current: ChallengeResource;
  readonly versions: readonly ChallengeResource[];
};

type ChallengeMutationOutcome = MutationOutcome<ChallengeId, ChallengeNextAction>;
type ChallengeApprovalMutationOutcome = MutationOutcome<
  ChallengeApprovalId,
  ChallengeApprovalNextAction
>;

type IdempotencyRecord = {
  readonly fingerprint: string;
  readonly outcome: ChallengeMutationOutcome | ChallengeApprovalMutationOutcome;
};

type RepositoryState = {
  readonly challenges: Map<string, StoredChallenge>;
  readonly approvals: ChallengeApprovalResource[];
  publicProjections: ChallengePublicProjectionResource[];
  readonly idempotency: Map<string, IdempotencyRecord>;
  readonly auditEvents: ChallengeAuditRecord[];
  readonly outboxEvents: OutboxEvent[];
};

export type ChallengeRepositorySnapshot = {
  readonly challenges: readonly ChallengeResource[];
  readonly versions: readonly ChallengeResource[];
  readonly approvals: readonly ChallengeApprovalResource[];
  readonly publicProjections: readonly ChallengePublicProjectionResource[];
  readonly auditEvents: readonly ChallengeAuditRecord[];
  readonly outboxEvents: readonly OutboxEvent[];
  readonly idempotencyEntryCount: number;
};

/** Recomputes the derived approvals view + publication readiness for one resource snapshot. */
function withApprovals(
  resource: ChallengeResource,
  allApprovals: readonly ChallengeApprovalResource[],
): ChallengeResource {
  const approvals = allApprovals.filter(
    (approval) => approval.challenge_version_id === resource.current_version_id,
  );
  return {
    ...resource,
    approvals,
    publication_readiness: evaluatePublicationReadiness(approvals),
  };
}

function scopeKey(tenantId: TenantId, workspaceId: WorkspaceId, challengeId: string) {
  return `${tenantId}\u0000${workspaceId}\u0000${challengeId}`;
}

function idempotencyKey(context: ChallengeCommandContext, command: string) {
  return `${context.tenantId}\u0000${command}\u0000${context.idempotencyKey}`;
}

function platformGateForRole(role: WorkspaceRole): PublicationGate | null {
  if (!isPlatformRole(role)) return null;
  return publicationGates.find((gate) => gateApproverRoles[gate].includes(role)) ?? null;
}

function copyState(state: RepositoryState): RepositoryState {
  return {
    challenges: new Map(
      [...state.challenges].map(([key, stored]) => [key, structuredClone(stored)] as const),
    ),
    approvals: structuredClone(state.approvals),
    publicProjections: structuredClone(state.publicProjections),
    idempotency: new Map(
      [...state.idempotency].map(([key, record]) => [key, structuredClone(record)] as const),
    ),
    auditEvents: structuredClone(state.auditEvents),
    outboxEvents: structuredClone(state.outboxEvents),
  };
}

export class InMemoryChallengeRepository implements ChallengePort, PublicChallengePort {
  private state: RepositoryState = {
    challenges: new Map(),
    approvals: [],
    publicProjections: [],
    idempotency: new Map(),
    auditEvents: [],
    outboxEvents: [],
  };

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdFactory,
    private readonly beforeCommit?: () => void,
  ) {}

  private transact<Result>(work: (draft: RepositoryState) => Result): Result {
    const draft = copyState(this.state);
    const result = work(draft);
    this.beforeCommit?.();
    this.state = draft;
    return result;
  }

  private replay<Outcome extends ChallengeMutationOutcome | ChallengeApprovalMutationOutcome>(
    state: RepositoryState,
    key: string,
    fingerprint: string,
  ): Outcome | null {
    const cached = state.idempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      entityVersion: cached.outcome.entityVersion,
      receipt: { ...cached.outcome.receipt, idempotent: true },
    } as Outcome;
  }

  private recordMutation(
    state: RepositoryState,
    resource: ChallengeResource,
    context: ChallengeCommandContext,
    action: ChallengeAuditRecord["action"],
    nextActions: readonly ChallengeNextAction[],
    idempotency: { key: string; fingerprint: string },
    reason?: string,
  ): ChallengeMutationOutcome {
    const timestamp = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<ChallengeId, ChallengeNextAction> = {
      entity_id: resource.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp,
      idempotent: false,
      next_actions: nextActions,
    };
    const outcome = {
      receipt,
      entityVersion: resource.version,
    } satisfies ChallengeMutationOutcome;
    state.auditEvents.push({
      id: auditId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      entityId: resource.id,
      entityVersion: resource.version,
      action,
      outcome: "success",
      correlationId: context.correlationId,
      occurredAt: timestamp,
      ...(reason === undefined ? {} : { reason }),
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: action,
      schema_version: 1,
      aggregate_type: "challenge",
      aggregate_id: resource.id,
      tenant_id: context.tenantId,
      correlation_id: context.correlationId,
      occurred_at: timestamp,
      payload: { entity_version: resource.version },
    });
    state.idempotency.set(idempotency.key, {
      fingerprint: idempotency.fingerprint,
      outcome: structuredClone(outcome),
    });
    return outcome;
  }

  /**
   * Records evidence for a challenge_approval row — a distinct aggregate from
   * the challenge itself, so the receipt/outbox target the approval's own id
   * while the audit trail stays keyed by the parent challenge (matching how
   * every other challenge-scoped audit query already reads it).
   */
  private recordApprovalMutation(
    state: RepositoryState,
    approval: ChallengeApprovalResource,
    challenge: ChallengeResource,
    context: ChallengeCommandContext,
    nextActions: readonly ChallengeApprovalNextAction[],
    idempotency: { key: string; fingerprint: string },
  ): ChallengeApprovalMutationOutcome {
    const timestamp = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<ChallengeApprovalId, ChallengeApprovalNextAction> = {
      entity_id: approval.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp,
      idempotent: false,
      next_actions: nextActions,
    };
    const outcome = {
      receipt,
      entityVersion: 1,
    } satisfies ChallengeApprovalMutationOutcome;
    state.auditEvents.push({
      id: auditId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      entityId: challenge.id,
      entityVersion: challenge.version,
      action: "challenge.approval.recorded",
      outcome: "success",
      correlationId: context.correlationId,
      occurredAt: timestamp,
    });
    state.outboxEvents.push({
      event_id: parsePrefixedId(this.ids.next("evt"), "evt"),
      event_type: "challenge.approval.recorded",
      schema_version: 1,
      aggregate_type: "challenge_approval",
      aggregate_id: approval.id,
      tenant_id: context.tenantId,
      correlation_id: context.correlationId,
      occurred_at: timestamp,
      payload: { challenge_id: challenge.id, gate: approval.gate, decision: approval.decision },
    });
    state.idempotency.set(idempotency.key, {
      fingerprint: idempotency.fingerprint,
      outcome: structuredClone(outcome),
    });
    return outcome;
  }

  async create(
    body: CreateChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const key = idempotencyKey(context, "challenge:create");
    const fingerprint = commandFingerprint({
      command: "challenge:create",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    return this.transact((state) => {
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      if (body.expected_version !== 0 || !isAggregateVersion(body.expected_version)) {
        throw new ApiProblem(422, "VALIDATION", "A new challenge must expect version zero");
      }

      const id = parseChallengeId(this.ids.next("chl"));
      const now = this.clock.now().toISOString();
      const merged = mergeChallengeDraftPatch(emptyChallengeContent(), body.draft ?? {});
      const resource: ChallengeResource = {
        id,
        current_version_id: parseChallengeVersionId(this.ids.next("chv")),
        published_version_id: null,
        publication_state: null,
        proposal_deadline_at: null,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        stage: "draft",
        authoring_status: merged.authoringStatus ?? "draft",
        version: 1,
        content_version: 1,
        readiness: challengeReadiness(merged.content, 1),
        triage_readiness: challengeTriageReadiness(merged.content, 1),
        content: merged.content,
        approvals: [],
        publication_readiness: evaluatePublicationReadiness([]),
        created_by: context.actorUserId,
        created_at: now,
        updated_at: now,
      };
      const canonicalResource: ChallengeResource = {
        ...resource,
        authoring_status: resource.readiness.ready ? "ready" : "draft",
      };
      state.challenges.set(scopeKey(context.tenantId, context.workspaceId, id), {
        current: canonicalResource,
        versions: [canonicalResource],
      });
      return this.recordMutation(
        state,
        canonicalResource,
        context,
        "challenge.draft.created",
        ["edit"],
        { key, fingerprint },
      );
    });
  }

  async getScoped(scope: ChallengeScope, id: string) {
    const stored = this.state.challenges.get(scopeKey(scope.tenantId, scope.workspaceId, id));
    return stored ? structuredClone(stored.current) : null;
  }

  /**
   * Parity with the PostgreSQL adapter: same scope, same newest-first order,
   * same keyset cursor, same narrow row. The demo store keys challenges by
   * scope already, so the filter is a predicate rather than a WHERE clause.
   */
  async listScoped(scope: ChallengeScope, query: ChallengeListQuery): Promise<ChallengePage> {
    const cursor = decodeChallengeCursor(query.cursor);
    const rows = [...this.state.challenges.values()]
      .map((stored) => withApprovals(stored.current, this.state.approvals))
      .filter(
        (challenge) =>
          challenge.tenant_id === scope.tenantId &&
          challenge.workspace_id === scope.workspaceId &&
          (query.stage === undefined || challenge.stage === query.stage),
      )
      .map(
        (challenge): ChallengeListItemResource => ({
          id: challenge.id,
          current_version_id: challenge.current_version_id,
          stage: challenge.stage,
          authoring_status: challenge.authoring_status,
          publication_state: challenge.publication_state,
          proposal_deadline_at: challenge.proposal_deadline_at,
          version: challenge.version,
          title: challenge.content.title,
          category: challenge.content.category,
          ready: challenge.readiness.ready,
          publication_readiness: challenge.publication_readiness,
          created_at: challenge.created_at,
          updated_at: challenge.updated_at,
        }),
      )
      .sort(compareChallenges)
      .filter((item) => cursor === null || compareChallenges(cursor, item) < 0);

    const items = rows.slice(0, challengePageSize);
    const last = items.at(-1);
    return structuredClone({
      items,
      next_cursor: rows.length > challengePageSize && last ? encodeChallengeCursor(last) : null,
    });
  }

  async getApprovalBrief(
    scope: ChallengeScope,
    id: string,
  ): Promise<ChallengeApprovalBriefResource | null> {
    const gate = platformGateForRole(scope.role);
    if (!gate) throw forbidden();
    const stored = this.state.challenges.get(scopeKey(scope.tenantId, scope.workspaceId, id));
    if (
      !stored ||
      (stored.current.stage !== "triage" && stored.current.stage !== "approvals") ||
      (stored.current.stage === "triage" && scope.role !== "platform:ops")
    ) {
      return null;
    }
    const current = withApprovals(stored.current, this.state.approvals);
    return structuredClone({
      id: current.id,
      current_version_id: current.current_version_id,
      workspace_id: current.workspace_id,
      stage: current.stage === "triage" ? "triage" : "approvals",
      gate,
      version: current.version,
      content: challengeApprovalBriefContent(current.content, gate),
      approvals: current.approvals.map((approval) => ({
        gate: approval.gate,
        decision: approval.decision,
        reason: approval.reason,
        recorded_by_role: approval.recorded_by_role,
        recorded_at: approval.recorded_at,
        recorded_by_current_actor: approval.recorded_by === scope.actorUserId,
      })),
      publication_readiness: current.publication_readiness,
      updated_at: current.updated_at,
    });
  }

  async listApprovalQueue(scope: ChallengeScope): Promise<PlatformChallengeApprovalQueueResource> {
    const gate = platformGateForRole(scope.role);
    if (!gate) throw forbidden();
    const items = [...this.state.challenges.values()]
      .map((stored) => withApprovals(stored.current, this.state.approvals))
      .filter(
        (challenge) =>
          challenge.stage === "approvals" ||
          (challenge.stage === "triage" && scope.role === "platform:ops"),
      )
      .filter(
        (challenge) =>
          challenge.stage === "triage" ||
          !challenge.approvals.some((approval) => approval.gate === gate),
      )
      .filter(
        (challenge) =>
          challenge.stage === "triage" ||
          !challenge.approvals.some((approval) => approval.recorded_by === scope.actorUserId),
      )
      .sort(
        (left, right) =>
          left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id),
      )
      .slice(0, 50)
      .map((challenge) => ({
        challenge_id: challenge.id,
        current_version_id: challenge.current_version_id,
        workspace_id: challenge.workspace_id,
        version: challenge.version,
        stage: challenge.stage === "triage" ? ("triage" as const) : ("approvals" as const),
        title: challenge.content.title,
        category: challenge.content.category,
        gate,
        updated_at: challenge.updated_at,
      }));
    return { items: structuredClone(items) };
  }

  async patch(
    id: string,
    body: PatchChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const key = idempotencyKey(context, "challenge:patch");
    const fingerprint = commandFingerprint({
      command: "challenge:patch",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.transact((state) => {
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      const rejectedApproval = stored.current.approvals.some(
        (approval) => approval.decision === "rejected",
      );
      if (
        stored.current.stage !== "draft" &&
        stored.current.stage !== "formulation" &&
        !(stored.current.stage === "approvals" && rejectedApproval)
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge content is not editable", {
          currentState: stored.current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === stored.current.stage)
            .map(({ to }) => to),
        });
      }

      const merged = mergeChallengeDraftPatch(stored.current.content, body.patch);
      const now = this.clock.now();
      const version = stored.current.version + 1;
      const contentVersion = stored.current.content_version + 1;
      const readiness = challengeReadiness(merged.content, version);
      const updated: ChallengeResource = {
        ...stored.current,
        current_version_id: parseChallengeVersionId(this.ids.next("chv")),
        stage: rejectedApproval ? "formulation" : stored.current.stage,
        authoring_status: readiness.ready
          ? "ready"
          : stored.current.stage === "formulation" || rejectedApproval
            ? "needs_changes"
            : "draft",
        version,
        content_version: contentVersion,
        readiness,
        triage_readiness: challengeTriageReadiness(merged.content, version),
        content: merged.content,
        // A new version_id starts with no approvals of its own — gates are
        // recorded against one specific locked version (B2), never inherited.
        approvals: [],
        publication_readiness: evaluatePublicationReadiness([]),
        updated_at: now.toISOString(),
      };
      state.challenges.set(storedKey, {
        current: updated,
        versions: [...stored.versions, updated],
      });
      return this.recordMutation(state, updated, context, "challenge.draft.updated", ["edit"], {
        key,
        fingerprint,
      });
    });
  }

  async transition(
    id: string,
    command: ChallengeTransitionCommand,
    body: ChallengeTransitionBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const definitions = {
      "request-triage": {
        from: "draft",
        to: "triage",
        precondition: "brief-valid",
        action: "challenge.triage.requested",
        nextActions: ["advance_formulation"],
      },
      "advance-formulation": {
        from: "triage",
        to: "formulation",
        precondition: "triage-passed",
        action: "challenge.formulation.started",
        nextActions: ["edit"],
      },
      "request-approvals": {
        from: "formulation",
        to: "approvals",
        precondition: "formulation-complete",
        action: "challenge.approvals.requested",
        nextActions: ["await_approvals"],
      },
    } as const;
    const definition = definitions[command];
    const key = idempotencyKey(context, `challenge:${command}`);
    const fingerprint = commandFingerprint({
      command: `challenge:${command}`,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.transact((state) => {
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      const rule = challengeTransitions.find(
        ({ from, to }) => from === stored.current.stage && to === definition.to,
      );
      if (!rule || !rule.roles.some((role) => role === context.role)) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge transition is not allowed", {
          currentState: stored.current.stage,
          allowedTransitions: challengeTransitions
            .filter(
              ({ from, roles }) =>
                from === stored.current.stage && roles.some((role) => role === context.role),
            )
            .map(({ to }) => to),
        });
      }
      const readiness = challengeReadiness(stored.current.content, stored.current.version);
      const requiredReadiness =
        command === "request-triage" ? stored.current.triage_readiness : readiness;
      if (command === "request-approvals") {
        assertEligibilityRuleAttachable(stored.current.content, this.clock.now());
      }
      if (command !== "advance-formulation" && !requiredReadiness.ready) {
        throw new ApiProblem(422, "VALIDATION", "Challenge brief is not ready", {
          fields: requiredReadiness.issues,
          readiness: requiredReadiness,
          currentVersion: stored.current.version,
        });
      }
      if (
        !canTransition(
          challengeTransitions,
          stored.current.stage,
          definition.to,
          context.role,
          satisfiedTransitionPreconditions(stored.current.stage, requiredReadiness),
        )
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge transition is not allowed", {
          currentState: stored.current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === stored.current.stage)
            .map(({ to }) => to),
        });
      }
      const version = stored.current.version + 1;
      const updated: ChallengeResource = {
        ...stored.current,
        stage: definition.to,
        version,
        readiness: { ...readiness, evaluated_version: version },
        triage_readiness: {
          ...stored.current.triage_readiness,
          evaluated_version: version,
        },
        updated_at: this.clock.now().toISOString(),
      };
      state.challenges.set(storedKey, { ...stored, current: updated });
      return this.recordMutation(
        state,
        updated,
        context,
        definition.action,
        definition.nextActions,
        { key, fingerprint },
      );
    });
  }

  async recordApproval(
    id: string,
    body: RecordChallengeApprovalBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeApprovalMutationOutcome> {
    const key = idempotencyKey(context, "challenge:record-approval");
    const fingerprint = commandFingerprint({
      command: "challenge:record-approval",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.transact((state) => {
      const replay = this.replay<ChallengeApprovalMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      if (stored.current.stage !== "approvals") {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge is not awaiting approvals", {
          currentState: stored.current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === stored.current.stage)
            .map(({ to }) => to),
        });
      }
      // Defense in depth: app.ts resolves org- or platform-side authorization
      // before this is reached, but the adapter never trusts that alone.
      if (!isGateApproverRole(body.gate, context.role)) throw forbidden();

      const versionId = stored.current.current_version_id;
      const existingForVersion = state.approvals.filter(
        (approval) => approval.challenge_version_id === versionId,
      );
      if (existingForVersion.some((approval) => approval.gate === body.gate)) {
        throw new ApiProblem(409, "CONFLICT", `The ${body.gate} gate is already recorded`, {
          recovery: "refetch_and_retry",
        });
      }
      if (existingForVersion.some((approval) => approval.recorded_by === context.actorUserId)) {
        throw new ApiProblem(
          409,
          "CONFLICT",
          "This actor already recorded a different gate on this version",
          { recovery: "refetch_and_retry" },
        );
      }

      const occurredAt = this.clock.now().toISOString();
      const approval: ChallengeApprovalResource = {
        id: parseChallengeApprovalId(this.ids.next("cap")),
        challenge_id: stored.current.id,
        challenge_version_id: versionId,
        gate: body.gate,
        decision: body.decision,
        reason: body.reason,
        recorded_by: context.actorUserId,
        recorded_by_role: context.role,
        recorded_at: occurredAt,
      };
      state.approvals.push(approval);
      const refreshed = withApprovals(stored.current, state.approvals);
      state.challenges.set(storedKey, { ...stored, current: refreshed });

      const nextActions: readonly ChallengeApprovalNextAction[] = [
        body.decision === "rejected"
          ? "revise"
          : refreshed.publication_readiness.ready
            ? "ready_for_publish"
            : "await_remaining_gates",
      ];
      return this.recordApprovalMutation(state, approval, refreshed, context, nextActions, {
        key,
        fingerprint,
      });
    });
  }

  async publish(
    id: string,
    body: PublishChallengeBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const key = idempotencyKey(context, "challenge:publish");
    const fingerprint = commandFingerprint({
      command: "challenge:publish",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.transact((state) => {
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }

      const readiness = challengeReadiness(stored.current.content, stored.current.version);
      const publicationReadiness = stored.current.publication_readiness;
      if (
        !canTransition(
          challengeTransitions,
          stored.current.stage,
          "published",
          context.role,
          satisfiedTransitionPreconditions(stored.current.stage, readiness, publicationReadiness),
        )
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Challenge cannot be published yet", {
          currentState: stored.current.stage,
          allowedTransitions: challengeTransitions
            .filter(({ from }) => from === stored.current.stage)
            .map(({ to }) => to),
        });
      }
      if (!readiness.ready) {
        throw new ApiProblem(422, "VALIDATION", "Challenge brief is not ready", {
          fields: readiness.issues,
          readiness,
          currentVersion: stored.current.version,
        });
      }
      assertEligibilityRuleAttachable(stored.current.content, this.clock.now());

      const occurredAt = this.clock.now().toISOString();
      const version = stored.current.version + 1;
      const published: ChallengeResource = {
        ...stored.current,
        stage: "published",
        published_version_id: stored.current.current_version_id,
        publication_state: "open",
        proposal_deadline_at: stored.current.content.proposal_deadline,
        version,
        readiness: { ...readiness, evaluated_version: version },
        triage_readiness: {
          ...stored.current.triage_readiness,
          evaluated_version: version,
        },
        updated_at: occurredAt,
      };
      // Only listable challenges enter the public table at all; an invite-only
      // or NDA challenge publishes without a public row (mirrors the B4
      // migration's visibility CHECK).
      if (isPubliclyProjectable(published.content.visibility)) {
        state.publicProjections.push(
          challengePublicProjection(
            published.id,
            published.current_version_id,
            published.content,
            occurredAt,
            "open",
          ),
        );
      }
      state.challenges.set(storedKey, { ...stored, current: published });
      return this.recordMutation(
        state,
        published,
        context,
        "challenge.published",
        ["await_proposals"],
        { key, fingerprint },
      );
    });
  }

  /**
   * B6. Extends the proposal deadline on a published, still-open call.
   *
   * It updates the challenge and its public projection, never the approved
   * version: the four gates approved that exact content, and rewriting it to
   * carry a later date would silently re-state what they signed off.
   */
  async extendDeadline(
    id: string,
    body: ExtendChallengeDeadlineBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const key = idempotencyKey(context, "challenge:extend-deadline");
    const fingerprint = commandFingerprint({
      command: "challenge:extend-deadline",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });
    return this.transact((state) => {
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      // Defense in depth: app.ts authorizes the publisher before this is
      // reached, but the adapter never trusts that alone -- the same rule B2's
      // gate recording and B4's publish already follow.
      if (context.role !== "org:publisher") throw forbidden();
      const current = stored.current;
      if (current.publication_state !== "open" || current.proposal_deadline_at === null) {
        throw new ApiProblem(409, "INVALID_STATE", "Only an open published call can be extended", {
          currentState: current.publication_state ?? current.stage,
        });
      }
      const now = this.clock.now();
      const next = Date.parse(body.proposal_deadline);
      // Server time decides, never the caller's clock, and a deadline only
      // moves forward: shortening it would retract time solvers already saw.
      if (!Number.isFinite(next) || next <= now.getTime()) {
        throw new ApiProblem(422, "VALIDATION", "A new deadline must be in the future", {
          fields: [
            {
              path: "/proposal_deadline",
              code: "future",
              message: "The new proposal deadline must be later than server time",
            },
          ],
        });
      }
      if (next <= Date.parse(current.proposal_deadline_at)) {
        throw new ApiProblem(422, "VALIDATION", "A deadline can only be extended", {
          fields: [
            {
              path: "/proposal_deadline",
              code: "future",
              message: "The new proposal deadline must be later than the current one",
            },
          ],
        });
      }

      const occurredAt = now.toISOString();
      const updated: ChallengeResource = {
        ...current,
        version: current.version + 1,
        proposal_deadline_at: body.proposal_deadline,
        updated_at: occurredAt,
      };
      state.challenges.set(storedKey, { ...stored, current: updated });
      const projection = state.publicProjections.find((row) => row.challenge_id === updated.id);
      if (projection) {
        state.publicProjections = state.publicProjections.map((row) =>
          row.challenge_id === updated.id
            ? { ...row, proposal_deadline: body.proposal_deadline }
            : row,
        );
      }
      return this.recordMutation(
        state,
        updated,
        context,
        "challenge.deadline.extended",
        ["await_proposals"],
        { key, fingerprint },
        body.reason,
      );
    });
  }

  /**
   * B6. Pause, resume, close, cancel. `closed`/`cancelled` are terminal, so a
   * reopened call is a new challenge rather than a state flip -- 95 §2 answers
   * that cancelling closes in-flight proposals with notice, which no later
   * "reopen" could undo.
   */
  async changePublicationState(
    id: string,
    command: ChallengePublicationCommand,
    body: ChallengePublicationStateBody,
    context: ChallengeCommandContext,
  ): Promise<ChallengeMutationOutcome> {
    const definitions = {
      pause: { to: "paused", action: "challenge.paused", next: ["await_resume"] },
      resume: { to: "open", action: "challenge.resumed", next: ["await_proposals"] },
      close: { to: "closed", action: "challenge.closed", next: ["closed"] },
      cancel: { to: "cancelled", action: "challenge.cancelled", next: ["closed"] },
    } as const;
    const definition = definitions[command];
    const key = idempotencyKey(context, `challenge:${command}`);
    const fingerprint = commandFingerprint({
      command: `challenge:${command}`,
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      id,
      body,
    });

    return this.transact((state) => {
      const replay = this.replay<ChallengeMutationOutcome>(state, key, fingerprint);
      if (replay) return replay;
      const storedKey = scopeKey(context.tenantId, context.workspaceId, id);
      const stored = state.challenges.get(storedKey);
      if (!stored) throw notFound();
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }
      // Defense in depth: app.ts authorizes the publisher before this is
      // reached, but the adapter never trusts that alone -- the same rule B2's
      // gate recording and B4's publish already follow.
      if (context.role !== "org:publisher") throw forbidden();
      const current = stored.current;
      if (
        current.publication_state === null ||
        !canChangePublicationState(current.publication_state, definition.to)
      ) {
        throw new ApiProblem(409, "INVALID_STATE", "Publication state change is not allowed", {
          currentState: current.publication_state ?? current.stage,
        });
      }

      const occurredAt = this.clock.now().toISOString();
      const updated: ChallengeResource = {
        ...current,
        version: current.version + 1,
        publication_state: definition.to,
        updated_at: occurredAt,
      };
      state.challenges.set(storedKey, { ...stored, current: updated });
      // Discovery reads the projection, so the call disappears from the public
      // catalogue the moment it stops being open -- without deleting the row
      // anyone already holding a link needs.
      state.publicProjections = state.publicProjections.map((row) =>
        row.challenge_id === updated.id ? { ...row, state: definition.to } : row,
      );
      return this.recordMutation(
        state,
        updated,
        context,
        definition.action,
        definition.next,
        { key, fingerprint },
        body.reason,
      );
    });
  }

  /**
   * The public read path. It reads `publicProjections` and nothing else --
   * the same restriction the PostgreSQL adapter gets from only ever
   * selecting from `challenge_public_projection`.
   */
  async list(audience: PublicAudience, query: PublicChallengeQuery): Promise<ChallengePublicPage> {
    const cursor = decodePublicChallengeCursor(query.cursor);
    const visible = visibleVisibilities(audience);
    const ordered = this.state.publicProjections
      // Only an open call is listed; a paused or closed one keeps its record
      // and still resolves by direct link.
      .filter((row) => row.state === "open")
      .filter((row) => Date.parse(row.proposal_deadline) > this.clock.now().getTime())
      .filter((row) => visible.includes(row.visibility))
      .filter(
        (row) =>
          query.category === undefined ||
          row.category.trim().toLocaleLowerCase("en-US") ===
            query.category.trim().toLocaleLowerCase("en-US"),
      )
      .sort(comparePublicChallenges);
    const afterCursor = cursor
      ? ordered.filter((row) => comparePublicChallenges(cursor, row) < 0)
      : ordered;
    // One extra row decides whether another page exists without a second query.
    const page = afterCursor.slice(0, publicChallengePageSize + 1);
    const items = page.slice(0, publicChallengePageSize);
    const last = items.at(-1);
    return {
      items: structuredClone(items),
      next_cursor:
        page.length > publicChallengePageSize && last ? encodePublicChallengeCursor(last) : null,
    };
  }

  async get(
    audience: PublicAudience,
    id: string,
  ): Promise<ChallengePublicProjectionResource | null> {
    const visible = visibleVisibilities(audience);
    const row = this.state.publicProjections.find(
      (projection) => projection.challenge_id === id && visible.includes(projection.visibility),
    );
    if (!row) return null;
    return structuredClone({
      ...row,
      state:
        row.state === "open" && Date.parse(row.proposal_deadline) <= this.clock.now().getTime()
          ? "closed"
          : row.state,
    });
  }

  seed(resource: ChallengeResource) {
    this.state.challenges.set(scopeKey(resource.tenant_id, resource.workspace_id, resource.id), {
      current: structuredClone(resource),
      versions: [structuredClone(resource)],
    });
  }

  snapshot(): ChallengeRepositorySnapshot {
    const stored = [...this.state.challenges.values()];
    return {
      challenges: stored.map(({ current }) => structuredClone(current)),
      versions: stored.flatMap(({ versions }) => structuredClone(versions)),
      approvals: structuredClone(this.state.approvals),
      publicProjections: structuredClone(this.state.publicProjections),
      auditEvents: structuredClone(this.state.auditEvents),
      outboxEvents: structuredClone(this.state.outboxEvents),
      idempotencyEntryCount: this.state.idempotency.size,
    };
  }
}
