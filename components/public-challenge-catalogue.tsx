"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengePublicProjectionResource } from "@rahhal/contracts";

import { Icon } from "@/components/icons";
import { applicantTypeLabels, budgetStatusLabels, currencyLabels } from "@/domain/challenge";
import { listPublicChallenges } from "@/lib/challenges/adapters/network-public-challenges";
import {
  formatDateTime,
  formatMinorAmount,
  publicationStateLabels,
  tehranTimeLabel,
} from "@/lib/challenges/model";

function budgetLabel(challenge: ChallengePublicProjectionResource): string {
  if (challenge.budget.status !== "fixed" || challenge.budget.amount_minor === null) {
    return budgetStatusLabels[challenge.budget.status];
  }
  return `${formatMinorAmount(challenge.budget.amount_minor)} ${
    currencyLabels[challenge.budget.currency]
  }`;
}

function PublicChallengeCard({ challenge }: { challenge: ChallengePublicProjectionResource }) {
  const href = `/challenges/record/?id=${encodeURIComponent(challenge.challenge_id)}`;
  return (
    <article className="rh-challenge-card is-new" data-publication-state={challenge.state}>
      <section className="rh-challenge-card__primary" aria-label="مشخصات چالش">
        <header className="rh-challenge-card__status">
          {/* The listing only returns open calls today, but the pill still
              reads the record rather than asserting it — a hardcoded
              "accepting proposals" becomes a lie the moment the filter or a
              cached page disagrees. */}
          <span className="rh-active-pill">{publicationStateLabels[challenge.state]}</span>
        </header>
        <h2>
          <Link href={href}>{challenge.title}</Link>
        </h2>
        <p className="rh-challenge-card__summary">{challenge.public_summary}</p>
        <div className="rh-tag-row">
          <span>{challenge.category}</span>
          <span>{challenge.location}</span>
        </div>
      </section>
      <section className="rh-challenge-card__facts" aria-label="اطلاعات اجرایی چالش">
        <dl>
          <div>
            <dt>
              <Icon name="people" /> متقاضی مجاز
            </dt>
            <dd>
              {challenge.allowed_applicant_types
                .map((type) => applicantTypeLabels[type])
                .join("، ")}
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="decision" /> بودجه
            </dt>
            <dd>{budgetLabel(challenge)}</dd>
          </div>
          <div>
            <dt>
              <Icon name="history" /> مهلت
            </dt>
            <dd>
              {formatDateTime(challenge.proposal_deadline)} <small>{tehranTimeLabel}</small>
            </dd>
          </div>
        </dl>
      </section>
      <section className="rh-challenge-card__actions" aria-label="اقدام‌های چالش">
        <footer>
          <Link href={href}>مشاهده جزئیات</Link>
        </footer>
      </section>
    </article>
  );
}

/** Connected B5 catalogue. It renders only the public projection contract. */
export function PublicChallengeCatalogue() {
  const [items, setItems] = useState<readonly ChallengePublicProjectionResource[]>([]);
  const [category, setCategory] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  const load = useCallback(async (filter: string, cursor?: string) => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    const result = await listPublicChallenges({
      ...(filter ? { category: filter } : {}),
      ...(cursor ? { cursor } : {}),
    });
    if (generation !== requestGeneration.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
    setNextCursor(result.data.next_cursor);
  }, []);

  useEffect(() => {
    void load("");
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  return (
    <>
      <section className="rh-challenge-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href="/">خانه</Link>
            <span>/</span>
            <span>چالش‌ها</span>
          </nav>
          <h1>چالش‌ها و فرصت‌ها</h1>
          <p>فراخوان‌های منتشرشده را مستقیماً از سامانه بررسی کنید.</p>
          <span className="rh-demo-badge">داده‌های منتشرشده و متصل</span>
        </div>
      </section>

      <form
        className="rh-filter-card rh-public-catalogue-filter"
        aria-label="فیلتر چالش‌ها"
        onSubmit={(event) => {
          event.preventDefault();
          const nextCategory = category.trim();
          setItems([]);
          setActiveCategory(nextCategory);
          void load(nextCategory);
        }}
      >
        <div className="rh-filter-card__main">
          <label>
            <span>دسته‌بندی</span>
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="برای نمونه: energy"
            />
          </label>
        </div>
        <div className="rh-filter-card__secondary">
          <button type="submit">اعمال فیلتر</button>
          {activeCategory && (
            <button
              type="button"
              onClick={() => {
                setCategory("");
                setItems([]);
                setActiveCategory("");
                void load("");
              }}
            >
              پاک‌کردن فیلتر
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="challenge-inline-error" role="alert">
          {error}
          <button type="button" onClick={() => void load(activeCategory)}>
            تلاش دوباره
          </button>
        </div>
      )}

      <div className="rh-results-line">
        <div>
          <strong>{items.length.toLocaleString("fa-IR")} نتیجه دریافت‌شده</strong>
          <span>فقط فراخوان‌های باز و قابل کشف</span>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <section className="rh-empty" role="status">
          <h2>در حال دریافت فراخوان‌ها…</h2>
        </section>
      ) : !error && items.length === 0 ? (
        <section className="rh-empty">
          <Icon name="search" />
          <h2>فراخوان بازی پیدا نشد</h2>
          <p>دسته‌بندی را تغییر دهید یا بعداً دوباره بررسی کنید.</p>
        </section>
      ) : (
        <div className="rh-challenge-grid rh-public-challenge-grid">
          {items.map((challenge) => (
            <PublicChallengeCard key={challenge.challenge_id} challenge={challenge} />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="rh-public-catalogue-more">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(activeCategory, nextCursor)}
          >
            {loading ? "در حال دریافت…" : "نمایش موارد بیشتر"}
          </button>
        </div>
      )}
    </>
  );
}
