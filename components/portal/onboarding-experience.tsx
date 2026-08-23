"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { signInAsAuthorizedOrganization } from "@/lib/auth/demo-organization-session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { readSolverAuthParams } from "@/components/portal/auth-experiences";
import type { RouteDefinition } from "@/types";

const onboardingSteps = {
  organization: [
    "contact",
    "company",
    "representative",
    "verification",
    "workspace",
    "invite-team",
    "complete",
  ],
  solver: [
    "contact",
    "type",
    "expertise",
    "portfolio",
    "identity",
    "preferences",
    "recommendations",
    "complete",
  ],
} as const;

export function OnboardingExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const role = definition.path.includes("/organization/") ? "organization" : "solver";
  const steps = onboardingSteps[role];
  const slug = definition.path.split("/").at(-1) ?? "contact";
  const index = Math.max(0, steps.indexOf(slug as never));
  const previous = index > 0 ? `/onboarding/${role}/${steps[index - 1]}` : "/auth/register";
  const next =
    index < steps.length - 1
      ? `/onboarding/${role}/${steps[index + 1]}`
      : role === "organization"
        ? "/app/org/dashboard"
        : "/app/solver/dashboard";
  const [field, setField] = useState("");
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState("");
  useEffect(() => {
    setReturnTo(
      safeReturnTo(
        readSolverAuthParams().get("returnTo"),
        role === "organization" ? "org" : "solver",
      ),
    );
  }, [role]);
  const withReturnTo = (path: string) =>
    returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
  const complete = slug === "complete";
  const save = () => {
    if (!complete && field.trim().length < 3) {
      setError("این فیلد برای ادامه لازم است؛ مقدار واردشده حفظ شده است.");
      return;
    }
    setError("");
    onNotice("پیش‌نویس همین گام ذخیره شد و برای ادامه آماده است.");
  };
  return (
    <section className="onboarding-layout container">
      <aside className="onboarding-progress">
        <strong>{role === "organization" ? "شروع سازمان" : "شروع حل‌کننده"}</strong>
        <div className="onboarding-progress__bar">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <small>
          گام {(index + 1).toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")}
        </small>
        {steps.map((step, stepIndex) => (
          <span
            key={step}
            className={stepIndex === index ? "active" : stepIndex < index ? "done" : ""}
          >
            {stepIndex < index ? <Icon name="check" /> : (stepIndex + 1).toLocaleString("fa-IR")}
          </span>
        ))}
      </aside>
      <div className="onboarding-card">
        <span className="eyebrow">پیش‌نویس قابل بازیابی</span>
        <h2>{definition.title}</h2>
        <p>{definition.summary}</p>
        {complete ? (
          <div className="completion-receipt">
            <Icon name="check" />
            <h3>شروع همکاری ثبت شد</h3>
            <p>
              رسید <bdi>RC-ONB-1405-882</bdi> ایجاد شد؛ چک‌لیست اقدام بعدی در میز کار قرار دارد.
            </p>
          </div>
        ) : (
          <div className="onboarding-fields">
            <label>
              <span>
                اطلاعات اصلی این گام <b>*</b>
              </span>
              <input
                value={field}
                onChange={(event) => setField(event.target.value)}
                placeholder={
                  slug === "company"
                    ? "نام حقوقی شرکت"
                    : slug === "expertise"
                      ? "مثلاً بازچرخانی آب صنعتی"
                      : "اطلاعات را وارد کنید"
                }
              />
            </label>
            <label>
              <span>یادداشت تکمیلی</span>
              <textarea rows={4} placeholder="زمینه، محدودیت یا توضیح لازم برای بررسی" />
            </label>
            <label className="onboarding-consent">
              <input type="checkbox" /> صحت اطلاعات و نسخه جاری شرایط را تأیید می‌کنم.
            </label>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Link className="button button--secondary" href={withReturnTo(previous)}>
            گام قبل
          </Link>
          <span>
            <Icon name="check" /> ذخیره محلی فعال است
          </span>
          {complete ? (
            <Link
              className="button button--primary"
              href={returnTo || next}
              onClick={() => role === "organization" && signInAsAuthorizedOrganization()}
            >
              {definition.primaryAction}
            </Link>
          ) : (
            <Link
              className="button button--primary"
              href={withReturnTo(next)}
              onClick={(event) => {
                if (field.trim().length < 3) {
                  event.preventDefault();
                  save();
                } else save();
              }}
            >
              ذخیره و ادامه
            </Link>
          )}
        </footer>
      </div>
    </section>
  );
}
