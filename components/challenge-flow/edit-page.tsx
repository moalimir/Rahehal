"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorSummary, Toast } from "@/components/challenge-flow/fields";
import {
  AccessStep,
  CollaborationStep,
  DefinitionStep,
  OutcomeStep,
} from "@/components/challenge-flow/edit-steps";
import {
  ChallengeLoadErrorState,
  ChallengeShell,
  NotFoundState,
} from "@/components/challenge-flow/shell";
import { SaveIndicator, WizardStepper } from "@/components/challenge-flow/wizard";
import { useChallengeRecord } from "@/components/challenge-flow/hooks";
import { isDraftStatus } from "@/domain/challenge";
import { navigateChallenge, readStandalonePath } from "@/lib/challenges/navigation";
import { validateStep, wizardSteps, type WizardStep } from "@/lib/challenges/validation";

function stepFromLocation(fallback: WizardStep): WizardStep {
  if (typeof window === "undefined") return fallback;
  const query = readStandalonePath()?.query ?? window.location.search;
  const parsed = Number(new URLSearchParams(query).get("step"));
  return [1, 2, 3, 4].includes(parsed) ? (parsed as WizardStep) : fallback;
}

export function ChallengeEditPage({ id }: { id: string }) {
  const { record, updateRecord, saveNow, saveStatus, lastSavedLabel, loadError, saveError } =
    useChallengeRecord(id);
  const [step, setStep] = useState<WizardStep>(1);
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!record) return;
    setStep(stepFromLocation(record.lastStep));
  }, [record]);

  useEffect(() => {
    const sync = () => setStep((current) => stepFromLocation(current));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const goToStep = useCallback(
    (next: WizardStep) => {
      if (!record) return;
      setShowErrors(false);
      setStep(next);
      updateRecord((current) => ({
        ...current,
        lastStep: Math.max(current.lastStep, next) as WizardStep,
      }));
      const path = `/app/org/challenges/${record.id}/edit?step=${next}`;
      if (document.documentElement.dataset.challengeStandalone === "true") navigateChallenge(path);
      else window.history.pushState(null, "", path);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [record, updateRecord],
  );

  const issues = useMemo(
    () => (record && showErrors ? validateStep(record, step) : []),
    [record, showErrors, step],
  );
  if (record === undefined)
    return (
      <ChallengeShell title="تکمیل مسئله" description="اطلاعات پرونده خوانده می‌شود.">
        <div className="challenge-loading-state">در حال بارگذاری پرونده…</div>
      </ChallengeShell>
    );
  if (loadError) return <ChallengeLoadErrorState message={loadError} />;
  if (!record) return <NotFoundState />;
  if (!isDraftStatus(record.status)) {
    return (
      <ChallengeShell
        title={record.title}
        description="این پرونده ارسال شده و در این وضعیت امکان ویرایش ندارد."
        id={record.id}
        status={record.status}
      >
        <section className="challenge-empty-state">
          <h2>پرونده در مسیر بررسی است</h2>
          <p>جزئیات و رویدادهای پرونده را در نمای خلاصه ببینید.</p>
          <Link
            className="challenge-button challenge-button--primary"
            href={`/app/org/challenges/${record.id}`}
          >
            مشاهده پرونده
          </Link>
        </section>
      </ChallengeShell>
    );
  }

  const activeStep = wizardSteps.find((item) => item.id === step)!;
  const continueFlow = async () => {
    const nextIssues = validateStep(record, step);
    if (step < 4 && nextIssues.length) {
      setShowErrors(true);
      window.setTimeout(
        () =>
          document.querySelector(".challenge-error-summary")?.scrollIntoView({ block: "center" }),
        0,
      );
      return;
    }
    const saved = await saveNow();
    if (!saved) {
      setToast("ذخیره پیش‌نویس انجام نشد؛ دوباره تلاش کنید.");
      return;
    }
    if (step < 4) goToStep((step + 1) as WizardStep);
    else navigateChallenge(`/app/org/challenges/${record.id}/preview`);
  };

  const stepContent =
    step === 1 ? (
      <DefinitionStep record={record} issues={issues} update={updateRecord} />
    ) : step === 2 ? (
      <OutcomeStep record={record} issues={issues} update={updateRecord} />
    ) : step === 3 ? (
      <CollaborationStep record={record} issues={issues} update={updateRecord} />
    ) : (
      <AccessStep record={record} issues={issues} update={updateRecord} />
    );

  return (
    <ChallengeShell
      title="تکمیل مسئله"
      description="هر گام را کوتاه و دقیق تکمیل کنید؛ تغییرات به‌صورت خودکار ذخیره می‌شوند."
      id={record.id}
      status={record.status}
      lastSaved={`آخرین تغییر: ${lastSavedLabel}`}
      actions={
        <button
          type="button"
          className="challenge-button challenge-button--quiet"
          onClick={() => {
            void saveNow().then((saved) => {
              if (!saved) {
                setToast("ذخیره پیش‌نویس انجام نشد؛ دوباره تلاش کنید.");
                return;
              }
              navigateChallenge("/app/org/challenges");
            });
          }}
        >
          ذخیره و خروج
        </button>
      }
    >
      <WizardStepper current={step} completedThrough={record.lastStep} onSelect={goToStep} />
      <section className="challenge-form-panel">
        <header className="challenge-form-panel__heading">
          <div>
            <span>گام {step.toLocaleString("fa-IR")}</span>
            <h2>{activeStep.title}</h2>
          </div>
          <SaveIndicator status={saveStatus} />
        </header>
        <ErrorSummary issues={issues} />
        {saveError && (
          <div className="challenge-inline-error" role="alert" data-error-code={saveError.code}>
            <strong>
              {saveError.code === "CONFLICT"
                ? "نسخه تازه‌تری روی سرور وجود دارد."
                : "ذخیره انجام نشد."}
            </strong>{" "}
            {saveError.message}
            {saveError.code === "CONFLICT" && (
              <button type="button" onClick={() => window.location.reload()}>
                دریافت نسخه تازه
              </button>
            )}
          </div>
        )}
        {stepContent}
        <footer className="challenge-form-actions">
          <div>
            {step > 1 && (
              <button
                type="button"
                className="challenge-button challenge-button--quiet"
                onClick={() => goToStep((step - 1) as WizardStep)}
              >
                قبلی
              </button>
            )}
            <button
              type="button"
              className="challenge-button challenge-button--secondary"
              onClick={() => {
                void saveNow().then((saved) => {
                  setToast(
                    saved ? "پیش‌نویس ذخیره شد." : "ذخیره پیش‌نویس انجام نشد؛ دوباره تلاش کنید.",
                  );
                  window.setTimeout(() => setToast(""), 2000);
                });
              }}
            >
              ذخیره پیش‌نویس
            </button>
          </div>
          <button
            type="button"
            className="challenge-button challenge-button--primary"
            onClick={() => void continueFlow()}
          >
            {step === 4 ? "مشاهده پیش‌نمایش" : "ذخیره و ادامه"}
          </button>
        </footer>
      </section>
      <Toast message={toast} />
    </ChallengeShell>
  );
}
