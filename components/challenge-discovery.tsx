"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import {
  SolverWorkspaceShell,
  useSolverContext,
  useSolverSpace,
  type SolverSpace,
} from "@/components/solver-shell";
import { SiteHeader } from "@/components/site-header";
import { PublicFooter } from "@/components/site-footer";
import { getOrganization } from "@/data/organization-registry";
import { challenges } from "@/data/mock";
import { listCatalogChallenges } from "@/lib/challenges/public-catalog";
import {
  isOpportunitySaved,
  SAVED_OPPORTUNITIES_EVENT,
  setOpportunitySaved,
} from "@/lib/solver/saved-opportunities";
import { readChallengeLayout, writeChallengeLayout } from "@/lib/solver/ui-preferences";
import { buildSolverHref } from "@/lib/solver/context";
import type { ActiveWorkspace } from "@/domain/solver";
import {
  challengeEligibilityRules,
  evaluateEligibility,
} from "@/lib/solver/eligibility";
import {
  activeWorkspaces,
  canAccessRestrictedDocument,
  proposalsForWorkspace,
  readSolverState,
} from "@/lib/solver/repository";

type CategoryKey = "energy-environment" | "manufacturing" | "food-health";
type Scenario = "new" | "saved" | "draft" | "submitted" | "review" | "revision" | "closed";
type ChallengeLayout = "grid" | "list";
type AllowedApplicant =
  | "فرد مستقل"
  | "شرکت رسمی"
  | "تیم مستقل"
  | "تیم دانشگاهی مستقل"
  | "تیم دانشگاه تحت نظر استاد";

const categoryLabels: Record<CategoryKey, string> = {
  "energy-environment": "آب، انرژی و محیط‌زیست",
  manufacturing: "ساخت و تولید",
  "food-health": "غذا، سلامت و زیست‌فناوری",
};

const scenarioLabels: Record<Scenario, string> = {
  new: "جدید برای شما",
  saved: "ذخیره‌شده",
  draft: "پیش‌نویس راه‌حل",
  submitted: "راه‌حل ارسال شده",
  review: "در حال بررسی",
  revision: "نیازمند اصلاح",
  closed: "پایان‌یافته",
};

const allowedApplicantOptions: AllowedApplicant[] = [
  "فرد مستقل",
  "شرکت رسمی",
  "تیم مستقل",
  "تیم دانشگاهی مستقل",
  "تیم دانشگاه تحت نظر استاد",
];

const applicantLabel = {
  individual: "فرد مستقل",
  company: "شرکت رسمی",
  "expert-team": "تیم مستقل",
  lab: "تیم دانشگاهی مستقل",
  "academic-group": "تیم دانشگاه تحت نظر استاد",
} as const;

function categoryFor(industry: string): CategoryKey {
  if (industry === "ساخت‌وتولید") return "manufacturing";
  if (industry === "صنایع غذایی") return "food-health";
  return "energy-environment";
}

function scenarioFor(challengeId: string, deadline: string, workspaceId?: string): Scenario {
  if (new Date(deadline).getTime() <= Date.now()) return "closed";
  if (!workspaceId) return "new";
  const state = readSolverState();
  const proposal = proposalsForWorkspace(workspaceId, state).find(
    (candidate) => candidate.challengeId === challengeId,
  );
  if (proposal) {
    if (proposal.state === "draft") return "draft";
    if (proposal.state === "revision_requested" || proposal.state === "revision_draft")
      return "revision";
    if (
      proposal.state === "reviewing" ||
      proposal.state === "eligibility_review" ||
      proposal.state === "eligible"
    )
      return "review";
    return "submitted";
  }
  if (
    state.proposalDrafts.some(
      (draft) => draft.ownerWorkspaceId === workspaceId && draft.challengeId === challengeId,
    )
  )
    return "draft";
  if ((state.savedByWorkspace[workspaceId] ?? []).includes(challengeId)) return "saved";
  return "new";
}

