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
      <header className="rh-profile-heading">
        <div>
          <small>دعوت مستقیم C6</small>
          <h1>دعوت‌های همکاری ارسالی</h1>
          <p>دعوت‌ها به یک فضای حل‌کننده و نسخه دقیق یک فراخوان منتشرشده متصل‌اند.</p>
        </div>
        <button
          className="org-button org-button--primary"
          type="button"
          onClick={() => setCreating((value) => !value)}
        >
          <Icon name="plus" /> {creating ? "بستن فرم" : "ارسال دعوت"}
        </button>
      </header>

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
          className="org-card org-filter-card"
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
          <h2>دعوت یک فضای حل‌کننده</h2>
          <label>
            <span>فراخوان منتشرشده</span>
            <select
              required
              value={challengeId}
              onChange={(event) => setChallengeId(event.target.value)}
            >
              <option value="">انتخاب کنید</option>
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
          </label>
          <label>
            <span>عنوان دعوت</span>
            <input
              required
              minLength={5}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>خلاصه همکاری</span>
            <textarea
              required
              minLength={20}
              rows={4}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            <span>دلیل دعوت</span>
            <input
              required
              minLength={5}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
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
          <button type="submit" disabled={pending || !selected}>
            {pending ? "در حال ارسال…" : "ارسال دعوت"}
          </button>
        </form>
      )}

      <section className="org-proposal-list">
        {state.offers.map((offer) => (
          <article key={offer.id}>
            <header>
              <div>
                <small>
                  <bdi dir="ltr">{offer.id}</bdi>
                </small>
                <h2>{offer.title}</h2>
                <p>
                  گیرنده <bdi dir="ltr">{offer.recipient_workspace_id}</bdi> · مهلت{" "}
                  {formatDate(offer.response_deadline)}
                </p>
              </div>
              <span className="org-status is-info">{directOfferStateLabels[offer.state]}</span>
            </header>
            <p>{offer.summary}</p>
            {offer.response?.state === "submitted" && (
              <p>پاسخ حل‌کننده دریافت شده و نسخه آن قفل است.</p>
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
                  شروع مذاکره
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
          <div className="rh-profile-empty">
            <Icon name="notification" />
            <h2>هنوز دعوتی ارسال نشده است</h2>
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
