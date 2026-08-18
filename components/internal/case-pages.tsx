"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { experts, pilotMilestones, proposals, reviewers, timeline } from "@/data/fixtures/internal";
import { formatToman, publicationGates } from "@/domain/product";
import { PAYMENT_DEMO_SEED, readPayment, requestFinanceApproval } from "@/lib/payments/store";
import {
  CaseHeader,
  GateChecklist,
  MetricCard,
  Panel,
  ProgressBar,
  StatusBadge,
} from "@/components/internal/shared";
import { statusTone, type PageProps } from "@/components/internal/page-contracts";

export const caseTabs = [
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

export function CaseNav({ current }: { current: string }) {
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

export function CaseOverviewPage({ route, onAction }: PageProps) {
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

export function TimelinePage({ route, onAction }: PageProps) {
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

export function ExpertsPage({ route, onAction }: PageProps) {
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

export function ProposalInboxPage({ route, onAction }: PageProps) {
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

export function ProposalComparePage({ route, onAction }: PageProps) {
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

export function ReviewRoomPage({ route, onAction }: PageProps) {
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

export function DecisionRoomPage({ route, onAction }: PageProps) {
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

export function ContractPage({ route, onAction }: PageProps) {
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

export function PilotPage({ route, onAction }: PageProps) {
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

export function DeliverablePage({ route, onAction }: PageProps) {
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

export function FinancePage({ route, onAction }: PageProps) {
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

export function ImpactPage({ onAction }: PageProps) {
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
