import type {
  ChallengeId,
  ChallengeVersionId,
  FileId,
  TenantId,
  UserId,
  WorkspaceId,
} from "./id.js";
import type { ApplicantScope, ApplicantType } from "./taxonomy.js";
import type { WorkspaceRole } from "./workspace.js";

export const challengeStages = [
  "draft",
  "triage",
  "formulation",
  "approvals",
  "published",
  "evaluating",
  "decided",
  "contracting",
  "pilot",
  "impact",
  "closed",
] as const;
export type ChallengeStage = (typeof challengeStages)[number];

export type Transition<State extends string> = {
  readonly from: State;
  readonly to: State;
  readonly roles: readonly WorkspaceRole[];
  readonly preconditions: readonly string[];
  readonly sideEffects: readonly string[];
  readonly notification: string;
  readonly audit: string;
  readonly retry: "idempotent" | "manual-review" | "not-applicable";
};

export function canTransition<State extends string>(
  table: readonly Transition<State>[],
  from: State,
  to: State,
  role: WorkspaceRole,
  satisfied: readonly string[] = [],
): boolean {
  const rule = table.find((item) => item.from === from && item.to === to);
  return Boolean(
    rule &&
      rule.roles.includes(role) &&
      rule.preconditions.every((condition) => satisfied.includes(condition)),
  );
}

export const challengeTransitions = [
  {
    from: "draft",
    to: "triage",
    roles: ["org:member"],
    preconditions: ["brief-valid"],
    sideEffects: ["lock-intake-version"],
    notification: "مسئول غربالگری",
    audit: "challenge.triage.requested",
    retry: "idempotent",
  },
  {
    from: "triage",
    to: "formulation",
    roles: ["org:member", "platform:ops"],
    preconditions: ["triage-passed"],
    sideEffects: ["open-formulation-workspace"],
    notification: "مالک مسئله",
    audit: "challenge.formulation.started",
    retry: "idempotent",
  },
  {
    from: "formulation",
    to: "approvals",
    roles: ["org:member", "platform:ops"],
    preconditions: ["formulation-complete"],
    sideEffects: ["create-approval-tasks"],
    notification: "تأییدکنندگان",
    audit: "challenge.approvals.requested",
    retry: "idempotent",
  },
  {
    from: "approvals",
    to: "published",
    roles: ["org:publisher"],
    preconditions: ["technical-approved", "legal-approved", "finance-approved", "quality-passed"],
    sideEffects: ["publish-catalog-version", "create-receipt"],
    notification: "حل‌کنندگان مرتبط",
    audit: "challenge.published",
    retry: "idempotent",
  },
  {
    from: "published",
    to: "evaluating",
    roles: ["org:member"],
    preconditions: ["submission-window-closed"],
    sideEffects: ["freeze-submissions"],
    notification: "داوران",
    audit: "challenge.evaluation.started",
    retry: "idempotent",
  },
  {
    from: "evaluating",
    to: "decided",
    roles: ["org:member"],
    preconditions: ["reviews-complete", "decision-rationale"],
    sideEffects: ["lock-decision", "notify-solvers"],
    notification: "ارسال‌کنندگان پیشنهاد",
    audit: "challenge.decision.recorded",
    retry: "manual-review",
  },
  {
    from: "decided",
    to: "contracting",
    roles: ["org:owner", "platform:legal"],
    preconditions: ["winner-selected"],
    sideEffects: ["create-contract"],
    notification: "حل‌کننده منتخب",
    audit: "contract.created",
    retry: "idempotent",
  },
  {
    from: "contracting",
    to: "pilot",
    roles: ["org:owner", "platform:legal"],
    preconditions: ["contract-effective"],
    sideEffects: ["create-pilot-plan"],
    notification: "تیم پایلوت",
    audit: "pilot.started",
    retry: "idempotent",
  },
  {
    from: "pilot",
    to: "impact",
    roles: ["org:member"],
    preconditions: ["deliverables-resolved"],
    sideEffects: ["open-impact-measurement"],
    notification: "ذی‌نفعان پرونده",
    audit: "challenge.impact.started",
    retry: "idempotent",
  },
  {
    from: "impact",
    to: "closed",
    roles: ["org:member"],
    preconditions: ["payments-reconciled"],
    sideEffects: ["publish-outcome"],
    notification: "ذی‌نفعان پرونده",
    audit: "challenge.closed",
    retry: "manual-review",
  },
] as const satisfies readonly Transition<ChallengeStage>[];

