import type {
  CancelReviewAssignmentBody,
  CreateReviewAssignmentBody,
  MutationReceipt,
  OperationsReviewAssignmentListQuery,
  OperationsReviewAssignmentListResource,
  OperationsReviewAssignmentResource,
  OperationsEvaluationProposalResource,
  ReplaceReviewAssignmentBody,
  ReviewAssignmentListQuery,
  ReviewAssignmentListResource,
  ReviewAssignmentNextAction,
  ReviewAssignmentResource,
  ReviewerCandidateResource,
} from "@rahhal/contracts";
import {
  isReviewCoiState,
  isReviewState,
  parseAuditEventId,
  parseChallengeId,
  parseMembershipId,
  parseProposalId,
  parseProposalVersionId,
  parseReceiptId,
  parseReviewAssignmentId,
  parseRubricVersionId,
  parseUserId,
  type ReviewAssignmentId,
} from "@rahhal/domain";
import type { PoolClient } from "pg";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import type {
  IdFactory,
  MutationOutcome,
  ReviewerScope,
  ReviewPort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { commandFingerprint } from "../primitives.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ReviewerRow = {
  readonly id: string;
  readonly state: string;
  readonly coi_status: string;
  readonly due_at: Date;
  readonly overdue: boolean;
  readonly lock_version: string;
};
type OperationsRow = ReviewerRow & {
  readonly challenge_id: string;
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly tracking_code: string;
  readonly rubric_version_id: string;
  readonly reviewer_membership_id: string;
  readonly reviewer_user_id: string;
  readonly reviewer_display_name: string;
  readonly replaces_assignment_id: string | null;
  readonly cancellation_reason: string | null;
  readonly cancelled_at: Date | null;
};
type CandidateRow = {
  readonly membership_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly active_assignment_count: string;
};
type EvaluationProposalRow = {
  readonly challenge_id: string;
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly tracking_code: string;
  readonly rubric_version_id: string;
  readonly evaluation_version: string;
  readonly required_reviews: number;
  readonly active_assignment_count: string;
};
type EvaluationRow = {
  readonly challenge_id: string;
  readonly tenant_id: string;
  readonly rubric_version_id: string;
  readonly required_reviews: number;
  readonly lock_version: string;
  readonly stage: string;
};
type AssignmentRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly tenant_id: string;
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly rubric_version_id: string;
  readonly reviewer_membership_id: string;
  readonly reviewer_user_id: string;
  readonly state: string;
  readonly lock_version: string;
};
type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};
type Outcome = MutationOutcome<ReviewAssignmentId, ReviewAssignmentNextAction>;

const nextActions = [
  "await_coi",
  "assign_replacement",
] as const satisfies readonly ReviewAssignmentNextAction[];

function version(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Invalid assignment version");
  return parsed;
}

function reviewerResource(row: ReviewerRow): ReviewAssignmentResource {
  if (!isReviewState(row.state) || !isReviewCoiState(row.coi_status)) {
    throw new Error("Invalid stored assignment bookkeeping");
  }
  return {
    id: parseReviewAssignmentId(row.id),
    state: row.state,
    coi_status: row.coi_status,
    due_at: row.due_at.toISOString(),
    overdue: row.overdue,
    version: version(row.lock_version),
  };
}

function operationsResource(row: OperationsRow): OperationsReviewAssignmentResource {
  return {
    ...reviewerResource(row),
    challenge_id: parseChallengeId(row.challenge_id),
    proposal_id: parseProposalId(row.proposal_id),
    proposal_version_id: parseProposalVersionId(row.proposal_version_id),
    proposal_tracking_code: row.tracking_code,
    rubric_version_id: parseRubricVersionId(row.rubric_version_id),
    reviewer_membership_id: parseMembershipId(row.reviewer_membership_id),
    reviewer_user_id: parseUserId(row.reviewer_user_id),
    reviewer_display_name: row.reviewer_display_name,
    replaces_assignment_id: row.replaces_assignment_id
      ? parseReviewAssignmentId(row.replaces_assignment_id)
      : null,
    cancellation_reason: row.cancellation_reason,
    cancelled_at: row.cancelled_at?.toISOString() ?? null,
  };
}

