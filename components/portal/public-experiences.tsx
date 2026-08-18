"use client";

import Link from "next/link";
import type { StaticImageData } from "next/image";
import { useEffect, useMemo, useState } from "react";
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
import { Icon } from "@/components/icons";
import { OrganizationLogo as OrganizationLogoAsset } from "@/components/challenge-organization-logo";
import {
  organizationIndustryLabels,
  organizationProfiles,
  type OrganizationIndustry,
  type OrganizationLogo,
} from "@/data/organization-profiles";
import { getOrganization } from "@/data/organization-registry";
import type { RouteDefinition } from "@/types";

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

export function OrganizationDirectoryExperience() {
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

export function UniversityDirectoryExperience() {
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

export function OrganizationExperience({ definition }: { definition: RouteDefinition }) {
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

export function ProcessExperience({ definition }: { definition: RouteDefinition }) {
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

export function PolicyExperience({ definition }: { definition: RouteDefinition }) {
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
