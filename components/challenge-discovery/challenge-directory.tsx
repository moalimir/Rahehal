"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { ChallengeCard } from "@/components/challenge-discovery/challenge-card";
import {
  allowedApplicantOptions,
  buildChallengeItems,
  budgetLabel,
  categoryLabels,
  challengeItems,
  normalizeFa,
  readParams,
  scenarioLabels,
  type CategoryKey,
  type ChallengeLayout,
  type Scenario,
  type AllowedApplicant,
} from "@/components/challenge-discovery/catalog";
import { listCatalogChallenges } from "@/lib/challenges/public-catalog";
import { isOpportunitySaved, SAVED_OPPORTUNITIES_EVENT } from "@/lib/solver/saved-opportunities";
import { readChallengeLayout, writeChallengeLayout } from "@/lib/solver/ui-preferences";

export function ChallengeDirectory({
  basePath,
  contextQuery,
  workspaceId,
}: {
  basePath: string;
  contextQuery: string;
  workspaceId: string;
}) {
  const initial = readParams();
  const teamSpace = new URLSearchParams(contextQuery.replace(/^\?/, "")).get("space") === "team";
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [category, setCategory] = useState(initial.get("category") ?? "");
  const [scenario, setScenario] = useState(initial.get("scenario") ?? "");
  const [applicant, setApplicant] = useState(initial.get("applicant") ?? "");
  const [sort, setSort] = useState(initial.get("sort") ?? "newest");
  const [view, setView] = useState(initial.get("view") ?? "all");
  const [layout, setLayout] = useState<ChallengeLayout>(() => {
    const requested = initial.get("layout");
    if (requested === "list") return "list";
    return readChallengeLayout();
  });
  const [compareIds, setCompareIds] = useState<string[]>(
    (initial.get("compare") ?? "").split(",").filter(Boolean),
  );
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [items, setItems] = useState(challengeItems);
  const [compareNotice, setCompareNotice] = useState("");

  useEffect(() => {
    const syncFromLocation = () => {
      const params = readParams();
      setQuery(params.get("q") ?? "");
      setCategory(params.get("category") ?? "");
      setScenario(params.get("scenario") ?? "");
      setApplicant(params.get("applicant") ?? "");
      setSort(params.get("sort") ?? "newest");
      setView(params.get("view") ?? "all");
      setLayout(params.get("layout") === "list" ? "list" : "grid");
      setCompareIds((params.get("compare") ?? "").split(",").filter(Boolean));
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);

  useEffect(() => {
    const refreshCatalog = () =>
      setItems(buildChallengeItems(listCatalogChallenges(), workspaceId));
    refreshCatalog();
    window.addEventListener("storage", refreshCatalog);
    window.addEventListener("rahhal:challenges", refreshCatalog);
    return () => {
      window.removeEventListener("storage", refreshCatalog);
      window.removeEventListener("rahhal:challenges", refreshCatalog);
    };
  }, [workspaceId]);

  useEffect(() => {
    const sync = () =>
      setSavedIds(
        items
          .filter((challenge) =>
            isOpportunitySaved(challenge.id, challenge.scenario === "saved", workspaceId),
          )
          .map((challenge) => challenge.id),
      );
    sync();
    window.addEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
    return () => window.removeEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
  }, [items, workspaceId]);

  useEffect(() => {
    const params = new URLSearchParams(contextQuery.replace(/^\?/, ""));
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (scenario) params.set("scenario", scenario);
    if (applicant) params.set("applicant", applicant);
    if (sort !== "newest") params.set("sort", sort);
    if (view !== "all") params.set("view", view);
    if (layout !== "grid") params.set("layout", layout);
    if (compareIds.length) params.set("compare", compareIds.join(","));
    const search = params.toString();
    const directoryPath = `${basePath.replace(/\/$/, "")}/`;
    if (document.documentElement.dataset.challengeStandalone === "true") {
      const next = `#${directoryPath}${search ? `?${search}` : ""}`;
      if (window.location.hash !== next) window.history.replaceState({}, "", next);
    } else {
      const next = `${directoryPath}${search ? `?${search}` : ""}`;
      if (`${window.location.pathname}${window.location.search}` !== next) {
        window.history.replaceState({}, "", next);
      }
    }
  }, [
    applicant,
    basePath,
    category,
    compareIds,
    contextQuery,
    layout,
    query,
    scenario,
    sort,
    view,
  ]);

  useEffect(() => {
    writeChallengeLayout(layout);
  }, [layout]);

  const filtered = useMemo(() => {
    const needle = normalizeFa(query);
    return items
      .filter((challenge) => {
        const haystack = normalizeFa(
          `${challenge.title} ${challenge.publisher.name} ${challenge.industry} ${challenge.tags.join(" ")} ${challenge.id}`,
        );
        return (
          (!needle || haystack.includes(needle)) &&
          (!category || challenge.category === category) &&
          (!scenario || challenge.scenario === scenario) &&
          (!applicant || challenge.applicants.includes(applicant as AllowedApplicant)) &&
          (view !== "saved" || savedIds.includes(challenge.id))
        );
      })
      .sort((left, right) => {
        if (sort === "deadline") return left.deadline.localeCompare(right.deadline);
        if (sort === "evidence") return right.evidenceReasons.length - left.evidenceReasons.length;
        return right.publishedOrder - left.publishedOrder;
      });
  }, [applicant, category, items, query, savedIds, scenario, sort, view]);

  const hasFilters = Boolean(query || category || scenario || applicant || view !== "all");
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setScenario("");
    setApplicant("");
    setView("all");
    setSort("newest");
  };
  const compared = compareIds
    .map((id) => items.find((challenge) => challenge.id === id))
    .filter(Boolean) as typeof items;

  return (
    <>
      <section className="rh-challenge-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href={`/app/solver/dashboard${contextQuery}`}>داشبورد</Link>
            <span>/</span>
            <span>چالش‌ها</span>
          </nav>
          <h1 aria-label="کشف چالش‌های واقعی">چالش‌ها و فرصت‌ها</h1>
          <p>مسئله‌ای متناسب با تخصص و توانمندی خود پیدا کنید.</p>
          <span className="rh-demo-badge">داده‌های نسخهٔ نمایشی</span>
        </div>
        <Link href={`/app/solver/dashboard${contextQuery}`}>
          {teamSpace ? "فضای تیمی" : "فضای شخصی"} <Icon name="people" />
        </Link>
      </section>

      <section className="rh-filter-card" aria-label="جست‌وجو و فیلتر چالش‌ها">
        <div className="rh-filter-card__main">
          <label className="rh-search">
            <Icon name="search" />
            <span>جست‌وجو</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="عنوان، خلاصه، دسته‌بندی یا شناسه"
            />
          </label>
          <label>
            <span>متقاضی مجاز</span>
            <select value={applicant} onChange={(event) => setApplicant(event.target.value)}>
              <option value="">همه متقاضیان</option>
              {allowedApplicantOptions.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>دسته‌بندی</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">همه دسته‌ها</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>وضعیت من</span>
            <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(scenarioLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rh-filter-card__secondary">
          <label>
            <span>مرتب‌سازی:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">جدیدترین</option>
              <option value="deadline">نزدیک‌ترین مهلت</option>
              <option value="evidence">مرتبط‌ترین شواهد</option>
            </select>
          </label>
          <div className="rh-filter-tabs" role="group" aria-label="نمایش چالش‌ها">
            <button
              type="button"
              className={view === "all" ? "is-active" : ""}
              onClick={() => setView("all")}
            >
              همه
            </button>
            <button
              type="button"
              className={view === "saved" ? "is-active" : ""}
              onClick={() => setView("saved")}
            >
              ذخیره‌شده‌ها
            </button>
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} aria-label="حذف همه فیلترهای انتخاب‌شده">
              پاک‌کردن همه
            </button>
          )}
        </div>
      </section>

      {hasFilters && (
        <div className="rh-active-filters" aria-label="فیلترهای فعال">
          <strong>فیلترهای فعال:</strong>
          {query && <span>جست‌وجو: {query}</span>}
          {category && <span>{categoryLabels[category as CategoryKey]}</span>}
          {scenario && <span>{scenarioLabels[scenario as Scenario]}</span>}
          {applicant && <span>متقاضی مجاز: {applicant}</span>}
          {view === "saved" && <span>ذخیره‌شده‌ها</span>}
          <button type="button" onClick={clearFilters}>
            پاک‌کردن فیلترها
          </button>
        </div>
      )}

      <div className="rh-results-line">
        <div>
          <strong>{filtered.length.toLocaleString("fa-IR")} نتیجه</strong>
          <span>فرصت‌های متناسب با فضای فعال شما</span>
        </div>
        <div aria-label="تغییر نوع نمایش">
          <button
            type="button"
            className={layout === "grid" ? "is-active" : ""}
            aria-label="نمایش شبکه‌ای"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <Icon name="grid" />
          </button>
          <button
            type="button"
            className={layout === "list" ? "is-active" : ""}
            aria-label="نمایش فهرستی"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>

      {filtered.length ? (
        <div className={`rh-challenge-grid rh-challenge-grid--${layout}`} data-layout={layout}>
          {filtered.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              layout={layout}
              basePath={basePath}
              contextQuery={contextQuery}
              workspaceId={workspaceId}
              saved={savedIds.includes(challenge.id)}
              onSavedChange={(next) =>
                setSavedIds((current) =>
                  next
                    ? [...new Set([...current, challenge.id])]
                    : current.filter((id) => id !== challenge.id),
                )
              }
              compared={compareIds.includes(challenge.id)}
              onCompare={(checked) =>
                setCompareIds((current) =>
                  checked
                    ? current.length >= 3
                      ? (setCompareNotice(
                          "حداکثر سه فرصت را می‌توانید مقایسه کنید؛ موردی حذف نشد.",
                        ),
                        current)
                      : [...current, challenge.id]
                    : current.filter((id) => id !== challenge.id),
                )
              }
            />
          ))}
        </div>
      ) : (
        <section className="rh-empty">
          <Icon name="search" />
          <h2>چالشی با این فیلترها پیدا نشد</h2>
          <p>فیلترها را تغییر دهید یا همه را پاک کنید.</p>
          <button type="button" onClick={clearFilters}>
            پاک‌کردن فیلترها
          </button>
        </section>
      )}

      {compared.length > 0 && (
        <section className="rh-compare" aria-labelledby="compare-title">
          <header>
            <div>
              <h2 id="compare-title">مقایسه چالش‌ها</h2>
              <p>حداکثر سه فرصت را کنار هم بررسی کنید.</p>
            </div>
            <button type="button" onClick={() => setCompareIds([])}>
              بستن مقایسه
            </button>
          </header>
          <div>
            {compared.map((challenge) => (
              <article key={challenge.id}>
                <div className="rh-compare__publisher">
                  <OrganizationLogo organization={challenge.publisher} size="small" />
                  <span>{challenge.publisher.name}</span>
                </div>
                <strong>{challenge.title}</strong>
                <span>{categoryLabels[challenge.category]}</span>
                <span>{budgetLabel(challenge.budget)}</span>
                <span>{challenge.evidenceReasons[0]}</span>
                <Link href={`${basePath}/${challenge.slug}${contextQuery}`}>مشاهده جزئیات</Link>
              </article>
            ))}
          </div>
        </section>
      )}
      {compareNotice && (
        <div className="rh-flow-toast" role="status">
          <Icon name="notification" />
          <span>{compareNotice}</span>
          <button type="button" onClick={() => setCompareNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