function buildChallengeItems(catalog = challenges, workspaceId?: string) {
  return catalog.map((challenge, index) => {
    const publisher = getOrganization(challenge.organizationId);
    const rule = challengeEligibilityRules[challenge.id];
    const applicants = rule
      ? rule.allowedApplicantTypes.map((type) => applicantLabel[type])
      : (["فرد مستقل", "تیم مستقل"] as AllowedApplicant[]);
    return {
      ...challenge,
      category: categoryFor(challenge.industry),
      scenario: scenarioFor(challenge.id, challenge.deadline, workspaceId),
      applicants,
      remote: challenge.route !== "خرید پژوهش",
      publisher,
      summary: `طراحی یک راهکار قابل اجرا برای ${challenge.title} با تمرکز بر سنجش‌پذیری، ایمنی و امکان پایلوت در محیط واقعی.`,
      publishedOrder: 100 - index,
      evidenceReasons: [
        challenge.tags.length ? `حوزه مرتبط: ${challenge.tags[0]}` : "حوزه تخصص نیازمند بررسی",
        challenge.route.includes("پایلوت") ? "امکان اجرای پایلوت" : "مدل همکاری مشخص",
        challenge.visibility === "عمومی" ? "اطلاعات عمومی قابل بررسی" : "نیازمند بررسی دسترسی",
      ],
    };
  });
}

const challengeItems = buildChallengeItems();

export const challengeDiscoveryPaths = challengeItems.flatMap((challenge) => [
  `/challenges/${challenge.slug}`,
  `/challenges/${challenge.id}`,
]);

function normalizeFa(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase("fa-IR")
    .trim();
}

function readParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  if (document.documentElement.dataset.challengeStandalone === "true") {
    return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  }
  return new URLSearchParams(window.location.search);
}

