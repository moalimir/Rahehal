"use client";

import Link from "next/link";
import Image from "next/image";
import heroImage from "@/public/images/hero/industrial-team.webp";
import processValveImage from "@/public/images/landing/process-valve.webp";
import processLabImage from "@/public/images/landing/process-lab.webp";
import categoryEnergyImage from "@/public/images/landing/category-energy.webp";
import categoryHealthImage from "@/public/images/landing/category-health.webp";
import categoryDesignImage from "@/public/images/landing/category-design.webp";
import categoryResearchImage from "@/public/images/landing/category-research.webp";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PublicFooter } from "@/components/site-footer";
import { Icon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";

const companyShowcase = [
  { name: "ایرانسل", sector: "ارتباطات دیجیتال", projects: 7, logo: "irancell", slug: "irancell" },
  {
    name: "دیجی‌کالا",
    sector: "تجارت الکترونیک و داده",
    projects: 9,
    logo: "digikala",
    slug: "digikala",
  },
  { name: "اسنپ", sector: "خدمات هوشمند شهری", projects: 6, logo: "snapp", slug: "snapp" },
  {
    name: "اسنپ‌فود",
    sector: "فناوری غذا و لجستیک",
    projects: 5,
    logo: "snappfood",
    slug: "snappfood",
  },
] as const;

const projectCategories = [
  {
    title: "انرژی و محیط‌زیست",
    description: "بهره‌وری انرژی، آب، پسماند و اقتصاد چرخشی",
    projects: 8,
    image: categoryEnergyImage,
    slug: "energy-environment",
  },
  {
    title: "زیست‌فناوری و سلامت",
    description: "تشخیص، مواد زیستی و راهکارهای سلامت صنعتی",
    projects: 6,
    image: categoryHealthImage,
    slug: "biotech-health",
  },
  {
    title: "طراحی محصول و تجربه",
    description: "محصول دیجیتال، خدمات و تجربه کاربری سازمانی",
    projects: 7,
    image: categoryDesignImage,
    slug: "product-experience",
  },
  {
    title: "پژوهش و توسعه",
    description: "پژوهش کاربردی، آزمون فناوری و توسعه مشترک",
    projects: 10,
    image: categoryResearchImage,
    slug: "research-development",
  },
] as const;

const lifecycle = [
  "ثبت مسئله سازمانی",
  "بررسی و انتشار چالش",
  "دریافت و ارزیابی راه‌حل‌ها",
  "انتخاب، اجرا و سنجش اثر",
] as const;

const featuredUniversities = [
  { name: "دانشگاه صنعتی شریف", key: "sharif" },
  { name: "دانشگاه تهران", key: "tehran" },
  { name: "دانشگاه صنعتی امیرکبیر", key: "amirkabir" },
  { name: "دانشگاه علم و صنعت ایران", key: "science-industry" },
] as const;

function TrustMark({ index }: { index: number }) {
  const paths = [
    <>
      <path d="M32 7 39 17l11 2-5 10 3 11-11 1-8 8-7-9-11-2 2-11-6-9 10-4Z" />
      <circle cx="29" cy="28" r="9" />
    </>,
    <>
      <circle cx="30" cy="29" r="18" />
      <path d="M30 11c-9 8-12 17-8 27M39 14c-7 8-9 17-4 28" />
    </>,
    <>
      <path d="m30 8 9 15-9 7-9-7Z" />
      <path d="M12 44h36L40 33H20Z" />
    </>,
    <>
      <path d="m30 7 20 12v22L30 53 10 41V19Z" />
      <path d="m19 24 11-7 12 7v12l-12 7-11-7 11-6 7 4" />
    </>,
  ];
  return (
    <svg className="reference-hero__mark" viewBox="0 0 60 60" focusable="false">
      {paths[index]}
    </svg>
  );
}

export function LandingPage() {
  const [showTop, setShowTop] = useState(false);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const categoryRailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const setRailPosition = (rail: HTMLDivElement | null, index: number) => {
    const target = rail?.children.item(index) as HTMLElement | null;
    if (!rail || !target) return;
    const railBox = rail.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    rail.scrollBy({
      left: targetBox.left - railBox.left - (railBox.width - targetBox.width) / 2,
      behavior: "smooth",
    });
  };

  const moveRail = (
    rail: HTMLDivElement | null,
    setIndex: Dispatch<SetStateAction<number>>,
    total: number,
    direction: 1 | -1,
  ) => {
    setIndex((current) => {
      const next = (current + direction + total) % total;
      setRailPosition(rail, next);
      return next;
    });
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setCategoryIndex((current) => {
        const next = (current + 1) % projectCategories.length;
        setRailPosition(categoryRailRef.current, next);
        return next;
      });
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  const syncCategoryIndex = (rail: HTMLDivElement | null) => {
    if (!rail) return;
    window.requestAnimationFrame(() => {
      const railBox = rail.getBoundingClientRect();
      const center = railBox.left + railBox.width / 2;
      const children = [...rail.children] as HTMLElement[];
      const nearest = children.reduce(
        (best, child, index) => {
          const box = child.getBoundingClientRect();
          const distance = Math.abs(box.left + box.width / 2 - center);
          return distance < best.distance ? { index, distance } : best;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY },
      );
      setCategoryIndex(nearest.index);
    });
  };

  return (
    <div className="landing">
      <SiteHeader variant="home" />
      <main id="main-content">
        <section className="reference-hero" aria-labelledby="reference-hero-title">
          <div className="reference-hero__content">
            <p className="reference-hero__kicker">پلتفرم نوآوری باز و حل مسئله سازمانی</p>
            <h1 id="reference-hero-title">
              <span>مسئله‌های واقعی،</span>
              <span>راه‌حل‌های اثرگذار</span>
            </h1>
            <p className="reference-hero__description">
              سازمان‌ها چالش‌های خود را منتشر می‌کنند و متخصصان،
              <br className="reference-hero__desktop-break" /> تیم‌ها و شرکت‌های نوآور برای حل آن‌ها
              راه‌حل ارائه می‌دهند.
            </p>
            <div className="reference-hero__actions">
              <Link className="reference-hero__primary" href="/app/org/challenges/new">
                ثبت مسئله سازمانی
              </Link>
              <Link className="reference-hero__secondary" href="/challenges">
                مشاهده چالش‌ها
              </Link>
            </div>
            <div className="reference-hero__trust">
              <div className="reference-hero__marks" aria-label="نشان‌های همراهان راه‌حل">
                {[0, 1, 2, 3].map((mark) => (
                  <TrustMark key={mark} index={mark} />
                ))}
              </div>
              <p>همراه سازمان‌ها و تیم‌های نوآور</p>
            </div>
          </div>
          <div className="reference-hero__media">
            <div className="reference-hero__image-frame">
              <Image
                src={heroImage}
                alt="سه متخصص ایرانی در حال بررسی نقشه فنی و یک قطعه صنعتی"
                fill
                sizes="(max-width: 900px) 116vw, (max-width: 1200px) 66vw, min(64.5vw, 1030px)"
                priority
              />
            </div>
          </div>
        </section>

        <section
          className="company-showcase company-showcase--redesigned"
          aria-labelledby="company-showcase-title"
        >
          <div className="landing-redesign-container">
            <div className="redesign-section-heading">
              <div>
                <span className="eyebrow">سازمان‌های مسئله‌گذار</span>
                <h2 id="company-showcase-title">شرکت‌ها و صنایع فعال در راه‌حل</h2>
                <p>
                  با سازمان‌هایی آشنا شوید که چالش‌های واقعی خود را با جامعه متخصصان به اشتراک
                  گذاشته‌اند.
                </p>
              </div>
              <Link className="redesign-outline-link" href="/organizations">
                <span aria-hidden="true">←</span> مشاهده همه شرکت‌ها
              </Link>
            </div>
            <div className="redesigned-company-grid">
              {companyShowcase.map((company) => (
                <Link
                  className={`redesigned-company-card redesigned-company-card--${company.logo}`}
                  href={`/organizations/${company.slug}`}
                  key={company.name}
                >
                  <span
                    className={`company-logo-image company-logo-image--${company.logo}`}
                    role="img"
                    aria-label={`نشان ${company.name}`}
                  />
                  <strong>{company.name}</strong>
                  <small>{company.sector}</small>
                  <span className="redesigned-company-card__footer">
                    <b>
                      <i aria-hidden="true" />
                      {company.projects.toLocaleString("fa-IR")} چالش فعال
                    </b>
                    <em aria-hidden="true">‹</em>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="process-redesign" id="how" aria-labelledby="process-redesign-title">
          <div className="landing-redesign-container process-redesign__grid">
            <div className="process-redesign__copy">
              <span className="eyebrow">نحوه کار راه‌حل</span>
              <h2 id="process-redesign-title">
                از مسئله تا راه‌حل،
                <br /> در یک مسیر شفاف
              </h2>
              <p>
                راه‌حل بستری برای اتصال مسئله‌های واقعی سازمان‌ها به توانمندی‌های نوآورانه و اجرای
                راه‌حل‌های اثربخش است.
              </p>
              <ol className="process-redesign__steps">
                {lifecycle.map((step, index) => (
                  <li key={step}>
                    <span>{(index + 1).toLocaleString("fa-IR")}</span>
                    <strong>{step}</strong>
                    <i aria-hidden="true" />
                  </li>
                ))}
              </ol>
            </div>
            <div className="process-redesign__visual" aria-label="نمایش تصویری مسیر اجرای راه‌حل">
              <Image
                src={processValveImage}
                width={749}
                height={387}
                alt="تجهیز پمپ و شیرآلات در یک خط صنعتی"
                loading="lazy"
              />
              <span className="process-redesign__connector" aria-hidden="true">
                <i />
              </span>
              <Image
                src={processLabImage}
                width={749}
                height={311}
                alt="میز آزمون و تجهیز اندازه‌گیری صنعتی"
                loading="lazy"
              />
              <span className="process-redesign__approved">
                راه‌حل تأیید شد <i aria-hidden="true">✓</i>
              </span>
            </div>
          </div>
        </section>

        <section
          className="project-categories project-categories--redesigned"
          id="challenges"
          aria-labelledby="categories-title"
        >
          <div className="landing-redesign-container">
            <div className="redesign-section-heading redesign-section-heading--categories">
              <div>
                <span className="eyebrow">دسته‌بندی پروژه‌ها</span>
                <h2 id="categories-title">مسئله‌ای متناسب با تخصص خود پیدا کنید</h2>
                <p>
                  از میان حوزه‌های تخصصی، مسیر مناسب را انتخاب کنید و پروژه‌های فعال را بررسی کنید.
                </p>
              </div>
              <Link className="redesign-outline-link" href="/challenges/">
                <span aria-hidden="true">←</span> مشاهده همه پروژه‌ها
              </Link>
            </div>
            <div className="project-category-carousel">
              <button
                className="project-carousel-button project-carousel-button--previous"
                type="button"
                onClick={() =>
                  moveRail(categoryRailRef.current, setCategoryIndex, projectCategories.length, -1)
                }
                aria-label="دسته‌بندی‌های قبلی"
              >
                <span aria-hidden="true">←</span>
              </button>
              <div
                className="project-category-rail"
                ref={categoryRailRef}
                tabIndex={0}
                role="region"
                aria-label="دسته‌بندی پروژه‌ها"
                onScroll={(event) => syncCategoryIndex(event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  moveRail(
                    categoryRailRef.current,
                    setCategoryIndex,
                    projectCategories.length,
                    event.key === "ArrowLeft" ? 1 : -1,
                  );
                }}
              >
                {projectCategories.map((category) => (
                  <Link
                    className="project-category-card"
                    href={`/challenges/?category=${category.slug}`}
                    key={category.title}
                  >
                    <Image
                      className="project-category-card__image"
                      src={category.image}
                      width={294}
                      height={337}
                      alt={`تصویر حوزه ${category.title}`}
                      loading="lazy"
                    />
                    <strong>{category.title}</strong>
                    <p>{category.description}</p>
                    <span className="project-category-card__footer">
                      <em>
                        مشاهده پروژه‌ها <span aria-hidden="true">‹</span>
                      </em>
                      <b>{category.projects.toLocaleString("fa-IR")} پروژه</b>
                    </span>
                  </Link>
                ))}
              </div>
              <button
                className="project-carousel-button project-carousel-button--next"
                type="button"
                onClick={() =>
                  moveRail(categoryRailRef.current, setCategoryIndex, projectCategories.length, 1)
                }
                aria-label="دسته‌بندی‌های بعدی"
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="project-category-pagination" aria-label="انتخاب دسته‌بندی">
              {projectCategories.map((category, index) => (
                <button
                  className={categoryIndex === index ? "active" : ""}
                  type="button"
                  aria-label={`نمایش ${category.title}`}
                  aria-current={categoryIndex === index}
                  onClick={() => {
                    setCategoryIndex(index);
                    setRailPosition(categoryRailRef.current, index);
                  }}
                  key={category.title}
                >
                  <span className="sr-only">{category.title}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="university-showcase" aria-labelledby="university-showcase-title">
          <div className="landing-redesign-container">
            <div className="university-showcase__heading">
              <div className="university-showcase__copy">
                <div className="university-showcase__topline">
                  <span className="eyebrow">شبکه استعدادهای دانشگاهی</span>
                </div>
                <h2 id="university-showcase-title">تیم‌های دانشگاهی؛ آماده حل چالش‌های واقعی</h2>
                <p>
                  با تیم‌های متخصص و مسئله‌محور برخاسته از دانشگاه‌های برتر آشنا شوید و مسیر همکاری
                  را آغاز کنید.
                </p>
              </div>
              <div className="university-network-art" aria-hidden="true" />
            </div>

            <div className="university-showcase__card-actions">
              <Link className="university-showcase__all" href="/universities">
                مشاهده همه تیم‌های دانشگاهی <span aria-hidden="true">←</span>
              </Link>
            </div>

            <div className="featured-university-grid">
              {featuredUniversities.map((university) => (
                <Link
                  className="featured-university-card"
                  href={`/universities?university=${university.key}`}
                  key={university.key}
                >
                  <span
                    className={`university-logo university-logo--${university.key}`}
                    role="img"
                    aria-label={`نشان ${university.name}`}
                  />
                  <strong>{university.name}</strong>
                  <small>تیم‌های دانشگاهی</small>
                  <span className="featured-university-card__link">
                    مشاهده تیم‌ها <b aria-hidden="true">←</b>
                  </span>
                </Link>
              ))}
            </div>

            <div className="university-showcase__footer">
              <p>
                <Icon name="search" /> کشف تیم‌ها بر اساس دانشگاه و حوزه تخصصی
              </p>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
      <button
        className={`back-to-top ${showTop ? "show" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="بازگشت به بالای صفحه"
      >
        <Icon name="arrow" />
      </button>
    </div>
  );
}
