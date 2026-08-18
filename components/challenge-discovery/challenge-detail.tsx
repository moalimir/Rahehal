"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { ScenarioBadge } from "@/components/challenge-discovery/challenge-card";
import {
  buildChallengeItems,
  budgetLabel,
  daysRemaining,
} from "@/components/challenge-discovery/catalog";
import { challenges } from "@/data/mock";
import type { ActiveWorkspace } from "@/domain/solver";
import { listCatalogChallenges } from "@/lib/challenges/public-catalog";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules, evaluateEligibility } from "@/lib/solver/eligibility";
import { isOpportunitySaved, setOpportunitySaved } from "@/lib/solver/saved-opportunities";
import {
  activeWorkspaces,
  canAccessRestrictedDocument,
  proposalsForWorkspace,
  readSolverState,
} from "@/lib/solver/repository";

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: "brief" | "decision" | "shield" | "download" | "history";
  children: React.ReactNode;
}) {
  return (
    <section className="rh-detail-section">
      <header>
        <Icon name={icon} />
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function ChallengeDetail({
  challengeKey,
  basePath,
  requiresAuth = false,
  activeContext,
  contextQuery,
}: {
  challengeKey: string;
  basePath: string;
  requiresAuth?: boolean;
  activeContext: ActiveWorkspace;
  contextQuery: string;
}) {
  const [items, setItems] = useState(() =>
    buildChallengeItems(challenges, activeContext.workspaceId),
  );
  useEffect(() => {
    const refreshCatalog = () =>
      setItems(buildChallengeItems(listCatalogChallenges(), activeContext.workspaceId));
    refreshCatalog();
    window.addEventListener("storage", refreshCatalog);
    window.addEventListener("rahhal:challenges", refreshCatalog);
    return () => {
      window.removeEventListener("storage", refreshCatalog);
      window.removeEventListener("rahhal:challenges", refreshCatalog);
    };
  }, [activeContext.workspaceId]);
  const challenge = items.find(
    (item) => item.slug.toLowerCase() === challengeKey.toLowerCase() || item.id === challengeKey,
  );
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!challenge) return;
    setSaved(
      isOpportunitySaved(challenge.id, challenge.scenario === "saved", activeContext.workspaceId),
    );
  }, [activeContext.workspaceId, challenge]);
  if (!challenge)
    return (
      <section className="rh-empty">
        <h1>چالش پیدا نشد</h1>
        <p>شناسه واردشده با چالش‌های منتشرشده تطابق ندارد.</p>
        <Link href={`${basePath}${contextQuery}`}>بازگشت به چالش‌ها</Link>
      </section>
    );

  const closed = challenge.scenario === "closed";
  const toggleSaved = () => {
    const next = !saved;
    setSaved(next);
    setOpportunitySaved(challenge.id, next, activeContext.workspaceId);
    setFeedback(
      next
        ? "فرصت ذخیره شد و از بخش «فرصت‌های ذخیره‌شده» در دسترس است."
        : "فرصت از فهرست ذخیره‌شده‌ها حذف شد.",
    );
  };
  const objectiveCopy = [
    `تعریف خط پایه و شاخص سنجش برای «${challenge.tags[0]}»`,
    `اعتبارسنجی راهکار ${challenge.tags[1] ?? challenge.industry} در محیط ${challenge.remote ? "ترکیبی" : "حضوری"}`,
    `طراحی مسیر ${challenge.route} با خروجی قابل ارزیابی`,
  ];
  const state = readSolverState();
  const eligibility = evaluateEligibility(
    challengeEligibilityRules[challenge.id],
    state,
    activeContext,
  );
  const eligibleForSelectedSpace = eligibility.status === "eligible";
  const existingProposal = proposalsForWorkspace(activeContext.workspaceId, state).find(
    (proposal) => proposal.challengeId === challenge.id,
  );
  const proposalPath = existingProposal
    ? buildSolverHref(
        `/app/solver/proposals/${existingProposal.id}/${
          ["draft", "revision_requested", "revision_draft"].includes(existingProposal.state)
            ? "edit"
            : "preview"
        }`,
        activeContext,
      )
    : buildSolverHref("/app/solver/proposals/new/summary", activeContext, {
        challenge: challenge.slug,
      });
  const startHref = requiresAuth
    ? `/auth/login?returnTo=${encodeURIComponent(`/app/solver/opportunities/${challenge.slug}`)}`
    : proposalPath;
  const actionLabel =
    challenge.scenario === "draft"
      ? "ادامه تدوین راه‌حل"
      : challenge.scenario === "revision"
        ? "اعمال اصلاحات در راه‌حل"
        : challenge.scenario === "submitted" || challenge.scenario === "review"
          ? "پیگیری راه‌حل ارسال‌شده"
          : "شروع تدوین راه‌حل";

  return (
    <div className="rh-detail-page">
      <nav className="rh-detail-breadcrumb" aria-label="مسیر صفحه">
        <Link href={buildSolverHref("/app/solver/dashboard", activeContext)}>داشبورد</Link>
        <span>/</span>
        <Link href={`${basePath}${contextQuery}`}>چالش‌ها</Link>
        <span>/</span>
        <span>{challenge.industry}</span>
      </nav>
      <Link className="rh-detail-back" href={`${basePath}${contextQuery}`}>
        <Icon name="arrow" /> بازگشت به چالش‌ها
      </Link>
      <header className="rh-detail-hero">
        <div className="rh-detail-hero__pattern" aria-hidden="true" />
        <ScenarioBadge scenario={challenge.scenario} />
        <span>{challenge.industry}</span>
        <h1>{challenge.title}</h1>
        <p>{challenge.summary}</p>
        <div className="rh-detail-org">
          <OrganizationLogo organization={challenge.publisher} size="large" />
          <div>
            <strong>{challenge.publisher.name}</strong>
            <small>{challenge.publisher.industry}</small>
          </div>
        </div>
        <dl>
          <div>
            <dt>شناسه</dt>
            <dd>
              <bdi dir="ltr">{challenge.id}</bdi>
            </dd>
          </div>
          <div>
            <dt>انتشار</dt>
            <dd>۱۶ مرداد ۱۴۰۵</dd>
          </div>
          <div>
            <dt>اولویت</dt>
            <dd>{challenge.scenario === "revision" ? "نیازمند اقدام" : "عادی"}</dd>
          </div>
          <div>
            <dt>محل اجرا</dt>
            <dd>{challenge.remote ? "ترکیبی" : "تهران"}</dd>
          </div>
        </dl>
        <div className="rh-deadline">
          <strong>
            {closed ? "۰" : daysRemaining(challenge.deadline).toLocaleString("fa-IR")}
          </strong>
          <span>{closed ? "مهلت پایان یافته" : "روز تا پایان ارسال"}</span>
        </div>
      </header>

      <div className="rh-detail-layout">
        <main>
          <DetailSection title="شرح چالش" icon="brief">
            <h3>مسئله چیست؟</h3>
            <p>
              {challenge.summary} سازمان به‌دنبال راهکاری است که بدون ایجاد اختلال در تولید، امکان
              سنجش خط پایه، اجرای کنترل‌شده و ارزیابی نتیجه را فراهم کند.
            </p>
            <div className="rh-callout">
              <strong>نتیجه مطلوب</strong>
              <p>
                بهبود قابل‌اندازه‌گیری در شاخص مرتبط با «{challenge.tags[0]}»، حفظ الزامات
                {challenge.industry} و امکان ارزیابی نتیجه در مسیر {challenge.route}.
              </p>
            </div>
          </DetailSection>
          <DetailSection title="اهداف و دامنه" icon="decision">
            <div className="rh-scope-grid">
              <div>
                <h3>اهداف کلیدی</h3>
                <ul>
                  {objectiveCopy.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>خارج از دامنه</h3>
                <ul>
                  <li>اقدام خارج از دامنه «{challenge.title}»</li>
                  <li>تعهد اجرایی پیش از تأیید طرح {challenge.route}</li>
                </ul>
              </div>
            </div>
            <div className="rh-tag-row">
              {challenge.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </DetailSection>
          <DetailSection title="خروجی‌های مورد انتظار" icon="download">
            <div className="rh-deliverables">
              <article>
                <Icon name="brief" />
                <span>گزارش خط پایه {challenge.tags[0]}</span>
              </article>
              <article>
                <Icon name="decision" />
                <span>طرح فنی {challenge.tags[1] ?? challenge.industry} و برآورد اقتصادی</span>
              </article>
              <article>
                <Icon name="history" />
                <span>برنامه اجرای پایلوت و گزارش نتایج</span>
              </article>
            </div>
          </DetailSection>
          <DetailSection title="معیارهای ارزیابی" icon="decision">
            <ol className="rh-criteria">
              <li>
                <span>اثرگذاری و میزان صرفه‌جویی</span>
                <b>۳۵٪</b>
              </li>
              <li>
                <span>امکان‌پذیری فنی</span>
                <b>۳۰٪</b>
              </li>
              <li>
                <span>توجیه اقتصادی</span>
                <b>۲۰٪</b>
              </li>
              <li>
                <span>زمان و کیفیت اجرا</span>
                <b>۱۵٪</b>
              </li>
            </ol>
          </DetailSection>
          <DetailSection title="ملاحظات و محدودیت‌ها" icon="shield">
            <ul className="rh-notes">
              <li>رعایت الزامات حوزه {challenge.industry} در تمام مراحل الزامی است.</li>
              <li>راهکار باید شواهد مرتبط با {challenge.tags.join("، ")} ارائه کند.</li>
              <li>
                نوع همکاری این رکورد «{challenge.route}» است و اقدام‌ها باید با همان مسیر سازگار
                باشند.
              </li>
              <li>
                سطح انتشار «{challenge.visibility}» است و اطلاعات فقط در دامنه همین چالش استفاده
                می‌شوند.
              </li>
            </ul>
          </DetailSection>
          <DetailSection title="اطلاعات تکمیلی و فایل‌ها" icon="download">
            {challengeEligibilityRules[challenge.id]?.documentGate &&
            !canAccessRestrictedDocument(activeContext.workspaceId, challenge.id, state) ? (
              <div className="rh-callout">
                <strong>دسترسی پس از پذیرش NDA</strong>
                <p>نام و فراداده اسناد محرمانه تا ثبت رسید پذیرش نمایش داده نمی‌شود.</p>
                <Link
                  href={buildSolverHref("/app/solver/data-room", activeContext, {
                    entity: challenge.id,
                  })}
                >
                  بررسی شرایط دسترسی
                </Link>
              </div>
            ) : (
              <div className="rh-files">
                <div className="rh-file-placeholder">
                  <Icon name="download" />
                  <span>
                    شرح فنی <bdi dir="ltr">{challenge.id}</bdi>
                  </span>
                  <small>PDF · ۲٫۴ مگابایت · مشاهده در نسخه نمایشی</small>
                </div>
                <div className="rh-file-placeholder">
                  <Icon name="download" />
                  <span>
                    پیوست {challenge.tags[0]} برای {challenge.industry}
                  </span>
                  <small>PDF · ۲٫۱ مگابایت · مشاهده در نسخه نمایشی</small>
                </div>
              </div>
            )}
          </DetailSection>
        </main>

        <aside>
          <section className="rh-side-card">
            <h2>خلاصه همکاری</h2>
            <dl>
              <div>
                <dt>مهلت ارسال راه‌حل</dt>
                <dd>
                  {closed
                    ? "پایان یافته"
                    : `${daysRemaining(challenge.deadline).toLocaleString("fa-IR")} روز دیگر`}
                </dd>
              </div>
              <div>
                <dt>بودجه همکاری</dt>
                <dd>{budgetLabel(challenge.budget)}</dd>
              </div>
              <div>
                <dt>نوع همکاری</dt>
                <dd>{challenge.route}</dd>
              </div>
              <div>
                <dt>شیوه اجرا</dt>
                <dd>{challenge.remote ? "حضوری و دورکار" : "حضوری و پایلوت صنعتی"}</dd>
              </div>
              <div>
                <dt>مالکیت فکری</dt>
                <dd>توافق در قرارداد نهایی</dd>
              </div>
            </dl>
            {!requiresAuth ? (
              <label>
                <span>ارسال به نمایندگی از</span>
                <select
                  value={activeContext.workspaceId}
                  onChange={(event) => {
                    const target = activeWorkspaces(state).find(
                      (workspace) => workspace.workspaceId === event.target.value,
                    );
                    if (!target) return;
                    const href = buildSolverHref(`${basePath}/${challenge.slug}`, target);
                    if (document.documentElement.dataset.challengeStandalone === "true")
                      window.location.hash = href;
                    else window.location.assign(href);
                  }}
                >
                  {activeWorkspaces(state).map((workspace) => {
                    const team =
                      workspace.type === "team"
                        ? state.teams.find((candidate) => candidate.id === workspace.teamId)
                        : undefined;
                    return (
                      <option key={workspace.workspaceId} value={workspace.workspaceId}>
                        {team?.name ?? state.personalWorkspace.name}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <div className="rh-team-authority-note" role="note">
                <Icon name="shield" />
                <div>
                  <strong>فضای ارسال پس از ورود انتخاب می‌شود</strong>
                  <p>
                    ورود با یک هویت انجام می‌شود؛ سپس فضای شخصی یا یکی از تیم‌های فعال را انتخاب
                    می‌کنید.
                  </p>
                </div>
              </div>
            )}
            {!requiresAuth && !eligibleForSelectedSpace && (
              <div className="rh-eligibility-error" role="alert">
                <strong>
                  {eligibility.status === "ineligible"
                    ? "امکان ارسال وجود ندارد"
                    : "پیش از ارسال اقدام لازم است"}
                </strong>
                <ul>
                  {eligibility.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {eligibility.actions.map((action) => (
                  <Link key={action.label} href={buildSolverHref(action.href, activeContext)}>
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
            {closed ? (
              <p className="rh-closed-note">این چالش بسته شده و دریافت راه‌حل جدید فعال نیست.</p>
            ) : requiresAuth || eligibleForSelectedSpace ? (
              <Link className="rh-button rh-button--primary" href={startHref}>
                {requiresAuth ? "ورود و بررسی شرایط ارسال" : actionLabel}
              </Link>
            ) : (
              <button type="button" className="rh-button rh-button--primary" disabled>
                {actionLabel}
              </button>
            )}
            <button
              type="button"
              className={`rh-button rh-button--secondary ${saved ? "is-saved" : ""}`}
              onClick={toggleSaved}
              aria-pressed={saved}
            >
              <Icon name="history" /> {saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره فرصت"}
            </button>
            <Link className="rh-share-link" href={`/challenges/${challenge.slug}`}>
              اشتراک‌گذاری
            </Link>
            <p className="rh-profile-warning">
              نتیجه شرایط مشارکت:{" "}
              {eligibility.status === "eligible" ? "واجد شرایط" : "نیازمند اقدام یا بررسی"}
            </p>
          </section>
          <section className="rh-side-card">
            <h2>متقاضیان مجاز</h2>
            {challenge.applicants.map((item) => (
              <p className="rh-eligible" key={item}>
                <Icon name="check" /> {item}
              </p>
            ))}
          </section>
          <section className="rh-side-card rh-publisher">
            <h2>سازمان منتشرکننده</h2>
            <OrganizationLogo organization={challenge.publisher} size="large" />
            <strong>{challenge.publisher.name}</strong>
            <small>عضو تأییدشده راه‌حل</small>
            <span>
              تهران ·{" "}
              {items
                .filter((item) => item.publisher.id === challenge.publisher.id)
                .length.toLocaleString("fa-IR")}{" "}
              چالش منتشرشده
            </span>
            <Link href={`/organizations/${challenge.publisher.slug}`}>مشاهده پروفایل سازمان</Link>
          </section>
        </aside>
      </div>

      <section className="rh-process">
        <h2>فرایند همکاری</h2>
        <div>
          {["ارسال راه‌حل", "ارزیابی اولیه", "جلسه ارائه", "شروع پایلوت"].map((step, index) => (
            <article key={step}>
              <span>{index + 1}</span>
              <Icon
                name={
                  index === 0 ? "arrow" : index === 1 ? "menu" : index === 2 ? "people" : "impact"
                }
              />
              <strong>{step}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="rh-legal">
        <h2>شرایط دسترسی و حقوقی</h2>
        <div>
          <article>
            <Icon name="eye" />
            <strong>نمایش عمومی چالش</strong>
            <p>اطلاعات این صفحه برای همه قابل مشاهده است.</p>
          </article>
          <article>
            <Icon name="lock" />
            <strong>توافق محرمانگی</strong>
            <p>پیش از دسترسی به اطلاعات حساس تأیید می‌شود.</p>
          </article>
          <article>
            <Icon name="brief" />
            <strong>مستندات فنی تکمیلی</strong>
            <p>پس از غربال اولیه برای منتخبین ارسال می‌شود.</p>
          </article>
          <article>
            <Icon name="decision" />
            <strong>مالکیت نتایج</strong>
            <p>مطابق قرارداد همکاری نهایی تعیین خواهد شد.</p>
          </article>
        </div>
      </section>
      {!closed && (
        <section className="rh-detail-cta">
          <div>
            <h2>راهکاری برای این چالش دارید؟</h2>
            <p>دانش و تجربه شما می‌تواند به حل این مسئله و خلق اثر واقعی کمک کند.</p>
          </div>
          {requiresAuth || eligibleForSelectedSpace ? (
            <Link className="rh-button rh-button--primary" href={startHref}>
              {requiresAuth ? "ورود و بررسی شرایط ارسال" : actionLabel}
            </Link>
          ) : (
            <button type="button" className="rh-button rh-button--primary" disabled>
              {actionLabel}
            </button>
          )}
          <button type="button" onClick={toggleSaved}>
            <Icon name="history" /> {saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره برای بعد"}
          </button>
        </section>
      )}
      {feedback && (
        <div className="rh-flow-toast" role="status">
          <Icon name="check" />
          <span>{feedback}</span>
          {saved && (
            <Link href={buildSolverHref("/app/solver/saved", activeContext)}>
              مشاهده ذخیره‌شده‌ها
            </Link>
          )}
          <button type="button" onClick={() => setFeedback("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
