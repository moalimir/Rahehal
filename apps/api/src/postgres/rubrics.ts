import type {
  CreateRubricVersionBody,
  MutationReceipt,
  RubricNextAction,
  RubricResource,
} from "@rahhal/contracts";
import {
  parseAuditEventId,
  parsePrefixedId,
  parseReceiptId,
  validateRubricCriteria,
  type RubricId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";
import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import type {
  IdFactory,
  MutationOutcome,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { commandFingerprint } from "../primitives.js";
import type { RubricPort } from "../rubric-port.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ChallengeRow = { id: string; published_version_id: string | null; stage: string };
type VersionRow = {
  id: string;
  version_id: string;
  version_number: number;
  challenge_id: string;
  challenge_version_id: string;
  criteria: RubricResource["criteria"];
  created_at: Date;
};
type Outcome = MutationOutcome<RubricId, RubricNextAction>;
type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};

const rubricNextActions = [
  "edit_rubric",
  "open_evaluation",
] as const satisfies readonly RubricNextAction[];

function cachedOutcome(value: unknown): Outcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid rubric replay evidence");
  }
  const record = value as Record<string, unknown>;
  const receiptValue = record["receipt"];
  if (!receiptValue || typeof receiptValue !== "object" || Array.isArray(receiptValue)) {
    throw new Error("Invalid rubric replay evidence");
  }
  const receiptRecord = receiptValue as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record["entityVersion"]) ||
    Number(record["entityVersion"]) < 1 ||
    typeof receiptRecord["entity_id"] !== "string" ||
    typeof receiptRecord["receipt_id"] !== "string" ||
    typeof receiptRecord["audit_event_id"] !== "string" ||
    typeof receiptRecord["timestamp"] !== "string" ||
    typeof receiptRecord["idempotent"] !== "boolean" ||
    !Array.isArray(receiptRecord["next_actions"]) ||
    !receiptRecord["next_actions"].every(
      (item) => typeof item === "string" && rubricNextActions.includes(item as RubricNextAction),
    )
  ) {
    throw new Error("Invalid rubric replay evidence");
  }
  const receipt: MutationReceipt<RubricId, RubricNextAction> = {
    entity_id: parsePrefixedId(receiptRecord["entity_id"], "rub"),
    receipt_id: parseReceiptId(receiptRecord["receipt_id"]),
    audit_event_id: parseAuditEventId(receiptRecord["audit_event_id"]),
    timestamp: new Date(receiptRecord["timestamp"]).toISOString(),
    idempotent: true,
    next_actions: receiptRecord["next_actions"] as readonly RubricNextAction[],
  };
  return { entityVersion: record["entityVersion"] as number, receipt };
}

function author(scope: WorkspaceScope): void {
  if (scope.role !== "org:owner" && scope.role !== "org:member") throw forbidden();
}
function resource(row: VersionRow): RubricResource {
  if (validateRubricCriteria(row.criteria).length || !Number.isSafeInteger(row.version_number))
    throw new Error("Invalid persisted rubric version");
  return {
    id: parsePrefixedId(row.id, "rub"),
    version_id: parsePrefixedId(row.version_id, "rbv"),
    version: row.version_number,
    challenge_id: parsePrefixedId(row.challenge_id, "chl"),
    challenge_version_id: parsePrefixedId(row.challenge_version_id, "chv"),
    criteria: row.criteria,
    created_at: row.created_at.toISOString(),
  };
}

