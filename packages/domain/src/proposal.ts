import { currencies, type Currency, type Transition } from "./challenge.js";
import type {
  ChallengeVersionId,
  FileId,
  ProposalId,
  ProposalVersionId,
  UserId,
  WorkspaceId,
} from "./id.js";
import type { ApplicantType } from "./taxonomy.js";

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
 * Proposal content locks only when it is submitted or resubmitted. A
 * clarification response is separate evidence; it must not fabricate a new
 * proposal-content version.
 */
export const proposalVersionLockingStates = ["submitted", "resubmitted"] as const;

/** Metadata-only proposal effects accepted by the worker boundary. */
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
  "proposal.revision.draft.created",
  "proposal.resubmitted",
] as const;
export type ProposalOutboxEventType = (typeof proposalOutboxEventTypes)[number];

/**
 * One canonical proposal lifecycle shared by the browser oracle and the
 * authoritative API. Team-policy and assignment checks remain explicit
 * preconditions; a role appearing here is only a candidate actor, never enough
 * authorization on its own.
 */
export const proposalTransitions = [
  {
    from: "draft",
    to: "submitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["form-valid", "sender-authorized", "terms-accepted"],
    sideEffects: ["create-version", "lock-proposal-version", "create-receipt"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.submitted",
    retry: "idempotent",
  },
  {
    from: "submitted",
    to: "eligibility_review",
    roles: ["org:member", "platform:ops"],
    preconditions: ["submission-locked"],
    sideEffects: ["open-eligibility-review"],
    notification: "مالک پیشنهاد",
    audit: "proposal.eligibility.started",
    retry: "idempotent",
  },
  {
    from: "eligibility_review",
    to: "eligible",
    roles: ["org:member", "platform:ops"],
    preconditions: ["eligibility-passed"],
    sideEffects: ["mark-eligible"],
    notification: "مالک پیشنهاد",
    audit: "proposal.eligible",
    retry: "manual-review",
  },
  {
    from: "eligibility_review",
    to: "ineligible",
    roles: ["org:member", "platform:ops"],
    preconditions: ["eligibility-failed", "reason-recorded"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.ineligible",
    retry: "manual-review",
  },
  {
    from: "eligible",
    to: "clarification_requested",
    roles: ["org:member"],
    preconditions: ["question-recorded"],
    sideEffects: ["open-controlled-thread"],
    notification: "مالک پیشنهاد",
    audit: "proposal.clarification.requested",
    retry: "idempotent",
  },
  {
    from: "clarification_requested",
    to: "clarification_submitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["response-valid", "sender-authorized"],
    sideEffects: ["lock-clarification-response"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.clarification.submitted",
    retry: "idempotent",
  },
  {
    from: "clarification_submitted",
    to: "reviewing",
    roles: ["org:member"],
    preconditions: ["clarification-resolved"],
    sideEffects: ["open-review"],
    notification: "داوران",
    audit: "proposal.review.started",
    retry: "idempotent",
  },
  {
    from: "reviewing",
    to: "revision_requested",
    roles: ["org:member"],
    preconditions: ["revision-scope", "revision-deadline"],
    sideEffects: ["create-revision-draft"],
    notification: "مالک پیشنهاد",
    audit: "proposal.revision.requested",
    retry: "idempotent",
  },
  {
    from: "revision_requested",
    to: "revision_draft",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "team:contributor", "individual"],
    preconditions: ["editor-authorized"],
    sideEffects: ["open-versioned-draft"],
    notification: "",
    audit: "proposal.revision.draft.created",
    retry: "idempotent",
  },
  {
    from: "revision_draft",
    to: "resubmitted",
    roles: ["team:owner", "team:admin", "team:proposal-manager", "individual"],
    preconditions: ["form-valid", "sender-authorized", "terms-accepted", "base-version-cited"],
    sideEffects: ["create-version", "lock-proposal-version", "create-receipt"],
    notification: "سازمان مسئله‌گذار",
    audit: "proposal.resubmitted",
    retry: "idempotent",
  },
  {
    from: "resubmitted",
    to: "reviewing",
    roles: ["org:member", "platform:ops"],
    preconditions: ["eligibility-passed"],
    sideEffects: ["open-review"],
    notification: "مالک پیشنهاد",
    audit: "proposal.review.resumed",
    retry: "idempotent",
  },
  {
    from: "reviewing",
    to: "selected",
    roles: ["org:owner", "org:member"],
    preconditions: ["reviews-complete", "decision-approved"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.selected",
    retry: "manual-review",
  },
  {
    from: "reviewing",
    to: "rejected",
    roles: ["org:owner", "org:member"],
    preconditions: ["reviews-complete", "decision-rationale"],
    sideEffects: ["lock-outcome"],
    notification: "مالک پیشنهاد",
    audit: "proposal.rejected",
    retry: "manual-review",
  },
] as const satisfies readonly Transition<ProposalState>[];

/**
 * Authoritative proposal content. It retains every field collected by the
 * browser form while normalizing money to integer minor units and attachments
 * to opaque metadata references. The C3 browser adapter owns that explicit
 * conversion; this contract never persists display-formatted money or names as
 * file authority.
 */
export type ProposalContent = {
  readonly title: string;
  readonly problemStatement: string;
  readonly valueProposition: string;
  readonly maturityLevel: string;
  readonly prototypeWeeks: string;
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
  readonly mitigation: string;
  readonly leadName: string;
  readonly teamSummary: string;
  readonly relevantExperience: string;
  readonly budgetAmountMinor: number | null;
  readonly budgetCurrency: Currency;
  readonly paymentModel: string;
  readonly budgetRationale: string;
  readonly startAvailability: string;
  readonly teamAvailability: string;
  readonly ndaAccepted: boolean;
  readonly conflictDeclared: boolean;
  readonly ipAccepted: boolean;
  readonly accuracyConfirmed: boolean;
  readonly attachmentIds: readonly FileId[];
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
 * Persian and Arabic-Indic digits read as the ASCII digits they are.
 *
 * A Persian keyboard produces ۶, not 6, so a week count typed the way the
 * product asks for it was rejected as badly formatted with no hint why. The
 * contact-verification code path already normalizes the same way; readiness has
 * to agree, because it is the rule draft reads, preview and submit all share.
 */
function weeks(value: string): string {
  const persian = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
  const arabic = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return value
    .trim()
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[\u0660-\u0669]/g, (digit) => String(arabic.indexOf(digit)));
}

/**
 * One deterministic readiness rule shared by draft reads, preview and submit,
 * so all three report identical field-level errors — the same contract B1
 * established for challenges.
 */
export type ProposalDeclarationRequirements = {
  readonly ndaRequired: boolean;
};

const allProposalDeclarations: ProposalDeclarationRequirements = {
  ndaRequired: true,
};

export function evaluateProposalReadiness(
  content: ProposalContent,
  declarations: ProposalDeclarationRequirements = allProposalDeclarations,
): ProposalReadiness {
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
  const prototypeWeeks = weeks(content.prototypeWeeks);
  if (!/^\d{1,2}$/.test(prototypeWeeks) || Number(prototypeWeeks) < 1)
    add("/content/prototype_weeks", "format", "زمان نمونه اولیه را به هفته وارد کنید.");
  const durationWeeks = weeks(content.durationWeeks);
  if (!/^\d{1,3}$/.test(durationWeeks) || Number(durationWeeks) < 1)
    add("/content/duration_weeks", "format", "مدت اجرا را به هفته وارد کنید.");
  if (!filled(content.ipStatus, 2))
    add("/content/ip_status", "required", "وضعیت مالکیت فکری را مشخص کنید.");
  if (
    content.budgetAmountMinor === null ||
    !Number.isSafeInteger(content.budgetAmountMinor) ||
    content.budgetAmountMinor < 0
  )
    add("/content/budget_amount_minor", "required", "مبلغ پیشنهادی را وارد کنید.");
  if (!currencies.includes(content.budgetCurrency))
    add("/content/budget_currency", "format", "واحد پول معتبر نیست.");
  if (declarations.ndaRequired && !content.ndaAccepted)
    add("/content/nda_accepted", "required", "پذیرش محرمانگی الزامی است.");
  if (!content.conflictDeclared)
    add("/content/conflict_declared", "required", "اعلام تعارض منافع الزامی است.");
  if (!content.ipAccepted)
    add("/content/ip_accepted", "required", "پذیرش شرایط مالکیت فکری الزامی است.");
  if (!content.accuracyConfirmed)
    add("/content/accuracy_confirmed", "required", "تأیید صحت اطلاعات الزامی است.");

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
  readonly workspaceVerified: boolean;
  readonly ndaAccepted: boolean;
  /** Synthetic Phase-3 acknowledgement only; never claims file upload/review. */
  readonly documentGateAcknowledged: boolean;
};

/**
 * The B3 `eligibility_rule` snapshot bound to one challenge version. C1
 * evaluates against the rule active when the challenge was *published*, never
 * the current one, so a rule edited later cannot retroactively disqualify a
 * solver who already read the terms.
 */
export type EligibilityRuleSnapshot = {
  readonly challengeVersionId: ChallengeVersionId;
  readonly allowedApplicantTypes: readonly ApplicantType[];
  readonly verificationRequired: boolean;
  readonly ndaRequired: boolean;
  readonly documentGateRequired: boolean;
};

/** B6's mutable call state, read beside the immutable B3 rule. */
export type EligibilityCallSnapshot = {
  readonly state: "open" | "paused" | "closed" | "cancelled";
  readonly proposalDeadline: string;
};

export const eligibilityReasonCodes = [
  "call_not_open",
  "deadline_passed",
  "applicant_type_unknown",
  "applicant_type_not_allowed",
  "verification_required",
  "nda_required",
  "document_acknowledgement_required",
] as const;
export type EligibilityReasonCode = (typeof eligibilityReasonCodes)[number];

/**
 * `ineligible` is structural — nothing the solver does today changes it.
 * `needs_action` is fixable by the solver, and carries what to do. Collapsing
 * the two would make every refusal look permanent, which is exactly the
 * "non-generic reason" C1's acceptance asks for.
 */
export type EligibilityStatus = "eligible" | "needs_action" | "ineligible";

export const eligibilityNextActions = [
  "verify_workspace",
  "accept_nda",
  "acknowledge_document_gate",
] as const;
export type EligibilityNextAction = (typeof eligibilityNextActions)[number];

export type EligibilityReason = {
  readonly code: EligibilityReasonCode;
  readonly message: string;
};

export type EligibilityDecision = {
  readonly status: EligibilityStatus;
  readonly evaluatedAgainstVersionId: string;
  readonly reasons: readonly EligibilityReason[];
  readonly nextActions: readonly EligibilityNextAction[];
};

const reasonMessages: Record<EligibilityReasonCode, string> = {
  call_not_open: "این فراخوان در حال حاضر پذیرای پیشنهاد نیست.",
  deadline_passed: "مهلت دریافت پیشنهاد پایان یافته است.",
  applicant_type_unknown: "نوع فضای کاری فعال قابل تشخیص نیست.",
  applicant_type_not_allowed: "نوع فضای کاری فعال در فهرست متقاضیان مجاز نیست.",
  verification_required: "احراز هویت این فضای کاری هنوز تأیید نشده است.",
  nda_required: "پذیرش توافق‌نامه محرمانگی برای این فراخوان الزامی است.",
  document_acknowledgement_required: "تأیید الزام مدارک این فراخوان هنوز ثبت نشده است.",
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
  call: EligibilityCallSnapshot,
  applicant: EligibilityApplicant,
  now: Date,
): EligibilityDecision {
  const reject = (code: EligibilityReasonCode): EligibilityDecision => ({
    status: "ineligible",
    evaluatedAgainstVersionId: rule.challengeVersionId,
    reasons: [{ code, message: reasonMessages[code] }],
    nextActions: [],
  });

  if (call.state !== "open") return reject("call_not_open");
  if (Date.parse(call.proposalDeadline) <= now.getTime()) {
    return reject("deadline_passed");
  }
  if (applicant.applicantType === null) return reject("applicant_type_unknown");
  if (!rule.allowedApplicantTypes.includes(applicant.applicantType)) {
    return reject("applicant_type_not_allowed");
  }

  // Everything below is a gate the solver can still clear, so it is reported
  // as an action rather than a refusal.
  const reasons: EligibilityReason[] = [];
  const nextActions: EligibilityNextAction[] = [];
  const requireGate = (
    required: boolean,
    satisfied: boolean,
    code: EligibilityReasonCode,
    action: EligibilityNextAction,
  ) => {
    if (required && !satisfied) {
      reasons.push({ code, message: reasonMessages[code] });
      nextActions.push(action);
    }
  };

  requireGate(
    rule.verificationRequired,
    applicant.workspaceVerified,
    "verification_required",
    "verify_workspace",
  );
  requireGate(rule.ndaRequired, applicant.ndaAccepted, "nda_required", "accept_nda");
  requireGate(
    rule.documentGateRequired,
    applicant.documentGateAcknowledged,
    "document_acknowledgement_required",
    "acknowledge_document_gate",
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
  readonly acceptedChallengeVersionId: ChallengeVersionId | null;
  readonly changedFields: readonly string[];
  readonly contentHash: string;
  readonly locked: boolean;
  readonly actorUserId: UserId;
  readonly createdAt: string;
};
