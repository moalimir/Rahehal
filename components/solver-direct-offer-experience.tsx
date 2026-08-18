"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/internal/shared";
import { ProductNotFound } from "@/components/route-fallbacks";
import { useSolverContext } from "@/components/solver-shell";
import { getChallengePublisher } from "@/data/challenge-publishers";
import { challenges } from "@/data/mock";
import type { DirectOfferState, OfferResponse, SolverState } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import {
  declineDirectOffer,
  directOfferById,
  directOffersForWorkspace,
  readSolverState,
  saveOfferResponse,
  startOfferResponse,
  submitOfferResponse,
  subscribeSolverState,
  viewDirectOffer,
} from "@/lib/solver/repository";

const stateLabel: Record<DirectOfferState, string> = {
  received: "دریافت‌شده",
  viewed: "مشاهده‌شده",
  response_draft: "پیش‌نویس پاسخ",
  response_submitted: "پاسخ ارسال‌شده",
  negotiating: "در مذاکره",
  selected: "منتخب",
  declined: "ردشده",
  expired: "منقضی",
  cancelled: "لغوشده",
};

function useStore() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

function workspaceName(state: SolverState, workspaceId: string) {
  if (workspaceId === state.personalWorkspace.id) return state.personalWorkspace.name;
  return state.teams.find((team) => team.workspaceId === workspaceId)?.name ?? workspaceId;
}

