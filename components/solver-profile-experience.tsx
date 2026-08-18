"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import {
  SolverDirectOfferResponse,
  SolverDirectOffersList,
} from "@/components/solver-direct-offer-experience";
import { SolverProposalsList } from "@/components/solver-proposals-list";
import {
  SolverInvitationsExperience,
  SolverTeamsOverview,
} from "@/components/solver-teams-experience";
import {
  SolverProfileEditor,
  SolverSettingsEditor,
} from "@/components/solver-profile-settings";
import {
  SolverWorkspaceShell,
  type SolverSection,
  type SolverSpace,
  useSolverContext,
  useSolverSpace,
} from "@/components/solver-shell";
import { challenges } from "@/data/mock";
import { getChallengePublisher } from "@/data/challenge-publishers";
import {
  isOpportunitySaved,
  SAVED_OPPORTUNITIES_EVENT,
  setOpportunitySaved,
} from "@/lib/solver/saved-opportunities";
import type { SolverState, TeamType } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules } from "@/lib/solver/eligibility";
import {
  readTeamCreationDraft,
  removeSolverUiValue,
  writeTeamCreationDraft,
} from "@/lib/solver/ui-preferences";
import {
  activeWorkspaces,
  createTeam as createSolverTeam,
  readSolverState,
  sendTeamInvitation,
  subscribeSolverState,
  teamPermission,
} from "@/lib/solver/repository";

function useCanonicalSolverState() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

function readSolverListParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash.split("?")[1] ?? ""
      : window.location.search.slice(1);
  return new URLSearchParams(source);
}

export type SolverProfileSection =
  | Extract<
      SolverSection,
      "received" | "team-building" | "proposals" | "saved" | "invitations" | "profile" | "settings"
    >
  | "teams"
  | "offer-response";


function useCurrentSpace() {
  return useSolverSpace();
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const context = useSolverContext();
  return (
    <header className="rh-profile-heading">
      <div>
        <nav aria-label="مسیر صفحه">
          <Link href={buildSolverHref("/app/solver/dashboard", context)}>
            <Icon name="grid" /> فضای کاری
          </Link>
          <span>/</span>
          <span>{title}</span>
        </nav>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 6500);
    return () => window.clearTimeout(timeout);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <div className="rh-profile-toast" role="status">
      <Icon name="check" />
      <span>{message}</span>
      <button type="button" onClick={() => setVisible(false)} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  );
}