export class PostgresRubricAdapter implements RubricPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly ids: IdFactory,
  ) {}

  private async challenge(
    client: PoolClient,
    scope: WorkspaceScope,
    id: string,
    lock: boolean,
  ): Promise<ChallengeRow> {
    author(scope);
    const result = await client.query<ChallengeRow>(
      `SELECT id, published_version_id, stage FROM challenge
       WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3 ${lock ? "FOR UPDATE" : ""}`,
      [scope.tenantId, scope.workspaceId, id],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }
  private async latest(
    client: PoolClient,
    scope: WorkspaceScope,
    challenge: ChallengeRow,
  ): Promise<VersionRow | undefined> {
    const result = await client.query<VersionRow>(
      `SELECT r.id, rv.id AS version_id, rv.version_number, r.challenge_id,
         r.challenge_version_id, rv.criteria, rv.created_at
       FROM rubric r JOIN rubric_version rv ON rv.rubric_id = r.id
       WHERE r.tenant_id = $1 AND r.challenge_id = $2 AND r.challenge_version_id = $3
       ORDER BY rv.version_number DESC LIMIT 1`,
      [scope.tenantId, challenge.id, challenge.published_version_id],
    );
    return result.rows[0];
  }
  async get(scope: WorkspaceScope, challengeId: string): Promise<RubricResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challenge = await this.challenge(client, scope, challengeId, false);
      const latest = await this.latest(client, scope, challenge);
      return latest ? resource(latest) : null;
    });
  }
  async createVersion(
    challengeId: string,
    body: CreateRubricVersionBody,
    context: WorkspaceCommandContext,
  ): Promise<Outcome> {
    author(context);
    const requestHash = commandFingerprint({
      action: "rubric.version.create",
      actor: context.actorUserId,
      workspace: context.workspaceId,
      challengeId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
      ]);
      // Revalidate reach before returning a cached receipt, including after role/membership removal.
      const challenge = await this.challenge(client, context, challengeId, true);
      await client.query(
        `DELETE FROM idempotency_key WHERE scope_kind = 'tenant' AND tenant_id = $1
         AND credential_fingerprint IS NULL
         AND idempotency_key = $2 AND expires_at <= clock_timestamp()`,
        [context.tenantId, context.idempotencyKey],
      );
      const replay = await client.query<IdempotencyRow>(
        `SELECT request_hash, status, response_body FROM idempotency_key
         WHERE scope_kind = 'tenant' AND tenant_id = $1
           AND credential_fingerprint IS NULL AND idempotency_key = $2 FOR UPDATE`,
        [context.tenantId, context.idempotencyKey],
      );
      if (replay.rows[0]) {
        const cached = replay.rows[0];
        if (cached.request_hash !== requestHash) throw idempotencyConflict();
        if (cached.status !== "completed") throw new Error("Invalid rubric replay evidence");
        return cachedOutcome(cached.response_body);
      }
      if (challenge.stage !== "published" || !challenge.published_version_id)
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "Rubrics can be authored only before evaluation on a published challenge",
          { currentState: challenge.stage },
        );
      if (body.challenge_version_id !== challenge.published_version_id)
        throw new ApiProblem(
          409,
          "CONFLICT",
          "Rubric must bind to the exact published challenge version",
          { recovery: "refresh_challenge_terms" },
        );
      const issues = validateRubricCriteria(body.criteria);
      if (issues.length)
        throw new ApiProblem(422, "VALIDATION", "Rubric criteria are invalid", { fields: issues });
      const latest = await this.latest(client, context, challenge);
      const currentVersion = latest?.version_number ?? 0;
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      const assigned = await client.query(
        `SELECT 1 FROM review_assignment a JOIN rubric_version rv ON rv.id = a.rubric_version_id
         JOIN rubric r ON r.id = rv.rubric_id WHERE r.tenant_id = $1 AND r.challenge_id = $2 LIMIT 1`,
        [context.tenantId, challenge.id],
      );
      if (assigned.rowCount)
        throw new ApiProblem(409, "INVALID_STATE", "An assigned rubric is frozen for evaluation");
      const rubricId = latest
        ? parsePrefixedId(latest.id, "rub")
        : parsePrefixedId(this.ids.next("rub"), "rub");
      const versionId = parsePrefixedId(this.ids.next("rbv"), "rbv");
      const version = currentVersion + 1;
      const now = (await client.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!
        .now;
      if (!latest)
        await client.query(
          "INSERT INTO rubric (id, tenant_id, challenge_id, challenge_version_id) VALUES ($1,$2,$3,$4)",
          [rubricId, context.tenantId, challenge.id, challenge.published_version_id],
        );
      await client.query(
        `INSERT INTO rubric_version (id, rubric_id, version_number, criteria, created_by_user_id, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
        [
          versionId,
          rubricId,
          version,
          JSON.stringify(body.criteria.map((item) => ({ ...item, label: item.label.trim() }))),
          context.actorUserId,
          now,
        ],
      );
      const auditId = parsePrefixedId(this.ids.next("aud"), "aud");
      const receiptId = parsePrefixedId(this.ids.next("rcp"), "rcp");
      const nextActions: RubricNextAction[] = [...rubricNextActions];
      const metadata = JSON.stringify({
        entity_version: version,
        rubric_version_id: versionId,
        challenge_id: challenge.id,
        challenge_version_id: challenge.published_version_id,
      });
      await client.query(
        `INSERT INTO audit_event (id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,reason_code,target_type,target_id,metadata,occurred_at)
         VALUES ($1,$2,$3,$4,'user',$5,'rubric.version.created','success','MUTATION_COMMITTED','rubric',$6,$7::jsonb,$8)`,
        [
          auditId,
          context.correlationId,
          context.tenantId,
          context.workspaceId,
          context.actorUserId,
          rubricId,
          metadata,
          now,
        ],
      );
      await client.query(
        `INSERT INTO mutation_receipt (id,tenant_id,workspace_id,entity_type,entity_id,entity_version,audit_event_id,correlation_id,next_actions,occurred_at)
         VALUES ($1,$2,$3,'rubric',$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          receiptId,
          context.tenantId,
          context.workspaceId,
          rubricId,
          version,
          auditId,
          context.correlationId,
          JSON.stringify(nextActions),
          now,
        ],
      );
      await client.query(
        `INSERT INTO outbox_event (id,tenant_id,correlation_id,event_type,schema_version,aggregate_type,aggregate_id,payload,dedupe_key,occurred_at,available_at)
         VALUES ($1,$2,$3,'rubric.version.created',1,'rubric',$4,$5::jsonb,$6,$7,$7)`,
        [
          this.ids.next("evt"),
          context.tenantId,
          context.correlationId,
          rubricId,
          metadata,
          `rubric.version.created:${rubricId}:${version}`,
          now,
        ],
      );
      const outcome: Outcome = {
        entityVersion: version,
        receipt: {
          entity_id: rubricId,
          receipt_id: receiptId,
          audit_event_id: auditId,
          timestamp: now.toISOString(),
          idempotent: false,
          next_actions: nextActions,
        },
      };
      await client.query(
        `INSERT INTO idempotency_key (id,scope_kind,tenant_id,credential_fingerprint,idempotency_key,request_hash,status,response_status,response_body,created_at,expires_at)
         VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',200,$5::jsonb,$6,$7)`,
        [
          `idk_${commandFingerprint({ tenantId: context.tenantId, key: context.idempotencyKey })}`,
          context.tenantId,
          context.idempotencyKey,
          requestHash,
          JSON.stringify(outcome),
          now,
          new Date(now.getTime() + 86400000),
        ],
      );
      return outcome;
    });
  }
}
