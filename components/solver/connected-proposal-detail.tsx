"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { useActiveWorkspaceName } from "@/components/solver/use-connected";
import { RecordId } from "@/components/solver/record-identity";
import { proposalHref } from "@/lib/workspace/proposal-navigation";
import { currencyLabels } from "@/domain/challenge";
import { formatMinorAmount } from "@/lib/challenges/model";
import { proposalStateLabels as labels } from "@/lib/workspace/proposal-labels";
import type { ProposalRecordView } from "@/lib/workspace/proposal-record";

const contentFields: readonly (readonly [string, keyof ProposalRecordContent])[] = [
  ["بیان مسئله", "problem_statement"],
  ["ارزش پیشنهادی", "value_proposition"],
  ["رویکرد فنی", "technical_approach"],
  ["معماری راهکار", "architecture"],
  ["معیارهای موفقیت", "success_metrics"],
  ["نقشه راه", "roadmap"],
  ["ریسک‌ها", "risks"],
  ["برنامه کاهش ریسک", "mitigation"],
  ["تیم اجرا", "team_summary"],
  ["تجربه مرتبط", "relevant_experience"],
  ["مبنای بودجه", "budget_rationale"],
];

type ProposalRecordContent = NonNullable<ProposalRecordView["proposal"]>["content"];

/**
 * The authoritative record for one proposal.
 *
 * Everything on this page comes from the server read for the active workspace.
 * A record the workspace cannot reach renders the same non-enumerating screen
 * whether it is foreign or absent, matching the API, which deliberately does
 * not distinguish them either.
 */
/** A typed number rendered in the digits the rest of the page uses. */
function persianDigits(value: string): string {
  const normalized = value.replace(/[\u06F0-\u06F9]/g, (digit) =>
    String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(digit)),
  );
  return /^\d+$/.test(normalized.trim())
    ? Number(normalized).toLocaleString("fa-IR", { useGrouping: false })
    : value;
}

