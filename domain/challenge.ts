import type { ApplicantScope, ApplicantType } from "@/domain/taxonomy";

export type ChallengeStatus =
  | "draft"
  | "ready"
  | "under_review"
  | "needs_changes"
  | "published"
  | "closed";

export type ChallengeStatusDefinition = {
  label: string;
  tone: "neutral" | "info" | "warning" | "success";
};

export const challengeStatuses: Record<ChallengeStatus, ChallengeStatusDefinition> = {
  draft: { label: "پیش‌نویس", tone: "neutral" },
  ready: { label: "آماده ارسال", tone: "info" },
  under_review: { label: "در انتظار بررسی", tone: "warning" },
  needs_changes: { label: "نیازمند اصلاح", tone: "warning" },
  published: { label: "منتشرشده", tone: "success" },
  closed: { label: "بسته‌شده", tone: "neutral" },
};

export const challengeStatusLabels = Object.fromEntries(
  Object.entries(challengeStatuses).map(([key, value]) => [key, value.label]),
) as Record<ChallengeStatus, string>;

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
};

export type SuccessCriterion = {
  id: string;
  title: string;
  target: string;
  method: string;
};

export type OutputType = "idea" | "solution" | "poc" | "pilot" | "project" | "technology" | "";
export type SourcingModel = "public" | "private" | "hybrid" | "";
export type WorkMode = "onsite" | "remote" | "hybrid" | "";
export type BudgetStatus = "fixed" | "quote" | "undecided" | "non_cash" | "";
export type Visibility = "public" | "registered" | "invite_only" | "nda" | "";
export type IpTerms = "solver_license" | "contract_transfer" | "joint_contract" | "";

export type ChallengeRecord = {
  id: string;
  status: ChallengeStatus;
  title: string;
  summary: string;
  category: string;
  location: string;
  ownerName: string;
  desiredOutcome: string;
  urgency: "normal" | "important" | "urgent";
  attachments: Attachment[];
  currentState: string;
  consequence: string;
  expectedOutput: string;
  successCriteria: SuccessCriterion[];
  inScope: string;
  constraints: string;
  organizationSupport: string;
  previousAttempts: string;
  outputType: OutputType;
  sourcingModel: SourcingModel;
  allowedApplicantTypes: ApplicantType[];
  applicantScope: ApplicantScope | "";
  workMode: WorkMode;
  proposalDeadline: string;
  preferredStartDate: string;
  budgetStatus: BudgetStatus;
  budgetAmount: string;
  currency: "IRR" | "USD" | "EUR";
  invitees: string;
  visibility: Visibility;
  publicSummary: string;
  ndaRequired: boolean;
  ipTerms: IpTerms;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  accuracyConfirmed: boolean;
  legalNotes: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  lastStep: 1 | 2 | 3 | 4;
};

export type CurrentUser = {
  name: string;
  email: string;
  phone: string;
  organization: string;
};

export const currentUser: CurrentUser = {
  name: "سارا نادری",
  email: "s.naderi@example.ir",
  phone: "۰۹۱۲۱۲۳۴۵۶۷",
  organization: "گروه مپنا",
};

export const categoryOptions = [
  "آب و محیط‌زیست",
  "نگهداری و پایش تجهیزات",
  "انرژی و بهره‌وری",
  "تولید و عملیات",
  "زنجیره تأمین و بسته‌بندی",
  "فناوری اطلاعات",
];

export const outputTypeLabels: Record<Exclude<OutputType, "">, string> = {
  idea: "ایده یا مطالعه",
  solution: "طراحی راهکار",
  poc: "نمونه اولیه یا PoC",
  pilot: "پایلوت",
  project: "اجرای پروژه",
  technology: "فناوری آماده",
};

export const sourcingModelLabels: Record<Exclude<SourcingModel, "">, string> = {
  public: "عمومی",
  private: "خصوصی و دعوتی",
  hybrid: "ترکیبی",
};

export const applicantTypeLabels: Record<ApplicantType, string> = {
  individual: "متخصص مستقل",
  "expert-team": "تیم تخصصی",
  company: "استارتاپ یا شرکت",
  lab: "آزمایشگاه یا مرکز پژوهشی",
  "academic-group": "دانشگاه یا گروه پژوهشی",
};

export const workModeLabels: Record<Exclude<WorkMode, "">, string> = {
  onsite: "حضوری",
  remote: "دورکار",
  hybrid: "ترکیبی",
};

export const currencyLabels: Record<ChallengeRecord["currency"], string> = {
  IRR: "ریال",
  USD: "دلار آمریکا",
  EUR: "یورو",
};

export const budgetStatusLabels: Record<Exclude<BudgetStatus, "">, string> = {
  fixed: "مبلغ مشخص",
  quote: "دریافت پیشنهاد قیمت",
  undecided: "بودجه هنوز نهایی نشده",
  non_cash: "بدون پرداخت نقدی",
};

export const visibilityLabels: Record<Exclude<Visibility, "">, string> = {
  public: "عمومی",
  registered: "فقط کاربران ثبت‌شده",
  invite_only: "فقط افراد دعوت‌شده",
  nda: "پس از تأیید محرمانگی",
};

export const ipTermLabels: Record<Exclude<IpTerms, "">, string> = {
  solver_license: "متعلق به ارائه‌دهنده و دارای مجوز استفاده برای سازمان",
  contract_transfer: "انتقال در قرارداد نهایی",
  joint_contract: "توافق مشترک در قرارداد نهایی",
};

export function isDraftStatus(status: ChallengeStatus) {
  return status === "draft" || status === "ready" || status === "needs_changes";
}
