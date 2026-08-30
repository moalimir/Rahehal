import type { Transition } from "./challenge.js";
import type { ProposalId, ProposalVersionId, UserId, WorkspaceId } from "./id.js";
import type { ApplicantType } from "./taxonomy.js";
import type { WorkspaceRole } from "./workspace.js";

/**
 * The canonical proposal lifecycle (20_CANONICAL_MODEL §4). These names are
 * the ones the legacy browser `ProposalState` in `domain/solver.ts` already
 * uses; they are restated here so the authoritative slice depends on the
 * canonical package rather than on the demo aggregate, per constraint 1.
 */
export const proposalStates = [
  "draft",
  "submitted",
  "eligibility_review",
  "eligible",
  "ineligible",
  "clarification_requested",
  "clarification_submitted",
  "reviewing",
  "revision_requested",
  "revision_draft",
  "resubmitted",
  "selected",
  "rejected",
  "withdrawn",
] as const;
export type ProposalState = (typeof proposalStates)[number];

export function isProposalState(value: unknown): value is ProposalState {
  return proposalStates.includes(value as ProposalState);
}

/** States whose content the owning workspace may still edit. */
export const editableProposalStates = ["draft", "revision_draft"] as const;
export type EditableProposalState = (typeof editableProposalStates)[number];

export function isEditableProposalState(state: ProposalState): state is EditableProposalState {
  return (editableProposalStates as readonly ProposalState[]).includes(state);
}

/**
 * A proposal version is immutable once locked. Locking happens on the
 * transitions that hand content to someone else — submission, a clarification
 * answer, and a resubmission — mirroring how a challenge version locks when it
 * is submitted for triage or approvals.
 */
export const proposalVersionLockingStates = [
  "submitted",
  "clarification_submitted",
  "resubmitted",
] as const;

/**
 * Phase 3 covers `draft` through `resubmitted` plus `withdrawn`. `selected`
 * and `rejected` are reachable only from a recorded decision, which is Phase
 * 4's `decision:record` command, so they are listed as states but have no
 * transition here yet — an empty row is the honest way to say "not this phase"
 * rather than leaving a rule that nothing enforces.
 */
export const proposalTransitions = [
  {
    from: "draft",
    to: "submitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["content-valid", "challenge-open", "terms-accepted"],
    sideEffects: ["lock-proposal-version", "create-receipt"],
    notification: "سازمان میزبان",
    audit: "proposal.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "eligibility_review",
    roles: ["org:member", "platform:ops"],
    preconditions: [],
    sideEffects: ["open-eligibility-review"],
    notification: "ارسال‌کننده پیشنهاد",
    audit: "proposal.eligibility.started",
    retry: "idempotent",
  },
  {
    from: "eligibility_review",
    to: "eligible",
    roles: ["org:member", "platform:ops"],
    preconditions: ["eligibility-passed"],
    sideEffects: [],
    notification: "ارسال‌کننده پیشنهاد",
    audit: "proposal.eligible",
    retry: "idempotent",
  },
  {
    from: "eligibility_review",
    to: "ineligible",
    roles: ["org:member", "platform:ops"],
    preconditions: ["eligibility-failed", "decision-rationale"],
    sideEffects: [],
    notification: "ارسال‌کننده پیشنهاد",
    audit: "proposal.ineligible",
    retry: "manual-review",
  },
  {
    from: "eligible",
    to: "clarification_requested",
    roles: ["org:member"],
    preconditions: ["clarification-question"],
    sideEffects: [],
    notification: "ارسال‌کننده پیشنهاد",
    audit: "proposal.clarification.requested",
    retry: "idempotent",
  },
  {
    from: "clarification_requested",
    to: "clarification_submitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["content-valid"],
    sideEffects: ["lock-proposal-version", "create-receipt"],
    notification: "سازمان میزبان",
    audit: "proposal.clarification.submitted",
    retry: "idempotent",
  },
  {
    from: "eligible",
    to: "reviewing",
    roles: ["org:member"],
    preconditions: ["reviewers-assigned"],
    sideEffects: [],
    notification: "داوران",
    audit: "proposal.review.started",
    retry: "idempotent",
  },
  {
    from: "reviewing",
    to: "revision_requested",
    roles: ["org:member"],
    preconditions: ["revision-rationale"],
    sideEffects: [],
    notification: "ارسال‌کننده پیشنهاد",
    audit: "proposal.revision.requested",
    retry: "idempotent",
  },
  {
    from: "revision_requested",
    to: "revision_draft",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: [],
    sideEffects: ["open-revision-draft"],
    notification: "اعضای فضای کاری",
    audit: "proposal.revision.started",
    retry: "idempotent",
  },
  {
    from: "revision_draft",
    to: "resubmitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["content-valid", "challenge-open", "base-version-cited"],
    sideEffects: ["lock-proposal-version", "create-receipt"],
    notification: "سازمان میزبان",
    audit: "proposal.resubmitted",
    retry: "idempotent",
  },
  {
    from: "draft",
    to: "withdrawn",
    roles: ["team:owner", "individual"],
    preconditions: ["withdrawal-reason"],
    sideEffects: [],
    notification: "اعضای فضای کاری",
    audit: "proposal.withdrawn",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "withdrawn",
    roles: ["team:owner", "individual"],
    preconditions: ["withdrawal-reason"],
    sideEffects: ["notify-host-organization"],
    notification: "سازمان میزبان",
    audit: "proposal.withdrawn",
    retry: "idempotent",
  },
] as const satisfies readonly Transition<ProposalState>[];

