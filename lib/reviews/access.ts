export type ReviewCoiState = "pending" | "clear" | "conflict";

function key(assignmentId: string) {
  return `rahhal:review-assignment:${assignmentId}:coi:v1`;
}

export function getReviewCoi(assignmentId: string): ReviewCoiState {
  if (typeof window === "undefined") return "pending";
  const value = localStorage.getItem(key(assignmentId));
  return value === "clear" || value === "conflict" ? value : "pending";
}

export function setReviewCoi(assignmentId: string, state: Exclude<ReviewCoiState, "pending">) {
  if (typeof window !== "undefined") localStorage.setItem(key(assignmentId), state);
}

export function canAccessReviewMaterials(state: ReviewCoiState) {
  return state === "clear";
}
