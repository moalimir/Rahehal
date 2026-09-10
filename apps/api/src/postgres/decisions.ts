import type {
  CaseResource,
  ChallengeDecisionResource,
  DecisionProposalReference,
  DecisionShortlistResource,
  FinalDecisionResource,
  ProposalOutcomeResource,
  RecordChallengeDecisionBody,
  RecordChallengeDecisionNextAction,
  SaveDecisionShortlistBody,
  SaveDecisionShortlistNextAction,
} from "@rahhal/contracts";
import {
  isChallengeStage,
  isDecisionOutcome,
  isDecisionReasonCode,
  isDecisionReasonForOutcome,
  parseAuditEventId,
  parseCaseId,
  parseChallengeId,
  parseChallengeVersionId,
  parseDecisionId,
  parseDecisionShortlistVersionId,
  parseProposalId,
  parseProposalVersionId,
  parseReceiptId,
  parseRubricVersionId,
  requiredReviewsPerEligibleProposal,
  type ChallengeId,
  type ProposalDecisionOutcome,
} from "@rahhal/domain";

import type { DecisionCommandContext, DecisionPort } from "../decision-port.js";
import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import type {
  IdFactory,
  MutationOutcome,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "../ports.js";
import { commandFingerprint } from "../primitives.js";
import type { PostgresUnitOfWork } from "./unit-of-work.js";

type ChallengeRow = {
  readonly id: string;
  readonly published_version_id: string | null;
  readonly stage: string;
  readonly lock_version: string;
};
type SnapshotRow = {
  readonly challenge_version_id: string;
  readonly rubric_version_id: string;
  readonly required_reviews: number;
};
type RosterReviewRow = {
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly tracking_code: string;
  readonly proposal_lock_version: string;
  readonly solver_tenant_id: string;
  readonly solver_workspace_id: string;
  readonly assignment_id: string | null;
  readonly reviewer_user_id: string | null;
  readonly review_id: string | null;
};
type ShortlistRow = {
  readonly id: string;
  readonly version_number: number;
  readonly proposal_versions: unknown;
  readonly rationale: string;
  readonly recorded_at: Date;
};
type DecisionRow = {
  readonly id: string;
  readonly outcome: string;
  readonly selected_proposal_id: string | null;
  readonly selected_proposal_version_id: string | null;
  readonly reason_code: string;
  readonly rationale: string;
  readonly decided_at: Date;
};
type OutcomeRow = {
  readonly proposal_id: string;
  readonly outcome: string;
  readonly feedback: string;
};
type CaseRow = {
  readonly id: string;
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly proposal_id: string;
  readonly proposal_version_id: string;
  readonly decision_id: string;
  readonly state: string;
  readonly created_at: Date;
};
type IdempotencyRow = {
  readonly request_hash: string;
  readonly status: string;
  readonly response_body: unknown;
};
type DecisionOutcome = MutationOutcome<ChallengeId, RecordChallengeDecisionNextAction>;
type ShortlistOutcome = MutationOutcome<ChallengeId, SaveDecisionShortlistNextAction>;
type GroupedRoster = readonly {
  readonly proposal: RosterReviewRow;
  readonly reviews: readonly RosterReviewRow[];
}[];

function authorizeOrganization(scope: WorkspaceScope): void {
  if (scope.role !== "org:owner" && scope.role !== "org:member") throw forbidden();
}

function version(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid persisted version");
  return parsed;
}

function proposalReferences(value: unknown): readonly DecisionProposalReference[] {
  if (!Array.isArray(value)) throw new Error("Invalid persisted shortlist references");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid persisted shortlist references");
    }
    const row = item as Record<string, unknown>;
    return {
      proposal_id: parseProposalId(row["proposal_id"]),
      proposal_version_id: parseProposalVersionId(row["proposal_version_id"]),
    };
  });
}

function caseResource(row: CaseRow): CaseResource {
  if (row.state !== "created") throw new Error("Invalid persisted case state");
  return {
    id: parseCaseId(row.id),
    challenge_id: parseChallengeId(row.challenge_id),
    challenge_version_id: parseChallengeVersionId(row.challenge_version_id),
    proposal_id: parseProposalId(row.proposal_id),
    proposal_version_id: parseProposalVersionId(row.proposal_version_id),
    decision_id: parseDecisionId(row.decision_id),
    state: "created",
    created_at: row.created_at.toISOString(),
  };
}