function candidateResource(row: CandidateRow): ReviewerCandidateResource {
  const count = Number(row.active_assignment_count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid reviewer workload");
  return {
    membership_id: parseMembershipId(row.membership_id),
    user_id: parseUserId(row.user_id),
    display_name: row.display_name,
    active_assignment_count: count,
  };
}

function evaluationProposalResource(
  row: EvaluationProposalRow,
): OperationsEvaluationProposalResource {
  const count = Number(row.active_assignment_count);
  if (!Number.isSafeInteger(count) || count < 0 || count > row.required_reviews) {
    throw new Error("Invalid evaluation assignment count");
  }
  if (row.required_reviews !== 2) throw new Error("Invalid evaluation review policy");
  return {
    challenge_id: parseChallengeId(row.challenge_id),
    proposal_id: parseProposalId(row.proposal_id),
    proposal_version_id: parseProposalVersionId(row.proposal_version_id),
    proposal_tracking_code: row.tracking_code,
    rubric_version_id: parseRubricVersionId(row.rubric_version_id),
    evaluation_version: version(row.evaluation_version),
    required_reviews: 2,
    active_assignment_count: count,
  };
}

function reviewerParameters(scope: ReviewerScope): string[] {
  if (scope.role !== "platform:reviewer") throw forbidden();
  return [scope.membershipId, scope.actorUserId, scope.tenantId, scope.workspaceId];
}

function authorizeOperations(scope: WorkspaceScope): void {
  if (scope.role !== "platform:ops") throw forbidden();
}

function cachedOutcome(value: unknown): Outcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid assignment replay evidence");
  }
  const record = value as Record<string, unknown>;
  const receiptValue = record["receipt"];
  if (!receiptValue || typeof receiptValue !== "object" || Array.isArray(receiptValue)) {
    throw new Error("Invalid assignment replay evidence");
  }
  const receiptRecord = receiptValue as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record["entityVersion"]) ||
    Number(record["entityVersion"]) < 1 ||
    typeof receiptRecord["entity_id"] !== "string" ||
    typeof receiptRecord["receipt_id"] !== "string" ||
    typeof receiptRecord["audit_event_id"] !== "string" ||
    typeof receiptRecord["timestamp"] !== "string" ||
    !Array.isArray(receiptRecord["next_actions"]) ||
    !receiptRecord["next_actions"].every(
      (item) =>
        typeof item === "string" && nextActions.includes(item as ReviewAssignmentNextAction),
    )
  ) {
    throw new Error("Invalid assignment replay evidence");
  }
  const receipt: MutationReceipt<ReviewAssignmentId, ReviewAssignmentNextAction> = {
    entity_id: parseReviewAssignmentId(receiptRecord["entity_id"]),
    receipt_id: parseReceiptId(receiptRecord["receipt_id"]),
    audit_event_id: parseAuditEventId(receiptRecord["audit_event_id"]),
    timestamp: new Date(receiptRecord["timestamp"]).toISOString(),
    idempotent: true,
    next_actions: receiptRecord["next_actions"] as readonly ReviewAssignmentNextAction[],
  };
  return { entityVersion: record["entityVersion"] as number, receipt };
}

const reviewerRows = `
  SELECT assignment.id, assignment.state, coi.coi_status, assignment.due_at,
         (assignment.due_at < transaction_timestamp()) AS overdue,
         assignment.lock_version
  FROM membership membership
  JOIN review_assignment assignment
    ON assignment.reviewer_membership_id = membership.id
   AND assignment.reviewer_user_id = membership.user_id
  JOIN coi_declaration coi ON coi.assignment_id = assignment.id
  WHERE membership.id = $1 AND membership.user_id = $2
    AND membership.tenant_id = $3 AND membership.workspace_id = $4
    AND membership.state = 'active'
    AND membership.role = 'platform:reviewer'
    AND membership.workspace_kind = 'platform'
    AND assignment.state NOT IN ('cancelled', 'invalidated')
`;

