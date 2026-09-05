"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type { GatewayResult } from "@/lib/api/result";
import {
  directOffersScopeLost,
  readDirectOffers,
  readSavedOpportunities,
  savedOpportunitiesScopeLost,
} from "@/lib/workspace/opportunity-view";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
}

function useCommandRunner(refresh: () => void) {
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const run = async (command: () => Promise<GatewayResult<unknown>>, success: string) => {
    setPending(true);
    const result = await command();
    setPending(false);
    if (result.ok) {
      setNotice(`${success} · شناسه همبستگی ${result.meta.correlation_id}`);
      refresh();
      return;
    }
    setNotice(result.error.message);
  };
  const toast = notice ? (
    <div className="rh-profile-toast" role="status">
      <Icon name="check" />
      <span>{notice}</span>
      <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  ) : null;
  return { run, pending, toast };
}

/**
 * The active workspace's saved calls, read from C6 rather than from a browser
 * store. Unsaving carries the row's version, so a save that was already
 * removed in another tab is refused with a typed conflict instead of a
 * silent no-op the page would report as success.
 */
export function ConnectedSavedPage() {
  const runtime = useWebRuntime();
  const connected = useConnectedFamily(readSavedOpportunities, savedOpportunitiesScopeLost);
  const { run, pending, toast } = useCommandRunner(connected.refresh);

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="فرصت‌های ذخیره‌شده" />;

  const view = connected.state.data;
  const gateways = runtime.workspaceGateways;
  return (
    <>
      {toast}
      {view.error && (
        <ConnectedFamilyError error={view.error} label="فرصت‌های ذخیره‌شده">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="rh-profile-heading">
        <div>
          <h1>فرصت‌های ذخیره‌شده</h1>
          <p>{view.rows.length.toLocaleString("fa-IR")} فرصت برای این فضای کاری ذخیره شده است.</p>
        </div>
      </header>
      <section className="rh-saved-grid" aria-label="فرصت‌های ذخیره‌شده">
        {view.rows.map((row) => (
          <article className="rh-card rh-saved-card" key={row.id}>
            <header>
              <div>
                <small>
                  <bdi dir="ltr">{row.challengeId}</bdi>
                </small>
                <h2>{row.challenge?.title ?? "این فراخوان دیگر عمومی نیست"}</h2>
                <p>ذخیره‌شده در {formatDate(row.savedAt)}</p>
              </div>
            </header>
            <dl>
              <div>
                <dt>مهلت ارسال</dt>
                <dd>
                  {row.challenge ? formatDate(row.challenge.proposal_deadline) : "در دسترس نیست"}
                </dd>
              </div>
              <div>
                <dt>دسته</dt>
                <dd>{row.challenge?.category ?? "در دسترس نیست"}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void run(
                  () => gateways!.savedOpportunities.unsave(row.challengeId, row.version),
                  "فرصت از فهرست ذخیره حذف شد",
                )
              }
            >
              حذف از ذخیره‌ها
            </button>
          </article>
        ))}
        {!view.rows.length && !view.error && (
          <div className="rh-profile-empty">
            <Icon name="search" />
            <h2>هنوز فرصتی ذخیره نکرده‌اید</h2>
            <p>از صفحه فرصت‌ها یک فراخوان را ذخیره کنید.</p>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Direct offers addressed to the active workspace.
 *
 * Viewing an offer is itself a recorded command — the sender is entitled to
 * know the invitation was opened — so opening one is a server write, not a
 * local flag, and the page re-reads afterwards rather than assuming it worked.
 */
export function ConnectedDirectOffersList() {
  const runtime = useWebRuntime();
  const connected = useConnectedFamily(readDirectOffers, directOffersScopeLost);
  const { run, pending, toast } = useCommandRunner(connected.refresh);
  const [declineReason, setDeclineReason] = useState("");

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="دعوت‌های مستقیم" />;

  const view = connected.state.data;
  const gateways = runtime.workspaceGateways;
  return (
    <>
      {toast}
      {view.error && (
        <ConnectedFamilyError error={view.error} label="دعوت‌های مستقیم">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="rh-profile-heading">
        <div>
          <h1>دعوت‌های مستقیم</h1>
          <p>{view.offers.length.toLocaleString("fa-IR")} دعوت برای این فضای کاری</p>
        </div>
      </header>
      <section className="rh-saved-grid" aria-label="دعوت‌های دریافتی">
        {view.offers.map((offer) => (
          <article className="rh-card rh-saved-card" key={offer.id}>
            <header>
              <div>
                <small>
                  <bdi dir="ltr">{offer.id}</bdi>
                </small>
                <h2>{offer.title}</h2>
                <p>
                  {offer.state} · مهلت پاسخ {formatDate(offer.response_deadline)}
                </p>
              </div>
            </header>
            <p>{offer.summary}</p>
            {offer.invitation_reasons.length > 0 && (
              <ul>
                {offer.invitation_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <div className="rh-profile-actions">
              {offer.state === "received" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      () => gateways!.directOffers.view(offer.id, offer.version),
                      "دعوت باز شد",
                    )
                  }
                >
                  مشاهده دعوت
                </button>
              )}
              {offer.state === "viewed" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      () => gateways!.directOffers.startResponse(offer.id, offer.version),
                      "پیش‌نویس پاسخ ساخته شد",
                    )
                  }
                >
                  شروع پاسخ
                </button>
              )}
              {offer.response && offer.response.state === "draft" && (
                <button
                  type="button"
                  disabled={pending || !offer.response.readiness.ready}
                  onClick={() =>
                    void run(
                      () => gateways!.directOffers.submitResponse(offer.id, offer.version),
                      "پاسخ ارسال شد",
                    )
                  }
                >
                  ارسال پاسخ
                </button>
              )}
              {["received", "viewed", "response_draft"].includes(offer.state) && (
                <>
                  <label>
                    <span className="sr-only">دلیل رد دعوت</span>
                    <input
                      value={declineReason}
                      onChange={(event) => setDeclineReason(event.target.value)}
                      placeholder="دلیل رد"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={pending || !declineReason.trim()}
                    onClick={() =>
                      void run(
                        () =>
                          gateways!.directOffers.decline(offer.id, {
                            expectedVersion: offer.version,
                            reason: declineReason.trim(),
                          }),
                        "دعوت رد شد",
                      )
                    }
                  >
                    رد دعوت
                  </button>
                </>
              )}
            </div>
            {offer.response && !offer.response.readiness.ready && (
              <ul aria-label="موارد ناقص پاسخ">
                {offer.response.readiness.issues.map((issue) => (
                  <li key={issue.path}>{issue.message}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {!view.offers.length && !view.error && (
          <div className="rh-profile-empty">
            <Icon name="search" />
            <h2>دعوت مستقیمی دریافت نکرده‌اید</h2>
          </div>
        )}
      </section>
    </>
  );
}
