"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { SolverDashboardExperience } from "@/components/solver-dashboard";
import { SolverProposalWizard } from "@/components/solver-proposal-wizard";
import type { SolverSpace } from "@/components/solver-shell";
import {
  actionItems,
  auditEvents,
  challenges,
  experts,
  pilotMilestones,
  proposals,
  reviewers,
  timeline,
} from "@/data/fixtures/internal";
import type { InternalRoute } from "@/data/internal-routes";
import { formatToman, publicationGates } from "@/domain/product";
import { canAccessReviewMaterials, getReviewCoi, setReviewCoi } from "@/lib/reviews/access";
import { PAYMENT_DEMO_SEED, readPayment, requestFinanceApproval } from "@/lib/payments/store";
import {
  CaseHeader,
  EmptyInline,
  GateChecklist,
  MetricCard,
  Panel,
  ProgressBar,
  StatusBadge,
} from "@/components/internal/shared";

export type ActionHandler = (
  label: string,
  options?: { sensitive?: boolean; reason?: boolean },
) => void;

type PageProps = { route: InternalRoute; onAction: ActionHandler; space?: SolverSpace };

const statusTone = (value: string): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (/کامل|پذیرفته|در مسیر|بدون تعارض|پرداخت‌شده/.test(value)) return "success";
  if (/فوری|گذشته|متوقف|رد|ناموفق/.test(value)) return "danger";
  if (/انتظار|نیازمند|بررسی|تعارض|باز/.test(value)) return "warning";
  if (/جاری|داوری|منتشر/.test(value)) return "info";
  return "neutral";
};

function SyncQuery({ query }: { query: Record<string, string> }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    Object.entries(query).forEach(([key, value]) =>
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key),
    );
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [query]);
  return null;
}

