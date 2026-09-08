import type {
  ChallengeEvaluationNextAction,
  ChallengeEvaluationResource,
  EvaluationRosterProposalResource,
  MutationReceipt,
  OpenChallengeEvaluationBody,
} from "@rahhal/contracts";
import {
  evaluationBlockingProposalStates,
  evaluationRosterProposalStates,
  isChallengeStage,
  isEvaluationRosterProposalState,
  parseAuditEventId,
  parseChallengeId,
  parseChallengeVersionId,
  parsePrefixedId,
  parseProposalId,
  parseProposalVersionId,
  parseReceiptId,
  requiredReviewsPerEligibleProposal,
  type ChallengeId,
  type EvaluationReadinessBlocker,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import type { EvaluationPort } from "../evaluation-port.js";
import type {
  IdFactory,
  MutationOutcome,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { commandFingerprint } from "../primitives.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ChallengeRow = {
  readonly id: string;
  readonly published_version_id: string | null;
  readonly stage: string;
  readonly publication_state: "open" | "paused" | "closed" | "cancelled" | null;
  readonly proposal_deadline_at: Date | null;
  readonly lock_version: string;
};
type EvaluationRow = {
  readonly challenge_version_id: string;
  readonly rubric_version_id: string;
  readonly required_reviews: number;
  readonly opened_at: Date;
};
type ProposalRow = {
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly tracking_code: string | null;
  readonly state: string;
  readonly locked_at: Date | null;
  readonly accepted_challenge_version_id: string | null;
  readonly has_active_grant: boolean;
};
type RosterRow = {
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly tracking_code: string;
  readonly source_state: string;
};
type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};
type Outcome = MutationOutcome<ChallengeId, ChallengeEvaluationNextAction>;

const evaluationNextActions = [
  "assign_reviewers",
  "record_no_award",
] as const satisfies readonly ChallengeEvaluationNextAction[];

function authorize(scope: WorkspaceScope): void {
  if (scope.role !== "org:owner" && scope.role !== "org:member") throw forbidden();
}

function lockVersion(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid challenge version");
  return result;
}

function cachedOutcome(value: unknown): Outcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid evaluation replay evidence");
  }
  const record = value as Record<string, unknown>;
  const receiptValue = record["receipt"];
  if (!receiptValue || typeof receiptValue !== "object" || Array.isArray(receiptValue)) {
    throw new Error("Invalid evaluation replay evidence");
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
      (item) =>
        typeof item === "string" &&
        evaluationNextActions.includes(item as ChallengeEvaluationNextAction),
    )
  ) {
    throw new Error("Invalid evaluation replay evidence");
  }
  const receipt: MutationReceipt<ChallengeId, ChallengeEvaluationNextAction> = {
    entity_id: parseChallengeId(receiptRecord["entity_id"]),
    receipt_id: parseReceiptId(receiptRecord["receipt_id"]),
    audit_event_id: parseAuditEventId(receiptRecord["audit_event_id"]),
    timestamp: new Date(receiptRecord["timestamp"]).toISOString(),
    idempotent: true,
    next_actions: receiptRecord["next_actions"] as readonly ChallengeEvaluationNextAction[],
  };
  return { entityVersion: record["entityVersion"] as number, receipt };
}

function rosterResource(row: RosterRow | ProposalRow): EvaluationRosterProposalResource {
  const sourceState = "source_state" in row ? row.source_state : row.state;
  if (!isEvaluationRosterProposalState(sourceState) || row.tracking_code === null) {
    throw new Error("Invalid persisted evaluation roster");
  }
  return {
    proposal_id: parseProposalId(row.proposal_id),
    proposal_version_id: parseProposalVersionId(row.proposal_version_id),
    tracking_code: row.tracking_code,
    source_state: sourceState,
  };
}

