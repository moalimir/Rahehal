"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { SolverWorkspaceShell, type SolverSpace, useSolverSpace } from "@/components/solver-shell";

const intellectualPropertySections = [
  {
    id: "knowledge",
    badge: "بخش ۱",
    title: "آنچه باید بدانید",
    description: "اطلاعات اصلی این مرحله",
    icon: "spark" as const,
    items: ["مالک IP پیشین", "زمان انتقال IP ایجادشده", "مجوز انحصاری یا غیرانحصاری"],
  },
  {
    id: "control",
    badge: "بخش ۲",
    title: "کنترل و اعتماد",
    description: "قواعدی که تصمیم را قابل پیگیری می‌کند",
    icon: "shield" as const,
    items: ["قلمرو و مدت", "مالک داده و حذف", "وابستگی انتقال به پرداخت"],
  },
  {
    id: "next",
    badge: "بخش ۳",
    title: "اقدام بعدی",
    description: "مرور موارد پایان کار",
    icon: "brief" as const,
    items: ["ثبت رضایت پیشنهاد", "مقایسه نسخه قرارداد", "تأیید حقوقی"],
  },
];

export function IntellectualPropertyGuidePage({
  space: suppliedSpace,
}: {
  space?: SolverSpace;
} = {}) {
  const detectedSpace = useSolverSpace();
  const space = suppliedSpace ?? detectedSpace;
  const [active, setActive] = useState(intellectualPropertySections[0].id);

  const goTo = (id: string) => {
    setActive(id);
    document.getElementById(`ip-guide-${id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <SolverWorkspaceShell active="guide" currentPath="/guides/intellectual-property" space={space}>
      <div className="rh-ip-guide">
        <nav className="rh-ip-guide__breadcrumb" aria-label="مسیر صفحه">
          <Link href={`/app/solver/dashboard?space=${space}`}>فضای کاری</Link>
          <span>/</span>
          <Link href="/guides/intellectual-property">مرکز راهنما</Link>
          <span>/</span>
          <strong>حقوق و مالکیت فکری</strong>
        </nav>

        <section className="rh-ip-guide__hero" aria-labelledby="ip-guide-title">
          <article className="rh-card rh-ip-guide__intro">
            <div className="rh-ip-guide__hero-icon">
              <Icon name="lock" />
            </div>
            <div>
              <span>مرکز راهنما</span>
              <h1 id="ip-guide-title">راهنمای مالکیت فکری</h1>
              <p>
                مالکیت نتیجه، مجوز استفاده و نحوه انتقال حقوق را پیش از ارسال پیشنهاد شفاف کنید.
              </p>
              <div>
                <button type="button" onClick={() => goTo("knowledge")}>
                  مرور بندهای IP <Icon name="arrow" />
                </button>
                <button type="button" className="is-secondary" onClick={() => goTo("control")}>
                  مشاهده راهنما
                </button>
              </div>
            </div>
          </article>

          <aside className="rh-card rh-ip-guide__legal-meta">
            <header>
              <span className="live-dot" />
              <strong>نسخه حقوقی ۱.۰</strong>
            </header>
            <dl>
              <div>
                <dt>
                  <Icon name="people" /> مسئول
                </dt>
                <dd>تیم محصول راه‌حل</dd>
              </div>
              <div>
                <dt>
                  <Icon name="history" /> مهلت / SLA
                </dt>
                <dd>زمان تهران · نمونه نمایشی</dd>
              </div>
              <div>
                <dt>
                  <Icon name="lock" /> سطح دسترسی
                </dt>
                <dd>عمومی و کنترل‌شده</dd>
              </div>
            </dl>
            <div className="rh-ip-guide__progress">
              <i>
                <b />
              </i>
              <small>آمادگی برای اقدام بعدی: ۷۴٪</small>
            </div>
          </aside>
        </section>

        <section className="rh-ip-guide__metrics" aria-label="وضعیت راهنما">
          <article>
            <Icon name="check" />
            <div>
              <span>وضعیت</span>
              <strong>فعال</strong>
              <small>نمونه نمایشی</small>
            </div>
          </article>
          <article>
            <Icon name="brief" />
            <div>
              <span>ردپای اقدام</span>
              <strong>ثبت‌شده</strong>
              <small>نسخه‌دار</small>
            </div>
          </article>
          <article>
            <Icon name="grid" />
            <div>
              <span>پشتیبانی</span>
              <strong>RTL</strong>
              <small>دسکتاپ و موبایل</small>
            </div>
          </article>
        </section>

        <div className="rh-ip-guide__body">
          <div className="rh-ip-guide__sections">
            {intellectualPropertySections.map((section) => (
              <section
                className="rh-card rh-ip-guide__section"
                id={`ip-guide-${section.id}`}
                key={section.id}
                onMouseEnter={() => setActive(section.id)}
              >
                <header>
                  <div className="rh-ip-guide__section-icon">
                    <Icon name={section.icon} />
                  </div>
                  <div>
                    <span>{section.badge}</span>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>
                </header>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>
                      <Icon name="check" /> {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <aside className="rh-ip-guide__audit-note">
              <Icon name="shield" />
              <div>
                <strong>اقدام حساس همیشه مسیر و تاریخچه دارد</strong>
                <p>پیام موفقیت جایگزین سند پذیرفته‌شده، رسید یا رویداد حسابرسی نیست.</p>
              </div>
            </aside>
          </div>

          <aside className="rh-card rh-ip-guide__toc" aria-label="فهرست این صفحه">
            <strong>در این صفحه</strong>
            {intellectualPropertySections.map((section) => (
              <button
                type="button"
                className={active === section.id ? "is-active" : ""}
                onClick={() => goTo(section.id)}
                key={section.id}
              >
                {section.title}
              </button>
            ))}
            <Link href="/guides">مرکز راهنما</Link>
          </aside>
        </div>
      </div>
    </SolverWorkspaceShell>
  );
}
