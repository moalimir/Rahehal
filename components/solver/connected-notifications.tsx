"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type { NotificationKind } from "@rahhal/domain";
import type { GatewayResult } from "@/lib/api/result";
import {
  notificationsScopeLost,
  readNotifications,
  type NotificationView,
} from "@/lib/workspace/notification-view";

/**
 * What each projected event means to the human reading it.
 *
 * The projection deliberately stores no title or body — copying aggregate text
 * into a notification row is how confidential content leaks into a second
 * table — so the wording lives here and the row carries only its kind.
 */
const kindLabels: Record<NotificationKind, string> = {
  "proposal.submitted": "پیشنهاد تازه‌ای ارسال شد",
  "proposal.eligible": "پیشنهاد واجد شرایط شناخته شد",
  "proposal.ineligible": "پیشنهاد فاقد شرایط شناخته شد",
  "proposal.clarification.requested": "سازمان درخواست شفاف‌سازی کرد",
  "proposal.clarification.submitted": "پاسخ شفاف‌سازی ثبت شد",
  "proposal.revision.requested": "اصلاح پیشنهاد درخواست شد",
  "proposal.resubmitted": "نسخه اصلاح‌شده ارسال شد",
  "team.invitation.sent": "دعوت به تیم دریافت شد",
  "team.invitation.accepted": "دعوت تیم پذیرفته شد",
  "team.invitation.declined": "دعوت تیم رد شد",
  "team.membership-request.created": "درخواست عضویت تازه‌ای ثبت شد",
  "team.membership-request.accepted": "درخواست عضویت پذیرفته شد",
  "team.membership-request.rejected": "درخواست عضویت رد شد",
  "direct-offer.sent": "دعوت مستقیم دریافت شد",
  "direct-offer.response.submitted": "پاسخ دعوت مستقیم ارسال شد",
  "direct-offer.negotiation.started": "مذاکره دعوت مستقیم آغاز شد",
  "direct-offer.declined": "دعوت مستقیم رد شد",
  "direct-offer.cancelled": "دعوت مستقیم لغو شد",
  "direct-offer.expired": "مهلت دعوت مستقیم گذشت",
};

/**
 * Where a notification points, for the persona reading it.
 *
 * The link is a normal authorized route, not a minted capability: opening it
 * re-checks access at that moment rather than trusting the access the
 * projection saw when the row was written.
 */
function deepLink(
  subjectType: NotificationView["items"][number]["subject_type"],
  subjectId: string,
  persona: "solver" | "org",
): string | null {
  if (subjectType === "proposal")
    return persona === "org"
      ? `/app/org/proposals/${subjectId}`
      : `/app/solver/proposals/${subjectId}/preview`;
  if (subjectType === "team") return "/app/solver/teams";
  if (subjectType === "direct_offer")
    return persona === "org" ? "/app/org/invitations" : "/app/solver/received";
  return null;
}

export function ConnectedNotifications({ persona }: { persona: "solver" | "org" }) {
  const runtime = useWebRuntime();
  const connected = useConnectedFamily(readNotifications, notificationsScopeLost);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="اعلان‌ها" />;

  const view = connected.state.data;
  const gateways = runtime.workspaceGateways;
  const run = async (command: () => Promise<GatewayResult<unknown>>) => {
    setPending(true);
    const result = await command();
    setPending(false);
    if (result.ok) {
      connected.refresh();
      return;
    }
    setNotice(result.error.message);
  };

  const visible = filter === "unread" ? view.items.filter((item) => !item.read_at) : view.items;

  return (
    <>
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="notification" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
      {view.error && (
        <ConnectedFamilyError error={view.error} label="اعلان‌ها">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="rh-profile-heading">
        <div>
          <h1>اعلان‌های این فضای کاری</h1>
          <p>{view.unreadCount.toLocaleString("fa-IR")} اعلان خوانده‌نشده</p>
        </div>
        <button
          type="button"
          disabled={pending || view.unreadCount === 0}
          onClick={() => void run(() => gateways!.notifications.markAllRead())}
        >
          خواندن همه
        </button>
      </header>
      <div className="rh-proposal-tabs" role="tablist" aria-label="فیلتر اعلان‌ها">
        {(
          [
            ["all", "همه"],
            ["unread", "خوانده‌نشده"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "is-active" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="rh-card rh-membership-list">
        {visible.map((item) => {
          const href = deepLink(item.subject_type, item.subject_id, persona);
          return (
            <article className={!item.read_at ? "is-unread" : ""} key={item.id}>
              <div>
                <small>
                  {new Intl.DateTimeFormat("fa-IR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.occurred_at))}
                </small>
                <h3>{kindLabels[item.kind] ?? item.kind}</h3>
                <p>
                  <bdi dir="ltr">{item.subject_id}</bdi>
                </p>
              </div>
              <div className="rh-membership-actions">
                {href && (
                  <Link
                    href={href}
                    onClick={() =>
                      item.read_at
                        ? undefined
                        : void run(() => gateways!.notifications.markRead(item.id))
                    }
                  >
                    مشاهده رکورد
                  </Link>
                )}
                {!item.read_at && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void run(() => gateways!.notifications.markRead(item.id))}
                  >
                    علامت‌گذاری خوانده‌شده
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!visible.length && !view.error && (
          <div className="rh-profile-empty">
            <Icon name="notification" />
            <h2>{filter === "unread" ? "اعلان خوانده‌نشده‌ای ندارید" : "اعلانی ثبت نشده است"}</h2>
          </div>
        )}
      </section>
    </>
  );
}