export class PostgresEvaluationAdapter implements EvaluationPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly ids: IdFactory,
  ) {}

  private async challenge(
    client: PoolClient,
    scope: WorkspaceScope,
    challengeId: string,
    lock: boolean,
  ): Promise<ChallengeRow> {
    authorize(scope);
    const result = await client.query<ChallengeRow>(
      `SELECT id, published_version_id, stage, publication_state, proposal_deadline_at,
              lock_version::text
       FROM challenge
       WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3
       ${lock ? "FOR UPDATE" : ""}`,
      [scope.tenantId, scope.workspaceId, challengeId],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  private async evaluation(client: PoolClient, challengeId: string): Promise<EvaluationRow | null> {
    const result = await client.query<EvaluationRow>(
      `SELECT challenge_version_id, rubric_version_id, required_reviews, opened_at
       FROM challenge_evaluation WHERE challenge_id = $1`,
      [challengeId],
    );
    return result.rows[0] ?? null;
  }

  private async latestRubric(
    client: PoolClient,
    tenantId: string,
    challengeId: string,
    challengeVersionId: string | null,
  ): Promise<string | null> {
    if (!challengeVersionId) return null;
    const result = await client.query<{ id: string }>(
      `SELECT rv.id
       FROM rubric r JOIN rubric_version rv ON rv.rubric_id = r.id
       WHERE r.tenant_id = $1 AND r.challenge_id = $2 AND r.challenge_version_id = $3
       ORDER BY rv.version_number DESC LIMIT 1`,
      [tenantId, challengeId, challengeVersionId],
    );
    return result.rows[0]?.id ?? null;
  }

  private async proposals(
    client: PoolClient,
    scope: WorkspaceScope,
    challengeId: string,
    lock: boolean,
  ): Promise<readonly ProposalRow[]> {
    const relevantStates = [...evaluationRosterProposalStates, ...evaluationBlockingProposalStates];
    const result = await client.query<ProposalRow>(
      `SELECT p.id AS proposal_id, p.current_version_id AS proposal_version_id,
              p.tracking_code, p.state, pv.locked_at, pv.accepted_challenge_version_id,
              EXISTS (
                SELECT 1 FROM access_grant grant_row
                WHERE grant_row.resource_type = 'proposal'
                  AND grant_row.resource_id = p.id
                  AND grant_row.proposal_version_id = p.current_version_id
                  AND grant_row.capability = 'read'
                  AND grant_row.state = 'active'
                  AND grant_row.valid_from <= transaction_timestamp()
                  AND grant_row.expires_at > transaction_timestamp()
                  AND grant_row.grantor_tenant_id = p.tenant_id
                  AND grant_row.grantor_workspace_id = p.owner_workspace_id
                  AND grant_row.grantee_tenant_id = $1
                  AND grant_row.grantee_workspace_id = $2
              ) AS has_active_grant
       FROM proposal p
       JOIN proposal_version pv
         ON pv.id = p.current_version_id AND pv.proposal_id = p.id
       WHERE p.challenge_id = $3 AND p.state = ANY($4::text[])
       ORDER BY p.id
       ${lock ? "FOR UPDATE OF p" : ""}`,
      [scope.tenantId, scope.workspaceId, challengeId, relevantStates],
    );
    return result.rows;
  }

  private classify(
    challenge: ChallengeRow,
    rubricVersionId: string | null,
    proposals: readonly ProposalRow[],
    now: Date,
  ): {
    readonly blockers: readonly EvaluationReadinessBlocker[];
    readonly roster: readonly EvaluationRosterProposalResource[];
    readonly qualifyingCount: number;
    readonly unresolvedCount: number;
  } {
    const blockers: EvaluationReadinessBlocker[] = [];
    const windowClosed =
      challenge.publication_state === "closed" ||
      (challenge.publication_state !== "cancelled" &&
        challenge.proposal_deadline_at !== null &&
        challenge.proposal_deadline_at.getTime() <= now.getTime());
    if (challenge.stage !== "published") blockers.push("challenge_not_published");
    if (!windowClosed) blockers.push("submission_window_open");
    if (!rubricVersionId) blockers.push("rubric_missing");

    const accessible = proposals.filter((row) => row.has_active_grant);
    const qualifying = accessible.filter((row) =>
      evaluationRosterProposalStates.includes(
        row.state as (typeof evaluationRosterProposalStates)[number],
      ),
    );
    const unresolvedCount = accessible.filter((row) =>
      evaluationBlockingProposalStates.includes(
        row.state as (typeof evaluationBlockingProposalStates)[number],
      ),
    ).length;
    if (unresolvedCount > 0) blockers.push("proposal_workflow_unresolved");

    let invalid = false;
    let rosterUnavailable = proposals.some((row) => !row.has_active_grant);
    const roster: EvaluationRosterProposalResource[] = [];
    for (const row of qualifying) {
      const valid =
        row.tracking_code !== null &&
        row.locked_at !== null &&
        challenge.published_version_id !== null &&
        row.accepted_challenge_version_id === challenge.published_version_id;
      if (!valid) {
        invalid = true;
        continue;
      }
      roster.push(rosterResource(row));
    }
    rosterUnavailable ||= invalid;
    if (rosterUnavailable) blockers.push("proposal_roster_unavailable");
    return {
      blockers,
      roster,
      qualifyingCount: qualifying.length,
      unresolvedCount,
    };
  }

  async get(
    scope: WorkspaceScope,
    challengeId: string,
  ): Promise<ChallengeEvaluationResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challenge = await this.challenge(client, scope, challengeId, false);
      if (!isChallengeStage(challenge.stage)) throw new Error("Invalid persisted challenge stage");
      const version = lockVersion(challenge.lock_version);
      const snapshot = await this.evaluation(client, challenge.id);
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      if (snapshot) {
        const rows = await client.query<RosterRow>(
          `SELECT ep.proposal_id, ep.proposal_version_id, p.tracking_code, ep.source_state
           FROM evaluation_proposal ep
           JOIN proposal p ON p.id = ep.proposal_id
           WHERE ep.challenge_id = $1 ORDER BY ep.proposal_id`,
          [challenge.id],
        );
        const roster = rows.rows.map(rosterResource);
        return {
          challenge_id: parseChallengeId(challenge.id),
          challenge_version_id: parseChallengeVersionId(snapshot.challenge_version_id),
          stage: challenge.stage,
          publication_state: challenge.publication_state,
          proposal_deadline_at: challenge.proposal_deadline_at?.toISOString() ?? null,
          window_closed: true,
          rubric_version_id: parsePrefixedId(snapshot.rubric_version_id, "rbv"),
          required_reviews: requiredReviewsPerEligibleProposal,
          qualifying_proposal_count: roster.length,
          unresolved_proposal_count: 0,
          ready: true,
          blockers: [],
          roster,
          opened_at: snapshot.opened_at.toISOString(),
          version,
        };
      }

      const rubricVersionId = await this.latestRubric(
        client,
        scope.tenantId,
        challenge.id,
        challenge.published_version_id,
      );
      const proposalRows = await this.proposals(client, scope, challenge.id, false);
      const readiness = this.classify(challenge, rubricVersionId, proposalRows, now);
      const windowClosed =
        challenge.publication_state === "closed" ||
        (challenge.publication_state !== "cancelled" &&
          challenge.proposal_deadline_at !== null &&
          challenge.proposal_deadline_at.getTime() <= now.getTime());
      return {
        challenge_id: parseChallengeId(challenge.id),
        challenge_version_id: challenge.published_version_id
          ? parseChallengeVersionId(challenge.published_version_id)
          : null,
        stage: challenge.stage,
        publication_state: challenge.publication_state,
        proposal_deadline_at: challenge.proposal_deadline_at?.toISOString() ?? null,
        window_closed: windowClosed,
        rubric_version_id: rubricVersionId ? parsePrefixedId(rubricVersionId, "rbv") : null,
        required_reviews: requiredReviewsPerEligibleProposal,
        qualifying_proposal_count: readiness.qualifyingCount,
        unresolved_proposal_count: readiness.unresolvedCount,
        ready: readiness.blockers.length === 0,
        blockers: readiness.blockers,
        roster: readiness.roster,
        opened_at: null,
        version,
      };
    });
  }

  async open(
    challengeId: string,
    body: OpenChallengeEvaluationBody,
    context: WorkspaceCommandContext,
  ): Promise<Outcome> {
    authorize(context);
    const requestHash = commandFingerprint({
      action: "challenge.evaluation.open",
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
        if (replay.rows[0].request_hash !== requestHash) throw idempotencyConflict();
        if (replay.rows[0].status !== "completed") {
          throw new Error("Invalid evaluation replay evidence");
        }
        return cachedOutcome(replay.rows[0].response_body);
      }

      const currentVersion = lockVersion(challenge.lock_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      if (challenge.stage !== "published" || !challenge.published_version_id) {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "Only a published challenge can enter evaluation",
          {
            currentState: challenge.stage,
          },
        );
      }
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      const rubricVersionId = await this.latestRubric(
        client,
        context.tenantId,
        challenge.id,
        challenge.published_version_id,
      );
      const proposalRows = await this.proposals(client, context, challenge.id, true);
      const readiness = this.classify(challenge, rubricVersionId, proposalRows, now);
      if (readiness.blockers.length > 0) {
        throw new ApiProblem(409, "INVALID_STATE", "Evaluation prerequisites are incomplete", {
          currentState: challenge.stage,
          recovery: readiness.blockers.join(","),
        });
      }
      if (!rubricVersionId) throw new Error("Evaluation rubric disappeared after readiness check");

      const entityVersion = currentVersion + 1;
      await client.query(
        `INSERT INTO challenge_evaluation (
           challenge_id, tenant_id, workspace_id, challenge_version_id, rubric_version_id,
           required_reviews, challenge_lock_version, opened_by_user_id, opened_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          challenge.id,
          context.tenantId,
          context.workspaceId,
          challenge.published_version_id,
          rubricVersionId,
          requiredReviewsPerEligibleProposal,
          entityVersion,
          context.actorUserId,
          now,
        ],
      );
      for (const item of readiness.roster) {
        await client.query(
          `INSERT INTO evaluation_proposal (
             challenge_id, proposal_id, proposal_version_id, source_state, snapshotted_at
           ) VALUES ($1,$2,$3,$4,$5)`,
          [challenge.id, item.proposal_id, item.proposal_version_id, item.source_state, now],
        );
      }
      await client.query(
        `UPDATE challenge
         SET stage = 'evaluating', publication_state = 'closed', lock_version = $2, updated_at = $3
         WHERE id = $1`,
        [challenge.id, entityVersion, now],
      );
      await client.query(
        `UPDATE challenge_public_projection SET state = 'closed'
         WHERE challenge_id = $1 AND state IS DISTINCT FROM 'closed'`,
        [challenge.id],
      );

      const auditId = parseAuditEventId(this.ids.next("aud"));
      const receiptId = parseReceiptId(this.ids.next("rcp"));
      const nextActions: ChallengeEvaluationNextAction[] = [
        readiness.roster.length > 0 ? "assign_reviewers" : "record_no_award",
      ];
      const metadata = JSON.stringify({
        entity_version: entityVersion,
        challenge_version_id: challenge.published_version_id,
        rubric_version_id: rubricVersionId,
        proposal_count: readiness.roster.length,
        required_reviews: requiredReviewsPerEligibleProposal,
      });
      await client.query(
        `INSERT INTO audit_event (
           id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,
           reason_code,target_type,target_id,metadata,occurred_at
         ) VALUES ($1,$2,$3,$4,'user',$5,'challenge.evaluation.started','success',
                   'MUTATION_COMMITTED','challenge',$6,$7::jsonb,$8)`,
        [
          auditId,
          context.correlationId,
          context.tenantId,
          context.workspaceId,
          context.actorUserId,
          challenge.id,
          metadata,
          now,
        ],
      );
      await client.query(
        `INSERT INTO mutation_receipt (
           id,tenant_id,workspace_id,entity_type,entity_id,entity_version,audit_event_id,
           correlation_id,next_actions,occurred_at
         ) VALUES ($1,$2,$3,'challenge',$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          receiptId,
          context.tenantId,
          context.workspaceId,
          challenge.id,
          entityVersion,
          auditId,
          context.correlationId,
          JSON.stringify(nextActions),
          now,
        ],
      );
      await client.query(
        `INSERT INTO outbox_event (
           id,tenant_id,correlation_id,event_type,schema_version,aggregate_type,aggregate_id,
           payload,dedupe_key,occurred_at,available_at
         ) VALUES ($1,$2,$3,'challenge.evaluation.started',1,'challenge',$4,$5::jsonb,$6,$7,$7)`,
        [
          this.ids.next("evt"),
          context.tenantId,
          context.correlationId,
          challenge.id,
          metadata,
          `challenge.evaluation.started:${challenge.id}:${entityVersion}`,
          now,
        ],
      );
      const outcome: Outcome = {
        entityVersion,
        receipt: {
          entity_id: parseChallengeId(challenge.id),
          receipt_id: receiptId,
          audit_event_id: auditId,
          timestamp: now.toISOString(),
          idempotent: false,
          next_actions: nextActions,
        },
      };
      await client.query(
        `INSERT INTO idempotency_key (
           id,scope_kind,tenant_id,credential_fingerprint,idempotency_key,request_hash,status,
           response_status,response_body,created_at,expires_at
         ) VALUES ($1,'tenant',$2,NULL,$3,$4,'completed',200,$5::jsonb,$6,$7)`,
        [
          `idk_${commandFingerprint({ tenantId: context.tenantId, key: context.idempotencyKey })}`,
          context.tenantId,
          context.idempotencyKey,
          requestHash,
          JSON.stringify(outcome),
          now,
          new Date(now.getTime() + 86_400_000),
        ],
      );
      return outcome;
    });
  }
}
