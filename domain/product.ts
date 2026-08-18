export type InternalRole = "org" | "solver" | "reviewer" | "ops";

export type ActionName =
  | "view"
  | "edit"
  | "invite"
  | "submit"
  | "review"
  | "decide"
  | "accept-deliverable"
  | "approve-payment"
  | "manage-access"
  | "resolve-dispute";

export type CaseState =
  | "draft"
  | "triage"
  | "formulation"
  | "quality-review"
  | "published"
  | "evaluation"
  | "contracting"
  | "pilot"
  | "impact"
  | "closed";

export type PermissionContext = {
  role: InternalRole;
  membershipActive: boolean;
  caseMember: boolean;
  twoFactorVerified: boolean;
  conflictDeclared: boolean;
};

const roleActions: Record<InternalRole, readonly ActionName[]> = {
  org: ["view", "edit", "invite", "submit", "decide", "accept-deliverable", "manage-access"],
  solver: ["view", "edit", "submit"],
  reviewer: ["view", "review"],
  ops: ["view", "review", "manage-access", "approve-payment", "resolve-dispute"],
};

const sensitiveActions = new Set<ActionName>([
  "decide",
  "accept-deliverable",
  "approve-payment",
  "manage-access",
  "resolve-dispute",
]);

export function canPerform(context: PermissionContext, action: ActionName): boolean {
  if (!context.membershipActive || !context.caseMember) return false;
  if (!roleActions[context.role].includes(action)) return false;
  if (sensitiveActions.has(action) && !context.twoFactorVerified) return false;
  if (context.role === "reviewer" && action === "review" && !context.conflictDeclared) return false;
  return true;
}

export type GateResult = {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
};

export function publicationGates(input: {
  business: boolean;
  technical: boolean;
  finance: boolean;
  legal: boolean;
  quality: boolean;
}): GateResult[] {
  return [
    {
      id: "business",
      label: "تأیید صورت‌مسئله کسب‌وکار",
      passed: input.business,
      evidence: "نسخه قفل‌شده v3",
    },
    {
      id: "technical",
      label: "تأیید دامنه و معیار فنی",
      passed: input.technical,
      evidence: "صورت‌جلسه کمیته فنی",
    },
    {
      id: "finance",
      label: "تأمین و سقف بودجه",
      passed: input.finance,
      evidence: "تأییدیه FIN-204",
    },
    {
      id: "legal",
      label: "محرمانگی و مالکیت فکری",
      passed: input.legal,
      evidence: "ضمیمه حقوقی v2",
    },
    {
      id: "quality",
      label: "کنترل کیفیت انتشار",
      passed: input.quality,
      evidence: "در انتظار عملیات",
    },
  ];
}

export const caseTransitions: Record<CaseState, readonly CaseState[]> = {
  draft: ["triage"],
  triage: ["draft", "formulation"],
  formulation: ["triage", "quality-review"],
  "quality-review": ["formulation", "published"],
  published: ["evaluation"],
  evaluation: ["contracting"],
  contracting: ["pilot"],
  pilot: ["impact"],
  impact: ["closed"],
  closed: [],
};

export function canTransition(from: CaseState, to: CaseState): boolean {
  return caseTransitions[from].includes(to);
}

export function formatToman(amount: number): string {
  return `${new Intl.NumberFormat("fa-IR").format(amount)} تومان`;
}

export function normalizePersian(value: string): string {
  return value
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}
