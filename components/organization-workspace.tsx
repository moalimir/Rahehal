"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import type { InternalRoute } from "@/data/internal-routes";
import { createDirectOffer, listDirectOffers, type DirectOffer } from "@/lib/offers/store";
import { useWebRuntime } from "@/components/runtime-provider";

import { isNetworkWebRuntime } from "@/lib/runtime/mode";
import { PreviewDataNotice } from "@/components/organization-preview-notice";
import { classifyRoute } from "@/lib/routing/route-classification";

const ConnectedNotifications = dynamic(
  () =>
    import("@/components/solver/connected-notifications").then(
      (module) => module.ConnectedNotifications,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری بخش متصل</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const ConnectedOrganizationProposals = dynamic(
  () =>
    import("@/components/solver/connected-organization-proposals").then(
      (module) => module.ConnectedOrganizationProposals,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری بخش متصل</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const ConnectedOrganizationProposalRecord = dynamic(
  () =>
    import("@/components/solver/connected-organization-proposals").then(
      (module) => module.ConnectedOrganizationProposalRecord,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری بخش متصل</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const ConnectedOrganizationDashboard = dynamic(
  () =>
    import("@/components/organization/connected-dashboard").then(
      (module) => module.ConnectedOrganizationDashboard,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری داشبورد سازمان</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const ConnectedOrganizationDirectOffers = dynamic(
  () =>
    import("@/components/organization/connected-direct-offers").then(
      (module) => module.ConnectedOrganizationDirectOffers,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری دعوت‌های مستقیم</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const ConnectedOrganizationWorkspaceFacts = dynamic(
  () =>
    import("@/components/organization/connected-workspace-facts").then(
      (module) => module.ConnectedOrganizationWorkspaceFacts,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال خواندن فضای سازمانی</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const topLevelOrganizationPaths = new Set([
  "/app/org/dashboard",
  "/app/org/experts",
  "/app/org/invitations",
  "/app/org/proposals",
  "/app/org/proposals/record",
  "/app/org/pilots",
  "/app/org/contracts-payments",
  "/app/org/reports",
  "/app/org/team",
  "/app/org/access",
  "/app/org/profile",
  "/app/org/settings",
  "/app/org/notifications",
]);

export function isOrganizationWorkspacePath(path: string) {
  return topLevelOrganizationPaths.has(path);
}

const organizationChallenges = [
  {
    id: "CH-1405-021",
    title: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
    stage: "داوری پیشنهادها",
    status: "نیازمند اقدام",
    tone: "warning",
    progress: 68,
    next: "تکمیل داوری مالی",
  },
  {
    id: "CH-1405-018",
    title: "پایش هوشمند خوردگی تجهیزات",
    stage: "دریافت راه‌حل",
    status: "فعال",
    tone: "success",
    progress: 52,
    next: "پاسخ به پرسش فنی",
  },
  {
    id: "CH-1405-014",
    title: "بهینه‌سازی بازیافت حرارت",
    stage: "صورت‌بندی",
    status: "پیش‌نویس",
    tone: "neutral",
    progress: 74,
    next: "تأیید حقوقی",
  },
];

const organizationExperts = [
  {
    id: "EXP-221",
    name: "تیم نوآب",
    specialty: "تصفیه و بازچرخانی آب صنعتی",
    city: "تهران",
    fit: 94,
    capacity: "آماده همکاری",
    evidence: "۳ پایلوت صنعتی تأییدشده",
    tags: ["بازچرخانی آب", "پایش برخط"],
  },
  {
    id: "EXP-198",
    name: "گروه زیست‌فرایند",
    specialty: "غشا و فرایندهای جداسازی",
    city: "اصفهان",
    fit: 89,
    capacity: "۳۰٪ ظرفیت آزاد",
    evidence: "۲ ثبت اختراع و ۴ مقاله کاربردی",
    tags: ["غشا", "تصفیه پیشرفته"],
  },
  {
    id: "EXP-174",
    name: "شرکت پایدار تجهیز",
    specialty: "اتوماسیون و پایش سیالات",
    city: "کرج",
    fit: 83,
    capacity: "آماده همکاری",
    evidence: "۵ پروژه صنعتی تأییدشده",
    tags: ["اتوماسیون", "حسگر صنعتی"],
  },
  {
    id: "EXP-163",
    name: "سارا محمدی",
    specialty: "تحلیل داده و یادگیری ماشین",
    city: "تهران",
    fit: 81,
    capacity: "۲۰ ساعت در هفته",
    evidence: "پروفایل و رزومه تأییدشده",
    tags: ["یادگیری ماشین", "تحلیل داده"],
  },
];

const organizationProposals = [
  {
    id: "PR-104",
    challenge: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
    solver: "تیم نوآب",
    version: "نسخه ۳",
    status: "داوری مالی",
    score: 91,
    budget: "۷۸۰ میلیون تومان",
    due: "امروز ۱۶:۳۰",
  },
  {
    id: "PR-097",
    challenge: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
    solver: "گروه زیست‌فرایند",
    version: "نسخه ۲",
    status: "داوری کامل",
    score: 86,
    budget: "۶۹۰ میلیون تومان",
    due: "آماده تصمیم",
  },
  {
    id: "PR-091",
    challenge: "پایش هوشمند خوردگی تجهیزات",
    solver: "پایدار تجهیز",
    version: "نسخه ۱",
    status: "نیازمند شفاف‌سازی",
    score: 78,
    budget: "۸۴۰ میلیون تومان",
    due: "۲ روز باقی‌مانده",
  },
];

const organizationMembers = [
  ["سارا نادری", "مدیر نوآوری", "مالک فضای سازمان", "فعال"],
  ["امیر توکلی", "بازبین فنی", "مسئله‌ها و داوری فنی", "فعال"],
  ["مریم عزیزی", "حقوقی", "قرارداد و مالکیت فکری", "فعال"],
  ["علی محمدی", "مالی", "بودجه و پرداخت", "نیازمند 2FA"],
];

function OrgPageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description: string;
  eyebrow: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="org-page-head">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="org-page-head__action">{action}</div>}
    </header>
  );
}

function OrgMetric({
  label,
  value,
  detail,
  icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  detail: string;
  icon: "brief" | "history" | "decision" | "impact" | "people" | "shield" | "check" | "trend";
  tone?: string;
}) {
  return (
    <article className={`org-metric org-metric--${tone}`}>
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function OrgToast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="org-toast" role="status">
      <Icon name="check" />
      <span>{message}</span>
      <button type="button" aria-label="بستن پیام" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}

function OrganizationDashboard() {
  const runtime = useWebRuntime();
  if (runtime.mode === "network") return <ConnectedOrganizationDashboard />;
  return <DemoOrganizationDashboard />;
}

function DemoOrganizationDashboard() {
  const [done, setDone] = useState<string[]>([]);
  /**
   * The greeting is the one thing on this page that must not be a fixture: a
   * dashboard that addresses a signed-in owner by someone else's name reads as
   * a broken session, not as sample data. The counts beside it stay sample —
   * the preview notice above says so — but who is being greeted comes from the
   * session.
   */
  const greetedName = "سارا";
  const actions = [
    ["ACT-301", "تکمیل داوری مالی پیشنهاد PR-104", "امروز، ۱۶:۳۰", "فوری"],
    ["ACT-298", "پاسخ به درخواست شفاف‌سازی تیم نوآب", "فردا، ۱۰:۰۰", "بالا"],
    ["ACT-286", "بازبینی ریسک ایمنی پایلوت", "۱۷ مرداد", "متوسط"],
  ];
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="داشبورد سازمان"
        title={`سلام ${greetedName}؛ امروز ۴ اقدام نیازمند توجه است`}
        description="مسئله‌ها، پیشنهادهای دریافتی، دعوت‌ها و پایلوت‌ها را با همان وضعیت‌هایی ببینید که حل‌کنندگان در سمت خود مشاهده می‌کنند."
        action={
          <Link className="org-button org-button--primary" href="/app/org/challenges/new">
            <Icon name="plus" /> ثبت مسئله جدید
          </Link>
        }
      />
      <section className="org-metrics" aria-label="خلاصه وضعیت سازمان">
        <OrgMetric
          label="اقدام فوری"
          value="۴"
          detail="۲ مورد تا پایان امروز"
          icon="history"
          tone="red"
        />
        <OrgMetric label="مسئله فعال" value="۱۲" detail="۳ فراخوان در حال دریافت" icon="brief" />
        <OrgMetric
          label="پیشنهاد جدید"
          value="۸"
          detail="۳ مورد نیازمند غربال"
          icon="decision"
          tone="violet"
        />
        <OrgMetric
          label="پایلوت در ریسک"
          value="۱"
          detail="اقدام HSE تا فردا"
          icon="impact"
          tone="amber"
        />
      </section>

      <div className="org-dashboard-grid">
        <section className="org-card org-card--wide">
          <header className="org-card__head">
            <div>
              <h2>صف اقدام من</h2>
              <p>مرتب‌شده براساس شدت، موعد و مسئولیت</p>
            </div>
            <Link href="/app/org/notifications">مشاهده همه اعلان‌ها</Link>
          </header>
          <div className="org-action-list">
            {actions.map(([id, title, due, priority]) => (
              <article key={id} className={done.includes(id) ? "is-done" : ""}>
                <button
                  type="button"
                  className="org-check"
                  aria-label={`${title}: ${done.includes(id) ? "بازگردانی" : "تکمیل"}`}
                  onClick={() =>
                    setDone((current) =>
                      current.includes(id)
                        ? current.filter((item) => item !== id)
                        : [...current, id],
                    )
                  }
                >
                  <Icon name="check" />
                </button>
                <div>
                  <strong>{title}</strong>
                  <small>
                    <bdi>{id}</bdi> · {due}
                  </small>
                </div>
                <span className={`org-status ${priority === "فوری" ? "is-danger" : "is-warning"}`}>
                  {done.includes(id) ? "تکمیل" : priority}
                </span>
                <Link
                  href={
                    id === "ACT-301"
                      ? "/app/org/challenges/CH-1405-021/review"
                      : "/app/org/challenges/CH-1405-021/overview"
                  }
                >
                  بررسی <Icon name="chevron" />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="org-card">
          <header className="org-card__head">
            <div>
              <h2>سلامت مسئله‌ها</h2>
              <p>اقدام بعدی هر پرونده</p>
            </div>
          </header>
          <div className="org-health-list">
            {organizationChallenges.map((challenge) => (
              <article key={challenge.id}>
                <div>
                  <strong>{challenge.title}</strong>
                  <small>
                    {challenge.stage} · {challenge.next}
                  </small>
                </div>
                <span>{challenge.progress.toLocaleString("fa-IR")}٪</span>
                <i>
                  <b style={{ width: `${challenge.progress}%` }} />
                </i>
              </article>
            ))}
          </div>
          <Link className="org-text-link" href="/app/org/challenges">
            مشاهده همه مسئله‌ها <Icon name="arrow" />
          </Link>
        </section>
      </div>

      <section className="org-card">
        <header className="org-card__head">
          <div>
            <h2>پیشنهادهای تازه و نیازمند تصمیم</h2>
            <p>همان نسخه قفل‌شده‌ای که فرد یا تیم ارسال کرده است</p>
          </div>
          <Link href="/app/org/proposals">مرکز پیشنهادها</Link>
        </header>
        <div className="org-compact-table">
          <header>
            <span>حل‌کننده</span>
            <span>مسئله</span>
            <span>وضعیت</span>
            <span>امتیاز فنی</span>
            <span>اقدام</span>
          </header>
          {organizationProposals.map((proposal) => (
            <article key={proposal.id}>
              <div>
                <PersonAvatar name={proposal.solver} />
                <span>
                  <strong>{proposal.solver}</strong>
                  <small>
                    {proposal.id} · {proposal.version}
                  </small>
                </span>
              </div>
              <span>{proposal.challenge}</span>
              <span className="org-status is-info">{proposal.status}</span>
              <strong>{proposal.score.toLocaleString("fa-IR")} از ۱۰۰</strong>
              <Link href="/app/org/challenges/CH-1405-021/proposals">مشاهده راه‌حل</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function OrganizationExperts({ invitations = false }: { invitations?: boolean }) {
  const runtime = useWebRuntime();
  if (runtime.mode === "network") return <ConnectedOrganizationDirectOffers />;
  return <DemoOrganizationExperts invitations={invitations} />;
}

function DemoOrganizationExperts({ invitations = false }: { invitations?: boolean }) {
  const [query, setQuery] = useState("");
  const [minimumFit, setMinimumFit] = useState("all");
  const [invited, setInvited] = useState<string[]>([]);
  const [profile, setProfile] = useState<(typeof organizationExperts)[number] | null>(null);
  const [toast, setToast] = useState("");
  const [offerRows, setOfferRows] = useState<DirectOffer[]>([]);
  useEffect(() => {
    const sync = () => setOfferRows(listDirectOffers());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("rahhal:direct-offers", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("rahhal:direct-offers", sync);
    };
  }, []);
  const filtered = organizationExperts.filter(
    (expert) =>
      `${expert.name} ${expert.specialty} ${expert.tags.join(" ")}`.includes(query.trim()) &&
      (minimumFit === "all" || expert.fit >= Number(minimumFit)),
  );
  const downloadInvitationExport = () => {
    const header = "id,recipient,challenge,state,updatedAt";
    const lines = offerRows.map((offer) =>
      [offer.id, offer.recipientName, offer.project, offer.state, offer.updatedAt]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
    const url = URL.createObjectURL(
      new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rahhal-direct-offers.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (invitations) {
    const rows = offerRows.map((offer) => [
      offer.id,
      offer.recipientName,
      offer.project,
      offer.state === "accepted"
        ? "پذیرفته‌شده"
        : offer.state === "declined"
          ? "ردشده"
          : offer.state === "cancelled"
            ? "لغوشده"
            : "در انتظار پاسخ",
      offer.received,
    ]);
    return (
      <div className="org-workspace-page">
        <OrgPageHeader
          eyebrow="متخصصان و دعوت‌ها"
          title="دعوت‌های ارسال‌شده"
          description="وضعیت دعوت در این صفحه دقیقاً با دعوت دریافتی فرد یا تیم همگام است؛ پذیرش، رد، مشاهده و انقضا قابل پیگیری‌اند."
          action={
            <Link className="org-button org-button--primary" href="/app/org/experts">
              <Icon name="plus" /> دعوت جدید
            </Link>
          }
        />
        <section className="org-metrics org-metrics--three">
          <OrgMetric
            label="در انتظار پاسخ"
            value={offerRows
              .filter((offer) => offer.state === "pending")
              .length.toLocaleString("fa-IR")}
            detail="نیازمند پیگیری"
            icon="history"
          />
          <OrgMetric
            label="پذیرفته‌شده"
            value={offerRows
              .filter((offer) => offer.state === "accepted")
              .length.toLocaleString("fa-IR")}
            detail="آماده دریافت راه‌حل"
            icon="check"
            tone="green"
          />
          <OrgMetric
            label="رد یا منقضی"
            value={offerRows
              .filter((offer) => ["declined", "expired", "cancelled"].includes(offer.state))
              .length.toLocaleString("fa-IR")}
            detail="قابل دعوت مجدد"
            icon="people"
            tone="red"
          />
        </section>
        <section className="org-card">
          <header className="org-card__head">
            <div>
              <h2>چرخه دعوت‌ها</h2>
              <p>شناسه، دامنه مسئله و آخرین رویداد</p>
            </div>
            <button
              className="org-button org-button--secondary"
              type="button"
              onClick={downloadInvitationExport}
            >
              <Icon name="download" /> خروجی
            </button>
          </header>
          <div className="org-invitation-table">
            <header>
              <span>دعوت‌شونده</span>
              <span>مسئله</span>
              <span>وضعیت مشترک</span>
              <span>آخرین رویداد</span>
              <span>اقدام</span>
            </header>
            {rows.map(([id, name, challenge, status, date]) => (
              <article key={id}>
                <div>
                  <PersonAvatar name={name} />
                  <span>
                    <strong>{name}</strong>
                    <small>{id}</small>
                  </span>
                </div>
                <span>{challenge}</span>
                <span
                  className={`org-status ${status === "پذیرفته‌شده" ? "is-success" : status === "ردشده" ? "is-danger" : "is-info"}`}
                >
                  {status}
                </span>
                <span>{date}</span>
                <button type="button" onClick={() => setToast(`جزئیات ${id} بازبینی شد.`)}>
                  مشاهده جزئیات
                </button>
              </article>
            ))}
          </div>
        </section>
        <OrgToast message={toast} onClose={() => setToast("")} />
      </div>
    );
  }

  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="شبکه متخصصان"
        title="متخصص یا تیم مناسب را پیدا کنید"
        description="تطابق‌ها کمک‌یار تصمیم هستند؛ پروفایل، رزومه، ظرفیت و تعارض احتمالی را پیش از دعوت بررسی کنید."
        action={
          <Link className="org-button org-button--secondary" href="/app/org/invitations">
            <Icon name="mail" /> دعوت‌های ارسال‌شده
          </Link>
        }
      />
      <section className="org-filter-card">
        <label>
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو براساس نام، تخصص یا مهارت"
          />
        </label>
        <select
          value={minimumFit}
          onChange={(event) => setMinimumFit(event.target.value)}
          aria-label="حداقل تطابق"
        >
          <option value="all">همه تطابق‌ها</option>
          <option value="90">بیش از ۹۰٪</option>
          <option value="85">بیش از ۸۵٪</option>
          <option value="80">بیش از ۸۰٪</option>
        </select>
        <select aria-label="نوع حل‌کننده">
          <option>فرد و تیم</option>
          <option>فقط تیم‌ها</option>
          <option>فقط افراد</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setMinimumFit("all");
          }}
        >
          پاک‌کردن فیلترها
        </button>
      </section>
      <div className="org-expert-grid">
        {filtered.map((expert) => (
          <article className="org-expert-card" key={expert.id}>
            <header>
              <PersonAvatar name={expert.name} />
              <div>
                <strong>{expert.name}</strong>
                <small>{expert.specialty}</small>
              </div>
              <b>{expert.fit.toLocaleString("fa-IR")}٪ تطابق</b>
            </header>
            <dl>
              <div>
                <dt>
                  <Icon name="location" /> موقعیت
                </dt>
                <dd>{expert.city}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="history" /> ظرفیت
                </dt>
                <dd>{expert.capacity}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="shield" /> شواهد
                </dt>
                <dd>{expert.evidence}</dd>
              </div>
            </dl>
            <div className="org-tags">
              {expert.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => setProfile(expert)}>
                مشاهده پروفایل و رزومه
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  createDirectOffer({ recipientName: expert.name });
                  setInvited((current) =>
                    current.includes(expert.id) ? current : [...current, expert.id],
                  );
                  setToast(`دعوت برای ${expert.name} ثبت شد و در سمت حل‌کننده قابل مشاهده است.`);
                }}
              >
                {invited.includes(expert.id) ? "دعوت ارسال شد" : "دعوت به همکاری"}
              </button>
            </footer>
          </article>
        ))}
      </div>
      {profile && (
        <div
          className="org-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.currentTarget === event.target && setProfile(null)}
        >
          <section
            className="org-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`پروفایل ${profile.name}`}
          >
            <header>
              <PersonAvatar name={profile.name} />
              <div>
                <h2>{profile.name}</h2>
                <p>{profile.specialty}</p>
              </div>
              <button type="button" aria-label="بستن" onClick={() => setProfile(null)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="org-profile-summary">
              <div>
                <span>تطابق</span>
                <strong>{profile.fit.toLocaleString("fa-IR")}٪</strong>
              </div>
              <div>
                <span>ظرفیت</span>
                <strong>{profile.capacity}</strong>
              </div>
              <div>
                <span>وضعیت</span>
                <strong>پروفایل تأییدشده</strong>
              </div>
            </div>
            <h3>خلاصه رزومه و شواهد</h3>
            <p>
              {profile.evidence}؛ تجربه مرتبط با پیاده‌سازی صنعتی، مستندسازی فنی و همکاری
              میان‌رشته‌ای ثبت شده است.
            </p>
            <footer>
              <button
                type="button"
                className="org-button org-button--secondary"
                disabled
                title="فایل رزومه برای این داده نمایشی ثبت نشده است"
              >
                <Icon name="download" /> رزومه PDF در دسترس نیست
              </button>
              <button
                type="button"
                className="org-button org-button--primary"
                onClick={() => {
                  createDirectOffer({ recipientName: profile.name });
                  setInvited((current) => [...new Set([...current, profile.id])]);
                  setToast(`دعوت برای ${profile.name} ثبت شد.`);
                  setProfile(null);
                }}
              >
                دعوت به همکاری
              </button>
            </footer>
          </section>
        </div>
      )}
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

/**
 * The organization's received proposals.
 *
 * In network mode this is the grant-scoped C4 inbox. The fixture list below
 * showed scores, budgets, and solver names the inbox resource does not carry
 * and the organization has no grant to see; it is the static export's only.
 */
function OrganizationProposals() {
  const runtime = useWebRuntime();
  if (runtime.mode === "network") return <ConnectedOrganizationProposals />;
  return <DemoOrganizationProposals />;
}

function DemoOrganizationProposals() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const filtered = organizationProposals.filter(
    (proposal) =>
      `${proposal.solver} ${proposal.challenge} ${proposal.id}`.includes(query.trim()) &&
      (status === "all" || proposal.status === status),
  );
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="مرکز پیشنهادها"
        title="پیشنهادهای دریافتی"
        description="نسخه، وضعیت و اقدام بعدی دقیقاً متناظر با راه‌حل ارسالی فرد یا تیم نمایش داده می‌شود؛ هیچ داده‌ای در سمت سازمان بازنویسی نمی‌شود."
        action={
          <Link
            className="org-button org-button--secondary"
            href="/app/org/challenges/CH-1405-021/proposals/compare"
          >
            <Icon name="decision" /> مقایسه پیشنهادها
          </Link>
        }
      />
      <section className="org-metrics org-metrics--three">
        <OrgMetric label="دریافت‌شده" value="۸" detail="برای ۳ مسئله فعال" icon="decision" />
        <OrgMetric
          label="نیازمند اقدام"
          value="۳"
          detail="غربال یا شفاف‌سازی"
          icon="history"
          tone="amber"
        />
        <OrgMetric label="آماده تصمیم" value="۲" detail="داوری کامل" icon="shield" tone="green" />
      </section>
      <section className="org-filter-card">
        <label>
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی حل‌کننده، مسئله یا شناسه"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="وضعیت پیشنهاد"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option>داوری مالی</option>
          <option>داوری کامل</option>
          <option>نیازمند شفاف‌سازی</option>
        </select>
        <span>{selected.length.toLocaleString("fa-IR")} انتخاب برای مقایسه</span>
      </section>
      <section className="org-proposal-list">
        {filtered.map((proposal) => (
          <article
            key={proposal.id}
            className={selected.includes(proposal.id) ? "is-selected" : ""}
          >
            <header>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(proposal.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(proposal.id)
                        ? current.filter((id) => id !== proposal.id)
                        : current.length < 3
                          ? [...current, proposal.id]
                          : current,
                    )
                  }
                />
                <span>
                  <Icon name="check" />
                </span>
              </label>
              <PersonAvatar name={proposal.solver} />
              <div>
                <small>
                  {proposal.id} · {proposal.version}
                </small>
                <h2>{proposal.solver}</h2>
                <p>{proposal.challenge}</p>
              </div>
              <span className="org-status is-info">{proposal.status}</span>
            </header>
            <dl>
              <div>
                <dt>امتیاز فنی</dt>
                <dd>{proposal.score.toLocaleString("fa-IR")} از ۱۰۰</dd>
              </div>
              <div>
                <dt>بودجه</dt>
                <dd>{proposal.budget}</dd>
              </div>
              <div>
                <dt>اقدام بعدی</dt>
                <dd>{proposal.due}</dd>
              </div>
            </dl>
            <footer>
              <Link href="/app/org/challenges/CH-1405-021/proposals">مشاهده راه‌حل کامل</Link>
              <button
                type="button"
                onClick={() => setToast(`درخواست شفاف‌سازی برای ${proposal.id} ثبت شد.`)}
              >
                درخواست شفاف‌سازی
              </button>
              <Link className="is-primary" href="/app/org/challenges/CH-1405-021/review">
                ارسال به داوری
              </Link>
            </footer>
          </article>
        ))}
      </section>
      {selected.length >= 2 && (
        <div className="org-selection-bar">
          <span>{selected.length.toLocaleString("fa-IR")} پیشنهاد انتخاب شده است.</span>
          <Link href="/app/org/challenges/CH-1405-021/proposals/compare">مقایسه انتخاب‌ها</Link>
        </div>
      )}
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

function OrganizationPilots() {
  const pilots = [
    ["PIL-021", "پایلوت بازچرخانی آب خط سوم", "تیم نوآب", "۶۷٪", "ریسک بالا", "بازبینی HSE"],
    [
      "PIL-018",
      "پایش خوردگی مبدل‌های حرارتی",
      "پایدار تجهیز",
      "۴۲٪",
      "در مسیر",
      "تحویل داده هفته دوم",
    ],
    ["PIL-012", "بازیافت حرارت کوره", "گروه انرژی پاک", "۹۰٪", "در مسیر", "پذیرش تحویل نهایی"],
  ];
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="اجرای همکاری"
        title="پایلوت‌های سازمان"
        description="پیشرفت، ریسک، تحویل و اقدام بعدی با وضعیت قابل مشاهده حل‌کننده همگام است."
      />
      <section className="org-metrics org-metrics--three">
        <OrgMetric label="پایلوت فعال" value="۳" detail="در ۲ واحد سازمان" icon="impact" />
        <OrgMetric
          label="ریسک باز"
          value="۲"
          detail="۱ مورد با شدت بالا"
          icon="history"
          tone="amber"
        />
        <OrgMetric
          label="تحویل این هفته"
          value="۴"
          detail="۲ مورد نیازمند پذیرش"
          icon="brief"
          tone="green"
        />
      </section>
      <section className="org-card">
        <div className="org-pilot-grid">
          {pilots.map(([id, title, solver, progress, status, next]) => (
            <article key={id}>
              <header>
                <span
                  className={`org-status ${status === "ریسک بالا" ? "is-danger" : "is-success"}`}
                >
                  {status}
                </span>
                <bdi>{id}</bdi>
              </header>
              <h2>{title}</h2>
              <p>{solver}</p>
              <div className="org-progress">
                <span>
                  <b style={{ width: progress }} />
                </span>
                <strong>{progress}</strong>
              </div>
              <dl>
                <div>
                  <dt>اقدام بعدی</dt>
                  <dd>{next}</dd>
                </div>
                <div>
                  <dt>به‌روزرسانی</dt>
                  <dd>امروز، ۱۰:۲۰</dd>
                </div>
              </dl>
              <Link href="/app/org/challenges/CH-1405-021/pilot">مشاهده و مدیریت پایلوت</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function OrganizationContracts() {
  const [toast, setToast] = useState("");
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="قرارداد و پرداخت"
        title="تعهدات، تحویل‌ها و تسویه"
        description="شرط فنی و مالی مستقل‌اند و وضعیت ثبت‌شده در سمت حل‌کننده نیز بدون اختلاف نمایش داده می‌شود."
      />
      <section className="org-metrics org-metrics--three">
        <OrgMetric
          label="ارزش قراردادهای فعال"
          value="۳٫۸ میلیارد"
          detail="۴ قرارداد جاری"
          icon="shield"
        />
        <OrgMetric
          label="در انتظار تأیید مالی"
          value="۲۴۰ م.ت"
          detail="یک مرحله اجرایی پذیرفته‌شده"
          icon="history"
          tone="amber"
        />
        <OrgMetric
          label="پرداخت‌شده"
          value="۱٫۲ میلیارد"
          detail="۴ رسید قطعی"
          icon="impact"
          tone="green"
        />
      </section>
      <section className="org-card">
        <header className="org-card__head">
          <div>
            <h2>قراردادها و پرداخت‌ها</h2>
            <p>نسخه قرارداد، پذیرش فنی، تأیید مالی و رسید</p>
          </div>
          <button className="org-button org-button--secondary">
            <Icon name="download" /> خروجی مالی
          </button>
        </header>
        <div className="org-contract-table">
          <header>
            <span>پرونده</span>
            <span>حل‌کننده</span>
            <span>قرارداد</span>
            <span>تحویل فنی</span>
            <span>مالی</span>
            <span>اقدام</span>
          </header>
          {[
            ["CH-1405-021", "تیم نوآب", "امضاشده · v4", "پذیرفته‌شده", "در انتظار تأیید"],
            ["CH-1405-009", "پایدار تجهیز", "فعال · v2", "در حال بررسی", "مرحله اول پرداخت شد"],
            ["CH-1405-006", "گروه انرژی پاک", "فعال · v3", "پذیرفته‌شده", "پرداخت‌شده"],
          ].map((row) => (
            <article key={row[0]}>
              {row.slice(0, 5).map((cell, index) =>
                index === 0 ? (
                  <strong key={cell}>{cell}</strong>
                ) : (
                  <span key={cell} className={index > 2 ? "org-status is-info" : ""}>
                    {cell}
                  </span>
                ),
              )}
              <button type="button" onClick={() => setToast(`پرونده مالی ${row[0]} باز شد.`)}>
                جزئیات
              </button>
            </article>
          ))}
        </div>
      </section>
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

function OrganizationReports() {
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="تحلیل و گزارش"
        title="گزارش‌های چرخه نوآوری"
        description="تعریف شاخص، بازه و داده مبنا مشخص است و از هر عدد می‌توانید به پرونده‌های سازنده آن برسید."
        action={
          <button className="org-button org-button--primary">
            <Icon name="download" /> دریافت گزارش PDF
          </button>
        }
      />
      <section className="org-metrics">
        <OrgMetric
          label="میانگین زمان صورت‌بندی"
          value="۱۲ روز"
          detail="۲ روز بهتر از ماه قبل"
          icon="history"
        />
        <OrgMetric
          label="نرخ تبدیل به پایلوت"
          value="۲۸٪"
          detail="۷ از ۲۵ پیشنهاد"
          icon="trend"
          tone="green"
        />
        <OrgMetric
          label="بودجه متعهدشده"
          value="۳٫۸ میلیارد"
          detail="۶۲٪ بودجه سالانه"
          icon="impact"
          tone="violet"
        />
        <OrgMetric
          label="اثر تأییدشده"
          value="۲٫۴×"
          detail="ROI سه پایلوت بسته"
          icon="decision"
          tone="amber"
        />
      </section>
      <div className="org-report-grid">
        <section className="org-card org-card--wide">
          <header className="org-card__head">
            <div>
              <h2>قیف چرخه همکاری</h2>
              <p>از مسئله ثبت‌شده تا اثر تأییدشده</p>
            </div>
          </header>
          <div className="org-funnel">
            {[
              ["مسئله ثبت‌شده", "۲۵", "100%"],
              ["منتشرشده", "۱۸", "82%"],
              ["پیشنهاد واجد شرایط", "۱۲", "65%"],
              ["پایلوت", "۷", "48%"],
              ["اثر تأییدشده", "۳", "28%"],
            ].map(([label, value, width]) => (
              <article key={label}>
                <span>{label}</span>
                <i>
                  <b style={{ width }} />
                </i>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
        </section>
        <section className="org-card">
          <header className="org-card__head">
            <div>
              <h2>گلوگاه فعلی</h2>
              <p>براساس SLA هفت روز اخیر</p>
            </div>
          </header>
          <div className="org-report-callout">
            <Icon name="history" />
            <strong>داوری مالی</strong>
            <p>میانگین ۲٫۸ روز؛ سه پرونده منتظر تخصیص یا تکمیل داور مالی‌اند.</p>
            <Link href="/app/org/proposals">مشاهده پرونده‌ها</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function OrganizationTeam({ access = false }: { access?: boolean }) {
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="تیم سازمان"
        title={access ? "دسترسی‌ها و امنیت اعضا" : "اعضا و مسئولیت‌ها"}
        description={
          access
            ? "نقش فضای سازمان، دامنه پرونده و وضعیت امنیتی را جداگانه کنترل کنید."
            : "اعضا، نقش پایه و مسئولیت پرونده‌ای را مانند ساختار تیم حل‌کننده مدیریت کنید."
        }
        action={
          <button
            className="org-button org-button--primary"
            onClick={() => setToast("دعوت عضو جدید آماده ارسال است.")}
          >
            <Icon name="plus" /> دعوت عضو
          </button>
        }
      />
      <section className="org-metrics org-metrics--three">
        <OrgMetric label="عضو فعال" value="۴" detail="۳ عضو با 2FA" icon="people" />
        <OrgMetric
          label="دسترسی در انتظار بازبینی"
          value="۱"
          detail="مهلت امروز"
          icon="history"
          tone="amber"
        />
        <OrgMetric
          label="نشست پرریسک"
          value="۰"
          detail="آخرین بررسی همین حالا"
          icon="shield"
          tone="green"
        />
      </section>
      <section className="org-card">
        <header className="org-card__head">
          <div>
            <h2>{access ? "ماتریس دسترسی" : "اعضای گروه مپنا"}</h2>
            <p>تغییر نقش بلافاصله ثبت و قابل حسابرسی است</p>
          </div>
          <Link href={access ? "/app/org/team" : "/app/org/access"}>
            {access ? "مشاهده اعضا" : "بازبینی دسترسی‌ها"}
          </Link>
        </header>
        <div className="org-member-table">
          <header>
            <span>عضو</span>
            <span>نقش</span>
            <span>دامنه مسئولیت</span>
            <span>وضعیت</span>
            <span>اقدام</span>
          </header>
          {organizationMembers.map(([name, defaultRole, scope, status], index) => (
            <article key={name}>
              <div>
                <PersonAvatar name={name} />
                <span>
                  <strong>{name}</strong>
                  <small>{index === 0 ? "مالک سازمان" : `ORG-M0${index + 1}`}</small>
                </span>
              </div>
              <select
                aria-label={`نقش ${name}`}
                disabled={index === 0}
                value={roles[name] ?? defaultRole}
                onChange={(event) => {
                  setRoles((current) => ({ ...current, [name]: event.target.value }));
                  setToast(`نقش ${name} به «${event.target.value}» تغییر کرد.`);
                }}
              >
                <option>مدیر نوآوری</option>
                <option>بازبین فنی</option>
                <option>حقوقی</option>
                <option>مالی</option>
                <option>مشاهده‌گر</option>
              </select>
              <span>{scope}</span>
              <span className={`org-status ${status === "فعال" ? "is-success" : "is-warning"}`}>
                {status}
              </span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setToast(`دسترسی ${name} برای بازبینی باز شد.`)}
              >
                جزئیات
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="org-security-note">
        <Icon name="shield" />
        <div>
          <strong>مالک سازمان همیشه اختیار بازگردانی نقش‌ها را دارد</strong>
          <p>
            هیچ مدیر یا عضو دیگری نمی‌تواند دسترسی مالک را کاهش دهد؛ همه تغییرها در تاریخچه ثبت
            می‌شوند.
          </p>
        </div>
      </section>
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

function OrganizationProfile() {
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="هویت سازمان"
        title="پروفایل سازمان"
        description="اطلاعاتی که فرد و تیم هنگام مشاهده چالش و دعوت می‌بینند از همین پروفایل تأمین می‌شود."
        action={
          <button
            className="org-button org-button--primary"
            onClick={() => setEditing((value) => !value)}
          >
            <Icon name={editing ? "check" : "user"} /> {editing ? "ثبت تغییرات" : "ویرایش پروفایل"}
          </button>
        }
      />
      <div className="org-profile-layout">
        <section className="org-card org-org-profile">
          <header>
            <div className="org-company-mark">آ</div>
            <div>
              <h2>گروه مپنا</h2>
              <p>صنایع فرایندی و تولید پایدار</p>
              <span className="org-status is-success">
                <Icon name="check" /> سازمان تأییدشده
              </span>
            </div>
          </header>
          <div className="org-profile-progress">
            <span>
              <b style={{ width: "92%" }} />
            </span>
            <strong>۹۲٪ تکمیل</strong>
          </div>
          <div className="org-profile-form">
            <label>
              <span>نام نمایشی سازمان</span>
              <input disabled={!editing} defaultValue="گروه مپنا" />
            </label>
            <label>
              <span>حوزه فعالیت</span>
              <input disabled={!editing} defaultValue="صنایع فرایندی و تولید پایدار" />
            </label>
            <label className="is-wide">
              <span>معرفی سازمان</span>
              <textarea
                disabled={!editing}
                rows={4}
                defaultValue="توسعه راهکارهای صنعتی پایدار با تمرکز بر بهینه‌سازی مصرف منابع، ایمنی و تحول دیجیتال فرایندها."
              />
            </label>
            <label>
              <span>وب‌سایت</span>
              <input disabled={!editing} dir="ltr" defaultValue="https://atiesaz.example" />
            </label>
            <label>
              <span>شهر</span>
              <input disabled={!editing} defaultValue="تهران" />
            </label>
          </div>
          {editing && (
            <button
              className="org-button org-button--primary"
              onClick={() => {
                setEditing(false);
                setToast("پروفایل سازمان ذخیره شد.");
              }}
            >
              ذخیره پروفایل
            </button>
          )}
        </section>
        <aside className="org-card">
          <header className="org-card__head">
            <div>
              <h2>نمای عمومی</h2>
              <p>قابل مشاهده برای حل‌کنندگان</p>
            </div>
          </header>
          <ul className="org-profile-checks">
            <li>
              <Icon name="check" /> نام و نشان سازمان
            </li>
            <li>
              <Icon name="check" /> حوزه فعالیت و شهر
            </li>
            <li>
              <Icon name="check" /> چالش‌های منتشرشده
            </li>
            <li>
              <Icon name="check" /> نشان سازمان تأییدشده
            </li>
            <li>
              <Icon name="lock" /> اطلاعات حقوقی و مالی محرمانه
            </li>
          </ul>
          <Link className="org-button org-button--secondary" href="/organizations">
            مشاهده نمای عمومی
          </Link>
        </aside>
      </div>
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

function OrganizationSettings() {
  const tabs = ["حساب سازمان", "اعلان‌ها", "امنیت و ورود", "حریم خصوصی", "ترجیحات"];
  const [active, setActive] = useState(tabs[0]);
  const [toast, setToast] = useState("");
  return (
    <div className="org-workspace-page org-settings-page" data-layout-ready="true">
      <OrgPageHeader
        eyebrow="فضای سازمان"
        title="تنظیمات سازمان"
        description="حساب، اعلان‌ها، امنیت و سیاست داده را با ساختاری همسان تنظیمات فرد و تیم مدیریت کنید."
      />
      <div className="org-settings-layout">
        <aside className="org-settings-nav">
          <h2>بخش‌های تنظیمات</h2>
          {tabs.map((tab, index) => (
            <button
              key={tab}
              className={active === tab ? "is-active" : ""}
              onClick={() => setActive(tab)}
            >
              <Icon
                name={
                  index === 0
                    ? "people"
                    : index === 1
                      ? "notification"
                      : index === 2
                        ? "shield"
                        : index === 3
                          ? "lock"
                          : "filter"
                }
              />
              {tab}
            </button>
          ))}
        </aside>
        <section className="org-card org-settings-content">
          <header className="org-card__head">
            <div>
              <h2>{active}</h2>
              <p>
                {active === "حساب سازمان"
                  ? "اطلاعات پایه و نماینده مسئول"
                  : active === "اعلان‌ها"
                    ? "کانال، رویداد و تناوب اطلاع‌رسانی"
                    : active === "امنیت و ورود"
                      ? "2FA، نشست‌ها و بازیابی امن"
                      : active === "حریم خصوصی"
                        ? "سطح نمایش و نگهداشت داده"
                        : "زبان، منطقه زمانی و قالب اعداد"}
              </p>
            </div>
          </header>
          {active === "حساب سازمان" && (
            <div className="org-settings-fields">
              <label>
                <span>نام سازمان</span>
                <input defaultValue="گروه مپنا" />
              </label>
              <label>
                <span>نماینده مسئول</span>
                <input defaultValue="سارا نادری" />
              </label>
              <label>
                <span>ایمیل سازمانی</span>
                <input dir="ltr" defaultValue="innovation@atiesaz.example" />
              </label>
              <label>
                <span>شماره تماس</span>
                <input dir="ltr" defaultValue="021-88771234" />
              </label>
            </div>
          )}
          {active === "اعلان‌ها" && (
            <div className="org-toggle-list">
              {[
                "پیشنهاد جدید برای مسئله",
                "درخواست شفاف‌سازی حل‌کننده",
                "موعد داوری و تصمیم",
                "ریسک یا تأخیر پایلوت",
              ].map((label, index) => (
                <label key={label}>
                  <span>
                    <strong>{label}</strong>
                    <small>{index < 2 ? "فوری و ایمیلی" : "خلاصه روزانه"}</small>
                  </span>
                  <input type="checkbox" defaultChecked={index !== 3} />
                </label>
              ))}
            </div>
          )}
          {active === "امنیت و ورود" && (
            <div className="org-security-panels">
              <article>
                <Icon name="shield" />
                <div>
                  <strong>ورود دومرحله‌ای</strong>
                  <p>برای سه عضو فعال و برای نقش مالی الزامی است.</p>
                </div>
                <button>مدیریت 2FA</button>
              </article>
              <article>
                <Icon name="history" />
                <div>
                  <strong>نشست‌های فعال</strong>
                  <p>۴ نشست معتبر؛ آخرین ورود امروز ۰۸:۴۲.</p>
                </div>
                <button>مشاهده نشست‌ها</button>
              </article>
            </div>
          )}
          {active === "حریم خصوصی" && (
            <div className="org-settings-fields">
              <label>
                <span>نگهداشت پرونده بسته</span>
                <select defaultValue="5">
                  <option value="3">۳ سال</option>
                  <option value="5">۵ سال</option>
                  <option value="7">۷ سال</option>
                </select>
              </label>
              <label>
                <span>نمایش نام سازمان</span>
                <select>
                  <option>در چالش‌های عمومی نمایش داده شود</option>
                  <option>تا زمان دعوت ناشناس بماند</option>
                </select>
              </label>
            </div>
          )}
          {active === "ترجیحات" && (
            <div className="org-settings-fields">
              <label>
                <span>زبان</span>
                <select>
                  <option>فارسی</option>
                </select>
              </label>
              <label>
                <span>منطقه زمانی</span>
                <select>
                  <option>تهران (UTC+3:30)</option>
                </select>
              </label>
            </div>
          )}
          <footer>
            <button
              className="org-button org-button--secondary"
              onClick={() => setToast("تغییرات این بخش بازنشانی شد.")}
            >
              بازنشانی
            </button>
            <button
              className="org-button org-button--primary"
              onClick={() => setToast(`تنظیمات «${active}» ذخیره شد.`)}
            >
              ذخیره تغییرات
            </button>
          </footer>
        </section>
      </div>
      <OrgToast message={toast} onClose={() => setToast("")} />
    </div>
  );
}

/**
 * Organization notifications.
 *
 * In network mode these are the same C8 projection the solver side reads,
 * scoped to the organization workspace. The fixture list below is the static
 * export's only; it never renders under a live session.
 */
function OrganizationNotifications() {
  const runtime = useWebRuntime();
  if (runtime.mode === "network")
    return (
      <div className="org-workspace-page">
        <ConnectedNotifications persona="org" />
      </div>
    );
  return <DemoOrganizationNotifications />;
}

function DemoOrganizationNotifications() {
  const [read, setRead] = useState<string[]>([]);
  const items = [
    [
      "NT-410",
      "پیشنهاد جدید دریافت شد",
      "تیم نوآب نسخه ۳ پیشنهاد راه‌حل را برای مسئله بازیابی هوشمند آب ارسال کرد.",
      "همین حالا",
    ],
    [
      "NT-408",
      "داوری مالی نزدیک به مهلت است",
      "امتیاز مالی PR-104 باید تا امروز ساعت ۱۶:۳۰ ثبت شود.",
      "۲ ساعت پیش",
    ],
    ["NT-401", "دعوت مشاهده شد", "گروه زیست‌فرایند دعوت INV-298 را مشاهده کرده است.", "دیروز"],
    [
      "NT-397",
      "ریسک پایلوت به‌روزرسانی شد",
      "تیم پایدار تجهیز برنامه کاهش ریسک را ثبت کرد.",
      "۲ روز پیش",
    ],
  ];
  return (
    <div className="org-workspace-page">
      <OrgPageHeader
        eyebrow="مرکز اعلان‌ها"
        title="اعلان‌ها و اقدام‌های مرتبط"
        description="رویدادهای سازمانی با همان زمان و وضعیت قابل مشاهده طرف مقابل نمایش داده می‌شوند."
        action={
          <button
            className="org-button org-button--secondary"
            onClick={() => setRead(items.map(([id]) => id))}
          >
            خواندن همه
          </button>
        }
      />
      <section className="org-card">
        <div className="org-notification-list">
          {items.map(([id, title, body, time]) => (
            <article key={id} className={read.includes(id) ? "is-read" : ""}>
              <span>
                <Icon
                  name={id === "NT-410" ? "decision" : id === "NT-408" ? "history" : "notification"}
                />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
                <small>
                  {time} · {id}
                </small>
              </div>
              <button
                type="button"
                onClick={() => setRead((current) => [...new Set([...current, id])])}
              >
                {read.includes(id) ? "خوانده‌شده" : "علامت‌گذاری خوانده‌شده"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function OrganizationWorkspaceExperience({ route }: { route: InternalRoute }) {
  const content = useMemo(() => {
    switch (route.path) {
      case "/app/org/dashboard":
        return <OrganizationDashboard />;
      case "/app/org/experts":
        return <OrganizationExperts />;
      case "/app/org/invitations":
        return <OrganizationExperts invitations />;
      case "/app/org/proposals":
        return <OrganizationProposals />;
      case "/app/org/proposals/record":
        return <ConnectedOrganizationProposalRecord />;
      case "/app/org/pilots":
        return <OrganizationPilots />;
      case "/app/org/contracts-payments":
        return <OrganizationContracts />;
      case "/app/org/reports":
        return <OrganizationReports />;
      case "/app/org/team":
        return <OrganizationTeam />;
      case "/app/org/access":
        return isNetworkWebRuntime ? (
          <ConnectedOrganizationWorkspaceFacts section="access" />
        ) : (
          <OrganizationTeam access />
        );
      case "/app/org/profile":
        return isNetworkWebRuntime ? (
          <ConnectedOrganizationWorkspaceFacts section="profile" />
        ) : (
          <OrganizationProfile />
        );
      case "/app/org/settings":
        return isNetworkWebRuntime ? (
          <ConnectedOrganizationWorkspaceFacts section="settings" />
        ) : (
          <OrganizationSettings />
        );
      case "/app/org/notifications":
        return <OrganizationNotifications />;
      default:
        return null;
    }
  }, [route.path]);
  if (!content) return null;
  const classification = classifyRoute(route.path).classification;
  if (isNetworkWebRuntime && classification === "unavailable")
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>این بخش در فاز فعلی فعال نیست</h1>
        <p>برای جلوگیری از نمایش داده نمایشی کنار نشست واقعی، این صفحه غیرفعال است.</p>
        <Link href="/app/org/dashboard">بازگشت به داشبورد</Link>
      </section>
    );
  return (
    <>
      {isNetworkWebRuntime && classification === "preview" && <PreviewDataNotice />}
      {content}
    </>
  );
}
