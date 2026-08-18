import type { ProposalContent } from "@/domain/solver";

export type ProposalStep = "summary" | "technical" | "execution" | "team" | "budget" | "review";

export type ProposalDraft = {
  title: string;
  executiveSummary: string;
  stage: string;
  prototypeWeeks: string;
  value: string;
  technologies: string;
  problemUnderstanding: string;
  technicalApproach: string;
  architecture: string;
  requiredData: string;
  successMetrics: string;
  ipStatus: string;
  milestones: string;
  durationWeeks: string;
  pilotLocation: string;
  dependencies: string;
  risks: string;
  mitigation: string;
  teamLead: string;
  teamComposition: string;
  relevantExperience: string;
  teamAvailability: string;
  requestedBudget: string;
  paymentModel: string;
  budgetRationale: string;
  startAvailability: string;
  ndaAccepted: boolean;
  conflictDeclared: boolean;
  ipAccepted: boolean;
  accuracyConfirmed: boolean;
};

export type DraftField = keyof ProposalDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const steps: Array<{ key: ProposalStep; label: string; hint: string }> = [
  { key: "summary", label: "خلاصه راه‌حل", hint: "معرفی و ارزش پیشنهادی" },
  { key: "technical", label: "راهکار فنی", hint: "روش و شاخص موفقیت" },
  { key: "execution", label: "برنامه اجرا", hint: "مراحل، زمان و ریسک" },
  { key: "team", label: "تیم و سوابق", hint: "توان اجرا و مدارک" },
  { key: "budget", label: "بودجه و تعهدات", hint: "هزینه و شرایط همکاری" },
  { key: "review", label: "مرور و ارسال", hint: "کنترل نهایی و رسید" },
];