function OfferHeading({ description }: { description: string }) {
  return (
    <header className="rh-profile-heading">
      <div>
        <small>فضای حرفه‌ای حل‌کننده</small>
        <h1>پیشنهادهای مستقیم دریافتی</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function SolverDirectOffersList() {
  const context = useSolverContext();
  const state = useStore();
  const offers = directOffersForWorkspace(context.workspaceId, state);
  const [filter, setFilter] = useState<"all" | "open" | "submitted" | "closed">("all");
  const [expanded, setExpanded] = useState<string>();
  const [rejecting, setRejecting] = useState<string>();
  const [notice, setNotice] = useState("");
  const visible = useMemo(
    () =>
      offers.filter((offer) => {
        if (filter === "open")
          return ["received", "viewed", "response_draft"].includes(offer.state);
        if (filter === "submitted")
          return ["response_submitted", "negotiating"].includes(offer.state);
        if (filter === "closed")
          return ["selected", "declined", "expired", "cancelled"].includes(offer.state);
        return true;
      }),
    [filter, offers],
  );
  const openCount = offers.filter((offer) =>
    ["received", "viewed", "response_draft"].includes(offer.state),
  ).length;
  const submittedCount = offers.filter((offer) =>
    ["response_submitted", "negotiating"].includes(offer.state),
  ).length;

  return (
    <>
      <OfferHeading
        description={`دعوت‌های سازمان‌ها فقط برای «${workspaceName(state, context.workspaceId)}» نمایش داده می‌شوند؛ مشاهده دعوت به‌معنای پذیرش همکاری نیست.`}
      />
      <section
        className="rh-summary-grid rh-summary-grid--three"
        aria-label="خلاصه پیشنهادهای مستقیم"
      >
        {[
          ["نیازمند پاسخ", openCount, "notification"],
          ["پاسخ ارسال‌شده", submittedCount, "check"],
          ["همه پیشنهادها", offers.length, "brief"],
        ].map(([label, count, icon]) => (
          <article className="rh-card" key={String(label)}>
            <span>
              <Icon name={icon as "notification"} />
            </span>
            <div>
              <small>{label}</small>
              <strong>{Number(count).toLocaleString("fa-IR")}</strong>
            </div>
          </article>
        ))}
      </section>
      <div className="rh-offer-tabs" role="tablist" aria-label="فیلتر پیشنهادهای مستقیم">
        {[
          ["all", "همه"],
          ["open", "نیازمند پاسخ"],
          ["submitted", "ارسال‌شده"],
          ["closed", "بسته‌شده"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "is-active" : ""}
            onClick={() => setFilter(value as typeof filter)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="rh-offer-list" aria-label="فهرست پیشنهادهای مستقیم دریافتی">
        {visible.map((offer) => {
          const publisher = getChallengePublisher(offer.challengeId);
          const challengeSlug = challenges.find(
            (challenge) => challenge.id === offer.challengeId,
          )?.slug;
          const terminal = ["selected", "declined", "expired", "cancelled"].includes(offer.state);
          return (
            <article className={`rh-card rh-offer-card is-${offer.state}`} key={offer.id}>
              <header className="rh-offer-card__header">
                <div className="rh-offer-card__organization">
                  <span className="rh-offer-card__logo">
                    <ChallengeOrganizationLogo challengeId={offer.challengeId} size="large" />
                  </span>
                  <div>
                    <small>سازمان دعوت‌کننده</small>
                    <strong>{publisher.name}</strong>
                    <span>
                      <Icon name="check" /> داده نمونه‌ی تأییدشده در fixture
                    </span>
                  </div>
                </div>
                <div className="rh-offer-card__state">
                  <span className="rh-status rh-status--info">{stateLabel[offer.state]}</span>
                  <bdi dir="ltr">{offer.id}</bdi>
                </div>
              </header>
              <div className="rh-offer-card__body">
                <span className="rh-offer-card__eyebrow">
                  پیشنهاد مستقیم برای {workspaceName(state, offer.recipientWorkspaceId)}
                </span>
                <h2>{offer.title}</h2>
                <p>{offer.summary}</p>
                <dl>
                  <div>
                    <dt>مهلت پاسخ</dt>
                    <dd>
                      <time dateTime={offer.deadline}>
                        {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
                          new Date(offer.deadline),
                        )}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>مدارک درخواستی</dt>
                    <dd>{offer.requestedDocuments.join("، ") || "مدرک اضافه‌ای لازم نیست"}</dd>
                  </div>
                  <div>
                    <dt>فضای دریافت‌کننده</dt>
                    <dd>{workspaceName(state, offer.recipientWorkspaceId)}</dd>
                  </div>
                </dl>
                <div className="rh-reason-chips" aria-label="دلایل دعوت">
                  {offer.invitationReasons.map((item) => (
                    <span key={item}>
                      <Icon name="check" /> {item}
                    </span>
                  ))}
                </div>
                {expanded === offer.id && (
                  <div className="rh-offer-card__detail" id={`offer-detail-${offer.id}`}>
                    <strong>پیش از پاسخ</strong>
                    <p>
                      این دعوت ممکن است برای چند فرد یا تیم ارسال شده باشد. ورود به تدوین پاسخ فقط
                      یک draft می‌سازد و انتخاب نهایی یا قرارداد ایجاد نمی‌کند.
                    </p>
                  </div>
                )}
              </div>
              <footer className="rh-offer-card__footer">
                <button
                  type="button"
                  className="is-quiet"
                  aria-expanded={expanded === offer.id}
                  aria-controls={`offer-detail-${offer.id}`}
                  onClick={() => {
                    setExpanded((current) => (current === offer.id ? undefined : offer.id));
                    if (!offer.viewedAt) viewDirectOffer(offer.id, context.workspaceId);
                  }}
                >
                  {expanded === offer.id ? "بستن جزئیات" : "جزئیات پیشنهاد"}
                </button>
                {challengeSlug && (
                  <Link
                    className="is-secondary"
                    href={buildSolverHref(`/app/solver/opportunities/${challengeSlug}`, context)}
                  >
                    مشاهده جزئیات فرصت
                  </Link>
                )}
                {!terminal && (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => setRejecting(offer.id)}
                  >
                    رد پیشنهاد
                  </button>
                )}
                {!terminal &&
                  offer.state !== "response_submitted" &&
                  offer.state !== "negotiating" && (
                    <Link
                      className="is-primary"
                      href={buildSolverHref(
                        `/app/solver/received-proposals/${offer.id}/respond`,
                        context,
                      )}
                      onClick={() => startOfferResponse(offer.id, context.workspaceId)}
                    >
                      {offer.state === "response_draft" ? "ادامه تدوین پاسخ" : "تدوین پاسخ"}
                    </Link>
                  )}
              </footer>
            </article>
          );
        })}
        {!visible.length && (
          <section className="rh-card rh-profile-empty">
            <Icon name="search" />
            <h2>
              {offers.length
                ? "پیشنهادی با این فیلتر وجود ندارد"
                : "پیشنهاد مستقیمی برای این فضا وجود ندارد"}
            </h2>
            <p>هر دعوت فقط در workspace دریافت‌کننده دیده می‌شود.</p>
            {offers.length > 0 && (
              <button type="button" onClick={() => setFilter("all")}>
                نمایش همه
              </button>
            )}
          </section>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(rejecting)}
        title="رد پیشنهاد مستقیم"
        description="دلیل رد در سابقه همین پیشنهاد مستقیم ثبت و برای سازمان قابل پیگیری می‌شود."
        confirmLabel="ثبت رد پیشنهاد"
        reasonRequired
        onCancel={() => setRejecting(undefined)}
        onConfirm={(reason) => {
          if (!rejecting) return;
          const result = declineDirectOffer(rejecting, context.workspaceId, reason ?? "");
          setNotice(result.ok ? `رد پیشنهاد با رسید ${result.receiptId} ثبت شد.` : result.message);
          if (result.ok) setRejecting(undefined);
        }}
      />
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="check" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}

type ResponseForm = {
  approach: string;
  scope: string;
  start: string;
  duration: string;
  budget: string;
  payment: string;
  negotiables: string;
  confirmed: boolean;
};

export function SolverDirectOfferResponse({ offerId }: { offerId?: string }) {
  const context = useSolverContext();
  const state = useStore();
  const offer = offerId ? directOfferById(offerId, context.workspaceId, state) : undefined;
  const existing = state.offerResponses.find(
    (response) => response.offerId === offerId && response.ownerWorkspaceId === context.workspaceId,
  );
  const [form, setForm] = useState<ResponseForm>(() => ({
    approach: existing?.approach ?? "",
    scope: "",
    start: "",
    duration: existing?.duration ?? "",
    budget: existing?.budget ?? "",
    payment: "",
    negotiables: "",
    confirmed: false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<string>();

  useEffect(() => {
    if (
      offer &&
      !existing &&
      !["declined", "expired", "cancelled", "selected"].includes(offer.state)
    )
      startOfferResponse(offer.id, context.workspaceId);
  }, [context.workspaceId, existing, offer]);

  if (!offer)
    return (
      <ProductNotFound requestedPath={`/app/solver/received-proposals/${offerId ?? ""}/respond`} />
    );
  const publisher = getChallengePublisher(offer.challengeId);
  const update = (field: keyof ResponseForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };
  const persistDraft = () => {
    const currentState = readSolverState();
    let response = currentState.offerResponses.find(
      (item) => item.offerId === offer.id && item.ownerWorkspaceId === context.workspaceId,
    );
    if (!response) {
      startOfferResponse(offer.id, context.workspaceId);
      response = readSolverState().offerResponses.find(
        (item) => item.offerId === offer.id && item.ownerWorkspaceId === context.workspaceId,
      );
    }
    if (!response) return;
    const next: OfferResponse = {
      ...response,
      approach: `${form.approach}\n\n${form.scope}`.trim(),
      budget: form.budget,
      duration: form.duration,
    };
    const result = saveOfferResponse(next);
    setNotice(result.ok ? "پیش‌نویس پاسخ برای همین فضای کاری ذخیره شد." : result.message);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.approach.trim().length < 60)
      next.approach = "رویکرد را در حداقل ۶۰ کاراکتر توضیح دهید.";
    if (form.scope.trim().length < 60) next.scope = "دامنه کار را در حداقل ۶۰ کاراکتر توضیح دهید.";
    if (!form.start) next.start = "زمان شروع را انتخاب کنید.";
    if (!/^\d{1,2}$/.test(form.duration) || Number(form.duration) < 1)
      next.duration = "مدت اجرا را بر حسب هفته وارد کنید.";
    if (!/^\d+$/.test(form.budget.replaceAll(",", "")))
      next.budget = "مبلغ را فقط با رقم وارد کنید.";
    if (!form.payment) next.payment = "مدل پرداخت را انتخاب کنید.";
    if (!form.confirmed) next.confirmed = "تأیید اختیار ارسال الزامی است.";
    setErrors(next);
    if (Object.keys(next).length) {
      setNotice("موارد مشخص‌شده را کامل کنید.");
      return;
    }
    const result = submitOfferResponse(
      offer.id,
      context.workspaceId,
      {
        approach: `${form.approach}\n\nدامنه: ${form.scope}\n\nفرض‌ها: ${form.negotiables}`.trim(),
        budget: form.budget.replaceAll(",", ""),
        duration: `${form.duration} هفته`,
        attachmentNames: [],
      },
      `offer-response:${offer.id}:${context.workspaceId}`,
    );
    if (result.ok) setReceipt(result.receiptId);
    else setNotice(result.message);
  };

  if (receipt)
    return (
      <section className="rh-card rh-offer-response-success" role="status">
        <span>
          <Icon name="check" />
        </span>
        <p>
          پاسخ به دعوت <bdi dir="ltr">{offer.id}</bdi> ثبت شد
        </p>
        <h1>نسخه پاسخ برای {publisher.name} قفل شد</h1>
        <p>
          این ثبت انتخاب نهایی یا قرارداد نیست. رسید <bdi dir="ltr">{receipt}</bdi> برای workspace «
          {workspaceName(state, context.workspaceId)}» صادر شد.
        </p>
        <div>
          <Link
            className="is-primary"
            href={buildSolverHref("/app/solver/received-proposals", context)}
          >
            بازگشت به پیشنهادهای مستقیم
          </Link>
        </div>
      </section>
    );

  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>
            <bdi dir="ltr">{offer.id}</bdi> · {workspaceName(state, context.workspaceId)}
          </small>
          <h1>تدوین پاسخ به پیشنهاد همکاری</h1>
          <p>پاسخ فنی، زمان و مبلغ پیشنهادی از یک draft نسخه‌دار همین workspace ساخته می‌شود.</p>
        </div>
        <Link
          className="rh-profile-outline"
          href={buildSolverHref("/app/solver/received-proposals", context)}
        >
          بازگشت
        </Link>
      </header>
      <section className="rh-card rh-offer-response-context">
        <span className="rh-offer-card__logo">
          <ChallengeOrganizationLogo challengeId={offer.challengeId} size="large" />
        </span>
        <div>
          <small>{offer.title}</small>
          <h2>{offer.summary}</h2>
          <p>{publisher.name}</p>
        </div>
        <dl>
          <div>
            <dt>فضای پاسخ‌دهنده</dt>
            <dd>{workspaceName(state, context.workspaceId)}</dd>
          </div>
          <div>
            <dt>وضعیت</dt>
            <dd>{stateLabel[offer.state]}</dd>
          </div>
        </dl>
      </section>
      <div className="rh-offer-response-note">
        <Icon name="notification" />
        <div>
          <strong>این دعوت انحصاری نیست</strong>
          <p>تدوین و ارسال پاسخ به‌تنهایی انتخاب نهایی، پذیرش مالی یا قرارداد ایجاد نمی‌کند.</p>
        </div>
      </div>
      <form className="rh-offer-response-layout" onSubmit={submit} noValidate>
        <main className="rh-card rh-offer-response-form">
          <header>
            <span>۱</span>
            <div>
              <h2>پاسخ فنی و ارزش پیشنهادی</h2>
              <p>رویکرد و خروجی قابل سنجش را روشن کنید.</p>
            </div>
          </header>
          <label className="is-wide">
            <span>رویکرد و ارزش پیشنهادی *</span>
            <textarea
              rows={5}
              value={form.approach}
              onChange={(event) => update("approach", event.target.value)}
            />
            {errors.approach && <small role="alert">{errors.approach}</small>}
          </label>
          <label className="is-wide">
            <span>دامنه کار و خروجی‌های پیشنهادی *</span>
            <textarea
              rows={4}
              value={form.scope}
              onChange={(event) => update("scope", event.target.value)}
            />
            {errors.scope && <small role="alert">{errors.scope}</small>}
          </label>
          <header>
            <span>۲</span>
            <div>
              <h2>شرایط زمانی و مالی</h2>
              <p>این مقادیر برای مذاکره ثبت می‌شوند.</p>
            </div>
          </header>
          <div className="rh-offer-response-grid">
            <label>
              <span>آمادگی برای شروع *</span>
              <select value={form.start} onChange={(event) => update("start", event.target.value)}>
                <option value="">انتخاب کنید</option>
                <option value="immediate">بلافاصله</option>
                <option value="2weeks">حداکثر دو هفته</option>
                <option value="month">حداکثر یک ماه</option>
              </select>
              {errors.start && <small role="alert">{errors.start}</small>}
            </label>
            <label>
              <span>مدت پیشنهادی اجرا *</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={form.duration}
                onChange={(event) => update("duration", event.target.value.replace(/\D/g, ""))}
              />
              {errors.duration && <small role="alert">{errors.duration}</small>}
            </label>
            <label>
              <span>مبلغ پیشنهادی کل *</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={form.budget}
                onChange={(event) => update("budget", event.target.value.replace(/[^0-9,]/g, ""))}
              />
              {errors.budget && <small role="alert">{errors.budget}</small>}
            </label>
            <label>
              <span>مدل پرداخت پیشنهادی *</span>
              <select
                value={form.payment}
                onChange={(event) => update("payment", event.target.value)}
              >
                <option value="">انتخاب کنید</option>
                <option value="milestone">مرحله‌ای</option>
                <option value="mixed">ترکیبی</option>
                <option value="pilot">بودجه مستقل پایلوت</option>
              </select>
              {errors.payment && <small role="alert">{errors.payment}</small>}
            </label>
          </div>
          <label className="is-wide">
            <span>فرض‌ها و موارد قابل مذاکره</span>
            <textarea
              rows={4}
              value={form.negotiables}
              onChange={(event) => update("negotiables", event.target.value)}
            />
          </label>
          <label className="rh-offer-response-consent">
            <input
              type="checkbox"
              checked={form.confirmed}
              onChange={(event) => update("confirmed", event.target.checked)}
            />
            <span>
              تأیید می‌کنم اختیار ارسال این پاسخ از طرف «{workspaceName(state, context.workspaceId)}
              » را دارم.
            </span>
          </label>
          {errors.confirmed && <small role="alert">{errors.confirmed}</small>}
          <footer>
            <button type="button" onClick={persistDraft}>
              ذخیره پیش‌نویس
            </button>
            <button type="submit" className="is-primary">
              ارسال پاسخ پیشنهادی برای سازمان
            </button>
          </footer>
        </main>
        <aside className="rh-card rh-offer-response-guide">
          <h2>مدارک خواسته‌شده</h2>
          <ul>
            {offer.requestedDocuments.map((item) => (
              <li key={item}>
                <Icon name="check" /> {item}
              </li>
            ))}
          </ul>
          <div>
            <Icon name="shield" />
            <p>اطلاعات این پاسخ فقط برای workspace دریافت‌کننده ذخیره می‌شود.</p>
          </div>
        </aside>
      </form>
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="notification" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
