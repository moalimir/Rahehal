"use client";

import { useState } from "react";
import { ChallengeShell } from "@/components/challenge-flow/shell";
import {
  ErrorSummary,
  RadioGroup,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/challenge-flow/fields";
import { WizardStepper } from "@/components/challenge-flow/wizard";
import { categoryOptions, currentUser, type ChallengeRecord } from "@/domain/challenge";
import type { InitialChallengeInput } from "@/lib/challenges/gateway";
import { createAttachment, emptyChallenge } from "@/lib/challenges/model";
import { navigateChallenge } from "@/lib/challenges/navigation";
import { useChallengeGateway } from "@/components/runtime-provider";
import { issueFor, validateStep } from "@/lib/challenges/validation";
import { CHALLENGE_UPLOAD_ACCEPT, challengeUploadError } from "@/lib/validation/upload";

const initialForm: InitialChallengeInput = {
  title: "",
  summary: "",
  category: "",
  location: "",
  ownerName: currentUser.name,
  desiredOutcome: "",
  urgency: "normal",
  attachments: [],
};

export function ChallengeIntakePage() {
  const challengeGateway = useChallengeGateway();
  const [form, setForm] = useState<InitialChallengeInput>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const record = { ...emptyChallenge("NEW"), ...form } as ChallengeRecord;
  const issues = submitted ? validateStep(record, 1) : [];
  const update = <K extends keyof InitialChallengeInput>(
    field: K,
    value: InitialChallengeInput[K],
  ) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async () => {
    setSubmitted(true);
    setFatalError("");
    const nextIssues = validateStep(record, 1);
    if (nextIssues.length) {
      document.querySelector(".challenge-error-summary")?.scrollIntoView({ block: "center" });
      return;
    }
    setBusy(true);
    const result = await challengeGateway.commands.create(form);
    setBusy(false);
    if (!result.ok) {
      setFatalError(result.error.message);
      return;
    }
    navigateChallenge(`/app/org/challenges/${result.data.id}/edit?step=2`);
  };

  return (
    <ChallengeShell
      title="ثبت مسئله سازمانی"
      description="اطلاعات پایه را وارد کنید؛ پیش‌نویس در کمتر از سه دقیقه ساخته می‌شود."
    >
      <WizardStepper current={1} />
      <section className="challenge-form-panel">
        <header>
          <h2>تعریف اولیه مسئله</h2>
          <p>مسئله را کوتاه و قابل فهم بنویسید؛ جزئیات در گام‌های بعد تکمیل می‌شوند.</p>
        </header>
        <ErrorSummary issues={issues} />
        {fatalError && (
          <div className="challenge-inline-error" role="alert">
            {fatalError}
          </div>
        )}
        <div className="challenge-form-grid">
          <TextField
            label="عنوان مسئله"
            required
            value={form.title}
            onChange={(value) => update("title", value)}
            error={issueFor(issues, "title")}
            placeholder="مثلاً کاهش مصرف آب در خط شست‌وشو"
          />
          <SelectField
            label="دسته‌بندی اصلی"
            required
            value={form.category}
            options={categoryOptions.map((item) => [item, item])}
            onChange={(value) => update("category", value)}
            error={issueFor(issues, "category")}
          />
          <TextAreaField
            className="challenge-field--full"
            label="شرح یک‌جمله‌ای مشکل"
            required
            rows={3}
            value={form.summary}
            onChange={(value) => update("summary", value)}
            error={issueFor(issues, "summary")}
            placeholder="اکنون چه مشکلی وجود دارد و چرا مهم است؟"
          />
          <TextField
            label="واحد، سایت یا محل درگیر"
            required
            value={form.location}
            onChange={(value) => update("location", value)}
            error={issueFor(issues, "location")}
          />
          <TextField
            label="مالک مسئله"
            required
            value={form.ownerName}
            onChange={(value) => update("ownerName", value)}
            error={issueFor(issues, "ownerName")}
            hint="فردی که پاسخ‌گوی تکمیل و پیگیری پرونده است."
          />
          <TextAreaField
            className="challenge-field--full"
            label="نتیجه‌ای که سازمان به‌دنبال آن است"
            required
            rows={3}
            value={form.desiredOutcome}
            onChange={(value) => update("desiredOutcome", value)}
            error={issueFor(issues, "desiredOutcome")}
            placeholder="نتیجه مطلوب را تا حد امکان قابل اندازه‌گیری بنویسید."
          />
        </div>
        <RadioGroup
          legend="فوریت"
          value={form.urgency}
          compact
          options={[
            ["normal", "عادی"],
            ["important", "مهم"],
            ["urgent", "فوری"],
          ]}
          onChange={(value) => update("urgency", value)}
        />
        <div className="challenge-upload-field">
          <div>
            <strong>
              فایل اولیه <em>اختیاری</em>
            </strong>
            <small>فقط مشخصات فایل در نسخه نمایشی نگهداری می‌شود؛ حداکثر یک فایل.</small>
          </div>
          {form.attachments.length ? (
            <div className="challenge-file-chip">
              <span>{form.attachments[0].name}</span>
              <button type="button" onClick={() => update("attachments", [])}>
                حذف
              </button>
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
                  update("attachments", [createAttachment(file)]);
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
        <footer className="challenge-form-actions">
          <span>پس از ادامه، شناسه پیش‌نویس ساخته و در مرورگر ذخیره می‌شود.</span>
          <button
            type="button"
            className="challenge-button challenge-button--primary"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? "در حال ذخیره…" : "ذخیره و ادامه"}
          </button>
        </footer>
      </section>
    </ChallengeShell>
  );
}