export const challengeDraftAuthoringStatuses = ["draft", "ready", "needs_changes"] as const;
export type ChallengeDraftAuthoringStatus = (typeof challengeDraftAuthoringStatuses)[number];

export const challengeOutputTypes = [
  "idea",
  "solution",
  "poc",
  "pilot",
  "project",
  "technology",
] as const;
export type ChallengeOutputType = (typeof challengeOutputTypes)[number];

export const challengeSourcingModels = ["public", "private", "hybrid"] as const;
export type ChallengeSourcingModel = (typeof challengeSourcingModels)[number];

export const challengeWorkModes = ["onsite", "remote", "hybrid"] as const;
export type ChallengeWorkMode = (typeof challengeWorkModes)[number];

export const challengeBudgetStatuses = ["fixed", "quote", "undecided", "non_cash"] as const;
export type ChallengeBudgetStatus = (typeof challengeBudgetStatuses)[number];

export const challengeVisibilities = ["public", "registered", "invite_only", "nda"] as const;
export type ChallengeVisibility = (typeof challengeVisibilities)[number];

export const challengeIpTerms = ["solver_license", "contract_transfer", "joint_contract"] as const;
export type ChallengeIpTerms = (typeof challengeIpTerms)[number];

export const currencies = ["IRR", "USD", "EUR"] as const;
export type Currency = (typeof currencies)[number];

export type ChallengeSuccessCriterion = {
  readonly id: string;
  readonly title: string;
  readonly target: string;
  readonly method: string;
};

export type ChallengeBudget = {
  readonly status: ChallengeBudgetStatus;
  readonly amountMinor: number | null;
  readonly currency: Currency;
};

export type ChallengeContact = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
};

export type ChallengeDraftContent = {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly location: string;
  readonly desiredOutcome: string;
  readonly currentState: string;
  readonly consequence: string;
  readonly expectedOutput: string;
  readonly successCriteria: readonly ChallengeSuccessCriterion[];
  readonly inScope: string;
  readonly constraints: string;
  readonly organizationSupport: string;
  readonly previousAttempts: string;
  readonly outputType: ChallengeOutputType | null;
  readonly sourcingModel: ChallengeSourcingModel | null;
  readonly applicantScope: ApplicantScope | null;
  readonly allowedApplicantTypes: readonly ApplicantType[];
  readonly workMode: ChallengeWorkMode | null;
  readonly proposalDeadline: string | null;
  readonly preferredStartDate: string | null;
  readonly budget: ChallengeBudget;
  readonly invitees: readonly string[];
  readonly visibility: ChallengeVisibility | null;
  readonly publicSummary: string;
  readonly ndaRequired: boolean;
  readonly ipTerms: ChallengeIpTerms | null;
  readonly contact: ChallengeContact;
  readonly accuracyConfirmed: boolean;
  readonly legalNotes: string;
  readonly attachmentIds: readonly FileId[];
};

export type ChallengeDraft = {
  readonly id: ChallengeId;
  readonly currentVersionId: ChallengeVersionId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly stage: "draft";
  readonly authoringStatus: ChallengeDraftAuthoringStatus;
  readonly version: number;
  readonly content: ChallengeDraftContent;
  readonly createdBy: UserId;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function isChallengeStage(value: unknown): value is ChallengeStage {
  return challengeStages.includes(value as ChallengeStage);
}

export function isChallengeDraftAuthoringStatus(
  value: unknown,
): value is ChallengeDraftAuthoringStatus {
  return challengeDraftAuthoringStatuses.includes(value as ChallengeDraftAuthoringStatus);
}

export function isAggregateVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isMoneyAmountMinor(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
