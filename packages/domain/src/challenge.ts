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

export const challengeAuthoringStages = ["draft", "triage", "formulation", "approvals"] as const;
export type ChallengeAuthoringStage = (typeof challengeAuthoringStages)[number];

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
    roles: ["org:owner", "org:member"],
    preconditions: ["brief-valid"],
    sideEffects: ["lock-intake-version"],
    notification: "مسئول غربالگری",
    audit: "challenge.triage.requested",
    retry: "idempotent",
  },
  {
    from: "triage",
    to: "formulation",
    roles: ["org:owner", "org:member", "platform:ops"],
    preconditions: ["triage-passed"],
    sideEffects: ["open-formulation-workspace"],
    notification: "مالک مسئله",
    audit: "challenge.formulation.started",
    retry: "idempotent",
  },
  {
    from: "formulation",
    to: "approvals",
    roles: ["org:owner", "org:member", "platform:ops"],
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

export type ChallengeReadinessIssue = {
  readonly path: string;
  readonly code: "required" | "min_length" | "format" | "derived_value";
  readonly message: string;
  readonly step: 1 | 2 | 3 | 4;
};

export type ChallengeReadiness = {
  readonly ready: boolean;
  readonly issues: readonly ChallengeReadinessIssue[];
};

function hasText(value: string, minimum = 2): boolean {
  return value.trim().length >= minimum;
}

/**
 * The authoritative, deterministic brief-readiness rule used by reads,
 * previews, and lifecycle commands. It intentionally validates only fields
 * persisted in the canonical challenge content.
 */
export function evaluateChallengeReadiness(content: ChallengeDraftContent): ChallengeReadiness {
  const issues: ChallengeReadinessIssue[] = [];
  const add = (
    path: string,
    code: ChallengeReadinessIssue["code"],
    message: string,
    step: ChallengeReadinessIssue["step"],
  ) => issues.push({ path, code, message, step });

  if (!hasText(content.title, 5))
    add("/content/title", "min_length", "عنوان مسئله را روشن و کوتاه وارد کنید.", 1);
  if (!hasText(content.summary, 12))
    add("/content/summary", "min_length", "شرح یک جمله‌ای مسئله را کامل‌تر بنویسید.", 1);
  if (!hasText(content.category))
    add("/content/category", "required", "دسته‌بندی اصلی را انتخاب کنید.", 1);
  if (!hasText(content.location, 3))
    add("/content/location", "min_length", "واحد، سایت یا محل درگیر را وارد کنید.", 1);
  if (!hasText(content.contact.name, 3))
    add("/content/contact/name", "min_length", "مالک مسئله را مشخص کنید.", 1);
  if (!hasText(content.desiredOutcome, 10))
    add("/content/desired_outcome", "min_length", "نتیجه مورد انتظار سازمان را توضیح دهید.", 1);

  if (!hasText(content.currentState, 15))
    add("/content/current_state", "min_length", "وضعیت فعلی را با جزئیات کافی توضیح دهید.", 2);
  if (!hasText(content.expectedOutput, 8))
    add("/content/expected_output", "min_length", "خروجی نهایی مورد انتظار را مشخص کنید.", 2);
  if (
    !content.successCriteria.some(
      (item) => hasText(item.title, 3) && hasText(item.target, 2) && hasText(item.method, 4),
    )
  ) {
    add("/content/success_criteria", "required", "حداقل یک معیار موفقیت کامل اضافه کنید.", 2);
  }
  if (!hasText(content.inScope, 8))
    add("/content/in_scope", "min_length", "موارد داخل دامنه را مشخص کنید.", 2);

  if (!content.outputType)
    add("/content/output_type", "required", "خروجی مورد انتظار همکاری را انتخاب کنید.", 3);
  if (!content.sourcingModel)
    add("/content/sourcing_model", "required", "شیوه جذب حل‌کننده را انتخاب کنید.", 3);
  if (!content.allowedApplicantTypes.length) {
    add(
      "/content/allowed_applicant_types",
      "required",
      "حداقل یک نوع مشارکت‌کننده مجاز انتخاب کنید.",
      3,
    );
  }
  const includesPerson = content.allowedApplicantTypes.includes("individual");
  const includesTeam = content.allowedApplicantTypes.some((type) => type !== "individual");
  const expectedScope =
    includesPerson && includesTeam
      ? "both"
      : includesPerson
        ? "person"
        : includesTeam
          ? "team"
          : null;
  if (content.applicantScope !== expectedScope) {
    add(
      "/content/applicant_scope",
      "derived_value",
      "دامنه همکاری باید با مشارکت‌کنندگان مجاز سازگار باشد.",
      3,
    );
  }
  if (!content.workMode)
    add("/content/work_mode", "required", "شیوه انجام همکاری را انتخاب کنید.", 3);
  if (!content.proposalDeadline)
    add("/content/proposal_deadline", "required", "مهلت دریافت پیشنهاد را وارد کنید.", 3);
  if (content.budget.status === "fixed" && content.budget.amountMinor === null) {
    add("/content/budget/amount_minor", "required", "مبلغ بودجه مشخص را وارد کنید.", 3);
  }
  if (
    (content.sourcingModel === "private" || content.sourcingModel === "hybrid") &&
    content.invitees.length === 0
  ) {
    add("/content/invitees", "required", "حداقل یک دعوت‌شونده یا گروه هدف را مشخص کنید.", 3);
  }

  if (!content.visibility)
    add("/content/visibility", "required", "سطح نمایش پرونده را انتخاب کنید.", 4);
  if (
    (content.visibility === "public" || content.visibility === "registered") &&
    !hasText(content.publicSummary, 20)
  ) {
    add("/content/public_summary", "min_length", "خلاصه عمومی را بدون اطلاعات حساس کامل کنید.", 4);
  }
  if (!content.ipTerms)
    add("/content/ip_terms", "required", "وضعیت مالکیت فکری را انتخاب کنید.", 4);
  if (!/^\S+@\S+\.\S+$/.test(content.contact.email.trim())) {
    add("/content/contact/email", "format", "ایمیل معتبر مسئول پیگیری را وارد کنید.", 4);
  }
  if (!hasText(content.contact.phone, 7))
    add("/content/contact/phone", "min_length", "شماره تماس مسئول پیگیری را وارد کنید.", 4);
  if (!content.accuracyConfirmed) {
    add("/content/accuracy_confirmed", "required", "صحت اطلاعات و اختیار ارسال را تأیید کنید.", 4);
  }

  return { ready: issues.length === 0, issues };
}

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

/**
 * The four independent publication gates (canonical model §8.2): technical,
 * legal, and finance are each attributed to a distinct actor, plus the ops
 * quality gate. There is no "business" gate — see 20_CANONICAL_MODEL.md and
 * 70_SECURITY_AND_AUTHZ.md §6, and the approvals→published preconditions
 * ("technical-approved", "legal-approved", "finance-approved",
 * "quality-passed") already defined on challengeTransitions above.
 */
export const publicationGates = ["technical", "legal", "finance", "quality"] as const;
export type PublicationGate = (typeof publicationGates)[number];

export const approvalDecisions = ["approved", "rejected"] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export function isPublicationGate(value: unknown): value is PublicationGate {
  return publicationGates.includes(value as PublicationGate);
}

/**
 * Who may record each gate. `technical` is org-only — there is no platform
 * equivalent, since only the organization has the domain knowledge to vet
 * technical feasibility. `legal`/`finance` accept either the org's own
 * designated approver or the platform's compliance staff. `quality` is
 * platform-only: an org cannot self-certify the one independent check that
 * exists specifically to not be self-certified.
 */
export const gateApproverRoles: Record<PublicationGate, readonly WorkspaceRole[]> = {
  technical: ["org:approver_technical"],
  legal: ["org:approver_legal", "platform:legal"],
  finance: ["org:approver_finance", "platform:finance"],
  quality: ["platform:ops"],
};

export function isGateApproverRole(gate: PublicationGate, role: WorkspaceRole): boolean {
  return gateApproverRoles[gate].includes(role);
}

export type ChallengeApprovalRecord = {
  readonly gate: PublicationGate;
  readonly decision: ApprovalDecision;
};

export type PublicationReadiness = {
  readonly ready: boolean;
  readonly satisfied: readonly PublicationGate[];
  readonly missing: readonly PublicationGate[];
};

/**
 * Publication requires all four gates recorded with an "approved" decision
 * (canonical model invariant #2). A recorded "rejected" decision still
 * occupies that gate's one row per version — the version cannot be
 * re-approved; a reasoned decision must send the challenge back through
 * formulation as a new version instead (out of B2's scope).
 */
export function evaluatePublicationReadiness(
  approvals: readonly ChallengeApprovalRecord[],
): PublicationReadiness {
  const satisfied = publicationGates.filter((gate) =>
    approvals.some((approval) => approval.gate === gate && approval.decision === "approved"),
  );
  const missing = publicationGates.filter((gate) => !satisfied.includes(gate));
  return { ready: missing.length === 0, satisfied, missing };
}
