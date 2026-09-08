import type {
  ReviewAssignmentListQuery,
  ReviewAssignmentResource,
  ReviewAssignmentListResource,
} from "@rahhal/contracts";
import { ApiProblem } from "./errors.js";
import type { ReviewerScope, ReviewPort } from "./ports.js";

export type DemoReviewAssignment = ReviewAssignmentResource & { readonly scope: ReviewerScope };
/** Explicit demo adapter; session and membership authority remain in the unit of work. */
export class InMemoryReviewAdapter implements ReviewPort {
  constructor(private readonly assignments: readonly DemoReviewAssignment[] = []) {}
  private own(scope: ReviewerScope): readonly ReviewAssignmentResource[] {
    if (scope.role !== "platform:reviewer")
      throw new ApiProblem(403, "NO_ACCESS", "Reviewer access is required");
    return this.assignments
      .filter(
        (row) =>
          row.scope.membershipId === scope.membershipId &&
          row.scope.actorUserId === scope.actorUserId &&
          row.scope.tenantId === scope.tenantId &&
          row.scope.workspaceId === scope.workspaceId,
      )
      .map(({ id, state, coi_status, due_at, version }) => ({
        id,
        state,
        coi_status,
        due_at,
        version,
      }));
  }
  async list(
    scope: ReviewerScope,
    query: ReviewAssignmentListQuery,
  ): Promise<ReviewAssignmentListResource> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const rows = this.own(scope)
      .filter(
        (row) =>
          (!query.cursor || row.id > query.cursor) && (!query.state || row.state === query.state),
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const items = rows.slice(0, limit);
    return { items, ...(rows.length > limit ? { next_cursor: items.at(-1)!.id } : {}) };
  }
  async get(scope: ReviewerScope, id: string): Promise<ReviewAssignmentResource | null> {
    return this.own(scope).find((row) => row.id === id) ?? null;
  }
}
