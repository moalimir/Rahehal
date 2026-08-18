"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { CaseNav } from "@/components/internal/case-pages";
import { auditEvents, challenges } from "@/data/fixtures/internal";
import { CaseHeader, Panel, StatusBadge } from "@/components/internal/shared";
import type { PageProps } from "@/components/internal/page-contracts";

export function ResourcePage({ route, onAction }: PageProps) {
  const configs = {
    documents: [
      "اسناد و سطح دسترسی",
      ["صورت‌مسئله قفل‌شده", "توافق محرمانگی تیم نوآب", "معیارنامه داوری", "گزارش آزمون"],
    ],
    conversations: [
      "گفت‌وگوهای پرونده",
      ["شفاف‌سازی روش اندازه‌گیری", "هماهنگی بازدید سایت", "پرسش حقوقی درباره داده"],
    ],
    audit: ["تاریخچه غیرقابل‌تغییر", auditEvents.map((item) => item.action)],
    reports: [
      "گزارش‌های چرخه و اثر",
      ["گزارش گلوگاه داوری", "سبد بودجه و تعهد", "اثر پایلوت‌ها", "SLA و مسئولیت"],
    ],
    team: [
      "اعضا، نقش‌ها و دسترسی",
      [
        "سارا نادری · مدیر نوآوری",
        "امیر توکلی · بازبین فنی",
        "مریم عزیزی · حقوقی",
        "علی محمدی · مالی",
      ],
    ],
    settings: [
      "سیاست‌ها و تنظیمات",
      ["امنیت و 2FA", "اعلان‌ها و SLA", "محرمانگی و retention", "قالب‌ها و taxonomy"],
    ],
    profile: [
      "پروفایل حرفه‌ای",
      ["تخصص‌ها و صنایع", "سوابق و شواهد", "ظرفیت همکاری", "حریم فیلدبه‌فیلد"],
    ],
    eligibility: ["شرایط مشارکت", ["هویت معتبر", "تخصص مرتبط", "ظرفیت اعلام‌شده", "عدم تعارض"]],
    "data-room": [
      "اتاق داده کنترل‌شده",
      ["ضمیمه فنی A", "داده خط پایه", "نقشه فرایند", "FAQ محرمانه"],
    ],
    reputation: [
      "سابقه تأییدشده",
      ["پایلوت پذیرفته‌شده", "تحویل به‌موقع", "بازخورد معیارمحور", "مدرک معتبر"],
    ],
  } as const;
  const [title, items] = configs[route.experience as keyof typeof configs] ?? [
    route.title,
    ["رکورد نمونه ۱", "رکورد نمونه ۲"],
  ];
  return (
    <>
      {route.role === "org" && route.path.includes("/sample/") && (
        <>
          <CaseHeader />
          <CaseNav current={route.path} />
        </>
      )}
      <div className="app-layout">
        <Panel title={title} eyebrow="داده نمونه و قابل حسابرسی" className="app-panel--wide">
          <div className="app-resource-list">
            {items.map((item, index) => (
              <article key={item}>
                <span className="app-resource-icon">
                  <Icon
                    name={
                      route.experience === "team"
                        ? "people"
                        : route.experience === "settings"
                          ? "shield"
                          : "brief"
                    }
                  />
                </span>
                <div>
                  <strong>{item}</strong>
                  <small>
                    {route.experience === "audit"
                      ? auditEvents[index]?.time
                      : `آخرین تغییر ${(index + 1).toLocaleString("fa-IR")} روز پیش · دسترسی کنترل‌شده`}
                  </small>
                </div>
                <StatusBadge tone={index === 2 ? "warning" : "success"}>
                  {index === 2 ? "نیازمند بررسی" : "معتبر"}
                </StatusBadge>
                <button className="app-row-action" onClick={() => onAction(`بازکردن ${item}`)}>
                  جزئیات <Icon name="chevron" />
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="کنترل دسترسی" eyebrow="Deny by default">
          <div className="app-access-card">
            <Icon name="shield" />
            <h3>دسترسی پرونده‌ای فعال</h3>
            <p>
              نقش پایه به‌تنهایی کافی نیست. این دسترسی تا ۳۱ شهریور ۱۴۰۵ و فقط برای دامنه مشخص معتبر
              است.
            </p>
            <dl>
              <div>
                <dt>مشاهده</dt>
                <dd>مجاز</dd>
              </div>
              <div>
                <dt>دریافت</dt>
                <dd>{route.experience === "data-room" ? "با watermark" : "طبق نقش"}</dd>
              </div>
              <div>
                <dt>اشتراک</dt>
                <dd>غیرمجاز</dd>
              </div>
            </dl>
            <button
              className="app-button app-button--secondary app-button--full"
              onClick={() => onAction("بازبینی دسترسی", { sensitive: true, reason: true })}
            >
              بازبینی دسترسی
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}

export function OpportunitiesPage({ route, onAction }: PageProps) {
  const invitations = route.experience === "invitations";
  const isSelectedChallenge = route.path.endsWith("/smart-water-recovery");
  if (isSelectedChallenge) {
    return (
      <div className="app-opportunity-detail">
        <Panel
          title="بازیابی هوشمند آب در خط شست‌وشوی صنعتی"
          eyebrow="چالش انتخاب‌شده · CH-1405-021"
        >
          <div className="app-opportunity-detail__summary">
            <div>
              <StatusBadge tone="info">۹۴٪ تطابق تیم</StatusBadge>
              <p>
                هدف، کاهش حداقل ۲۵٪ مصرف آب خط سوم بدون افت شاخص پاکیزگی است. شرایط مشارکت، بودجه
                پایلوت و دامنه NDA پیش از شروع پیشنهاد مشخص شده‌اند.
              </p>
            </div>
            <dl>
              <div>
                <dt>بودجه پایلوت</dt>
                <dd>۲٫۸ میلیارد تومان</dd>
              </div>
              <div>
                <dt>مهلت</dt>
                <dd>۳۱ شهریور ۱۴۰۵</dd>
              </div>
              <div>
                <dt>وضعیت</dt>
                <dd>دریافت راهکار</dd>
              </div>
            </dl>
          </div>
          <div className="app-opportunity-detail__actions">
            <Link
              className="app-button app-button--secondary"
              href="/app/solver/opportunities/smart-water-recovery"
            >
              بازگشت به جزئیات پروژه
            </Link>
            <button
              className="app-button app-button--primary"
              onClick={() => onAction("شروع پیشنهاد CH-1405-021")}
            >
              شروع پیشنهاد برای این چالش
            </button>
          </div>
        </Panel>
      </div>
    );
  }
  return (
    <Panel
      title={invitations ? "دعوت‌های من" : "فرصت‌های متناسب"}
      eyebrow={invitations ? "پاسخ، انقضا و NDA" : "تطبیق توضیح‌پذیر"}
    >
      <div className="app-opportunity-grid">
        {challenges.slice(0, 3).map((item, index) => (
          <article key={item.id}>
            <header>
              <StatusBadge tone={index === 0 ? "danger" : "info"}>
                {invitations
                  ? index === 0
                    ? "پاسخ تا فردا"
                    : "دعوت فعال"
                  : `${(94 - index * 7).toLocaleString("fa-IR")}٪ تطابق`}
              </StatusBadge>
              <span>{item.privacy}</span>
            </header>
            <bdi>{item.id}</bdi>
            <h3>{item.title}</h3>
            <p>
              {invitations
                ? "دعوت توسط سازمان نمونه · دامنه افشا پس از پذیرش NDA"
                : "تطابق در تخصص، صنعت و ظرفیت؛ تصمیم نهایی با شماست."}
            </p>
            <ul>
              <li>
                <Icon name="brief" />
                بودجه پایلوت ۶۰۰ تا ۹۰۰ میلیون تومان
              </li>
              <li>
                <Icon name="history" />
                مهلت ۲۵ مرداد ۱۴۰۵
              </li>
              <li>
                <Icon name="shield" />
                شرایط مشارکت ۴ از ۴
              </li>
            </ul>
            <button
              className="app-button app-button--primary"
              onClick={() =>
                onAction(
                  invitations ? `پذیرش دعوت ${item.id}` : `مشاهده فرصت ${item.id}`,
                  invitations ? { sensitive: true } : undefined,
                )
              }
            >
              {invitations ? "بررسی و پاسخ" : "مشاهده جزئیات"}
            </button>
          </article>
        ))}
      </div>
    </Panel>
  );
}
