"use client";

import { challengeHref } from "@/lib/challenges/navigation";
import Link from "next/link";
import {
  ChallengeLoadErrorState,
  ChallengeShell,
  NotFoundState,
} from "@/components/challenge-flow/shell";
import { useChallengeRecord } from "@/components/challenge-flow/hooks";
import { isDraftStatus, outputTypeLabels, sourcingModelLabels } from "@/domain/challenge";
import { formatDateTime } from "@/lib/challenges/model";
import { isNetworkWebRuntime } from "@/lib/runtime/mode";
import { ConnectedRecordLinks } from "@/components/challenge-flow/connected-record-links";

export function ChallengeDetailPage({ id }: { id: string }) {
  const { record, loadError } = useChallengeRecord(id);
  if (record === undefined)
    return (
      <ChallengeShell title="نمای پرونده">
        <div className="challenge-loading-state">در حال خواندن پرونده…</div>
      </ChallengeShell>
    );
  if (loadError) return <ChallengeLoadErrorState message={loadError} />;
  if (!record) return <NotFoundState />;
  const editable = isDraftStatus(record.status);
  const actionLabel = record.status === "needs_changes" ? "ویرایش" : "ادامه تکمیل";
  return (
    <ChallengeShell
      title={record.title}
      description={record.summary}
      id={record.id}
      status={record.status}
      lastSaved={`آخرین تغییر: ${formatDateTime(record.updatedAt)}`}
      actions={
        <>
          {editable ? (
            <Link
              className="challenge-button challenge-button--primary"
              href={challengeHref(`/app/org/challenges/${record.id}/edit?step=${record.lastStep}`)}
            >
              {actionLabel}
            </Link>
          ) : null}
          {isNetworkWebRuntime && <ConnectedRecordLinks record={record} />}
          <Link className="challenge-button challenge-button--secondary" href="/app/org/challenges">
            بازگشت به فهرست
          </Link>
        </>
      }
    >
      <div className="challenge-detail-layout">
        <article className="challenge-detail-main">
          <section>
            <h2>خلاصه مسئله و نتیجه مطلوب</h2>
            <dl className="challenge-definition-list">
              <div>
                <dt>مسئله</dt>
                <dd>{record.summary}</dd>
              </div>
              <div>
                <dt>وضعیت فعلی</dt>
                <dd>{record.currentState || "هنوز تکمیل نشده است."}</dd>
              </div>
              <div>
                <dt>نتیجه مطلوب</dt>
                <dd>{record.desiredOutcome}</dd>
              </div>
            </dl>
          </section>
          <section>
            <h2>معیارهای موفقیت</h2>
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
                      <dt>روش سنجش</dt>
                      <dd>{item.method}</dd>
                    </div>
                  </dl>
                ))}
              </div>
            ) : (
              <p className="challenge-empty-value">هنوز معیاری ثبت نشده است.</p>
            )}
          </section>
          <section>
            <h2>مدل همکاری و مهلت</h2>
            <dl className="challenge-definition-list challenge-definition-list--compact">
              <div>
                <dt>خروجی</dt>
                <dd>
                  {record.outputType ? outputTypeLabels[record.outputType] : "هنوز مشخص نشده است."}
                </dd>
              </div>
              <div>
                <dt>شیوه جذب</dt>
                <dd>
                  {record.sourcingModel
                    ? sourcingModelLabels[record.sourcingModel]
                    : "هنوز مشخص نشده است."}
                </dd>
              </div>
              <div>
                <dt>مهلت دریافت پیشنهاد</dt>
                <dd>
                  {record.proposalDeadline
                    ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "long" }).format(
                        new Date(record.proposalDeadline),
                      )
                    : "هنوز مشخص نشده است."}
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <h2>فایل‌های پیوست</h2>
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
        </article>
        <aside className="challenge-detail-aside">
          <section>
            <h2>مسئول پرونده</h2>
            <strong>{record.ownerName}</strong>
            <p>{record.contactEmail}</p>
          </section>
          <section>
            <h2>خط زمانی</h2>
            <ol className="challenge-timeline">
              <li>
                <i />
                <div>
                  <strong>ایجاد پیش‌نویس</strong>
                  <time>{formatDateTime(record.createdAt)}</time>
                </div>
              </li>
              {record.submittedAt && (
                <li>
                  <i />
                  <div>
                    <strong>ارسال برای بررسی</strong>
                    <time>{formatDateTime(record.submittedAt)}</time>
                  </div>
                </li>
              )}
            </ol>
          </section>
        </aside>
      </div>
    </ChallengeShell>
  );
}
