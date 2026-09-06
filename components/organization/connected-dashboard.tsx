"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import type { ChallengeRecord } from "@/domain/challenge";
import type { OrganizationProposalInboxItemResource } from "@rahhal/contracts";
import { challengeHref } from "@/lib/challenges/navigation";
import { challengeStatusLabels } from "@/domain/challenge";
import { proposalHref } from "@/lib/workspace/proposal-navigation";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";

type DashboardState = {
  challenges: readonly ChallengeRecord[] | null;
  proposals: readonly OrganizationProposalInboxItemResource[] | null;
  unread: number | null;
  errors: readonly string[];
};

/** Organization dashboard composed only from the active workspace's live reads. */
export function ConnectedOrganizationDashboard() {
  const runtime = useWebRuntime();
  const [state, setState] = useState<DashboardState | null>(null);

  const load = useCallback(async () => {
    const workspace = runtime.workspaceGateways;
    if (!workspace) return;
    setState(null);
    const [challenges, proposals, notifications] = await Promise.all([
      runtime.challengeGateway.queries.list(),
      workspace.organizationProposals.inbox(),
      workspace.notifications.summary(),
    ]);
    const errors: string[] = [];
    if (!challenges.ok) errors.push(challenges.error.message);
    if (!proposals.ok) errors.push(proposals.error.message);
    if (!notifications.ok) errors.push(notifications.error.message);
    setState({
      challenges: challenges.ok ? challenges.data : null,
      proposals: proposals.ok ? proposals.data.items : null,
      unread: notifications.ok ? notifications.data.unread_count : null,
      errors,
    });
  }, [runtime.challengeGateway, runtime.workspaceGateways]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state)
    return (
      <div className="org-workspace-page">
        <section className="rh-card rh-profile-empty" aria-busy="true">
          <span className="sr-only">در حال خواندن داشبورد سازمان</span>
          <div className="route-fallback__skeleton" aria-hidden="true" />
        </section>
      </div>
    );

  const activeChallenges =
    state.challenges?.filter((challenge) => challenge.status === "published") ?? [];
  return (
    <div className="org-workspace-page">
      <header className="rh-profile-heading">
        <div>
          <small>فضای سازمانی فعال</small>
          <h1>سلام {runtime.me?.user.display_name ?? "همکار گرامی"}</h1>
          <p>این خلاصه از مسئله‌ها، پیشنهادها و اعلان‌های همین فضای کاری خوانده می‌شود.</p>
        </div>
        <Link className="org-button org-button--primary" href="/app/org/challenges/new">
          <Icon name="plus" /> ثبت مسئله جدید
        </Link>
      </header>

      {state.errors.length > 0 && (
        <section className="challenge-inline-error" role="status">
          <p>{state.errors.join(" · ")}</p>
          <button type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </section>
      )}

      <section className="org-metrics" aria-label="خلاصه وضعیت سازمان">
        <article className="org-metric">
          <span>
            <Icon name="brief" />
          </span>
          <div>
            <small>همه مسئله‌ها</small>
            <strong>{state.challenges?.length.toLocaleString("fa-IR") ?? "—"}</strong>
            <p>در فضای سازمانی فعال</p>
          </div>
        </article>
        <article className="org-metric">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <small>فراخوان فعال</small>
            <strong>
              {state.challenges ? activeChallenges.length.toLocaleString("fa-IR") : "—"}
            </strong>
            <p>منتشرشده و قابل دریافت</p>
          </div>
        </article>
        <article className="org-metric org-metric--violet">
          <span>
            <Icon name="decision" />
          </span>
          <div>
            <small>پیشنهاد دریافتی</small>
            <strong>{state.proposals?.length.toLocaleString("fa-IR") ?? "—"}</strong>
            <p>نسخه‌های قفل‌شده</p>
          </div>
        </article>
        <article className="org-metric org-metric--amber">
          <span>
            <Icon name="notification" />
          </span>
          <div>
            <small>اعلان خوانده‌نشده</small>
            <strong>{state.unread?.toLocaleString("fa-IR") ?? "—"}</strong>
            <p>نیازمند مرور</p>
          </div>
        </article>
      </section>

      <div className="org-dashboard-grid">
        <section className="org-card org-card--wide">
          <header className="org-card__head">
            <div>
              <h2>پیشنهادهای تازه</h2>
              <p>آخرین نسخه‌های رسیده به این سازمان</p>
            </div>
            <Link href="/app/org/proposals">مشاهده همه</Link>
          </header>
          <div className="org-action-list">
            {state.proposals?.slice(0, 5).map((proposal) => (
              <article key={proposal.id}>
                <span className="rh-action-icon">
                  <Icon name="decision" />
                </span>
                <div>
                  <strong>
                    <bdi dir="ltr">{proposal.tracking_code}</bdi>
                  </strong>
                  <small>
                    {/* The organization's own challenges are already loaded on
                        this page, so the call a proposal answers can be named
                        rather than printed as an opaque id. */}
                    {state.challenges?.find((challenge) => challenge.id === proposal.challenge_id)
                      ?.title || "فراخوان این سازمان"}{" "}
                    · {proposalStateLabels[proposal.state]}
                  </small>
                </div>
                <Link href={proposalHref(`/app/org/proposals/${proposal.id}`)}>مشاهده پرونده</Link>
              </article>
            ))}
            {state.proposals && state.proposals.length === 0 && (
              <p>هنوز پیشنهادی دریافت نشده است.</p>
            )}
          </div>
        </section>
        <section className="org-card">
          <header className="org-card__head">
            <div>
              <h2>مسئله‌های اخیر</h2>
              <p>وضعیت واقعی پرونده‌ها</p>
            </div>
          </header>
          <div className="org-health-list">
            {state.challenges?.slice(0, 5).map((challenge) => (
              <article key={challenge.id}>
                <div>
                  <strong>{challenge.title || "پیش‌نویس بدون عنوان"}</strong>
                  <small>{challengeStatusLabels[challenge.status]}</small>
                </div>
                <Link href={challengeHref(`/app/org/challenges/${challenge.id}/overview`)}>
                  بازکردن
                </Link>
              </article>
            ))}
            {state.challenges && state.challenges.length === 0 && (
              <p>هنوز مسئله‌ای ثبت نشده است.</p>
            )}
          </div>
          <Link className="org-text-link" href="/app/org/challenges">
            مشاهده همه مسئله‌ها
          </Link>
        </section>
      </div>
    </div>
  );
}
