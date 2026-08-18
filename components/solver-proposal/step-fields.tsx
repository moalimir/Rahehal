"use client";

import Link from "next/link";
import type { ChangeEvent, ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { SolverSpace } from "@/components/solver-shell";
import type {
  DraftErrors,
  DraftField,
  ProposalDraft,
  ProposalStep,
} from "@/components/solver-proposal/model";

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

export function StepFields({
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
