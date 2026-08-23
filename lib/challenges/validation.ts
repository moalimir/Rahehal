import type { ChallengeRecord } from "@/domain/challenge";
import { applicantScopeForTypes } from "@/domain/taxonomy";

export type WizardStep = 1 | 2 | 3 | 4;
export type ValidationIssue = {
  id: string;
  field: keyof ChallengeRecord | "successCriteria";
  step: WizardStep;
  message: string;
};

export const wizardSteps: Array<{ id: WizardStep; title: string; shortTitle: string }> = [
  { id: 1, title: "تعریف اولیه مسئله", shortTitle: "تعریف مسئله" },
  { id: 2, title: "نتیجه، معیار و دامنه", shortTitle: "نتیجه و دامنه" },
  { id: 3, title: "مدل همکاری، زمان و بودجه", shortTitle: "همکاری و زمان" },
  { id: 4, title: "دسترسی، مالکیت و ارسال", shortTitle: "دسترسی و ارسال" },
];

function text(value: string, minimum = 2) {
  return value.trim().length >= minimum;
}

export function validateStep(record: ChallengeRecord, step: WizardStep): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (id: string, field: ValidationIssue["field"], message: string) =>
    issues.push({ id, field, step, message });

  if (step === 1) {
    if (!text(record.title, 5)) add("title", "title", "عنوان مسئله را روشن و کوتاه وارد کنید.");
    if (!text(record.summary, 12))
      add("summary", "summary", "شرح یک‌جمله‌ای مسئله را کامل‌تر بنویسید.");
    if (!text(record.category)) add("category", "category", "دسته‌بندی اصلی را انتخاب کنید.");
    if (!text(record.location, 3))
      add("location", "location", "واحد، سایت یا محل درگیر را وارد کنید.");
    if (!text(record.ownerName, 3)) add("ownerName", "ownerName", "مالک مسئله را مشخص کنید.");
    if (!text(record.desiredOutcome, 10))
      add("desiredOutcome", "desiredOutcome", "نتیجه مورد انتظار سازمان را توضیح دهید.");
  }

  if (step === 2) {
    if (!text(record.currentState, 15))
      add("currentState", "currentState", "وضعیت فعلی را با جزئیات کافی توضیح دهید.");
    if (!text(record.expectedOutput, 8))
      add("expectedOutput", "expectedOutput", "خروجی نهایی مورد انتظار را مشخص کنید.");
    const completeCriteria = record.successCriteria.filter(
      (item) => text(item.title, 3) && text(item.target, 2) && text(item.method, 4),
    );
    if (!completeCriteria.length)
      add("successCriteria", "successCriteria", "حداقل یک معیار موفقیت کامل اضافه کنید.");
    if (!text(record.inScope, 8)) add("inScope", "inScope", "موارد داخل دامنه را مشخص کنید.");
  }

  if (step === 3) {
    if (!record.outputType)
      add("outputType", "outputType", "خروجی مورد انتظار همکاری را انتخاب کنید.");
    if (!record.sourcingModel)
      add("sourcingModel", "sourcingModel", "شیوه جذب حل‌کننده را انتخاب کنید.");
    if (!record.allowedApplicantTypes.length)
      add(
        "allowedApplicantTypes",
        "allowedApplicantTypes",
        "حداقل یک نوع مشارکت‌کننده مجاز انتخاب کنید.",
      );
    const derivedApplicantScope = applicantScopeForTypes(record.allowedApplicantTypes) ?? "";
    if (record.applicantScope !== derivedApplicantScope)
      add(
        "applicantScope",
        "applicantScope",
        "دامنه همکاری باید با مشارکت‌کنندگان مجاز سازگار باشد.",
      );
    if (!record.workMode) add("workMode", "workMode", "شیوه انجام همکاری را انتخاب کنید.");
    if (!record.proposalDeadline)
      add("proposalDeadline", "proposalDeadline", "مهلت دریافت پیشنهاد را وارد کنید.");
    if (!record.budgetStatus) add("budgetStatus", "budgetStatus", "وضعیت بودجه را مشخص کنید.");
    if (record.budgetStatus === "fixed" && !text(record.budgetAmount))
      add("budgetAmount", "budgetAmount", "مبلغ بودجه مشخص را وارد کنید.");
    if (["private", "hybrid"].includes(record.sourcingModel) && !text(record.invitees, 3))
      add("invitees", "invitees", "حداقل یک دعوت‌شونده یا گروه هدف را مشخص کنید.");
  }

  if (step === 4) {
    if (!record.visibility) add("visibility", "visibility", "سطح نمایش پرونده را انتخاب کنید.");
    if (["public", "registered"].includes(record.visibility) && !text(record.publicSummary, 20))
      add("publicSummary", "publicSummary", "خلاصه عمومی را بدون اطلاعات حساس کامل کنید.");
    if (!record.ipTerms) add("ipTerms", "ipTerms", "وضعیت مالکیت فکری را انتخاب کنید.");
    if (!text(record.contactName, 3))
      add("contactName", "contactName", "نام مسئول پیگیری را وارد کنید.");
    if (!/^\S+@\S+\.\S+$/.test(record.contactEmail.trim()))
      add("contactEmail", "contactEmail", "ایمیل معتبر مسئول پیگیری را وارد کنید.");
    if (!text(record.contactPhone, 7))
      add("contactPhone", "contactPhone", "شماره تماس مسئول پیگیری را وارد کنید.");
    if (!record.accuracyConfirmed)
      add("accuracyConfirmed", "accuracyConfirmed", "صحت اطلاعات و اختیار ارسال را تأیید کنید.");
  }

  return issues;
}

export function validateRecord(record: ChallengeRecord) {
  return ([1, 2, 3, 4] as WizardStep[]).flatMap((step) => validateStep(record, step));
}

export function isRecordReady(record: ChallengeRecord) {
  return validateRecord(record).length === 0;
}

export function normalizedEditableRecord(record: ChallengeRecord): ChallengeRecord {
  if (!["draft", "ready", "needs_changes"].includes(record.status)) return record;
  const applicantScope: ChallengeRecord["applicantScope"] =
    applicantScopeForTypes(record.allowedApplicantTypes) ?? "";
  const normalized: ChallengeRecord = {
    ...record,
    applicantScope,
  };
  return { ...normalized, status: isRecordReady(normalized) ? "ready" : "draft" };
}

export function issueFor(issues: ValidationIssue[], field: ValidationIssue["field"]) {
  return issues.find((issue) => issue.field === field)?.message;
}
