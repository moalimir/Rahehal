"use client";

import Link from "next/link";
import { ChallengeShell, NotFoundState, StatusBadge } from "@/components/challenge-flow/shell";
import { useChallengeRecord } from "@/components/challenge-flow/hooks";
import { formatDateTime } from "@/lib/challenges/storage";

export function ChallengeSubmittedPage({ id }: { id: string }) {
  const { record } = useChallengeRecord(id);
  if (record === undefined)
    return (
      <ChallengeShell title="رسید ارسال">
        <div className="challenge-loading-state">در حال خواندن رسید…</div>
      </ChallengeShell>
    );
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
      description="نسخه ثبت‌شده پرونده در این مرورگر نگهداری می‌شود."
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
      </section>
    </ChallengeShell>
  );
}
