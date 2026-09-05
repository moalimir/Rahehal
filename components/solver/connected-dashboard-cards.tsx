"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import type { ProposalListResource, SolverWorkspaceProfileResource } from "@rahhal/contracts";
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
    <section className="rh-card rh-profile-card">
      <div className="rh-profile-card__head">
        <PersonAvatar name={userName} className="rh-avatar rh-avatar--large" />
        <div>
          <small>{team ? "پروفایل تیم" : "پروفایل حرفه‌ای"}</small>
          <h2>{team ? workspaceName : userName}</h2>
          <p>{profile?.headline || "هنوز عنوانی برای این پروفایل ثبت نشده است."}</p>
        </div>
      </div>
      {/* The server reports readiness as ready plus a list of what is missing,
          not as a percentage. Showing the outstanding count is the honest
          rendering of that; a progress bar here would be a number nothing
          produced. */}
      <div className="rh-progress-label">
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
        <ul className="rh-skill-row">
          {issues.slice(0, 3).map((issue) => (
            <li key={issue.path}>{issue.message}</li>
          ))}
        </ul>
      )}
      <div className="rh-skill-row">
        {(profile?.expertise ?? []).slice(0, 2).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <Link className="rh-button rh-button--ghost" href={href}>
        تکمیل پروفایل
      </Link>
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
    <section className="rh-card rh-action-card">
      <header>
        <h2>اقدام‌های موردنیاز شما</h2>
      </header>
      {actionable.length === 0 ? (
        <p>
          {rows.length === 0
            ? "هنوز پیشنهادی در این فضای کاری ندارید. از صفحه فرصت‌ها شروع کنید."
            : "اقدام بازی روی پیشنهادهای شما نیست."}
        </p>
      ) : (
        <ul>
          {actionable.slice(0, 3).map((row) => {
            const title = titles.get(row.challenge_id);
            return (
              <li key={row.id}>
                <Link href={proposalHref(`/app/solver/proposals/${row.id}/edit`)}>
                  {title ? (
                    <>ادامه «{title}»</>
                  ) : (
                    <>
                      ادامه پرونده <bdi dir="ltr">{row.tracking_code ?? row.id}</bdi>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link className="rh-button rh-button--ghost" href="/app/solver/proposals">
        مشاهده همه پیشنهادها
      </Link>
    </section>
  );
}
