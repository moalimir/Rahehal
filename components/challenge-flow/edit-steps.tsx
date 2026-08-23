"use client";

import { useState } from "react";
import {
  CheckboxGroup,
  RadioGroup,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from "@/components/challenge-flow/fields";
import {
  budgetStatusLabels,
  categoryOptions,
  ipTermLabels,
  outputTypeLabels,
  solverTypeLabels,
  sourcingModelLabels,
  visibilityLabels,
  workModeLabels,
  type BudgetStatus,
  type ChallengeRecord,
  type IpTerms,
  type OutputType,
  type SolverType,
  type SourcingModel,
  type Visibility,
  type WorkMode,
} from "@/domain/challenge";
import type { ApplicantScope } from "@/domain/taxonomy";
import { createAttachment } from "@/lib/challenges/storage";
import { issueFor, type ValidationIssue } from "@/lib/challenges/validation";
import { CHALLENGE_UPLOAD_ACCEPT, challengeUploadError } from "@/lib/validation/upload";

type StepProps = {
  record: ChallengeRecord;
  issues: ValidationIssue[];
  update: (updater: (record: ChallengeRecord) => ChallengeRecord) => void;
};

function setField<K extends keyof ChallengeRecord>(
  update: StepProps["update"],
  field: K,
  value: ChallengeRecord[K],
) {
  update((record) => ({ ...record, [field]: value }));
}

export function DefinitionStep({ record, issues, update }: StepProps) {
  const [fileError, setFileError] = useState("");
  return (
    <div className="challenge-form-grid">
      <TextField
        label="عنوان مسئله"
        required
        value={record.title}
        onChange={(value) => setField(update, "title", value)}
        error={issueFor(issues, "title")}
      />
      <SelectField
        label="دسته‌بندی اصلی"
        required
        value={record.category}
        options={categoryOptions.map((item) => [item, item])}
        onChange={(value) => setField(update, "category", value)}
        error={issueFor(issues, "category")}
      />
      <TextAreaField
        className="challenge-field--full"
        label="شرح یک‌جمله‌ای مشکل"
        required
        rows={3}
        value={record.summary}
        onChange={(value) => setField(update, "summary", value)}
        error={issueFor(issues, "summary")}
      />
      <TextField
        label="واحد، سایت یا محل درگیر"
        required
        value={record.location}
        onChange={(value) => setField(update, "location", value)}
        error={issueFor(issues, "location")}
      />
      <TextField
        label="مالک مسئله"
        required
        value={record.ownerName}
        onChange={(value) => setField(update, "ownerName", value)}
        error={issueFor(issues, "ownerName")}
      />
      <TextAreaField
        className="challenge-field--full"
        label="نتیجه‌ای که سازمان به‌دنبال آن است"
        required
        rows={3}
        value={record.desiredOutcome}
        onChange={(value) => setField(update, "desiredOutcome", value)}
        error={issueFor(issues, "desiredOutcome")}
      />
      <div className="challenge-field--full">
        <RadioGroup
          legend="فوریت"
          value={record.urgency}
          compact
          options={[
            ["normal", "عادی"],
            ["important", "مهم"],
            ["urgent", "فوری"],
          ]}
          onChange={(value) => setField(update, "urgency", value)}
        />
      </div>
      <div className="challenge-upload-field challenge-field--full">
        <div>
          <strong>
            فایل اولیه <em>اختیاری</em>
          </strong>
          <small>فقط نام، نوع و حجم فایل ذخیره می‌شود.</small>
        </div>
        {record.attachments.length ? (
          <div className="challenge-file-list">
            {record.attachments.map((file) => (
              <div className="challenge-file-chip" key={file.id}>
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setField(
                      update,
                      "attachments",
                      record.attachments.filter((item) => item.id !== file.id),
                    )
                  }
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        ) : (
          <label className="challenge-upload-button">
            انتخاب فایل
            <input
              accept={CHALLENGE_UPLOAD_ACCEPT}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const nextError = challengeUploadError(file);
                setFileError(nextError);
                if (nextError) {
                  event.target.value = "";
                  return;
                }
                setField(update, "attachments", [createAttachment(file)]);
              }}
            />
          </label>
        )}
        {fileError && (
          <small className="is-error" role="alert">
            {fileError}
          </small>
        )}
      </div>
    </div>
  );
}

export function OutcomeStep({ record, issues, update }: StepProps) {
  const addCriterion = () => {
    if (record.successCriteria.length >= 3) return;
    setField(update, "successCriteria", [
      ...record.successCriteria,
      { id: `SC-${Date.now().toString(36)}`, title: "", target: "", method: "" },
    ]);
  };
  const updateCriterion = (id: string, key: "title" | "target" | "method", value: string) => {
    setField(
      update,
      "successCriteria",
      record.successCriteria.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  };
  return (
    <>
      <div className="challenge-form-grid">
        <TextAreaField
          className="challenge-field--full"
          label="شرح وضعیت فعلی"
          required
          rows={4}
          value={record.currentState}
          onChange={(value) => setField(update, "currentState", value)}
          error={issueFor(issues, "currentState")}
          placeholder="فرایند فعلی، مقیاس و شواهد موجود را توضیح دهید."
        />
        <TextAreaField
          label="پیامد ادامه وضع موجود"
          rows={3}
          value={record.consequence}
          onChange={(value) => setField(update, "consequence", value)}
          hint="توصیه‌شده: اثر مالی، عملیاتی یا ایمنی را کوتاه بنویسید."
        />
        <TextAreaField
          label="خروجی نهایی مورد انتظار"
          required
          rows={3}
          value={record.expectedOutput}
          onChange={(value) => setField(update, "expectedOutput", value)}
          error={issueFor(issues, "expectedOutput")}
        />
      </div>
      <section className="challenge-repeater" aria-labelledby="criteria-title">
        <header>
          <div>
            <h3 id="criteria-title">معیارهای موفقیت</h3>
            <p>حداقل یک و حداکثر سه معیار قابل اندازه‌گیری تعریف کنید.</p>
          </div>
          <button
            type="button"
            className="challenge-button challenge-button--secondary challenge-button--small"
            disabled={record.successCriteria.length >= 3}
            onClick={addCriterion}
          >
            افزودن معیار
          </button>
        </header>
        {issueFor(issues, "successCriteria") && (
          <small className="is-error">{issueFor(issues, "successCriteria")}</small>
        )}
        {!record.successCriteria.length && (
          <div className="challenge-repeater__empty">هنوز معیاری اضافه نشده است.</div>
        )}
        {record.successCriteria.map((criterion, index) => (
          <div className="challenge-criterion-row" key={criterion.id}>
            <span>{(index + 1).toLocaleString("fa-IR")}</span>
            <TextField
              label="عنوان معیار"
              required
              value={criterion.title}
              onChange={(value) => updateCriterion(criterion.id, "title", value)}
            />
            <TextField
              label="مقدار هدف"
              required
              value={criterion.target}
              onChange={(value) => updateCriterion(criterion.id, "target", value)}
            />
            <TextField
              label="روش اندازه‌گیری"
              required
              value={criterion.method}
              onChange={(value) => updateCriterion(criterion.id, "method", value)}
            />
            <button
              type="button"
              className="challenge-delete-button"
              onClick={() =>
                setField(
                  update,
                  "successCriteria",
                  record.successCriteria.filter((item) => item.id !== criterion.id),
                )
              }
            >
              حذف
            </button>
          </div>
        ))}
      </section>
      <div className="challenge-form-grid">
        <TextAreaField
          label="موارد داخل دامنه"
          required
          rows={4}
          value={record.inScope}
          onChange={(value) => setField(update, "inScope", value)}
          error={issueFor(issues, "inScope")}
        />
        <TextAreaField
          label="محدودیت‌های اصلی فنی، اجرایی یا ایمنی"
          rows={4}
          value={record.constraints}
          onChange={(value) => setField(update, "constraints", value)}
        />
        <TextAreaField
          className="challenge-field--full"
          label="داده، تجهیزات یا دسترسی قابل ارائه از طرف سازمان"
          rows={3}
          value={record.organizationSupport}
          onChange={(value) => setField(update, "organizationSupport", value)}
        />
      </div>
      <details className="challenge-accordion">
        <summary>اطلاعات تکمیلی</summary>
        <div>
          <TextAreaField
            label="تلاش‌های قبلی"
            rows={4}
            value={record.previousAttempts}
            onChange={(value) => setField(update, "previousAttempts", value)}
          />
        </div>
      </details>
    </>
  );
}

export function CollaborationStep({ record, issues, update }: StepProps) {
  return (
    <div className="challenge-form-stack">
      <RadioGroup<OutputType>
        legend="خروجی مورد انتظار"
        required
        value={record.outputType}
        options={Object.entries(outputTypeLabels) as Array<[OutputType, string]>}
        onChange={(value) => setField(update, "outputType", value)}
        error={issueFor(issues, "outputType")}
      />
      <RadioGroup<SourcingModel>
        legend="شیوه جذب حل‌کننده"
        required
        value={record.sourcingModel}
        options={Object.entries(sourcingModelLabels) as Array<[SourcingModel, string]>}
        onChange={(value) => setField(update, "sourcingModel", value)}
        error={issueFor(issues, "sourcingModel")}
      />
      {["private", "hybrid"].includes(record.sourcingModel) && (
        <TextAreaField
          label="دعوت‌شوندگان یا گروه هدف"
          required
          rows={3}
          value={record.invitees}
          onChange={(value) => setField(update, "invitees", value)}
          error={issueFor(issues, "invitees")}
          hint="نام مجموعه‌ها را با ویرگول از هم جدا کنید."
        />
      )}
      <CheckboxGroup<SolverType>
        legend="مشارکت‌کنندگان مجاز"
        required
        values={record.solverTypes}
        options={Object.entries(solverTypeLabels) as Array<[SolverType, string]>}
        onChange={(value) => setField(update, "solverTypes", value)}
        error={issueFor(issues, "solverTypes")}
      />
      <div className="challenge-form-grid">
        <RadioGroup<ApplicantScope | "">
          legend="نوع همکاری"
          required
          value={record.applicantScope}
          compact
          options={[
            ["person", "شخص"],
            ["team", "تیم"],
            ["both", "هر دو"],
          ]}
          onChange={(value) => setField(update, "applicantScope", value)}
          error={issueFor(issues, "applicantScope")}
        />
        <RadioGroup<WorkMode>
          legend="شیوه انجام"
          required
          value={record.workMode}
          compact
          options={Object.entries(workModeLabels) as Array<[WorkMode, string]>}
          onChange={(value) => setField(update, "workMode", value)}
          error={issueFor(issues, "workMode")}
        />
        <TextField
          label="مهلت دریافت پیشنهاد"
          required
          type="date"
          dir="ltr"
          value={record.proposalDeadline}
          onChange={(value) => setField(update, "proposalDeadline", value)}
          error={issueFor(issues, "proposalDeadline")}
        />
        <TextField
          label="زمان مطلوب شروع همکاری"
          type="date"
          dir="ltr"
          value={record.preferredStartDate}
          onChange={(value) => setField(update, "preferredStartDate", value)}
        />
      </div>
      <RadioGroup<BudgetStatus>
        legend="وضعیت بودجه"
        required
        value={record.budgetStatus}
        options={Object.entries(budgetStatusLabels) as Array<[BudgetStatus, string]>}
        onChange={(value) => setField(update, "budgetStatus", value)}
        error={issueFor(issues, "budgetStatus")}
      />
      {record.budgetStatus === "fixed" && (
        <div className="challenge-form-grid">
          <TextField
            label="مبلغ"
            required
            dir="ltr"
            value={record.budgetAmount}
            onChange={(value) => setField(update, "budgetAmount", value)}
            error={issueFor(issues, "budgetAmount")}
            placeholder="مثلاً 2500000000"
          />
          <SelectField
            label="واحد پول"
            required
            value={record.currency}
            options={[
              ["IRR", "ریال"],
              ["USD", "دلار آمریکا"],
              ["EUR", "یورو"],
            ]}
            onChange={(value) => setField(update, "currency", value as ChallengeRecord["currency"])}
          />
        </div>
      )}
    </div>
  );
}

export function AccessStep({ record, issues, update }: StepProps) {
  const allIssueCount = issues.length;
  return (
    <div className="challenge-form-stack">
      <RadioGroup<Visibility>
        legend="سطح نمایش"
        required
        value={record.visibility}
        options={Object.entries(visibilityLabels) as Array<[Visibility, string]>}
        onChange={(value) => setField(update, "visibility", value)}
        error={issueFor(issues, "visibility")}
      />
      {["public", "registered"].includes(record.visibility) && (
        <TextAreaField
          label="خلاصه عمومی مسئله"
          required
          rows={4}
          value={record.publicSummary}
          onChange={(value) => setField(update, "publicSummary", value)}
          error={issueFor(issues, "publicSummary")}
          hint="اطلاعات حساس، نام تجهیزات یا داده محرمانه را در این بخش ننویسید."
        />
      )}
      <SwitchField
        label="نیاز به توافق محرمانگی"
        description="دسترسی به اطلاعات کامل پس از تأیید توافق ممکن می‌شود."
        checked={record.ndaRequired}
        onChange={(value) => setField(update, "ndaRequired", value)}
      />
      <RadioGroup<IpTerms>
        legend="وضعیت مالکیت فکری"
        required
        value={record.ipTerms}
        options={Object.entries(ipTermLabels) as Array<[IpTerms, string]>}
        onChange={(value) => setField(update, "ipTerms", value)}
        error={issueFor(issues, "ipTerms")}
      />
      <div className="challenge-form-grid">
        <TextField
          label="نام مسئول پیگیری"
          required
          value={record.contactName}
          onChange={(value) => setField(update, "contactName", value)}
          error={issueFor(issues, "contactName")}
        />
        <TextField
          label="ایمیل مسئول پیگیری"
          required
          type="email"
          dir="ltr"
          value={record.contactEmail}
          onChange={(value) => setField(update, "contactEmail", value)}
          error={issueFor(issues, "contactEmail")}
        />
        <TextField
          label="شماره تماس"
          required
          dir="ltr"
          value={record.contactPhone}
          onChange={(value) => setField(update, "contactPhone", value)}
          error={issueFor(issues, "contactPhone")}
        />
      </div>
      <details className="challenge-accordion">
        <summary>تنظیمات حقوقی تکمیلی</summary>
        <div>
          <TextAreaField
            label="توضیحات یا شروط حقوقی تکمیلی"
            rows={4}
            value={record.legalNotes}
            onChange={(value) => setField(update, "legalNotes", value)}
          />
        </div>
      </details>
      <label
        className={`challenge-confirm-check ${issueFor(issues, "accuracyConfirmed") ? "has-error" : ""}`}
      >
        <input
          type="checkbox"
          checked={record.accuracyConfirmed}
          onChange={(event) => setField(update, "accuracyConfirmed", event.target.checked)}
        />
        <span>صحت اطلاعات و اختیار ارسال این پرونده از طرف سازمان را تأیید می‌کنم.</span>
      </label>
      {issueFor(issues, "accuracyConfirmed") && (
        <small className="is-error">{issueFor(issues, "accuracyConfirmed")}</small>
      )}
      <div className={`challenge-readiness-summary ${allIssueCount ? "has-issues" : "is-ready"}`}>
        <strong>
          {allIssueCount
            ? `${allIssueCount.toLocaleString("fa-IR")} مورد در این گام باقی مانده است`
            : "این گام کامل است"}
        </strong>
        <p>
          {allIssueCount
            ? "موارد بالا را اصلاح کنید؛ وضعیت کامل پرونده در پیش‌نمایش نمایش داده می‌شود."
            : "برای کنترل همه اطلاعات به پیش‌نمایش بروید."}
        </p>
      </div>
    </div>
  );
}
