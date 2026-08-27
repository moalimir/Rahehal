import type {
  ChallengeResource,
  CreateChallengeBody,
  MutationReceipt,
  OutboxEvent,
  PatchChallengeBody,
} from "@rahhal/contracts";
import {
  isAggregateVersion,
  parseAuditEventId,
  parseChallengeId,
  parseChallengeVersionId,
  parsePrefixedId,
  parseReceiptId,
  type AuditEventId,
  type ChallengeId,
  type CorrelationId,
  type TenantId,
  type UserId,
  type WorkspaceId,
} from "@rahhal/domain";
import { emptyChallengeContent, mergeChallengeDraftPatch } from "./challenge-draft.js";
import { ApiProblem, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import { commandFingerprint } from "./primitives.js";
import type {
  ChallengeCommandContext,
  ChallengePort,
  ChallengeScope,
  Clock,
  IdFactory,
  MutationOutcome,
} from "./ports.js";

export type ChallengeAuditRecord = {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorUserId: UserId;
  readonly entityId: ChallengeId;
  readonly entityVersion: number;
  readonly action: "challenge.draft.created" | "challenge.draft.updated";
  readonly outcome: "success";
  readonly correlationId: CorrelationId;
  readonly occurredAt: string;
};

type StoredChallenge = {
  readonly current: ChallengeResource;
  readonly versions: readonly ChallengeResource[];
};

type ChallengeMutationOutcome = MutationOutcome<ChallengeId, "edit">;

type IdempotencyRecord = {
  readonly fingerprint: string;
  readonly outcome: ChallengeMutationOutcome;
};

type RepositoryState = {
  readonly challenges: Map<string, StoredChallenge>;
  readonly idempotency: Map<string, IdempotencyRecord>;
  readonly auditEvents: ChallengeAuditRecord[];
  readonly outboxEvents: OutboxEvent[];
};

export type ChallengeRepositorySnapshot = {
  readonly challenges: readonly ChallengeResource[];
  readonly versions: readonly ChallengeResource[];
  readonly auditEvents: readonly ChallengeAuditRecord[];
  readonly outboxEvents: readonly OutboxEvent[];
  readonly idempotencyEntryCount: number;
};

function scopeKey(tenantId: TenantId, workspaceId: WorkspaceId, challengeId: string) {
  return `${tenantId}\u0000${workspaceId}\u0000${challengeId}`;
}

function idempotencyKey(context: ChallengeCommandContext, command: string) {
  return `${context.tenantId}\u0000${command}\u0000${context.idempotencyKey}`;
}

function copyState(state: RepositoryState): RepositoryState {
  return {
    challenges: new Map(
      [...state.challenges].map(([key, stored]) => [key, structuredClone(stored)] as const),
    ),
    idempotency: new Map(
      [...state.idempotency].map(([key, record]) => [key, structuredClone(record)] as const),
    ),
    auditEvents: structuredClone(state.auditEvents),
    outboxEvents: structuredClone(state.outboxEvents),
  };
}

export class InMemoryChallengeRepository implements ChallengePort {
  private state: RepositoryState = {
    challenges: new Map(),
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

  private replay(
    state: RepositoryState,
    key: string,
    fingerprint: string,
  ): ChallengeMutationOutcome | null {
    const cached = state.idempotency.get(key);
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      entityVersion: cached.outcome.entityVersion,
      receipt: { ...cached.outcome.receipt, idempotent: true },
    };
  }

  private recordMutation(
    state: RepositoryState,
    resource: ChallengeResource,
    context: ChallengeCommandContext,
    action: ChallengeAuditRecord["action"],
    idempotency: { key: string; fingerprint: string },
  ): ChallengeMutationOutcome {
    const timestamp = this.clock.now().toISOString();
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receipt: MutationReceipt<ChallengeId, "edit"> = {
      entity_id: resource.id,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: auditId,
      timestamp,
      idempotent: false,
      next_actions: ["edit"],
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
      const replay = this.replay(state, key, fingerprint);
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
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        stage: "draft",
        authoring_status: merged.authoringStatus ?? "draft",
        version: 1,
        content: merged.content,
        created_by: context.actorUserId,
        created_at: now,
        updated_at: now,
      };
      state.challenges.set(scopeKey(context.tenantId, context.workspaceId, id), {
        current: resource,
        versions: [resource],
      });
      return this.recordMutation(state, resource, context, "challenge.draft.created", {
        key,
        fingerprint,
      });
    });
  }

  async getScoped(scope: ChallengeScope, id: string) {
    const stored = this.state.challenges.get(scopeKey(scope.tenantId, scope.workspaceId, id));
    return stored ? structuredClone(stored.current) : null;
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
      const replay = this.replay(state, key, fingerprint);
      if (replay) return replay;
      if (body.expected_version !== stored.current.version) {
        throw staleVersion(stored.current.version);
      }

      const merged = mergeChallengeDraftPatch(stored.current.content, body.patch);
      const updated: ChallengeResource = {
        ...stored.current,
        current_version_id: parseChallengeVersionId(this.ids.next("chv")),
        authoring_status: merged.authoringStatus ?? stored.current.authoring_status,
        version: stored.current.version + 1,
        content: merged.content,
        updated_at: this.clock.now().toISOString(),
      };
      state.challenges.set(storedKey, {
        current: updated,
        versions: [...stored.versions, updated],
      });
      return this.recordMutation(state, updated, context, "challenge.draft.updated", {
        key,
        fingerprint,
      });
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
      auditEvents: structuredClone(this.state.auditEvents),
      outboxEvents: structuredClone(this.state.outboxEvents),
      idempotencyEntryCount: this.state.idempotency.size,
    };
  }
}