/**
 * Every outbox event type the proposal slice emits. The worker derives its
 * supported set from this list, so an event a proposal adapter emits but this
 * list omits is dead-lettered rather than silently dropped — the same contract
 * `challengeOutboxEventTypes` carries.
 */
export const proposalOutboxEventTypes = [
  "proposal.draft.created",
  "proposal.draft.updated",
  "proposal.submitted",
  "proposal.eligibility.started",
  "proposal.eligible",
  "proposal.ineligible",
  "proposal.clarification.requested",
  "proposal.clarification.submitted",
  "proposal.review.started",
  "proposal.revision.requested",
  "proposal.revision.started",
  "proposal.resubmitted",
  "proposal.withdrawn",
] as const;
export type ProposalOutboxEventType = (typeof proposalOutboxEventTypes)[number];

/**
 * The canonical proposal content, mirroring the fields the browser aggregate
 * already collects (`domain/solver.ts`). Persisted as one immutable `jsonb`
 * blob per version, exactly like `ChallengeDraftContent`, so a submitted
 * version can be proved byte-for-byte later (FR-SOL-006).
 */
export type ProposalContent = {
  readonly title: string;
  readonly problemStatement: string;
  readonly valueProposition: string;
  readonly maturityLevel: string;
  readonly technologies: readonly string[];
  readonly technicalApproach: string;
  readonly architecture: string;
  readonly dataNeeds: string;
  readonly successMetrics: string;
  readonly ipStatus: string;
  readonly durationWeeks: string;
  readonly roadmap: string;
  readonly dependencies: string;
  readonly pilotLocation: string;
  readonly risks: string;
  readonly teamSummary: string;
  readonly budgetAmountMinor: number | null;
  readonly budgetCurrency: string;
  readonly attachmentIds: readonly string[];
  readonly termsAccepted: boolean;
};

export type ProposalReadinessIssue = {
  readonly path: string;
  readonly code: "required" | "min_length" | "format";
  readonly message: string;
};

export type ProposalReadiness = {
  readonly ready: boolean;
  readonly issues: readonly ProposalReadinessIssue[];
};

function filled(value: string, minimum = 2): boolean {
  return value.trim().length >= minimum;
}

/**
 * One deterministic readiness rule shared by draft reads, preview and submit,
 * so all three report identical field-level errors — the same contract B1
 * established for challenges.
 */
export function evaluateProposalReadiness(content: ProposalContent): ProposalReadiness {
  const issues: ProposalReadinessIssue[] = [];
  const add = (path: string, code: ProposalReadinessIssue["code"], message: string) =>
    issues.push({ path, code, message });

  if (!filled(content.title, 5)) add("/content/title", "min_length", "عنوان پیشنهاد را وارد کنید.");
  if (!filled(content.problemStatement, 20))
    add("/content/problem_statement", "min_length", "درک خود از مسئله را کامل‌تر بنویسید.");
  if (!filled(content.valueProposition, 20))
    add("/content/value_proposition", "min_length", "ارزش پیشنهادی راهکار را توضیح دهید.");
  if (!filled(content.technicalApproach, 20))
    add("/content/technical_approach", "min_length", "رویکرد فنی را شرح دهید.");
  if (!filled(content.successMetrics, 10))
    add("/content/success_metrics", "min_length", "سنجه‌های موفقیت را مشخص کنید.");
  if (!filled(content.durationWeeks, 1))
    add("/content/duration_weeks", "required", "مدت اجرا را وارد کنید.");
  if (!filled(content.ipStatus, 2))
    add("/content/ip_status", "required", "وضعیت مالکیت فکری را مشخص کنید.");
  if (content.budgetAmountMinor === null)
    add("/content/budget_amount_minor", "required", "مبلغ پیشنهادی را وارد کنید.");
  if (!content.termsAccepted)
    add("/content/terms_accepted", "required", "پذیرش شرایط فراخوان الزامی است.");

  return { ready: issues.length === 0, issues };
}

/**
 * The facts an eligibility decision is made from. They are passed in rather
 * than read inside, so the evaluator stays pure and the adapter decides which
 * *version* of the rule and which workspace state it is judging.
 */
export type EligibilityApplicant = {
  readonly workspaceId: WorkspaceId;
  readonly applicantType: ApplicantType | null;
  readonly verified: boolean;
  readonly ndaAccepted: boolean;
  readonly requiredDocumentsProvided: boolean;
};

/**
 * The B3 `eligibility_rule` snapshot bound to one challenge version. C1
 * evaluates against the rule active when the challenge was *published*, never
 * the current one, so a rule edited later cannot retroactively disqualify a
 * solver who already read the terms.
 */
