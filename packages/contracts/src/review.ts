import type { ReviewAssignmentId, ReviewCoiState, ReviewState } from "@rahhal/domain";
import type { SuccessEnvelope } from "./envelopes.js";

/** Assignment bookkeeping only. No proposal, rubric, organization or solver identity. */
export type ReviewAssignmentResource = {
  readonly id: ReviewAssignmentId;
  readonly state: ReviewState;
  readonly coi_status: ReviewCoiState;
  readonly due_at: string;
  readonly version: number;
};
export type ReviewAssignmentListQuery = {
  readonly limit?: number;
  readonly cursor?: ReviewAssignmentId;
  readonly state?: ReviewState;
};
export type ReviewAssignmentListResource = {
  readonly items: readonly ReviewAssignmentResource[];
  readonly next_cursor?: ReviewAssignmentId;
};
export type ReviewAssignmentSuccessEnvelope = SuccessEnvelope<ReviewAssignmentResource>;
export type ReviewAssignmentListSuccessEnvelope = SuccessEnvelope<ReviewAssignmentListResource>;
