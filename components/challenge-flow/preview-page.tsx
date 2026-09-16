"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/challenge-flow/fields";
import {
  ChallengeLoadErrorState,
  ChallengeShell,
  NotFoundState,
  StatusBadge,
} from "@/components/challenge-flow/shell";
import { useChallengeRecord } from "@/components/challenge-flow/hooks";
import { useChallengeGateway, useWebRuntime } from "@/components/runtime-provider";
import {
  budgetStatusLabels,
  ipTermLabels,
  outputTypeLabels,
  applicantTypeLabels,
  sourcingModelLabels,
  visibilityLabels,
  workModeLabels,
} from "@/domain/challenge";
import { formatDateTime, tehranTimeLabel } from "@/lib/challenges/model";
import { challengeHref, navigateChallenge } from "@/lib/challenges/navigation";
import { validateRecord } from "@/lib/challenges/validation";

function Value({ children, empty = "ثبت نشده" }: { children?: React.ReactNode; empty?: string }) {
  return <dd>{children || <span className="challenge-empty-value">{empty}</span>}</dd>;
}

export function ChallengePreviewPage({ id }: { id: string }) {
  const challengeGateway = useChallengeGateway();
  const { me, mode: runtimeMode } = useWebRuntime();
  const ownerPublication =
    runtimeMode === "network" &&
    me?.memberships.some(
      (membership) =>
        membership.workspace_id === me.active_context?.workspace_id &&
        membership.state === "active" &&
        membership.role === "org:owner",
    );
  const { record, lastSavedLabel, loadError, readiness, triageReadiness, stage } =
    useChallengeRecord(id);
  const [mode, setMode] = useState<"public" | "full">("full");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const issues = useMemo(() => {
    if (!record) return [];
    if (!readiness) return validateRecord(record);
    return readiness.issues.map((issue) => ({
      id: issue.path,
      field: "title" as const,
      step: issue.step,
      message: issue.message,
    }));
  }, [readiness, record]);
  if (record === undefined)
    return (
      <ChallengeShell title="پیش‌نمایش پرونده">
        <div className="challenge-loading-state">در حال آماده‌کردن پیش‌نمایش…</div>
      </ChallengeShell>
    );
  if (loadError) return <ChallengeLoadErrorState message={loadError} />;
  if (!record) return <NotFoundState />;

  const submissionReadiness = stage === "draft" && !ownerPublication ? triageReadiness : readiness;
  const canSubmit = ownerPublication
    ? Boolean(
        readiness?.ready &&
          stage &&
          ["draft", "triage", "formulation", "approvals"].includes(stage),
      )
    : submissionReadiness
      ? submissionReadiness.ready && (stage === "draft" || stage === "formulation")
      : issues.length === 0 && ["draft", "ready", "needs_changes"].includes(record.status);
  const requestingApprovals = stage === "formulation";
  return (
    <ChallengeShell
      title="پیش‌نمایش پرونده"
      description={
        ownerPublication
          ? "پیش‌نمایش و انتشار مستقیم توسط مالک."
          : "اطلاعاتی را که برای بررسی ارسال می‌شود کنترل کنید."
      }
      id={record.id}
      status={record.status}
      lastSaved={`آخرین تغییر: ${lastSavedLabel}`}
    >
      <div className="challenge-preview-switch" role="group" aria-label="سطح اطلاعات پیش‌نمایش">
        <button
          type="button"
          className={mode === "public" ? "is-active" : ""}
          aria-pressed={mode === "public"}
          onClick={() => setMode("public")}
        >
          نمایش اطلاعات عمومی
        </button>
        <button
          type="button"
          className={mode === "full" ? "is-active" : ""}
          aria-pressed={mode === "full"}
          onClick={() => setMode("full")}
        >
          نمایش کامل برای سازمان
        </button>
      </div>

      {mode === "public" &&
        record.visibility !== "public" &&
        record.visibility !== "registered" && (
          <p role="status">این سطح دسترسی، نمایش عمومی ندارد.</p>
        )}

      {issues.length > 0 && (
        <section className="challenge-missing-panel" aria-labelledby="missing-title">
          <h2 id="missing-title">پرونده هنوز آماده ارسال نیست</h2>
          <p>موارد زیر را تکمیل کنید. هر مورد به گام مرتبط می‌رود.</p>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.step}-${issue.id}`}>
                <Link
                  href={challengeHref(`/app/org/challenges/${record.id}/edit?step=${issue.step}`)}
                >
                  {issue.message}
                  <span>گام {issue.step.toLocaleString("fa-IR")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <article className="challenge-preview-document">
        <header>
          <div>
            <StatusBadge status={record.status} />
            <span>{record.category}</span>
          </div>
          <h2>{record.title}</h2>
          <p>{mode === "public" ? record.publicSummary : record.summary}</p>
        </header>

        {mode === "full" && (
          <section>
            <h3>مسئله و نتیجه مطلوب</h3>
            <dl className="challenge-definition-list">
              <div>
                <dt>وضعیت فعلی</dt>
                <Value>{record.currentState}</Value>
              </div>
              <div>
                <dt>نتیجه مطلوب</dt>
                <Value>{record.desiredOutcome}</Value>
              </div>
              <div>
                <dt>خروجی نهایی</dt>
                <Value>{record.expectedOutput}</Value>
              </div>
            </dl>
          </section>
        )}

        {mode === "full" && (
          <section>
            <h3>معیارهای موفقیت</h3>
            {record.successCriteria.length ? (
              <div className="challenge-criteria-preview">
                {record.successCriteria.map((item) => (
                  <dl key={item.id}>
                    <div>
                      <dt>معیار</dt>
                      <dd>{item.title}</dd>
                    </div>
                    <div>
                      <dt>هدف</dt>
                      <dd>{item.target}</dd>
                    </div>
                    <div>
                      <dt>سنجش</dt>
                      <dd>{item.method}</dd>
                    </div>
                  </dl>
                ))}
              </div>
            ) : (
              <p className="challenge-empty-value">معیاری ثبت نشده است.</p>
            )}
          </section>
        )}

        {mode === "full" && (
          <section>
            <h3>دامنه و محدودیت‌ها</h3>
            <dl className="challenge-definition-list">
              <div>
                <dt>داخل دامنه</dt>
                <Value>{record.inScope}</Value>
              </div>
              <div>
                <dt>محدودیت‌ها</dt>
                <Value>{record.constraints}</Value>
              </div>
              <div>
                <dt>امکانات سازمان</dt>
                <Value>{record.organizationSupport}</Value>
              </div>
            </dl>
          </section>
        )}

        <section>
          <h3>مدل همکاری</h3>
          <dl className="challenge-definition-list challenge-definition-list--compact">
            <div>
              <dt>محل اجرا</dt>
              <Value>{record.location}</Value>
            </div>
            <div>
              <dt>خروجی همکاری</dt>
              <Value>{record.outputType ? outputTypeLabels[record.outputType] : ""}</Value>
            </div>
            <div>
              <dt>جذب حل‌کننده</dt>
              <Value>{record.sourcingModel ? sourcingModelLabels[record.sourcingModel] : ""}</Value>
            </div>
            <div>
              <dt>مشارکت‌کنندگان</dt>
              <Value>
                {record.allowedApplicantTypes.map((item) => applicantTypeLabels[item]).join("، ")}
              </Value>
            </div>
            <div>
              <dt>شیوه انجام</dt>
              <Value>{record.workMode ? workModeLabels[record.workMode] : ""}</Value>
            </div>
          </dl>
        </section>

        <section>
          <h3>زمان و بودجه</h3>
          <dl className="challenge-definition-list challenge-definition-list--compact">
            <div>
              <dt>مهلت پیشنهاد</dt>
              <Value>
                {record.proposalDeadline
                  ? `${formatDateTime(record.proposalDeadline)} ${tehranTimeLabel}`
                  : ""}
              </Value>
            </div>
            <div>
              <dt>وضعیت بودجه</dt>
              <Value>{record.budgetStatus ? budgetStatusLabels[record.budgetStatus] : ""}</Value>
            </div>
            {record.budgetStatus === "fixed" && (
              <div>
                <dt>مبلغ</dt>
                <Value>
                  <bdi>
                    {record.budgetAmount} {record.currency}
                  </bdi>
                </Value>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h3>دسترسی و محرمانگی</h3>
          <dl className="challenge-definition-list challenge-definition-list--compact">
            <div>
              <dt>سطح نمایش</dt>
              <Value>{record.visibility ? visibilityLabels[record.visibility] : ""}</Value>
            </div>
            <div>
              <dt>توافق محرمانگی</dt>
              <Value>{record.ndaRequired ? "لازم است" : "لازم نیست"}</Value>
            </div>
            <div>
              <dt>مالکیت فکری</dt>
              <Value>{record.ipTerms ? ipTermLabels[record.ipTerms] : ""}</Value>
            </div>
          </dl>
        </section>

        {mode === "full" && (
          <section>
            <h3>فایل‌های پیوست</h3>
            {record.attachments.length ? (
              <ul className="challenge-attachment-list">
                {record.attachments.map((file) => (
                  <li key={file.id}>
                    <span>{file.name}</span>
                    <small>
                      {Math.max(1, Math.round(file.size / 1024)).toLocaleString("fa-IR")} کیلوبایت
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="challenge-empty-value">فایلی پیوست نشده است.</p>
            )}
          </section>
        )}
      </article>

      <div className="challenge-preview-actions">
        <Link
          className="challenge-button challenge-button--secondary"
          href={challengeHref(`/app/org/challenges/${record.id}/edit?step=4`)}
        >
          بازگشت و ویرایش
        </Link>
        <div>
          <button
            type="button"
            className="challenge-button challenge-button--primary"
            disabled={!canSubmit || busy}
            onClick={() => setConfirmOpen(true)}
          >
            {busy
              ? "در حال ثبت…"
              : ownerPublication
                ? "انتشار چالش"
                : requestingApprovals
                  ? "ارسال برای تأییدها"
                  : "ارسال برای بررسی"}
          </button>
          {issues.length > 0 && (
            <small>ابتدا {issues.length.toLocaleString("fa-IR")} مورد ناقص را تکمیل کنید.</small>
          )}
        </div>
      </div>
      {submitError && (
        <div className="challenge-inline-error" role="alert">
          {submitError}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={
          ownerPublication
            ? "انتشار این نسخه از چالش؟"
            : requestingApprovals
              ? "ارسال صورت‌بندی برای تأییدها؟"
              : "ارسال پرونده برای بررسی؟"
        }
        description={
          ownerPublication ? (
            <p>نسخه قفل و طبق سطح دسترسی انتخابی منتشر می‌شود. اطلاعات محرمانه عمومی نمی‌شود.</p>
          ) : (
            <>
              <p>
                پس از ارسال، وضعیت پرونده به «در انتظار بررسی» تغییر می‌کند و نسخه فعلی قفل می‌شود.
              </p>
              <p>انتشار عمومی فقط پس از بررسی پلتفرم انجام می‌شود.</p>
            </>
          )
        }
        confirmLabel={ownerPublication ? "تأیید و انتشار" : "تأیید و ارسال"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (busy || !canSubmit) return;
          setConfirmOpen(false);
          setSubmitError("");
          setBusy(true);
          try {
            const result = await (ownerPublication
              ? challengeGateway.commands.publish(record.id)
              : challengeGateway.commands.submit(record));
            if (!result.ok) {
              setSubmitError(result.error.message);
              return;
            }
            navigateChallenge(
              `/app/org/challenges/${result.data.id}/${ownerPublication ? "governance" : "submitted"}`,
            );
          } catch {
            setSubmitError("نتیجه دریافت نشد؛ اتصال را بررسی و تکرار کنید.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <span className="sr-only">پیش‌نمایش در {formatDateTime(record.updatedAt)} ساخته شد.</span>
    </ChallengeShell>
  );
}