export type EligibilityRuleSnapshot = {
  readonly challengeVersionId: string;
  readonly allowedApplicantTypes: readonly ApplicantType[];
  readonly verificationRequired: boolean;
  readonly ndaRequired: boolean;
  readonly documentGateRequired: boolean;
  readonly proposalDeadline: string | null;
  readonly state: "open" | "paused" | "closed";
};

export const eligibilityReasonCodes = [
  "call_not_open",
  "deadline_passed",
  "applicant_type_unknown",
  "applicant_type_not_allowed",
  "verification_required",
  "nda_required",
  "documents_required",
] as const;
export type EligibilityReasonCode = (typeof eligibilityReasonCodes)[number];

/**
 * `ineligible` is structural — nothing the solver does today changes it.
 * `needs_action` is fixable by the solver, and carries what to do. Collapsing
 * the two would make every refusal look permanent, which is exactly the
 * "non-generic reason" C1's acceptance asks for.
 */
export type EligibilityStatus = "eligible" | "needs_action" | "ineligible";

export type EligibilityReason = {
  readonly code: EligibilityReasonCode;
  readonly message: string;
};

export type EligibilityDecision = {
  readonly status: EligibilityStatus;
  readonly evaluatedAgainstVersionId: string;
  readonly reasons: readonly EligibilityReason[];
  readonly nextActions: readonly string[];
};

const reasonMessages: Record<EligibilityReasonCode, string> = {
  call_not_open: "این فراخوان در حال حاضر پذیرای پیشنهاد نیست.",
  deadline_passed: "مهلت دریافت پیشنهاد پایان یافته است.",
  applicant_type_unknown: "نوع فضای کاری فعال قابل تشخیص نیست.",
  applicant_type_not_allowed: "نوع فضای کاری فعال در فهرست متقاضیان مجاز نیست.",
  verification_required: "احراز هویت این فضای کاری هنوز تأیید نشده است.",
  nda_required: "پذیرش توافق‌نامه محرمانگی برای این فراخوان الزامی است.",
  documents_required: "مدارک الزامی این فراخوان هنوز کامل نشده است.",
};

/**
 * C1's server-side eligibility decision. Server time decides every deadline,
 * never a client clock.
 *
 * Deliberately narrower than the browser's `evaluateEligibility`: that one also
 * scores profile readiness and required expertise, but the B3 rule snapshot
 * versions neither, so judging against them would mean applying policy no
 * approved rule version ever recorded. Adding them needs a rule column first.
 */
export function evaluateProposalEligibility(
  rule: EligibilityRuleSnapshot,
  applicant: EligibilityApplicant,
  now: Date,
): EligibilityDecision {
  const reject = (code: EligibilityReasonCode): EligibilityDecision => ({
    status: "ineligible",
    evaluatedAgainstVersionId: rule.challengeVersionId,
    reasons: [{ code, message: reasonMessages[code] }],
    nextActions: [],
  });

  if (rule.state !== "open") return reject("call_not_open");
  if (rule.proposalDeadline !== null && Date.parse(rule.proposalDeadline) <= now.getTime()) {
    return reject("deadline_passed");
  }
  if (applicant.applicantType === null) return reject("applicant_type_unknown");
  if (!rule.allowedApplicantTypes.includes(applicant.applicantType)) {
    return reject("applicant_type_not_allowed");
  }

  // Everything below is a gate the solver can still clear, so it is reported
  // as an action rather than a refusal.
  const reasons: EligibilityReason[] = [];
  const nextActions: string[] = [];
  const requireGate = (
    required: boolean,
    satisfied: boolean,
    code: EligibilityReasonCode,
    action: string,
  ) => {
    if (required && !satisfied) {
      reasons.push({ code, message: reasonMessages[code] });
      nextActions.push(action);
    }
  };

  requireGate(
    rule.verificationRequired,
    applicant.verified,
    "verification_required",
    "verify_workspace",
  );
  requireGate(rule.ndaRequired, applicant.ndaAccepted, "nda_required", "accept_nda");
  requireGate(
    rule.documentGateRequired,
    applicant.requiredDocumentsProvided,
    "documents_required",
    "provide_documents",
  );

  return {
    status: reasons.length ? "needs_action" : "eligible",
    evaluatedAgainstVersionId: rule.challengeVersionId,
    reasons,
    nextActions,
  };
}

export type ProposalVersionRef = {
  readonly id: ProposalVersionId;
  readonly proposalId: ProposalId;
  readonly number: number;
  readonly baseVersionId: ProposalVersionId | null;
  readonly changedFields: readonly string[];
  readonly contentHash: string;
  readonly locked: boolean;
  readonly actorUserId: UserId;
  readonly createdAt: string;
};

/**
 * Which team roles may act on a proposal, mirroring `decideTeamPermission`
 * (`lib/solver/permissions.ts`) that C2 ports server-side. Restated as data so
 * the transition table above and the API guard read from one list.
 */
export const proposalAuthoringRoles: readonly WorkspaceRole[] = [
  "team:owner",
  "team:admin",
  "team:proposal-manager",
  "individual",
];

export function canAuthorProposal(role: WorkspaceRole): boolean {
  return proposalAuthoringRoles.includes(role);
}