function SavedPage({ space }: { space: SolverSpace }) {
  const context = useSolverContext();
  const [saved, setSaved] = useState<string[]>([]);
  const initialParams = readSolverListParams();
  const [query, setQuery] = useState(initialParams.get("q") ?? "");
  const [industry, setIndustry] = useState(initialParams.get("industry") ?? "همه");
  const [sort, setSort] = useState<"deadline" | "newest">(
    initialParams.get("sort") === "newest" ? "newest" : "deadline",
  );
  const [toast, setToast] = useState("");
  useEffect(() => {
    const sync = () =>
      setSaved(
        challenges
          .filter((challenge) => isOpportunitySaved(challenge.id, false, context.workspaceId))
          .map((challenge) => challenge.id),
      );
    sync();
    window.addEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
    return () => window.removeEventListener(SAVED_OPPORTUNITIES_EVENT, sync);
  }, [context.workspaceId]);
  useEffect(() => {
    const syncFromLocation = () => {
      const params = readSolverListParams();
      setQuery(params.get("q") ?? "");
      setIndustry(params.get("industry") ?? "همه");
      setSort(params.get("sort") === "newest" ? "newest" : "deadline");
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = buildSolverHref("/app/solver/saved", context, {
      q: query || undefined,
      industry: industry === "همه" ? undefined : industry,
      sort: sort === "deadline" ? undefined : sort,
    });
    if (document.documentElement.dataset.challengeStandalone === "true")
      window.history.replaceState({}, "", `#${next}`);
    else window.history.replaceState({}, "", next);
  }, [context, industry, query, sort]);
  const visible = [...challenges]
    .filter(
      (challenge) =>
        saved.includes(challenge.id) &&
        (industry === "همه" || challenge.industry === industry) &&
        `${challenge.title} ${getChallengePublisher(challenge.id).name}`.includes(query.trim()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.id.localeCompare(a.id)
        : new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    );
  return (
    <>
      <PageHeading
        title="فرصت‌های ذخیره‌شده"
        description={`چالش‌هایی که برای بررسی و اقدام بعدی در فضای ${space === "team" ? "تیمی" : "شخصی"} ذخیره کرده‌اید.`}
      />
      <div className="rh-saved-count">
        <Icon name="history" />
        <strong>{saved.length.toLocaleString("fa-IR")}</strong> فرصت ذخیره‌شده
      </div>
      <section className="rh-card rh-saved-filter">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجو</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو در فرصت‌های ذخیره‌شده"
          />
        </label>
        <select
          aria-label="دسته‌بندی"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        >
          <option>همه</option>
          <option>انرژی و آب</option>
          <option>ساخت‌وتولید</option>
          <option>صنایع غذایی</option>
        </select>
        <button
          type="button"
          className="rh-profile-outline"
          onClick={() => {
            setQuery("");
            setIndustry("همه");
            setSort("deadline");
          }}
        >
          <Icon name="filter" /> پاک‌کردن فیلترها
        </button>
      </section>
      <div className="rh-saved-toolbar">
        <span>{visible.length.toLocaleString("fa-IR")} نتیجه</span>
        <label>
          مرتب‌سازی{" "}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="deadline">نزدیک‌ترین مهلت</option>
            <option value="newest">جدیدترین شناسه</option>
          </select>
        </label>
      </div>
      <section className="rh-saved-grid">
        {visible.map((challenge) => {
          const rule = challengeEligibilityRules[challenge.id];
          const days = Math.max(
            0,
            Math.ceil((new Date(challenge.deadline).getTime() - Date.now()) / 86_400_000),
          );
          return (
          <article className="rh-card" key={challenge.id}>
            <button
              className="rh-save-toggle is-saved"
              onClick={() => {
                setOpportunitySaved(challenge.id, false, context.workspaceId);
                setSaved((items) => items.filter((id) => id !== challenge.id));
                setToast("فرصت از ذخیره‌شده‌ها حذف شد.");
              }}
              aria-label={`حذف ${challenge.title} از ذخیره‌شده‌ها`}
            >
              <Icon name="history" />
            </button>
            <div className="rh-saved-org">
              <ChallengeOrganizationLogo challengeId={challenge.id} size="small" />
              <div>
                <strong>{getChallengePublisher(challenge.id).name}</strong>
                <small>{challenge.industry}</small>
              </div>
            </div>
            <span className="rh-saved-category">{challenge.tags[0]}</span>
            <h2>{challenge.title}</h2>
            <div className="rh-tag-row">
              {challenge.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <dl>
              <div>
                <dt>متقاضی مجاز</dt>
                <dd>{rule ? rule.allowedApplicantTypes.map((item) => item === "individual" ? "فرد" : item === "expert-team" ? "تیم تخصصی" : item === "lab" ? "آزمایشگاه" : item === "academic-group" ? "گروه دانشگاهی" : "شرکت").join("، ") : "نیازمند بررسی"}</dd>
              </div>
              <div>
                <dt>بودجه</dt>
                <dd>
                  {Math.round(challenge.budget / 1_000_000).toLocaleString("fa-IR")} میلیون تومان
                </dd>
              </div>
              <div>
                <dt>مهلت</dt>
                <dd className={days <= 7 ? "is-warning" : ""}>{days.toLocaleString("fa-IR")} روز تا پایان</dd>
              </div>
            </dl>
            <Link href={buildSolverHref(`/app/solver/opportunities/${challenge.slug}`, context)}>
              مشاهده فرصت
            </Link>
          </article>
          );
        })}
      </section>
      {!visible.length && (
        <section className="rh-card rh-profile-empty">
          <Icon name="history" />
          <h2>فرصت ذخیره‌شده‌ای با این فیلتر وجود ندارد</h2>
          <p>می‌توانید فیلترها را پاک کنید یا فرصت‌های تازه را ببینید.</p>
          <Link href={buildSolverHref("/app/solver/opportunities", context)}>مشاهده فرصت‌ها</Link>
        </section>
      )}
      <Toast message={toast} />
    </>
  );
}


const teamCandidateSeed = [
  {
    id: "SP-201",
    name: "مریم شریفی",
    title: "طراحی محصول و نمونه‌سازی",
    expertise: "طراحی و ساخت",
    evidenceRank: 92,
    city: "تهران",
    university: "دانشگاه تهران",
    collaborations: ["حضوری", "پروژه‌ای"],
    skills: ["پایلوت صنعتی", "نمونه‌سازی"],
    availability: "۱۸ ساعت در هفته",
    projects: "۴ پروژه صنعتی تأییدشده",
  },
  {
    id: "SP-202",
    name: "رضا اکبری",
    title: "برق، کنترل و ابزار دقیق",
    expertise: "برق و کنترل",
    evidenceRank: 88,
    city: "اصفهان",
    university: "دانشگاه صنعتی اصفهان",
    collaborations: ["حضوری", "پروژه‌ای"],
    skills: ["تحلیل مسئله", "کنترل صنعتی"],
    availability: "۱۲ ساعت در هفته",
    projects: "۳ پروژه صنعتی تأییدشده",
  },
  {
    id: "SP-203",
    name: "نگار محمدی",
    title: "تحلیل داده و یادگیری ماشین",
    expertise: "داده و هوش مصنوعی",
    evidenceRank: 84,
    city: "دورکار",
    university: "دانشگاه صنعتی امیرکبیر",
    collaborations: ["دورکار", "پروژه‌ای"],
    skills: ["همکاری تیمی", "یادگیری ماشین"],
    availability: "۲۰ ساعت در هفته",
    projects: "۵ پروژه داده‌محور تأییدشده",
  },
  {
    id: "SP-204",
    name: "پویان رستگار",
    title: "مدیریت پایلوت صنعتی",
    expertise: "مدیریت و عملیات",
    evidenceRank: 79,
    city: "کرج",
    university: "دانشگاه علم و صنعت ایران",
    collaborations: ["حضوری", "تمام‌وقت"],
    skills: ["تحویل فنی", "مدیریت پروژه"],
    availability: "تمام‌وقت پروژه",
    projects: "۶ پایلوت صنعتی تأییدشده",
  },
];

type TeamCandidate = (typeof teamCandidateSeed)[number];

type TeamCreationDraft = {
  name: string;
  focus: string;
  type: string;
  maturity: string;
  objective: string;
  targetChallenge: string;
  requiredRole: string;
  skills: string;
  collaboration: string;
  location: string;
  publicContact: string;
  initialInviteEmail: string;
  proposalManagersCanSubmit: boolean;
  approvalBeforeSubmit: boolean;
};

const emptyTeamCreationDraft: TeamCreationDraft = {
  name: "",
  focus: "",
  type: "",
  maturity: "",
  objective: "",
  targetChallenge: "",
  requiredRole: "",
  skills: "",
  collaboration: "",
  location: "",
  publicContact: "",
  initialInviteEmail: "",
  proposalManagersCanSubmit: true,
  approvalBeforeSubmit: false,
};

function IndividualTeamCreationPage() {
  const context = useSolverContext();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState(emptyTeamCreationDraft);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [createdTeamId, setCreatedTeamId] = useState("");
  const [receiptId, setReceiptId] = useState("");

  useEffect(() => {
    setDraft((current) => ({ ...current, ...readTeamCreationDraft<Partial<TeamCreationDraft>>({}) }));
  }, []);

  const update = <K extends keyof TeamCreationDraft>(field: K, value: TeamCreationDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      writeTeamCreationDraft(next);
      return next;
    });
    setError("");
  };

  const continueSetup = () => {
    if (draft.name.trim().length < 3) {
      setError("نام تیم باید حداقل ۳ کاراکتر باشد.");
      return;
    }
    if (!draft.focus) {
      setError("حوزه اصلی فعالیت تیم را انتخاب کنید.");
      return;
    }
    if (!draft.type) {
      setError("نوع تیمی را که می‌خواهید بسازید انتخاب کنید.");
      return;
    }
    if (!draft.maturity) {
      setError("مرحله فعلی شکل‌گیری تیم را انتخاب کنید.");
      return;
    }
    if (draft.objective.trim().length < 20) {
      setError("هدف تیم را روشن و حداقل در ۲۰ کاراکتر توضیح دهید.");
      return;
    }
    setStep(2);
  };

  const createTeam = () => {
    if (!draft.requiredRole) {
      setError("اولین نقش موردنیاز تیم را انتخاب کنید.");
      return;
    }
    if (draft.skills.trim().length < 5) {
      setError("حداقل یک مهارت کلیدی موردنیاز را وارد کنید.");
      return;
    }
    if (!draft.collaboration) {
      setError("شیوه همکاری موردنظر تیم را انتخاب کنید.");
      return;
    }
    if (draft.location.trim().length < 2) {
      setError("شهر یا عبارت «دورکار» را برای محل همکاری وارد کنید.");
      return;
    }
    if (draft.publicContact && !/^\S+@\S+\.\S+$/.test(draft.publicContact)) {
      setError("ایمیل عمومی تیم معتبر نیست.");
      return;
    }
    if (draft.initialInviteEmail && !/^\S+@\S+\.\S+$/.test(draft.initialInviteEmail)) {
      setError("ایمیل دعوت اولیه معتبر نیست.");
      return;
    }
    const teamType: TeamType =
      draft.type === "تیم دانشگاهی"
        ? "academic-group"
        : draft.type === "آزمایشگاه"
          ? "lab"
        : draft.type === "شرکت رسمی"
          ? "company"
          : "expert-team";
    const result = createSolverTeam({
      name: draft.name,
      teamType,
      introduction: draft.objective,
      expertise: draft.skills.split(/[،,]/).map((item) => item.trim()).filter(Boolean),
      publicContact: draft.publicContact || "team-contact@example.test",
      initialInviteEmail: draft.initialInviteEmail || undefined,
      policy: {
        proposalManagersCanSubmit: draft.proposalManagersCanSubmit,
        approvalBeforeSubmit: draft.approvalBeforeSubmit,
      },
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCreatedTeamId(result.entityId);
    setReceiptId(result.receiptId);
    removeSolverUiValue("team-creation-draft");
    setCreated(true);
    setError("");
  };

  if (created) {
    return (
      <>
        <PageHeading
          title="فضای تیم آماده شد"
          description="مشخصات اولیه ثبت شد؛ اکنون می‌توانید اعضا را متناسب با نقش‌های موردنیاز دعوت کنید."
        />
        <section className="rh-card rh-team-created" role="status">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <small>تیم جدید</small>
            <h2>{draft.name}</h2>
            <p>شناسه تیم: <bdi dir="ltr">{createdTeamId}</bdi> · رسید: <bdi dir="ltr">{receiptId}</bdi></p>
            <p>{draft.objective}</p>
            <dl>
              <div>
                <dt>حوزه فعالیت</dt>
                <dd>{draft.focus}</dd>
              </div>
              <div>
                <dt>مرحله تیم</dt>
                <dd>{draft.maturity}</dd>
              </div>
              <div>
                <dt>اولین نقش موردنیاز</dt>
                <dd>{draft.requiredRole}</dd>
              </div>
            </dl>
          </div>
          <footer>
            <Link
              className="rh-profile-primary"
              href={(() => {
                const createdContext = activeWorkspaces(readSolverState()).find(
                  (workspace) => workspace.type === "team" && workspace.teamId === createdTeamId,
                );
                return createdContext
                  ? buildSolverHref("/app/solver/team-building", createdContext)
                  : buildSolverHref("/app/solver/dashboard", context);
              })()}
            >
              ورود به فضای تیم و جذب عضو
            </Link>
            <Link className="rh-profile-outline" href={buildSolverHref("/app/solver/teams", { type: "individual", workspaceId: readSolverState().personalWorkspace.id })}>
              مشاهده تیم‌های من
            </Link>
          </footer>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="ساخت تیم جدید"
        description="ابتدا مأموریت و نیازهای تیم را تعریف کنید؛ سپس فضای مستقل تیم ساخته می‌شود و می‌توانید اعضا را دعوت کنید."
        action={
          <Link className="rh-profile-outline" href={buildSolverHref("/app/solver/teams", context)}>
            تیم‌های من
          </Link>
        }
      />
      <aside className="rh-team-origin-note">
        <Icon name="people" />
        <div>
          <strong>شما هنوز در فضای شخصی هستید</strong>
          <p>
            ساخت تیم، حساب شخصی شما را تغییر نمی‌دهد؛ یک فضای تیمی جدا با نقش مالک برای شما ایجاد
            می‌کند.
          </p>
        </div>
      </aside>
      <ol className="rh-team-setup-steps" aria-label={`مرحله ${step.toLocaleString("fa-IR")} از ۳`}>
        <li className={step >= 1 ? "is-active" : ""}>
          <b>۱</b>
          <span>
            تعریف تیم<small>هویت، هدف و مرحله تیم</small>
          </span>
        </li>
        <li className={step === 2 ? "is-active" : ""}>
          <b>۲</b>
          <span>
            نیاز اعضا<small>نقش، مهارت و شیوه همکاری</small>
          </span>
        </li>
        <li className={step === 3 ? "is-active" : ""}>
          <b>۳</b>
          <span>
            سیاست و پیش‌نمایش<small>اختیار ارسال و دعوت اولیه</small>
          </span>
        </li>
      </ol>
      <div className="rh-team-setup-layout">
        <section className="rh-card rh-team-setup-form">
          {step === 1 ? (
            <>
              <header>
                <span>
                  <Icon name="brief" />
                </span>
                <div>
                  <h2>تیم قرار است چه مسئله‌ای را حل کند؟</h2>
                  <p>این اطلاعات مبنای پیشنهاد متخصصان و نمایش فرصت‌های مناسب خواهد بود.</p>
                </div>
              </header>
              <div className="rh-team-form-grid">
                <label className="is-wide">
                  <span>نام تیم</span>
                  <input
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="مثلاً تیم پایش هوشمند انرژی"
                  />
                </label>
                <label>
                  <span>حوزه اصلی فعالیت</span>
                  <select
                    value={draft.focus}
                    onChange={(event) => update("focus", event.target.value)}
                  >
                    <option value="">انتخاب حوزه فعالیت</option>
                    <option>مهندسی و ساخت</option>
                    <option>نرم‌افزار و داده</option>
                    <option>انرژی و محیط‌زیست</option>
                    <option>زیست‌فناوری و سلامت</option>
                    <option>طراحی محصول</option>
                  </select>
                </label>
                <label>
                  <span>نوع تیم</span>
                  <select
                    value={draft.type}
                    onChange={(event) => update("type", event.target.value)}
                  >
                    <option value="">انتخاب نوع تیم</option>
                    <option>تیم مستقل</option>
                    <option>تیم دانشگاهی</option>
                    <option>آزمایشگاه</option>
                    <option>هسته استارتاپی</option>
                    <option>شرکت رسمی</option>
                  </select>
                </label>
                <label className="is-wide">
                  <span>مرحله فعلی تیم</span>
                  <select
                    value={draft.maturity}
                    onChange={(event) => update("maturity", event.target.value)}
                  >
                    <option value="">انتخاب مرحله تیم</option>
                    <option>در حال شکل‌گیری</option>
                    <option>اعضای اصلی مشخص شده‌اند</option>
                    <option>دارای نمونه اولیه یا پروژه آزمایشی</option>
                    <option>دارای سابقه اجرای پروژه صنعتی</option>
                  </select>
                  <small>این شاخص به‌جای سابقه فردی، آمادگی فعلی تیم را مشخص می‌کند.</small>
                </label>
                <label className="is-wide">
                  <span>هدف و دامنه فعالیت تیم</span>
                  <textarea
                    rows={4}
                    value={draft.objective}
                    onChange={(event) => update("objective", event.target.value)}
                    placeholder="مسئله هدف، خروجی مورد انتظار و توانمندی فعلی تیم را توضیح دهید."
                  />
                  <small>
                    {draft.objective.trim().length.toLocaleString("fa-IR")} از حداقل ۲۰ کاراکتر
                  </small>
                </label>
                <label className="is-wide">
                  <span>چالش هدف (اختیاری)</span>
                  <select
                    value={draft.targetChallenge}
                    onChange={(event) => update("targetChallenge", event.target.value)}
                  >
                    <option value="">تیم برای چند فرصت ساخته می‌شود</option>
                    {challenges.slice(0, 4).map((challenge) => (
                      <option key={challenge.id} value={challenge.id}>
                        {challenge.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <header>
                <span>
                  <Icon name="people" />
                </span>
                <div>
                  <h2>برای شروع چه عضوی کم دارید؟</h2>
                  <p>دعوت‌ها با همین دامنه نقش و شیوه همکاری ارسال می‌شوند.</p>
                </div>
              </header>
              <div className="rh-team-form-grid">
                <label>
                  <span>اولین نقش موردنیاز</span>
                  <select
                    value={draft.requiredRole}
                    onChange={(event) => update("requiredRole", event.target.value)}
                  >
                    <option value="">انتخاب نقش</option>
                    <option>متخصص فنی</option>
                    <option>تحلیلگر داده</option>
                    <option>طراح محصول</option>
                    <option>مدیر پروژه و پایلوت</option>
                    <option>پژوهشگر</option>
                  </select>
                </label>
                <label>
                  <span>ایمیل عمومی تیم (اختیاری)</span>
                  <input dir="ltr" value={draft.publicContact} onChange={(event) => update("publicContact", event.target.value)} placeholder="team@example.com" />
                </label>
                <label>
                  <span>دعوت اولیه (اختیاری)</span>
                  <input dir="ltr" value={draft.initialInviteEmail} onChange={(event) => update("initialInviteEmail", event.target.value)} placeholder="member@example.com" />
                </label>
                <label>
                  <span>شیوه همکاری</span>
                  <select
                    value={draft.collaboration}
                    onChange={(event) => update("collaboration", event.target.value)}
                  >
                    <option value="">انتخاب شیوه همکاری</option>
                    <option>پروژه‌ای و پاره‌وقت</option>
                    <option>تمام‌وقت</option>
                    <option>همکاری پژوهشی</option>
                    <option>مشاوره تخصصی</option>
                  </select>
                </label>
                <label className="is-wide">
                  <span>مهارت‌های کلیدی موردنیاز</span>
                  <input
                    value={draft.skills}
                    onChange={(event) => update("skills", event.target.value)}
                    placeholder="مثلاً بینایی ماشین، پایتون و تحلیل داده صنعتی"
                  />
                </label>
                <label>
                  <span>محل همکاری</span>
                  <input
                    value={draft.location}
                    onChange={(event) => update("location", event.target.value)}
                    placeholder="مثلاً تهران یا دورکار"
                  />
                </label>
                <div className="rh-team-plan-summary">
                  <strong>خلاصه درخواست جذب</strong>
                  <p>
                    {draft.name || "تیم جدید"} برای حوزه {draft.focus || "انتخاب‌نشده"} به نقش{" "}
                    {draft.requiredRole || "انتخاب‌نشده"} نیاز دارد.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <header>
                <span><Icon name="shield" /></span>
                <div><h2>سیاست ارسال و پیش‌نمایش</h2><p>پیش از ساخت، اختیار نقش‌ها و مشخصات فضای تازه را مرور کنید.</p></div>
              </header>
              <div className="rh-team-form-grid">
                <label className="rh-offer-response-consent is-wide"><input type="checkbox" checked={draft.proposalManagersCanSubmit} onChange={(event) => update("proposalManagersCanSubmit", event.target.checked)} /><span>مدیر پیشنهاد اجازه ارسال نهایی داشته باشد.</span></label>
                <label className="rh-offer-response-consent is-wide"><input type="checkbox" checked={draft.approvalBeforeSubmit} onChange={(event) => update("approvalBeforeSubmit", event.target.checked)} /><span>پیش از ارسال نهایی تأیید داخلی لازم باشد.</span></label>
                <section className="rh-team-plan-summary is-wide" aria-label="پیش‌نمایش تیم">
                  <strong>{draft.name}</strong>
                  <p>{draft.objective}</p>
                  <p>{draft.type} · {draft.focus} · {draft.collaboration}</p>
                  <p>نقش موردنیاز: {draft.requiredRole} · {draft.skills}</p>
                  {draft.initialInviteEmail && <p>دعوت اولیه: <bdi dir="ltr">{draft.initialInviteEmail}</bdi></p>}
                </section>
              </div>
            </>
          )}
          {error && (
            <p className="rh-form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            {step > 1 && (
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setStep((current) => (current === 3 ? 2 : 1));
                  setError("");
                }}
              >
                مرحله قبل
              </button>
            )}
            <button
              type="button"
              className="is-primary"
              onClick={step === 1 ? continueSetup : step === 2 ? () => {
                if (!draft.requiredRole || draft.skills.trim().length < 5 || !draft.collaboration || draft.location.trim().length < 2) {
                  createTeam();
                  return;
                }
                setError("");
                setStep(3);
              } : createTeam}
            >
              {step === 1 ? "ادامه و تعریف نیاز اعضا" : step === 2 ? "پیش‌نمایش و سیاست‌ها" : "تأیید و ساخت فضای تیم"}
            </button>
          </footer>
        </section>
        <aside className="rh-card rh-team-setup-guide">
          <h2>بعد از ساخت تیم</h2>
          <ol>
            <li>
              <b>۱</b>
              <span>فضای مستقل تیم ساخته می‌شود.</span>
            </li>
            <li>
              <b>۲</b>
              <span>شما با نقش مالک تیم وارد می‌شوید.</span>
            </li>
            <li>
              <b>۳</b>
              <span>متخصصان متناسب با نقش‌های خالی پیشنهاد می‌شوند.</span>
            </li>
            <li>
              <b>۴</b>
              <span>ارسال راه‌حل فقط با فضای انتخاب‌شده انجام می‌شود.</span>
            </li>
          </ol>
          <Link href="/guides/intellectual-property">قواعد نقش‌ها و مالکیت تیم</Link>
        </aside>
      </div>
    </>
  );
}

function TeamBuildingPage({ space }: { space: SolverSpace }) {
  return space === "individual" ? <IndividualTeamCreationPage /> : <TeamMemberDiscoveryPage />;
}

function TeamMemberDiscoveryPage() {
  const context = useSolverContext();
  const state = useCanonicalSolverState();
  const activeTeam = context.type === "team" ? state.teams.find((team) => team.id === context.teamId) : undefined;
  const invitePermission = teamPermission(context, "invite-member", {}, state);
  const [query, setQuery] = useState("");
  const [expertise, setExpertise] = useState("all");
  const [university, setUniversity] = useState("all");
  const [collaboration, setCollaboration] = useState("all");
  const [sort, setSort] = useState("evidence");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [invited, setInvited] = useState<string[]>([]);
  const [selected, setSelected] = useState<TeamCandidate | null>(null);
  const [toast, setToast] = useState("");
  const visibleCandidates = useMemo(() => {
    const normalizedQuery = query.trim();
    return teamCandidateSeed
      .filter((item) => {
        const searchable = [
          item.name,
          item.title,
          item.expertise,
          item.city,
          item.university,
          ...item.skills,
        ].join(" ");
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (expertise === "all" || item.expertise === expertise) &&
          (university === "all" || item.university === university) &&
          (collaboration === "all" || item.collaborations.includes(collaboration))
        );
      })
      .sort((first, second) => {
        if (sort === "name") return first.name.localeCompare(second.name, "fa");
        if (sort === "availability") {
          return second.availability.localeCompare(first.availability, "fa");
        }
        return second.evidenceRank - first.evidenceRank;
      });
  }, [collaboration, expertise, query, sort, university]);
  const filtersAreActive =
    Boolean(query.trim()) || expertise !== "all" || university !== "all" || collaboration !== "all";
  const resetFilters = () => {
    setQuery("");
    setExpertise("all");
    setUniversity("all");
    setCollaboration("all");
    setSort("evidence");
  };
  const invite = (candidate: TeamCandidate) => {
    if (context.type !== "team") return;
    const result = sendTeamInvitation(context, {
      recipientEmail: `${candidate.id.toLowerCase()}@example.test`,
      proposedRole: "contributor",
      scope: `همکاری تخصصی در ${candidate.expertise}`,
      message: `دعوت ${activeTeam?.name ?? "تیم"} بر اساس شواهد مهارت و ظرفیت اعلام‌شده`,
      commitment: candidate.availability,
      ipNotice: "شرایط مالکیت فکری پیش از پذیرش دعوت قابل مشاهده است.",
    });
    if (!result.ok) {
      setToast(result.message);
      return;
    }
    const name = candidate.name;
    setInvited((current) => [...new Set([...current, name])]);
    setToast(`دعوت ${name} از طرف «${activeTeam?.name}» با رسید ${result.receiptId} ثبت شد.`);
  };
  return (
    <>
      <PageHeading
        title="تکمیل اعضای تیم"
        description="بر اساس نقش‌های خالی تیم، متخصصان متناسب را پیدا و با دامنه همکاری روشن دعوت کنید."
        action={
          <Link className="rh-profile-outline" href={buildSolverHref("/app/solver/invitations", context)}>
            <Icon name="notification" />
            دعوت‌نامه‌های تیمی
          </Link>
        }
      />
      <section className="rh-card rh-team-building-toolbar">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی متخصص</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو بر اساس نام، مهارت یا شهر"
          />
        </label>
        <select
          aria-label="حوزه تخصص"
          value={expertise}
          onChange={(event) => setExpertise(event.target.value)}
        >
          <option value="all">همه تخصص‌ها</option>
          {[...new Set(teamCandidateSeed.map((item) => item.expertise))].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="دانشگاه"
          value={university}
          onChange={(event) => setUniversity(event.target.value)}
        >
          <option value="all">همه دانشگاه‌ها</option>
          {[...new Set(teamCandidateSeed.map((item) => item.university))].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="نوع همکاری"
          value={collaboration}
          onChange={(event) => setCollaboration(event.target.value)}
        >
          <option value="all">همه شیوه‌های همکاری</option>
          <option>حضوری</option>
          <option>دورکار</option>
          <option>پروژه‌ای</option>
          <option>تمام‌وقت</option>
        </select>
        <div className="rh-team-building-toolbar__actions">
          <label>
            <span className="sr-only">مرتب‌سازی متخصصان</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="evidence">مرتب‌سازی: شواهد مرتبط‌تر</option>
              <option value="name">مرتب‌سازی: نام</option>
              <option value="availability">مرتب‌سازی: ظرفیت همکاری</option>
            </select>
          </label>
          <button type="button" onClick={resetFilters} disabled={!filtersAreActive}>
            <Icon name="close" /> پاک‌کردن فیلترها
          </button>
        </div>
      </section>
      <header className="rh-team-building-results">
        <div>
          <h2>متخصصان پیشنهادی</h2>
          <p>
            {visibleCandidates.length.toLocaleString("fa-IR")} پروفایل با شواهد قابل بررسی برای نیازهای تیم
          </p>
        </div>
        <div role="group" aria-label="نوع نمایش نتایج">
          <button
            type="button"
            className={view === "grid" ? "is-active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Icon name="grid" /> <span className="sr-only">نمایش شبکه‌ای</span>
          </button>
          <button
            type="button"
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <Icon name="brief" /> <span className="sr-only">نمایش فهرستی</span>
          </button>
        </div>
      </header>
      <section
        className={`rh-team-building-grid rh-team-building-grid--${view}`}
        aria-label="متخصصان پیشنهادی"
      >
        {visibleCandidates.map((candidate) => (
          <article className="rh-card" key={candidate.id}>
            <div className="rh-team-candidate__identity">
              <PersonAvatar name={candidate.name} className="rh-avatar rh-avatar--large" />
              <div>
                <small className="rh-team-candidate__fit">شواهد مرتبط موجود است</small>
                <h2>{candidate.name}</h2>
                <p>{candidate.title}</p>
              </div>
            </div>
            <dl className="rh-team-candidate__facts">
              <div>
                <dt>شهر</dt>
                <dd>{candidate.city}</dd>
              </div>
              <div>
                <dt>دانشگاه</dt>
                <dd>{candidate.university}</dd>
              </div>
              <div>
                <dt>وضعیت پروفایل</dt>
                <dd><Icon name="check" /> رزومه قابل مشاهده</dd>
              </div>
            </dl>
            <div className="rh-tag-row">
              {candidate.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
              <span className="is-ready">آماده همکاری</span>
            </div>
            <footer>
              <button
                type="button"
                disabled={invited.includes(candidate.name) || !invitePermission.allowed}
                title={invitePermission.allowed ? undefined : invitePermission.reason}
                onClick={() => invite(candidate)}
              >
                {invited.includes(candidate.name) ? "دعوت ارسال شد" : "دعوت به همکاری"}
              </button>
              <button
                type="button"
                className="rh-team-profile-link"
                onClick={() => setSelected(candidate)}
              >
                مشاهده پروفایل
              </button>
            </footer>
          </article>
        ))}
      </section>
      {!visibleCandidates.length && (
        <section className="rh-card rh-profile-empty">
          <Icon name="search" />
          <h2>متخصصی با این فیلترها پیدا نشد</h2>
          <p>یکی از فیلترها را تغییر دهید یا همه فیلترها را پاک کنید.</p>
          <button type="button" onClick={resetFilters}>
            پاک‌کردن همه فیلترها
          </button>
        </section>
      )}
      {selected && (
        <div className="rh-profile-modal" role="presentation">
          <section
            className="rh-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-title"
          >
            <button
              className="rh-modal-close"
              type="button"
              onClick={() => setSelected(null)}
              aria-label="بستن"
            >
              <Icon name="close" />
            </button>
            <div className="rh-candidate-modal-head">
              <PersonAvatar name={selected.name} className="rh-avatar rh-avatar--large" />
              <div>
                <small>دلایل دعوت قابل بررسی</small>
                <h2 id="candidate-title">{selected.name}</h2>
                <p>
                  {selected.title} · {selected.city}
                </p>
              </div>
            </div>
            <dl className="rh-candidate-facts">
              <div>
                <dt>ظرفیت همکاری</dt>
                <dd>{selected.availability}</dd>
              </div>
              <div>
                <dt>سابقه مرتبط</dt>
                <dd>{selected.projects}</dd>
              </div>
              <div>
                <dt>شیوه همکاری</dt>
                <dd>{selected.collaborations.join(" و ")}</dd>
              </div>
            </dl>
            <p>
              پیش از پذیرش دعوت، نقش پیشنهادی، دامنه دسترسی و چالش هدف برای این متخصص نمایش داده
              می‌شود.
            </p>
            <footer>
              <button type="button" onClick={() => setSelected(null)}>
                بستن
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={invited.includes(selected.name) || !invitePermission.allowed}
                onClick={() => {
                  invite(selected);
                  setSelected(null);
                }}
              >
                {invited.includes(selected.name) ? "دعوت قبلاً ارسال شده" : "دعوت به همکاری"}
              </button>
            </footer>
          </section>
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}


export function SolverProfileExperience({
  section,
  embedded = false,
  space: suppliedSpace,
  offerId,
  path,
}: {
  section: SolverProfileSection;
  embedded?: boolean;
  space?: SolverSpace;
  offerId?: string;
  path?: string;
}) {
  const currentSpace = useCurrentSpace();
  const space = suppliedSpace ?? currentSpace;
  const content = (
    <>
      {section === "received" && <SolverDirectOffersList />}
      {section === "offer-response" && (
        <SolverDirectOfferResponse offerId={offerId} />
      )}
      {section === "team-building" && <TeamBuildingPage space={space} />}
      {section === "proposals" && <SolverProposalsList />}
      {section === "saved" && <SavedPage space={space} />}
      {section === "invitations" && <SolverInvitationsExperience />}
      {section === "teams" && <SolverTeamsOverview />}
      {section === "profile" && <SolverProfileEditor preview={path === "/app/solver/profile/preview"} />}
      {section === "settings" && <SolverSettingsEditor />}
    </>
  );
  if (embedded) return content;
  return (
    <SolverWorkspaceShell
      active={
        section === "teams" ? "invitations" : section === "offer-response" ? "received" : section
      }
      space={space}
    >
      {content}
    </SolverWorkspaceShell>
  );
}