function finalDecisionResource(row: DecisionRow): FinalDecisionResource {
  if (!isDecisionOutcome(row.outcome) || !isDecisionReasonCode(row.reason_code)) {
    throw new Error("Invalid persisted decision vocabulary");
  }
  return {
    id: parseDecisionId(row.id),
    outcome: row.outcome,
    selected_proposal_id: row.selected_proposal_id
      ? parseProposalId(row.selected_proposal_id)
      : null,
    selected_proposal_version_id: row.selected_proposal_version_id
      ? parseProposalVersionId(row.selected_proposal_version_id)
      : null,
    reason_code: row.reason_code,
    rationale: row.rationale,
    decided_at: row.decided_at.toISOString(),
  };
}

function cachedOutcome<
  NextAction extends RecordChallengeDecisionNextAction | SaveDecisionShortlistNextAction,
>(value: unknown, allowed: readonly NextAction[]): MutationOutcome<ChallengeId, NextAction> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid decision replay evidence");
  }
  const record = value as Record<string, unknown>;
  const receiptValue = record["receipt"];
  if (!receiptValue || typeof receiptValue !== "object" || Array.isArray(receiptValue)) {
    throw new Error("Invalid decision replay evidence");
  }
  const receipt = receiptValue as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record["entityVersion"]) ||
    typeof receipt["entity_id"] !== "string" ||
    typeof receipt["receipt_id"] !== "string" ||
    typeof receipt["audit_event_id"] !== "string" ||
    typeof receipt["timestamp"] !== "string" ||
    !Array.isArray(receipt["next_actions"]) ||
    receipt["next_actions"].some((item) => !allowed.includes(item as NextAction))
  ) {
    throw new Error("Invalid decision replay evidence");
  }
  return {
    entityVersion: record["entityVersion"] as number,
    receipt: {
      entity_id: parseChallengeId(receipt["entity_id"]),
      receipt_id: parseReceiptId(receipt["receipt_id"]),
      audit_event_id: parseAuditEventId(receipt["audit_event_id"]),
      timestamp: receipt["timestamp"],
      idempotent: true,
      next_actions: receipt["next_actions"] as readonly NextAction[],
    },
  };
}

function exactReferenceKey(reference: DecisionProposalReference): string {
  return `${reference.proposal_id}\0${reference.proposal_version_id}`;
}

