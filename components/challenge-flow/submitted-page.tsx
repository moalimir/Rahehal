"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChallengeLoadErrorState,
  ChallengeShell,
  NotFoundState,
  StatusBadge,
} from "@/components/challenge-flow/shell";
import { useChallengeRecord } from "@/components/challenge-flow/hooks";
import { useWebRuntime } from "@/components/runtime-provider";
import { formatDateTime } from "@/lib/challenges/model";
import { navigateChallenge } from "@/lib/challenges/navigation";

export function ChallengeSubmittedPage({ id }: { id: string }) {
  const runtime = useWebRuntime();
  const { record, loadError, stage } = useChallengeRecord(id);
  const [transitionPending, setTransitionPending] = useState(false);
  const [transitionError, setTransitionError] = useState("");
  if (record === undefined)
    return (
      <ChallengeShell title="رسید ارسال">
        <div className="challenge-loading-state">در حال خواندن رسید…</div>
      </ChallengeShell>
    );
  if (loadError) return <ChallengeLoadErrorState message={loadError} />;
  if (!record) return <NotFoundState />;
  if (!record.submittedAt) {
    return (
      <ChallengeShell
        title="پرونده هنوز ارسال نشده است"
        description="پس از تکمیل اطلاعات و تأیید پیش‌نمایش، رسید ارسال ساخته می‌شود."
        id={record.id}
        status={record.status}
      >
        <section className="challenge-empty-state">
          <h2>رسیدی برای این پیش‌نویس وجود ندارد</h2>
          <p>برای ادامه به پیش‌نمایش پرونده بروید.</p>
          <Link
            className="challenge-button challenge-button--primary"
            href={`/app/org/challenges/${record.id}/preview`}
          >
            مشاهده پیش‌نمایش
          </Link>
        </section>
      </ChallengeShell>
    );
  }
  return (
    <ChallengeShell
      title="رسید ارسال"
      description={
        runtime.mode === "network"
          ? "نسخه ثبت‌شده پرونده در سرور مرجع نگهداری می‌شود."
          : "نسخه نمایشی پرونده در این مرورگر نگهداری می‌شود."
      }
    >
      <section className="challenge-submitted-card">
        <div className="challenge-success-icon" aria-hidden="true">
          ✓
        </div>
        <h2>پرونده با موفقیت برای بررسی ارسال شد</h2>
        <p>
          تیم پلتفرم کامل‌بودن و کیفیت اطلاعات را بررسی می‌کند. انتشار عمومی در این مرحله انجام نشده
          است.
        </p>
        <dl>
          <div>
            <dt>شناسه پرونده</dt>
            <dd>
              <bdi>{record.id}</bdi>
            </dd>
          </div>
          <div>
            <dt>تاریخ و زمان ارسال</dt>
            <dd>{formatDateTime(record.submittedAt)}</dd>
          </div>
          <div>
            <dt>وضعیت</dt>
            <dd>
              <StatusBadge status="under_review" />
            </dd>
          </div>
        </dl>
        <div className="challenge-next-step">
          <strong>مرحله بعد</strong>
          <p>
            در صورت نیاز به اصلاح، وضعیت پرونده تغییر می‌کند و امکان ویرایش دوباره فراهم می‌شود.
          </p>
        </div>
        <footer>
          {runtime.mode === "network" && stage === "triage" && (
            <button
              type="button"
              className="challenge-button challenge-button--primary"
              disabled={transitionPending}
              onClick={() => {
                setTransitionPending(true);
                setTransitionError("");
                void runtime.challengeGateway.commands
                  .advanceFormulation(record.id)
                  .then((result) => {
                    setTransitionPending(false);
                    if (!result.ok) {
                      setTransitionError(result.error.message);
                      return;
                    }
                    navigateChallenge(`/app/org/challenges/${record.id}/edit`);
                  });
              }}
            >
              {transitionPending ? "در حال ثبت…" : "تأیید غربالگری و شروع صورت‌بندی"}
            </button>
          )}
          <Link
            className="challenge-button challenge-button--primary"
            href={`/app/org/challenges/${record.id}`}
          >
            مشاهده پرونده
          </Link>
          <Link className="challenge-button challenge-button--secondary" href="/app/org/challenges">
            بازگشت به مسئله‌ها
          </Link>
        </footer>
        {transitionError && (
          <div className="challenge-inline-error" role="alert">
            {transitionError}
          </div>
        )}
      </section>
    </ChallengeShell>
  );
}
