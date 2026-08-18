"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { SolverDashboardExperience } from "@/components/solver-dashboard";
import { actionItems, challenges } from "@/data/fixtures/internal";
import { publicationGates } from "@/domain/product";
import {
  CaseHeader,
  EmptyInline,
  GateChecklist,
  MetricCard,
  Panel,
  ProgressBar,
  StatusBadge,
} from "@/components/internal/shared";
import { SyncQuery, statusTone, type PageProps } from "@/components/internal/page-contracts";

export function DashboardPage({ route, onAction, space }: PageProps) {
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

export function ChallengeListPage({ onAction }: PageProps) {
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

export function IntakePage({ onAction }: PageProps) {
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

export function VerificationPage({ route, onAction }: PageProps) {
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

export function TriagePage({ onAction }: PageProps) {
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

export function StudioPage({ onAction }: PageProps) {
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