function DashboardPage({ route, onAction, space }: PageProps) {
  const [done, setDone] = useState<string[]>([]);
  if (route.role === "solver")
    return <SolverDashboardExperience embedded space={space ?? "individual"} />;
  const solver = false;
  const items = actionItems;
  return (
    <>
      <section className="app-metric-grid">
        <MetricCard
          label={solver ? "دعوت نیازمند پاسخ" : "اقدام فوری"}
          value={solver ? "۳" : "۴"}
          detail="تا پایان امروز"
          tone="red"
          icon="history"
        />
        <MetricCard
          label={solver ? "تطابق فرصت‌ها" : "پرونده فعال"}
          value={solver ? "۹ فرصت" : "۱۲"}
          detail={solver ? "۳ مورد بالای ۸۵٪" : "۲ پرونده متوقف"}
          tone="blue"
          icon="trend"
        />
        <MetricCard
          label={solver ? "پیشنهادهای باز" : "پیشنهاد جدید"}
          value={solver ? "۲" : "۸"}
          detail="از آخرین بازدید"
          tone="violet"
          icon="decision"
        />
        <MetricCard
          label={solver ? "مبلغ در انتظار" : "پایلوت در ریسک"}
          value={solver ? "۲۴۰ م.ت" : "۱"}
          detail="نیازمند اقدام این هفته"
          tone="amber"
          icon="impact"
        />
      </section>
      <div className="app-layout app-layout--dashboard">
        <Panel
          title="صف اقدام من"
          eyebrow="بر اساس شدت، موعد و مسئول"
          className="app-panel--wide"
          action={
            <button
              className="app-button app-button--secondary"
              onClick={() => onAction("ساخت وظیفه جدید")}
            >
              افزودن وظیفه
            </button>
          }
        >
          <div className="app-action-list">
            {items.map((item) => (
              <article key={item.id} className={done.includes(item.id) ? "is-done" : ""}>
                <button
                  className="app-check-button"
                  onClick={() =>
                    setDone((current) =>
                      current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                  aria-label={`${item.title}: ${done.includes(item.id) ? "بازگردانی" : "تکمیل"}`}
                >
                  <Icon name="check" />
                </button>
                <div className="app-action-list__body">
                  <strong>{item.title}</strong>
                  <span>
                    <bdi>{item.id}</bdi> · {item.owner} · {item.due}
                  </span>
                </div>
                <StatusBadge tone={statusTone(item.status)}>
                  {done.includes(item.id) ? "تکمیل" : item.status}
                </StatusBadge>
                <button className="app-row-action" onClick={() => onAction(`بازکردن ${item.id}`)}>
                  بررسی <Icon name="chevron" />
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title={solver ? "فرصت‌های متناسب" : "سلامت پرونده‌ها"} eyebrow="اقدام بعدی روشن">
          <div className="app-health-list">
            {(solver ? challenges.slice(0, 3) : challenges).map((item, index) => (
              <article key={item.id}>
                <span className={`app-health-dot app-health-dot--${index}`} />
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.next} · {item.due}
                  </span>
                </div>
                <ProgressBar value={item.readiness} />
              </article>
            ))}
          </div>
          <Link
            className="app-text-link"
            href={solver ? "/app/solver/opportunities" : "/app/org/challenges"}
          >
            مشاهده همه <Icon name="arrow" />
          </Link>
        </Panel>
      </div>
      <Panel title={solver ? "پایلوت و تسویه" : "گلوگاه چرخه"} eyebrow="۷ روز اخیر">
        <div className="app-insight-grid">
          <div className="app-mini-chart">
            <span style={{ height: "42%" }} />
            <span style={{ height: "68%" }} />
            <span style={{ height: "55%" }} />
            <span style={{ height: "84%" }} />
            <span style={{ height: "73%" }} />
            <span style={{ height: "92%" }} />
            <span style={{ height: "78%" }} />
          </div>
          <div>
            <strong>{solver ? "۲ تحویل در این هفته" : "داوری مالی، کندترین شرط عبور"}</strong>
            <p>
              {solver
                ? "تحویل بعدی پنج‌شنبه است؛ معیار پذیرش و شواهد پیش از ارسال مرور شوند."
                : "میانگین زمان ۲٫۸ روز؛ ۳ پرونده منتظر تخصیص داور مالی‌اند."}
            </p>
            <button
              className="app-button app-button--ghost"
              onClick={() => onAction("مشاهده گزارش گلوگاه")}
            >
              جزئیات و اقدام
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}

function ChallengeListPage({ onAction }: PageProps) {
  const [view, setView] = useState<"list" | "board">("list");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = challenges.filter(
    (item) => (status === "all" || item.status === status) && item.title.includes(search),
  );
  return (
    <>
      <SyncQuery query={{ status: status === "all" ? "" : status, q: search, view }} />
      <Panel
        title="مدیریت سبد مسئله‌ها"
        eyebrow="۲ پرونده نیازمند اقدام"
        action={
          <div className="app-view-switch">
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
              <Icon name="menu" /> فهرست
            </button>
            <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>
              <Icon name="grid" /> کانبان
            </button>
          </div>
        }
      >
        <div className="app-filterbar">
          <label className="app-search">
            <Icon name="search" />
            <span className="sr-only">جست‌وجو</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جست‌وجو در عنوان یا شناسه"
            />
          </label>
          <label>
            <span>وضعیت</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">همه وضعیت‌ها</option>
              <option>صورت‌بندی</option>
              <option>منتشرشده</option>
              <option>داوری</option>
              <option>پایلوت</option>
            </select>
          </label>
          <button className="app-button app-button--secondary">
            <Icon name="filter" /> فیلترهای بیشتر <span className="app-count">۲</span>
          </button>
          <button
            className="app-button app-button--ghost"
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
          >
            پاک‌کردن
          </button>
        </div>
        {filtered.length === 0 ? (
          <EmptyInline
            title="نتیجه‌ای پیدا نشد"
            body="املای عبارت را اصلاح یا فیلترهای فعال را پاک کنید."
            action="پاک‌کردن فیلترها"
            onAction={() => {
              setSearch("");
              setStatus("all");
            }}
          />
        ) : view === "list" ? (
          <div className="app-data-list app-data-list--challenges">
            <div className="app-data-list__head">
              <span>مسئله</span>
              <span>وضعیت</span>
              <span>آمادگی</span>
              <span>مالک</span>
              <span>اقدام بعدی</span>
              <span />
            </div>
            {filtered.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    <bdi>{item.id}</bdi> · {item.privacy}
                  </span>
                </div>
                <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                <ProgressBar value={item.readiness} />
                <span>{item.owner}</span>
                <div>
                  <strong>{item.next}</strong>
                  <span>{item.due}</span>
                </div>
                <Link
                  className="app-icon-button"
                  href="/app/org/challenges/CH-1405-021/overview"
                  aria-label={`بازکردن ${item.title}`}
                >
                  <Icon name="chevron" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="app-board">
            {["صورت‌بندی", "منتشرشده", "داوری", "پایلوت"].map((column) => (
              <section key={column}>
                <header>
                  <strong>{column}</strong>
                  <span>
                    {filtered
                      .filter((item) => item.status === column)
                      .length.toLocaleString("fa-IR")}
                  </span>
                </header>
                {filtered
                  .filter((item) => item.status === column)
                  .map((item) => (
                    <article key={item.id}>
                      <bdi>{item.id}</bdi>
                      <h3>{item.title}</h3>
                      <ProgressBar value={item.readiness} label="آمادگی" />
                      <div>
                        <span>{item.owner}</span>
                        <StatusBadge tone="warning">{item.due}</StatusBadge>
                      </div>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        )}
      </Panel>
      <div className="app-sticky-action">
        <span>تغییر وضعیت گروهی به‌دلیل ریسک و نیاز به Audit غیرفعال است.</span>
        <button
          className="app-button app-button--primary"
          onClick={() => onAction("ایجاد پرونده مسئله")}
        >
          ایجاد مسئله جدید
        </button>
      </div>
    </>
  );
}

function IntakePage({ onAction }: PageProps) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const validate = () => {
    if (step === 1 && (title.trim().length < 12 || !unit)) {
      setError("عنوان مسئله باید حداقل ۱۲ نویسه و واحد مالک مشخص باشد.");
      return false;
    }
    if (step === 2 && result.trim().length < 20) {
      setError("نتیجه مورد انتظار را با حداقل ۲۰ نویسه توضیح دهید.");
      return false;
    }
    setError("");
    return true;
  };
  return (
    <div className="app-form-layout">
      <aside className="app-form-steps">
        <span>پیش‌نویس خودکار · همین دستگاه</span>
        {["تعریف کوتاه", "نتیجه و زمینه", "محرمانگی و مرور"].map((label, index) => (
          <button
            key={label}
            className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}
            onClick={() => setStep(index + 1)}
          >
            <i>{step > index + 1 ? <Icon name="check" /> : (index + 1).toLocaleString("fa-IR")}</i>
            <span>
              {label}
              <small>
                {index === 0
                  ? "عنوان، واحد، فوریت"
                  : index === 1
                    ? "وضعیت موجود و هدف"
                    : "سطح افشا و فایل"}
              </small>
            </span>
          </button>
        ))}
      </aside>
      <Panel
        title={["تعریف کوتاه مسئله", "نتیجه مورد انتظار", "محرمانگی و مرور نهایی"][step - 1]}
        eyebrow={`گام ${step.toLocaleString("fa-IR")} از ۳`}
        className="app-form-panel"
      >
        {step === 1 && (
          <div className="app-form-grid">
            <label className="app-field app-field--full">
              <span>
                عنوان مسئله <b>*</b>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثلاً کاهش مصرف آب در خط شست‌وشوی صنعتی"
              />
              <small>{title.length.toLocaleString("fa-IR")} / ۱۲۰</small>
            </label>
            <label className="app-field">
              <span>
                واحد مالک <b>*</b>
              </span>
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="">انتخاب کنید</option>
                <option>بهره‌برداری</option>
                <option>تحقیق و توسعه</option>
                <option>زنجیره تأمین</option>
              </select>
            </label>
            <label className="app-field">
              <span>فوریت</span>
              <select>
                <option>بالا · اثر عملیاتی</option>
                <option>متوسط</option>
                <option>برنامه‌ای</option>
              </select>
            </label>
            <label className="app-field app-field--full">
              <span>وضعیت موجود</span>
              <textarea
                rows={5}
                placeholder="مشاهده‌ها، خط پایه و محدودیت فعلی را کوتاه توضیح دهید."
              />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="app-form-grid">
            <label className="app-field app-field--full">
              <span>
                نتیجه مورد انتظار <b>*</b>
              </span>
              <textarea
                value={result}
                onChange={(event) => setResult(event.target.value)}
                rows={6}
                placeholder="چه تغییری باید ایجاد شود و چگونه قابل سنجش است؟"
              />
            </label>
            <label className="app-field">
              <span>شاخص اولیه</span>
              <input placeholder="مثلاً لیتر آب / واحد تولید" />
            </label>
            <label className="app-field">
              <span>خط پایه تقریبی</span>
              <input dir="ltr" placeholder="18.4" />
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="app-review-card">
            <div>
              <span>عنوان</span>
              <strong>{title || "هنوز وارد نشده"}</strong>
            </div>
            <div>
              <span>واحد مالک</span>
              <strong>{unit || "هنوز انتخاب نشده"}</strong>
            </div>
            <div>
              <span>نتیجه</span>
              <strong>{result || "هنوز وارد نشده"}</strong>
            </div>
            <label className="app-field">
              <span>سطح محرمانگی</span>
              <select>
                <option>داخلی تا پایان ارزیابی اولیه</option>
                <option>ناشناس تأییدشده</option>
                <option>دعوتی</option>
              </select>
            </label>
            <div className="app-upload">
              <Icon name="download" />
              <div>
                <strong>افزودن سند پشتیبان</strong>
                <span>PDF یا DOCX · حداکثر ۱۰ مگابایت · اسکن نمایشی</span>
              </div>
              <button className="app-button app-button--secondary">انتخاب فایل</button>
            </div>
          </div>
        )}
        {error && (
          <div className="app-field-error" role="alert">
            <Icon name="notification" />
            {error}
          </div>
        )}
        <footer className="app-form-footer">
          <button
            className="app-button app-button--ghost"
            disabled={step === 1}
            onClick={() => setStep((value) => Math.max(1, value - 1))}
          >
            گام قبل
          </button>
          <span>
            <Icon name="check" /> تغییرها ذخیره شده‌اند
          </span>
          {step < 3 ? (
            <button
              className="app-button app-button--primary"
              onClick={() => validate() && setStep((value) => value + 1)}
            >
              ذخیره و گام بعد
            </button>
          ) : (
            <button
              className="app-button app-button--primary"
              onClick={() =>
                validate() && onAction("ثبت پرونده خام و دریافت رسید", { sensitive: true })
              }
            >
              ثبت و دریافت رسید
            </button>
          )}
        </footer>
      </Panel>
    </div>
  );
}

function VerificationPage({ route, onAction }: PageProps) {
  const org = route.role === "org";
  const checks = [
    [org ? "شناسه ملی و نام حقوقی" : "هویت و نمایندگی", "تأییدشده"],
    [org ? "اختیار نماینده" : "اطلاعات پرداخت", "در حال بررسی"],
    [org ? "نشانی و وب‌سایت" : "مدرک تخصصی", "نیازمند اصلاح"],
    ["کنترل تحریم و تعارض", "تأییدشده"],
  ];
  return (
    <div className="app-layout">
      <Panel
        title="چک‌لیست اعتبارسنجی"
        eyebrow="Rule-by-rule و قابل اعتراض"
        className="app-panel--wide"
      >
        <div className="app-check-rows">
          {checks.map(([label, status], index) => (
            <article key={label}>
              <span>{(index + 1).toLocaleString("fa-IR")}</span>
              <div>
                <strong>{label}</strong>
                <small>
                  {status === "نیازمند اصلاح"
                    ? "تصویر سند خوانا نیست · Reason KYC-14"
                    : "کنترل خودکار و بازبینی انسانی"}
                </small>
              </div>
              <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
              <button className="app-row-action" onClick={() => onAction(`بررسی ${label}`)}>
                جزئیات
              </button>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="مدارک و شواهد" eyebrow="بدون افشای داده حساس">
        <div className="app-doc-list">
          {["مدرک ثبت / هویت", "نامه اختیار نماینده", "نشانی حساب بانکی"].map((item, index) => (
            <article key={item}>
              <span>
                <Icon name="brief" />
              </span>
              <div>
                <strong>{item}</strong>
                <small>PDF · نسخه {index + 1} · اسکن امن</small>
              </div>
              <StatusBadge tone={index === 1 ? "warning" : "success"}>
                {index === 1 ? "نیازمند جایگزینی" : "معتبر"}
              </StatusBadge>
            </article>
          ))}
        </div>
        <button
          className="app-button app-button--primary app-button--full"
          onClick={() => onAction("ارسال مدارک برای اعتبارسنجی")}
        >
          ارسال برای بررسی
        </button>
      </Panel>
    </div>
  );
}

function TriagePage({ onAction }: PageProps) {
  const [answers, setAnswers] = useState([true, true, false, true]);
  const score = answers.filter(Boolean).length * 25;
  return (
    <div className="app-layout">
      <Panel title="گزارش آمادگی مسئله" eyebrow="TRIAGE · نمونه">
        <div className="app-score-card">
          <div className="app-score-ring" style={{ "--score": `${score}%` } as React.CSSProperties}>
            <strong>{score.toLocaleString("fa-IR")}٪</strong>
            <span>آمادگی</span>
          </div>
          <div>
            <h3>{score >= 75 ? "آماده ورود به صورت‌بندی" : "نیازمند تکمیل"}</h3>
            <p>مسیر پیشنهادی: توسعه مشترک و پایلوت. ریسک اصلی، نبود خط پایه قابل اتکا است.</p>
          </div>
        </div>
        <div className="app-check-rows">
          {[
            "مالک و اختیار تصمیم روشن است",
            "اثر کسب‌وکار قابل اندازه‌گیری است",
            "خط پایه و داده اولیه موجود است",
            "محدودیت امنیت و HSE ثبت شده است",
          ].map((label, index) => (
            <article key={label}>
              <button
                className={`app-check-button ${answers[index] ? "is-on" : ""}`}
                onClick={() =>
                  setAnswers((items) =>
                    items.map((item, itemIndex) => (itemIndex === index ? !item : item)),
                  )
                }
              >
                <Icon name="check" />
              </button>
              <div>
                <strong>{label}</strong>
                <small>
                  {answers[index] ? "شاهد اولیه ثبت شده" : "برای عبور از شرط مرحله لازم است"}
                </small>
              </div>
              <StatusBadge tone={answers[index] ? "success" : "warning"}>
                {answers[index] ? "کامل" : "ناقص"}
              </StatusBadge>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="مسیر پیشنهادی" eyebrow="تصمیم پشتیبانی‌شده">
        <div className="app-route-card is-selected">
          <Icon name="match" />
          <div>
            <strong>توسعه مشترک و پایلوت</strong>
            <span>نیاز به آزمون در محیط واقعی و معیار پذیرش مرحله‌ای</span>
          </div>
          <StatusBadge tone="info">پیشنهاد اصلی</StatusBadge>
        </div>
        {["جایزه حل مسئله", "شناسایی فناوری", "خرید پژوهش"].map((item) => (
          <div className="app-route-card" key={item}>
            <Icon name="brief" />
            <div>
              <strong>{item}</strong>
              <span>تناسب کمتر با شواهد فعلی</span>
            </div>
          </div>
        ))}
        <button
          className="app-button app-button--primary app-button--full"
          disabled={score < 75}
          title={score < 75 ? "خط پایه داده هنوز ناقص است" : undefined}
          onClick={() => onAction("ورود به استودیوی چالش")}
        >
          ارسال برای صورت‌بندی
        </button>
        {score < 75 && (
          <small className="app-disabled-reason">
            برای فعال‌شدن، خط پایه و شواهد آن را تکمیل کنید.
          </small>
        )}
      </Panel>
    </div>
  );
}

function StudioPage({ onAction }: PageProps) {
  const sections = ["کسب‌وکار", "فنی", "داوری و پایلوت", "حقوقی و مالی"];
  const [active, setActive] = useState(0);
  const [checks, setChecks] = useState({
    business: true,
    technical: true,
    finance: true,
    legal: false,
    quality: false,
  });
  const [saved, setSaved] = useState("ذخیره‌شده · ۱۵:۲۸");
  const gates = publicationGates(checks);
  const readiness = Math.round((gates.filter((gate) => gate.passed).length / gates.length) * 100);
  const edit = () => {
    setSaved("در حال ذخیره…");
    window.setTimeout(() => setSaved("ذخیره‌شده · اکنون"), 600);
  };
  return (
    <>
      <CaseHeader />
      <div className="app-studio">
        <aside className="app-studio-nav">
          <div>
            <span>آمادگی نسخه v3</span>
            <strong>{readiness.toLocaleString("fa-IR")}٪</strong>
            <ProgressBar value={readiness} />
          </div>
          {sections.map((section, index) => (
            <button
              key={section}
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
            >
              <span>{(index + 1).toLocaleString("fa-IR")}</span>
              <div>
                <strong>{section}</strong>
                <small>{index === 3 ? "۱ مورد ناقص" : "کامل"}</small>
              </div>
              <Icon name="chevron" />
            </button>
          ))}
          <button
            className="app-button app-button--secondary"
            onClick={() => onAction("مشاهده Diff نسخه v2 و v3")}
          >
            مقایسه نسخه‌ها
          </button>
        </aside>
        <Panel
          title={sections[active]}
          eyebrow={`مالک بخش: ${["سارا نادری", "امیر توکلی", "کمیته پایلوت", "مریم عزیزی"][active]}`}
          className="app-studio-editor"
          action={
            <span className="app-autosave">
              <i />
              {saved}
            </span>
          }
        >
          <div className="app-form-grid">
            <label className="app-field app-field--full">
              <span>تعریف و تصمیم اصلی</span>
              <textarea
                rows={6}
                defaultValue={
                  active === 0
                    ? "مصرف آب خط شست‌وشو ۱۸٫۴ لیتر به ازای هر واحد است. هدف کاهش پایدار دست‌کم ۳۰٪ بدون افت کیفیت محصول است."
                    : active === 1
                      ? "راهکار باید با دبی ۱۲ مترمکعب بر ساعت، مواد شوینده موجود و محدودیت توقف ۴ ساعته سازگار باشد."
                      : active === 2
                        ? "پایلوت ۳۰ روزه با اندازه‌گیری روزانه، کنترل کیفیت و شرط پذیرش در روزهای ۱۰ و ۳۰ اجرا می‌شود."
                        : "مالکیت داده با سازمان و IP پیشین هر طرف محفوظ است؛ IP ایجادشده طبق سهم مشارکت تعیین می‌شود."
                }
                onChange={edit}
              />
            </label>
            <label className="app-field">
              <span>مسئول بخش</span>
              <select onChange={edit}>
                <option>
                  {["سارا نادری", "امیر توکلی", "کمیته پایلوت", "مریم عزیزی"][active]}
                </option>
                <option>علی محمدی</option>
              </select>
            </label>
            <label className="app-field">
              <span>موعد بازبینی</span>
              <input defaultValue="۱۴۰۵/۰۵/۱۶" onChange={edit} />
            </label>
          </div>
          <div className="app-comment">
            <PersonAvatar name="سارا نادری" className="app-avatar" />
            <div>
              <strong>کامنت متصل به این بخش</strong>
              <p>@امیر لطفاً خط پایه را با گزارش خرداد تطبیق بده.</p>
              <small>۲ پاسخ · آخرین پاسخ ۲۱ دقیقه پیش</small>
            </div>
            <button className="app-row-action">پاسخ</button>
          </div>
        </Panel>
        <Panel title="شرط‌های انتشار" eyebrow="تأییدهای مستقل" className="app-studio-gates">
          <GateChecklist
            gates={gates}
            onToggle={(id) => {
              if (id === "quality") return;
              setChecks((current) => ({ ...current, [id]: !current[id as keyof typeof current] }));
            }}
          />
          <div className="app-preview-switch">
            <button className="active">
              <Icon name="eye" /> پیش‌نمایش عمومی
            </button>
            <button>
              <Icon name="lock" /> پیش‌نمایش پس از NDA
            </button>
          </div>
          <button
            className="app-button app-button--primary app-button--full"
            disabled={!gates.slice(0, 4).every((gate) => gate.passed)}
            onClick={() =>
              onAction("قفل نسخه v3 و ارسال به عملیات", { sensitive: true, reason: true })
            }
          >
            قفل نسخه و ارسال برای کنترل کیفیت
          </button>
          {!gates.slice(0, 4).every((gate) => gate.passed) && (
            <small className="app-disabled-reason">
              تأیید حقوقی هنوز ناقص است؛ دلیل غیرفعال‌بودن CTA در دسترس است.
            </small>
          )}
        </Panel>
      </div>
    </>
  );
}

const caseTabs = [
  ["نمای کلی", "/app/org/challenges/CH-1405-021/overview"],
  ["خط زمانی", "/app/org/challenges/CH-1405-021/timeline"],
  ["متخصصان", "/app/org/challenges/CH-1405-021/experts"],
  ["پیشنهادها", "/app/org/challenges/CH-1405-021/proposals"],
  ["داوری", "/app/org/challenges/CH-1405-021/review"],
  ["تصمیم", "/app/org/challenges/CH-1405-021/decision"],
  ["قرارداد", "/app/org/challenges/CH-1405-021/contract"],
  ["پایلوت", "/app/org/challenges/CH-1405-021/pilot"],
  ["اسناد", "/app/org/challenges/CH-1405-021/documents"],
  ["گفت‌وگو", "/app/org/challenges/CH-1405-021/conversations"],
  ["مالی", "/app/org/challenges/CH-1405-021/finance"],
  ["اثر", "/app/org/challenges/CH-1405-021/impact"],
  ["تاریخچه", "/app/org/challenges/CH-1405-021/history"],
];

function CaseNav({ current }: { current: string }) {
  return (
    <nav className="app-case-tabs" aria-label="بخش‌های پرونده">
      {caseTabs.map(([label, href], index) => (
        <Link
          key={href}
          href={href}
          className={current === href ? "active" : index > 9 ? "is-future" : ""}
          aria-disabled={index > 9 ? "true" : undefined}
          onClick={index > 9 ? (event) => event.preventDefault() : undefined}
          title={index > 9 ? "پس از پایان پایلوت فعال می‌شود" : undefined}
        >
          {label}
          {index > 9 && <Icon name="lock" />}
        </Link>
      ))}
    </nav>
  );
}

function CaseOverviewPage({ route, onAction }: PageProps) {
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path.replace("/operations", "")} />
      <section className="app-metric-grid app-metric-grid--three">
        <MetricCard label="تکمیل چرخه" value="۶۸٪" detail="۷ شرط از ۱۰" icon="trend" />
        <MetricCard
          label="پیشنهاد واجد شرایط"
          value="۳"
          detail="از ۵ پیشنهاد"
          tone="violet"
          icon="decision"
        />
        <MetricCard
          label="SLA بعدی"
          value="۱ روز"
          detail="داوری مالی"
          tone="amber"
          icon="history"
        />
      </section>
      <div className="app-layout">
        <Panel title="اقدام بعدی پرونده" eyebrow="مالک: مدیر نوآوری" className="app-panel--wide">
          <div className="app-next-action">
            <span>
              <Icon name="decision" />
            </span>
            <div>
              <h3>تکمیل داوری مالی پیشنهاد PR-104</h3>
              <p>برای بستن دور داوری، امتیاز مالی و دلیل معیار «هزینه مالکیت» لازم است.</p>
              <div>
                <StatusBadge tone="danger">مهلت امروز ۱۶:۳۰</StatusBadge>
                <StatusBadge tone="warning">۱ شواهد ناقص</StatusBadge>
              </div>
            </div>
            <button
              className="app-button app-button--primary"
              onClick={() => onAction("بازکردن داوری مالی")}
            >
              شروع اقدام
            </button>
          </div>
        </Panel>
        <Panel title="شرط‌های مرحله" eyebrow="ارزیابی و تصمیم">
          <GateChecklist
            gates={publicationGates({
              business: true,
              technical: true,
              finance: false,
              legal: true,
              quality: true,
            }).slice(0, 4)}
          />
        </Panel>
      </div>
      <div className="app-layout">
        <Panel title="رخدادهای اخیر" eyebrow="Timeline و Audit">
          <div className="app-timeline">
            {timeline.map((item) => (
              <article key={item.id}>
                <span className={item.tone}>
                  <Icon name={item.tone === "done" ? "check" : "history"} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.actor} · {item.time}
                  </small>
                </div>
                <bdi>{item.evidence}</bdi>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="بسته شواهد" eyebrow="شواهد">
          <div className="app-evidence-grid">
            {[
              "صورت‌مسئله نسخه ۳",
              "معیارنامه داوری نسخه ۲",
              "توافق محرمانگی امضاشده",
              "بودجه پایلوت",
            ].map((item, index) => (
              <article key={item}>
                <Icon name="brief" />
                <div>
                  <strong>{item}</strong>
                  <span>{index === 3 ? "نیازمند تأیید مالی" : "معتبر و نسخه‌دار"}</span>
                </div>
                <StatusBadge tone={index === 3 ? "warning" : "success"}>
                  {index === 3 ? "باز" : "کامل"}
                </StatusBadge>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function TimelinePage({ route, onAction }: PageProps) {
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path} />
      <Panel
        title="برنامه و خط زمانی"
        eyebrow="وابستگی، SLA و مدرک عبور"
        action={
          <button
            className="app-button app-button--primary"
            onClick={() => onAction("افزودن وظیفه پرونده")}
          >
            افزودن وظیفه
          </button>
        }
      >
        <div className="app-roadmap">
          {[
            ...timeline,
            {
              id: "EV-36",
              title: "تصمیم فینالیست",
              actor: "کمیته تصمیم",
              time: "پیش‌بینی ۱۷ مرداد",
              evidence: "پس از بستن داوری",
              tone: "future",
            },
          ].map((item, index) => (
            <article key={item.id} className={`is-${item.tone}`}>
              <span>
                {item.tone === "done" ? <Icon name="check" /> : (index + 1).toLocaleString("fa-IR")}
              </span>
              <div>
                <small>{item.time}</small>
                <h3>{item.title}</h3>
                <p>
                  {item.actor} · {item.evidence}
                </p>
              </div>
              {index < 4 && <i />}
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}

function ExpertsPage({ route, onAction }: PageProps) {
  const [invited, setInvited] = useState<string[]>([]);
  const [minFit, setMinFit] = useState(80);
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path} />
      <Panel
        title="متخصصان پیشنهادی"
        eyebrow="تطبیق توضیح‌پذیر · تصمیم انسانی"
        action={
          <label className="app-range">
            <span>حداقل تطابق {minFit.toLocaleString("fa-IR")}٪</span>
            <input
              type="range"
              min="70"
              max="95"
              value={minFit}
              onChange={(event) => setMinFit(Number(event.target.value))}
            />
          </label>
        }
      >
        <div className="app-expert-grid">
          {experts
            .filter((expert) => expert.fit >= minFit)
            .map((expert) => (
              <article key={expert.id}>
                <header>
                  <PersonAvatar name={expert.name} className="app-avatar" />
                  <div>
                    <strong>{expert.name}</strong>
                    <small>{expert.expertise}</small>
                  </div>
                  <div className="app-fit">
                    <strong>{expert.fit.toLocaleString("fa-IR")}٪</strong>
                    <span>تطابق</span>
                  </div>
                </header>
                <ul>
                  <li>
                    <Icon name="check" />
                    {expert.evidence}
                  </li>
                  <li>
                    <Icon name="history" />
                    {expert.capacity}
                  </li>
                  <li>
                    <Icon name={expert.conflict === "بدون تعارض" ? "shield" : "notification"} />
                    {expert.conflict}
                  </li>
                </ul>
                <details>
                  <summary>چرا این تطابق؟</summary>
                  <p>
                    تخصص فرایندی ۴۰٪، سابقه صنعت ۳۰٪، ظرفیت ۲۰٪ و مکان ۱۰٪. این پیشنهاد کمک‌یار است
                    و تصمیم نهایی انسانی می‌ماند.
                  </p>
                </details>
                <button
                  className={`app-button ${invited.includes(expert.id) ? "app-button--secondary" : "app-button--primary"}`}
                  onClick={() => {
                    setInvited((items) =>
                      items.includes(expert.id) ? items : [...items, expert.id],
                    );
                    onAction(`ارسال دعوت به ${expert.name}`);
                  }}
                >
                  {invited.includes(expert.id) ? "دعوت ارسال شد" : "تنظیم و ارسال دعوت"}
                </button>
              </article>
            ))}
        </div>
      </Panel>
    </>
  );
}

function ProposalInboxPage({ route, onAction }: PageProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((items) =>
      items.includes(id)
        ? items.filter((item) => item !== id)
        : items.length < 3
          ? [...items, id]
          : items,
    );
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path} />
      <section className="app-metric-grid app-metric-grid--three">
        <MetricCard label="پیشنهاد دریافت‌شده" value="۵" detail="۳ واجد شرایط" />
        <MetricCard
          label="نیازمند اقدام"
          value="۲"
          detail="۱ شفاف‌سازی · ۱ مدرک"
          tone="amber"
          icon="history"
        />
        <MetricCard
          label="مهلت غربال"
          value="۲ روز"
          detail="SLA در مسیر"
          tone="green"
          icon="shield"
        />
      </section>
      <Panel title="صندوق دریافت پیشنهادها" eyebrow="نسخه و شرایط مشارکت">
        <div className="app-filterbar">
          <label className="app-search">
            <Icon name="search" />
            <input placeholder="جست‌وجوی تیم یا شناسه" />
          </label>
          <button className="app-button app-button--secondary">
            <Icon name="filter" /> واجد شرایط
          </button>
          <span className="app-selection">
            {selected.length.toLocaleString("fa-IR")} انتخاب از ۳
          </span>
        </div>
        <div className="app-proposal-list">
          {proposals.map((proposal) => (
            <article
              key={proposal.id}
              className={selected.includes(proposal.id) ? "is-selected" : ""}
            >
              <label className="app-select-box">
                <input
                  type="checkbox"
                  checked={selected.includes(proposal.id)}
                  onChange={() => toggle(proposal.id)}
                />
                <span>
                  <Icon name="check" />
                </span>
              </label>
              <div>
                <strong>{proposal.team}</strong>
                <span>
                  <bdi>{proposal.id}</bdi> · نسخه <bdi>{proposal.version}</bdi>
                </span>
              </div>
              <div>
                <small>امتیاز فنی</small>
                <strong>{proposal.technical.toLocaleString("fa-IR")}</strong>
              </div>
              <div>
                <small>مبلغ</small>
                <strong>{formatToman(proposal.amount)}</strong>
              </div>
              <StatusBadge tone={statusTone(proposal.eligibility)}>
                {proposal.eligibility}
              </StatusBadge>
              <StatusBadge tone={statusTone(proposal.status)}>{proposal.status}</StatusBadge>
              <button className="app-icon-button" onClick={() => onAction(`مشاهده ${proposal.id}`)}>
                <Icon name="chevron" />
              </button>
            </article>
          ))}
        </div>
        <footer className="app-selection-bar">
          <span>برای مقایسه ۲ یا ۳ پیشنهاد هم‌سنخ انتخاب کنید.</span>
          {selected.length >= 2 ? (
            <Link
              className="app-button app-button--primary"
              href="/app/org/challenges/CH-1405-021/proposals/compare"
            >
              مقایسه انتخاب‌ها
            </Link>
          ) : (
            <button className="app-button app-button--primary" type="button" disabled>
              مقایسه انتخاب‌ها
            </button>
          )}
        </footer>
      </Panel>
    </>
  );
}

function ProposalComparePage({ route, onAction }: PageProps) {
  const [expanded, setExpanded] = useState("technical");
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path} />
      <Panel title="مقایسه هم‌سنخ پیشنهادها" eyebrow="داده نسخه ارسال‌شده · غیرقابل‌تغییر">
        <div className="app-compare">
          <div className="app-compare__row app-compare__head">
            <strong>معیار</strong>
            {proposals.slice(0, 3).map((proposal) => (
              <div key={proposal.id}>
                <strong>{proposal.team}</strong>
                <span>
                  <bdi>{proposal.id}</bdi> · {proposal.version}
                </span>
              </div>
            ))}
          </div>
          {[
            ["technical", "راهکار فنی", proposals.map((item) => `${item.technical} از ۱۰۰`)],
            ["commercial", "مدل مالی", proposals.map((item) => formatToman(item.amount))],
            ["risk", "ریسک کلیدی", proposals.map((item) => item.risk)],
            ["milestone", "زمان پایلوت", ["۴۵ روز", "۶۰ روز", "۳۸ روز"]],
          ].map(([id, label, values]) => (
            <div
              className={`app-compare__row ${expanded === id ? "is-expanded" : ""}`}
              key={id as string}
            >
              <button onClick={() => setExpanded(expanded === id ? "" : (id as string))}>
                <Icon name="chevron" />
                <span>{label as string}</span>
              </button>
              {(values as string[]).map((value, index) => (
                <div key={`${id}-${index}`}>
                  <strong>{value}</strong>
                  {expanded === id && (
                    <small>
                      {index === 0
                        ? "شاهد کامل و فرض روشن"
                        : index === 1
                          ? "نیازمند کنترل مقیاس"
                          : "ریسک اجرایی ثبت شده"}
                    </small>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <footer className="app-decision-footer">
          <div>
            <Icon name="shield" />
            <span>این مقایسه کمک‌یار است. رتبه‌بندی خودکار تصمیم نهایی ایجاد نمی‌کند.</span>
          </div>
          <button
            className="app-button app-button--secondary"
            onClick={() => onAction("ثبت درخواست شفاف‌سازی")}
          >
            درخواست شفاف‌سازی
          </button>
          <button
            className="app-button app-button--primary"
            onClick={() => onAction("ارسال سه پیشنهاد به داوری", { sensitive: true, reason: true })}
          >
            ارسال به داوری
          </button>
        </footer>
      </Panel>
    </>
  );
}

function ReviewRoomPage({ route, onAction }: PageProps) {
  return (
    <>
      <CaseHeader />
      <CaseNav
        current={
          route.path.includes("/reviewers") ? "/app/org/challenges/CH-1405-021/review" : route.path
        }
      />
      <div className="app-layout">
        <Panel title="پیشرفت دور داوری" eyebrow="معیارنامه نسخه ۲ · داوری بی‌نام">
          <div className="app-reviewers">
            {reviewers.map((reviewer) => (
              <article key={reviewer.id}>
                <PersonAvatar name={reviewer.name} className="app-avatar" />
                <div>
                  <strong>{reviewer.name}</strong>
                  <span>
                    {reviewer.expertise} · {reviewer.due}
                  </span>
                  <ProgressBar value={reviewer.progress} />
                </div>
                <StatusBadge tone={statusTone(reviewer.coi)}>{reviewer.coi}</StatusBadge>
                <strong className="app-score">
                  {reviewer.progress === 100 ? reviewer.score.toLocaleString("fa-IR") : "—"}
                </strong>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="کنترل‌های سلامت داوری" eyebrow="COI و استقلال">
          <GateChecklist
            gates={[
              { id: "coi", label: "اظهار تعارض همه داوران", passed: true, evidence: "۳ از ۳" },
              {
                id: "blind",
                label: "پنهان‌سازی فراداده",
                passed: true,
                evidence: "Blind mode فعال",
              },
              {
                id: "complete",
                label: "تکمیل حداقل داوری",
                passed: false,
                evidence: "۱ داوری ناقص",
              },
              { id: "spread", label: "بررسی پراکندگی", passed: true, evidence: "اختلاف ۷ امتیاز" },
            ]}
          />
          <button
            className="app-button app-button--primary app-button--full"
            disabled
            onClick={() => onAction("بستن دور داوری")}
          >
            بستن دور داوری
          </button>
          <small className="app-disabled-reason">تا تکمیل داوری مالی RV-188 غیرفعال است.</small>
        </Panel>
      </div>
    </>
  );
}

function DecisionRoomPage({ route, onAction }: PageProps) {
  const [choice, setChoice] = useState("PR-104");
  const [dissent, setDissent] = useState("");
  return (
    <>
      <CaseHeader />
      <CaseNav
        current={
          route.path.includes("/decisions")
            ? "/app/org/challenges/CH-1405-021/decision"
            : route.path
        }
      />
      <Panel title="اتاق تصمیم فینالیست‌ها" eyebrow="بسته تصمیم · نسخه ۱">
        <div className="app-finalists">
          {proposals.slice(0, 2).map((proposal) => (
            <label key={proposal.id} className={choice === proposal.id ? "is-selected" : ""}>
              <input
                type="radio"
                name="finalist"
                checked={choice === proposal.id}
                onChange={() => setChoice(proposal.id)}
              />
              <span className="app-radio" />
              <div>
                <strong>{proposal.team}</strong>
                <span>
                  <bdi>{proposal.id}</bdi> · امتیاز ترکیبی{" "}
                  {Math.round((proposal.technical + proposal.commercial) / 2).toLocaleString(
                    "fa-IR",
                  )}
                </span>
              </div>
              <dl>
                <div>
                  <dt>فنی</dt>
                  <dd>{proposal.technical.toLocaleString("fa-IR")}</dd>
                </div>
                <div>
                  <dt>مالی</dt>
                  <dd>{proposal.commercial.toLocaleString("fa-IR")}</dd>
                </div>
                <div>
                  <dt>ریسک</dt>
                  <dd>{proposal.risk}</dd>
                </div>
              </dl>
              <StatusBadge tone={choice === proposal.id ? "info" : "neutral"}>
                {choice === proposal.id ? "انتخاب پیشنهادی" : "فینالیست"}
              </StatusBadge>
            </label>
          ))}
        </div>
        <div className="app-decision-grid">
          <label className="app-field">
            <span>
              کد دلیل <b>*</b>
            </span>
            <select>
              <option>FIT-PILOT-01 · بهترین تناسب پایلوت</option>
              <option>VALUE-02 · ارزش اقتصادی برتر</option>
            </select>
          </label>
          <label className="app-field">
            <span>محدوده اعلام نتیجه</span>
            <select>
              <option>اعلام نتیجه بدون امتیاز سایرین</option>
              <option>اعلام نتیجه و بازخورد معیارمحور</option>
            </select>
          </label>
          <label className="app-field app-field--full">
            <span>نظر مخالف / Dissent</span>
            <textarea
              value={dissent}
              onChange={(event) => setDissent(event.target.value)}
              rows={4}
              placeholder="اگر نظر مخالفی وجود دارد، بدون حذف یا هموارسازی آن ثبت کنید."
            />
          </label>
        </div>
        <footer className="app-decision-footer">
          <div>
            <Icon name="brief" />
            <span>صورت‌جلسه، انتخاب، نظر مخالف و شواهد در بسته تصمیم قفل می‌شوند.</span>
          </div>
          <button
            className="app-button app-button--secondary"
            onClick={() => onAction("پیش‌نمایش اعلان نتیجه")}
          >
            پیش‌نمایش اعلان
          </button>
          <button
            className="app-button app-button--primary"
            onClick={() =>
              onAction(`ثبت تصمیم انتخاب ${choice}`, { sensitive: true, reason: true })
            }
          >
            ثبت تصمیم نهایی
          </button>
        </footer>
      </Panel>
    </>
  );
}

function ContractPage({ route, onAction }: PageProps) {
  const [version, setVersion] = useState("v4");
  const clauses = [
    ["دامنه و تحویل", "توافق‌شده"],
    ["مالکیت فکری پیشین", "توافق‌شده"],
    ["IP ایجادشده", "نیازمند نظر حقوقی"],
    ["پرداخت مرحله اجرایی دوم", "در حال مذاکره"],
    ["محرمانگی و داده", "توافق‌شده"],
  ];
  return (
    <>
      {route.role === "org" && (
        <>
          <CaseHeader />
          <CaseNav current="/app/org/challenges/CH-1405-021/contract" />
        </>
      )}
      <div className="app-layout">
        <Panel
          title="نسخه قرارداد"
          eyebrow="مذاکره نسخه‌دار"
          className="app-panel--wide"
          action={
            <div className="app-segmented">
              <button className={version === "v3" ? "active" : ""} onClick={() => setVersion("v3")}>
                v3
              </button>
              <button className={version === "v4" ? "active" : ""} onClick={() => setVersion("v4")}>
                v4 جاری
              </button>
            </div>
          }
        >
          <div className="app-clause-list">
            {clauses.map(([label, status], index) => (
              <article key={label}>
                <span>{(index + 1).toLocaleString("fa-IR")}</span>
                <div>
                  <strong>{label}</strong>
                  <small>
                    {version === "v4" && index === 2
                      ? "+ تعریف مالکیت مشترک و مجوز بهره‌برداری"
                      : "بدون تغییر نسبت به نسخه قبل"}
                  </small>
                </div>
                <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                <button
                  className="app-row-action"
                  onClick={() => onAction(`ثبت نظر روی بند ${label}`)}
                >
                  بررسی
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="شرط‌های فعال‌سازی" eyebrow="فعال‌شدن قرارداد">
          <GateChecklist
            gates={[
              {
                id: "sign-org",
                label: "امضای نماینده سازمان",
                passed: true,
                evidence: "۱۳ مرداد ۱۴۰۵",
              },
              {
                id: "sign-solver",
                label: "امضای حل‌کننده",
                passed: true,
                evidence: "۱۳ مرداد ۱۴۰۵",
              },
              {
                id: "fund",
                label: "تأمین مرحله اجرایی نخست",
                passed: false,
                evidence: "در انتظار مالی",
              },
              { id: "nda", label: "پیوست داده و NDA", passed: true, evidence: "نسخه ۲" },
            ]}
          />
          <button className="app-button app-button--primary app-button--full" disabled>
            فعال‌سازی قرارداد
          </button>
          <small className="app-disabled-reason">
            پس از ثبت تأمین مرحله اجرایی نخست فعال می‌شود.
          </small>
        </Panel>
      </div>
    </>
  );
}

function PilotPage({ route, onAction }: PageProps) {
  const [riskOpen, setRiskOpen] = useState(true);
  return (
    <>
      {route.role === "org" && (
        <>
          <CaseHeader />
          <CaseNav current="/app/org/challenges/CH-1405-021/pilot" />
        </>
      )}
      <section className="app-metric-grid app-metric-grid--three">
        <MetricCard label="پیشرفت پایلوت" value="۶۷٪" detail="روز ۲۱ از ۳۰" />
        <MetricCard
          label="ریسک باز"
          value={riskOpen ? "۲" : "۱"}
          detail="۱ مورد با شدت بالا"
          tone="amber"
          icon="notification"
        />
        <MetricCard
          label="تغییر بودجه"
          value="+۴٫۲٪"
          detail="در محدوده مصوب"
          tone="green"
          icon="impact"
        />
      </section>
      <div className="app-layout">
        <Panel
          title="مراحل اجرایی و تحویل"
          eyebrow="مسئول و اقدام بعدی"
          className="app-panel--wide"
        >
          <div className="app-milestones">
            {pilotMilestones.map((item) => (
              <article key={item.id}>
                <div className="app-milestone__id">
                  <span>
                    <Icon name={item.progress === 100 ? "check" : "history"} />
                  </span>
                  <bdi>{item.id}</bdi>
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.owner} · {item.due}
                  </small>
                  <ProgressBar value={item.progress} />
                </div>
                <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                <button className="app-row-action" onClick={() => onAction(`بازکردن ${item.id}`)}>
                  جزئیات
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="ثبت ریسک" eyebrow="Risk register">
          <article className="app-risk">
            <header>
              <StatusBadge tone="danger">شدت بالا</StatusBadge>
              <span>
                <bdi>RSK-19</bdi>
              </span>
            </header>
            <h3>نوسان کیفیت آب ورودی</h3>
            <p>اثر احتمالی بر روزهای آزمون و اعتبار خط پایه.</p>
            <dl>
              <div>
                <dt>مالک رفع</dt>
                <dd>واحد بهره‌برداری</dd>
              </div>
              <div>
                <dt>پیگیری</dt>
                <dd>فردا ۹:۰۰</dd>
              </div>
            </dl>
            <button
              className="app-button app-button--secondary app-button--full"
              onClick={() => {
                setRiskOpen(false);
                onAction("ثبت برنامه کاهش ریسک");
              }}
            >
              ثبت برنامه کاهش ریسک
            </button>
          </article>
        </Panel>
      </div>
    </>
  );
}

function DeliverablePage({ route, onAction }: PageProps) {
  const [criteria, setCriteria] = useState([true, true, false, true]);
  const complete = criteria.every(Boolean);
  return (
    <>
      <CaseHeader />
      <CaseNav current={route.path} />
      <div className="app-layout">
        <Panel
          title="تحویل DL-204 · نسخه ۲"
          eyebrow="ارسال‌شده ۱۳ مرداد · قفل‌شده"
          className="app-panel--wide"
        >
          <div className="app-deliverable-head">
            <span>
              <Icon name="brief" />
            </span>
            <div>
              <h3>گزارش آزمون ۳۰ روزه و داده خام</h3>
              <p>۱۲ فایل · checksum ثبت‌شده · اسکن امن کامل</p>
            </div>
            <button className="app-button app-button--secondary">
              <Icon name="download" /> دریافت بسته
            </button>
          </div>
          <h3 className="app-subtitle">بررسی معیارهای پذیرش</h3>
          <div className="app-check-rows">
            {[
              "کاهش مصرف حداقل ۲۵٪",
              "عدم افت کیفیت محصول",
              "ثبت داده کامل ۳۰ روز",
              "تأیید HSE و بهره‌برداری",
            ].map((label, index) => (
              <article key={label}>
                <button
                  className={`app-check-button ${criteria[index] ? "is-on" : ""}`}
                  onClick={() =>
                    setCriteria((items) =>
                      items.map((item, itemIndex) => (itemIndex === index ? !item : item)),
                    )
                  }
                >
                  <Icon name="check" />
                </button>
                <div>
                  <strong>{label}</strong>
                  <small>
                    {criteria[index] ? "شاهد معتبر متصل است" : "شاهد یا توضیح بازبین لازم است"}
                  </small>
                </div>
                <StatusBadge tone={criteria[index] ? "success" : "warning"}>
                  {criteria[index] ? "پاس" : "باز"}
                </StatusBadge>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="تصمیم پذیرش" eyebrow="شرط فنی · مستقل از مالی">
          <label className="app-field">
            <span>نتیجه بررسی</span>
            <select defaultValue={complete ? "accept" : "revision"}>
              <option value="accept">پذیرش فنی تحویل</option>
              <option value="revision">درخواست اصلاح</option>
              <option value="reject">رد معیاربه‌معیار</option>
            </select>
          </label>
          <label className="app-field">
            <span>یادداشت بازبین</span>
            <textarea
              rows={5}
              defaultValue="داده روزهای ۱۸ تا ۲۱ باید با لاگ کالیبراسیون تطبیق داده شود."
            />
          </label>
          <button
            className="app-button app-button--primary app-button--full"
            disabled={!complete}
            onClick={() => onAction("پذیرش فنی تحویل DL-204", { sensitive: true, reason: true })}
          >
            پذیرش فنی و بازکردن مرحله مالی
          </button>
          {!complete && (
            <small className="app-disabled-reason">
              معیار «ثبت داده کامل ۳۰ روز» هنوز شواهد معتبر ندارد.
            </small>
          )}
        </Panel>
      </div>
    </>
  );
}

function FinancePage({ route, onAction }: PageProps) {
  const org = route.role === "org";
  const [payment, setPayment] = useState(PAYMENT_DEMO_SEED);
  useEffect(() => {
    const sync = () => setPayment(readPayment());
    window.addEventListener("rahhal:payments", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rahhal:payments", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <>
      {org && (
        <>
          <CaseHeader />
          <CaseNav current="/app/org/challenges/CH-1405-021/finance" />
        </>
      )}
      <section className="app-metric-grid app-metric-grid--three">
        <MetricCard label="ارزش قرارداد" value="۹۶۰ م.ت" detail="۳ مرحله اجرایی" />
        <MetricCard
          label="پرداخت‌شده"
          value="۳۲۰ م.ت"
          detail="رسید RC-881"
          tone="green"
          icon="shield"
        />
        <MetricCard
          label="در انتظار"
          value="۲۴۰ م.ت"
          detail={org ? "تأیید مالی" : "۳ روز تا SLA"}
          tone="amber"
          icon="history"
        />
      </section>
      <Panel
        title={org ? "مرحله اجرایی و کنترل پرداخت" : "وضعیت تسویه‌ها"}
        eyebrow="تفکیک پذیرش فنی و تأیید مالی"
      >
        <div className="app-finance-table">
          <div className="app-finance-table__head">
            <span>مرحله</span>
            <span>مبلغ</span>
            <span>پذیرش فنی</span>
            <span>تأیید مالی</span>
            <span>پرداخت / رسید</span>
            <span />
          </div>
          {[
            [
              "طراحی و نصب",
              "۳۲۰٬۰۰۰٬۰۰۰ تومان",
              "پذیرفته ۲۸ تیر",
              "تأییدشده",
              "پرداخت‌شده · RC-881",
            ],
            ["آزمون ۳۰ روزه", "۲۴۰٬۰۰۰٬۰۰۰ تومان", "پذیرفته ۱۳ مرداد", "در انتظار", "آماده پرداخت"],
            ["تحویل نهایی", "۴۰۰٬۰۰۰٬۰۰۰ تومان", "هنوز نرسیده", "قفل", "قفل"],
          ].map((row) => (
            <article key={row[0]}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <strong key={`${cellIndex}-${cell}`}>{cell}</strong>
                ) : (
                  <span key={`${cellIndex}-${cell}`}>
                    <StatusBadge tone={statusTone(cell)}>{cell}</StatusBadge>
                  </span>
                ),
              )}
              <button className="app-row-action" onClick={() => onAction(`بررسی مرحله ${row[0]}`)}>
                جزئیات
              </button>
            </article>
          ))}
        </div>
        <footer className="app-decision-footer">
          <div>
            <Icon name="shield" />
            <span>پذیرش فنی ثبت شده و قابل حذف نیست؛ تأیید مالی رویداد جدا با نقش مستقل است.</span>
          </div>
          {org && (
            <button
              className="app-button app-button--primary"
              disabled={payment.state !== "triggered" || !payment.technicalAccepted}
              onClick={() => {
                const next = requestFinanceApproval();
                if (!next) return;
                setPayment(next);
                onAction("ارسال مرحله دوم برای تأیید مالی", { sensitive: true, reason: true });
              }}
            >
              {payment.state === "triggered" ? "ارسال برای تأیید مالی" : "در صف تأیید مالی"}
            </button>
          )}
        </footer>
      </Panel>
    </>
  );
}

function ImpactPage({ onAction }: PageProps) {
  const metrics = [
    ["مصرف آب", "۱۸٫۴", "۱۲٫۹", "۱۱٫۸", "لیتر/واحد"],
    ["زمان توقف", "۸٫۲", "۶٫۰", "۵٫۶", "ساعت/ماه"],
    ["هزینه سالانه", "۱۲٫۶", "۹٫۴", "۸٫۸", "میلیارد تومان"],
  ];
  return (
    <>
      <CaseHeader />
      <CaseNav current="/app/org/challenges/CH-1405-021/impact" />
      <section className="app-impact-hero">
        <div>
          <span className="app-eyebrow">نتیجه پایلوت · بازه ۳۰ روز</span>
          <h2>کاهش ۳۵٫۹٪ مصرف آب، با حفظ کیفیت</h2>
          <p>آخرین اندازه‌گیری ۱۳ مرداد ۱۴۰۵ · شواهد تأییدشده توسط واحد بهره‌برداری</p>
        </div>
        <div className="app-roi-ring">
          <strong>۲٫۴×</strong>
          <span>بازده سرمایه‌گذاری پیش‌بینی‌شده</span>
        </div>
      </section>
      <Panel title="خط پایه تا مقدار واقعی" eyebrow="تعریف، بازه و شاهد شاخص">
        <div className="app-impact-table">
          <div>
            <span>شاخص</span>
            <span>خط پایه</span>
            <span>هدف</span>
            <span>مقدار واقعی</span>
            <span>وضعیت</span>
          </div>
          {metrics.map((row) => (
            <article key={row[0]}>
              <div>
                <strong>{row[0]}</strong>
                <small>{row[4]}</small>
              </div>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <strong>{row[3]}</strong>
              <StatusBadge tone="success">فراتر از هدف</StatusBadge>
            </article>
          ))}
        </div>
      </Panel>
      <div className="app-layout">
        <Panel title="شواهد اثر" eyebrow="شواهد">
          <div className="app-doc-list">
            {["گزارش کنتور و کالیبراسیون", "کنترل کیفیت محصول", "صورت‌جلسه بهره‌برداری"].map(
              (item) => (
                <article key={item}>
                  <span>
                    <Icon name="brief" />
                  </span>
                  <div>
                    <strong>{item}</strong>
                    <small>نسخه ۱ · checksum معتبر</small>
                  </div>
                  <StatusBadge tone="success">اعتبارسنجی‌شده</StatusBadge>
                </article>
              ),
            )}
          </div>
        </Panel>
        <Panel title="تصمیم توسعه" eyebrow="Scale / Repeat / Stop">
          <div className="app-scale-options">
            {["توسعه به خط ۲", "تکرار پایلوت", "توقف و بستن"].map((item, index) => (
              <button key={item} className={index === 0 ? "active" : ""}>
                <Icon name={index === 0 ? "trend" : index === 1 ? "history" : "close"} />
                <span>
                  <strong>{item}</strong>
                  <small>{index === 0 ? "پیشنهاد براساس شواهد" : "گزینه تصمیم انسانی"}</small>
                </span>
              </button>
            ))}
          </div>
          <button
            className="app-button app-button--primary app-button--full"
            onClick={() => onAction("ثبت تصمیم توسعه پایلوت", { sensitive: true, reason: true })}
          >
            ثبت تصمیم و بستن پرونده
          </button>
        </Panel>
      </div>
    </>
  );
}

function ResourcePage({ route, onAction }: PageProps) {
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

function OpportunitiesPage({ route, onAction }: PageProps) {
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

function ReviewerPage({ route, onAction }: PageProps) {
  const [conflict, setConflict] = useState<"none" | "clear" | "conflict">("none");
  const [scores, setScores] = useState([85, 78, 90, 82]);
  const assignmentId = route.path.match(/\/assignments\/([^/]+)/)?.[1] ?? "RV-204";
  const assignment = (
    <div className="app-review-assignment">
      <div>
        <span className="app-eyebrow">مأموریت {assignmentId} · داوری بدون نمایش هویت</span>
        <h2>ارزیابی راهکار کاهش مصرف آب صنعتی</h2>
        <p>شناسه ارائه‌دهنده و فراداده شناسایی‌کننده تا ثبت نهایی پنهان‌اند.</p>
      </div>
      <dl>
        <div>
          <dt>موعد</dt>
          <dd>امروز ۱۶:۳۰</dd>
        </div>
        <div>
          <dt>پیشرفت</dt>
          <dd>۸۰٪</dd>
        </div>
        <div>
          <dt>معیارنامه داوری</dt>
          <dd>نسخه ۲</dd>
        </div>
      </dl>
    </div>
  );
  if (route.experience === "reviewer-queue" && route.path !== "/app/reviewer/assignments")
    return (
      <>
        {assignment}
        <Panel title="دامنه مأموریت" eyebrow="پیش از دسترسی به مدارک">
          <p>
            ابتدا محدوده داوری، مهلت و سیاست محرمانگی را مرور کنید. دسترسی به مدارک فقط پس از ثبت
            اظهار تعارض منافع باز می‌شود.
          </p>
          <Link
            className="app-button app-button--primary"
            href={`/app/reviewer/assignments/${assignmentId}/conflict`}
          >
            بررسی و اظهار تعارض
          </Link>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-queue")
    return (
      <>
        <section className="app-metric-grid app-metric-grid--three">
          <MetricCard
            label="نیازمند اقدام"
            value="۲"
            detail="۱ مهلت امروز"
            tone="red"
            icon="history"
          />
          <MetricCard label="در حال داوری" value="۳" detail="میانگین پیشرفت ۶۸٪" />
          <MetricCard
            label="تکمیل این ماه"
            value="۱۲"
            detail="SLA: ۹۲٪"
            tone="green"
            icon="shield"
          />
        </section>
        <Panel title="مأموریت‌های من" eyebrow="متمرکز و مستقل">
          <div className="app-assignment-list">
            {reviewers.map((reviewer, index) => {
              const listedAssignmentId = `RV-${204 - index * 16}`;
              return (
                <article key={reviewer.id}>
                  <div>
                    <StatusBadge tone={index === 0 ? "danger" : "info"}>
                      {index === 0 ? "فوری" : "فعال"}
                    </StatusBadge>
                    <bdi>{listedAssignmentId}</bdi>
                  </div>
                  <h3>
                    {
                      ["کاهش مصرف آب صنعتی", "پایش خوردگی تجهیزات", "بهینه‌سازی بازیافت حرارت"][
                        index
                      ]
                    }
                  </h3>
                  <p>معیارنامه نسخه ۲ · محتوای بی‌نام · {reviewer.expertise}</p>
                  <ProgressBar value={reviewer.progress} label="پیشرفت" />
                  <footer>
                    <span>{reviewer.due}</span>
                    <Link
                      className="app-button app-button--primary"
                      href={`/app/reviewer/assignments/${listedAssignmentId}/conflict`}
                    >
                      ادامه مأموریت
                    </Link>
                  </footer>
                </article>
              );
            })}
          </div>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-conflict")
    return (
      <>
        {assignment}
        <Panel title="اظهار تعارض منافع" eyebrow="پیش از نمایش محتوای حساس">
          <div className="app-coi-options">
            <button
              className={conflict === "clear" ? "active" : ""}
              onClick={() => setConflict("clear")}
            >
              <Icon name="shield" />
              <div>
                <strong>تعارضی ندارم</strong>
                <span>هیچ رابطه مالی، حرفه‌ای یا شخصی اثرگذار وجود ندارد.</span>
              </div>
            </button>
            <button
              className={conflict === "conflict" ? "active danger" : ""}
              onClick={() => setConflict("conflict")}
            >
              <Icon name="notification" />
              <div>
                <strong>تعارض یا تردید دارم</strong>
                <span>عملیات بررسی و تا آن زمان محتوا محدود می‌شود.</span>
              </div>
            </button>
          </div>
          {conflict === "conflict" && (
            <label className="app-field">
              <span>شرح محرمانه تعارض</span>
              <textarea rows={4} placeholder="ماهیت رابطه را بدون اطلاعات غیرضروری توضیح دهید." />
            </label>
          )}
          <footer className="app-decision-footer">
            <div>
              <Icon name="lock" />
              <span>تا ثبت اظهار، جزئیات پیشنهاد و تیم نمایش داده نمی‌شود.</span>
            </div>
            <button
              className="app-button app-button--primary"
              disabled={conflict === "none"}
              onClick={() => {
                setReviewCoi(assignmentId, conflict === "clear" ? "clear" : "conflict");
                onAction(
                  conflict === "clear"
                    ? "ثبت نبود تعارض و پذیرش مأموریت"
                    : "ثبت تعارض و ارجاع به عملیات",
                  { sensitive: true, reason: conflict === "conflict" },
                );
              }}
            >
              ثبت اظهار و ادامه
            </button>
          </footer>
        </Panel>
      </>
    );
  if (route.experience === "reviewer-score")
    return (
      <>
        {assignment}
        <div className="app-review-layout">
          <aside className="app-rubric-nav">
            {["تناسب مسئله", "اعتبار فنی", "اجرای پایلوت", "ریسک و ایمنی"].map((item, index) => (
              <button key={item} className={index === 0 ? "active" : ""}>
                <span>{(index + 1).toLocaleString("fa-IR")}</span>
                <div>
                  <strong>{item}</strong>
                  <small>وزن {[25, 35, 25, 15][index].toLocaleString("fa-IR")}٪</small>
                </div>
                <StatusBadge tone={scores[index] > 0 ? "success" : "warning"}>
                  {scores[index] > 0 ? "کامل" : "ناقص"}
                </StatusBadge>
              </button>
            ))}
          </aside>
          <Panel title="تناسب راهکار با مسئله" eyebrow="وزن ۲۵٪ · حدنصاب ۶۰">
            <div className="app-score-control">
              <label>
                <span>امتیاز</span>
                <strong>{scores[0].toLocaleString("fa-IR")}</strong>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={scores[0]}
                  onChange={(event) =>
                    setScores((items) =>
                      items.map((item, index) => (index === 0 ? Number(event.target.value) : item)),
                    )
                  }
                />
              </label>
              <div>
                <span>۰ · نامتناسب</span>
                <span>۱۰۰ · شواهد کامل</span>
              </div>
            </div>
            <label className="app-field">
              <span>
                دلیل امتیاز <b>*</b>
              </span>
              <textarea
                rows={7}
                defaultValue="راهکار با محدودیت توقف و معیار کاهش مصرف سازگار است. فرض کیفیت آب باید در شرط پذیرش روز دهم کنترل شود."
              />
            </label>
            <div className="app-autosave">
              <i />
              پیش‌نویس ذخیره شد · اکنون
            </div>
            <button
              className="app-button app-button--primary"
              onClick={() => onAction("ذخیره پیش‌نویس داوری")}
            >
              ذخیره و معیار بعدی
            </button>
          </Panel>
          <aside className="app-blind-note">
            <Icon name="lock" />
            <h3>داوری مستقل</h3>
            <p>
              امتیاز دیگر داوران تا ثبت نهایی نمایش داده نمی‌شود. ارتباط با حل‌کننده فقط از مسیر
              شفاف‌سازی کنترل‌شده است.
            </p>
            <button
              className="app-button app-button--secondary"
              onClick={() => onAction("ثبت درخواست شفاف‌سازی")}
            >
              درخواست شفاف‌سازی
            </button>
          </aside>
        </div>
      </>
    );
  return (
    <>
      {assignment}
      <Panel title="پیش‌نمایش ثبت نهایی" eyebrow="پس از ثبت، ویرایش فقط با بازگشایی عملیات">
        <div className="app-final-review">
          <div className="app-final-score">
            <strong>
              {Math.round(
                scores.reduce((sum, value) => sum + value, 0) / scores.length,
              ).toLocaleString("fa-IR")}
            </strong>
            <span>امتیاز نهایی از ۱۰۰</span>
          </div>
          <div className="app-score-breakdown">
            {["تناسب", "فنی", "پایلوت", "ریسک"].map((label, index) => (
              <div key={label}>
                <span>{label}</span>
                <ProgressBar value={scores[index]} />
                <strong>{scores[index].toLocaleString("fa-IR")}</strong>
              </div>
            ))}
          </div>
        </div>
        <label className="app-confirm-check">
          <input type="checkbox" defaultChecked />
          <span>
            <Icon name="check" />
          </span>
          <div>
            <strong>استقلال و کامل‌بودن داوری را تأیید می‌کنم</strong>
            <small>
              این داوری بدون مشاهده امتیاز دیگران و براساس معیارنامه نسخه ۲ انجام شده است.
            </small>
          </div>
        </label>
        <footer className="app-decision-footer">
          <div>
            <Icon name="shield" />
            <span>نسخه، دلایل، زمان سرور و اظهار تعارض در رسید ثبت می‌شوند.</span>
          </div>
          <button
            className="app-button app-button--primary"
            onClick={() =>
              onAction(`ثبت نهایی داوری ${assignmentId}`, { sensitive: true, reason: true })
            }
          >
            ثبت نهایی و دریافت رسید
          </button>
        </footer>
      </Panel>
    </>
  );
}

function OpsPage({ route, onAction }: PageProps) {
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

function ReviewerProtected({
  route,
  children,
}: {
  route: InternalRoute;
  children: React.ReactNode;
}) {
  const assignmentId = route.path.match(/\/assignments\/([^/]+)/)?.[1];
  const [coi, setCoi] = useState<ReturnType<typeof getReviewCoi> | null>(null);
  useEffect(() => setCoi(assignmentId ? getReviewCoi(assignmentId) : "pending"), [assignmentId]);
  if (coi === null) {
    return (
      <Panel title="در حال بررسی مجوز" eyebrow="کنترل دسترسی">
        <p aria-live="polite">وضعیت اظهار تعارض در حال بررسی است.</p>
      </Panel>
    );
  }
  if (!canAccessReviewMaterials(coi)) {
    return (
      <Panel title="محتوای داوری هنوز در دسترس نیست" eyebrow="کنترل تعارض منافع">
        <p>
          پیش از مشاهده مدارک، مقایسه یا امتیازدهی باید نبود تعارض منافع را ثبت کنید. در صورت ثبت
          تعارض، دسترسی تا بررسی عملیات بسته می‌ماند.
        </p>
        <Link
          className="app-button app-button--primary"
          href={`/app/reviewer/assignments/${assignmentId ?? "RV-204"}/conflict`}
        >
          تکمیل اظهار تعارض
        </Link>
      </Panel>
    );
  }
  return <>{children}</>;
}

export function InternalPage({ route, onAction, space }: PageProps) {
  switch (route.experience) {
    case "dashboard":
      return <DashboardPage route={route} onAction={onAction} />;
    case "challenge-list":
      return <ChallengeListPage route={route} onAction={onAction} />;
    case "intake":
      return <IntakePage route={route} onAction={onAction} />;
    case "verification":
      return <VerificationPage route={route} onAction={onAction} />;
    case "triage":
      return <TriagePage route={route} onAction={onAction} />;
    case "studio":
      return <StudioPage route={route} onAction={onAction} />;
    case "case-overview":
      return <CaseOverviewPage route={route} onAction={onAction} />;
    case "timeline":
      return <TimelinePage route={route} onAction={onAction} />;
    case "experts":
      return <ExpertsPage route={route} onAction={onAction} />;
    case "proposal-inbox":
      return <ProposalInboxPage route={route} onAction={onAction} />;
    case "proposal-compare":
      return route.role === "reviewer" ? (
        <ReviewerProtected route={route}>
          <ProposalComparePage route={route} onAction={onAction} />
        </ReviewerProtected>
      ) : (
        <ProposalComparePage route={route} onAction={onAction} />
      );
    case "review-room":
      return <ReviewRoomPage route={route} onAction={onAction} />;
    case "decision-room":
      return <DecisionRoomPage route={route} onAction={onAction} />;
    case "contract":
      return <ContractPage route={route} onAction={onAction} />;
    case "pilot":
      return <PilotPage route={route} onAction={onAction} />;
    case "deliverable":
      return <DeliverablePage route={route} onAction={onAction} />;
    case "finance":
      return <FinancePage route={route} onAction={onAction} />;
    case "impact":
      return <ImpactPage route={route} onAction={onAction} />;
    case "documents":
      return route.role === "reviewer" ? (
        <ReviewerProtected route={route}>
          <ResourcePage route={route} onAction={onAction} />
        </ReviewerProtected>
      ) : (
        <ResourcePage route={route} onAction={onAction} />
      );
    case "conversations":
    case "audit":
    case "reports":
    case "team":
    case "settings":
    case "profile":
    case "eligibility":
    case "data-room":
    case "reputation":
      return <ResourcePage route={route} onAction={onAction} />;
    case "opportunities":
    case "invitations":
      return <OpportunitiesPage route={route} onAction={onAction} />;
    case "proposal-builder":
      return (
        <SolverProposalWizard
          path={route.path}
          space={space ?? "individual"}
          onSubmit={() => undefined}
        />
      );
    case "proposal-status":
      return <ResourcePage route={route} onAction={onAction} />;
    case "reviewer-queue":
    case "reviewer-conflict":
      return <ReviewerPage route={route} onAction={onAction} />;
    case "reviewer-score":
    case "reviewer-submit":
      return (
        <ReviewerProtected route={route}>
          <ReviewerPage route={route} onAction={onAction} />
        </ReviewerProtected>
      );
    case "ops-queue":
    case "ops-kyc":
    case "ops-quality":
    case "ops-review":
    case "ops-moderation":
    case "ops-dispute":
    case "ops-payment":
    case "ops-support":
    case "ops-system":
      return <OpsPage route={route} onAction={onAction} />;
    default:
      return <ResourcePage route={route} onAction={onAction} />;
  }
}
