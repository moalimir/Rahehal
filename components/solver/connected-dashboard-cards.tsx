"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import type { ProposalListResource, SolverWorkspaceProfileResource } from "@rahhal/contracts";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import { proposalHref } from "@/lib/workspace/proposal-navigation";

/**
 * The active workspace's profile card.
 *
 * In network mode every fact here is the C1 profile for the workspace the
 * session is actually in. It previously rendered the demo repository's person
 * -- a name, a headline, and a "100% complete" bar belonging to someone else --
 * under a live session, which is the exact fake-identity failure C9 removes.
 */
export function ConnectedProfileCard({
  profile,
  userName,
  workspaceName,
  href,
}: {
  profile: SolverWorkspaceProfileResource | null;
  userName: string;
  workspaceName: string;
  href: string;
}) {
  const team = profile?.workspace_kind === "team";
  const issues = profile?.readiness.issues ?? [];
  return (
    <section className="rh-card rh-connected-dashboard-card rh-connected-profile-card">
      <header className="rh-connected-dashboard-card__head">
        <span className="rh-connected-dashboard-card__icon">
          <Icon name={team ? "people" : "user"} />
        </span>
        <div>
          <small>{team ? "پروفایل تیم" : "پروفایل حرفه‌ای"}</small>
          <h2>آمادگی برای همکاری</h2>
        </div>
      </header>
      <div className="rh-connected-profile-card__identity">
        <PersonAvatar name={userName} className="rh-avatar rh-avatar--large" />
        <div>
          <h2>{team ? workspaceName : userName}</h2>
          <p>{profile?.headline || "هنوز عنوانی برای این پروفایل ثبت نشده است."}</p>
        </div>
      </div>
      {/* The server reports readiness as ready plus a list of what is missing,
          not as a percentage. Showing the outstanding count is the honest
          rendering of that; a progress bar here would be a number nothing
          produced. */}
      <div className="rh-connected-profile-card__readiness">
        <span>
          {profile === null
            ? "وضعیت پروفایل در دسترس نیست"
            : profile.readiness.ready
              ? "پروفایل کامل است"
              : `${issues.length.toLocaleString("fa-IR")} مورد برای تکمیل پروفایل مانده است`}
        </span>
        {profile?.readiness.ready && <Icon name="check" />}
      </div>
      {issues.length > 0 && (
        <ul className="rh-connected-profile-card__issues">
          {issues.slice(0, 3).map((issue) => (
            <li key={issue.path}>{issue.message}</li>
          ))}
        </ul>
      )}
      <div className="rh-connected-profile-card__skills" aria-label="تخصص‌های ثبت‌شده">
        {(profile?.expertise ?? []).slice(0, 2).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <footer>
        <Link className="rh-button rh-button--ghost" href={href}>
          {profile?.readiness.ready ? "مشاهده پروفایل" : "تکمیل پروفایل"}
          <Icon name="arrow" />
        </Link>
      </footer>
    </section>
  );
}

/**
 * The next actions for the active workspace, derived from live proposal state.
 *
 * The demo card names fixture proposals like `PR-116`; under a live session
 * those are records the workspace does not have. This lists only what the
 * server actually returned, and says so plainly when there is nothing.
 */
export function ConnectedActionCard({
  rows,
  titles,
}: {
  rows: ProposalListResource["items"];
  /** Published challenge titles, so this names a call the way the rest of the product does. */
  titles: ReadonlyMap<string, string>;
}) {
  const actionable = rows.filter((row) =>
    ["draft", "revision_draft", "clarification_requested", "revision_requested"].includes(
      row.state,
    ),
  );
  return (
    <section className="rh-card rh-connected-dashboard-card rh-connected-action-card">
      <header className="rh-connected-dashboard-card__head">
        <span className="rh-connected-dashboard-card__icon is-amber">
          <Icon name="notification" />
        </span>
        <div>
          <small>صف اقدام</small>
          <h2>اقدام‌های موردنیاز شما</h2>
        </div>
        <strong className="rh-connected-action-card__count">
          {actionable.length.toLocaleString("fa-IR")}
        </strong>
      </header>
      {actionable.length === 0 ? (
        <div className="rh-connected-action-card__empty">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <strong>{rows.length === 0 ? "هنوز اقدامی ساخته نشده" : "همه‌چیز به‌روز است"}</strong>
            <p>
              {rows.length === 0
                ? "با شروع یک پیشنهاد، کارهای بعدی آن اینجا نمایش داده می‌شود."
                : "در حال حاضر پرونده‌ای منتظر پاسخ یا اصلاح شما نیست."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="rh-connected-action-card__list">
          {actionable.slice(0, 3).map((row) => {
            const title = titles.get(row.challenge_id);
            return (
              <li key={row.id}>
                <span>
                  <Icon name="arrow" />
                </span>
                <Link href={proposalHref(`/app/solver/proposals/${row.id}/edit`)}>
                  <strong>{title ? `ادامه «${title}»` : "ادامه پرونده"}</strong>
                  <small>
                    {proposalStateLabels[row.state]}
                    {/* A draft has no tracking code yet. Falling back to the
                        routing key printed 32 hex characters where a human
                        reference belongs, which is the pattern `RecordReference`
                        exists to prevent. */}
                    {row.tracking_code ? (
                      <>
                        {" · "}
                        <bdi dir="ltr">{row.tracking_code}</bdi>
                      </>
                    ) : null}
                  </small>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <footer>
        <Link className="rh-button rh-button--ghost" href="/app/solver/proposals">
          مشاهده همه پیشنهادها <Icon name="arrow" />
        </Link>
      </footer>
    </section>
  );
}
