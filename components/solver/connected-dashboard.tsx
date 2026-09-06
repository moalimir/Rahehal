"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedActionCard,
  ConnectedProfileCard,
} from "@/components/solver/connected-dashboard-cards";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedSolverDashboard } from "@/components/solver/use-connected-dashboard";
import { useActiveWorkspaceName } from "@/components/solver/use-connected";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import { proposalHref } from "@/lib/workspace/proposal-navigation";
import { membershipStateLabels } from "@/lib/workspace/state-labels";

/**
 * Each card links to the list already filtered to the states it counted, so a
 * number and the rows behind it can never disagree about what they mean.
 */
const metrics = [
  ["پیش‌نویس‌ها", "drafts", "decision", "draft"],
  ["ارسال‌شده‌ها", "submitted", "arrow", "submitted"],
  ["در حال بررسی", "inReview", "search", "reviewing"],
  ["نیازمند اقدام", "needsAction", "notification", "revision_requested"],
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
}

/** Dashboard composed exclusively from C1/C2/C3/C8 server projections. */
export function ConnectedSolverDashboard() {
  const runtime = useWebRuntime();
  const connected = useConnectedSolverDashboard();
  const workspaceName = useActiveWorkspaceName();

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="داشبورد حل‌کننده" />;

  const summary = connected.state.data;
  const rows = summary.proposalRows ?? [];
  const team = summary.team;
  const userName = runtime.me?.user.display_name ?? "حل‌کننده";
  const challengeTitle = (challengeId: string) => summary.challengeTitles.get(challengeId) ?? null;

  // The rows the human is expected to act on come first; everything else is
  // ordered by recency. A dashboard that lists a settled proposal above one
  // awaiting an answer buries the only row that needed attention.
  const actionable = rows.filter((row) =>
    ["draft", "revision_draft", "clarification_requested", "revision_requested"].includes(
      row.state,
    ),
  );
  const recent = [...rows].sort((left, right) => {
    const leftUrgent = actionable.includes(left) ? 1 : 0;
    const rightUrgent = actionable.includes(right) ? 1 : 0;
    return rightUrgent - leftUrgent || right.updated_at.localeCompare(left.updated_at);
  });

  return (
    <div className="rh-connected-dashboard">
      <section className="rh-dashboard-hero rh-connected-dashboard-hero">
        <div className="rh-connected-dashboard-hero__content">
          <small className="rh-dashboard-hero__context">
            <Icon name={team ? "people" : "user"} />
            {team ? "فضای تیمی فعال" : "فضای شخصی فعال"}
          </small>
          <h1>{team ? (workspaceName ?? team.name) : `سلام ${userName}`}</h1>
          <p>
            {summary.proposalRows === null
              ? "فهرست پیشنهادهای این فضای کاری خوانده نشد."
              : rows.length === 0
                ? "هنوز پیشنهادی در این فضای کاری ثبت نشده است. از فراخوان‌های منتشرشده شروع کنید."
                : actionable.length > 0
                  ? `${actionable.length.toLocaleString("fa-IR")} مورد از ${rows.length.toLocaleString("fa-IR")} پیشنهاد این فضا منتظر اقدام شماست.`
                  : `${rows.length.toLocaleString("fa-IR")} پیشنهاد در این فضای کاری دارید و اقدام بازی روی آن‌ها نیست.`}
          </p>
          <div className="rh-connected-dashboard-hero__actions">
            <Link className="rh-button rh-button--primary" href="/app/solver/opportunities">
              مشاهده فرصت‌های منتشرشده <Icon name="arrow" />
            </Link>
            <Link className="rh-button rh-button--secondary" href="/app/solver/proposals">
              راه‌حل‌های من
            </Link>
          </div>
        </div>
        <div className="rh-connected-dashboard-hero__summary" aria-label="خلاصه فضای کاری">
          <article>
            <span>همه پیشنهادها</span>
            <strong>{rows.length.toLocaleString("fa-IR")}</strong>
          </article>
          <article className={actionable.length > 0 ? "has-action" : ""}>
            <span>منتظر اقدام</span>
            <strong>{actionable.length.toLocaleString("fa-IR")}</strong>
          </article>
        </div>
      </section>

      {summary.failures.map((failure) => (
        <ConnectedFamilyError key={failure.family} error={failure.error} label={failure.family}>
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      ))}

      <div className="rh-dashboard-top rh-connected-dashboard-top">
        <ConnectedProfileCard
          profile={summary.profile}
          userName={userName}
          workspaceName={workspaceName ?? "فضای کاری"}
          href="/app/solver/profile"
        />
        <ConnectedActionCard rows={rows} titles={summary.challengeTitles} />
      </div>

      {team && (
        <section
          className="rh-card rh-membership-list rh-connected-team-summary"
          aria-label="وضعیت تیم"
        >
          <header>
            <div>
              <h2>تیم شما</h2>
              <p>
                {team.members.length.toLocaleString("fa-IR")} عضو ثبت‌شده · نسخه{" "}
                {team.version.toLocaleString("fa-IR")}
              </p>
            </div>
            <Link href="/app/solver/teams">مدیریت تیم</Link>
          </header>
          {team.members.slice(0, 4).map((member) => (
            <article key={member.id}>
              <div>
                <small>{membershipStateLabels[member.state]}</small>
                <h3>{member.display_name}</h3>
                <p>{TEAM_ROLE_LABELS[member.role]}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="rh-card rh-metrics-card rh-connected-metrics-card">
        <header>
          <div>
            <small>نمای وضعیت</small>
            <h2>خلاصه راه‌حل‌ها</h2>
          </div>
          <span>{workspaceName ?? "فضای کاری فعال"}</span>
        </header>
        {summary.proposals ? (
          <div>
            {metrics.map(([label, field, icon, status], index) => (
              <article key={field} className={`tone-${index}`}>
                <span className="rh-connected-metric__icon">
                  <Icon name={icon} />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>{summary.proposals![field].toLocaleString("fa-IR")}</strong>
                </div>
                <Link
                  href={`/app/solver/proposals?status=${status}`}
                  aria-label={`مشاهده ${label}`}
                >
                  <Icon name="arrow" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p>خلاصه پیشنهادها در دسترس نیست.</p>
        )}
      </section>

      <section className="rh-card rh-membership-list rh-connected-recent-proposals">
        <header>
          <div>
            <h2>پیشنهادهای اخیر</h2>
            <p>
              {summary.unreadNotifications === null
                ? "شمار اعلان‌ها خوانده نشد"
                : `${summary.unreadNotifications.toLocaleString("fa-IR")} اعلان خوانده‌نشده`}
            </p>
          </div>
          <Link href="/app/solver/notifications">مشاهده اعلان‌ها</Link>
        </header>
        {recent.slice(0, 4).map((row) => {
          const title = challengeTitle(row.challenge_id);
          return (
            <article key={row.id} className={actionable.includes(row) ? "is-unread" : ""}>
              <div>
                <small>
                  {row.tracking_code ? (
                    <>
                      <bdi dir="ltr">{row.tracking_code}</bdi> ·{" "}
                    </>
                  ) : null}
                  {formatDate(row.updated_at)}
                </small>
                <h3>{title ?? "فراخوان بدون عنوان عمومی"}</h3>
                <p>{proposalStateLabels[row.state]}</p>
              </div>
              <Link href={proposalHref(`/app/solver/proposals/${row.id}/preview`)}>
                مشاهده پرونده
              </Link>
            </article>
          );
        })}
        {summary.proposalRows && rows.length === 0 && (
          <div className="rh-connected-dashboard-empty">
            <Icon name="search" />
            <h3>هنوز پیشنهادی در این فضا ندارید</h3>
            <p>یک فراخوان منتشرشده را باز کنید و اولین پیش‌نویس خود را بسازید.</p>
            <Link href="/app/solver/opportunities">مشاهده فراخوان‌ها</Link>
          </div>
        )}
      </section>
    </div>
  );
}