export class PostgresReviewAdapter implements ReviewPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly ids: IdFactory,
  ) {}

  async list(
    scope: ReviewerScope,
    query: ReviewAssignmentListQuery,
  ): Promise<ReviewAssignmentListResource> {
    const params = reviewerParameters(scope);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    return this.unitOfWork.run(async () => {
      const rows = await this.unitOfWork.currentClient().query<ReviewerRow>(
        `${reviewerRows}
         AND ($5::text IS NULL OR assignment.id > $5)
         AND ($6::text IS NULL OR assignment.state = $6)
         ORDER BY assignment.id LIMIT $7`,
        [...params, query.cursor ?? null, query.state ?? null, limit + 1],
      );
      const items = rows.rows.slice(0, limit).map(reviewerResource);
      return { items, ...(rows.rows.length > limit ? { next_cursor: items.at(-1)!.id } : {}) };
    });
  }

  async get(scope: ReviewerScope, id: string): Promise<ReviewAssignmentResource | null> {
    const params = reviewerParameters(scope);
    return this.unitOfWork.run(async () => {
      const rows = await this.unitOfWork
        .currentClient()
        .query<ReviewerRow>(`${reviewerRows} AND assignment.id = $5`, [...params, id]);
      return rows.rows[0] ? reviewerResource(rows.rows[0]) : null;
    });
  }

  async listOperations(
    scope: WorkspaceScope,
    query: OperationsReviewAssignmentListQuery,
  ): Promise<OperationsReviewAssignmentListResource> {
    authorizeOperations(scope);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const assignments = await client.query<OperationsRow>(
        `SELECT assignment.id, assignment.challenge_id, assignment.proposal_id,
                assignment.proposal_version_id, proposal.tracking_code,
                assignment.rubric_version_id, assignment.reviewer_membership_id,
                assignment.reviewer_user_id, reviewer.display_name AS reviewer_display_name,
                assignment.state, coi.coi_status, assignment.due_at,
                (assignment.state NOT IN ('cancelled', 'invalidated')
                  AND assignment.due_at < transaction_timestamp()) AS overdue,
                assignment.lock_version, assignment.replaces_assignment_id,
                assignment.cancellation_reason, assignment.cancelled_at
         FROM review_assignment assignment
         JOIN proposal ON proposal.id = assignment.proposal_id
         JOIN app_user reviewer ON reviewer.id = assignment.reviewer_user_id
         JOIN coi_declaration coi ON coi.assignment_id = assignment.id
         WHERE ($1::text IS NULL OR assignment.challenge_id = $1)
         ORDER BY assignment.created_at, assignment.id
         LIMIT 500`,
        [query.challenge_id ?? null],
      );
      const candidates = await client.query<CandidateRow>(
        `SELECT membership.id AS membership_id, membership.user_id,
                reviewer.display_name, count(assignment.id)::text AS active_assignment_count
         FROM membership
         JOIN app_user reviewer ON reviewer.id = membership.user_id
         LEFT JOIN review_assignment assignment
           ON assignment.reviewer_membership_id = membership.id
          AND assignment.reviewer_user_id = membership.user_id
          AND assignment.state NOT IN ('cancelled', 'invalidated')
         WHERE membership.tenant_id = $1 AND membership.workspace_id = $2
           AND membership.workspace_kind = 'platform'
           AND membership.role = 'platform:reviewer' AND membership.state = 'active'
         GROUP BY membership.id, membership.user_id, reviewer.display_name
         ORDER BY reviewer.display_name, membership.id
         LIMIT 500`,
        [scope.tenantId, scope.workspaceId],
      );
      const evaluations = await client.query<EvaluationProposalRow>(
        `SELECT snapshot.challenge_id, roster.proposal_id, roster.proposal_version_id,
                proposal.tracking_code, snapshot.rubric_version_id,
                challenge.lock_version::text AS evaluation_version,
                snapshot.required_reviews,
                count(assignment.id)
                  FILTER (WHERE assignment.state NOT IN ('cancelled', 'invalidated'))::text
                  AS active_assignment_count
         FROM challenge_evaluation snapshot
         JOIN challenge ON challenge.id = snapshot.challenge_id AND challenge.stage = 'evaluating'
         JOIN evaluation_proposal roster ON roster.challenge_id = snapshot.challenge_id
         JOIN proposal ON proposal.id = roster.proposal_id
         LEFT JOIN review_assignment assignment
           ON assignment.challenge_id = roster.challenge_id
          AND assignment.proposal_id = roster.proposal_id
         WHERE ($1::text IS NULL OR snapshot.challenge_id = $1)
         GROUP BY snapshot.challenge_id, roster.proposal_id, roster.proposal_version_id,
                  proposal.tracking_code, snapshot.rubric_version_id,
                  challenge.lock_version, snapshot.required_reviews
         ORDER BY snapshot.challenge_id, proposal.tracking_code
         LIMIT 500`,
        [query.challenge_id ?? null],
      );
      return {
        evaluation_proposals: evaluations.rows.map(evaluationProposalResource),
        assignments: assignments.rows.map(operationsResource),
        reviewers: candidates.rows.map(candidateResource),
      };
    });
  }

  async create(
    body: CreateReviewAssignmentBody,
    context: WorkspaceCommandContext,
  ): Promise<Outcome> {
    authorizeOperations(context);
    const requestHash = commandFingerprint({
      action: "review.assignment.create",
      actor: context.actorUserId,
      workspace: context.workspaceId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const evaluation = await this.evaluation(client, body.challenge_id);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return replay;
      if (evaluation.stage !== "evaluating") throw notFound();
      const challengeVersion = version(evaluation.lock_version);
      if (body.expected_version !== challengeVersion) throw staleVersion(challengeVersion);
      const now = await this.now(client);
      const dueAt = this.dueAt(body.due_at, now);
      const reviewer = await this.reviewer(client, context, body.reviewer_membership_id);
      await this.assertRosterAndCapacity(client, evaluation, body.proposal_id, reviewer.user_id);

      const assignmentId = parseReviewAssignmentId(this.ids.next("rva"));
      const insert = await client.query(
        `INSERT INTO review_assignment (
           id, tenant_id, challenge_id, proposal_id, proposal_version_id, rubric_version_id,
           reviewer_membership_id, reviewer_user_id, state, lock_version, due_at,
           created_by_user_id, created_at
         )
         SELECT $1, snapshot.tenant_id, snapshot.challenge_id, roster.proposal_id,
                roster.proposal_version_id, snapshot.rubric_version_id,
                $4, $5, 'coi-gate', 1, $6, $7, $8
         FROM challenge_evaluation snapshot
         JOIN evaluation_proposal roster ON roster.challenge_id = snapshot.challenge_id
         WHERE snapshot.challenge_id = $2 AND roster.proposal_id = $3`,
        [
          assignmentId,
          body.challenge_id,
          body.proposal_id,
          reviewer.membership_id,
          reviewer.user_id,
          dueAt,
          context.actorUserId,
          now,
        ],
      );
      if (insert.rowCount !== 1) throw notFound();
      await this.bumpChallenge(client, evaluation.challenge_id, challengeVersion + 1, now);
      return this.recordMutation(client, context, {
        action: "review.assignment.created",
        assignmentId,
        entityVersion: 1,
        nextAction: "await_coi",
        requestHash,
        now,
        metadata: {
          challenge_id: evaluation.challenge_id,
          proposal_id: body.proposal_id,
          reviewer_user_id: reviewer.user_id,
          due_at: dueAt.toISOString(),
        },
        eventMetadata: {
          challenge_id: evaluation.challenge_id,
          proposal_id: body.proposal_id,
        },
      });
    });
  }

  async cancel(
    id: string,
    body: CancelReviewAssignmentBody,
    context: WorkspaceCommandContext,
  ): Promise<Outcome> {
    authorizeOperations(context);
    return this.cancelOrReplace(id, body, context, null);
  }

  async replace(
    id: string,
    body: ReplaceReviewAssignmentBody,
    context: WorkspaceCommandContext,
  ): Promise<Outcome> {
    authorizeOperations(context);
    return this.cancelOrReplace(id, body, context, body);
  }

  private async cancelOrReplace(
    id: string,
    body: CancelReviewAssignmentBody,
    context: WorkspaceCommandContext,
    replacement: ReplaceReviewAssignmentBody | null,
  ): Promise<Outcome> {
    const reason = body.reason.trim();
    if (!reason) throw new ApiProblem(422, "VALIDATION", "A cancellation reason is required");
    const action = replacement ? "review.assignment.replaced" : "review.assignment.cancelled";
    const requestHash = commandFingerprint({
      action,
      actor: context.actorUserId,
      workspace: context.workspaceId,
      id,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      await this.lockIdempotency(client, context);
      const initial = await this.assignment(client, id, false);
      const evaluation = await this.evaluation(client, initial.challenge_id);
      const current = await this.assignment(client, id, true);
      const replay = await this.replay(client, context, requestHash);
      if (replay) return replay;
      if (evaluation.stage !== "evaluating") throw notFound();
      const currentVersion = version(current.lock_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      if (current.state !== "coi-gate") {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "Only a pending COI assignment can change in D4",
          {
            currentState: current.state,
          },
        );
      }
      const now = await this.now(client);
      await client.query(
        `UPDATE review_assignment
         SET state = 'cancelled', lock_version = lock_version + 1,
             cancellation_reason = $2, cancelled_by_user_id = $3, cancelled_at = $4
         WHERE id = $1`,
        [current.id, reason, context.actorUserId, now],
      );

      let targetId = parseReviewAssignmentId(current.id);
      let entityVersion = currentVersion + 1;
      let nextAction: ReviewAssignmentNextAction = "assign_replacement";
      let reviewerUserId: string | null = null;
      let dueAt: Date | null = null;
      if (replacement) {
        dueAt = this.dueAt(replacement.due_at, now);
        const reviewer = await this.reviewer(client, context, replacement.reviewer_membership_id);
        reviewerUserId = reviewer.user_id;
        if (reviewer.user_id === current.reviewer_user_id) {
          throw new ApiProblem(409, "CONFLICT", "A replacement must use a different reviewer");
        }
        await this.assertNoReviewerHistory(
          client,
          current.challenge_id,
          current.proposal_id,
          reviewer.user_id,
        );
        targetId = parseReviewAssignmentId(this.ids.next("rva"));
        const insert = await client.query(
          `INSERT INTO review_assignment (
             id, tenant_id, challenge_id, proposal_id, proposal_version_id, rubric_version_id,
             reviewer_membership_id, reviewer_user_id, state, lock_version, due_at,
             created_by_user_id, created_at, replaces_assignment_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'coi-gate',1,$9,$10,$11,$12)`,
          [
            targetId,
            current.tenant_id,
            current.challenge_id,
            current.proposal_id,
            current.proposal_version_id,
            current.rubric_version_id,
            reviewer.membership_id,
            reviewer.user_id,
            dueAt,
            context.actorUserId,
            now,
            current.id,
          ],
        );
        if (insert.rowCount !== 1) throw new Error("Review assignment replacement insert failed");
        entityVersion = 1;
        nextAction = "await_coi";
      }
      const challengeVersion = version(evaluation.lock_version);
      await this.bumpChallenge(client, evaluation.challenge_id, challengeVersion + 1, now);
      return this.recordMutation(client, context, {
        action,
        assignmentId: targetId,
        entityVersion,
        nextAction,
        requestHash,
        now,
        metadata: {
          challenge_id: current.challenge_id,
          proposal_id: current.proposal_id,
          cancelled_assignment_id: current.id,
          reason,
          ...(reviewerUserId ? { reviewer_user_id: reviewerUserId } : {}),
          ...(dueAt ? { due_at: dueAt.toISOString() } : {}),
        },
        eventMetadata: {
          challenge_id: current.challenge_id,
          proposal_id: current.proposal_id,
          cancelled_assignment_id: current.id,
        },
      });
    });
  }

  private async evaluation(client: PoolClient, challengeId: string): Promise<EvaluationRow> {
    const result = await client.query<EvaluationRow>(
      `SELECT snapshot.challenge_id, snapshot.tenant_id, snapshot.rubric_version_id,
              snapshot.required_reviews, challenge.lock_version::text, challenge.stage
       FROM challenge_evaluation snapshot
       JOIN challenge ON challenge.id = snapshot.challenge_id
       WHERE snapshot.challenge_id = $1
       FOR UPDATE OF challenge`,
      [challengeId],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  private async assignment(client: PoolClient, id: string, lock: boolean): Promise<AssignmentRow> {
    const result = await client.query<AssignmentRow>(
      `SELECT id, challenge_id, tenant_id, proposal_id, proposal_version_id,
              rubric_version_id, reviewer_membership_id, reviewer_user_id,
              state, lock_version::text
       FROM review_assignment WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  private async reviewer(
    client: PoolClient,
    context: WorkspaceScope,
    membershipId: string,
  ): Promise<{ readonly membership_id: string; readonly user_id: string }> {
    const result = await client.query<{ membership_id: string; user_id: string }>(
      `SELECT id AS membership_id, user_id FROM membership
       WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
         AND workspace_kind = 'platform' AND role = 'platform:reviewer' AND state = 'active'
       FOR SHARE`,
      [membershipId, context.tenantId, context.workspaceId],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  private async assertRosterAndCapacity(
    client: PoolClient,
    evaluation: EvaluationRow,
    proposalId: string,
    reviewerUserId: string,
  ): Promise<void> {
    const roster = await client.query(
      `SELECT 1 FROM evaluation_proposal
       WHERE challenge_id = $1 AND proposal_id = $2`,
      [evaluation.challenge_id, proposalId],
    );
    if (!roster.rowCount) throw notFound();
    await this.assertNoReviewerHistory(client, evaluation.challenge_id, proposalId, reviewerUserId);
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM review_assignment
       WHERE challenge_id = $1 AND proposal_id = $2
         AND state NOT IN ('cancelled', 'invalidated')`,
      [evaluation.challenge_id, proposalId],
    );
    if (Number(count.rows[0]?.count ?? 0) >= evaluation.required_reviews) {
      throw new ApiProblem(409, "CONFLICT", "The proposal already has its required assignments", {
        recovery: "review_assignment_capacity_reached",
      });
    }
  }

  private async assertNoReviewerHistory(
    client: PoolClient,
    challengeId: string,
    proposalId: string,
    reviewerUserId: string,
  ): Promise<void> {
    const duplicate = await client.query(
      `SELECT 1 FROM review_assignment
       WHERE challenge_id = $1 AND proposal_id = $2 AND reviewer_user_id = $3`,
      [challengeId, proposalId, reviewerUserId],
    );
    if (duplicate.rowCount) {
      throw new ApiProblem(409, "CONFLICT", "The reviewer already has assignment history here", {
        recovery: "choose_independent_reviewer",
      });
    }
  }

  private dueAt(value: string, now: Date): Date {
    const dueAt = new Date(value);
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= now.getTime()) {
      throw new ApiProblem(422, "VALIDATION", "The assignment due date must be in the future", {
        fields: [
          {
            path: "due_at",
            code: "future_date",
            message: "The assignment due date must be in the future",
          },
        ],
      });
    }
    return dueAt;
  }

  private async now(client: PoolClient): Promise<Date> {
    return (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now")).rows[0]!
      .now;
  }

  private async bumpChallenge(
    client: PoolClient,
    challengeId: string,
    nextVersion: number,
    now: Date,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE challenge SET lock_version = $2, updated_at = $3
       WHERE id = $1 AND stage = 'evaluating'`,
      [challengeId, nextVersion, now],
    );
    if (updated.rowCount !== 1) throw new Error("Review assignment aggregate update failed");
  }

  private async lockIdempotency(
    client: PoolClient,
    context: WorkspaceCommandContext,
  ): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
    ]);
    await client.query(
      `DELETE FROM idempotency_key WHERE scope_kind = 'tenant' AND tenant_id = $1
       AND credential_fingerprint IS NULL AND idempotency_key = $2
       AND expires_at <= clock_timestamp()`,
      [context.tenantId, context.idempotencyKey],
    );
  }

  private async replay(
    client: PoolClient,
    context: WorkspaceCommandContext,
    requestHash: string,
  ): Promise<Outcome | null> {
    const replay = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, response_body FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1
         AND credential_fingerprint IS NULL AND idempotency_key = $2 FOR UPDATE`,
      [context.tenantId, context.idempotencyKey],
    );
    if (!replay.rows[0]) return null;
    if (replay.rows[0].request_hash !== requestHash) throw idempotencyConflict();
    if (replay.rows[0].status !== "completed") {
      throw new Error("Invalid assignment replay evidence");
    }
    return cachedOutcome(replay.rows[0].response_body);
  }

  private async recordMutation(
    client: PoolClient,
    context: WorkspaceCommandContext,
    input: {
      readonly action:
        | "review.assignment.created"
        | "review.assignment.cancelled"
        | "review.assignment.replaced";
      readonly assignmentId: ReviewAssignmentId;
      readonly entityVersion: number;
      readonly nextAction: ReviewAssignmentNextAction;
      readonly requestHash: string;
      readonly now: Date;
      readonly metadata: Readonly<Record<string, unknown>>;
      readonly eventMetadata: Readonly<Record<string, unknown>>;
    },
  ): Promise<Outcome> {
    const auditId = parseAuditEventId(this.ids.next("aud"));
    const receiptId = parseReceiptId(this.ids.next("rcp"));
    const metadata = JSON.stringify({ ...input.metadata, entity_version: input.entityVersion });
    const eventMetadata = JSON.stringify({
      ...input.eventMetadata,
      entity_version: input.entityVersion,
    });
    await client.query(
      `INSERT INTO audit_event (
         id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,
         reason_code,target_type,target_id,metadata,occurred_at
       ) VALUES ($1,$2,$3,$4,'user',$5,$6,'success','MUTATION_COMMITTED',
                 'review_assignment',$7,$8::jsonb,$9)`,
      [
        auditId,
        context.correlationId,
        context.tenantId,
        context.workspaceId,
        context.actorUserId,
        input.action,
        input.assignmentId,
        metadata,
        input.now,
      ],
    );
    await client.query(
      `INSERT INTO mutation_receipt (
         id,tenant_id,workspace_id,entity_type,entity_id,entity_version,audit_event_id,
         correlation_id,next_actions,occurred_at
       ) VALUES ($1,$2,$3,'review_assignment',$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        receiptId,
        context.tenantId,
        context.workspaceId,
        input.assignmentId,
        input.entityVersion,
        auditId,
        context.correlationId,
        JSON.stringify([input.nextAction]),
        input.now,
      ],
    );
    await client.query(
      `INSERT INTO outbox_event (
         id,tenant_id,correlation_id,event_type,schema_version,aggregate_type,aggregate_id,
         payload,dedupe_key,occurred_at,available_at
       ) VALUES ($1,$2,$3,$4,1,'review_assignment',$5,$6::jsonb,$7,$8,$8)`,
      [
        this.ids.next("evt"),
        context.tenantId,
        context.correlationId,
        input.action,
        input.assignmentId,
        eventMetadata,
        `${input.action}:${input.assignmentId}:${input.entityVersion}`,
        input.now,
      ],
    );
    const outcome: Outcome = {
      entityVersion: input.entityVersion,
      receipt: {
        entity_id: input.assignmentId,
        receipt_id: receiptId,
        audit_event_id: auditId,
        timestamp: input.now.toISOString(),
        idempotent: false,
        next_actions: [input.nextAction],
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
        input.requestHash,
        JSON.stringify(outcome),
        input.now,
        new Date(input.now.getTime() + 86_400_000),
      ],
    );
    return outcome;
  }
}
