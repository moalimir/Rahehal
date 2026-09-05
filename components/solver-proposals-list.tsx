"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { useSolverContext } from "@/components/solver-shell";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useActiveWorkspaceName, useConnectedFamily } from "@/components/solver/use-connected";
import { getChallengePublisher } from "@/data/challenge-publishers";
import { challenges } from "@/data/mock";
import type { Proposal, ProposalState, SolverState } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import {
  proposalsForWorkspace,
  readSolverState,
  subscribeSolverState,
} from "@/lib/solver/repository";
import { proposalStateLabels as labels } from "@/lib/workspace/proposal-labels";
import { proposalHref } from "@/lib/workspace/proposal-navigation";
import { proposalRecordScopeLost, readProposalRecord } from "@/lib/workspace/proposal-record";
import {
  proposalListScopeLost,
  readProposalList,
  type ProposalRow,
} from "@/lib/workspace/proposal-rows";

// Loaded on demand: the connected record is unreachable in demo mode, and an
// eager import puts it in the shared demo bundle the budgets refuse.
const ConnectedProposalDetail = dynamic(
  () =>
    import("@/components/solver/connected-proposal-detail").then(
      (module) => module.ConnectedProposalDetail,
    ),
  {
    loading: () => (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بارگذاری پرونده پیشنهاد</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    ),
  },
);

const actionStates = new Set<ProposalState>([
  "draft",
  "clarification_requested",
  "revision_requested",
  "revision_draft",
]);

const statusGroups: Record<string, ProposalState[]> = {
  draft: ["draft", "revision_draft"],
  submitted: ["submitted", "resubmitted", "clarification_submitted"],
  reviewing: ["eligibility_review", "eligible", "reviewing"],
  revision_requested: ["revision_requested", "clarification_requested"],
};

function initialQuery(name: string) {
  if (typeof window === "undefined") return "";
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get(name) ?? "";
}

function workspaceLabel(state: SolverState, workspaceId: string) {
  return workspaceId === state.personalWorkspace.id
    ? state.personalWorkspace.name
    : (state.teams.find((team) => team.workspaceId === workspaceId)?.name ?? workspaceId);
}

/**
 * The demo projection rendered through the same row the server produces, so
 * the list has one render path. The fixture publisher and title stay on this
 * side of the boundary: a connected row carries neither.
 */
function demoRow(proposal: Proposal, state: SolverState): ProposalRow {
  const version = state.proposalVersions.find((item) => item.id === proposal.currentVersionId);
  return {
    id: proposal.id,
    challengeId: proposal.challengeId,
    challengeTitle: challenges.find((item) => item.id === proposal.challengeId)?.title ?? null,
    publisherName: getChallengePublisher(proposal.challengeId).name,
    state: proposal.state,
    updatedAt: proposal.updatedAt,
    versionNumber: version?.number ?? 1,
    trackingCode: proposal.trackingCode ?? null,
    ready: false,
  };
}

