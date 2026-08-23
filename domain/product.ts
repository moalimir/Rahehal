import type { WorkspaceRole } from "@rahhal/domain";

export type ActionName =
  | "view"
  | "edit"
  | "invite"
  | "submit"
  | "review"
  | "decide"
  | "accept-deliverable"
  | "approve-payment"
  | "publish"
  | "contract-sign"
  | "manage-access"
  | "resolve-dispute";

export type PermissionContext = {
  role: WorkspaceRole;
  membershipActive: boolean;
  caseMember: boolean;
  twoFactorVerified: boolean;
  coiClear: boolean;
};

const roleActions: Partial<Record<WorkspaceRole, readonly ActionName[]>> = {
  "platform:admin": ["view", "manage-access"],
  "platform:ops": ["view", "review", "manage-access", "resolve-dispute"],
  "platform:finance": ["view", "approve-payment"],
  "platform:legal": ["view", "contract-sign"],
  "platform:reviewer": ["view", "review"],
  "org:owner": [
    "view",
    "edit",
    "invite",
    "submit",
    "decide",
    "accept-deliverable",
    "publish",
    "contract-sign",
    "manage-access",
  ],
  "org:member": ["view", "edit", "invite", "submit"],
  "org:approver_technical": ["view", "accept-deliverable"],
  "org:approver_legal": ["view", "contract-sign"],
  "org:approver_finance": ["view", "approve-payment"],
  "org:publisher": ["view", "publish"],
  "team:owner": ["view", "edit", "invite", "submit", "contract-sign", "manage-access"],
  "team:admin": ["view", "edit", "invite", "submit", "contract-sign"],
  "team:proposal-manager": ["view", "edit", "submit"],
  "team:contributor": ["view", "edit"],
  "team:viewer": ["view"],
  individual: ["view", "edit", "submit", "contract-sign"],
};

const sensitiveActions = new Set<ActionName>([
  "decide",
  "accept-deliverable",
  "approve-payment",
  "publish",
  "contract-sign",
  "manage-access",
  "resolve-dispute",
]);

export function canPerform(context: PermissionContext, action: ActionName): boolean {
  if (!context.membershipActive || !context.caseMember) return false;
  if (!roleActions[context.role]?.includes(action)) return false;
  if (sensitiveActions.has(action) && !context.twoFactorVerified) return false;
  if (context.role === "platform:reviewer" && action === "review" && !context.coiClear)
    return false;
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

export function formatToman(amount: number): string {
  return `${new Intl.NumberFormat("fa-IR").format(amount)} تومان`;
}

export function normalizePersian(value: string): string {
  return value
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}