export function ConnectedProposalDetail({ view }: { view: ProposalRecordView }) {
  const workspaceName = useActiveWorkspaceName();
  const proposal = view.proposal;
  if (!proposal)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>پیشنهاد پیدا نشد یا به این فضای کاری تعلق ندارد</h1>
        <p>{view.error?.message ?? "برای حفظ محرمانگی جزئیات بیشتری نمایش داده نمی‌شود."}</p>
        <Link href="/app/solver/proposals">بازگشت به فهرست</Link>
      </section>
    );
  const content = proposal.content;
  const versions = [...proposal.versions].sort((a, b) => a.version_number - b.version_number);
  // The label names the action the state actually offers. One fixed "اعمال
  // اصلاحات" sent a person answering a question and a person revising a version
  // to the same button under the same wrong name; the editor behind it has
  // always been state-aware, so only the invitation to it was misleading.
  const actionLabels: Partial<Record<typeof proposal.state, string>> = {
    clarification_requested: "پاسخ به شفاف‌سازی",
    revision_requested: "شروع نسخه اصلاح‌شده",
    revision_draft: "ادامه نسخه اصلاح‌شده",
  };
  const actionLabel = actionLabels[proposal.state];
  const openClarifications = proposal.clarifications.filter((item) => item.state === "requested");
  return (
    <>
      <header className="rh-profile-heading">
        <div>
          {/* The last crumb carries the tracking code once one is issued --
              the reference a human quotes -- and the record's state before
              that. It deliberately does not repeat the heading below it, and
              it never shows the opaque id, which says nothing and cannot be
              read aloud. */}
          <nav aria-label="مسیر صفحه">
            <Link href="/app/solver/proposals">پیشنهادها</Link>
            <span>/</span>
            <span>
              {proposal.tracking_code ? (
                <bdi dir="ltr">{proposal.tracking_code}</bdi>
              ) : (
                labels[proposal.state]
              )}
            </span>
          </nav>
          <h1>{content.title || view.challengeTitle || "پیش‌نویس بدون عنوان"}</h1>
          <p>
            {workspaceName ? `${workspaceName} · ` : ""}
            {labels[proposal.state]}
          </p>
        </div>
        <div className="rh-profile-actions">
          {actionLabel && (
            <Link
              className="rh-profile-primary"
              href={proposalHref(`/app/solver/proposals/${proposal.id}/edit`)}
            >
              {actionLabel}
            </Link>
          )}
        </div>
      </header>
      <section className="rh-summary-grid rh-summary-grid--three" aria-label="خلاصه پیشنهاد">
        <article className="rh-card">
          <div>
            <small>نسخه پرونده</small>
            <strong>نسخه {proposal.version.toLocaleString("fa-IR")}</strong>
            <RecordId value={proposal.id} label="شناسه پیشنهاد" />
          </div>
        </article>
        <article className="rh-card">
          <div>
            <small>وضعیت</small>
            <strong>{labels[proposal.state]}</strong>
          </div>
        </article>
        <article className="rh-card">
          <div>
            <small>کد پیگیری</small>
            <strong>
              {proposal.tracking_code ? (
                <bdi dir="ltr">{proposal.tracking_code}</bdi>
              ) : (
                "تا ارسال نهایی صادر نمی‌شود"
              )}
            </strong>
          </div>
        </article>
      </section>
      {openClarifications.length > 0 && (
        <section className="rh-card rh-solver-flow-card" aria-label="شفاف‌سازی‌های باز">
          <h2>پرسش‌های باز سازمان</h2>
          {openClarifications.map((clarification) => (
            <p key={clarification.id}>{clarification.question}</p>
          ))}
        </section>
      )}
      <section className="rh-card rh-solver-flow-card">
        <h2>محتوای نسخه جاری</h2>
        <p>
          این صفحه مستقیماً از نسخه {proposal.version.toLocaleString("fa-IR")} روی سرور خوانده شده
          است.
        </p>
        <dl>
          {contentFields.map(([label, field]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{String(content[field] ?? "") || "ثبت نشده"}</dd>
            </div>
          ))}
          <div>
            <dt>فناوری‌ها</dt>
            <dd>{content.technologies.join("، ") || "ثبت نشده"}</dd>
          </div>
          <div>
            <dt>بودجه درخواستی</dt>
            <dd>
              {content.budget_amount_minor === null
                ? "ثبت نشده"
                : `${formatMinorAmount(content.budget_amount_minor)} ${currencyLabels[content.budget_currency]}`}
            </dd>
          </div>
          <div>
            <dt>زمان اجرا</dt>
            <dd>
              {content.duration_weeks
                ? // The stored value is the string a person typed, so it reaches
                  // this page in whatever digits they used. Every other number
                  // on the page is Persian; a Latin `16` beside `نسخه ۵` reads
                  // as a different alphabet in the same sentence.
                  `${persianDigits(content.duration_weeks)} هفته`
                : "ثبت نشده"}
            </dd>
          </div>
          <div>
            <dt>فایل‌ها</dt>
            <dd>
              {content.attachment_ids.length
                ? content.attachment_ids.map((id) => (
                    <bdi dir="ltr" key={id}>
                      {id}{" "}
                    </bdi>
                  ))
                : "فایلی ثبت نشده است"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rh-card rh-membership-list">
        <header>
          <div>
            <h2>تاریخچه نسخه‌ها</h2>
            <p>{versions.length.toLocaleString("fa-IR")} نسخه ثبت‌شده</p>
          </div>
        </header>
        {versions.map((version) => (
          <article key={version.id}>
            <div>
              <h3>
                نسخه {version.version_number.toLocaleString("fa-IR")}{" "}
                {version.locked ? "· قفل‌شده" : ""}
              </h3>
              <p>
                {version.changed_fields.length
                  ? `تغییر در ${version.changed_fields.length.toLocaleString("fa-IR")} بخش`
                  : "نسخه پایه"}
              </p>
              <RecordId value={version.id} label="شناسه نسخه" />
            </div>
            <time dateTime={version.created_at}>
              {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(version.created_at),
              )}
            </time>
          </article>
        ))}
      </section>
    </>
  );
}
