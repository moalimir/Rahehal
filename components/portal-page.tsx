"use client";

import Link from "next/link";
import type { StaticImageData } from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import universityAmirkabir from "@/public/images/universities/amirkabir.webp";
import universityBeheshti from "@/public/images/universities/beheshti.webp";
import universityFerdowsi from "@/public/images/universities/ferdowsi.webp";
import universityIsfahan from "@/public/images/universities/isfahan.webp";
import universityKhajehNasir from "@/public/images/universities/khajeh-nasir.webp";
import universityModares from "@/public/images/universities/modares.webp";
import universitySahand from "@/public/images/universities/sahand.webp";
import universityScienceIndustry from "@/public/images/universities/science-industry.webp";
import universitySharif from "@/public/images/universities/sharif.webp";
import universityShiraz from "@/public/images/universities/shiraz.webp";
import universityTabriz from "@/public/images/universities/tabriz.webp";
import universityTehran from "@/public/images/universities/tehran.webp";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { OrganizationLogo as OrganizationLogoAsset } from "@/components/challenge-organization-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { LegacyUnavailable } from "@/components/route-fallbacks";
import { IntellectualPropertyGuidePage } from "@/components/intellectual-property-guide";
import { getLegacyResolution } from "@/data/legacy-redirects";
import { challenges, financeRecords, pilots, reviewers, submissions } from "@/data/mock";
import {
  organizationIndustryLabels,
  organizationProfiles,
  type OrganizationIndustry,
  type OrganizationLogo,
} from "@/data/organization-profiles";
import { signInAsAuthorizedOrganization } from "@/lib/challenges/storage";
import { createDemoSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { buildSolverHref } from "@/lib/solver/context";
import { readSolverState, registerSolverAccount } from "@/lib/solver/repository";
import { readLastActiveWorkspace, writeLastActiveWorkspace } from "@/lib/solver/session";
import { getOrganization } from "@/data/organization-registry";
import {
  identifierError,
  isEmail,
  isIranianMobile,
  otpError,
  passwordError,
  urlError,
} from "@/lib/validation/user-input";
import type { DemoState, RoleSpace, RouteDefinition } from "@/types";

const sideNavigation: Record<Exclude<RoleSpace, "public">, Array<[string, string]>> = {
  solver: [
    ["نمای کلی", "/app/solver/dashboard"],
    ["پروفایل", "/app/solver/profile"],
    ["احراز", "/app/solver/verification"],
    ["فرصت‌ها", "/app/solver/opportunities"],
    ["تیم‌ها", "/app/solver/teams"],
    ["راه‌حل‌ها", "/app/solver/proposals"],
    ["ساخت راه‌حل", "/app/solver/proposals/new"],
    ["پرداخت‌ها", "/app/solver/payments"],
    ["پایلوت", "/app/solver/pilots/PIL-021"],
    ["ذخیره‌شده‌ها", "/app/solver/saved"],
    ["دعوت‌نامه‌ها", "/app/solver/invitations"],
    ["تنظیمات", "/app/solver/settings"],
  ],
  org: [
    ["نمای کلی سازمان", "/app/org/dashboard"],
    ["تنظیمات سازمان", "/app/org/settings"],
    ["اعضا و نقش‌ها", "/app/org/access"],
    ["ثبت مسئله", "/app/org/challenges/new"],
    ["ارزیابی اولیه", "/app/org/challenges/new"],
    ["استودیوی چالش", "/app/org/challenges/CH-1405-021/studio"],
    ["نمای پرونده", "/app/org/challenges/CH-1405-021/overview"],
    ["راه‌حل‌ها", "/app/org/proposals"],
    ["داوران", "/app/org/experts"],
    ["تصمیم", "/app/org/challenges/CH-1405-021/decision"],
    ["قرارداد و مالی", "/app/org/contracts-payments"],
    ["پایلوت و اثر", "/app/org/pilots"],
    ["حسابرسی", "/app/org/challenges/CH-1405-021/history"],
  ],
  ops: [
    ["صف عملیات", "/app/ops/queue"],
    ["اعتبارسنجی", "/app/ops/verification"],
    ["دروازه کیفیت", "/app/ops/publication"],
    ["نظارت و تقلب", "/app/ops/reviews"],
    ["اختلاف‌ها", "/app/ops/disputes"],
    ["پرداخت", "/app/ops/payments"],
    ["گزارش تخلف", "/app/ops/violations"],
    ["سلامت سامانه", "/app/ops/settings"],
  ],
};

const stateLabels: Record<DemoState, string> = {
  default: "حالت عادی",
  loading: "در حال بارگذاری",
  partial: "خطای بخشی",
  empty: "شروع نخست / خالی",
  offline: "شبکه ضعیف",
  permission: "دسترسی محدود",
  locked: "قفل‌شده",
  success: "موفق با رسید",
};

function StatusState({ state, onReset }: { state: DemoState; onReset: () => void }) {
  if (state === "default") return null;
  if (state === "loading")
    return (
      <div className="state-panel skeleton-panel" aria-live="polite">
        <span className="skeleton wide" />
        <span className="skeleton" />
        <span className="skeleton short" />
      </div>
    );
  const content: Record<Exclude<DemoState, "default" | "loading">, [string, string, string]> = {
    partial: [
      "بخشی از داده تازه نشد",
      "اطلاعات اصلی امن و قابل استفاده است؛ سرویس سوابق با کد پیگیری RH-204 دوباره تلاش می‌شود.",
      "تلاش دوباره",
    ],
    empty: [
      "هنوز رکوردی در این نما نیست",
      "با اقدام اصلی صفحه، اولین پرونده را ایجاد کنید. نمونه و راهنمای مرحله در دسترس است.",
      "بازگشت به نمونه",
    ],
    offline: [
      "اتصال ناپایدار است",
      "تغییرهای شما روی این دستگاه حفظ شده و پس از اتصال با نسخه سرور همگام می‌شود.",
      "بررسی اتصال",
    ],
    permission: [
      "برای این بخش دسترسی ندارید",
      "وجود یا محتوای داده حساس افشا نمی‌شود. درخواست دسترسی برای مالک نقش ارسال می‌شود.",
      "درخواست دسترسی",
    ],
    locked: [
      "این نسخه قفل شده است",
      "پس از ثبت رسید، تغییر مستقیم ممکن نیست. برای اصلاح مجاز، درخواست شفاف‌سازی یا amendment بسازید.",
      "مشاهده تاریخچه",
    ],
    success: [
      "اقدام با موفقیت ثبت شد",
      "رسید RH-1405-8821 ایجاد شد. مرحله بعد و مالک آن در timeline به‌روز شده‌اند.",
      "مشاهده رسید",
    ],
  };
  const [title, body, action] = content[state];
  return (
    <div className={`state-panel state-panel--${state}`} role="status">
      <span className="state-panel__icon">
        <Icon
          name={state === "success" ? "check" : state === "permission" ? "lock" : "notification"}
        />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
        <button className="text-button" onClick={onReset}>
          {action}
        </button>
      </div>
    </div>
  );
}

function DemoStateSwitcher({
  value,
  onChange,
}: {
  value: DemoState;
  onChange: (state: DemoState) => void;
}) {
  return (
    <label className="demo-switcher">
      <span>نمایش حالت نمونه</span>
      <select value={value} onChange={(event) => onChange(event.target.value as DemoState)}>
        {Object.entries(stateLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PublicRoute({ definition }: { definition: RouteDefinition }) {
  const [notice, setNotice] = useState("");
  const isChallenges = definition.path === "/challenges";
  const isChallengeDetail = definition.path === "/challenges/smart-water-recovery";
  const isAuth = definition.path === "/auth";
  const isAuthRoute = definition.path.startsWith("/auth/");
  const isOnboarding = definition.path.startsWith("/onboarding/");
  const isOrganization = definition.path.startsWith("/organizations");
  const isOrganizationDirectory = definition.path === "/organizations";
  const isUniversityDirectory = definition.path === "/universities";
  const isOrganizationAuth = definition.path.startsWith("/auth/organization/");
  const isSolverLogin = definition.path === "/auth/login";
  const isRecovery = definition.path === "/auth/recovery";
  const isOtp = definition.path === "/auth/otp";
  const isSolverRegistration = definition.path.startsWith("/auth/solver/register/");
  const isProcess = definition.path.startsWith("/how-it-works");
  const isPolicy =
    definition.path.startsWith("/guides/") ||
    definition.path.startsWith("/legal/") ||
    definition.path === "/trust-security" ||
    definition.path === "/accessibility";
  if (definition.path === "/guides/intellectual-property") {
    return <IntellectualPropertyGuidePage />;
  }
  if (isOrganizationDirectory) {
    return (
      <div className="public-page organizations-page">
        <SiteHeader variant="companies" />
        <main id="main-content">
          <OrganizationDirectoryExperience />
        </main>
        <SimpleFooter />
      </div>
    );
  }
  if (isUniversityDirectory) {
    return (
      <div className="public-page universities-page">
        <SiteHeader variant="universities" />
        <main id="main-content">
          <UniversityDirectoryExperience />
        </main>
        <SimpleFooter />
      </div>
    );
  }
  if (isOrganizationAuth) {
    return <OrganizationAuthExperience definition={definition} />;
  }
  if (isSolverLogin) {
    return <SolverLoginExperience />;
  }
  if (isRecovery) {
    return <AdaptiveRecoveryExperience definition={definition} onNotice={setNotice} />;
  }
  if (isOtp) {
    return <AdaptiveOtpExperience definition={definition} onNotice={setNotice} />;
  }
  if (isSolverRegistration) {
    return <SolverRegistrationExperience definition={definition} />;
  }

  return (
    <div className="public-page">
      <SiteHeader />
      <main id="main-content">
        <section className="public-hero">
          <div className="public-hero__grid container">
            <div>
              <span className="eyebrow">{definition.eyebrow}</span>
              <h1>{definition.title}</h1>
              <p>{definition.summary}</p>
              <div className="button-row">
                {isChallenges || isChallengeDetail ? (
                  <Link
                    className="button button--primary"
                    href={
                      isChallengeDetail
                        ? "/app/solver/opportunities/smart-water-recovery"
                        : "/challenges/smart-water-recovery"
                    }
                  >
                    {isChallengeDetail ? "انتخاب چالش و شروع همکاری" : definition.primaryAction}
                    <Icon name="arrow" />
                  </Link>
                ) : (
                  <button
                    className="button button--primary"
                    onClick={() =>
                      setNotice("اقدام نمونه ثبت شد؛ در نسخه متصل، مرحله بعد باز می‌شود.")
                    }
                  >
                    {definition.primaryAction}
                    <Icon name="arrow" />
                  </button>
                )}
                <Link className="button button--secondary" href="/guides">
                  مشاهده راهنما
                </Link>
              </div>
            </div>
            <div className="brief-panel">
              <div className="brief-panel__head">
                <span className="live-dot" /> {definition.status}
              </div>
              <dl>
                <div>
                  <dt>مسئول</dt>
                  <dd>{definition.owner}</dd>
                </div>
                <div>
                  <dt>مهلت / SLA</dt>
                  <dd>{definition.deadline}</dd>
                </div>
                <div>
                  <dt>سطح دسترسی</dt>
                  <dd>{definition.confidentiality}</dd>
                </div>
              </dl>
              <div className="mini-progress">
                <span style={{ width: "74%" }} />
              </div>
              <small>آمادگی برای اقدام بعدی: ۷۴٪</small>
            </div>
          </div>
        </section>
        <section className="metric-strip container" aria-label="شاخص‌های کلیدی">
          {definition.metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.trend}</small>
            </article>
          ))}
        </section>
        {isAuthRoute ? (
          <AuthRouteExperience definition={definition} onNotice={setNotice} />
        ) : isOnboarding ? (
          <OnboardingExperience definition={definition} onNotice={setNotice} />
        ) : isOrganization ? (
          <OrganizationExperience definition={definition} />
        ) : isProcess ? (
          <ProcessExperience definition={definition} />
        ) : isPolicy ? (
          <PolicyExperience definition={definition} />
        ) : isAuth ? (
          <AuthDemo onNotice={setNotice} />
        ) : isChallenges ? (
          <ChallengeDirectory />
        ) : (
          <PublicNarrative definition={definition} />
        )}
      </main>
      <SimpleFooter />
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

const organizationCategoryTabs: Array<["all" | OrganizationIndustry, string]> = [
  ["all", "همه شرکت‌ها"],
  ["technology", "فناوری"],
  ["industry", "صنعت و تولید"],
  ["energy", "انرژی"],
  ["health", "سلامت"],
  ["financial", "خدمات مالی"],
];

const organizationReferenceOrder = [
  "digikala",
  "irancell",
  "mapna",
  "kalleh",
  "foolad-mobarakeh",
  "snapp",
];

function normalizeOrganizationQuery(value: string) {
  return value
    .normalize("NFKC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa-IR");
}

function OrganizationLogoMark({ logo, name }: { logo: OrganizationLogo; name: string }) {
  return (
    <span className="organization-directory__logo">
      <OrganizationLogoAsset organization={getOrganization(logo, name)} size="large" />
    </span>
  );
}

function OrganizationDirectoryExperience() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<"all" | OrganizationIndustry>("all");
  const [sort, setSort] = useState<"active" | "name">("active");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const pageSize = 6;

  const filteredOrganizations = useMemo(() => {
    const normalizedQuery = normalizeOrganizationQuery(query);
    return organizationProfiles
      .filter((profile) => industry === "all" || profile.industry === industry)
      .filter((profile) => {
        if (!normalizedQuery) return true;
        return normalizeOrganizationQuery(
          `${profile.name} ${profile.sector} ${profile.description} ${profile.location}`,
        ).includes(normalizedQuery);
      })
      .sort((first, second) => {
        if (sort === "name") return first.name.localeCompare(second.name, "fa");
        const firstReferenceIndex = organizationReferenceOrder.indexOf(first.slug);
        const secondReferenceIndex = organizationReferenceOrder.indexOf(second.slug);
        if (firstReferenceIndex >= 0 || secondReferenceIndex >= 0) {
          if (firstReferenceIndex < 0) return 1;
          if (secondReferenceIndex < 0) return -1;
          return firstReferenceIndex - secondReferenceIndex;
        }
        return second.activeChallenges - first.activeChallenges;
      });
  }, [industry, query, sort]);

  useEffect(() => setPage(1), [industry, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredOrganizations.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleOrganizations = filteredOrganizations.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const choosePage = (nextPage: number) => {
    setPage(Math.min(Math.max(nextPage, 1), pageCount));
    document.getElementById("organization-results")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const paginationItems = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (item) => item <= 3 || item === pageCount || Math.abs(item - safePage) <= 1,
  );

  return (
    <div className="organization-directory">
      <section className="organization-directory__hero" aria-labelledby="organizations-title">
        <div className="organization-directory__hero-grid container">
          <div className="organization-directory__intro">
            <nav className="organization-directory__breadcrumb" aria-label="مسیر صفحه">
              <Link href="/">خانه</Link>
              <span aria-hidden="true">/</span>
              <span>شرکت‌های همکار</span>
            </nav>
            <h1 id="organizations-title">شرکت‌های فعال در راه‌حل</h1>
            <p>سازمان‌هایی که چالش‌های واقعی خود را با جامعه متخصصان به اشتراک می‌گذارند.</p>
          </div>
          <dl className="organization-directory__stats" aria-label="آمار سازمان‌های راه‌حل">
            <div>
              <dt>شرکت فعال</dt>
              <dd>۴۸</dd>
            </div>
            <div>
              <dt>صنعت</dt>
              <dd>۱۲</dd>
            </div>
            <div>
              <dt>چالش منتشرشده</dt>
              <dd>۱۳۶</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="organization-directory__content container" aria-label="فهرست شرکت‌ها">
        <div className="organization-directory__filters">
          <div className="organization-directory__filter-row">
            <label className="organization-directory__search">
              <Icon name="search" />
              <span className="sr-only">جست‌وجوی نام شرکت یا صنعت</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جست‌وجوی نام شرکت یا صنعت..."
              />
            </label>
            <label className="organization-directory__select">
              <span className="sr-only">انتخاب صنعت</span>
              <select
                value={industry}
                onChange={(event) =>
                  setIndustry(event.target.value as "all" | OrganizationIndustry)
                }
              >
                <option value="all">همه صنایع</option>
                {Object.entries(organizationIndustryLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Icon name="chevron" />
            </label>
            <label className="organization-directory__select">
              <span className="sr-only">مرتب‌سازی شرکت‌ها</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as "active" | "name")}
              >
                <option value="active">بیشترین چالش فعال</option>
                <option value="name">مرتب‌سازی بر اساس نام</option>
              </select>
              <Icon name="chevron" />
            </label>
          </div>
          <div
            className="organization-directory__category-tabs"
            role="group"
            aria-label="دسته‌بندی شرکت‌ها"
          >
            {organizationCategoryTabs.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={industry === value ? "is-active" : undefined}
                aria-pressed={industry === value}
                onClick={() => setIndustry(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="organization-directory__results-head" id="organization-results">
          <div>
            <h2>{filteredOrganizations.length.toLocaleString("fa-IR")} شرکت</h2>
            <p>سازمان‌های مسئله‌محور و نوآور</p>
          </div>
          <div
            className="organization-directory__view-toggle"
            role="group"
            aria-label="نوع نمایش فهرست"
          >
            <button
              type="button"
              className={view === "grid" ? "is-active" : undefined}
              aria-label="نمایش شبکه‌ای"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Icon name="grid" />
            </button>
            <button
              type="button"
              className={view === "list" ? "is-active" : undefined}
              aria-label="نمایش فهرستی"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <Icon name="filter" />
            </button>
          </div>
        </div>

        {visibleOrganizations.length ? (
          <div className={`organization-directory__cards organization-directory__cards--${view}`}>
            {visibleOrganizations.map((profile) => {
              const isSaved = saved.has(profile.slug);
              return (
                <article className="organization-directory-card" key={profile.slug}>
                  <header>
                    <OrganizationLogoMark logo={profile.logo} name={profile.name} />
                    <div className="organization-directory-card__identity">
                      <h3>
                        {profile.name}
                        <span
                          className="organization-directory-card__verified"
                          aria-label="تأییدشده"
                        >
                          ✓
                        </span>
                      </h3>
                      <p>{profile.sector}</p>
                    </div>
                    <button
                      className="organization-directory-card__save"
                      type="button"
                      aria-label={`${isSaved ? "حذف" : "ذخیره"} ${profile.name}`}
                      aria-pressed={isSaved}
                      onClick={() =>
                        setSaved((current) => {
                          const next = new Set(current);
                          if (next.has(profile.slug)) next.delete(profile.slug);
                          else next.add(profile.slug);
                          return next;
                        })
                      }
                    >
                      <span aria-hidden="true">{isSaved ? "★" : "☆"}</span>
                    </button>
                  </header>
                  <p className="organization-directory-card__description">{profile.description}</p>
                  <div className="organization-directory-card__tags">
                    <span>{profile.location}</span>
                    <span>{profile.size}</span>
                  </div>
                  <dl className="organization-directory-card__metrics">
                    <div>
                      <dt>چالش فعال</dt>
                      <dd>{profile.activeChallenges.toLocaleString("fa-IR")}</dd>
                    </div>
                    <div>
                      <dt>پروژه حل‌شده</dt>
                      <dd>{profile.closedProjects.toLocaleString("fa-IR")}</dd>
                    </div>
                  </dl>
                  <Link
                    className="organization-directory-card__link"
                    href={`/organizations/${profile.slug}`}
                    aria-label={`مشاهده پروفایل ${profile.name}`}
                  >
                    مشاهده پروفایل <span aria-hidden="true">←</span>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="organization-directory__empty" role="status">
            <h3>شرکتی با این مشخصات پیدا نشد</h3>
            <p>عبارت جست‌وجو یا فیلتر صنعت را تغییر دهید.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setIndustry("all");
              }}
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        )}

        {filteredOrganizations.length > pageSize && (
          <nav className="organization-directory__pagination" aria-label="صفحه‌بندی شرکت‌ها">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => choosePage(safePage - 1)}
            >
              <span aria-hidden="true">→</span> قبلی
            </button>
            <div>
              {paginationItems.map((item, index) => {
                const previous = paginationItems[index - 1];
                return (
                  <span key={item}>
                    {previous && item - previous > 1 && <i aria-hidden="true">…</i>}
                    <button
                      type="button"
                      className={item === safePage ? "is-active" : undefined}
                      aria-current={item === safePage ? "page" : undefined}
                      aria-label={`صفحه ${item.toLocaleString("fa-IR")}`}
                      onClick={() => choosePage(item)}
                    >
                      {item.toLocaleString("fa-IR")}
                    </button>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() => choosePage(safePage + 1)}
            >
              بعدی <span aria-hidden="true">←</span>
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}

type UniversityLogoKey =
  | "sharif"
  | "tehran"
  | "amirkabir"
  | "science-industry"
  | "beheshti"
  | "modares"
  | "khajeh-nasir"
  | "isfahan"
  | "shiraz"
  | "ferdowsi"
  | "tabriz"
  | "sahand";

const universities: Array<{
  name: string;
  city: string;
  field: string;
  slug: UniversityLogoKey;
}> = [
  { name: "دانشگاه صنعتی شریف", city: "تهران", field: "مهندسی و فناوری", slug: "sharif" },
  { name: "دانشگاه تهران", city: "تهران", field: "علوم و پژوهش", slug: "tehran" },
  {
    name: "دانشگاه صنعتی امیرکبیر",
    city: "تهران",
    field: "مهندسی و فناوری",
    slug: "amirkabir",
  },
  {
    name: "دانشگاه علم و صنعت ایران",
    city: "تهران",
    field: "صنعت و تولید",
    slug: "science-industry",
  },
  { name: "دانشگاه شهید بهشتی", city: "تهران", field: "علوم و پژوهش", slug: "beheshti" },
  {
    name: "دانشگاه تربیت مدرس",
    city: "تهران",
    field: "علوم و پژوهش",
    slug: "modares",
  },
  {
    name: "دانشگاه صنعتی خواجه نصیرالدین طوسی",
    city: "تهران",
    field: "مهندسی و فناوری",
    slug: "khajeh-nasir",
  },
  { name: "دانشگاه صنعتی اصفهان", city: "اصفهان", field: "صنعت و تولید", slug: "isfahan" },
  { name: "دانشگاه شیراز", city: "شیراز", field: "علوم و پژوهش", slug: "shiraz" },
  {
    name: "دانشگاه فردوسی مشهد",
    city: "مشهد",
    field: "علوم و پژوهش",
    slug: "ferdowsi",
  },
  { name: "دانشگاه تبریز", city: "تبریز", field: "علوم و پژوهش", slug: "tabriz" },
  {
    name: "دانشگاه صنعتی سهند",
    city: "تبریز",
    field: "صنعت و تولید",
    slug: "sahand",
  },
];

const universityLogoAssets: Record<UniversityLogoKey, StaticImageData> = {
  sharif: universitySharif,
  tehran: universityTehran,
  amirkabir: universityAmirkabir,
  "science-industry": universityScienceIndustry,
  beheshti: universityBeheshti,
  modares: universityModares,
  "khajeh-nasir": universityKhajehNasir,
  isfahan: universityIsfahan,
  shiraz: universityShiraz,
  ferdowsi: universityFerdowsi,
  tabriz: universityTabriz,
  sahand: universitySahand,
};

function UniversityLogo({ university }: { university: (typeof universities)[number] }) {
  return (
    <span
      className="university-logo"
      style={{ backgroundImage: `url("${universityLogoAssets[university.slug].src}")` }}
      role="img"
      aria-label={`نشان ${university.name}`}
    />
  );
}

function UniversityDirectoryExperience() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [field, setField] = useState("all");

  useEffect(() => {
    const isStandalone = document.documentElement.dataset.challengeStandalone === "true";
    const params = new URLSearchParams(
      isStandalone ? (window.location.hash.split("?")[1] ?? "") : window.location.search,
    );
    const selected = universities.find((item) => item.slug === params.get("university"));
    if (selected) setQuery(selected.name);
  }, []);

  const visibleUniversities = universities.filter((university) => {
    const normalizedQuery = normalizeOrganizationQuery(query);
    const matchesQuery =
      !normalizedQuery ||
      normalizeOrganizationQuery(
        `${university.name} ${university.city} ${university.field}`,
      ).includes(normalizedQuery);
    return (
      matchesQuery &&
      (city === "all" || university.city === city) &&
      (field === "all" || university.field === field)
    );
  });

  return (
    <div className="university-directory">
      <section
        className="university-directory__intro container"
        aria-labelledby="universities-title"
      >
        <nav aria-label="مسیر صفحه">
          <Link href="/">صفحه اصلی</Link>
          <span aria-hidden="true">/</span>
          <span>تیم‌های دانشگاهی</span>
        </nav>
        <span className="eyebrow">شبکه نوآوری دانشگاهی</span>
        <h1 id="universities-title">تیم‌های دانشگاهی</h1>
        <p>
          تیم‌های متخصص و نوآور برخاسته از دانشگاه‌های برتر را کشف کنید و برای حل چالش‌های سازمانی
          با آن‌ها ارتباط بگیرید.
        </p>
      </section>

      <section className="university-directory__body container" aria-label="فهرست دانشگاه‌ها">
        <div className="university-directory__filters">
          <label className="university-directory__search">
            <Icon name="search" />
            <span className="sr-only">جست‌وجوی دانشگاه</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجوی دانشگاه"
            />
          </label>
          <label>
            <span className="sr-only">انتخاب شهر</span>
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="all">شهر</option>
              {["تهران", "اصفهان", "شیراز", "مشهد", "تبریز"].map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
          <label>
            <span className="sr-only">انتخاب حوزه تخصصی</span>
            <select value={field} onChange={(event) => setField(event.target.value)}>
              <option value="all">حوزه تخصصی</option>
              {["مهندسی و فناوری", "علوم و پژوهش", "صنعت و تولید"].map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
          <strong>{visibleUniversities.length.toLocaleString("fa-IR")} دانشگاه</strong>
        </div>

        {visibleUniversities.length ? (
          <div className="university-directory__grid">
            {visibleUniversities.map((university) => (
              <article className="university-directory-card" key={university.slug}>
                <div>
                  <UniversityLogo university={university} />
                  <span>
                    <strong>{university.name}</strong>
                    <small>
                      <i aria-hidden="true">⌖</i> {university.city}
                    </small>
                  </span>
                </div>
                <Link href={`/challenges?university=${university.slug}`}>
                  مشاهده تیم‌ها <span aria-hidden="true">←</span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="university-directory__empty" role="status">
            <h2>دانشگاهی با این مشخصات پیدا نشد</h2>
            <p>نام دانشگاه یا فیلترهای شهر و حوزه تخصصی را تغییر دهید.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCity("all");
                setField("all");
              }}
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function OrganizationExperience({ definition }: { definition: RouteDefinition }) {
  const selected = organizationProfiles.find(
    (item) => definition.path === `/organizations/${item.slug}`,
  );
  if (selected) {
    const needsByIndustry: Record<OrganizationIndustry, string[]> = {
      technology: ["تحلیل داده", "هوش مصنوعی", "زیرساخت ابری", "تجربه کاربری"],
      industry: ["اتوماسیون", "نگهداری پیش‌بینانه", "کاهش ضایعات", "بهره‌وری انرژی"],
      energy: ["بهینه‌سازی انرژی", "پایش تجهیزات", "شبکه هوشمند", "کاهش انتشار"],
      health: ["بهینه‌سازی انرژی", "زنجیره سرد", "بسته‌بندی هوشمند", "کیفیت محصول"],
      financial: ["فناوری مالی", "امنیت داده", "مدیریت ریسک", "تجربه مشتری"],
      transport: ["حمل‌ونقل هوشمند", "بهینه‌سازی مسیر", "پایش ناوگان", "ایمنی"],
    };
    const challengeTitleByIndustry: Record<OrganizationIndustry, string> = {
      technology: "بهبود تصمیم‌گیری با تحلیل داده و هوش مصنوعی",
      industry: "کاهش توقف و مصرف انرژی در عملیات تولید",
      energy: "پایش و بهینه‌سازی مصرف انرژی در عملیات",
      health: "بهینه‌سازی مصرف انرژی در زنجیره تولید و نگهداری",
      financial: "کاهش ریسک و بهبود تجربه خدمات دیجیتال",
      transport: "پایش هوشمند ناوگان و بهینه‌سازی عملیات",
    };
    const needs = needsByIndustry[selected.industry];
    return (
      <main className="organization-profile container" aria-label="پروفایل سازمان">
        <section className="organization-profile__hero">
          <article className="organization-profile__identity">
            <div className="organization-profile__logo">
              <OrganizationLogoAsset
                organization={getOrganization(selected.logo, selected.name)}
                size="large"
              />
            </div>
            <div>
              <div className="organization-profile__badges">
                <span className="is-verified">
                  <Icon name="check" /> سازمان تأییدشده
                </span>
                <span>پروفایل نمونه</span>
              </div>
              <h1>{selected.name}</h1>
              <p className="organization-profile__meta">
                <span>
                  <Icon name="brief" /> {selected.sector}
                </span>
                <span>
                  <Icon name="location" /> {selected.location}
                </span>
              </p>
              <p className="organization-profile__intro">
                {selected.description}. این صفحه نمایی شفاف از زمینه‌های نیاز، چالش‌های فعال و قواعد
                همکاری سازمان را در اختیار حل‌کنندگان قرار می‌دهد.
              </p>
              <div className="organization-profile__actions">
                <Link
                  className="button button--primary"
                  href={`/challenges?organization=${selected.slug}`}
                >
                  مشاهده چالش‌های فعال <span aria-hidden="true">←</span>
                </Link>
                <a className="button button--secondary" href="#collaboration-policy">
                  درباره همکاری <Icon name="notification" />
                </a>
              </div>
            </div>
          </article>
          <aside className="organization-profile__collaboration-card">
            <header>
              <Icon name="people" />
              <h2>همکاری در راه‌حل</h2>
            </header>
            <dl>
              <div>
                <dt>
                  <Icon name="brief" /> چالش فعال
                </dt>
                <dd>{selected.activeChallenges.toLocaleString("fa-IR")}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="decision" /> چالش منتشرشده
                </dt>
                <dd>{(selected.activeChallenges + 1).toLocaleString("fa-IR")}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="history" /> پاسخ‌گویی
                </dt>
                <dd>۳ روز کاری</dd>
              </div>
              <div>
                <dt>
                  <Icon name="people" /> مدل همکاری
                </dt>
                <dd>پایلوت و توسعه مشترک</dd>
              </div>
            </dl>
          </aside>
        </section>

        <dl className="organization-profile__stats" aria-label="خلاصه همکاری سازمان">
          <div>
            <Icon name="menu" />
            <dt>چالش فعال</dt>
            <dd>{selected.activeChallenges.toLocaleString("fa-IR")}</dd>
          </div>
          <div>
            <Icon name="decision" />
            <dt>چالش منتشرشده</dt>
            <dd>{(selected.activeChallenges + 1).toLocaleString("fa-IR")}</dd>
          </div>
          <div>
            <Icon name="history" />
            <dt>زمان پاسخ</dt>
            <dd>۳ روز کاری</dd>
          </div>
          <div>
            <Icon name="people" />
            <dt>سطح همکاری</dt>
            <dd>پایلوت و توسعه مشترک</dd>
          </div>
        </dl>

        <div className="organization-profile__layout">
          <div className="organization-profile__content">
            <nav className="organization-profile__tabs" aria-label="بخش‌های پروفایل سازمان">
              <a className="is-active" href="#about-organization">
                درباره سازمان
              </a>
              <a href="#active-challenges">چالش‌های فعال</a>
              <a href="#needs">حوزه‌های نیاز</a>
              <a href="#collaboration-policy">سیاست همکاری</a>
            </nav>

            <section id="about-organization" className="organization-profile__section">
              <header>
                <Icon name="brief" />
                <h2>درباره {selected.name}</h2>
              </header>
              <p>
                {selected.description}. تمرکز همکاری‌های نوآوری این سازمان بر راهکارهای قابل اجرا،
                نتیجه قابل‌اندازه‌گیری و توسعه پایدار با فرد یا تیم حل‌کننده است.
              </p>
            </section>

            <section id="needs" className="organization-profile__section">
              <header>
                <Icon name="menu" />
                <h2>حوزه‌های نیاز و فناوری</h2>
              </header>
              <div className="organization-profile__tags">
                {needs.map((need) => (
                  <span key={need}>{need}</span>
                ))}
              </div>
            </section>

            <section
              id="collaboration-policy"
              className="organization-profile__section organization-profile__policy"
            >
              <header>
                <Icon name="shield" />
                <h2>سیاست همکاری</h2>
              </header>
              <div>
                <article>
                  <Icon name="lock" />
                  <p>افشای تدریجی اطلاعات و پذیرش NDA پیش از دسترسی به داده تفصیلی</p>
                </article>
                <article>
                  <Icon name="decision" />
                  <p>توافق معیار پذیرش و چارچوب مالکیت فکری پیش از دریافت پیشنهاد</p>
                </article>
                <article>
                  <Icon name="check" />
                  <p>پذیرش فنی و تأیید پرداخت دو رویداد مستقل و قابل پیگیری هستند</p>
                </article>
              </div>
            </section>

            <section id="active-challenges" className="organization-profile__challenges">
              <header>
                <h2>چالش‌های فعال</h2>
                <Link href={`/challenges?organization=${selected.slug}`}>
                  مشاهده همه {selected.activeChallenges.toLocaleString("fa-IR")} چالش
                </Link>
              </header>
              <article>
                <span className="organization-profile__challenge-icon">
                  <Icon name="impact" />
                </span>
                <div>
                  <span className="organization-profile__active-badge">فعال</span>
                  <h3>{challengeTitleByIndustry[selected.industry]}</h3>
                  <p>راهکارهای قابل اجرا برای بهبود شاخص عملیاتی و کاهش هزینه بررسی می‌شوند.</p>
                  <div className="organization-profile__tags">
                    {needs.slice(0, 3).map((need) => (
                      <span key={need}>{need}</span>
                    ))}
                  </div>
                  <small>
                    <Icon name="people" /> سطح همکاری: پایلوت و توسعه مشترک
                    <Icon name="lock" /> جزئیات پس از احراز و پذیرش NDA
                  </small>
                </div>
                <Link href="/challenges/smart-water-recovery">مشاهده جزئیات چالش</Link>
              </article>
            </section>
          </div>

          <aside className="organization-profile__sidebar">
            <section>
              <header>
                <Icon name="shield" />
                <h2>اطلاعات سازمان</h2>
              </header>
              <p>
                <Icon name="check" /> سازمان تأییدشده
              </p>
              <p>
                <Icon name="brief" /> {selected.sector}
              </p>
              <p>
                <Icon name="location" /> {selected.location}
              </p>
              <p>
                <Icon name="menu" /> پروفایل عمومی و کنترل‌شده
              </p>
            </section>
            <section>
              <header>
                <Icon name="impact" />
                <h2>خلاصه همکاری</h2>
              </header>
              <p>
                <Icon name="check" /> {selected.activeChallenges.toLocaleString("fa-IR")} چالش فعال
              </p>
              <p>
                <Icon name="history" /> SLA پاسخ: ۳ روز کاری
              </p>
              <p>
                <Icon name="people" /> پایلوت و توسعه مشترک
              </p>
            </section>
            <section className="organization-profile__trust">
              <header>
                <Icon name="shield" />
                <h2>اعتماد و شفافیت</h2>
              </header>
              <p>اطلاعات حساس فقط پس از احراز هویت و توافق محرمانگی نمایش داده می‌شود.</p>
            </section>
          </aside>
        </div>
      </main>
    );
  }
  return (
    <section className="public-directory container" aria-label="سازمان یافت نشد">
      <div className="organization-directory__empty">
        <h2>پروفایل سازمان در دسترس نیست</h2>
        <Link href="/organizations">بازگشت به فهرست شرکت‌ها</Link>
      </div>
    </section>
  );
}

function ProcessExperience({ definition }: { definition: RouteDefinition }) {
  const [role, setRole] = useState<"org" | "solver">("org");
  const impact = definition.path.endsWith("/impact");
  const orgSteps = [
    "ثبت مسئله",
    "صورت‌بندی",
    "انتشار و تطبیق",
    "داوری و تصمیم",
    "قرارداد و پایلوت",
    "پرداخت و اثر",
  ];
  const solverSteps = [
    "تکمیل پروفایل",
    "کشف فرصت",
    "تیم و پیشنهاد",
    "داوری و شفاف‌سازی",
    "قرارداد و اجرا",
    "تحویل و پرداخت",
  ];
  return (
    <section className="process-experience container">
      {impact ? (
        <div className="impact-evidence-grid">
          {[
            ["خط پایه", "۱۸٫۴ لیتر / واحد", "پیش از پایلوت"],
            ["هدف", "۱۳٫۸ لیتر / واحد", "کاهش ۲۵٪"],
            ["نتیجه نمونه", "۱۲٫۹ لیتر / واحد", "شواهد ثبت‌شده"],
          ].map(([label, value, note]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </article>
          ))}
          <article className="impact-evidence-grid__decision">
            <Icon name="impact" />
            <div>
              <span>تصمیم بعدی</span>
              <strong>توسعه کنترل‌شده در دو خط</strong>
              <small>نیازمند تأیید مالک کسب‌وکار</small>
            </div>
          </article>
        </div>
      ) : (
        <>
          <div className="process-role-tabs" role="tablist" aria-label="انتخاب مسیر">
            <button
              role="tab"
              aria-selected={role === "org"}
              className={role === "org" ? "active" : ""}
              onClick={() => setRole("org")}
            >
              مسیر سازمان
            </button>
            <button
              role="tab"
              aria-selected={role === "solver"}
              className={role === "solver" ? "active" : ""}
              onClick={() => setRole("solver")}
            >
              مسیر حل‌کننده
            </button>
          </div>
          <ol className="process-timeline">
            {(role === "org" ? orgSteps : solverSteps).map((step, index) => (
              <li key={step}>
                <span>{(index + 1).toLocaleString("fa-IR")}</span>
                <div>
                  <h2>{step}</h2>
                  <p>{definition.sections[index % definition.sections.length]?.items[0]}</p>
                </div>
                <StatusPill index={index} />
              </li>
            ))}
          </ol>
          <div className="button-row process-actions">
            <Link
              className="button button--primary"
              href={
                role === "org" ? "/auth/register?role=organization" : "/auth/register?role=solver"
              }
            >
              شروع این مسیر
            </Link>
            <Link className="button button--secondary" href="/how-it-works/impact">
              مشاهده پایلوت و اثر
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function StatusPill({ index }: { index: number }) {
  return (
    <span className={`status-badge ${index === 0 ? "" : "status-badge--soft"}`}>
      {index === 0 ? "شروع" : index === 5 ? "نتیجه" : "شرط عبور"}
    </span>
  );
}

function PolicyExperience({ definition }: { definition: RouteDefinition }) {
  const [active, setActive] = useState(0);
  return (
    <section className="policy-layout container">
      <aside className="policy-toc" aria-label="فهرست این صفحه">
        <strong>در این صفحه</strong>
        {definition.sections.map((section, index) => (
          <button
            key={section.title}
            className={active === index ? "active" : ""}
            onClick={() => {
              setActive(index);
              document.getElementById(`policy-${index}`)?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {section.title}
          </button>
        ))}
        <Link href="/guides">مرکز راهنما</Link>
      </aside>
      <div className="policy-article">
        {definition.sections.map((section, index) => (
          <section id={`policy-${index}`} key={section.title} onMouseEnter={() => setActive(index)}>
            <span className="eyebrow">بخش {(index + 1).toLocaleString("fa-IR")}</span>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <ul className="check-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="policy-callout">
          <Icon name="shield" />
          <div>
            <strong>اقدام حساس همیشه رسید و تاریخچه دارد</strong>
            <p>پیام موفقیت جایگزین سند پذیرش، رسید ثبت یا رویداد حسابرسی نیست.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

type OrganizationAuthFields = {
  identifier: string;
  password: string;
  representativeName: string;
  representativeRole: string;
  email: string;
  phone: string;
  organizationName: string;
  organizationType: string;
  industry: string;
  nationalId: string;
  organizationPhone: string;
  about: string;
  address: string;
};

const emptyOrganizationAuthFields: OrganizationAuthFields = {
  identifier: "",
  password: "",
  representativeName: "",
  representativeRole: "",
  email: "",
  phone: "",
  organizationName: "",
  organizationType: "",
  industry: "",
  nationalId: "",
  organizationPhone: "",
  about: "",
  address: "",
};

function OrganizationAuthVisual({ kind }: { kind: "login" | "representative" | "company" }) {
  return (
    <aside
      className={`organization-auth-visual organization-auth-visual--${kind}`}
      role="img"
      aria-label="تیم متخصصان سازمانی در فضای صنعتی؛ چالش واقعی، راه‌حل اثرگذار"
    />
  );
}

function OrganizationRegistrationStepper({ step }: { step: 1 | 2 }) {
  const representative = (
    <div className={step === 1 ? "is-active" : "is-complete"}>
      <b>{step === 2 ? "✓" : "۱"}</b>
      <span>
        <strong>مرحله ۱</strong>
        <small>اطلاعات نماینده</small>
      </span>
    </div>
  );
  const company = (
    <div className={step === 2 ? "is-active" : ""}>
      <b>۲</b>
      <span>
        <strong>مرحله ۲</strong>
        <small>اطلاعات سازمان</small>
      </span>
    </div>
  );
  return (
    <div className="organization-registration-stepper" aria-label={`مرحله ${step} از ۲`}>
      {step === 1 ? representative : company}
      <i aria-hidden="true" />
      {step === 1 ? company : representative}
    </div>
  );
}

function OrganizationAuthExperience({ definition }: { definition: RouteDefinition }) {
  const kind = definition.path.endsWith("/login")
    ? "login"
    : definition.path.endsWith("/representative")
      ? "representative"
      : "company";
  const [fields, setFields] = useState(emptyOrganizationAuthFields);
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returnTo, setReturnTo] = useState("");

  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "org"));
    window.sessionStorage?.removeItem("rahhal.organization-registration.representative");
  }, []);

  const withReturnTo = (path: string) =>
    returnTo
      ? `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`
      : path;

  const update = (field: keyof OrganizationAuthFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const navigate = (path: string) => {
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = path;
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.assign(path);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (kind === "login") {
      if (fields.identifier.trim().length < 4 || fields.password.length < 8) {
        setError("ایمیل یا شماره همراه معتبر و رمز عبور حداقل ۸ کاراکتری وارد کنید.");
        return;
      }
      signInAsAuthorizedOrganization();
      setSuccess("ورود سازمانی با موفقیت انجام شد و پنل آماده نمایش است.");
      window.setTimeout(() => navigate(returnTo || "/app/org/dashboard"), 650);
      return;
    }
    if (kind === "representative") {
      const required = [
        fields.representativeName,
        fields.representativeRole,
        fields.email,
        fields.phone,
      ];
      if (required.some((value) => value.trim().length < 3) || fields.password.length < 8) {
        setError("همه اطلاعات نماینده و یک رمز عبور حداقل ۸ کاراکتری را کامل کنید.");
        return;
      }
      navigate(withReturnTo("/auth/organization/register/company"));
      return;
    }
    if (
      fields.organizationName.trim().length < 3 ||
      !fields.organizationType ||
      !fields.industry ||
      !consent
    ) {
      setError("نام، نوع و حوزه فعالیت سازمان را کامل و صحت اطلاعات را تأیید کنید.");
      return;
    }
    setSuccess("حساب سازمانی ایجاد شد؛ در حال انتقال به تأیید شماره همراه هستید.");
    window.setTimeout(() => navigate(withReturnTo("/auth/otp?role=organization")), 650);
  };

  return (
    <div className={`organization-auth-page organization-auth-page--${kind}`}>
      <header className="organization-auth-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="organization-auth-main" id="main-content">
        <section className="organization-auth-form-panel">
          <form
            className={`organization-auth-card organization-auth-card--${kind}`}
            onSubmit={submit}
            noValidate
          >
            <span className="organization-auth-badge">
              {kind === "login" ? "پنل سازمانی" : "حساب سازمانی"}
            </span>
            <h1>{definition.title}</h1>
            <p>{definition.summary}</p>

            {kind !== "login" && (
              <OrganizationRegistrationStepper step={kind === "representative" ? 1 : 2} />
            )}

            {kind === "login" && (
              <>
                <label className="organization-auth-field">
                  <span>ایمیل سازمانی یا شماره همراه</span>
                  <input
                    dir="ltr"
                    value={fields.identifier}
                    onChange={(event) => update("identifier", event.target.value)}
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </label>
                <label className="organization-auth-field">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="رمز عبور"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="current-password"
                      aria-invalid={Boolean(error)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                </label>
                <div className="organization-auth-login-meta">
                  <label>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                    مرا به خاطر بسپار
                  </label>
                  <Link href="/auth/recovery?account=organization">
                    رمز عبور را فراموش کرده‌اید؟
                  </Link>
                </div>
              </>
            )}

            {kind === "representative" && (
              <div className="organization-auth-fields">
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نام و نام خانوادگی</span>
                  <input
                    value={fields.representativeName}
                    onChange={(event) => update("representativeName", event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>سمت سازمانی</span>
                  <input
                    value={fields.representativeRole}
                    onChange={(event) => update("representativeRole", event.target.value)}
                    placeholder="مثلاً مدیر تحقیق و توسعه"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>ایمیل سازمانی</span>
                  <input
                    dir="ltr"
                    type="email"
                    value={fields.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="name@company.ir"
                    autoComplete="email"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>شماره همراه</span>
                  <input
                    dir="ltr"
                    inputMode="tel"
                    value={fields.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="tel"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPassword((value) => !value)}>
                      <Icon name="eye" />
                      <span className="sr-only">نمایش یا پنهان‌کردن رمز عبور</span>
                    </button>
                  </span>
                  <small>حداقل ۸ کاراکتر؛ شامل عدد و حرف</small>
                </label>
              </div>
            )}

            {kind === "company" && (
              <div className="organization-auth-fields organization-auth-fields--company">
                <label className="organization-logo-upload">
                  <span>لوگوی سازمان</span>
                  <input type="file" accept="image/png,image/svg+xml" />
                  <b>
                    <Icon name="download" /> بارگذاری لوگو
                  </b>
                  <small>PNG یا SVG</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نام رسمی سازمان یا شرکت</span>
                  <input
                    value={fields.organizationName}
                    onChange={(event) => update("organizationName", event.target.value)}
                  />
                </label>
                <label className="organization-auth-field">
                  <span>نوع مجموعه</span>
                  <select
                    value={fields.organizationType}
                    onChange={(event) => update("organizationType", event.target.value)}
                  >
                    <option value="">انتخاب نوع مجموعه</option>
                    <option value="private">شرکت خصوصی</option>
                    <option value="public">سازمان دولتی</option>
                    <option value="holding">هلدینگ</option>
                    <option value="research">مرکز پژوهشی</option>
                  </select>
                </label>
                <label className="organization-auth-field">
                  <span>حوزه فعالیت</span>
                  <select
                    value={fields.industry}
                    onChange={(event) => update("industry", event.target.value)}
                  >
                    <option value="">انتخاب حوزه فعالیت</option>
                    <option value="industry">صنعت و تولید</option>
                    <option value="energy">انرژی و آب</option>
                    <option value="technology">فناوری</option>
                    <option value="health">سلامت</option>
                  </select>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شناسه ملی سازمان</span>
                  <input
                    dir="ltr"
                    value={fields.nationalId}
                    onChange={(event) => update("nationalId", event.target.value)}
                  />
                  <small>این اطلاعات فقط برای تأیید هویت سازمان استفاده می‌شود.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شماره تلفن سازمان (اختیاری)</span>
                  <input
                    dir="ltr"
                    value={fields.organizationPhone}
                    onChange={(event) => update("organizationPhone", event.target.value)}
                  />
                  <small>برای تماس سازمانی؛ در صورت تمایل وارد کنید.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>شرح مختصری درباره سازمان</span>
                  <textarea
                    rows={2}
                    value={fields.about}
                    onChange={(event) => update("about", event.target.value)}
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نشانی سازمان</span>
                  <textarea
                    rows={2}
                    value={fields.address}
                    onChange={(event) => update("address", event.target.value)}
                  />
                </label>
                <label className="organization-auth-consent organization-auth-field--wide">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات واردشده را تأیید می‌کنم و{" "}
                    <Link href="/legal/terms">قوانین استفاده از راه‌حل</Link> را می‌پذیرم.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="organization-auth-message is-success" role="status">
                {success}
              </p>
            )}

            <button className="organization-auth-submit" type="submit">
              {definition.primaryAction}
            </button>

            {kind === "login" && (
              <>
                <div className="organization-auth-divider">
                  <span>یا</span>
                </div>
                <button
                  className="organization-auth-secondary"
                  type="button"
                  onClick={() => setSuccess("کد یک‌بارمصرف برای شناسه واردشده ارسال می‌شود.")}
                >
                  ورود با کد یک‌بارمصرف
                </button>
                <p className="organization-auth-switch">
                  هنوز حساب سازمانی ندارید؟{" "}
                  <Link href="/auth/organization/register/representative">ثبت‌نام سازمان</Link>
                </p>
              </>
            )}
            {kind === "representative" && (
              <p className="organization-auth-switch">
                قبلاً حساب ساخته‌اید؟ <Link href="/auth/organization/login">ورود به حساب</Link>
              </p>
            )}
            {kind === "company" && (
              <>
                <button
                  className="organization-auth-back"
                  type="button"
                  onClick={() => navigate("/auth/organization/register/representative")}
                >
                  بازگشت به مرحله قبل
                </button>
                <small className="organization-auth-code-note">
                  پس از ثبت‌نام، کد تأیید برای شما ارسال می‌شود.
                </small>
              </>
            )}
          </form>
        </section>
        <OrganizationAuthVisual kind={kind} />
      </main>
    </div>
  );
}

function SolverLoginExperience() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [success, setSuccess] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [requestedRole, setRequestedRole] = useState<"solver" | "reviewer" | "ops">("solver");

  useEffect(() => {
    const isStandalone = document.documentElement.dataset.challengeStandalone === "true";
    const params = new URLSearchParams(
      isStandalone ? (window.location.hash.split("?")[1] ?? "") : window.location.search,
    );
    const requested = params.get("returnTo") ?? "";
    const role = params.get("role");
    const nextRole = role === "reviewer" || role === "ops" ? role : "solver";
    setRequestedRole(nextRole);
    setReturnTo(safeReturnTo(requested, nextRole));
  }, []);

  const navigate = (path: string) => {
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = path;
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.assign(path);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSuccess("");
    const nextErrors = {
      identifier: identifierError(identifier),
      password: passwordError(password),
    };
    if (nextErrors.identifier || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }
    setSuccess(
      requestedRole === "reviewer"
        ? "ورود داور با موفقیت انجام شد؛ در حال انتقال به مأموریت‌ها هستید."
        : requestedRole === "ops"
          ? "ورود عملیات با موفقیت انجام شد؛ در حال انتقال به صف کار هستید."
          : "ورود هویت حل‌کننده با موفقیت انجام شد؛ فضای کاری معتبر بازیابی می‌شود.",
    );
    const activeWorkspace = readLastActiveWorkspace();
    createDemoSession(
      requestedRole,
      requestedRole === "solver" ? activeWorkspace.workspaceId : `${requestedRole}-workspace`,
    );
    if (requestedRole === "solver") writeLastActiveWorkspace(activeWorkspace);
    const roleHome =
      requestedRole === "reviewer"
        ? "/app/reviewer/assignments"
        : requestedRole === "ops"
          ? "/app/ops/queue"
          : buildSolverHref("/app/solver/dashboard", activeWorkspace);
    window.setTimeout(() => navigate(returnTo || roleHome), 650);
  };

  return (
    <div className="solver-login-page">
      <header className="organization-auth-header solver-login-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="solver-login-main" id="main-content">
        <section className="solver-login-form-panel">
          <form className="solver-login-card" onSubmit={submit} noValidate>
            <span className="organization-auth-badge">یک حساب، چند فضای کاری</span>
            <h1>ورود حل‌کننده</h1>
            <p>با هویت انسانی خود وارد شوید؛ فضای شخصی و تیم‌های فعال پس از ورود قابل انتخاب‌اند.</p>

            <label className="organization-auth-field">
              <span>ایمیل یا شماره همراه</span>
              <input
                dir="ltr"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setErrors((current) => ({ ...current, identifier: undefined }));
                }}
                placeholder="name@example.com"
                autoComplete="username"
                aria-invalid={Boolean(errors.identifier)}
                aria-describedby={errors.identifier ? "solver-login-identifier-error" : undefined}
              />
              {errors.identifier && (
                <small
                  id="solver-login-identifier-error"
                  className="organization-auth-field-error"
                  role="alert"
                >
                  {errors.identifier}
                </small>
              )}
            </label>
            <label className="organization-auth-field">
              <span>رمز عبور</span>
              <span className="organization-auth-password">
                <input
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: undefined }));
                  }}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "solver-login-password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                >
                  <Icon name="eye" />
                </button>
              </span>
              {errors.password && (
                <small
                  id="solver-login-password-error"
                  className="organization-auth-field-error"
                  role="alert"
                >
                  {errors.password}
                </small>
              )}
            </label>

            <div className="organization-auth-login-meta solver-login-meta">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                مرا به خاطر بسپار
              </label>
              <Link href="/auth/recovery?account=solver">رمز عبور را فراموش کرده‌اید؟</Link>
            </div>

            {success && (
              <p className="organization-auth-message is-success" role="status">
                {success}
              </p>
            )}

            <button className="organization-auth-submit" type="submit">
              ورود به حساب
            </button>
            <div className="organization-auth-divider">
              <span>یا</span>
            </div>
            <button
              className="organization-auth-secondary"
              type="button"
              onClick={() => navigate("/auth/otp?role=solver")}
            >
              ورود با کد یک‌بارمصرف
            </button>
            <p className="organization-auth-switch">
              هنوز حساب ندارید؟ <Link href="/auth/solver/register/type">ایجاد حساب</Link>
            </p>
            <small className="solver-login-team-note">تیم رمز عبور مستقل ندارد؛ نقش شما از عضویت همان تیم خوانده می‌شود.</small>
          </form>
        </section>
        <aside
          className="solver-login-visual"
          role="img"
          aria-label="تیم متخصصان در آزمایشگاه صنعتی در حال توسعه یک راه‌حل"
        >
          <div>
            <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
            <p>
              به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل
              کنید.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function navigateSolverAuth(path: string) {
  if (document.documentElement.dataset.challengeStandalone === "true") {
    window.location.hash = path;
    return;
  }
  window.location.assign(path);
}

function readSolverAuthParams() {
  const standalone = document.documentElement.dataset.challengeStandalone === "true";
  return new URLSearchParams(
    standalone ? (window.location.hash.split("?")[1] ?? "") : window.location.search,
  );
}

function SolverAuthVisual() {
  return (
    <aside
      className="solver-login-visual solver-code-visual"
      role="img"
      aria-label="گروهی از متخصصان در محیط صنعتی در حال بررسی یک راه‌حل"
    >
      <div>
        <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
        <p>
          به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل کنید.
        </p>
      </div>
    </aside>
  );
}

function SolverCodeStepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className={`solver-code-stepper solver-code-stepper--${labels.length}`}>
      {labels.map((label, index) => {
        const step = index + 1;
        return (
          <li
            className={step === current ? "is-active" : step < current ? "is-complete" : ""}
            aria-current={step === current ? "step" : undefined}
            key={label}
          >
            <b>{step < current ? <Icon name="check" /> : step.toLocaleString("fa-IR")}</b>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SolverRecoveryExperience() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (step === 1) {
      const nextError = identifierError(identifier);
      if (nextError) {
        setError(nextError);
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const nextError = otpError(otp);
      if (nextError) {
        setError(nextError);
        return;
      }
      if (!["12345", "۱۲۳۴۵"].includes(otp.replace(/\s/g, ""))) {
        setError("کد تأیید صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
        return;
      }
      setStep(3);
      return;
    }
    const nextPasswordError = passwordError(password);
    if (nextPasswordError) {
      setError(nextPasswordError);
      return;
    }
    if (password !== confirmation) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }
    setSuccess("رمز عبور با موفقیت تغییر کرد؛ اکنون می‌توانید وارد حساب شوید.");
  };

  const title =
    step === 1 ? "بازنشانی رمز عبور" : step === 2 ? "تأیید کد بازیابی" : "انتخاب رمز جدید";
  const description =
    step === 1
      ? "ایمیل یا شماره همراه مرتبط با حساب خود را وارد کنید تا کد تأیید برای شما ارسال شود."
      : step === 2
        ? `کد پنج‌رقمی ارسال‌شده به ${identifier} را وارد کنید.`
        : "یک رمز امن و تازه برای حساب خود انتخاب کنید.";

  return (
    <div className="solver-code-page">
      <main className="solver-code-main" id="main-content">
        <section className="solver-code-panel">
          <form className="solver-code-card" onSubmit={submit} noValidate>
            <span className="solver-code-badge">بازیابی حساب انسانی حل‌کننده</span>
            <p className="solver-login-team-note">بازیابی رمز برای هویت کاربر انجام می‌شود؛ تیم رمز مستقل ندارد.</p>
            <h1>{title}</h1>
            <p>{description}</p>
            <SolverCodeStepper current={step} labels={["تأیید هویت", "کد تأیید", "رمز جدید"]} />

            {step === 1 && (
              <label className="solver-code-field">
                <span>ایمیل یا شماره همراه</span>
                <span className="solver-code-input">
                  <Icon name="mail" />
                  <input
                    dir="ltr"
                    aria-label="ایمیل یا شماره همراه"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      setError("");
                    }}
                    placeholder="name@example.com یا ۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد تأیید به همین ایمیل یا شماره همراه ارسال می‌شود.</small>
              </label>
            )}
            {step === 2 && (
              <label className="solver-code-field">
                <span>کد تأیید پنج‌رقمی</span>
                <span className="solver-code-input solver-code-input--otp">
                  <Icon name="key" />
                  <input
                    dir="ltr"
                    aria-label="کد تأیید پنج‌رقمی"
                    inputMode="numeric"
                    maxLength={5}
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/[^0-9۰-۹]/g, ""));
                      setError("");
                    }}
                    placeholder="۱۲۳۴۵"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</small>
              </label>
            )}
            {step === 3 && (
              <div className="solver-code-passwords">
                <label className="solver-code-field">
                  <span>رمز عبور جدید</span>
                  <span className="solver-code-input">
                    <Icon name="lock" />
                    <input
                      dir="ltr"
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                      autoComplete="new-password"
                    />
                  </span>
                </label>
                <label className="solver-code-field">
                  <span>تکرار رمز عبور جدید</span>
                  <span className="solver-code-input">
                    <Icon name="lock" />
                    <input
                      dir="ltr"
                      type="password"
                      value={confirmation}
                      onChange={(event) => {
                        setConfirmation(event.target.value);
                        setError("");
                      }}
                      autoComplete="new-password"
                    />
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="solver-code-message is-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="solver-code-message is-success" role="status">
                <Icon name="check" /> {success}
              </p>
            )}

            {!success && (
              <button className="solver-code-submit" type="submit">
                {step === 1 ? "ارسال کد تأیید" : step === 2 ? "تأیید کد" : "ثبت رمز جدید"}
                <Icon name="arrow" />
              </button>
            )}
            {step > 1 && !success && (
              <button
                className="solver-code-link"
                type="button"
                onClick={() => {
                  setStep(step === 3 ? 2 : 1);
                  setError("");
                }}
              >
                بازگشت به مرحله قبل
              </button>
            )}
            <Link className="solver-code-link" href="/auth/login?role=solver">
              <Icon name="arrow" /> بازگشت به صفحه ورود
            </Link>
            <aside className="solver-code-safe">
              <Icon name="shield" />
              <div>
                <strong>بازیابی امن حساب</strong>
                <p>کد تأیید ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</p>
              </div>
            </aside>
            <p className="solver-code-support">
              به ایمیل یا شماره همراه خود دسترسی ندارید؟{" "}
              <Link href="/contact">ارتباط با پشتیبانی</Link>
            </p>
          </form>
        </section>
        <SolverAuthVisual />
      </main>
    </div>
  );
}

function SolverOtpLoginExperience() {
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState("");

  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "solver"));
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 1) {
      const nextError = identifierError(identifier);
      if (nextError) {
        setError(nextError);
        return;
      }
      setStep(2);
      return;
    }
    const nextError = otpError(otp);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (!["12345", "۱۲۳۴۵"].includes(otp.replace(/\s/g, ""))) {
      setError("کد ورود صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
      return;
    }
    const activeWorkspace = readLastActiveWorkspace();
    createDemoSession("solver", activeWorkspace.workspaceId);
    writeLastActiveWorkspace(activeWorkspace);
    navigateSolverAuth(returnTo || buildSolverHref("/app/solver/dashboard", activeWorkspace));
  };

  return (
    <div className="solver-code-page solver-code-page--otp">
      <main className="solver-code-main" id="main-content">
        <section className="solver-code-panel">
          <form className="solver-code-card" onSubmit={submit} noValidate>
            <span className="solver-code-badge">یک هویت حل‌کننده</span>
            <h1>{step === 1 ? "ورود با کد یک‌بار مصرف" : "تأیید و ورود"}</h1>
            <p>
              {step === 1
                ? "ایمیل یا شماره همراه خود را وارد کنید تا کد ورود برای شما ارسال شود."
                : `کد پنج‌رقمی ارسال‌شده به ${identifier} را وارد کنید.`}
            </p>
            <p className="solver-login-team-note">پس از ورود، فضای شخصی و تیم‌های دارای عضویت فعال در انتخابگر workspace نمایش داده می‌شوند.</p>
            <SolverCodeStepper current={step} labels={["دریافت کد", "تأیید و ورود"]} />

            {step === 1 ? (
              <label className="solver-code-field">
                <span>ایمیل یا شماره همراه</span>
                <span className="solver-code-input">
                  <Icon name="mail" />
                  <input
                    dir="ltr"
                    aria-label="ایمیل یا شماره همراه"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      setError("");
                    }}
                    placeholder="name@example.com یا ۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد یک‌بار مصرف به همین ایمیل یا شماره همراه ارسال می‌شود.</small>
              </label>
            ) : (
              <label className="solver-code-field">
                <span>کد ورود پنج‌رقمی</span>
                <span className="solver-code-input solver-code-input--otp">
                  <Icon name="key" />
                  <input
                    dir="ltr"
                    aria-label="کد ورود پنج‌رقمی"
                    inputMode="numeric"
                    maxLength={5}
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/[^0-9۰-۹]/g, ""));
                      setError("");
                    }}
                    placeholder="۱۲۳۴۵"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد کوتاه‌مدت است و فقط یک‌بار قابل استفاده خواهد بود.</small>
              </label>
            )}

            {error && (
              <p className="solver-code-message is-error" role="alert">
                {error}
              </p>
            )}
            <button className="solver-code-submit" type="submit">
              {step === 1 ? "ارسال کد ورود" : "تأیید و ورود"} <Icon name="arrow" />
            </button>
            {step === 2 && (
              <button className="solver-code-link" type="button" onClick={() => setStep(1)}>
                اصلاح ایمیل یا شماره همراه
              </button>
            )}
            <Link className="solver-code-link" href="/auth/login?role=solver">
              <Icon name="lock" /> ورود با رمز عبور
            </Link>
            <aside className="solver-code-safe">
              <Icon name="shield" />
              <div>
                <strong>ورود امن و سریع</strong>
                <p>کد ورود کوتاه‌مدت است و فقط یک‌بار قابل استفاده خواهد بود.</p>
              </div>
            </aside>
            <p className="solver-code-support">
              هنوز حساب کاربری ندارید؟ <Link href="/auth/solver/register/type">ایجاد حساب</Link>
            </p>
            <Link className="solver-code-support-link" href="/contact">
              ارتباط با پشتیبانی
            </Link>
          </form>
        </section>
        <SolverAuthVisual />
      </main>
    </div>
  );
}

type SolverAccountType = "individual" | "team";
type SolverTeamType =
  | ""
  | "formal-company"
  | "independent"
  | "independent-university"
  | "supervised-university";

type SolverRegistrationFields = {
  accountType: SolverAccountType;
  teamType: SolverTeamType;
  displayName: string;
  contactName: string;
  companyName: string;
  universityName: string;
  professorName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  city: string;
  headline: string;
  expertise: string;
  experience: string;
  portfolio: string;
  bio: string;
};

const emptySolverRegistrationFields: SolverRegistrationFields = {
  accountType: "individual",
  teamType: "",
  displayName: "",
  contactName: "",
  companyName: "",
  universityName: "",
  professorName: "",
  phone: "",
  email: "",
  password: "",
  confirmPassword: "",
  city: "",
  headline: "",
  expertise: "",
  experience: "",
  portfolio: "",
  bio: "",
};

let solverRegistrationMemoryDraft: SolverRegistrationFields | null = null;

function SolverRegistrationStepper({ step }: { step: 1 | 2 | 3 }) {
  const item = (number: 1 | 2 | 3, title: string) => {
    const state = step === number ? "is-active" : step > number ? "is-complete" : "";
    return (
      <div className={state}>
        <b>{step > number ? "✓" : number.toLocaleString("fa-IR")}</b>
        <span>
          <strong>مرحله {number.toLocaleString("fa-IR")}</strong>
          <small>{title}</small>
        </span>
      </div>
    );
  };

  return (
    <div className="solver-registration-stepper" aria-label={`مرحله ${step} از ۳`}>
      {item(1, "شروع ثبت‌نام")}
      <i aria-hidden="true" />
      {item(2, "اطلاعات حساب")}
      <i aria-hidden="true" />
      {item(3, "پروفایل تخصصی")}
    </div>
  );
}

function SolverRegistrationVisual({
  step,
  accountType,
}: {
  step: 1 | 2 | 3;
  accountType: SolverAccountType;
}) {
  const copy = {
    1: {
      title: "تخصص شما، شروع یک راه‌حل واقعی",
      body: "یک هویت انسانی بسازید؛ پس از ورود می‌توانید تیم بسازید یا دعوت تیم‌ها را بپذیرید.",
    },
    2: {
      title: "یک حساب امن برای همکاری حرفه‌ای",
      body: "راه ارتباطی شما فقط برای مدیریت فرصت‌ها، دعوت‌ها و مراحل رسمی همکاری استفاده می‌شود.",
    },
    3:
      accountType === "team"
        ? {
            title: "آمادگی تیم را شفاف معرفی کنید",
            body: "ترکیب اعضا، مرحله بلوغ و خروجی‌های تیم، تطبیق دقیق‌تری با پروژه‌های سازمانی می‌سازد.",
          }
        : {
            title: "توانمندی خود را به فرصت تبدیل کنید",
            body: "پروفایل دقیق‌تر، تطبیق شفاف‌تر با چالش‌ها و پیشنهادهای مرتبط‌تری برای شما می‌سازد.",
          },
  }[step];

  return (
    <aside className={`solver-registration-visual solver-registration-visual--step-${step}`}>
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <span
        role="img"
        aria-label={
          step === 1
            ? "تیم متخصصان جوان در آزمایشگاه نوآوری"
            : step === 2
              ? "متخصص جوان در حال تکمیل اطلاعات با لپ‌تاپ"
              : "تیم فنی در حال مرور نمونه‌کار و نقشه‌های تخصصی"
        }
      />
    </aside>
  );
}

function SolverRegistrationExperience({ definition }: { definition: RouteDefinition }) {
  const step: 1 | 2 | 3 = definition.path.endsWith("/type")
    ? 1
    : definition.path.endsWith("/account")
      ? 2
      : 3;
  const [fields, setFields] = useState(emptySolverRegistrationFields);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (solverRegistrationMemoryDraft) {
      setFields(solverRegistrationMemoryDraft);
      return;
    }
    try {
      const saved = window.sessionStorage?.getItem("rahhal.solver-registration");
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        version?: number;
        savedAt?: number;
        fields?: Partial<SolverRegistrationFields>;
      };
      const unsafeFields =
        "version" in parsed && parsed.version === 2
          ? parsed.fields
          : (parsed as Partial<SolverRegistrationFields>);
      const safeFields: Partial<SolverRegistrationFields> = {
        accountType: unsafeFields?.accountType,
        teamType: unsafeFields?.teamType,
        city: unsafeFields?.city,
        headline: unsafeFields?.headline,
        expertise: unsafeFields?.expertise,
        experience: unsafeFields?.experience,
      };
      const restored = {
        ...emptySolverRegistrationFields,
        ...safeFields,
        accountType: "individual" as const,
        password: "",
        confirmPassword: "",
      };
      solverRegistrationMemoryDraft = restored;
      setFields(restored);
      window.sessionStorage?.setItem(
        "rahhal.solver-registration",
        JSON.stringify({ version: 2, savedAt: Date.now(), fields: safeFields }),
      );
    } catch {
      try {
        window.sessionStorage?.removeItem("rahhal.solver-registration");
      } catch {
        // Standalone file URLs can expose an opaque origin without session storage.
      }
    }
  }, []);

  const update = (field: keyof SolverRegistrationFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const updateTeamType = (teamType: SolverTeamType) => {
    setFields((current) => ({
      ...current,
      teamType,
      companyName: teamType === "formal-company" ? current.companyName : "",
      universityName:
        teamType === "independent-university" || teamType === "supervised-university"
          ? current.universityName
          : "",
      professorName: teamType === "supervised-university" ? current.professorName : "",
    }));
    setError("");
  };

  const persist = (next = fields) => {
    solverRegistrationMemoryDraft = next;
    try {
      const safeDraft = {
        accountType: next.accountType,
        teamType: next.teamType,
        city: next.city,
        headline: next.headline,
        expertise: next.expertise,
        experience: next.experience,
      };
      window.sessionStorage?.setItem(
        "rahhal.solver-registration",
        JSON.stringify({ version: 2, savedAt: Date.now(), fields: safeDraft }),
      );
    } catch {
      // Navigation still works when a standalone browser blocks session storage.
    }
  };

  const navigate = (path: string) => {
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = path;
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.assign(path);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 1) {
      const individualFields = { ...fields, accountType: "individual" as const, teamType: "" as const };
      setFields(individualFields);
      persist(individualFields);
      navigate("/auth/solver/register/account");
      return;
    }
    if (step === 2) {
      if (fields.displayName.trim().length < 3) {
        setError(
          fields.accountType === "team"
            ? "نام تیم باید حداقل ۳ کاراکتر باشد."
            : "نام و نام خانوادگی را کامل وارد کنید.",
        );
        return;
      }
      if (fields.accountType === "team" && fields.contactName.trim().length < 3) {
        setError("نام و نام خانوادگی نماینده تیم را کامل وارد کنید.");
        return;
      }
      if (!isIranianMobile(fields.phone)) {
        setError("شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود؛ نمونه: ۰۹۱۲۱۲۳۴۵۶۷");
        return;
      }
      if (!isEmail(fields.email)) {
        setError("ساختار ایمیل درست نیست؛ نمونه: name@example.com");
        return;
      }
      const nextPasswordError = passwordError(fields.password);
      if (nextPasswordError) {
        setError(nextPasswordError);
        return;
      }
      if (!fields.confirmPassword) {
        setError("تکرار رمز عبور را وارد کنید.");
        return;
      }
      if (fields.password !== fields.confirmPassword) {
        setError("تکرار رمز عبور با رمز عبور یکسان نیست.");
        return;
      }
      if (fields.accountType === "team") {
        if (!fields.teamType) {
          setError("نوع تیم را انتخاب کنید.");
          return;
        }
        if (fields.teamType === "formal-company" && fields.companyName.trim().length < 3) {
          setError("نام رسمی شرکت را وارد کنید.");
          return;
        }
        if (
          (fields.teamType === "independent-university" ||
            fields.teamType === "supervised-university") &&
          !fields.universityName
        ) {
          setError("دانشگاه مرتبط با تیم را انتخاب کنید.");
          return;
        }
        if (fields.teamType === "supervised-university" && fields.professorName.trim().length < 3) {
          setError("نام استاد ناظر را وارد کنید.");
          return;
        }
      }
      persist();
      navigate("/auth/solver/register/profile");
      return;
    }
    if (fields.headline.trim().length < 3) {
      setError(
        fields.accountType === "team"
          ? "عنوان و زمینه فعالیت تیم را وارد کنید."
          : "عنوان حرفه‌ای را وارد کنید.",
      );
      return;
    }
    if (!fields.expertise) {
      setError("حوزه تخصص اصلی را انتخاب کنید.");
      return;
    }
    if (!fields.experience) {
      setError(
        fields.accountType === "team"
          ? "مرحله بلوغ و آمادگی تیم را انتخاب کنید."
          : "سابقه فعالیت حرفه‌ای را انتخاب کنید.",
      );
      return;
    }
    if (fields.bio.trim().length < 20) {
      setError(
        fields.accountType === "team"
          ? "معرفی تیم و توانمندی جمعی باید حداقل ۲۰ کاراکتر باشد."
          : "معرفی کوتاه باید حداقل ۲۰ کاراکتر باشد.",
      );
      return;
    }
    const portfolioError = urlError(fields.portfolio);
    if (portfolioError) {
      setError(portfolioError);
      return;
    }
    if (!consent) {
      setError("برای ساخت حساب، تأیید صحت اطلاعات و پذیرش قوانین الزامی است.");
      return;
    }
    persist();
    const registration = registerSolverAccount({
      displayName: fields.displayName,
      email: fields.email,
      mobile: fields.phone,
      headline: fields.headline,
      bio: fields.bio,
      skills: [fields.expertise].filter(Boolean),
      availability: fields.experience,
      resumeFileName: resumeName || undefined,
    });
    if (!registration.ok) {
      setError(registration.message);
      return;
    }
    const personalContext = {
      type: "individual" as const,
      workspaceId: readSolverState().personalWorkspace.id,
    };
    try {
      writeLastActiveWorkspace(personalContext);
      createDemoSession("solver", personalContext.workspaceId);
      window.sessionStorage?.removeItem("rahhal.solver-registration");
    } catch {
      // The destination query keeps the workspace correct without browser storage.
    }
    solverRegistrationMemoryDraft = null;
    setSuccess(`حساب انسانی و فضای شخصی ساخته شد؛ رسید ${registration.receiptId}.`);
    window.setTimeout(() => navigate(buildSolverHref("/app/solver/dashboard", personalContext)), 650);
  };

  return (
    <div className={`solver-registration-page solver-registration-page--step-${step}`}>
      <header className="organization-auth-header solver-registration-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="solver-registration-main" id="main-content">
        <section className="solver-registration-form-panel">
          <form className="solver-registration-card" onSubmit={submit} noValidate>
            <span className="organization-auth-badge">حساب انسانی حل‌کننده</span>
            <h1>{definition.title}</h1>
            <p>
              {step === 3 && fields.accountType === "team"
                ? "حوزه فعالیت، مرحله بلوغ، ترکیب توانمندی و خروجی‌های تیم را ثبت کنید تا فرصت‌های مناسب‌تری پیشنهاد شوند."
                : definition.summary}
            </p>
            <SolverRegistrationStepper step={step} />

            {step === 1 && (
              <div className="solver-account-type-cards" aria-label="نوع حساب حل‌کننده">
                <article className="is-selected">
                  <span>
                    <Icon name="brief" />
                  </span>
                  <strong>حساب حل‌کننده</strong>
                  <small>فضای شخصی به‌صورت خودکار ساخته می‌شود؛ تیم‌ها workspace هستند و رمز عبور جدا ندارند.</small>
                  <b aria-hidden="true">✓</b>
                </article>
              </div>
            )}

            {step === 2 && (
              <div className="organization-auth-fields solver-registration-fields">
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>{fields.accountType === "team" ? "نام تیم" : "نام و نام خانوادگی"}</span>
                  <input
                    value={fields.displayName}
                    onChange={(event) => update("displayName", event.target.value)}
                    autoComplete={fields.accountType === "team" ? "organization" : "name"}
                  />
                </label>
                {fields.accountType === "team" && (
                  <>
                    <label className="organization-auth-field organization-auth-field--wide">
                      <span>نام و نام خانوادگی نماینده تیم</span>
                      <input
                        value={fields.contactName}
                        onChange={(event) => update("contactName", event.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label className="organization-auth-field organization-auth-field--wide solver-team-type-field">
                      <span>نوع تیم</span>
                      <select
                        value={fields.teamType}
                        onChange={(event) => updateTeamType(event.target.value as SolverTeamType)}
                      >
                        <option value="">انتخاب نوع تیم</option>
                        <option value="formal-company">شرکت رسمی</option>
                        <option value="independent">تیم مستقل</option>
                        <option value="independent-university">تیم دانشگاهی مستقل</option>
                        <option value="supervised-university">تیم دانشگاهی تحت نظر استاد</option>
                      </select>
                      <small>نوع تیم، مدارک و فرصت‌های قابل مشاهده را مشخص می‌کند.</small>
                    </label>
                    {fields.teamType === "formal-company" && (
                      <label className="organization-auth-field organization-auth-field--wide solver-team-conditional-field">
                        <span>نام رسمی شرکت</span>
                        <input
                          value={fields.companyName}
                          onChange={(event) => update("companyName", event.target.value)}
                          autoComplete="organization"
                          placeholder="نام ثبت‌شده شرکت"
                        />
                      </label>
                    )}
                    {fields.teamType === "independent-university" && (
                      <label className="organization-auth-field organization-auth-field--wide solver-team-conditional-field">
                        <span>نام دانشگاه</span>
                        <select
                          value={fields.universityName}
                          onChange={(event) => update("universityName", event.target.value)}
                        >
                          <option value="">انتخاب دانشگاه</option>
                          <option>دانشگاه صنعتی شریف</option>
                          <option>دانشگاه تهران</option>
                          <option>دانشگاه صنعتی امیرکبیر</option>
                          <option>دانشگاه علم و صنعت ایران</option>
                          <option>سایر دانشگاه‌ها</option>
                        </select>
                      </label>
                    )}
                    {fields.teamType === "supervised-university" && (
                      <>
                        <label className="organization-auth-field solver-team-conditional-field">
                          <span>نام دانشگاه</span>
                          <select
                            value={fields.universityName}
                            onChange={(event) => update("universityName", event.target.value)}
                          >
                            <option value="">انتخاب دانشگاه</option>
                            <option>دانشگاه صنعتی شریف</option>
                            <option>دانشگاه تهران</option>
                            <option>دانشگاه صنعتی امیرکبیر</option>
                            <option>دانشگاه علم و صنعت ایران</option>
                            <option>سایر دانشگاه‌ها</option>
                          </select>
                        </label>
                        <label className="organization-auth-field solver-team-conditional-field">
                          <span>نام و نام خانوادگی استاد ناظر</span>
                          <input
                            value={fields.professorName}
                            onChange={(event) => update("professorName", event.target.value)}
                            placeholder="مثلاً دکتر علی رضایی"
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
                <label className="organization-auth-field">
                  <span>شماره همراه</span>
                  <input
                    dir="ltr"
                    inputMode="tel"
                    value={fields.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="tel"
                  />
                </label>
                <label className="organization-auth-field">
                  <span>ایمیل</span>
                  <input
                    dir="ltr"
                    type="email"
                    value={fields.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--password-pair">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="رمز عبور"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                  <small>حداقل ۸ کاراکتر؛ شامل عدد و حرف</small>
                </label>
                <label className="organization-auth-field organization-auth-field--password-pair">
                  <span>تکرار رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="تکرار رمز عبور"
                      type={showConfirmPassword ? "text" : "password"}
                      value={fields.confirmPassword}
                      onChange={(event) => update("confirmPassword", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={
                        showConfirmPassword ? "پنهان‌کردن تکرار رمز عبور" : "نمایش تکرار رمز عبور"
                      }
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                  <small>همان رمز عبور را دوباره وارد کنید.</small>
                </label>
              </div>
            )}

            {step === 3 && (
              <div
                className={`organization-auth-fields solver-registration-fields solver-registration-fields--profile ${
                  fields.accountType === "team" ? "solver-registration-fields--team-profile" : ""
                }`}
              >
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>
                    {fields.accountType === "team" ? "عنوان و زمینه فعالیت تیم" : "عنوان حرفه‌ای"}
                  </span>
                  <input
                    value={fields.headline}
                    onChange={(event) => update("headline", event.target.value)}
                    placeholder={
                      fields.accountType === "team"
                        ? "مثلاً تیم طراحی و ساخت تجهیزات هوشمند"
                        : "مثلاً پژوهشگر هوش مصنوعی صنعتی"
                    }
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>حوزه تخصص اصلی</span>
                  <select
                    aria-label="حوزه تخصص اصلی"
                    value={fields.expertise}
                    onChange={(event) => update("expertise", event.target.value)}
                  >
                    <option value="">انتخاب حوزه تخصص</option>
                    <option value="engineering">مهندسی و ساخت</option>
                    <option value="software">نرم‌افزار و داده</option>
                    <option value="energy">انرژی و محیط‌زیست</option>
                    <option value="health">زیست‌فناوری و سلامت</option>
                    <option value="design">طراحی محصول و تجربه</option>
                    <option value="research">پژوهش و توسعه</option>
                  </select>
                  <small>
                    {fields.accountType === "team"
                      ? "حوزه‌ای را انتخاب کنید که بیشترین سهم را در خروجی جمعی تیم دارد."
                      : "تخصص محوری خود را برای تطبیق فرصت‌ها مشخص کنید."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>
                    {fields.accountType === "team" ? "مرحله بلوغ و آمادگی تیم" : "سابقه فعالیت"}
                  </span>
                  <select
                    aria-label={
                      fields.accountType === "team" ? "مرحله بلوغ و آمادگی تیم" : "سابقه فعالیت"
                    }
                    value={fields.experience}
                    onChange={(event) => update("experience", event.target.value)}
                  >
                    {fields.accountType === "team" ? (
                      <>
                        <option value="">انتخاب مرحله فعلی تیم</option>
                        <option value="forming">در حال شکل‌گیری و تکمیل اعضای اصلی</option>
                        <option value="formed">تیم شکل‌گرفته، بدون پروژه اجرایی</option>
                        <option value="prototype">دارای نمونه اولیه یا پروژه آزمایشی</option>
                        <option value="industrial">دارای سابقه اجرای پروژه صنعتی</option>
                        <option value="established">تیم یا شرکت تثبیت‌شده</option>
                      </>
                    ) : (
                      <>
                        <option value="">انتخاب سابقه حرفه‌ای</option>
                        <option value="student">دانشجو یا تازه‌کار</option>
                        <option value="1-3">۱ تا ۳ سال</option>
                        <option value="3-7">۳ تا ۷ سال</option>
                        <option value="7+">بیش از ۷ سال</option>
                      </>
                    )}
                  </select>
                  <small>
                    {fields.accountType === "team"
                      ? "مرحله تیم بر اساس آمادگی اعضا و خروجی اجرایی سنجیده می‌شود، نه سابقه یک فرد."
                      : "مجموع تجربه حرفه‌ای مرتبط خود را انتخاب کنید."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شهر محل فعالیت</span>
                  <input
                    value={fields.city}
                    onChange={(event) => update("city", event.target.value)}
                    placeholder="مثلاً تهران"
                  />
                  <small>
                    {fields.accountType === "team"
                      ? "شهر اصلی فعالیت یا محل استقرار بیشتر اعضای تیم."
                      : "شهر اصلی فعالیت حرفه‌ای شما."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>
                    {fields.accountType === "team"
                      ? "لینک معرفی یا نمونه‌کار تیم (اختیاری)"
                      : "لینک نمونه‌کار یا پروفایل حرفه‌ای (اختیاری)"}
                  </span>
                  <input
                    dir="ltr"
                    type="url"
                    value={fields.portfolio}
                    onChange={(event) => update("portfolio", event.target.value)}
                    placeholder="https://"
                  />
                  <small>لینک عمومی و قابل مشاهده برای سازمان؛ واردکردن آن اختیاری است.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>
                    {fields.accountType === "team"
                      ? "معرفی تیم و توانمندی جمعی"
                      : "معرفی کوتاه و توانمندی‌ها"}
                  </span>
                  <textarea
                    rows={3}
                    value={fields.bio}
                    onChange={(event) => update("bio", event.target.value)}
                    placeholder={
                      fields.accountType === "team"
                        ? "درباره ترکیب اعضا، توانمندی جمعی، خروجی‌های فعلی و نوع مسئله‌های هدف بنویسید."
                        : "درباره تخصص، تجربه و نوع مسئله‌هایی که می‌توانید حل کنید بنویسید."
                    }
                  />
                  <small>حداقل ۲۰ کاراکتر؛ اطلاعات حساس یا محرمانه وارد نکنید.</small>
                </label>
                <label className="solver-resume-upload organization-auth-field--wide">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        setResumeName("");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        setError("حجم رزومه نباید بیشتر از ۱۰ مگابایت باشد.");
                        event.target.value = "";
                        return;
                      }
                      if (!/\.(pdf|docx?)$/i.test(file.name)) {
                        setError("فرمت رزومه باید PDF، DOC یا DOCX باشد.");
                        event.target.value = "";
                        return;
                      }
                      setError("");
                      setResumeName(file.name);
                    }}
                  />
                  <span>
                    <Icon name="download" />
                  </span>
                  <b>
                    {resumeName ||
                      (fields.accountType === "team"
                        ? "بارگذاری معرفی‌نامه تیم"
                        : "بارگذاری رزومه")}
                  </b>
                  <small>PDF یا DOCX، حداکثر ۱۰ مگابایت</small>
                </label>
                <label className="organization-auth-consent organization-auth-field--wide">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات را تأیید می‌کنم و{" "}
                    <Link href="/legal/terms">قوانین استفاده از راه‌حل</Link> و{" "}
                    <Link href="/legal/privacy">حریم خصوصی</Link> را می‌پذیرم.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="organization-auth-message is-success" role="status">
                {success}
              </p>
            )}

            <button className="organization-auth-submit" type="submit">
              {definition.primaryAction}
            </button>
            {step > 1 && (
              <button
                className="organization-auth-back"
                type="button"
                onClick={() =>
                  navigate(
                    step === 2 ? "/auth/solver/register/type" : "/auth/solver/register/account",
                  )
                }
              >
                بازگشت به مرحله قبل
              </button>
            )}
            {step === 1 && (
              <p className="organization-auth-switch">
                قبلاً حساب ساخته‌اید؟ <Link href="/auth/login?role=solver">ورود فرد یا تیم</Link>
              </p>
            )}
          </form>
        </section>
        <SolverRegistrationVisual step={step} accountType={fields.accountType} />
      </main>
    </div>
  );
}

function AuthRouteExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<"organization" | "solver">("organization");
  const [returnTo, setReturnTo] = useState("");
  const isRegister = definition.path === "/auth/register";
  const isOtp = definition.path === "/auth/otp";
  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "any"));
    if (params.get("role") === "solver") setRole("solver");
  }, []);
  const submit = () => {
    if (!isRegister) {
      const nextError = isOtp ? otpError(value) : identifierError(value);
      if (nextError) {
        setError(nextError);
        return;
      }
    }
    if (isOtp && value.replace(/\s/g, "") !== "12345" && value.replace(/\s/g, "") !== "۱۲۳۴۵") {
      setError("رمز یک‌بارمصرف واردشده صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
      return;
    }
    setError("");
    if (isOtp && returnTo) {
      if (returnTo.startsWith("/app/org/")) signInAsAuthorizedOrganization();
      else createDemoSession("solver", "solver-individual");
      onNotice("ورود انجام شد؛ در حال بازگشت به مسیر درخواست‌شده هستید.");
      window.setTimeout(() => navigateSolverAuth(returnTo), 250);
      return;
    }
    onNotice("اطلاعات معتبر است؛ ورود نمونه با موفقیت انجام شد.");
  };
  return (
    <section className="auth-route-layout container">
      <div className="auth-card auth-card--route">
        <span className="eyebrow">{definition.code}</span>
        <h2>{definition.title}</h2>
        <p>{definition.summary}</p>
        {isRegister ? (
          <div className="auth-role-cards">
            {[
              ["organization", "سازمان مسئله‌گذار", "ثبت، انتشار و مدیریت پرونده"],
              ["solver", "حل‌کننده", "کشف، پیشنهاد و اجرای پایلوت"],
            ].map(([id, title, body]) => (
              <button
                key={id}
                className={role === id ? "active" : ""}
                onClick={() => setRole(id as typeof role)}
              >
                <Icon name={id === "organization" ? "brief" : "people"} />
                <strong>{title}</strong>
                <span>{body}</span>
              </button>
            ))}
          </div>
        ) : (
          <label>
            <span>
              {isOtp
                ? "رمز یک‌بارمصرف"
                : definition.path.includes("recovery")
                  ? "ایمیل یا شماره بازیابی"
                  : "موبایل یا ایمیل"}
            </span>
            <input
              dir="ltr"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              placeholder={isOtp ? "12345" : "example@company.ir"}
            />
          </label>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {isOtp && (
          <div className="otp-meta">
            <span>اعتبار رمز: ۰۱:۴۲</span>
            <button className="text-button">ارسال مجدد پس از پایان شمارش</button>
          </div>
        )}
        {isRegister ? (
          <Link
            className="button button--primary"
            href={`/onboarding/${role}/contact${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          >
            شروع مسیر {role === "organization" ? "سازمان" : "حل‌کننده"}
          </Link>
        ) : (
          <button className="button button--primary" onClick={submit}>
            {definition.primaryAction}
          </button>
        )}
        <div className="auth-safe-note">
          <Icon name="shield" /> خطاها وجود حساب را افشا نمی‌کنند و ورودی حفظ می‌شود.
        </div>
      </div>
      <aside className="auth-route-aside">
        <h3>پس از این مرحله</h3>
        <ol>
          {definition.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link href="/legal/privacy">حریم خصوصی و امنیت حساب</Link>
      </aside>
    </section>
  );
}

function useOrganizationAuthVariant() {
  const [organization, setOrganization] = useState<boolean | null>(null);
  useEffect(() => {
    const params = readSolverAuthParams();
    setOrganization(
      params.get("role") === "organization" || params.get("account") === "organization",
    );
  }, []);
  return organization;
}

function AdaptiveRecoveryExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const organization = useOrganizationAuthVariant();
  if (organization === null) return <div className="solver-code-page" aria-busy="true" />;
  return organization ? (
    <div className="public-page">
      <SiteHeader />
      <main id="main-content">
        <AuthRouteExperience definition={definition} onNotice={onNotice} />
      </main>
    </div>
  ) : (
    <SolverRecoveryExperience />
  );
}

function AdaptiveOtpExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const organization = useOrganizationAuthVariant();
  if (organization === null) return <div className="solver-code-page" aria-busy="true" />;
  return organization ? (
    <div className="public-page">
      <SiteHeader />
      <main id="main-content">
        <AuthRouteExperience definition={definition} onNotice={onNotice} />
      </main>
    </div>
  ) : (
    <SolverOtpLoginExperience />
  );
}

const onboardingSteps = {
  organization: [
    "contact",
    "company",
    "representative",
    "verification",
    "workspace",
    "invite-team",
    "complete",
  ],
  solver: [
    "contact",
    "type",
    "expertise",
    "portfolio",
    "identity",
    "preferences",
    "recommendations",
    "complete",
  ],
} as const;

function OnboardingExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const role = definition.path.includes("/organization/") ? "organization" : "solver";
  const steps = onboardingSteps[role];
  const slug = definition.path.split("/").at(-1) ?? "contact";
  const index = Math.max(0, steps.indexOf(slug as never));
  const previous = index > 0 ? `/onboarding/${role}/${steps[index - 1]}` : "/auth/register";
  const next =
    index < steps.length - 1
      ? `/onboarding/${role}/${steps[index + 1]}`
      : role === "organization"
        ? "/app/org/dashboard"
        : "/app/solver/dashboard";
  const [field, setField] = useState("");
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState("");
  useEffect(() => {
    setReturnTo(
      safeReturnTo(
        readSolverAuthParams().get("returnTo"),
        role === "organization" ? "org" : "solver",
      ),
    );
  }, [role]);
  const withReturnTo = (path: string) =>
    returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
  const complete = slug === "complete";
  const save = () => {
    if (!complete && field.trim().length < 3) {
      setError("این فیلد برای ادامه لازم است؛ مقدار واردشده حفظ شده است.");
      return;
    }
    setError("");
    onNotice("پیش‌نویس همین گام ذخیره شد و برای ادامه آماده است.");
  };
  return (
    <section className="onboarding-layout container">
      <aside className="onboarding-progress">
        <strong>{role === "organization" ? "شروع سازمان" : "شروع حل‌کننده"}</strong>
        <div className="onboarding-progress__bar">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <small>
          گام {(index + 1).toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")}
        </small>
        {steps.map((step, stepIndex) => (
          <span
            key={step}
            className={stepIndex === index ? "active" : stepIndex < index ? "done" : ""}
          >
            {stepIndex < index ? <Icon name="check" /> : (stepIndex + 1).toLocaleString("fa-IR")}
          </span>
        ))}
      </aside>
      <div className="onboarding-card">
        <span className="eyebrow">پیش‌نویس قابل بازیابی</span>
        <h2>{definition.title}</h2>
        <p>{definition.summary}</p>
        {complete ? (
          <div className="completion-receipt">
            <Icon name="check" />
            <h3>شروع همکاری ثبت شد</h3>
            <p>
              رسید <bdi>RC-ONB-1405-882</bdi> ایجاد شد؛ چک‌لیست اقدام بعدی در میز کار قرار دارد.
            </p>
          </div>
        ) : (
          <div className="onboarding-fields">
            <label>
              <span>
                اطلاعات اصلی این گام <b>*</b>
              </span>
              <input
                value={field}
                onChange={(event) => setField(event.target.value)}
                placeholder={
                  slug === "company"
                    ? "نام حقوقی شرکت"
                    : slug === "expertise"
                      ? "مثلاً بازچرخانی آب صنعتی"
                      : "اطلاعات را وارد کنید"
                }
              />
            </label>
            <label>
              <span>یادداشت تکمیلی</span>
              <textarea rows={4} placeholder="زمینه، محدودیت یا توضیح لازم برای بررسی" />
            </label>
            <label className="onboarding-consent">
              <input type="checkbox" /> صحت اطلاعات و نسخه جاری شرایط را تأیید می‌کنم.
            </label>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Link className="button button--secondary" href={withReturnTo(previous)}>
            گام قبل
          </Link>
          <span>
            <Icon name="check" /> ذخیره محلی فعال است
          </span>
          {complete ? (
            <Link
              className="button button--primary"
              href={returnTo || next}
              onClick={() => role === "organization" && signInAsAuthorizedOrganization()}
            >
              {definition.primaryAction}
            </Link>
          ) : (
            <Link
              className="button button--primary"
              href={withReturnTo(next)}
              onClick={(event) => {
                if (field.trim().length < 3) {
                  event.preventDefault();
                  save();
                } else save();
              }}
            >
              ذخیره و ادامه
            </Link>
          )}
        </footer>
      </div>
    </section>
  );
}

function AuthDemo({ onNotice }: { onNotice: (value: string) => void }) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (value.trim().length < 8) {
      setError("شماره موبایل یا ایمیل معتبر وارد کنید؛ داده شما حفظ شده است.");
      return;
    }
    setError("");
    setStep((current) => Math.min(2, current + 1));
    onNotice("رمز نمونه ارسال شد؛ برای ادامه از ۱۲۳۴۵ استفاده کنید.");
  };
  return (
    <section className="auth-demo container">
      <div className="auth-card">
        <div className="step-dots" aria-label={`گام ${step + 1} از ۳`}>
          {[0, 1, 2].map((item) => (
            <span className={item <= step ? "active" : ""} key={item} />
          ))}
        </div>
        <h2>{["ورود یا ساخت حساب", "تأیید رمز یک‌بارمصرف", "قصد شما از ورود"][step]}</h2>
        {step < 2 ? (
          <>
            <label>
              <span>{step === 0 ? "موبایل یا ایمیل" : "رمز ۵ رقمی"}</span>
              <input
                dir="ltr"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-error" : undefined}
              />
            </label>
            {error && (
              <p id="auth-error" className="field-error">
                {error}
              </p>
            )}
            <button className="button button--primary" onClick={submit}>
              ادامه
            </button>
          </>
        ) : (
          <div className="intent-grid">
            {[
              ["حل‌کننده", "/app/solver/profile"],
              ["سازمان مسئله‌گذار", "/app/org/challenges/new"],
              ["بازدیدکننده", "/challenges"],
            ].map(([label, href]) => (
              <Link className="intent-card" href={href} key={href}>
                <Icon name="people" />
                <strong>{label}</strong>
                <span>ادامه با این نما</span>
              </Link>
            ))}
          </div>
        )}
        <p className="form-note">
          <Icon name="shield" /> با ادامه، نسخه ۱.۰ شرایط استفاده را می‌پذیرید.
        </p>
      </div>
    </section>
  );
}

function ChallengeDirectory() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("همه");
  const [category, setCategory] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") ?? "");
    setIndustry(params.get("industry") ?? "همه");
    setCategory(params.get("category") ?? "");
  }, []);
  useEffect(() => {
    const isStandalone = document.documentElement.dataset.challengeStandalone === "true";
    if (isStandalone) {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (industry !== "همه") params.set("industry", industry);
      if (category) params.set("category", category);
      const base = window.location.hash.split("?")[0] || "#/challenges";
      const nextHash = `${base}${params.size ? `?${params.toString()}` : ""}`;
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      return;
    }
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (industry !== "همه") url.searchParams.set("industry", industry);
    else url.searchParams.delete("industry");
    if (category) url.searchParams.set("category", category);
    else url.searchParams.delete("category");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [query, industry, category]);
  const categoryIndustry: Record<string, string> = {
    "energy-environment": "انرژی و آب",
    "biotech-health": "صنایع غذایی",
    "product-experience": "ساخت‌وتولید",
  };
  const filtered = challenges.filter(
    (challenge) =>
      (industry === "همه" || challenge.industry === industry) &&
      (!category ||
        !categoryIndustry[category] ||
        challenge.industry === categoryIndustry[category]) &&
      `${challenge.title} ${challenge.tags.join(" ")}`.includes(query),
  );
  return (
    <section className="directory container">
      <div className="filter-bar">
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی چالش</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در عنوان، مهارت یا فناوری"
          />
        </label>
        <div className="filter-chips" role="group" aria-label="فیلتر صنعت">
          {["همه", "ساخت‌وتولید", "انرژی و آب", "صنایع غذایی"].map((item) => (
            <button
              className={industry === item ? "active" : ""}
              key={item}
              onClick={() => setIndustry(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="result-line">
        <strong>
          {filtered.length.toLocaleString("fa-IR")} چالش
          {category && ` · دسته ${category}`}
        </strong>
        <button
          className="text-button"
          onClick={() => {
            setQuery("");
            setIndustry("همه");
            setCategory("");
          }}
        >
          پاک‌کردن فیلتر
        </button>
      </div>
      <div className="challenge-grid">
        {filtered.map((challenge) => (
          <ChallengeCard key={challenge.id} challenge={challenge} />
        ))}
      </div>
    </section>
  );
}

function ChallengeCard({ challenge }: { challenge: (typeof challenges)[number] }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className="challenge-card">
      <div className="challenge-card__top">
        <span className="status-badge">{challenge.status}</span>
        <button
          className={`bookmark ${saved ? "saved" : ""}`}
          onClick={() => setSaved((v) => !v)}
          aria-pressed={saved}
        >
          {saved ? "ذخیره شد" : "ذخیره"}
        </button>
      </div>
      <span className="challenge-id" dir="ltr">
        {challenge.id}
      </span>
      <h3>
        <Link
          href={
            challenge.slug === "smart-water-recovery"
              ? "/challenges/smart-water-recovery"
              : "/challenges/smart-water-recovery"
          }
        >
          {challenge.title}
        </Link>
      </h3>
      <p>
        {challenge.industry} · {challenge.route}
      </p>
      <div className="tag-row">
        {challenge.tags.slice(0, 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>بودجه</dt>
          <dd>
            {(challenge.budget / 1_000_000_000).toLocaleString("fa-IR", {
              maximumFractionDigits: 1,
            })}{" "}
            میلیارد تومان
          </dd>
        </div>
        <div>
          <dt>مهلت</dt>
          <dd>شهریور ۱۴۰۵</dd>
        </div>
        <div>
          <dt>انتشار</dt>
          <dd>{challenge.visibility}</dd>
        </div>
      </dl>
      <div className="fit">
        <span>تناسب مهارتی</span>
        <strong>{challenge.fit.toLocaleString("fa-IR")}٪</strong>
        <i>
          <b style={{ width: `${challenge.fit}%` }} />
        </i>
      </div>
    </article>
  );
}

function PublicNarrative({ definition }: { definition: RouteDefinition }) {
  return (
    <>
      <section className="public-sections container">
        {definition.sections.map((section, index) => (
          <article className={index === 1 ? "is-accent" : ""} key={section.title}>
            <span className="section-index">۰{index + 1}</span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <ul>
              {section.items.map((item) => (
                <li key={item}>
                  <Icon name="check" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className="process-band">
        <div className="container">
          <span className="eyebrow">مسیر کامل</span>
          <h2>از شروع روشن تا پایان قابل حسابرسی</h2>
          <div className="process-line">
            {definition.steps.map((step, index) => (
              <div key={step}>
                <span>{(index + 1).toLocaleString("fa-IR")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function SimpleFooter() {
  return (
    <footer className="simple-footer">
      <div className="container">
        <Brand inverse />
        <div>
          <Link href="/challenges">چالش‌ها</Link>
          <Link href="/trust">اعتماد</Link>
          <Link href="/guides">راهنما</Link>
          <Link href="/auth">ورود</Link>
        </div>
        <small>همه نام‌ها و داده‌ها نمایشی‌اند · نسخه رابط ۱.۰</small>
      </div>
    </footer>
  );
}

function WorkspaceRoute({ definition }: { definition: RouteDefinition }) {
  const role = definition.role as Exclude<RoleSpace, "public">;
  const [drawer, setDrawer] = useState(false);
  const [state, setState] = useState<DemoState>("default");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirm) confirmButton.current?.focus();
  }, [confirm]);
  const records = useMemo(
    () => definition.records.filter((record) => Object.values(record).join(" ").includes(query)),
    [definition.records, query],
  );
  const nav = sideNavigation[role];
  const roleLabel =
    role === "solver" ? "فضای حل‌کننده" : role === "org" ? "فضای سازمان" : "عملیات پلتفرم";

  return (
    <div className={`workspace workspace--${role}`}>
      <aside className={`workspace-sidebar ${drawer ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <Brand inverse />
          <button
            className="icon-button sidebar-close"
            onClick={() => setDrawer(false)}
            aria-label="بستن منو"
          >
            <Icon name="close" />
          </button>
        </div>
        <span className="workspace-label">{roleLabel}</span>
        <nav aria-label={`ناوبری ${roleLabel}`}>
          {nav.map(([label, href]) => (
            <Link className={definition.path === href ? "active" : ""} href={href} key={href}>
              <span>{label}</span>
              {definition.path === href && <i />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-security">
          <Icon name="shield" />
          <div>
            <strong>دسترسی کنترل‌شده</strong>
            <span>{definition.confidentiality}</span>
          </div>
        </div>
      </aside>
      {drawer && (
        <button
          className="workspace-scrim"
          onClick={() => setDrawer(false)}
          aria-label="بستن ناوبری"
        />
      )}
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            className="icon-button workspace-menu"
            onClick={() => setDrawer(true)}
            aria-label="بازکردن ناوبری"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumbs">
            <Link href="/">راه‌حل</Link>
            <Icon name="chevron" />
            <Link href={`/${role}`}>{roleLabel}</Link>
            <Icon name="chevron" />
            <span>{definition.title}</span>
          </div>
          <div className="topbar-actions">
            <label className="top-search">
              <Icon name="search" />
              <span className="sr-only">جست‌وجوی سراسری</span>
              <input placeholder="جست‌وجو در پرونده‌ها" />
            </label>
            <button className="icon-button" aria-label="اعلان‌ها">
              <Icon name="notification" />
              <i />
            </button>
            <PersonAvatar name="سارا نادری" className="avatar" title="پروفایل کاربر" />
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          <div className="page-heading">
            <div>
              <div className="page-code">
                <span>{definition.code}</span>
                <span className="status-badge">{definition.status}</span>
              </div>
              <h1>{definition.title}</h1>
              <p>{definition.summary}</p>
            </div>
            <div className="page-actions">
              <button className="button button--secondary" onClick={() => setConfirm(true)}>
                ثبت تصمیم
              </button>
              <button
                className="button button--primary"
                onClick={() => setToast("اقدام ثبت شد و مالک مرحله اعلان گرفت.")}
              >
                {definition.primaryAction}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
          <div className="context-banner">
            <div>
              <Icon name="shield" />
              <span>
                <small>سطح دسترسی</small>
                <strong>{definition.confidentiality}</strong>
              </span>
            </div>
            <div>
              <Icon name="people" />
              <span>
                <small>مالک مرحله</small>
                <strong>{definition.owner}</strong>
              </span>
            </div>
            <div>
              <Icon name="history" />
              <span>
                <small>مهلت / SLA</small>
                <strong>{definition.deadline}</strong>
              </span>
            </div>
            <DemoStateSwitcher value={state} onChange={setState} />
          </div>
          <StatusState state={state} onReset={() => setState("default")} />
          {state !== "permission" && state !== "empty" && (
            <>
              <section className="workspace-metrics" aria-label="شاخص‌های کلیدی">
                {definition.metrics.map((metric, index) => (
                  <article key={metric.label}>
                    <span className={`metric-icon metric-icon--${index}`}>
                      <Icon name={index === 0 ? "trend" : index === 1 ? "grid" : "history"} />
                    </span>
                    <div>
                      <small>{metric.label}</small>
                      <strong>{metric.value}</strong>
                      <span>{metric.trend}</span>
                    </div>
                  </article>
                ))}
              </section>
              <section className="content-grid">
                <article className="panel panel--wide">
                  <div className="panel-head">
                    <div>
                      <span className="eyebrow">صف اقدام</span>
                      <h2>کارهای بعدی با اولویت روشن</h2>
                    </div>
                    <label className="table-search">
                      <Icon name="search" />
                      <span className="sr-only">جست‌وجوی رکورد</span>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="جست‌وجو"
                      />
                    </label>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <caption className="sr-only">فهرست اقدام‌های این صفحه</caption>
                      <thead>
                        <tr>
                          {["موضوع", "وضعیت", "مسئول", "موعد"].map((head) => (
                            <th scope="col" key={head}>
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, index) => (
                          <tr key={`${record.موضوع}-${index}`}>
                            <td>
                              <strong>{record.موضوع}</strong>
                              <small dir="ltr">
                                ACT-{definition.code}-{index + 1}
                              </small>
                            </td>
                            <td>
                              <span className={`table-status table-status--${index}`}>
                                {record.وضعیت}
                              </span>
                            </td>
                            <td>{record.مسئول}</td>
                            <td>{record.موعد}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
                <article className="panel timeline-panel">
                  <div className="panel-head">
                    <div>
                      <span className="eyebrow">Timeline</span>
                      <h2>وضعیت پرونده</h2>
                    </div>
                    <button className="icon-button" aria-label="تاریخچه کامل">
                      <Icon name="history" />
                    </button>
                  </div>
                  <ol>
                    {definition.steps.map((step, index) => (
                      <li className={index <= 2 ? "done" : index === 3 ? "current" : ""} key={step}>
                        <span>
                          {index < 3 ? <Icon name="check" /> : (index + 1).toLocaleString("fa-IR")}
                        </span>
                        <div>
                          <strong>{step}</strong>
                          <small>
                            {index < 3
                              ? "ثبت شده با شاهد"
                              : index === 3
                                ? "مرحله فعلی · مالک مشخص"
                                : "پس از عبور کنترل"}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </article>
              </section>
              <section className="panel tabs-panel">
                <div className="tabs" role="tablist" aria-label="جزئیات صفحه">
                  {[
                    ["overview", "جزئیات"],
                    ["evidence", "شواهد و کنترل"],
                    ["history", "نسخه و تاریخچه"],
                  ].map(([id, label]) => (
                    <button
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                      key={id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="tab-content" role="tabpanel">
                  {definition.sections.map((section, index) => (
                    <article
                      className={
                        tab === "overview" && index > 0
                          ? "tab-muted"
                          : tab === "evidence" && index !== 1
                            ? "tab-muted"
                            : tab === "history" && index !== 2
                              ? "tab-muted"
                              : ""
                      }
                      key={section.title}
                    >
                      <span className="section-number">۰{index + 1}</span>
                      <h3>{section.title}</h3>
                      <p>{section.description}</p>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item}>
                            <Icon name="check" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
              <ContextualModule code={definition.code} />
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
      {confirm && (
        <div className="modal-layer" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <span className="dialog-icon">
              <Icon name="shield" />
            </span>
            <h2 id="confirm-title">پیش از ثبت تصمیم</h2>
            <p>
              وضعیت، دلیل و شواهد این تصمیم در تاریخچه تغییرناپذیر ثبت می‌شوند و افراد مرتبط اعلان
              می‌گیرند.
            </p>
            <label>
              <span>برای تأیید عبارت «ثبت تصمیم» را بررسی کنید</span>
              <input defaultValue="ثبت تصمیم" />
            </label>
            <div className="dialog-actions">
              <button className="button button--secondary" onClick={() => setConfirm(false)}>
                انصراف
              </button>
              <button
                ref={confirmButton}
                className="button button--primary"
                onClick={() => {
                  setConfirm(false);
                  setToast("تصمیم نمونه با کد دلیل RH-DEMO ثبت شد.");
                }}
              >
                تأیید و ثبت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextualModule({ code }: { code: string }) {
  if (code.includes("10") && !code.startsWith("SOL"))
    return (
      <section className="panel contextual">
        <h2>ظرفیت و تعارض داوران</h2>
        <div className="mini-people">
          {reviewers.slice(0, 4).map((reviewer) => (
            <article key={reviewer.id}>
              <PersonAvatar name={reviewer.name} className="avatar" />
              <div>
                <strong>{reviewer.name}</strong>
                <small>{reviewer.expertise}</small>
                <i>
                  <b style={{ width: `${reviewer.progress}%` }} />
                </i>
              </div>
              <span className={reviewer.coi === "بدون تعارض" ? "good" : "warn"}>
                {reviewer.coi}
              </span>
            </article>
          ))}
        </div>
      </section>
    );
  if (code.includes("13") || code === "SOL-10" || code === "OPS-06")
    return (
      <section className="panel contextual">
        <h2>رکوردهای مالی متصل</h2>
        <div className="finance-list">
          {financeRecords.map((record) => (
            <article key={record.id}>
              <bdi>{record.id}</bdi>
              <div>
                <strong>{record.title}</strong>
                <small>{record.reason}</small>
              </div>
              <span>{record.amount}</span>
              <em>{record.status}</em>
            </article>
          ))}
        </div>
      </section>
    );
  if (code.includes("14") || code === "SOL-11")
    return (
      <section className="panel contextual">
        <h2>سلامت پایلوت‌ها</h2>
        <div className="pilot-list">
          {pilots.map((pilot) => (
            <article key={pilot.id}>
              <div>
                <strong>{pilot.title}</strong>
                <small>
                  {pilot.owner} · {pilot.impact}
                </small>
              </div>
              <span>{pilot.progress.toLocaleString("fa-IR")}٪</span>
              <i>
                <b style={{ width: `${pilot.progress}%` }} />
              </i>
            </article>
          ))}
        </div>
      </section>
    );
  if (code.includes("09") || code === "SOL-08")
    return (
      <section className="panel contextual">
        <h2>نمونه راهکارهای متصل</h2>
        <div className="submission-list">
          {submissions.slice(0, 5).map((submission) => (
            <article key={submission.id}>
              <bdi>{submission.id}</bdi>
              <strong>{submission.team}</strong>
              <span>{submission.status}</span>
              <em>
                {submission.score
                  ? `${submission.score.toLocaleString("fa-IR")} از ۱۰۰`
                  : "بدون امتیاز نهایی"}
              </em>
            </article>
          ))}
        </div>
      </section>
    );
  return null;
}

export function PortalPage({ definition }: { definition: RouteDefinition }) {
  const legacy = getLegacyResolution(definition.path);
  if (legacy?.kind === "redirect") return <LegacyRedirect target={legacy.target} />;
  if (legacy?.kind === "unavailable") return <LegacyUnavailable resolution={legacy} />;
  if (definition.path === "/challenges") return <ChallengeDiscoveryApp publicMode />;
  return definition.role === "public" ? (
    <PublicRoute definition={definition} />
  ) : (
    <WorkspaceRoute definition={definition} />
  );
}