function daysRemaining(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

function budgetLabel(value: number) {
  const millions = Math.round(value / 1_000_000);
  return `${millions.toLocaleString("fa-IR")} میلیون تومان`;
}

function ScenarioBadge({ scenario }: { scenario: Scenario }) {
  return <span className={`rh-scenario rh-scenario--${scenario}`}>{scenarioLabels[scenario]}</span>;
}

function ChallengeCard({
  challenge,
  layout,
  compared,
  onCompare,
  saved,
  onSavedChange,
  basePath,
  contextQuery,
  workspaceId,
}: {
  challenge: (typeof challengeItems)[number];
  layout: ChallengeLayout;
  compared: boolean;
  onCompare: (checked: boolean) => void;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  basePath: string;
  contextQuery: string;
  workspaceId: string;
}) {
  const toggleSaved = () => {
    const next = !saved;
    setOpportunitySaved(challenge.id, next, workspaceId);
    onSavedChange(next);
  };

  return (
    <article className={`rh-challenge-card rh-challenge-card--${layout} is-${challenge.scenario}`}>
      <section className="rh-challenge-card__primary" aria-label="مشخصات چالش">
        <div className="rh-challenge-identity">
          <OrganizationLogo organization={challenge.publisher} />
          <div>
            <Link href={`/organizations/${challenge.publisher.slug}`}>
              {challenge.publisher.name}
            </Link>
            <span>{challenge.publisher.industry}</span>
          </div>
        </div>
        <h2>
          <Link href={`${basePath}/${challenge.slug}${contextQuery}`}>{challenge.title}</Link>
        </h2>
        <p className="rh-challenge-card__summary">{challenge.industry}</p>
        <div className="rh-tag-row">
          {challenge.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>
      <section className="rh-challenge-card__facts" aria-label="اطلاعات اجرایی چالش">
        <dl>
          <div>
            <dt>
              <Icon name="people" /> متقاضی مجاز
            </dt>
            <dd>{challenge.applicants.join("، ")}</dd>
          </div>
          <div>
            <dt>
              <Icon name="decision" /> بودجه
            </dt>
            <dd>{budgetLabel(challenge.budget)}</dd>
          </div>
          <div>
            <dt>
              <Icon name="history" /> مهلت
            </dt>
            <dd>
              {challenge.scenario === "closed"
                ? "پایان‌یافته"
                : `${daysRemaining(challenge.deadline).toLocaleString("fa-IR")} روز`}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rh-challenge-card__actions" aria-label="وضعیت و اقدام‌های چالش">
        <header className="rh-challenge-card__status">
          <span className="rh-active-pill">
            {challenge.scenario === "closed" ? "بسته" : "فعال"}
          </span>
          <button
            type="button"
            className={saved ? "is-saved" : ""}
            onClick={toggleSaved}
            aria-pressed={saved}
            aria-label={
              saved ? `حذف ${challenge.title} از ذخیره‌شده‌ها` : `ذخیره ${challenge.title}`
            }
          >
            <Icon name="history" />
          </button>
        </header>
        <ScenarioBadge
          scenario={saved && challenge.scenario === "new" ? "saved" : challenge.scenario}
        />
        <p className="rh-match-note">
          {challenge.scenario === "new"
            ? "اولین‌بار است این فرصت را می‌بینید"
            : challenge.scenario === "submitted"
              ? "نسخه ارسال‌شده شما قابل پیگیری است"
              : challenge.scenario === "revision"
                ? "سازمان توضیح تکمیلی درخواست کرده است"
                : challenge.evidenceReasons[0]}
        </p>
        <footer>
          <label>
            <input
              type="checkbox"
              checked={compared}
              onChange={(event) => onCompare(event.target.checked)}
            />{" "}
            <span>مقایسه</span>
          </label>
          <Link href={`${basePath}/${challenge.slug}${contextQuery}`}>مشاهده جزئیات</Link>
        </footer>
      </section>
    </article>
  );
}

function ChallengeDirectory({
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
        if (sort === "evidence")
          return right.evidenceReasons.length - left.evidenceReasons.length;
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
                      ? (setCompareNotice("حداکثر سه فرصت را می‌توانید مقایسه کنید؛ موردی حذف نشد."), current)
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

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: "brief" | "decision" | "shield" | "download" | "history";
  children: React.ReactNode;
}) {
  return (
    <section className="rh-detail-section">
      <header>
        <Icon name={icon} />
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function ChallengeDetail({
  challengeKey,
  basePath,
  requiresAuth = false,
  activeContext,
  contextQuery,
}: {
  challengeKey: string;
  basePath: string;
  requiresAuth?: boolean;
  activeContext: ActiveWorkspace;
  contextQuery: string;
}) {
  const [items, setItems] = useState(() =>
    buildChallengeItems(challenges, activeContext.workspaceId),
  );
  useEffect(() => {
    const refreshCatalog = () =>
      setItems(buildChallengeItems(listCatalogChallenges(), activeContext.workspaceId));
    refreshCatalog();
    window.addEventListener("storage", refreshCatalog);
    window.addEventListener("rahhal:challenges", refreshCatalog);
    return () => {
      window.removeEventListener("storage", refreshCatalog);
      window.removeEventListener("rahhal:challenges", refreshCatalog);
    };
  }, [activeContext.workspaceId]);
  const challenge = items.find(
    (item) => item.slug.toLowerCase() === challengeKey.toLowerCase() || item.id === challengeKey,
  );
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!challenge) return;
    setSaved(
      isOpportunitySaved(
        challenge.id,
        challenge.scenario === "saved",
        activeContext.workspaceId,
      ),
    );
  }, [activeContext.workspaceId, challenge]);
  if (!challenge)
    return (
      <section className="rh-empty">
        <h1>چالش پیدا نشد</h1>
        <p>شناسه واردشده با چالش‌های منتشرشده تطابق ندارد.</p>
        <Link href={`${basePath}${contextQuery}`}>بازگشت به چالش‌ها</Link>
      </section>
    );

  const closed = challenge.scenario === "closed";
  const toggleSaved = () => {
    const next = !saved;
    setSaved(next);
    setOpportunitySaved(challenge.id, next, activeContext.workspaceId);
    setFeedback(
      next
        ? "فرصت ذخیره شد و از بخش «فرصت‌های ذخیره‌شده» در دسترس است."
        : "فرصت از فهرست ذخیره‌شده‌ها حذف شد.",
    );
  };
  const objectiveCopy = [
    `تعریف خط پایه و شاخص سنجش برای «${challenge.tags[0]}»`,
    `اعتبارسنجی راهکار ${challenge.tags[1] ?? challenge.industry} در محیط ${challenge.remote ? "ترکیبی" : "حضوری"}`,
    `طراحی مسیر ${challenge.route} با خروجی قابل ارزیابی`,
  ];
  const state = readSolverState();
  const eligibility = evaluateEligibility(
    challengeEligibilityRules[challenge.id],
    state,
    activeContext,
  );
  const eligibleForSelectedSpace = eligibility.status === "eligible";
  const existingProposal = proposalsForWorkspace(activeContext.workspaceId, state).find(
    (proposal) => proposal.challengeId === challenge.id,
  );
  const proposalPath = existingProposal
    ? buildSolverHref(
        `/app/solver/proposals/${existingProposal.id}/${
          ["draft", "revision_requested", "revision_draft"].includes(existingProposal.state)
            ? "edit"
            : "preview"
        }`,
        activeContext,
      )
    : buildSolverHref("/app/solver/proposals/new/summary", activeContext, {
        challenge: challenge.slug,
      });
  const startHref = requiresAuth
    ? `/auth/login?returnTo=${encodeURIComponent(`/app/solver/opportunities/${challenge.slug}`)}`
    : proposalPath;
  const actionLabel =
    challenge.scenario === "draft"
      ? "ادامه تدوین راه‌حل"
      : challenge.scenario === "revision"
        ? "اعمال اصلاحات در راه‌حل"
        : challenge.scenario === "submitted" || challenge.scenario === "review"
          ? "پیگیری راه‌حل ارسال‌شده"
          : "شروع تدوین راه‌حل";

  return (
    <div className="rh-detail-page">
      <nav className="rh-detail-breadcrumb" aria-label="مسیر صفحه">
          <Link href={buildSolverHref("/app/solver/dashboard", activeContext)}>داشبورد</Link>
        <span>/</span>
        <Link href={`${basePath}${contextQuery}`}>چالش‌ها</Link>
        <span>/</span>
        <span>{challenge.industry}</span>
      </nav>
      <Link className="rh-detail-back" href={`${basePath}${contextQuery}`}>
        <Icon name="arrow" /> بازگشت به چالش‌ها
      </Link>
      <header className="rh-detail-hero">
        <div className="rh-detail-hero__pattern" aria-hidden="true" />
        <ScenarioBadge scenario={challenge.scenario} />
        <span>{challenge.industry}</span>
        <h1>{challenge.title}</h1>
        <p>{challenge.summary}</p>
        <div className="rh-detail-org">
          <OrganizationLogo organization={challenge.publisher} size="large" />
          <div>
            <strong>{challenge.publisher.name}</strong>
            <small>{challenge.publisher.industry}</small>
          </div>
        </div>
        <dl>
          <div>
            <dt>شناسه</dt>
            <dd><bdi dir="ltr">{challenge.id}</bdi></dd>
          </div>
          <div>
            <dt>انتشار</dt>
            <dd>۱۶ مرداد ۱۴۰۵</dd>
          </div>
          <div>
            <dt>اولویت</dt>
            <dd>{challenge.scenario === "revision" ? "نیازمند اقدام" : "عادی"}</dd>
          </div>
          <div>
            <dt>محل اجرا</dt>
            <dd>{challenge.remote ? "ترکیبی" : "تهران"}</dd>
          </div>
        </dl>
        <div className="rh-deadline">
          <strong>
            {closed ? "۰" : daysRemaining(challenge.deadline).toLocaleString("fa-IR")}
          </strong>
          <span>{closed ? "مهلت پایان یافته" : "روز تا پایان ارسال"}</span>
        </div>
      </header>

      <div className="rh-detail-layout">
        <main>
          <DetailSection title="شرح چالش" icon="brief">
            <h3>مسئله چیست؟</h3>
            <p>
              {challenge.summary} سازمان به‌دنبال راهکاری است که بدون ایجاد اختلال در تولید، امکان
              سنجش خط پایه، اجرای کنترل‌شده و ارزیابی نتیجه را فراهم کند.
            </p>
            <div className="rh-callout">
              <strong>نتیجه مطلوب</strong>
              <p>
                بهبود قابل‌اندازه‌گیری در شاخص مرتبط با «{challenge.tags[0]}»، حفظ الزامات
                {challenge.industry} و امکان ارزیابی نتیجه در مسیر {challenge.route}.
              </p>
            </div>
          </DetailSection>
          <DetailSection title="اهداف و دامنه" icon="decision">
            <div className="rh-scope-grid">
              <div>
                <h3>اهداف کلیدی</h3>
                <ul>
                  {objectiveCopy.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>خارج از دامنه</h3>
                <ul>
                  <li>اقدام خارج از دامنه «{challenge.title}»</li>
                  <li>تعهد اجرایی پیش از تأیید طرح {challenge.route}</li>
                </ul>
              </div>
            </div>
            <div className="rh-tag-row">
              {challenge.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </DetailSection>
          <DetailSection title="خروجی‌های مورد انتظار" icon="download">
            <div className="rh-deliverables">
              <article>
                <Icon name="brief" />
                <span>گزارش خط پایه {challenge.tags[0]}</span>
              </article>
              <article>
                <Icon name="decision" />
                <span>طرح فنی {challenge.tags[1] ?? challenge.industry} و برآورد اقتصادی</span>
              </article>
              <article>
                <Icon name="history" />
                <span>برنامه اجرای پایلوت و گزارش نتایج</span>
              </article>
            </div>
          </DetailSection>
          <DetailSection title="معیارهای ارزیابی" icon="decision">
            <ol className="rh-criteria">
              <li>
                <span>اثرگذاری و میزان صرفه‌جویی</span>
                <b>۳۵٪</b>
              </li>
              <li>
                <span>امکان‌پذیری فنی</span>
                <b>۳۰٪</b>
              </li>
              <li>
                <span>توجیه اقتصادی</span>
                <b>۲۰٪</b>
              </li>
              <li>
                <span>زمان و کیفیت اجرا</span>
                <b>۱۵٪</b>
              </li>
            </ol>
          </DetailSection>
          <DetailSection title="ملاحظات و محدودیت‌ها" icon="shield">
            <ul className="rh-notes">
              <li>رعایت الزامات حوزه {challenge.industry} در تمام مراحل الزامی است.</li>
              <li>راهکار باید شواهد مرتبط با {challenge.tags.join("، ")} ارائه کند.</li>
              <li>نوع همکاری این رکورد «{challenge.route}» است و اقدام‌ها باید با همان مسیر سازگار باشند.</li>
              <li>سطح انتشار «{challenge.visibility}» است و اطلاعات فقط در دامنه همین چالش استفاده می‌شوند.</li>
            </ul>
          </DetailSection>
          <DetailSection title="اطلاعات تکمیلی و فایل‌ها" icon="download">
            {challengeEligibilityRules[challenge.id]?.documentGate &&
            !canAccessRestrictedDocument(activeContext.workspaceId, challenge.id, state) ? (
              <div className="rh-callout">
                <strong>دسترسی پس از پذیرش NDA</strong>
                <p>نام و فراداده اسناد محرمانه تا ثبت رسید پذیرش نمایش داده نمی‌شود.</p>
                <Link href={buildSolverHref("/app/solver/data-room", activeContext, { entity: challenge.id })}>
                  بررسی شرایط دسترسی
                </Link>
              </div>
            ) : (
              <div className="rh-files">
                <div className="rh-file-placeholder">
                  <Icon name="download" />
                  <span>شرح فنی <bdi dir="ltr">{challenge.id}</bdi></span>
                  <small>PDF · ۲٫۴ مگابایت · مشاهده در نسخه نمایشی</small>
                </div>
                <div className="rh-file-placeholder">
                  <Icon name="download" />
                  <span>پیوست {challenge.tags[0]} برای {challenge.industry}</span>
                  <small>PDF · ۲٫۱ مگابایت · مشاهده در نسخه نمایشی</small>
                </div>
              </div>
            )}
          </DetailSection>
        </main>

        <aside>
          <section className="rh-side-card">
            <h2>خلاصه همکاری</h2>
            <dl>
              <div>
                <dt>مهلت ارسال راه‌حل</dt>
                <dd>
                  {closed
                    ? "پایان یافته"
                    : `${daysRemaining(challenge.deadline).toLocaleString("fa-IR")} روز دیگر`}
                </dd>
              </div>
              <div>
                <dt>بودجه همکاری</dt>
                <dd>{budgetLabel(challenge.budget)}</dd>
              </div>
              <div>
                <dt>نوع همکاری</dt>
                <dd>{challenge.route}</dd>
              </div>
              <div>
                <dt>شیوه اجرا</dt>
                <dd>{challenge.remote ? "حضوری و دورکار" : "حضوری و پایلوت صنعتی"}</dd>
              </div>
              <div>
                <dt>مالکیت فکری</dt>
                <dd>توافق در قرارداد نهایی</dd>
              </div>
            </dl>
            {!requiresAuth ? <label>
              <span>ارسال به نمایندگی از</span>
              <select
                value={activeContext.workspaceId}
                onChange={(event) => {
                  const target = activeWorkspaces(state).find(
                    (workspace) => workspace.workspaceId === event.target.value,
                  );
                  if (!target) return;
                  const href = buildSolverHref(`${basePath}/${challenge.slug}`, target);
                  if (document.documentElement.dataset.challengeStandalone === "true")
                    window.location.hash = href;
                  else window.location.assign(href);
                }}
              >
                {activeWorkspaces(state).map((workspace) => {
                  const team =
                    workspace.type === "team"
                      ? state.teams.find((candidate) => candidate.id === workspace.teamId)
                      : undefined;
                  return (
                    <option key={workspace.workspaceId} value={workspace.workspaceId}>
                      {team?.name ?? state.personalWorkspace.name}
                    </option>
                  );
                })}
              </select>
            </label> : <div className="rh-team-authority-note" role="note"><Icon name="shield" /><div><strong>فضای ارسال پس از ورود انتخاب می‌شود</strong><p>ورود با یک هویت انجام می‌شود؛ سپس فضای شخصی یا یکی از تیم‌های فعال را انتخاب می‌کنید.</p></div></div>}
            {!requiresAuth && !eligibleForSelectedSpace && (
              <div className="rh-eligibility-error" role="alert">
                <strong>
                  {eligibility.status === "ineligible" ? "امکان ارسال وجود ندارد" : "پیش از ارسال اقدام لازم است"}
                </strong>
                <ul>{eligibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                {eligibility.actions.map((action) => (
                  <Link key={action.label} href={buildSolverHref(action.href, activeContext)}>{action.label}</Link>
                ))}
              </div>
            )}
            {closed ? (
              <p className="rh-closed-note">این چالش بسته شده و دریافت راه‌حل جدید فعال نیست.</p>
            ) : requiresAuth || eligibleForSelectedSpace ? (
              <Link className="rh-button rh-button--primary" href={startHref}>
                {requiresAuth ? "ورود و بررسی شرایط ارسال" : actionLabel}
              </Link>
            ) : (
              <button type="button" className="rh-button rh-button--primary" disabled>
                {actionLabel}
              </button>
            )}
            <button
              type="button"
              className={`rh-button rh-button--secondary ${saved ? "is-saved" : ""}`}
              onClick={toggleSaved}
              aria-pressed={saved}
            >
              <Icon name="history" /> {saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره فرصت"}
            </button>
            <Link className="rh-share-link" href={`/challenges/${challenge.slug}`}>
              اشتراک‌گذاری
            </Link>
            <p className="rh-profile-warning">
              نتیجه شرایط مشارکت: {eligibility.status === "eligible" ? "واجد شرایط" : "نیازمند اقدام یا بررسی"}
            </p>
          </section>
          <section className="rh-side-card">
            <h2>متقاضیان مجاز</h2>
            {challenge.applicants.map((item) => (
              <p className="rh-eligible" key={item}>
                <Icon name="check" /> {item}
              </p>
            ))}
          </section>
          <section className="rh-side-card rh-publisher">
            <h2>سازمان منتشرکننده</h2>
            <OrganizationLogo organization={challenge.publisher} size="large" />
            <strong>{challenge.publisher.name}</strong>
            <small>عضو تأییدشده راه‌حل</small>
            <span>
              تهران ·{" "}
              {items
                .filter((item) => item.publisher.id === challenge.publisher.id)
                .length.toLocaleString("fa-IR")}{" "}
              چالش منتشرشده
            </span>
            <Link href={`/organizations/${challenge.publisher.slug}`}>مشاهده پروفایل سازمان</Link>
          </section>
        </aside>
      </div>

      <section className="rh-process">
        <h2>فرایند همکاری</h2>
        <div>
          {["ارسال راه‌حل", "ارزیابی اولیه", "جلسه ارائه", "شروع پایلوت"].map((step, index) => (
            <article key={step}>
              <span>{index + 1}</span>
              <Icon
                name={
                  index === 0 ? "arrow" : index === 1 ? "menu" : index === 2 ? "people" : "impact"
                }
              />
              <strong>{step}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="rh-legal">
        <h2>شرایط دسترسی و حقوقی</h2>
        <div>
          <article>
            <Icon name="eye" />
            <strong>نمایش عمومی چالش</strong>
            <p>اطلاعات این صفحه برای همه قابل مشاهده است.</p>
          </article>
          <article>
            <Icon name="lock" />
            <strong>توافق محرمانگی</strong>
            <p>پیش از دسترسی به اطلاعات حساس تأیید می‌شود.</p>
          </article>
          <article>
            <Icon name="brief" />
            <strong>مستندات فنی تکمیلی</strong>
            <p>پس از غربال اولیه برای منتخبین ارسال می‌شود.</p>
          </article>
          <article>
            <Icon name="decision" />
            <strong>مالکیت نتایج</strong>
            <p>مطابق قرارداد همکاری نهایی تعیین خواهد شد.</p>
          </article>
        </div>
      </section>
      {!closed && (
        <section className="rh-detail-cta">
          <div>
            <h2>راهکاری برای این چالش دارید؟</h2>
            <p>دانش و تجربه شما می‌تواند به حل این مسئله و خلق اثر واقعی کمک کند.</p>
          </div>
          {requiresAuth || eligibleForSelectedSpace ? (
            <Link className="rh-button rh-button--primary" href={startHref}>
              {requiresAuth ? "ورود و بررسی شرایط ارسال" : actionLabel}
            </Link>
          ) : (
            <button type="button" className="rh-button rh-button--primary" disabled>
              {actionLabel}
            </button>
          )}
          <button type="button" onClick={toggleSaved}>
            <Icon name="history" /> {saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره برای بعد"}
          </button>
        </section>
      )}
      {feedback && (
        <div className="rh-flow-toast" role="status">
          <Icon name="check" />
          <span>{feedback}</span>
          {saved && <Link href={buildSolverHref("/app/solver/saved", activeContext)}>مشاهده ذخیره‌شده‌ها</Link>}
          <button type="button" onClick={() => setFeedback("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ChallengeDiscoveryApp({
  challengeKey,
  embedded = false,
  publicMode = false,
  space: suppliedSpace,
}: {
  challengeKey?: string;
  embedded?: boolean;
  publicMode?: boolean;
  space?: SolverSpace;
}) {
  const currentSpace = useSolverSpace();
  const currentContext = useSolverContext();
  const space = suppliedSpace ?? currentSpace;
  const state = readSolverState();
  const context =
    currentContext.type === space
      ? currentContext
      : space === "team"
        ? activeWorkspaces(state).find((workspace) => workspace.type === "team") ?? currentContext
        : ({ type: "individual", workspaceId: state.personalWorkspace.id } as const);
  const basePath = embedded ? "/app/solver/opportunities" : "/challenges";
  const contextQuery = embedded
    ? buildSolverHref("/", context).replace(/^\/\?/, "?")
    : "";
  const content = challengeKey ? (
    <ChallengeDetail
      challengeKey={challengeKey}
      basePath={basePath}
      requiresAuth={publicMode}
      activeContext={context}
      contextQuery={contextQuery}
    />
  ) : (
    <ChallengeDirectory
      basePath={basePath}
      contextQuery={contextQuery}
      workspaceId={context.workspaceId}
    />
  );
  if (publicMode) {
    return (
      <div className="public-challenge-shell">
        <SiteHeader />
        <main id="main-content" className="public-challenge-main">
          {content}
        </main>
        <PublicFooter />
      </div>
    );
  }
  if (embedded) return content;
  return (
    <SolverWorkspaceShell active="challenges" currentPath="/app/solver/opportunities" space={space}>
      {content}
    </SolverWorkspaceShell>
  );
}
