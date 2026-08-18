"use client";

import { wizardSteps, type WizardStep } from "@/lib/challenges/validation";
import type { SaveStatus } from "@/components/challenge-flow/hooks";

export function WizardStepper({
  current,
  completedThrough = 0,
  onSelect,
}: {
  current: WizardStep;
  completedThrough?: number;
  onSelect?: (step: WizardStep) => void;
}) {
  const active = wizardSteps.find((step) => step.id === current)!;
  return (
    <>
      <div className="challenge-mobile-step" aria-live="polite">
        <span>گام {current.toLocaleString("fa-IR")} از ۴</span>
        <strong>{active.title}</strong>
      </div>
      <ol className="challenge-stepper" aria-label="مراحل ثبت مسئله">
        {wizardSteps.map((step) => {
          const available = step.id <= Math.max(completedThrough, current);
          const content = (
            <>
              <span>{step.id.toLocaleString("fa-IR")}</span>
              <strong>{step.shortTitle}</strong>
            </>
          );
          return (
            <li
              key={step.id}
              className={`${current === step.id ? "is-active" : ""} ${step.id < current || step.id <= completedThrough ? "is-complete" : ""}`}
              aria-current={current === step.id ? "step" : undefined}
            >
              {onSelect && available ? (
                <button type="button" onClick={() => onSelect(step.id)}>
                  {content}
                </button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "dirty"
      ? "تغییر ذخیره‌نشده"
      : status === "saving"
        ? "در حال ذخیره…"
        : status === "error"
          ? "خطا در ذخیره"
          : "ذخیره شد";
  return (
    <span className={`challenge-save-indicator challenge-save-indicator--${status}`} role="status">
      {label}
    </span>
  );
}