export const initialDraft: ProposalDraft = {
  title: "",
  executiveSummary: "",
  stage: "",
  prototypeWeeks: "۸",
  value: "",
  technologies: "یادگیری ماشین، نگهداری پیش‌بینانه",
  problemUnderstanding: "",
  technicalApproach: "",
  architecture: "",
  requiredData: "",
  successMetrics: "",
  ipStatus: "",
  milestones: "",
  durationWeeks: "",
  pilotLocation: "",
  dependencies: "",
  risks: "",
  mitigation: "",
  teamLead: "",
  teamComposition: "",
  relevantExperience: "",
  teamAvailability: "",
  requestedBudget: "",
  paymentModel: "",
  budgetRationale: "",
  startAvailability: "",
  ndaAccepted: false,
  conflictDeclared: false,
  ipAccepted: false,
  accuracyConfirmed: false,
};

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function toRepositoryContent(draft: ProposalDraft, evidenceName = ""): ProposalContent {
  return {
    title: draft.title,
    problemStatement: `${draft.executiveSummary}\n${draft.problemUnderstanding}`.trim(),
    valueProposition: draft.value,
    maturityLevel: draft.stage,
    prototypeWeeks: normalizeDigits(draft.prototypeWeeks),
    technologies: draft.technologies
      .split(/[،,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    technicalApproach: draft.technicalApproach,
    architecture: draft.architecture,
    dataNeeds: draft.requiredData,
    successMetrics: draft.successMetrics,
    ipStatus: draft.ipStatus,
    durationWeeks: normalizeDigits(draft.durationWeeks),
    roadmap: draft.milestones,
    dependencies: `${draft.dependencies}\nمحل پایلوت: ${draft.pilotLocation}`.trim(),
    pilotLocation: draft.pilotLocation,
    risks: `${draft.risks}\nبرنامه کنترل: ${draft.mitigation}`.trim(),
    mitigation: draft.mitigation,
    leadName: draft.teamLead,
    teamSummary: draft.teamComposition,
    relevantExperience: draft.relevantExperience,
    requestedBudget: normalizeDigits(draft.requestedBudget),
    paymentModel: draft.paymentModel,
    budgetRationale: draft.budgetRationale,
    startAvailability: draft.startAvailability || draft.teamAvailability,
    teamAvailability: draft.teamAvailability,
    ndaAccepted: draft.ndaAccepted,
    conflictDeclared: draft.conflictDeclared,
    ipAccepted: draft.ipAccepted,
    accuracyConfirmed: draft.accuracyConfirmed,
    attachmentNames: evidenceName ? [evidenceName] : [],
  };
}

export function fromRepositoryContent(content: ProposalContent): ProposalDraft {
  const [executiveSummary = "", problemUnderstanding = ""] = content.problemStatement.split("\n");
  const [dependencies = "", pilotLocation = ""] = content.dependencies.split("\nمحل پایلوت: ");
  const [risks = "", mitigation = ""] = content.risks.split("\nبرنامه کنترل: ");
  return {
    ...initialDraft,
    title: content.title,
    executiveSummary,
    problemUnderstanding,
    stage: content.maturityLevel,
    prototypeWeeks: content.prototypeWeeks || initialDraft.prototypeWeeks,
    value: content.valueProposition,
    technologies: content.technologies.join("، "),
    technicalApproach: content.technicalApproach,
    architecture: content.architecture,
    requiredData: content.dataNeeds,
    successMetrics: content.successMetrics,
    ipStatus: content.ipStatus ?? "",
    milestones: content.roadmap,
    durationWeeks: content.durationWeeks,
    pilotLocation: content.pilotLocation || pilotLocation,
    dependencies,
    risks,
    mitigation: content.mitigation || mitigation,
    teamLead: content.leadName,
    teamComposition: content.teamSummary,
    relevantExperience: content.relevantExperience,
    requestedBudget: content.requestedBudget,
    paymentModel: content.paymentModel,
    budgetRationale: content.budgetRationale,
    startAvailability: content.startAvailability,
    teamAvailability: content.teamAvailability || content.startAvailability,
    ndaAccepted: content.ndaAccepted,
    conflictDeclared: content.conflictDeclared,
    ipAccepted: content.ipAccepted,
    accuracyConfirmed: content.accuracyConfirmed,
  };
}

export function validateStep(
  step: Exclude<ProposalStep, "review">,
  draft: ProposalDraft,
): DraftErrors {
  const errors: DraftErrors = {};
  if (step === "summary") {
    if (draft.title.trim().length < 5)
      errors.title = "عنوان راه‌حل باید حداقل ۵ کاراکتر و مشخص باشد.";
    if (draft.executiveSummary.trim().length < 80)
      errors.executiveSummary =
        "خلاصه اجرایی باید حداقل ۸۰ کاراکتر و شامل مسئله، راهکار و نتیجه باشد.";
    if (!draft.stage) errors.stage = "مرحله فعلی راه‌حل را انتخاب کنید.";
    if (
      !/^\d{1,2}$/.test(normalizeDigits(draft.prototypeWeeks)) ||
      Number(normalizeDigits(draft.prototypeWeeks)) < 1
    )
      errors.prototypeWeeks = "زمان نمونه اولیه را به‌صورت عددی بین ۱ تا ۹۹ هفته وارد کنید.";
    if (draft.value.trim().length < 40)
      errors.value = "ارزش و مزیت راه‌حل را در حداقل ۴۰ کاراکتر توضیح دهید.";
    if (draft.technologies.trim().length < 3)
      errors.technologies = "حداقل یک فناوری یا کلیدواژه وارد کنید.";
  }
  if (step === "technical") {
    if (draft.problemUnderstanding.trim().length < 60)
      errors.problemUnderstanding =
        "برداشت خود از مسئله و محدودیت‌های آن را در حداقل ۶۰ کاراکتر بنویسید.";
    if (draft.technicalApproach.trim().length < 100)
      errors.technicalApproach = "روش فنی باید حداقل ۱۰۰ کاراکتر و شامل منطق راهکار باشد.";
    if (draft.architecture.trim().length < 40)
      errors.architecture = "اجزای اصلی معماری و ارتباط آن‌ها را توضیح دهید.";
    if (draft.requiredData.trim().length < 20)
      errors.requiredData = "داده، دسترسی یا زیرساخت موردنیاز را مشخص کنید.";
    if (draft.successMetrics.trim().length < 30)
      errors.successMetrics = "حداقل یک شاخص کمی موفقیت و روش اندازه‌گیری آن را بنویسید.";
    if (!draft.ipStatus) errors.ipStatus = "وضعیت مالکیت فکری راه‌حل را انتخاب کنید.";
  }
  if (step === "execution") {
    if (draft.milestones.trim().length < 80)
      errors.milestones = "حداقل سه مرحله با خروجی قابل تحویل و معیار پذیرش تعریف کنید.";
    if (
      !/^\d{1,2}$/.test(normalizeDigits(draft.durationWeeks)) ||
      Number(normalizeDigits(draft.durationWeeks)) < 1
    )
      errors.durationWeeks = "مدت کل اجرا را به‌صورت عددی و بر حسب هفته وارد کنید.";
    if (draft.pilotLocation.trim().length < 3)
      errors.pilotLocation = "محل یا شرایط اجرای پایلوت را مشخص کنید.";
    if (draft.dependencies.trim().length < 20)
      errors.dependencies = "وابستگی‌های سازمان، داده، تجهیز یا مجوز را مشخص کنید.";
    if (draft.risks.trim().length < 30) errors.risks = "ریسک‌های اصلی فنی یا اجرایی را توضیح دهید.";
    if (draft.mitigation.trim().length < 30)
      errors.mitigation = "برای ریسک‌های اصلی، برنامه کنترل و جایگزین بنویسید.";
  }
  if (step === "team") {
    if (draft.teamLead.trim().length < 3) errors.teamLead = "نام مسئول اصلی پیشنهاد را وارد کنید.";
    if (draft.teamComposition.trim().length < 50)
      errors.teamComposition =
        "نقش‌ها، مسئولیت‌ها و ظرفیت اعضای کلیدی را در حداقل ۵۰ کاراکتر بنویسید.";
    if (draft.relevantExperience.trim().length < 50)
      errors.relevantExperience = "حداقل یک تجربه مرتبط، نتیجه و نقش خود را توضیح دهید.";
    if (!draft.teamAvailability) errors.teamAvailability = "ظرفیت زمانی فرد یا تیم را انتخاب کنید.";
  }
  if (step === "budget") {
    if (
      !/^\d+$/.test(normalizeDigits(draft.requestedBudget).replaceAll(",", "")) ||
      Number(normalizeDigits(draft.requestedBudget).replaceAll(",", "")) < 1
    )
      errors.requestedBudget = "بودجه پیشنهادی را فقط به‌صورت عدد و به تومان وارد کنید.";
    if (!draft.paymentModel) errors.paymentModel = "مدل پرداخت پیشنهادی را انتخاب کنید.";
    if (draft.budgetRationale.trim().length < 40)
      errors.budgetRationale = "مبنای برآورد هزینه را در حداقل ۴۰ کاراکتر توضیح دهید.";
    if (!draft.startAvailability)
      errors.startAvailability = "زمان آمادگی برای شروع را انتخاب کنید.";
    if (!draft.ndaAccepted) errors.ndaAccepted = "پذیرش محرمانگی برای ارسال پیشنهاد الزامی است.";
    if (!draft.conflictDeclared)
      errors.conflictDeclared = "وضعیت تعارض منافع را صریحاً تأیید کنید.";
    if (!draft.ipAccepted)
      errors.ipAccepted = "چارچوب مالکیت فکری و استفاده از سوابق قبلی را تأیید کنید.";
  }
  return errors;
}
