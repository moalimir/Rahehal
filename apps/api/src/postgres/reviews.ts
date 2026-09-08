import type {
  ReviewAssignmentResource,
  ReviewAssignmentListQuery,
  ReviewAssignmentListResource,
} from "@rahhal/contracts";
import { isReviewState, isReviewCoiState, parseReviewAssignmentId } from "@rahhal/domain";
import { ApiProblem } from "../errors.js";
import type { ReviewerScope, ReviewPort } from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type Row = { id: string; state: string; coi_status: string; due_at: Date; lock_version: string };
function resource(row: Row): ReviewAssignmentResource {
  const version = Number(row.lock_version);
  if (
    !isReviewState(row.state) ||
    !isReviewCoiState(row.coi_status) ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw new Error("Invalid stored assignment bookkeeping");
  return {
    id: parseReviewAssignmentId(row.id),
    state: row.state,
    coi_status: row.coi_status,
    due_at: row.due_at.toISOString(),
    version,
  };
}

// Start from the exact reviewer membership, even when several reviewers share
// the same platform workspace. Never select a proposal/rubric/private aggregate.
const scopedRows = `
  SELECT a.id, a.state, coi.coi_status, a.due_at, a.lock_version
  FROM membership m
  JOIN review_assignment a ON a.reviewer_membership_id = m.id AND a.reviewer_user_id = m.user_id
  JOIN coi_declaration coi ON coi.assignment_id = a.id
  WHERE m.id = $1 AND m.user_id = $2 AND m.tenant_id = $3 AND m.workspace_id = $4
    AND m.state = 'active' AND m.role = 'platform:reviewer' AND m.workspace_kind = 'platform'
`;
function parameters(scope: ReviewerScope): string[] {
  if (scope.role !== "platform:reviewer")
    throw new ApiProblem(403, "NO_ACCESS", "Reviewer access is required");
  return [scope.membershipId, scope.actorUserId, scope.tenantId, scope.workspaceId];
}

export class PostgresReviewAdapter implements ReviewPort {
  constructor(private readonly unitOfWork: PostgresUnitOfWork) {}
  async list(
    scope: ReviewerScope,
    query: ReviewAssignmentListQuery,
  ): Promise<ReviewAssignmentListResource> {
    const params = parameters(scope);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    return this.unitOfWork.run(async () => {
      const rows = await this.unitOfWork.currentClient().query<Row>(
        `${scopedRows}
        AND ($5::text IS NULL OR a.id > $5)
        AND ($6::text IS NULL OR a.state = $6)
        ORDER BY a.id LIMIT $7`,
        [...params, query.cursor ?? null, query.state ?? null, limit + 1],
      );
      const items = rows.rows.slice(0, limit).map(resource);
      return { items, ...(rows.rows.length > limit ? { next_cursor: items.at(-1)!.id } : {}) };
    });
  }
  async get(scope: ReviewerScope, id: string): Promise<ReviewAssignmentResource | null> {
    const params = parameters(scope);
    return this.unitOfWork.run(async () => {
      const rows = await this.unitOfWork
        .currentClient()
        .query<Row>(`${scopedRows} AND a.id = $5`, [...params, id]);
      return rows.rows[0] ? resource(rows.rows[0]) : null;
    });
  }
}
