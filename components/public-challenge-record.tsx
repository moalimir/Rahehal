"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChallengePublicProjectionResource } from "@rahhal/contracts";
import { SiteHeader } from "@/components/site-header";
import { PublicFooter } from "@/components/site-footer";
import {
  applicantTypeLabels,
  budgetStatusLabels,
  currencyLabels,
  ipTermLabels,
  outputTypeLabels,
  sourcingModelLabels,
  workModeLabels,
} from "@/domain/challenge";
import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import {
  formatDateTime,
  formatMinorAmount,
  publicationStateLabels,
  tehranTimeLabel,
} from "@/lib/challenges/model";

/**
 * The public face of a published challenge, rendered strictly from B5's
 * projection. Every field shown here is on `challengePublicProjectionFields`;
 * there is deliberately no publisher block, match score or collaboration
 * route, because the projection does not carry them and inventing them is what
 * the fixture-backed discovery view already does wrong.
 */
export function PublicChallengeRecord({ id }: { id: string }) {
  const [record, setRecord] = useState<ChallengePublicProjectionResource | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void readPublicChallenge(id).then((result) => {
      if (!active) return;
      if (result.ok) setRecord(result.data);
      else setUnavailable(true);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (unavailable) {
    return (
      <section className="rh-empty">
        <h1>این فراخوان در دسترس نیست</h1>
        {/* Unknown, unpublished, invitation-only and NDA challenges are one
            answer. The server's own message is not echoed here: it is written
            for an authenticated workspace ("not available in the active
            workspace"), which is both wrong on a public page and a needless
            second channel that could start distinguishing these cases. */}
        <p>ممکن است این فراخوان حذف شده، هنوز منتشر نشده یا عمومی نباشد.</p>
        <Link className="button button--secondary button--sm" href="/challenges">
          بازگشت به فهرست چالش‌ها
        </Link>
      </section>
    );
  }
  if (!record) {
    return (
      <section className="rh-empty" role="status">
        <p>در حال دریافت فراخوان…</p>
      </section>
    );
  }

  // A paused, closed or cancelled call still resolves by direct link — that is
  // the whole reason B6 keeps the projection row. Saying "published" for all
  // four states hands a solver a call they cannot actually apply to.
  const accepting = record.state === "open";

  return (
    <article data-public-challenge={record.challenge_id} data-publication-state={record.state}>
      <section className="rh-challenge-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href="/challenges">چالش‌ها</Link>
            <span>/</span>
            <span>جزئیات فراخوان</span>
          </nav>
          <h1>{record.title}</h1>
          <p>{record.public_summary}</p>
          <span className="rh-demo-badge">{publicationStateLabels[record.state]}</span>
          {!accepting && (
            <p className="rh-challenge-closed-note" role="status">
              این فراخوان در حال حاضر پیشنهاد تازه نمی‌پذیرد.
            </p>
          )}
        </div>
      </section>
      <dl className="challenge-record-bar">
        <div>
          <dt>دسته‌بندی</dt>
          <dd>{record.category}</dd>
        </div>
        <div>
          <dt>محل</dt>
          <dd>{record.location}</dd>
        </div>
        <div>
          <dt>مهلت ارسال پیشنهاد</dt>
          <dd>
            {formatDateTime(record.proposal_deadline)} <small>{tehranTimeLabel}</small>
          </dd>
        </div>
        <div>
          <dt>مشارکت‌کنندگان مجاز</dt>
          <dd>
            {record.allowed_applicant_types.map((type) => applicantTypeLabels[type]).join("، ")}
          </dd>
        </div>
      </dl>
      <section className="challenge-preview-document" aria-labelledby="public-call-terms">
        <h2 id="public-call-terms">شرایط فراخوان</h2>
        <dl className="challenge-definition-list challenge-definition-list--compact">
          <div>
            <dt>سازمان منتشرکننده</dt>
            <dd>نام سازمان در سطح نمایش عمومی این نسخه افشا نشده است.</dd>
          </div>
          <div>
            <dt>خروجی مورد انتظار</dt>
            <dd>{outputTypeLabels[record.output_type]}</dd>
          </div>
          <div>
            <dt>شیوه جذب</dt>
            <dd>{sourcingModelLabels[record.sourcing_model]}</dd>
          </div>
          <div>
            <dt>شیوه انجام</dt>
            <dd>{workModeLabels[record.work_mode]}</dd>
          </div>
          <div>
            <dt>بودجه</dt>
            <dd>
              {record.budget.status === "fixed" && record.budget.amount_minor !== null
                ? `${formatMinorAmount(record.budget.amount_minor)} ${currencyLabels[record.budget.currency]}`
                : budgetStatusLabels[record.budget.status]}
            </dd>
          </div>
          <div>
            <dt>شروع ترجیحی</dt>
            <dd>
              {record.preferred_start_date
                ? `${formatDateTime(record.preferred_start_date)} ${tehranTimeLabel}`
                : "تعیین نشده"}
            </dd>
          </div>
          <div>
            <dt>احراز هویت</dt>
            <dd>{record.verification_required ? "الزامی" : "الزامی نیست"}</dd>
          </div>
          <div>
            <dt>توافق محرمانگی</dt>
            <dd>{record.nda_required ? "پیش از ادامه الزامی است" : "الزامی نیست"}</dd>
          </div>
          <div>
            <dt>مدارک صلاحیت</dt>
            <dd>{record.document_gate_required ? "الزامی" : "الزامی نیست"}</dd>
          </div>
          <div>
            <dt>مالکیت فکری</dt>
            <dd>{ipTermLabels[record.ip_terms]}</dd>
          </div>
          <div>
            <dt>فرایند ارزیابی</dt>
            <dd>بررسی شرایط مشارکت و سپس ارزیابی نسخه ثبت‌شده پیشنهاد.</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

const serverChallengeId = /^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

/**
 * Resolves `?id=` on mount. The static export cannot know the id at build
 * time, so the route is pre-generated without one and the client supplies it —
 * the same shape the connected org record path uses.
 */
export function PublicChallengeRecordRoute() {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("id") ?? "";
    setId(serverChallengeId.test(value) ? value : "");
  }, []);

  return (
    <div className="public-challenge-shell">
      <SiteHeader />
      <main id="main-content" className="public-challenge-main">
        {id === null ? (
          <section className="rh-empty" role="status">
            <p>در حال آماده‌سازی فراخوان…</p>
          </section>
        ) : !id ? (
          <section className="rh-empty">
            <h1>این فراخوان در دسترس نیست</h1>
            <p>نشانی فراخوان معتبر نیست.</p>
            <Link className="button button--secondary button--sm" href="/challenges">
              بازگشت به فهرست چالش‌ها
            </Link>
          </section>
        ) : (
          <PublicChallengeRecord id={id} />
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
