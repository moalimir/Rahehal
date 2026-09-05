"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import type { ChallengePublicProjectionResource, DirectOfferResource } from "@rahhal/contracts";
import type { WorkspaceId } from "@rahhal/domain";
import { listPublicChallenges } from "@/lib/challenges/adapters/network-public-challenges";
import { directOfferStateLabels } from "@/lib/workspace/state-labels";

type PageState = {
  offers: readonly DirectOfferResource[];
  challenges: readonly ChallengePublicProjectionResource[];
  error: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function offerTone(state: DirectOfferResource["state"]): string {
  if (state === "selected") return "is-success";
  if (["declined", "expired", "cancelled"].includes(state)) return "is-danger";
  if (["response_submitted", "negotiating"].includes(state)) return "is-info";
  return "is-warning";
}

/** The authoritative C6 sender surface; matching/ranking remains out of scope. */
export function ConnectedOrganizationDirectOffers() {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const [state, setState] = useState<PageState | null>(null);
  const [creating, setCreating] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [recipientWorkspaceId, setRecipientWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setState(null);
    const [offers, publicCalls, ownCalls] = await Promise.all([
      gateways.organizationDirectOffers.list(),
      listPublicChallenges(),
      runtime.challengeGateway.queries.list(),
    ]);
    const ownIds = new Set(ownCalls.ok ? ownCalls.data.map((challenge) => challenge.id) : []);
    const challenges = publicCalls.ok
      ? publicCalls.data.items.filter((challenge) => ownIds.has(challenge.challenge_id))
      : [];
    const errors = [
      offers.ok ? null : offers.error.message,
      publicCalls.ok ? null : publicCalls.error.message,
      ownCalls.ok ? null : ownCalls.error.message,
    ].filter((value): value is string => Boolean(value));
    setState({ offers: offers.ok ? offers.data.items : [], challenges, error: errors.join(" · ") });
  }, [gateways.organizationDirectOffers, runtime.challengeGateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => state?.challenges.find((challenge) => challenge.challenge_id === challengeId) ?? null,
    [challengeId, state?.challenges],
  );
  const waitingCount = state?.offers.filter((offer) =>
    ["received", "viewed", "response_draft"].includes(offer.state),
  ).length;
  const responseCount = state?.offers.filter(
    (offer) => offer.response?.state === "submitted",
  ).length;
  const negotiationCount = state?.offers.filter((offer) => offer.state === "negotiating").length;

  const command = async (
    run: () => ReturnType<typeof gateways.organizationDirectOffers.cancel>,
    success: string,
  ) => {
    setPending(true);
    const result = await run();
    setPending(false);
    setNotice(
      result.ok ? `${success} · شناسه همبستگی ${result.meta.correlation_id}` : result.error.message,
    );
    if (result.ok) await load();
  };

  if (!state)
    return (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال خواندن دعوت‌های مستقیم</span>
        <div className="route-fallback__skeleton" />
      </section>
    );

  return (
    <div className="org-workspace-page">
      <header className="org-page-head org-connected-page-head">
        <div>
          <span>متخصصان و دعوت‌ها</span>
          <h1>دعوت‌های مستقیم همکاری</h1>
          <p>
            دعوت‌های ارسال‌شده، پاسخ حل‌کننده و مرحله مذاکره را در یک نمای روشن و همگام دنبال کنید.
          </p>
        </div>
        <div className="org-page-head__action">
          <button
            className="org-button org-button--primary"
            type="button"
            aria-expanded={creating}
            aria-controls="organization-direct-offer-form"
            onClick={() => setCreating((value) => !value)}
          >
            <Icon name={creating ? "close" : "plus"} /> {creating ? "بستن فرم" : "دعوت جدید"}
          </button>
        </div>
      </header>

      <section
        className="org-metrics org-metrics--three org-connected-summary"
        aria-label="خلاصه دعوت‌ها"
      >
        <article className="org-metric">
          <span>
            <Icon name="mail" />
          </span>
          <div>
            <small>همه دعوت‌ها</small>
            <strong>{state.offers.length.toLocaleString("fa-IR")}</strong>
            <p>در فضای سازمانی فعال</p>
          </div>
        </article>
        <article className="org-metric org-metric--amber">
          <span>
            <Icon name="history" />
          </span>
          <div>
            <small>در انتظار پاسخ</small>
            <strong>{(waitingCount ?? 0).toLocaleString("fa-IR")}</strong>
            <p>ارسال، مشاهده یا پیش‌نویس پاسخ</p>
          </div>
        </article>
        <article className="org-metric org-metric--green">
          <span>
            <Icon name="decision" />
          </span>
          <div>
            <small>پاسخ دریافت‌شده</small>
            <strong>{(responseCount ?? 0).toLocaleString("fa-IR")}</strong>
            <p>{(negotiationCount ?? 0).toLocaleString("fa-IR")} مورد در مذاکره</p>
          </div>
        </article>
      </section>

      {state.error && (
        <section className="challenge-inline-error" role="status">
          <p>{state.error}</p>
          <button type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </section>
      )}

      {creating && (
        <form
          id="organization-direct-offer-form"
          className="org-card org-offer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) return;
            const recipient = recipientWorkspaceId.trim();
            if (!/^wsp_[A-Za-z0-9_-]{3,}$/.test(recipient)) {
              setNotice("شناسه فضای کاری گیرنده معتبر نیست.");
              return;
            }
            setPending(true);
            void gateways.organizationDirectOffers
              .send({
                challenge_id: selected.challenge_id,
                challenge_version_id: selected.challenge_version_id,
                recipient_workspace_id: recipient as WorkspaceId,
                title: title.trim(),
                summary: summary.trim(),
                invitation_reasons: [reason.trim()],
                requested_documents: [],
                response_deadline: new Date(deadline).toISOString(),
              })
              .then(async (result) => {
                setPending(false);
                setNotice(
                  result.ok
                    ? `دعوت ارسال شد · شناسه همبستگی ${result.meta.correlation_id}`
                    : result.error.message,
                );
                if (result.ok) {
                  setCreating(false);
                  await load();
                }
              });
          }}
        >
          <header className="org-card__head">
            <div>
              <h2>ساخت دعوت جدید</h2>
              <p>فراخوان، گیرنده و انتظار همکاری را دقیق ثبت کنید.</p>
            </div>
            <span className="org-offer-form__step">اطلاعات ضروری</span>
          </header>
          <div className="org-offer-form__grid">
            <label>
              <span>فراخوان منتشرشده</span>
              <select
                required
                value={challengeId}
                onChange={(event) => setChallengeId(event.target.value)}
              >
                <option value="">یک فراخوان را انتخاب کنید</option>
                {state.challenges.map((challenge) => (
                  <option key={challenge.challenge_id} value={challenge.challenge_id}>
                    {challenge.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>شناسه فضای کاری گیرنده</span>
              <input
                required
                dir="ltr"
                value={recipientWorkspaceId}
                onChange={(event) => setRecipientWorkspaceId(event.target.value)}
                placeholder="wsp_..."
              />
              <small>شناسه فضای فردی یا تیمی حل‌کننده</small>
            </label>
            <label>
              <span>عنوان دعوت</span>
              <input
                required
                minLength={5}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="برای نمونه: دعوت به طراحی پایلوت"
              />
            </label>
            <label>
              <span>مهلت پاسخ</span>
              <input
                required
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            <label className="is-wide">
              <span>خلاصه همکاری</span>
              <textarea
                required
                minLength={20}
                rows={4}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="دامنه و نتیجه‌ای که از این همکاری انتظار دارید"
              />
            </label>
            <label className="is-wide">
              <span>دلیل دعوت</span>
              <input
                required
                minLength={5}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="چرا این فضای حل‌کننده برای فراخوان مناسب است؟"
              />
            </label>
          </div>
          <footer>
            <p>
              دعوت برای نسخه دقیق فراخوان انتخاب‌شده ثبت می‌شود و وضعیت آن برای هر دو طرف یکسان
              خواهد بود.
            </p>
            <button
              className="org-button org-button--primary"
              type="submit"
              disabled={pending || !selected}
            >
              <Icon name="mail" /> {pending ? "در حال ارسال…" : "ارسال دعوت"}
            </button>
          </footer>
        </form>
      )}

      <section className="org-connected-offer-list" aria-label="دعوت‌های همکاری ارسالی">
        {state.offers.map((offer) => (
          <article className="org-connected-offer-card" key={offer.id}>
            <header>
              <div className="org-connected-offer-card__title">
                <span aria-hidden="true">
                  <Icon name="mail" />
                </span>
                <div>
                  <small>
                    <bdi dir="ltr">{offer.id}</bdi>
                  </small>
                  <h2>{offer.title}</h2>
                </div>
              </div>
              <span className={`org-status ${offerTone(offer.state)}`}>
                {directOfferStateLabels[offer.state]}
              </span>
            </header>
            <div className="org-connected-offer-card__meta">
              <span>
                <Icon name="people" />
                گیرنده <bdi dir="ltr">{offer.recipient_workspace_id}</bdi>
              </span>
              <span>
                <Icon name="history" />
                مهلت پاسخ {formatDate(offer.response_deadline)}
              </span>
            </div>
            <p className="org-connected-offer-card__summary">{offer.summary}</p>
            {offer.response?.state === "submitted" && (
              <div className="org-connected-offer-card__response">
                <Icon name="check" />
                <span>
                  <strong>پاسخ حل‌کننده دریافت شده است</strong>
                  <small>نسخه پاسخ قفل شده و برای ادامه مذاکره آماده است.</small>
                </span>
              </div>
            )}
            <footer>
              {offer.state === "response_submitted" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void command(
                      () =>
                        gateways.organizationDirectOffers.startNegotiation(offer.id, offer.version),
                      "مذاکره آغاز شد",
                    )
                  }
                >
                  <Icon name="decision" /> شروع مذاکره
                </button>
              )}
              {["sent", "viewed", "response_draft", "response_submitted"].includes(offer.state) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void command(
                      () =>
                        gateways.organizationDirectOffers.cancel(offer.id, {
                          expectedVersion: offer.version,
                          reason: "لغو دعوت از پنل سازمان",
                        }),
                      "دعوت لغو شد",
                    )
                  }
                >
                  لغو دعوت
                </button>
              )}
            </footer>
          </article>
        ))}
        {!state.offers.length && !state.error && (
          <div className="rh-card rh-profile-empty">
            <Icon name="notification" />
            <h2>هنوز دعوتی ارسال نشده است</h2>
            <p>با انتخاب «دعوت جدید» یک فراخوان را به فضای حل‌کننده مناسب پیشنهاد دهید.</p>
          </div>
        )}
      </section>

      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="check" />
          <span>{notice}</span>
          <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
