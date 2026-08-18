"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { PageHeading, Toast, readSolverListParams } from "@/components/solver-profile/shared";
import { useSolverContext, type SolverSpace } from "@/components/solver-shell";
import { challenges } from "@/data/mock";
import { getChallengePublisher } from "@/data/challenge-publishers";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules } from "@/lib/solver/eligibility";
import {
  isOpportunitySaved,
  SAVED_OPPORTUNITIES_EVENT,
  setOpportunitySaved,
} from "@/lib/solver/saved-opportunities";

export function SavedPage({ space }: { space: SolverSpace }) {
  const context = useSolverContext();
  const [saved, setSaved] = useState<string[]>([]);
  const initialParams = readSolverListParams();
  const [query, setQuery] = useState(initialParams.get("q") ?? "");
  const [industry, setIndustry] = useState(initialParams.get("industry") ?? "همه");
  const [sort, setSort] = useState<"deadline" | "newest">(
    initialParams.get("sort") === "newest" ? "newest" : "deadline",
  );
  const [toast, setToast] = useState("");
  useEffect(() => {
    const sync = () =>
      setSaved(
        challenges
          .filter((challenge) => isOpportunitySaved(challenge.id, false, context.workspaceId))
          .map((challenge) => challenge.id),
      );
    sync();
    window.addEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
    return () => window.removeEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
  }, [context.workspaceId]);
  useEffect(() => {
    const syncFromLocation = () => {
      const params = readSolverListParams();
      setQuery(params.get("q") ?? "");
      setIndustry(params.get("industry") ?? "همه");
      setSort(params.get("sort") === "newest" ? "newest" : "deadline");
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = buildSolverHref("/app/solver/saved", context, {
      q: query || undefined,
      industry: industry === "همه" ? undefined : industry,
      sort: sort === "deadline" ? undefined : sort,
    });
    if (document.documentElement.dataset.challengeStandalone === "true")
      window.history.replaceState({}, "", `#${next}`);
    else window.history.replaceState({}, "", next);
  }, [context, industry, query, sort]);
  const visible = [...challenges]
    .filter(
      (challenge) =>
        saved.includes(challenge.id) &&
        (industry === "همه" || challenge.industry === industry) &&
        `${challenge.title} ${getChallengePublisher(challenge.id).name}`.includes(query.trim()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.id.localeCompare(a.id)
        : new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );
  return (
    <>
      <PageHeading
        title="فرصت‌های ذخیره‌شده"
        description={`چالش‌هایی که برای بررسی و اقدام بعدی در فضای ${space === "team" ? "تیمی" : "شخصی"} ذخیره کرده‌اید.`}
      />
      <div className="rh-saved-count">
        <Icon name="history" />
        <strong>{saved.length.toLocaleString("fa-IR")}</strong> فرصت ذخیره‌شده
      </div>
      <section className="rh-card rh-saved-filter">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجو</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو در فرصت‌های ذخیره‌شده"
          />
        </label>
        <select
          aria-label="دسته‌بندی"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        >
          <option>همه</option>
          <option>انرژی و آب</option>
          <option>ساخت‌وتولید</option>
          <option>صنایع غذایی</option>
        </select>
        <button
          type="button"
          className="rh-profile-outline"
          onClick={() => {
            setQuery("");
            setIndustry("همه");
            setSort("deadline");
          }}
        >
          <Icon name="filter" /> پاک‌کردن فیلترها
        </button>
      </section>
      <div className="rh-saved-toolbar">
        <span>{visible.length.toLocaleString("fa-IR")} نتیجه</span>
        <label>
          مرتب‌سازی{" "}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="deadline">نزدیک‌ترین مهلت</option>
            <option value="newest">جدیدترین شناسه</option>
          </select>
        </label>
      </div>
      <section className="rh-saved-grid">
        {visible.map((challenge) => {
          const rule = challengeEligibilityRules[challenge.id];
          const days = Math.max(
            0,
            Math.ceil((new Date(challenge.deadline).getTime() - Date.now()) / 86_400_000),
          );
          return (
            <article className="rh-card" key={challenge.id}>
              <button
                className="rh-save-toggle is-saved"
                onClick={() => {
                  setOpportunitySaved(challenge.id, false, context.workspaceId);
                  setSaved((items) => items.filter((id) => id !== challenge.id));
                  setToast("فرصت از ذخیره‌شده‌ها حذف شد.");
                }}
                aria-label={`حذف ${challenge.title} از ذخیره‌شده‌ها`}
              >
                <Icon name="history" />
              </button>
              <div className="rh-saved-org">
                <ChallengeOrganizationLogo challengeId={challenge.id} size="small" />
                <div>
                  <strong>{getChallengePublisher(challenge.id).name}</strong>
                  <small>{challenge.industry}</small>
                </div>
              </div>
              <span className="rh-saved-category">{challenge.tags[0]}</span>
              <h2>{challenge.title}</h2>
              <div className="rh-tag-row">
                {challenge.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <dl>
                <div>
                  <dt>متقاضی مجاز</dt>
                  <dd>
                    {rule
                      ? rule.allowedApplicantTypes
                          .map((item) =>
                            item === "individual"
                              ? "فرد"
                              : item === "expert-team"
                                ? "تیم تخصصی"
                                : item === "lab"
                                  ? "آزمایشگاه"
                                  : item === "academic-group"
                                    ? "گروه دانشگاهی"
                                    : "شرکت",
                          )
                          .join("، ")
                      : "نیازمند بررسی"}
                  </dd>
                </div>
                <div>
                  <dt>بودجه</dt>
                  <dd>
                    {Math.round(challenge.budget / 1_000_000).toLocaleString("fa-IR")} میلیون تومان
                  </dd>
                </div>
                <div>
                  <dt>مهلت</dt>
                  <dd className={days <= 7 ? "is-warning" : ""}>
                    {days.toLocaleString("fa-IR")} روز تا پایان
                  </dd>
                </div>
              </dl>
              <Link href={buildSolverHref(`/app/solver/opportunities/${challenge.slug}`, context)}>
                مشاهده فرصت
              </Link>
            </article>
          );
        })}
      </section>
      {!visible.length && (
        <section className="rh-card rh-profile-empty">
          <Icon name="history" />
          <h2>فرصت ذخیره‌شده‌ای با این فیلتر وجود ندارد</h2>
          <p>می‌توانید فیلترها را پاک کنید یا فرصت‌های تازه را ببینید.</p>
          <Link href={buildSolverHref("/app/solver/opportunities", context)}>مشاهده فرصت‌ها</Link>
        </section>
      )}
      <Toast message={toast} />
    </>
  );
}
