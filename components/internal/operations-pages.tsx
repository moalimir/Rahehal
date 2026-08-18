"use client";

import { Icon } from "@/components/icons";
import { MetricCard, Panel, StatusBadge } from "@/components/internal/shared";
import { statusTone, type PageProps } from "@/components/internal/page-contracts";

export function OpsPage({ route, onAction }: PageProps) {
  const queue = [
    {
      id: "OPS-882",
      title: "کنترل انتشار CH-1405-021",
      type: "کیفیت",
      age: "۲ ساعت",
      sla: "۴ ساعت",
      risk: "بالا",
      owner: "من",
    },
    {
      id: "OPS-879",
      title: "بررسی تعارض داور RV-188",
      type: "داوری",
      age: "۵ ساعت",
      sla: "۱ ساعت",
      risk: "فوری",
      owner: "تخصیص‌نیافته",
    },
    {
      id: "OPS-870",
      title: "تطبیق پرداخت PAY-204",
      type: "مالی",
      age: "۱ روز",
      sla: "گذشته",
      risk: "بالا",
      owner: "ندا اکبری",
    },
    {
      id: "OPS-862",
      title: "درخواست مدرک سازمان",
      type: "KYB",
      age: "۳ ساعت",
      sla: "۵ ساعت",
      risk: "متوسط",
      owner: "محمد رضایی",
    },
  ];
  if (route.experience === "ops-queue")
    return (
      <>
        <section className="app-ops-summary">
          <div>
            <span className="app-eyebrow">نمای زنده صف عملیات</span>
            <h2>۸ مورد نیازمند اقدام در SLA</h2>
            <p>آخرین همگام‌سازی ۲ دقیقه پیش · داده نمونه</p>
          </div>
          <div>
            <MetricCard
              label="SLA شکسته"
              value="۳"
              detail="+۱ از دیروز"
              tone="red"
              icon="history"
            />
            <MetricCard
              label="ریسک بالا"
              value="۵"
              detail="۲ بدون مالک"
              tone="amber"
              icon="notification"
            />
            <MetricCard
              label="حل‌شده امروز"
              value="۲۶"
              detail="میانه ۳٫۲ ساعت"
              tone="green"
              icon="shield"
            />
          </div>
        </section>
        <Panel title="صف یکپارچه عملیات" eyebrow="اولویت = ریسک × سن × SLA">
          <div className="app-filterbar">
            <button className="app-button app-button--secondary">
              <Icon name="filter" /> همه نوع‌ها
            </button>
            <button className="app-button app-button--secondary">ریسک بالا</button>
            <button className="app-button app-button--secondary">بدون مالک</button>
            <label className="app-search">
              <Icon name="search" />
              <input placeholder="شناسه یا موضوع" />
            </label>
          </div>
          <div className="app-ops-queue">
            {queue.map((item) => (
              <article key={item.id}>
                <span
                  className={`app-priority app-priority--${item.risk === "فوری" ? "urgent" : item.risk === "بالا" ? "high" : "medium"}`}
                />
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    <bdi>{item.id}</bdi> · {item.type}
                  </span>
                </div>
                <div>
                  <small>سن</small>
                  <strong>{item.age}</strong>
                </div>
                <div>
                  <small>SLA باقی‌مانده</small>
                  <strong>{item.sla}</strong>
                </div>
                <div>
                  <small>مالک</small>
                  <strong>{item.owner}</strong>
                </div>
                <StatusBadge tone={statusTone(item.risk)}>{item.risk}</StatusBadge>
                <button
                  className="app-button app-button--secondary"
                  onClick={() => onAction(`برداشتن ${item.id}`)}
                >
                  بررسی
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </>
    );
  const configs = {
    "ops-kyc": [
      "اعتبارسنجی سازمان",
      ["هویت نماینده", "اختیار امضا", "شناسه ملی", "کنترل تحریم"],
      "ثبت نتیجه اعتبارسنجی",
    ],
    "ops-quality": [
      "کنترل انتشار CH-1405-021",
      ["شفافیت صورت‌مسئله", "معیار موفقیت", "محرمانگی", "بودجه و زمان"],
      "ارسال درخواست اصلاح",
    ],
    "ops-review": [
      "نظارت دور داوری",
      ["اظهار COI", "تکمیل SLA", "Blind mode", "پراکندگی امتیاز"],
      "جایگزینی داور",
    ],
    "ops-moderation": [
      "گزارش نظارت MOD-71",
      ["اعتبار گزارش", "شاهد فنی", "محرمانگی گزارشگر", "سطح‌بندی اقدام"],
      "ثبت اقدام کنترلی",
    ],
    "ops-dispute": [
      "اختلاف DSP-204",
      ["ثبت Claim", "Freeze مالی", "پاسخ طرفین", "پیشنهاد Remedy"],
      "ثبت تصمیم اختلاف",
    ],
    "ops-payment": [
      "Reconciliation پرداخت",
      ["شناسه یکتا", "پاسخ سامانه", "مبلغ و مرحله اجرایی", "تشخیص ثبت تکراری"],
      "اجرای تطبیق",
    ],
    "ops-support": [
      "درخواست پشتیبانی SUP-81",
      ["رضایت مشاهده context", "SLA پاسخ", "Macro کنترل‌شده", "سابقه پرونده"],
      "ارسال پاسخ",
    ],
    "ops-system": [
      "Incident و صف خطا",
      ["DLQ اعلان", "Callback مالی", "Job انقضای دسترسی", "Immutable log"],
      "اجرای Retry کنترل‌شده",
    ],
  } as const;
  const [title, checks, action] =
    configs[route.experience as keyof typeof configs] ?? configs["ops-quality"];
  return (
    <div className="app-layout">
      <Panel title={title} eyebrow={`${route.prdId} · شواهد و کد دلیل`} className="app-panel--wide">
        <div className="app-case-strip">
          <div>
            <span className="app-eyebrow">پرونده عملیاتی</span>
            <h3>
              <bdi>OPS-882</bdi> · {title}
            </h3>
          </div>
          <StatusBadge tone="danger">SLA: ۱ ساعت</StatusBadge>
          <StatusBadge tone="warning">ریسک بالا</StatusBadge>
        </div>
        <div className="app-check-rows">
          {checks.map((label, index) => (
            <article key={label}>
              <button className={`app-check-button ${index !== 2 ? "is-on" : ""}`}>
                <Icon name="check" />
              </button>
              <div>
                <strong>{label}</strong>
                <small>
                  {index === 2 ? "تناقض یا شاهد ناقص · Reason OPS-14" : "شاهد بررسی و ثبت شد"}
                </small>
              </div>
              <StatusBadge tone={index === 2 ? "warning" : "success"}>
                {index === 2 ? "نیازمند اقدام" : "پاس"}
              </StatusBadge>
              <button className="app-row-action">شواهد</button>
            </article>
          ))}
        </div>
        <label className="app-field">
          <span>یادداشت و کد دلیل</span>
          <textarea
            rows={4}
            defaultValue="مورد سوم نیازمند اصلاح آیتم‌به‌آیتم است؛ سایر کنترل‌ها پاس شده‌اند."
          />
        </label>
      </Panel>
      <Panel title="اثر تصمیم" eyebrow="پیش از اقدام حساس">
        <div className="app-effect-summary">
          <Icon name="decision" />
          <h3>{action}</h3>
          <p>وضعیت پرونده، مالک بعدی و SLA به‌روزرسانی می‌شود. تاریخچه فعلی حذف نخواهد شد.</p>
          <dl>
            <div>
              <dt>وضعیت بعدی</dt>
              <dd>در انتظار پاسخ</dd>
            </div>
            <div>
              <dt>مالک بعدی</dt>
              <dd>مالک پرونده</dd>
            </div>
            <div>
              <dt>اعلان</dt>
              <dd>داخل محصول + ایمیل</dd>
            </div>
          </dl>
        </div>
        <button
          className="app-button app-button--primary app-button--full"
          onClick={() => onAction(action, { sensitive: true, reason: true })}
        >
          {action}
        </button>
      </Panel>
    </div>
  );
}
