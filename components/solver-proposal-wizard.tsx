"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/internal/shared";
import { useSolverContext, type SolverSpace } from "@/components/solver-shell";
import { challenges } from "@/data/mock";
import { getChallengePublisher } from "@/data/challenge-publishers";
import type { MutationReceipt, ProposalContent } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules, evaluateEligibility } from "@/lib/solver/eligibility";
import {
  activeWorkspaces,
  proposalById,
  readProposalDraft,
  readSolverState,
  saveProposalDraft,
  submitProposal,
  teamPermission,
} from "@/lib/solver/repository";

type ProposalStep = "summary" | "technical" | "execution" | "team" | "budget" | "review";

type ProposalDraft = {
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

type DraftField = keyof ProposalDraft;
type DraftErrors = Partial<Record<DraftField, string>>;

const steps: Array<{ key: ProposalStep; label: string; hint: string }> = [
  { key: "summary", label: "خلاصه راه‌حل", hint: "معرفی و ارزش پیشنهادی" },
  { key: "technical", label: "راهکار فنی", hint: "روش و شاخص موفقیت" },
  { key: "execution", label: "برنامه اجرا", hint: "مراحل، زمان و ریسک" },
  { key: "team", label: "تیم و سوابق", hint: "توان اجرا و مدارک" },
  { key: "budget", label: "بودجه و تعهدات", hint: "هزینه و شرایط همکاری" },
  { key: "review", label: "مرور و ارسال", hint: "کنترل نهایی و رسید" },
];

const initialDraft: ProposalDraft = {
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

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function toRepositoryContent(draft: ProposalDraft, evidenceName = ""): ProposalContent {
  return {
    title: draft.title,
    problemStatement: `${draft.executiveSummary}\n${draft.problemUnderstanding}`.trim(),
    valueProposition: draft.value,
    maturityLevel: draft.stage,
    prototypeWeeks: normalizeDigits(draft.prototypeWeeks),
    technologies: draft.technologies.split(/[،,]/).map((item) => item.trim()).filter(Boolean),
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

function fromRepositoryContent(content: ProposalContent): ProposalDraft {
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

function validateStep(step: Exclude<ProposalStep, "review">, draft: ProposalDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (step === "summary") {
    if (draft.title.trim().length < 5)
      errors.title = "عنوان راه‌حل باید حداقل ۵ کاراکتر و مشخص باشد.";
    if (draft.executiveSummary.trim().length < 80)
      errors.executiveSummary =
        "خلاصه اجرایی باید حداقل ۸۰ کاراکتر و شامل مسئله، راهکار و نتیجه باشد.";
    if (!draft.stage) errors.stage = "مرحله فعلی راه‌حل را انتخاب کنید.";
    if (!/^\d{1,2}$/.test(normalizeDigits(draft.prototypeWeeks)) || Number(normalizeDigits(draft.prototypeWeeks)) < 1)
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
    if (!/^\d{1,2}$/.test(normalizeDigits(draft.durationWeeks)) || Number(normalizeDigits(draft.durationWeeks)) < 1)
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

function Field({
  label,
  required,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`rh-wizard-field ${wide ? "is-wide" : ""}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {error ? (
        <small className="rh-wizard-error" role="alert">
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length.toLocaleString("fa-IR") : "۰";
}

function StepFields({
  step,
  draft,
  errors,
  update,
  space,
  evidenceName,
  onEvidence,
  workspaceName,
  profileHref,
}: {
  step: ProposalStep;
  draft: ProposalDraft;
  errors: DraftErrors;
  update: <K extends DraftField>(field: K, value: ProposalDraft[K]) => void;
  space: SolverSpace;
  evidenceName: string;
  onEvidence: (event: ChangeEvent<HTMLInputElement>) => void;
  workspaceName: string;
  profileHref: string;
}) {
  if (step === "summary")
    return (
      <>
        <Field label="عنوان پیشنهادی راه‌حل" required error={errors.title} wide>
          <input
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="یک عنوان کوتاه، مشخص و نتیجه‌محور"
          />
        </Field>
        <Field
          label="خلاصه اجرایی"
          required
          error={errors.executiveSummary}
          hint={`${wordCount(draft.executiveSummary)} واژه`}
          wide
        >
          <textarea
            rows={5}
            value={draft.executiveSummary}
            onChange={(event) => update("executiveSummary", event.target.value)}
            placeholder="مسئله، راهکار پیشنهادی، روش اجرا و نتیجه مورد انتظار را در ۸۰ تا ۳۰۰ کلمه توضیح دهید."
          />
        </Field>
        <Field label="مرحله فعلی راه‌حل" required error={errors.stage}>
          <select value={draft.stage} onChange={(event) => update("stage", event.target.value)}>
            <option value="">انتخاب کنید</option>
            <option value="concept">ایده اعتبارسنجی‌شده</option>
            <option value="prototype">نمونه اولیه آزمایشگاهی</option>
            <option value="pilot">پایلوت اجراشده</option>
            <option value="market">محصول آماده استقرار</option>
          </select>
        </Field>
        <Field
          label="زمان لازم تا نمونه اولیه"
          required
          error={errors.prototypeWeeks}
          hint="بر حسب هفته"
        >
          <input
            dir="ltr"
            inputMode="numeric"
            value={draft.prototypeWeeks}
            onChange={(event) => update("prototypeWeeks", event.target.value)}
            placeholder="مثلاً ۸"
          />
        </Field>
        <Field label="ارزش پیشنهادی و مزیت راه‌حل" required error={errors.value} wide>
          <textarea
            rows={3}
            value={draft.value}
            onChange={(event) => update("value", event.target.value)}
            placeholder="چرا این راه‌حل مؤثر است و نسبت به روش‌های موجود چه مزیت قابل سنجشی دارد؟"
          />
        </Field>
        <Field
          label="فناوری‌ها و کلیدواژه‌ها"
          required
          error={errors.technologies}
          hint="موارد را با ویرگول جدا کنید."
          wide
        >
          <input
            value={draft.technologies}
            onChange={(event) => update("technologies", event.target.value)}
          />
        </Field>
      </>
    );
  if (step === "technical")
    return (
      <>
        <Field label="برداشت شما از مسئله" required error={errors.problemUnderstanding} wide>
          <textarea
            rows={4}
            value={draft.problemUnderstanding}
            onChange={(event) => update("problemUnderstanding", event.target.value)}
            placeholder="ریشه مسئله، محدودیت‌ها و فرض‌های کلیدی را توضیح دهید."
          />
        </Field>
        <Field label="روش و منطق فنی راه‌حل" required error={errors.technicalApproach} wide>
          <textarea
            rows={6}
            value={draft.technicalApproach}
            onChange={(event) => update("technicalApproach", event.target.value)}
            placeholder="فرایند، الگوریتم، تجهیزات یا روش آزمون را مرحله‌به‌مرحله شرح دهید."
          />
        </Field>
        <Field
          label="معماری و اجزای اصلی"
          required
          error={errors.architecture}
          hint="اجزای نرم‌افزاری و سخت‌افزاری، نقش هر جزء و ارتباط میان آن‌ها را مشخص کنید."
        >
          <textarea
            rows={4}
            value={draft.architecture}
            onChange={(event) => update("architecture", event.target.value)}
            placeholder="برای نمونه: حسگرها ← درگاه جمع‌آوری ← موتور تحلیل ← داشبورد هشدار؛ نقش و ارتباط هر جزء را توضیح دهید."
          />
        </Field>
        <Field
          label="داده و زیرساخت موردنیاز"
          required
          error={errors.requiredData}
          hint="نوع داده، روش دسترسی، زیرساخت پردازش و محدودیت‌های امنیتی را بنویسید."
        >
          <textarea
            rows={4}
            value={draft.requiredData}
            onChange={(event) => update("requiredData", event.target.value)}
            placeholder="برای نمونه: تاریخچه خرابی و داده حسگرها، دسترسی API، سرور یا فضای ابری و الزامات نگهداری امن داده."
          />
        </Field>
        <Field label="شاخص‌های کمی موفقیت" required error={errors.successMetrics} wide>
          <textarea
            rows={3}
            value={draft.successMetrics}
            onChange={(event) => update("successMetrics", event.target.value)}
            placeholder="برای نمونه: کاهش ۲۰٪ توقف خط در سه ماه، با اندازه‌گیری از داده نگهداری."
          />
        </Field>
        <Field label="وضعیت مالکیت فکری" required error={errors.ipStatus} wide>
          <select
            value={draft.ipStatus}
            onChange={(event) => update("ipStatus", event.target.value)}
          >
            <option value="">انتخاب کنید</option>
            <option value="owned">کاملاً متعلق به فرد یا تیم ماست</option>
            <option value="licensed">دارای مجوز استفاده معتبر است</option>
            <option value="mixed">ترکیبی از دارایی قبلی و توسعه جدید است</option>
            <option value="open">مبتنی بر اجزای متن‌باز با مجوز سازگار است</option>
          </select>
        </Field>
      </>
    );
  if (step === "execution")
    return (
      <>
        <Field
          label="مراحل اجرا، خروجی و معیار پذیرش"
          required
          error={errors.milestones}
          hint="حداقل سه مرحله را با شماره، مدت، خروجی و معیار پذیرش بنویسید."
          wide
        >
          <textarea
            rows={7}
            value={draft.milestones}
            onChange={(event) => update("milestones", event.target.value)}
            placeholder={
              "۱. شناخت و خط مبنا — ۲ هفته — گزارش داده — تأیید سازمان\n۲. ساخت نمونه — ۴ هفته — نمونه قابل آزمون — عبور از KPI\n۳. پایلوت — ۶ هفته — گزارش نهایی — پذیرش کمی"
            }
          />
        </Field>
        <Field label="مدت کل اجرا" required error={errors.durationWeeks} hint="بر حسب هفته">
          <input
            dir="ltr"
            inputMode="numeric"
            value={draft.durationWeeks}
            onChange={(event) => update("durationWeeks", event.target.value)}
            placeholder="مثلاً ۱۲"
          />
        </Field>
        <Field label="محل یا شرایط پایلوت" required error={errors.pilotLocation}>
          <input
            value={draft.pilotLocation}
            onChange={(event) => update("pilotLocation", event.target.value)}
            placeholder="سایت سازمان، آزمایشگاه یا محیط شبیه‌سازی"
          />
        </Field>
        <Field label="وابستگی‌ها و نیازمندی‌های سازمان" required error={errors.dependencies} wide>
          <textarea
            rows={3}
            value={draft.dependencies}
            onChange={(event) => update("dependencies", event.target.value)}
            placeholder="داده، تجهیز، دسترسی، مجوز، مسئول سازمانی یا توقف خط موردنیاز"
          />
        </Field>
        <Field label="ریسک‌های اصلی" required error={errors.risks}>
          <textarea
            rows={4}
            value={draft.risks}
            onChange={(event) => update("risks", event.target.value)}
          />
        </Field>
        <Field label="برنامه کنترل و مسیر جایگزین" required error={errors.mitigation}>
          <textarea
            rows={4}
            value={draft.mitigation}
            onChange={(event) => update("mitigation", event.target.value)}
          />
        </Field>
      </>
    );
  if (step === "team")
    return (
      <>
        <div className="rh-wizard-space-note is-wide">
          <Icon name={space === "team" ? "people" : "brief"} />
          <div>
            <strong>ارسال از طرف {workspaceName}</strong>
            <span>
              {space === "team"
                ? "نقش و اختیار اعضا پیش از ارسال نهایی کنترل می‌شود."
                : "توان فردی شما ارزیابی می‌شود؛ همکاران فقط در صورت مشارکت واقعی معرفی شوند."}
            </span>
          </div>
          <Link href={profileHref}>مشاهده پروفایل</Link>
        </div>
        <Field label="مسئول اصلی پیشنهاد" required error={errors.teamLead}>
          <input
            value={draft.teamLead}
            onChange={(event) => update("teamLead", event.target.value)}
            placeholder={space === "team" ? "نام مدیر یا مسئول فنی تیم" : "نام و نام خانوادگی شما"}
          />
        </Field>
        <Field label="ظرفیت زمانی برای این پروژه" required error={errors.teamAvailability}>
          <select
            value={draft.teamAvailability}
            onChange={(event) => update("teamAvailability", event.target.value)}
          >
            <option value="">انتخاب کنید</option>
            <option value="part">تا ۲۰ ساعت در هفته</option>
            <option value="half">۲۰ تا ۴۰ ساعت در هفته</option>
            <option value="full">تیم تمام‌وقت پروژه</option>
          </select>
        </Field>
        <Field
          label={space === "team" ? "ترکیب تیم، نقش‌ها و مسئولیت‌ها" : "نقش شما و همکاران احتمالی"}
          required
          error={errors.teamComposition}
          wide
        >
          <textarea
            rows={5}
            value={draft.teamComposition}
            onChange={(event) => update("teamComposition", event.target.value)}
            placeholder="نام یا نقش، تخصص، مسئولیت در پروژه و میزان درگیری هر عضو را بنویسید."
          />
        </Field>
        <Field
          label="سابقه مرتبط و نتیجه قابل استناد"
          required
          error={errors.relevantExperience}
          wide
        >
          <textarea
            rows={5}
            value={draft.relevantExperience}
            onChange={(event) => update("relevantExperience", event.target.value)}
            placeholder="پروژه مرتبط، کارفرما یا صنعت، نقش شما، خروجی و نتیجه قابل اندازه‌گیری را توضیح دهید."
          />
        </Field>
        <label className="rh-wizard-upload is-wide">
          <input type="file" accept=".pdf,.doc,.docx" onChange={onEvidence} />
          <Icon name="download" />
          <span>
            <strong>
              {evidenceName ||
                (space === "team"
                  ? "بارگذاری رزومه تیم و سوابق اعضای کلیدی"
                  : "بارگذاری رزومه و سوابق مرتبط")}
            </strong>
            <small>PDF یا DOCX، حداکثر ۱۰ مگابایت؛ اطلاعات محرمانه بارگذاری نکنید.</small>
          </span>
        </label>
      </>
    );
  if (step === "budget")
    return (
      <>
        <Field
          label="بودجه کل پیشنهادی"
          required
          error={errors.requestedBudget}
          hint="مبلغ به تومان؛ مالیات و هزینه‌های جانبی را در توضیح مشخص کنید."
        >
          <input
            dir="ltr"
            inputMode="numeric"
            value={draft.requestedBudget}
            onChange={(event) =>
              update("requestedBudget", event.target.value.replace(/[^0-9,]/g, ""))
            }
            placeholder="مثلاً 780,000,000"
          />
        </Field>
        <Field label="مدل پرداخت" required error={errors.paymentModel}>
          <select
            value={draft.paymentModel}
            onChange={(event) => update("paymentModel", event.target.value)}
          >
            <option value="">انتخاب کنید</option>
            <option value="milestone">مرحله‌ای پس از پذیرش خروجی</option>
            <option value="mixed">پیش‌پرداخت و پرداخت مرحله‌ای</option>
            <option value="pilot">بودجه مستقل پایلوت</option>
          </select>
        </Field>
        <Field label="مبنای برآورد و تفکیک هزینه" required error={errors.budgetRationale} wide>
          <textarea
            rows={4}
            value={draft.budgetRationale}
            onChange={(event) => update("budgetRationale", event.target.value)}
            placeholder="نیروی انسانی، تجهیز، مواد، نرم‌افزار، آزمون و هزینه‌های سفر را شفاف کنید."
          />
        </Field>
        <Field label="آمادگی برای شروع" required error={errors.startAvailability} wide>
          <select
            value={draft.startAvailability}
            onChange={(event) => update("startAvailability", event.target.value)}
          >
            <option value="">انتخاب کنید</option>
            <option value="immediate">بلافاصله پس از قرارداد</option>
            <option value="2weeks">حداکثر دو هفته پس از قرارداد</option>
            <option value="month">حداکثر یک ماه پس از قرارداد</option>
          </select>
        </Field>
        <label className="rh-wizard-consent is-wide">
          <input
            type="checkbox"
            checked={draft.ndaAccepted}
            onChange={(event) => update("ndaAccepted", event.target.checked)}
          />
          <span>تعهد محرمانگی و استفاده محدود از داده‌های سازمان را می‌پذیرم.</span>
          {errors.ndaAccepted && <small role="alert">{errors.ndaAccepted}</small>}
        </label>
        <label className="rh-wizard-consent is-wide">
          <input
            type="checkbox"
            checked={draft.conflictDeclared}
            onChange={(event) => update("conflictDeclared", event.target.checked)}
          />
          <span>تأیید می‌کنم تعارض منافع اعلام‌نشده‌ای با این پروژه یا سازمان ندارم.</span>
          {errors.conflictDeclared && <small role="alert">{errors.conflictDeclared}</small>}
        </label>
        <label className="rh-wizard-consent is-wide">
          <input
            type="checkbox"
            checked={draft.ipAccepted}
            onChange={(event) => update("ipAccepted", event.target.checked)}
          />
          <span>دارایی فکری قبلی را شفاف اعلام می‌کنم و چارچوب مالکیت خروجی جدید را می‌پذیرم.</span>
          {errors.ipAccepted && <small role="alert">{errors.ipAccepted}</small>}
        </label>
      </>
    );
  return null;
}

export function SolverProposalWizard({
  path,
  space,
  onSubmit,
}: {
  path: string;
  space: SolverSpace;
  onSubmit: () => void;
}) {
  const hookContext = useSolverContext();
  const initialState = readSolverState();
  const context =
    hookContext.type === space
      ? hookContext
      : space === "team"
        ? activeWorkspaces(initialState).find((workspace) => workspace.type === "team") ?? hookContext
        : ({ type: "individual", workspaceId: initialState.personalWorkspace.id } as const);
  const routeStep = path.split("/").filter(Boolean).at(-1) as ProposalStep | undefined;
  const activeStep = steps.some((item) => item.key === routeStep) ? routeStep! : "summary";
  const activeIndex = steps.findIndex((item) => item.key === activeStep);
  const [draft, setDraft] = useState<ProposalDraft>(initialDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveState, setSaveState] = useState("ذخیره خودکار فعال است");
  const [notice, setNotice] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<MutationReceipt | null>(null);
  const routeProposalId = path.match(/^\/app\/solver\/proposals\/(PR-[^/]+)\//)?.[1];
  const routeProposal = routeProposalId
    ? proposalById(routeProposalId, context.workspaceId, initialState)
    : undefined;
  const [challengeId, setChallengeId] = useState("CH-1405-022");
  const selectedChallenge = challenges.find((challenge) => challenge.id === challengeId);
  const selectedPublisher = selectedChallenge
    ? getChallengePublisher(selectedChallenge.id)
    : undefined;

  useEffect(() => {
    const query =
      document.documentElement.dataset.challengeStandalone === "true"
        ? (window.location.hash.split("?")[1] ?? "")
        : window.location.search.slice(1);
    const requested = new URLSearchParams(query).get("challenge");
    if (routeProposal) {
      setChallengeId(routeProposal.challengeId);
      return;
    }
    if (!requested) return;
    const resolved = challenges.find(
      (challenge) => challenge.slug === requested || challenge.id === requested,
    );
    setChallengeId(resolved?.id ?? "__NOT_FOUND__");
  }, [routeProposal]);

  useEffect(() => {
    if (!selectedChallenge) return;
    setDraft(initialDraft);
    const saved = readProposalDraft(selectedChallenge.id, context.workspaceId);
    if (saved) {
      setDraft(fromRepositoryContent(saved.content));
      setEvidenceName(saved.content.attachmentNames[0] ?? "");
      setUploadState(saved.content.attachmentNames.length ? "success" : "idle");
    }
  }, [context.workspaceId, selectedChallenge]);

  const update = <K extends DraftField>(field: K, value: ProposalDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (selectedChallenge)
        saveProposalDraft(
          selectedChallenge.id,
          context.workspaceId,
          toRepositoryContent(next, evidenceName),
        );
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveState("در حال ذخیره…");
    window.setTimeout(() => setSaveState("ذخیره شد · همین حالا"), 260);
  };

  const completedSteps = useMemo(
    () =>
      steps
        .slice(0, 5)
        .map(
          (item) =>
            Object.keys(validateStep(item.key as Exclude<ProposalStep, "review">, draft)).length ===
            0,
        ),
    [draft],
  );
  const completeness = Math.round(
    (completedSteps.filter(Boolean).length / 6) * 100 + (draft.accuracyConfirmed ? 100 / 6 : 0),
  );

  const navigate = (nextPath: string) => {
    if (!selectedChallenge) return;
    const href = buildSolverHref(nextPath, context, { challenge: selectedChallenge.id });
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = href;
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    window.location.assign(href);
  };

  const saveDraft = () => {
    if (!selectedChallenge) return;
    const result = saveProposalDraft(
      selectedChallenge.id,
      context.workspaceId,
      toRepositoryContent(draft, evidenceName),
    );
    setSaveState(result.ok ? "ذخیره شد · همین حالا" : "خطا در ذخیره");
    setNotice(
      result.ok
        ? "پیش‌نویس ذخیره شد و از فهرست پیشنهادهای همین فضای کاری قابل ادامه است."
        : result.message,
    );
  };

  const continueFlow = () => {
    if (activeStep === "review") return;
    const nextErrors = validateStep(activeStep, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setNotice("برای ادامه، خطاهای مشخص‌شده در همین مرحله را اصلاح کنید.");
      document
        .querySelector<HTMLElement>(".rh-wizard-error")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    saveDraft();
    navigate(`/app/solver/proposals/new/${steps[activeIndex + 1].key}`);
  };

  const submit = () => {
    if (!selectedChallenge) return;
    const allErrors = steps.slice(0, 5).map((item) => ({
      key: item.key,
      errors: validateStep(item.key as Exclude<ProposalStep, "review">, draft),
    }));
    const firstInvalid = allErrors.find((item) => Object.keys(item.errors).length);
    if (firstInvalid) {
      setNotice(
        `پیشنهاد هنوز آماده ارسال نیست؛ ابتدا مرحله «${steps.find((item) => item.key === firstInvalid.key)?.label}» را کامل کنید.`,
      );
      return;
    }
    if (!draft.accuracyConfirmed) {
      setErrors({ accuracyConfirmed: "پیش از ارسال، صحت اطلاعات و اختیار ارسال را تأیید کنید." });
      setNotice("تأیید نهایی صحت اطلاعات برای ارسال الزامی است.");
      return;
    }
    const latestState = readSolverState();
    const latestEligibility = evaluateEligibility(
      challengeEligibilityRules[selectedChallenge.id],
      latestState,
      context,
    );
    if (latestEligibility.status !== "eligible") {
      setNotice(`ارسال متوقف شد: ${latestEligibility.reasons.join(" ")}`);
      return;
    }
    const latestPermission = teamPermission(context, "submit-proposal", {}, latestState);
    if (!latestPermission.allowed) {
      setNotice(latestPermission.reason);
      return;
    }
    setErrors({});
    setConfirmationOpen(true);
  };

  const onEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadState("error");
      setUploadProgress(0);
      setNotice("حجم فایل رزومه یا سابقه باید حداکثر ۱۰ مگابایت باشد.");
      event.target.value = "";
      return;
    }
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      setUploadState("error");
      setUploadProgress(0);
      setNotice("فرمت فایل رزومه یا سابقه باید PDF، DOC یا DOCX باشد.");
      event.target.value = "";
      return;
    }
    setUploadState("uploading");
    setUploadProgress(25);
    setNotice("فایل در حال بررسی و بارگذاری نمونه است…");
    window.setTimeout(() => {
      setEvidenceName(file.name);
      setUploadState("success");
      setUploadProgress(100);
      if (selectedChallenge)
        saveProposalDraft(
          selectedChallenge.id,
          context.workspaceId,
          toRepositoryContent(draft, file.name),
        );
      setNotice("فایل سابقه با موفقیت به پیش‌نویس پیوست شد.");
    }, 300);
  };

  if (!selectedChallenge || !selectedPublisher)
    return (
      <section className="rh-empty">
        <h1>فرصت یا پیشنهاد پیدا نشد</h1>
        <p>شناسه درخواست‌شده در این فضای کاری وجود ندارد.</p>
        <Link href={buildSolverHref("/app/solver/proposals", context)}>بازگشت به پیشنهادها</Link>
      </section>
    );
  const currentState = readSolverState();
  const activeTeam =
    context.type === "team"
      ? currentState.teams.find((team) => team.id === context.teamId)
      : undefined;
  const activeMembership =
    context.type === "team"
      ? currentState.memberships.find((membership) => membership.id === context.membershipId)
      : undefined;
  const workspaceName = activeTeam?.name ?? currentState.personalWorkspace.name;
  const eligibility = evaluateEligibility(
    challengeEligibilityRules[selectedChallenge.id],
    currentState,
    context,
  );
  const submitPermission = teamPermission(context, "submit-proposal", {}, currentState);

  return (
    <div className="rh-solution-wizard">
      <header className="rh-wizard-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href={buildSolverHref("/app/solver/opportunities", context)}>چالش‌ها و فرصت‌ها</Link>
            <Icon name="chevron" />
            <span>{selectedChallenge.title}</span>
          </nav>
          <h1>تدوین راه‌حل</h1>
          <p>
            <Icon name="check" /> {saveState}
          </p>
        </div>
        <section className="rh-wizard-challenge">
          <div className="rh-wizard-challenge__logo">
            <ChallengeOrganizationLogo challengeId={selectedChallenge.id} size="medium" />
          </div>
          <div className="rh-wizard-challenge__meta">
            <small>{selectedChallenge.title}</small>
            <strong>{selectedPublisher.name}</strong>
            <span>
              <bdi dir="ltr">{selectedChallenge.id}</bdi> · مهلت ارسال:{" "}
              {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
                new Date(selectedChallenge.deadline),
              )}
            </span>
          </div>
          <Link href={buildSolverHref(`/app/solver/opportunities/${selectedChallenge.slug}`, context)}>
            مشاهده جزئیات چالش
          </Link>
        </section>
      </header>

      <ol className="rh-wizard-stepper" aria-label={`مرحله ${activeIndex + 1} از ۶`}>
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={
              index === activeIndex
                ? "is-active"
                : completedSteps[index]
                  ? "is-complete"
                  : index < activeIndex
                    ? "is-past"
                    : ""
            }
          >
            <button type="button" onClick={() => navigate(`/app/solver/proposals/new/${step.key}`)}>
              <b>
                {completedSteps[index] ? (
                  <Icon name="check" />
                ) : (
                  (index + 1).toLocaleString("fa-IR")
                )}
              </b>
              <span>
                {step.label}
                <small>{step.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rh-wizard-layout">
        <aside className="rh-wizard-sidebar">
          <section className="rh-card">
            <h2>وضعیت پیش‌نویس</h2>
            <div
              className="rh-wizard-progress"
              style={{ "--progress": `${completeness}%` } as React.CSSProperties}
            >
              <strong>{completeness.toLocaleString("fa-IR")}٪</strong>
              <small>تکمیل</small>
            </div>
            <ul>
              {steps.slice(0, 5).map((step, index) => (
                <li key={step.key} className={completedSteps[index] ? "is-complete" : ""}>
                  <Icon name={completedSteps[index] ? "check" : "history"} />
                  {step.label}
                </li>
              ))}
            </ul>
            <span>
              <Icon name="history" /> آخرین ذخیره: همین حالا
            </span>
          </section>
          <section className="rh-card">
            <h2>ارسال از طرف</h2>
            <div className="rh-wizard-sender">
              <span>
                <Icon name={space === "team" ? "people" : "brief"} />
              </span>
              <div>
                <strong>{workspaceName}</strong>
                <small>
                  {activeMembership
                    ? `نقش: ${activeMembership.role}`
                    : currentState.currentUser.headline}
                </small>
              </div>
            </div>
            <Link href={buildSolverHref("/app/solver/profile", context)}>بررسی پروفایل و آمادگی</Link>
            <p className={eligibility.status === "eligible" ? "rh-eligible" : "rh-eligibility-error"}>
              <Icon name={eligibility.status === "eligible" ? "check" : "notification"} />
              {eligibility.reasons[0]}
            </p>
            {!submitPermission.allowed && (
              <p className="rh-eligibility-error" role="note">{submitPermission.reason}</p>
            )}
          </section>
          <section className="rh-card rh-wizard-guide">
            <h2>راهنمای این مرحله</h2>
            <p>{steps[activeIndex].hint} برای ارزیابی اولیه سازمان استفاده می‌شود.</p>
            <span>
              <Icon name="lock" /> اطلاعات تا پیش از ارسال نهایی محرمانه است.
            </span>
          </section>
        </aside>

        <main className="rh-card rh-wizard-editor">
          <header>
            <div>
              <span>{(activeIndex + 1).toLocaleString("fa-IR")}</span>
              <div>
                <h2>{steps[activeIndex].label}</h2>
                <p>{steps[activeIndex].hint} را روشن، قابل سنجش و بدون اطلاعات محرمانه ثبت کنید.</p>
              </div>
            </div>
            <small>فیلدهای ستاره‌دار الزامی‌اند.</small>
          </header>
          {activeStep !== "review" ? (
            <div className="rh-wizard-fields">
              <StepFields
                step={activeStep}
                draft={draft}
                errors={errors}
                update={update}
                space={space}
                evidenceName={evidenceName}
                onEvidence={onEvidence}
                workspaceName={workspaceName}
                profileHref={buildSolverHref("/app/solver/profile", context)}
              />
              {activeStep === "team" && uploadState !== "idle" && (
                <div className={`rh-wizard-notice is-${uploadState}`} role="status">
                  <Icon name={uploadState === "success" ? "check" : "notification"} />
                  <span>
                    {uploadState === "uploading"
                      ? "بارگذاری نمونه در حال انجام است"
                      : uploadState === "success"
                        ? `فایل ${evidenceName} آماده است.`
                        : "بارگذاری فایل ناموفق بود؛ فایل معتبر دیگری انتخاب کنید."}
                  </span>
                  {uploadState === "uploading" && <progress aria-label="پیشرفت بارگذاری پیوست پیشنهاد" max={100} value={uploadProgress}>{uploadProgress}%</progress>}
                  {uploadState === "error" && <button type="button" onClick={() => { setUploadState("idle"); setUploadProgress(0); }}>تلاش دوباره</button>}
                  {uploadState === "success" && (
                    <button type="button" onClick={() => { setEvidenceName(""); setUploadState("idle"); setUploadProgress(0); if (selectedChallenge) saveProposalDraft(selectedChallenge.id, context.workspaceId, toRepositoryContent(draft, "")); }}>
                      حذف فایل
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rh-wizard-review">
              <section>
                <h3>آمادگی بخش‌ها</h3>
                {steps.slice(0, 5).map((step, index) => (
                  <article
                    key={step.key}
                    className={completedSteps[index] ? "is-ready" : "is-blocked"}
                  >
                    <span>
                      <Icon name={completedSteps[index] ? "check" : "notification"} />
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>
                        {completedSteps[index]
                          ? "کامل و آماده ارسال"
                          : "دارای فیلد ناقص یا نامعتبر"}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/solver/proposals/new/${step.key}`)}
                    >
                      بازبینی
                    </button>
                  </article>
                ))}
              </section>
              <section>
                <h3>خلاصه ارسال</h3>
                <dl>
                  <div>
                    <dt>عنوان راه‌حل</dt>
                    <dd>{draft.title || "تکمیل نشده"}</dd>
                  </div>
                  <div>
                    <dt>مجری</dt>
                    <dd>{workspaceName}</dd>
                  </div>
                  <div>
                    <dt>زمان اجرا</dt>
                    <dd>{draft.durationWeeks ? `${draft.durationWeeks} هفته` : "تکمیل نشده"}</dd>
                  </div>
                  <div>
                    <dt>بودجه پیشنهادی</dt>
                    <dd>
                      {draft.requestedBudget ? `${draft.requestedBudget} تومان` : "تکمیل نشده"}
                    </dd>
                  </div>
                </dl>
                <label className="rh-wizard-consent">
                  <input
                    type="checkbox"
                    checked={draft.accuracyConfirmed}
                    onChange={(event) => update("accuracyConfirmed", event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات، رضایت اعضای معرفی‌شده و اختیار ارسال از طرف این فضا را تأیید
                    می‌کنم.
                  </span>
                  {errors.accuracyConfirmed && (
                    <small role="alert">{errors.accuracyConfirmed}</small>
                  )}
                </label>
                <div className="rh-wizard-submit-note">
                  <Icon name="lock" />
                  <p>
                    <strong>پس از ارسال چه می‌شود؟</strong>
                    <span>
                      نسخه فعلی قفل و رسید ارسال صادر می‌شود. سازمان می‌تواند درخواست شفاف‌سازی
                      بدهد؛ اصل نسخه حذف یا بازنویسی نخواهد شد.
                    </span>
                  </p>
                </div>
              </section>
            </div>
          )}
          {notice && (
            <div className="rh-wizard-notice" role="status">
              <Icon
                name={
                  notice.includes("الزامی") ||
                  notice.includes("اصلاح") ||
                  notice.includes("حداکثر") ||
                  notice.includes("فرمت")
                    ? "notification"
                    : "check"
                }
              />
              <span>{notice}</span>
              <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}>
                <Icon name="close" />
              </button>
            </div>
          )}
        </main>
      </div>

      <footer className="rh-wizard-actions">
        <Link href={buildSolverHref(`/app/solver/opportunities/${selectedChallenge.slug}`, context)}>
          بازگشت به چالش
        </Link>
        <button type="button" onClick={saveDraft}>
          <Icon name="download" /> ذخیره پیش‌نویس
        </button>
        <div>
          {activeIndex > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/app/solver/proposals/new/${steps[activeIndex - 1].key}`)}
            >
              مرحله قبل
            </button>
          )}
          <button
            className="is-primary"
            type="button"
            onClick={activeStep === "review" ? submit : continueFlow}
            disabled={
              activeStep === "review" &&
              (eligibility.status !== "eligible" || !submitPermission.allowed)
            }
            title={
              activeStep === "review" && eligibility.status !== "eligible"
                ? eligibility.reasons.join(" ")
                : activeStep === "review" && !submitPermission.allowed
                  ? submitPermission.reason
                  : undefined
            }
          >
            {activeStep === "review"
              ? "ارسال نهایی راه‌حل"
              : `ذخیره و ادامه: ${steps[activeIndex + 1].label}`}
            <Icon
              className={activeStep === "review" ? undefined : "rh-wizard-next-icon"}
              name={activeStep === "review" ? "check" : "arrow"}
            />
          </button>
        </div>
      </footer>
      {submissionReceipt && (
        <section className="rh-card rh-wizard-receipt" role="status" aria-label="رسید ارسال پیشنهاد">
          <Icon name="check" />
          <div>
            <h2>پیشنهاد با موفقیت ثبت شد</h2>
            <p>
              شناسه پیشنهاد <bdi dir="ltr">{submissionReceipt.entityId}</bdi> در فضای «{workspaceName}»
              برای چالش <bdi dir="ltr">{selectedChallenge.id}</bdi> قفل شد.
            </p>
            <dl>
              <div><dt>شماره رسید</dt><dd><bdi dir="ltr">{submissionReceipt.receiptId}</bdi></dd></div>
              <div><dt>زمان ثبت</dt><dd>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(submissionReceipt.timestamp))}</dd></div>
            </dl>
            <Link href={buildSolverHref(`/app/solver/proposals/${submissionReceipt.entityId}/preview`, context)}>
              مشاهده پیشنهاد ثبت‌شده
            </Link>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={confirmationOpen}
        title="ارسال نهایی پیشنهاد؟"
        description={`نسخه فعلی برای ${workspaceName} قفل می‌شود و پس از ثبت فقط از مسیر اصلاح یا نسخه جدید قابل تغییر است.`}
        confirmLabel="تأیید و ارسال"
        variant="submission"
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={() => {
          saveProposalDraft(
            selectedChallenge.id,
            context.workspaceId,
            toRepositoryContent(draft, evidenceName),
          );
          const result = submitProposal(
            context,
            selectedChallenge.id,
            `submit:${context.workspaceId}:${selectedChallenge.id}`,
          );
          setConfirmationOpen(false);
          if (!result.ok) {
            setNotice(result.message);
            return;
          }
          setSubmissionReceipt(result);
          setNotice("نسخه پیشنهاد قفل شد و فهرست، داشبورد و اعلان‌ها به‌روزرسانی شدند.");
          onSubmit();
        }}
      />
    </div>
  );
}