export class PostgresDecisionAdapter implements DecisionPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly ids: IdFactory,
  ) {}

  private async challenge(
    scope: WorkspaceScope,
    challengeId: string,
    lock: boolean,
  ): Promise<ChallengeRow> {
    authorizeOrganization(scope);
    const result = await this.unitOfWork.currentClient().query<ChallengeRow>(
      `SELECT id, published_version_id, stage, lock_version FROM challenge
       WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3 ${lock ? "FOR UPDATE" : ""}`,
      [challengeId, scope.tenantId, scope.workspaceId],
    );
    const row = result.rows[0];
    if (!row) throw notFound();
    return row;
  }

  private async snapshot(challengeId: string): Promise<SnapshotRow> {
    const result = await this.unitOfWork.currentClient().query<SnapshotRow>(
      `SELECT challenge_version_id, rubric_version_id, required_reviews
       FROM challenge_evaluation WHERE challenge_id = $1`,
      [challengeId],
    );
    const row = result.rows[0];
    if (!row || row.required_reviews !== requiredReviewsPerEligibleProposal) {
      throw new Error("Decision requires a valid evaluation snapshot");
    }
    return row;
  }

  private async roster(
    challengeId: string,
    rubricVersionId: string,
  ): Promise<readonly RosterReviewRow[]> {
    const result = await this.unitOfWork.currentClient().query<RosterReviewRow>(
      `SELECT roster.proposal_id, roster.proposal_version_id, proposal.tracking_code,
              proposal.lock_version::text AS proposal_lock_version,
              proposal.tenant_id AS solver_tenant_id,
              proposal.owner_workspace_id AS solver_workspace_id,
              assignment.id AS assignment_id, assignment.reviewer_user_id, scorecard.id AS review_id
       FROM evaluation_proposal roster
       JOIN proposal ON proposal.id = roster.proposal_id
       LEFT JOIN review_assignment assignment
         ON assignment.challenge_id = roster.challenge_id
        AND assignment.proposal_id = roster.proposal_id
        AND assignment.proposal_version_id = roster.proposal_version_id
        AND assignment.rubric_version_id = $2
        AND assignment.state = 'locked'
       LEFT JOIN review_scorecard scorecard
         ON scorecard.assignment_id = assignment.id
        AND scorecard.locked_at IS NOT NULL AND scorecard.invalidated_at IS NULL
       WHERE roster.challenge_id = $1
       ORDER BY roster.proposal_id, assignment.id`,
      [challengeId, rubricVersionId],
    );
    return result.rows;
  }

  private groupedRoster(rows: readonly RosterReviewRow[]) {
    const grouped = new Map<string, { proposal: RosterReviewRow; reviews: RosterReviewRow[] }>();
    for (const row of rows) {
      const item = grouped.get(row.proposal_id) ?? { proposal: row, reviews: [] };
      if (row.assignment_id && row.reviewer_user_id && row.review_id) item.reviews.push(row);
      grouped.set(row.proposal_id, item);
    }
    return [...grouped.values()];
  }

  async get(scope: WorkspaceScope, challengeId: string): Promise<ChallengeDecisionResource | null> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challenge = await this.challenge(scope, challengeId, false);
      if (!isChallengeStage(challenge.stage)) throw new Error("Invalid persisted challenge stage");
      const snapshot = await this.snapshot(challenge.id);
      const grouped = this.groupedRoster(
        await this.roster(challenge.id, snapshot.rubric_version_id),
      );
      const shortlistResult = await client.query<ShortlistRow>(
        `SELECT id, version_number, proposal_versions, rationale, recorded_at
         FROM decision_shortlist_version WHERE challenge_id = $1
         ORDER BY version_number DESC LIMIT 1`,
        [challenge.id],
      );
      const shortlistRow = shortlistResult.rows[0];
      const shortlist: DecisionShortlistResource | null = shortlistRow
        ? {
            id: parseDecisionShortlistVersionId(shortlistRow.id),
            version_number: shortlistRow.version_number,
            proposal_versions: proposalReferences(shortlistRow.proposal_versions),
            rationale: shortlistRow.rationale,
            recorded_at: shortlistRow.recorded_at.toISOString(),
          }
        : null;
      const decisionResult = await client.query<DecisionRow>(
        `SELECT id, outcome, selected_proposal_id, selected_proposal_version_id,
                reason_code, rationale, decided_at FROM decision WHERE challenge_id = $1`,
        [challenge.id],
      );
      const decisionRow = decisionResult.rows[0];
      const outcomeResult = decisionRow
        ? await client.query<OutcomeRow>(
            `SELECT proposal_id, outcome, feedback FROM decision_proposal_outcome
             WHERE decision_id = $1`,
            [decisionRow.id],
          )
        : { rows: [] as OutcomeRow[] };
      const outcomes = new Map(outcomeResult.rows.map((row) => [row.proposal_id, row]));
      const caseResult = decisionRow
        ? await client.query<CaseRow>(
            `SELECT id, challenge_id, challenge_version_id, proposal_id, proposal_version_id,
                    decision_id, state, created_at FROM case_record WHERE decision_id = $1`,
            [decisionRow.id],
          )
        : { rows: [] as CaseRow[] };
      const shortlisted = new Set(shortlist?.proposal_versions.map(exactReferenceKey) ?? []);
      return {
        challenge_id: parseChallengeId(challenge.id),
        challenge_version_id: parseChallengeVersionId(snapshot.challenge_version_id),
        rubric_version_id: parseRubricVersionId(snapshot.rubric_version_id),
        stage: challenge.stage,
        review_complete: grouped.every(
          (item) =>
            item.reviews.length === requiredReviewsPerEligibleProposal &&
            new Set(item.reviews.map((review) => review.reviewer_user_id)).size ===
              requiredReviewsPerEligibleProposal,
        ),
        proposals: grouped.map(({ proposal, reviews }) => {
          const outcome = outcomes.get(proposal.proposal_id);
          if (outcome && outcome.outcome !== "selected" && outcome.outcome !== "rejected") {
            throw new Error("Invalid persisted proposal outcome");
          }
          const reference = {
            proposal_id: parseProposalId(proposal.proposal_id),
            proposal_version_id: parseProposalVersionId(proposal.proposal_version_id),
          };
          return {
            ...reference,
            tracking_code: proposal.tracking_code,
            locked_review_count: reviews.length,
            shortlisted: shortlisted.has(exactReferenceKey(reference)),
            outcome: (outcome?.outcome as ProposalDecisionOutcome | undefined) ?? null,
            feedback: outcome?.feedback ?? null,
          };
        }),
        shortlist,
        decision: decisionRow ? finalDecisionResource(decisionRow) : null,
        case: caseResult.rows[0] ? caseResource(caseResult.rows[0]) : null,
        version: version(challenge.lock_version),
      };
    });
  }

  private async lockIdempotency(context: WorkspaceCommandContext, requestHash: string) {
    const client = this.unitOfWork.currentClient();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${context.tenantId.length}:${context.tenantId}${context.idempotencyKey}`,
    ]);
    await client.query(
      `DELETE FROM idempotency_key WHERE scope_kind = 'tenant' AND tenant_id = $1
       AND credential_fingerprint IS NULL AND idempotency_key = $2
       AND expires_at <= clock_timestamp()`,
      [context.tenantId, context.idempotencyKey],
    );
    const replay = await client.query<IdempotencyRow>(
      `SELECT request_hash, status, response_body FROM idempotency_key
       WHERE scope_kind = 'tenant' AND tenant_id = $1
         AND credential_fingerprint IS NULL AND idempotency_key = $2 FOR UPDATE`,
      [context.tenantId, context.idempotencyKey],
    );
    if (replay.rows[0] && replay.rows[0].request_hash !== requestHash) throw idempotencyConflict();
    if (replay.rows[0]?.status !== undefined && replay.rows[0].status !== "completed") {
      throw new Error("Invalid decision idempotency evidence");
    }
    return replay.rows[0]?.response_body;
  }

  private async persistIdempotency(
    context: WorkspaceCommandContext,
    requestHash: string,
    outcome: ShortlistOutcome | DecisionOutcome,
    now: Date,
  ) {
    await this.unitOfWork.currentClient().query(
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
        new Date(now.getTime() + 24 * 60 * 60_000),
      ],
    );
  }

  private assertReviewComplete(grouped: GroupedRoster) {
    for (const item of grouped) {
      if (
        item.reviews.length !== requiredReviewsPerEligibleProposal ||
        new Set(item.reviews.map((review) => review.reviewer_user_id)).size !==
          requiredReviewsPerEligibleProposal
      ) {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "Every proposal needs two valid locked reviews",
          {
            recovery: "complete_or_replace_reviews",
          },
        );
      }
    }
  }

  async saveShortlist(
    challengeId: string,
    body: SaveDecisionShortlistBody,
    context: WorkspaceCommandContext,
  ): Promise<ShortlistOutcome> {
    authorizeOrganization(context);
    const requestHash = commandFingerprint({
      action: "challenge.shortlist.recorded",
      actor: context.actorUserId,
      workspace: context.workspaceId,
      challengeId,
      body,
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challenge = await this.challenge(context, challengeId, true);
      const replay = await this.lockIdempotency(context, requestHash);
      if (replay) return cachedOutcome(replay, ["reauthenticate_decision"] as const);
      const currentVersion = version(challenge.lock_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      if (challenge.stage !== "evaluating") {
        throw new ApiProblem(
          409,
          "INVALID_STATE",
          "Only an evaluating challenge can be shortlisted",
          {
            currentState: challenge.stage,
          },
        );
      }
      const snapshot = await this.snapshot(challenge.id);
      if (
        body.challenge_version_id !== snapshot.challenge_version_id ||
        body.rubric_version_id !== snapshot.rubric_version_id
      ) {
        throw new ApiProblem(409, "CONFLICT", "The shortlist cites stale evaluation evidence", {
          recovery: "refetch_and_retry",
        });
      }
      const grouped = this.groupedRoster(
        await this.roster(challenge.id, snapshot.rubric_version_id),
      );
      this.assertReviewComplete(grouped);
      const roster = new Set(
        grouped.map(({ proposal }) => `${proposal.proposal_id}\0${proposal.proposal_version_id}`),
      );
      const requested = new Set(body.proposal_versions.map(exactReferenceKey));
      if (
        requested.size !== body.proposal_versions.length ||
        body.proposal_versions.length === 0 ||
        [...requested].some((key) => !roster.has(key))
      ) {
        throw new ApiProblem(422, "VALIDATION", "The shortlist must cite unique roster versions", {
          fields: [
            {
              path: "proposal_versions",
              code: "exact_roster_reference",
              message: "Every shortlist item must cite an exact frozen proposal version",
            },
          ],
        });
      }
      const latest = await client.query<{ next_version: number }>(
        `SELECT coalesce(max(version_number), 0)::integer + 1 AS next_version
         FROM decision_shortlist_version WHERE challenge_id = $1`,
        [challenge.id],
      );
      const entityVersion = currentVersion + 1;
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      const shortlistId = parseDecisionShortlistVersionId(this.ids.next("dsv"));
      await client.query(
        `INSERT INTO decision_shortlist_version (
           id,tenant_id,workspace_id,challenge_id,challenge_version_id,rubric_version_id,
           version_number,challenge_lock_version,proposal_versions,rationale,recorded_by_user_id,
           recorded_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
        [
          shortlistId,
          context.tenantId,
          context.workspaceId,
          challenge.id,
          snapshot.challenge_version_id,
          snapshot.rubric_version_id,
          latest.rows[0]!.next_version,
          entityVersion,
          JSON.stringify(body.proposal_versions),
          body.rationale.trim(),
          context.actorUserId,
          now,
        ],
      );
      await client.query(`UPDATE challenge SET lock_version = $2, updated_at = $3 WHERE id = $1`, [
        challenge.id,
        entityVersion,
        now,
      ]);
      const auditId = parseAuditEventId(this.ids.next("aud"));
      const receiptId = parseReceiptId(this.ids.next("rcp"));
      const metadata = JSON.stringify({
        entity_version: entityVersion,
        shortlist_version_id: shortlistId,
        shortlist_version_number: latest.rows[0]!.next_version,
        proposal_count: body.proposal_versions.length,
      });
      await client.query(
        `INSERT INTO audit_event (
           id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,
           reason_code,target_type,target_id,metadata,occurred_at
         ) VALUES ($1,$2,$3,$4,'user',$5,'challenge.shortlist.recorded','success',
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
      const nextActions = ["reauthenticate_decision"] as const;
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
         ) VALUES ($1,$2,$3,'challenge.shortlist.recorded',1,'challenge',$4,$5::jsonb,$6,$7,$7)`,
        [
          this.ids.next("evt"),
          context.tenantId,
          context.correlationId,
          challenge.id,
          metadata,
          `challenge.shortlist.recorded:${challenge.id}:${entityVersion}`,
          now,
        ],
      );
      const outcome: ShortlistOutcome = {
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
      await this.persistIdempotency(context, requestHash, outcome, now);
      return outcome;
    });
  }

  async record(
    challengeId: string,
    body: RecordChallengeDecisionBody,
    context: DecisionCommandContext,
  ): Promise<DecisionOutcome> {
    authorizeOrganization(context);
    if (!isDecisionReasonForOutcome(body.outcome, body.reason_code)) {
      throw new ApiProblem(422, "VALIDATION", "The reason code does not match the outcome");
    }
    const requestHash = commandFingerprint({
      action: "challenge.decision.recorded",
      actor: context.actorUserId,
      session: context.sessionId,
      workspace: context.workspaceId,
      challengeId,
      body: { ...body, step_up_token: null },
    });
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challenge = await this.challenge(context, challengeId, true);
      const replay = await this.lockIdempotency(context, requestHash);
      if (replay) return cachedOutcome(replay, ["open_case", "decision_complete"] as const);
      const stepUpToken = context.stepUpToken ?? body.step_up_token;
      if (!stepUpToken) {
        throw new ApiProblem(403, "NO_ACCESS", "Fresh authentication is required", {
          recovery: "reauthenticate_decision",
          auditReason: "step_up_missing",
        });
      }
      const currentVersion = version(challenge.lock_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      if (challenge.stage !== "evaluating") {
        throw new ApiProblem(409, "INVALID_STATE", "This challenge already has a final state", {
          currentState: challenge.stage,
        });
      }
      const snapshot = await this.snapshot(challenge.id);
      if (
        body.challenge_version_id !== snapshot.challenge_version_id ||
        body.rubric_version_id !== snapshot.rubric_version_id
      ) {
        throw new ApiProblem(409, "CONFLICT", "The decision cites stale evaluation evidence", {
          recovery: "refetch_and_retry",
        });
      }
      const grouped = this.groupedRoster(
        await this.roster(challenge.id, snapshot.rubric_version_id),
      );
      this.assertReviewComplete(grouped);
      const roster = new Map(
        grouped.map((item) => [
          `${item.proposal.proposal_id}\0${item.proposal.proposal_version_id}`,
          item,
        ]),
      );
      const feedback = new Map(
        body.proposal_feedback.map((item) => [exactReferenceKey(item), item.feedback.trim()]),
      );
      if (
        feedback.size !== body.proposal_feedback.length ||
        feedback.size !== roster.size ||
        [...feedback].some(([key, value]) => !roster.has(key) || !value)
      ) {
        throw new ApiProblem(422, "VALIDATION", "Feedback must cover every exact roster version", {
          fields: [
            {
              path: "proposal_feedback",
              code: "exact_roster_coverage",
              message: "Provide one nonblank feedback item for every frozen proposal version",
            },
          ],
        });
      }
      const selectedKey =
        body.selected_proposal_id && body.selected_proposal_version_id
          ? `${body.selected_proposal_id}\0${body.selected_proposal_version_id}`
          : null;
      if (
        (body.outcome === "selected" && (!selectedKey || !roster.has(selectedKey))) ||
        (body.outcome === "no_award" &&
          (body.selected_proposal_id !== null || body.selected_proposal_version_id !== null))
      ) {
        throw new ApiProblem(
          422,
          "VALIDATION",
          "The selected proposal fields do not match the outcome",
        );
      }
      const latestShortlist = await client.query<ShortlistRow>(
        `SELECT id, version_number, proposal_versions, rationale, recorded_at
         FROM decision_shortlist_version WHERE challenge_id = $1
         ORDER BY version_number DESC LIMIT 1`,
        [challenge.id],
      );
      const latest = latestShortlist.rows[0];
      if (body.outcome === "selected") {
        const refs = latest ? proposalReferences(latest.proposal_versions) : [];
        if (
          !latest ||
          body.shortlist_version_id !== latest.id ||
          !refs.some((reference) => exactReferenceKey(reference) === selectedKey)
        ) {
          throw new ApiProblem(409, "CONFLICT", "Selection requires the latest exact shortlist", {
            recovery: "save_or_refresh_shortlist",
          });
        }
      } else if (
        body.shortlist_version_id !== null &&
        body.shortlist_version_id !== (latest?.id ?? null)
      ) {
        throw new ApiProblem(409, "CONFLICT", "The cited shortlist is stale", {
          recovery: "refetch_and_retry",
        });
      }
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      const proof = await client.query<{ id: string }>(
        `SELECT id FROM step_up_attempt
         WHERE proof_digest = $1 AND session_id = $2 AND session_version = $3
           AND user_id = $4 AND tenant_id = $5 AND workspace_id = $6
           AND action = 'challenge.decision.record' AND target_type = 'challenge'
           AND target_id = $7 AND status = 'verified' AND expires_at > $8
         FOR UPDATE`,
        [
          commandFingerprint(stepUpToken),
          context.sessionId,
          context.sessionVersion,
          context.actorUserId,
          context.tenantId,
          context.workspaceId,
          challenge.id,
          now,
        ],
      );
      const proofId = proof.rows[0]?.id;
      if (!proofId) {
        throw new ApiProblem(403, "NO_ACCESS", "Fresh authentication is missing or expired", {
          recovery: "reauthenticate_decision",
          auditReason: "step_up_unavailable",
        });
      }
      const entityVersion = currentVersion + 1;
      const decisionId = parseDecisionId(this.ids.next("dec"));
      const caseId = body.outcome === "selected" ? parseCaseId(this.ids.next("case")) : null;
      await client.query(
        `INSERT INTO decision (
           id,tenant_id,workspace_id,challenge_id,challenge_version_id,rubric_version_id,
           shortlist_version_id,outcome,selected_proposal_id,selected_proposal_version_id,
           reason_code,rationale,actor_user_id,step_up_attempt_id,challenge_lock_version,
           correlation_id,decided_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          decisionId,
          context.tenantId,
          context.workspaceId,
          challenge.id,
          snapshot.challenge_version_id,
          snapshot.rubric_version_id,
          body.shortlist_version_id,
          body.outcome,
          body.selected_proposal_id,
          body.selected_proposal_version_id,
          body.reason_code,
          body.rationale.trim(),
          context.actorUserId,
          proofId,
          entityVersion,
          context.correlationId,
          now,
        ],
      );
      for (const item of grouped) {
        for (const review of item.reviews) {
          await client.query(
            `INSERT INTO decision_review_evidence (
               decision_id,review_id,assignment_id,proposal_id,proposal_version_id,rubric_version_id
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              decisionId,
              review.review_id,
              review.assignment_id,
              review.proposal_id,
              review.proposal_version_id,
              snapshot.rubric_version_id,
            ],
          );
        }
      }
      const selected = selectedKey ? roster.get(selectedKey) : undefined;
      if (caseId && selected) {
        await client.query(
          `INSERT INTO case_record (
             id,tenant_id,workspace_id,challenge_id,challenge_version_id,proposal_id,
             proposal_version_id,decision_id,solver_tenant_id,solver_workspace_id,state,created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'created',$11)`,
          [
            caseId,
            context.tenantId,
            context.workspaceId,
            challenge.id,
            snapshot.challenge_version_id,
            selected.proposal.proposal_id,
            selected.proposal.proposal_version_id,
            decisionId,
            selected.proposal.solver_tenant_id,
            selected.proposal.solver_workspace_id,
            now,
          ],
        );
        await client.query(
          `INSERT INTO access_grant (
             id,grantor_tenant_id,grantor_workspace_id,grantee_tenant_id,grantee_workspace_id,
             resource_type,resource_id,capability,state,valid_from,expires_at,created_by_user_id,created_at
           ) VALUES ($1,$2,$3,$4,$5,'case',$6,'collaborate','active',$7,$8,$9,$7)`,
          [
            this.ids.next("agr"),
            context.tenantId,
            context.workspaceId,
            selected.proposal.solver_tenant_id,
            selected.proposal.solver_workspace_id,
            caseId,
            now,
            new Date(now.getTime() + 365 * 24 * 60 * 60_000),
            context.actorUserId,
          ],
        );
      }
      for (const [key, item] of roster) {
        const proposalOutcome: ProposalDecisionOutcome =
          key === selectedKey ? "selected" : "rejected";
        const updatedProposal = await client.query(
          `UPDATE proposal SET state = $2, lock_version = lock_version + 1, updated_at = $3
           WHERE id = $1 AND current_version_id = $4
             AND state IN ('eligible','reviewing','resubmitted')`,
          [item.proposal.proposal_id, proposalOutcome, now, item.proposal.proposal_version_id],
        );
        if (updatedProposal.rowCount !== 1) {
          throw new ApiProblem(409, "CONFLICT", "A frozen proposal changed before decision", {
            recovery: "refetch_and_retry",
          });
        }
        await client.query(
          `INSERT INTO decision_proposal_outcome (
             decision_id,proposal_id,proposal_version_id,outcome,feedback,case_id
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            decisionId,
            item.proposal.proposal_id,
            item.proposal.proposal_version_id,
            proposalOutcome,
            feedback.get(key),
            proposalOutcome === "selected" ? caseId : null,
          ],
        );
      }
      const consumed = await client.query(
        `UPDATE step_up_attempt SET status = 'consumed', consumed_at = $2,
                                    consumed_by_decision_id = $3
         WHERE id = $1 AND status = 'verified'`,
        [proofId, now, decisionId],
      );
      if (consumed.rowCount !== 1) throw forbidden("step_up_unavailable");
      await client.query(
        `UPDATE challenge SET stage = 'decided', lock_version = $2, updated_at = $3 WHERE id = $1`,
        [challenge.id, entityVersion, now],
      );
      const auditId = parseAuditEventId(this.ids.next("aud"));
      const receiptId = parseReceiptId(this.ids.next("rcp"));
      const nextActions: readonly RecordChallengeDecisionNextAction[] = [
        caseId ? "open_case" : "decision_complete",
      ];
      const metadata = {
        entity_version: entityVersion,
        decision_id: decisionId,
        outcome: body.outcome,
        challenge_version_id: snapshot.challenge_version_id,
        rubric_version_id: snapshot.rubric_version_id,
        shortlist_version_id: body.shortlist_version_id,
        selected_proposal_id: body.selected_proposal_id,
        selected_proposal_version_id: body.selected_proposal_version_id,
        case_id: caseId,
        proposal_count: roster.size,
        review_count: grouped.reduce((sum, item) => sum + item.reviews.length, 0),
      };
      await client.query(
        `INSERT INTO audit_event (
           id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,
           reason_code,target_type,target_id,metadata,occurred_at
         ) VALUES ($1,$2,$3,$4,'user',$5,'challenge.decision.recorded','success',
                   'MUTATION_COMMITTED','challenge',$6,$7::jsonb,$8)`,
        [
          auditId,
          context.correlationId,
          context.tenantId,
          context.workspaceId,
          context.actorUserId,
          challenge.id,
          JSON.stringify(metadata),
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
      const events: readonly {
        readonly type: string;
        readonly aggregateType: string;
        readonly aggregateId: string;
        readonly suffix: number;
        readonly payload: object;
      }[] = [
        {
          type: "challenge.decision.recorded",
          aggregateType: "challenge",
          aggregateId: challenge.id,
          suffix: entityVersion,
          payload: metadata,
        },
        ...[...roster.values()].map((item) => {
          const isSelected = item.proposal.proposal_id === body.selected_proposal_id;
          return {
            type: isSelected ? "proposal.selected" : "proposal.rejected",
            aggregateType: "proposal",
            aggregateId: item.proposal.proposal_id,
            suffix: version(item.proposal.proposal_lock_version) + 1,
            payload: {
              entity_version: version(item.proposal.proposal_lock_version) + 1,
              decision_id: decisionId,
              outcome: isSelected ? "selected" : "rejected",
              proposal_id: item.proposal.proposal_id,
              proposal_version_id: item.proposal.proposal_version_id,
              ...(isSelected && caseId ? { case_id: caseId } : {}),
            },
          };
        }),
        ...(caseId
          ? [
              {
                type: "case.created",
                aggregateType: "case",
                aggregateId: caseId,
                suffix: 1,
                payload: {
                  entity_version: 1,
                  case_id: caseId,
                  decision_id: decisionId,
                  challenge_id: challenge.id,
                  proposal_id: body.selected_proposal_id,
                  proposal_version_id: body.selected_proposal_version_id,
                },
              },
            ]
          : []),
      ];
      for (const event of events) {
        await client.query(
          `INSERT INTO outbox_event (
             id,tenant_id,correlation_id,event_type,schema_version,aggregate_type,aggregate_id,
             payload,dedupe_key,occurred_at,available_at
           ) VALUES ($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$9)`,
          [
            this.ids.next("evt"),
            context.tenantId,
            context.correlationId,
            event.type,
            event.aggregateType,
            event.aggregateId,
            JSON.stringify(event.payload),
            `${event.type}:${event.aggregateId}:${event.suffix}`,
            now,
          ],
        );
      }
      const outcome: DecisionOutcome = {
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
      await this.persistIdempotency(context, requestHash, outcome, now);
      return outcome;
    });
  }

  async proposalOutcome(
    scope: WorkspaceScope,
    proposalId: string,
  ): Promise<ProposalOutcomeResource | null> {
    const solverRole = scope.role === "individual" || scope.role.startsWith("team:");
    if (!solverRole) throw forbidden();
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<{
        proposal_id: string;
        proposal_version_id: string;
        tracking_code: string;
        proposal_state: string;
        lock_version: string;
        outcome: string | null;
        feedback: string | null;
        decided_at: Date | null;
        case_id: string | null;
      }>(
        `SELECT proposal.id AS proposal_id,
                coalesce(outcome.proposal_version_id, proposal.current_version_id) AS proposal_version_id,
                proposal.tracking_code, proposal.state AS proposal_state, proposal.lock_version,
                outcome.outcome, outcome.feedback, decision_row.decided_at, outcome.case_id
         FROM proposal
         LEFT JOIN decision_proposal_outcome outcome ON outcome.proposal_id = proposal.id
         LEFT JOIN decision decision_row ON decision_row.id = outcome.decision_id
         WHERE proposal.id = $1 AND proposal.tenant_id = $2 AND proposal.owner_workspace_id = $3`,
        [proposalId, scope.tenantId, scope.workspaceId],
      );
      const row = result.rows[0];
      if (!row || !row.tracking_code) return null;
      if (row.outcome !== null && row.outcome !== "selected" && row.outcome !== "rejected") {
        throw new Error("Invalid persisted solver proposal outcome");
      }
      return {
        proposal_id: parseProposalId(row.proposal_id),
        proposal_version_id: parseProposalVersionId(row.proposal_version_id),
        tracking_code: row.tracking_code,
        status: (row.outcome as ProposalDecisionOutcome | null) ?? "pending",
        feedback: row.feedback,
        decided_at: row.decided_at?.toISOString() ?? null,
        case_id: row.case_id ? parseCaseId(row.case_id) : null,
        version: version(row.lock_version),
      };
    });
  }

  async case(scope: WorkspaceScope, caseId: string): Promise<CaseResource | null> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<CaseRow>(
        `SELECT record.id, record.challenge_id, record.challenge_version_id, record.proposal_id,
                record.proposal_version_id, record.decision_id, record.state, record.created_at
         FROM case_record record
         WHERE record.id = $1 AND (
           (record.tenant_id = $2 AND record.workspace_id = $3 AND $4 IN ('org:owner','org:member'))
           OR EXISTS (
             SELECT 1 FROM access_grant grant_row
             WHERE grant_row.resource_type = 'case' AND grant_row.resource_id = record.id
               AND grant_row.grantee_tenant_id = $2 AND grant_row.grantee_workspace_id = $3
               AND grant_row.capability = 'collaborate' AND grant_row.state = 'active'
               AND grant_row.valid_from <= transaction_timestamp()
               AND grant_row.expires_at > transaction_timestamp()
           )
         )`,
        [caseId, scope.tenantId, scope.workspaceId, scope.role],
      );
      return result.rows[0] ? caseResource(result.rows[0]) : null;
    });
  }
}