export function SolverProposalsList() {
  const context = useSolverContext();
  const [state, setState] = useState<SolverState>(() => readSolverState());
  const [query, setQuery] = useState(() => initialQuery("q"));
  const [status, setStatus] = useState(() => initialQuery("status") || "all");
  const [sort, setSort] = useState(() => initialQuery("sort") || "action");
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  useEffect(() => {
    const syncFromLocation = () => {
      setQuery(initialQuery("q"));
      setStatus(initialQuery("status") || "all");
      setSort(initialQuery("sort") || "action");
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = buildSolverHref("/app/solver/proposals", context, {
      q: query || undefined,
      status: status === "all" ? undefined : status,
      sort: sort === "action" ? undefined : sort,
    });
    if (document.documentElement.dataset.challengeStandalone === "true")
      window.history.replaceState({}, "", `#${next}`);
    else window.history.replaceState({}, "", next);
  }, [context, query, sort, status]);
  // Connected runtime: rows come from the server for the active workspace.
  // The demo projection below is reached only in demo mode, so a network
  // session can never fall through to a fixture row while the read is pending.
  const connected = useConnectedFamily(readProposalList, proposalListScopeLost);
  const liveWorkspaceName = useActiveWorkspaceName();
  const activeWorkspaceName = liveWorkspaceName ?? workspaceLabel(state, context.workspaceId);
  const demoProposals = useMemo(
    () =>
      connected.state.kind === "demo"
        ? proposalsForWorkspace(context.workspaceId, state).map((proposal) =>
            demoRow(proposal, state),
          )
        : [],
    [connected.state.kind, context.workspaceId, state],
  );
  const liveError = connected.state.kind === "ready" ? connected.state.data.error : null;
  const proposals: readonly ProposalRow[] =
    connected.state.kind === "ready" ? connected.state.data.rows : demoProposals;
  const visible = useMemo(() => {
    const rows = proposals.filter((proposal) => {
      const selectedStates = statusGroups[status];
      return (
        (status === "all" ||
          (selectedStates ? selectedStates.includes(proposal.state) : proposal.state === status)) &&
        `${proposal.id} ${proposal.challengeTitle ?? ""} ${proposal.publisherName ?? ""}`.includes(
          query.trim(),
        )
      );
    });
    return [...rows].sort((a, b) => {
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "id") return a.id.localeCompare(b.id);
      return (
        Number(actionStates.has(b.state)) - Number(actionStates.has(a.state)) ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    });
  }, [proposals, query, sort, status]);
  const count = (states: ProposalState[]) =>
    proposals.filter((proposal) => states.includes(proposal.state)).length;
  const tabs: Array<[string, string, number]> = [
    ["all", "همه", proposals.length],
    ["draft", "پیش‌نویس", count(["draft", "revision_draft"])],
    ["submitted", "ارسال‌شده", count(["submitted", "resubmitted", "clarification_submitted"])],
    ["reviewing", "در حال بررسی", count(["eligibility_review", "eligible", "reviewing"])],
    [
      "revision_requested",
      "نیازمند اقدام",
      count(["revision_requested", "clarification_requested"]),
    ],
  ];

  // `demo` and `ready` both render the list below; the other three states are
  // the shared fallback. Checking the kind rather than the returned element
  // matters: a JSX element is always truthy even when the component renders
  // null, so testing the element would blank the page in demo mode.
  if (connected.state.kind !== "ready" && connected.state.kind !== "demo")
    return <ConnectedFamilyFallback state={connected.state} label="پیشنهادها" />;

  return (
    <>
      {liveError && (
        <ConnectedFamilyError error={liveError} label="فهرست پیشنهادها">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="rh-profile-heading">
        <div>
          <small>{activeWorkspaceName}</small>
          <h1>پیشنهادها و پرونده‌های {context.type === "team" ? "تیم" : "من"}</h1>
          <p>هر ردیف از proposal canonical همان workspace ساخته و به شناسه خودش متصل می‌شود.</p>
        </div>
        <Link
          className="rh-profile-outline"
          href={buildSolverHref("/app/solver/opportunities", context)}
        >
          فرصت‌های قابل اقدام <Icon name="arrow" />
        </Link>
      </header>
      <section className="rh-summary-grid" aria-label="خلاصه وضعیت پیشنهادها">
        {[
          ["پیش‌نویس‌ها", count(["draft", "revision_draft"]), "brief"],
          ["ارسال‌شده‌ها", count(["submitted", "resubmitted", "clarification_submitted"]), "arrow"],
          ["در حال بررسی", count(["eligibility_review", "eligible", "reviewing"]), "search"],
          [
            "نیازمند اقدام",
            count(["revision_requested", "clarification_requested"]),
            "notification",
          ],
        ].map(([label, value, icon]) => (
          <article className="rh-card" key={String(label)}>
            <span>
              <Icon name={icon as "brief"} />
            </span>
            <div>
              <small>{label}</small>
              <strong>{Number(value).toLocaleString("fa-IR")}</strong>
            </div>
          </article>
        ))}
      </section>
      <section className="rh-card rh-profile-filters">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی پیشنهادها</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو در عنوان فرصت، سازمان یا شناسه"
          />
        </label>
        <label>
          <span className="sr-only">مرتب‌سازی</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="action">نیازمند اقدام</option>
            <option value="updated">آخرین تغییر</option>
            <option value="id">شناسه</option>
          </select>
        </label>
        <button
          type="button"
          className="rh-profile-outline"
          disabled={!query && status === "all" && sort === "action"}
          onClick={() => {
            setQuery("");
            setStatus("all");
            setSort("action");
          }}
        >
          <Icon name="filter" /> پاک‌کردن فیلترها
        </button>
      </section>
      <div className="rh-proposal-tabs" role="tablist" aria-label="فیلتر وضعیت پیشنهادها">
        {tabs.map(([value, label, countValue]) => (
          <button
            role="tab"
            aria-selected={status === value}
            className={status === value ? "is-active" : ""}
            key={value}
            onClick={() => setStatus(value)}
          >
            {label} <b>{countValue.toLocaleString("fa-IR")}</b>
          </button>
        ))}
      </div>
      <section className="rh-card rh-worklist" aria-label="فهرست پیشنهادها">
        <header className="rh-worklist__header">
          <div>
            <h2>پرونده‌های پیشنهاد</h2>
            <p>{visible.length.toLocaleString("fa-IR")} مورد متناسب با فیلترها</p>
          </div>
        </header>
        {visible.map((proposal) => {
          const editable = [
            "draft",
            "revision_requested",
            "revision_draft",
            "clarification_requested",
          ].includes(proposal.state);
          return (
            <article
              className={`rh-work-item ${actionStates.has(proposal.state) ? "is-urgent" : ""}`}
              key={proposal.id}
            >
              <div className="rh-work-item__identity">
                {proposal.publisherName && (
                  <span className="rh-work-item__logo">
                    <ChallengeOrganizationLogo challengeId={proposal.challengeId} size="small" />
                  </span>
                )}
                <div>
                  <strong>
                    {proposal.challengeTitle ?? (
                      <>
                        فرصت <bdi dir="ltr">{proposal.challengeId}</bdi>
                      </>
                    )}
                  </strong>
                  <small>
                    {proposal.publisherName ? `${proposal.publisherName} · ` : ""}
                    <bdi dir="ltr">{proposal.id}</bdi>
                  </small>
                </div>
              </div>
              <div className="rh-work-item__status">
                <small>وضعیت پرونده</small>
                <span className="rh-status rh-status--info">{labels[proposal.state]}</span>
              </div>
              <dl className="rh-work-item__facts">
                <div>
                  <dt>آخرین تغییر</dt>
                  <dd>
                    <time dateTime={proposal.updatedAt}>
                      {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
                        new Date(proposal.updatedAt),
                      )}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>نسخه جاری</dt>
                  <dd>{proposal.versionNumber.toLocaleString("fa-IR")}</dd>
                </div>
                <div>
                  <dt>کد پیگیری</dt>
                  <dd>
                    {proposal.trackingCode ? (
                      <bdi dir="ltr">{proposal.trackingCode}</bdi>
                    ) : (
                      "تا ارسال نهایی صادر نمی‌شود"
                    )}
                  </dd>
                </div>
              </dl>
              <div className="rh-work-item__next">
                <small>اقدام بعدی</small>
                <Link
                  href={proposalHref(
                    buildSolverHref(
                      `/app/solver/proposals/${proposal.id}/${editable ? "edit" : "preview"}`,
                      context,
                    ),
                  )}
                >
                  {editable ? "ادامه پرونده" : "مشاهده نسخه قفل‌شده"} <Icon name="arrow" />
                </Link>
              </div>
            </article>
          );
        })}
        {!visible.length && (
          <div className="rh-profile-empty">
            <Icon name="search" />
            <h2>
              {proposals.length ? "موردی با این فیلتر پیدا نشد" : "هنوز پیشنهادی در این فضا ندارید"}
            </h2>
            <p>
              {proposals.length
                ? "فیلترها را پاک کنید."
                : "از صفحه فرصت‌ها یک پیش‌نویس تازه بسازید."}
            </p>
            {proposals.length ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                پاک‌کردن فیلترها
              </button>
            ) : (
              <Link href={buildSolverHref("/app/solver/opportunities", context)}>
                مشاهده فرصت‌ها
              </Link>
            )}
          </div>
        )}
        <footer className="rh-worklist__footer">
          <span>
            نمایش همه {visible.length.toLocaleString("fa-IR")} مورد؛ صفحه‌بندی نمایشی حذف شده است.
          </span>
        </footer>
      </section>
    </>
  );
}

export function SolverProposalDetail({ proposalId }: { proposalId: string }) {
  const connected = useConnectedFamily(
    // The read closes over the record id, so the hook is told the id: without
    // it, opening a second proposal would keep showing the first one's content.
    useMemo(() => readProposalRecord(proposalId), [proposalId]),
    proposalRecordScopeLost,
    proposalId,
  );
  if (connected.state.kind === "demo") return <DemoProposalDetail proposalId={proposalId} />;
  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="این پیشنهاد" />;
  return <ConnectedProposalDetail view={connected.state.data} />;
}

function DemoProposalDetail({ proposalId }: { proposalId: string }) {
  const context = useSolverContext();
  const state = readSolverState();
  const proposal = proposalsForWorkspace(context.workspaceId, state).find(
    (item) => item.id === proposalId,
  );
  if (!proposal)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>پیشنهاد پیدا نشد یا به این فضای کاری تعلق ندارد</h1>
      </section>
    );
  const challenge = challenges.find((item) => item.id === proposal.challengeId);
  const current = state.proposalVersions.find((item) => item.id === proposal.currentVersionId);
  const versions = state.proposalVersions
    .filter((item) => item.proposalId === proposal.id)
    .sort((a, b) => a.number - b.number);
  const caseRecord = state.cases.find((item) => item.proposalId === proposal.id);
  const actionable = ["clarification_requested", "revision_requested", "revision_draft"].includes(
    proposal.state,
  );
  if (!current)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="notification" />
        <h1>نسخه جاری این پیشنهاد در دسترس نیست</h1>
      </section>
    );
  const fields: Array<[string, string | string[]]> = [
    ["بیان مسئله", current.content.problemStatement],
    ["ارزش پیشنهادی", current.content.valueProposition],
    ["رویکرد فنی", current.content.technicalApproach],
    ["معماری راهکار", current.content.architecture],
    ["معیارهای موفقیت", current.content.successMetrics],
    ["نقشه راه", current.content.roadmap],
    ["ریسک‌ها", current.content.risks],
    ["تیم اجرا", current.content.teamSummary],
    ["فناوری‌ها", current.content.technologies],
  ];
  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href={buildSolverHref("/app/solver/proposals", context)}>پیشنهادها</Link>
            <span>/</span>
            <span>
              <bdi dir="ltr">{proposal.id}</bdi>
            </span>
          </nav>
          <h1>{current.content.title || challenge?.title || `پیشنهاد ${proposal.id}`}</h1>
          <p>
            {workspaceLabel(state, proposal.ownerWorkspaceId)} · {labels[proposal.state]}
          </p>
        </div>
        <div className="rh-profile-actions">
          <Link
            className="rh-profile-outline"
            href={buildSolverHref(
              `/app/solver/opportunities/${challenge?.slug ?? proposal.challengeId}`,
              context,
            )}
          >
            مشاهده فرصت
          </Link>
          {actionable && (
            <Link
              className="rh-profile-primary"
              href={proposalHref(
                buildSolverHref(`/app/solver/proposals/${proposal.id}/edit`, context),
              )}
            >
              اعمال اصلاحات
            </Link>
          )}
          {caseRecord && (
            <Link
              className="rh-profile-primary"
              href={buildSolverHref(`/app/solver/cases/${caseRecord.id}`, context)}
            >
              ورود به پرونده همکاری
            </Link>
          )}
        </div>
      </header>
      <section className="rh-summary-grid rh-summary-grid--three" aria-label="خلاصه پیشنهاد">
        <article className="rh-card">
          <div>
            <small>شناسه و نسخه</small>
            <strong>
              <bdi dir="ltr">
                {proposal.id} / {current.id}
              </bdi>
            </strong>
          </div>
        </article>
        <article className="rh-card">
          <div>
            <small>وضعیت</small>
            <strong>{labels[proposal.state]}</strong>
          </div>
        </article>
        <article className="rh-card">
          <div>
            <small>کد پیگیری</small>
            <strong>
              <bdi dir="ltr">{proposal.trackingCode ?? "تا ارسال نهایی صادر نمی‌شود"}</bdi>
            </strong>
          </div>
        </article>
      </section>
      <section className="rh-card rh-solver-flow-card">
        <h2>نسخه جاری قفل‌شده</h2>
        <p>
          این صفحه مستقیماً از محتوای نسخه <bdi dir="ltr">{current.id}</bdi> ساخته شده و قابل ویرایش
          نیست.
        </p>
        <dl>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{Array.isArray(value) ? value.join("، ") || "ثبت نشده" : value || "ثبت نشده"}</dd>
            </div>
          ))}
          <div>
            <dt>بودجه درخواستی</dt>
            <dd>{current.content.requestedBudget || "ثبت نشده"}</dd>
          </div>
          <div>
            <dt>زمان اجرا</dt>
            <dd>
              {current.content.durationWeeks ? `${current.content.durationWeeks} هفته` : "ثبت نشده"}
            </dd>
          </div>
          <div>
            <dt>فایل‌ها</dt>
            <dd>
              {current.content.attachmentNames.length
                ? current.content.attachmentNames.map((name) => (
                    <bdi dir="ltr" key={name}>
                      {name}{" "}
                    </bdi>
                  ))
                : "فایلی ثبت نشده است"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rh-card rh-membership-list">
        <header>
          <div>
            <h2>تاریخچه و رسید</h2>
            <p>{versions.length.toLocaleString("fa-IR")} نسخه ثبت‌شده</p>
          </div>
          <Link href={buildSolverHref(`/app/solver/proposals/${proposal.id}/versions`, context)}>
            مقایسه نسخه‌ها
          </Link>
        </header>
        {versions.map((version) => (
          <article key={version.id}>
            <div>
              <small>
                <bdi dir="ltr">{version.id}</bdi>
              </small>
              <h3>
                نسخه {version.number.toLocaleString("fa-IR")} {version.locked ? "· قفل‌شده" : ""}
              </h3>
              <p>
                ثبت توسط{" "}
                {state.users.find((user) => user.id === version.actorUserId)?.displayName ??
                  version.actorUserId}
              </p>
            </div>
            <time dateTime={version.createdAt}>
              {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(version.createdAt),
              )}
            </time>
          </article>
        ))}
      </section>
    </>
  );
}
