"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { PersonAvatar } from "@/components/person-avatar";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { LegacyUnavailable } from "@/components/route-fallbacks";
import { IntellectualPropertyGuidePage } from "@/components/intellectual-property-guide";
import { getLegacyResolution } from "@/data/legacy-redirects";
import { challenges, financeRecords, pilots, reviewers, submissions } from "@/data/mock";
import type { DemoState, RoleSpace, RouteDefinition } from "@/types";
import {
  OrganizationDirectoryExperience,
  OrganizationExperience,
  PolicyExperience,
  ProcessExperience,
  UniversityDirectoryExperience,
} from "@/components/portal/public-experiences";
import {
  AdaptiveOtpExperience,
  AdaptiveRecoveryExperience,
  AuthRouteExperience,
  OrganizationAuthExperience,
  SolverLoginExperience,
} from "@/components/portal/auth-experiences";
import { OnboardingExperience } from "@/components/portal/onboarding-experience";
import { SolverRegistrationExperience } from "@/components/portal/registration-experiences";

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
