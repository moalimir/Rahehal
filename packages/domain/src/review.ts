import type { Transition } from "./challenge.js";

export const reviewStates = [
  "coi-gate",
  "accepted",
  "draft",
  "submitted",
  "locked",
  "invalidated",
  "cancelled",
] as const;
export type ReviewState = (typeof reviewStates)[number];
export const reviewCoiStates = ["pending", "clear", "conflict"] as const;
export type ReviewCoiState = (typeof reviewCoiStates)[number];

export function isReviewState(value: unknown): value is ReviewState {
  return reviewStates.includes(value as ReviewState);
}
export function isReviewCoiState(value: unknown): value is ReviewCoiState {
  return reviewCoiStates.includes(value as ReviewCoiState);
}

export const reviewTransitions: readonly Transition<ReviewState>[] = [
  {
    from: "coi-gate",
    to: "cancelled",
    roles: ["platform:ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["revoke-assignment-access"],
    notification: "داور",
    audit: "review.assignment.cancelled",
    retry: "idempotent",
  },
  {
    from: "coi-gate",
    to: "accepted",
    roles: ["platform:reviewer"],
    preconditions: ["coi-clear"],
    sideEffects: ["grant-material-access"],
    notification: "سازمان",
    audit: "review.assignment.accepted",
    retry: "idempotent",
  },
  {
    from: "accepted",
    to: "draft",
    roles: ["platform:reviewer"],
    preconditions: ["materials-authorized"],
    sideEffects: ["create-score-draft"],
    notification: "",
    audit: "review.draft.created",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "submitted",
    roles: ["platform:reviewer"],
    preconditions: ["scores-valid", "rationale-valid"],
    sideEffects: ["freeze-score", "create-receipt"],
    notification: "سازمان",
    audit: "review.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "locked",
    roles: ["platform:ops"],
    preconditions: ["receipt-valid"],
    sideEffects: ["lock-score"],
    notification: "داور",
    audit: "review.locked",
    retry: "idempotent",
  },
  {
    from: "locked",
    to: "invalidated",
    roles: ["platform:ops"],
    preconditions: ["reason-recorded"],
    sideEffects: ["exclude-score", "reopen-assignment"],
    notification: "داور و سازمان",
    audit: "review.invalidated",
    retry: "manual-review",
  },
];

export const reviewOutboxEventTypes = [
  "rubric.version.created",
  "review.assignment.created",
  "review.assignment.cancelled",
  "review.assignment.replaced",
] as const;
export type ReviewOutboxEventType = (typeof reviewOutboxEventTypes)[number];

export function isActiveReviewAssignmentState(state: ReviewState): boolean {
  return state !== "cancelled" && state !== "invalidated";
}
