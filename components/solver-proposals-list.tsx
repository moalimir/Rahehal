"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChallengeOrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { useSolverContext } from "@/components/solver-shell";
import { getChallengePublisher } from "@/data/challenge-publishers";
import { challenges } from "@/data/mock";
import type { ProposalState, SolverState } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import {
  proposalsForWorkspace,
  readSolverState,
  subscribeSolverState,
} from "@/lib/solver/repository";

const labels: Record<ProposalState, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  eligibility_review: "بررسی شرایط",
  eligible: "واجد شرایط",
  ineligible: "فاقد شرایط",
  clarification_requested: "نیازمند شفاف‌سازی",
  clarification_submitted: "شفاف‌سازی ارسال‌شده",
  reviewing: "در حال بررسی",
  revision_requested: "نیازمند اصلاح",
  revision_draft: "پیش‌نویس اصلاح",
  resubmitted: "اصلاحات ارسال‌شده",
  selected: "منتخب",
  rejected: "ردشده",
  withdrawn: "پس‌گرفته‌شده",
};

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
  const source = document.documentElement.dataset.challengeStandalone === "true" ? window.location.hash : window.location.search;
  const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get(name) ?? "";
}

function workspaceLabel(state: SolverState, workspaceId: string) {
  return workspaceId === state.personalWorkspace.id
    ? state.personalWorkspace.name
    : state.teams.find((team) => team.workspaceId === workspaceId)?.name ?? workspaceId;
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
    const next = buildSolverHref("/app/solver/proposals", context, { q: query || undefined, status: status === "all" ? undefined : status, sort: sort === "action" ? undefined : sort });
    if (document.documentElement.dataset.challengeStandalone === "true") window.history.replaceState({}, "", `#${next}`);
    else window.history.replaceState({}, "", next);
  }, [context, query, sort, status]);
  const proposals = proposalsForWorkspace(context.workspaceId, state);
  const visible = useMemo(() => {
    const rows = proposals.filter((proposal) => {
      const challenge = challenges.find((item) => item.id === proposal.challengeId);
      const publisher = getChallengePublisher(proposal.challengeId);
      const selectedStates = statusGroups[status];
      return (status === "all" || (selectedStates ? selectedStates.includes(proposal.state) : proposal.state === status)) && `${proposal.id} ${challenge?.title ?? ""} ${publisher.name}`.includes(query.trim());
    });
    return [...rows].sort((a, b) => {
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "id") return a.id.localeCompare(b.id);
      return Number(actionStates.has(b.state)) - Number(actionStates.has(a.state)) || b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [proposals, query, sort, status]);
  const count = (states: ProposalState[]) => proposals.filter((proposal) => states.includes(proposal.state)).length;
  const tabs: Array<[string, string, number]> = [
    ["all", "همه", proposals.length],
    ["draft", "پیش‌نویس", count(["draft", "revision_draft"])],
    ["submitted", "ارسال‌شده", count(["submitted", "resubmitted", "clarification_submitted"])],
    ["reviewing", "در حال بررسی", count(["eligibility_review", "eligible", "reviewing"])],
    ["revision_requested", "نیازمند اقدام", count(["revision_requested", "clarification_requested"])],
  ];

  return (
    <>
      <header className="rh-profile-heading"><div><small>{workspaceLabel(state, context.workspaceId)}</small><h1>پیشنهادها و پرونده‌های {context.type === "team" ? "تیم" : "من"}</h1><p>هر ردیف از proposal canonical همان workspace ساخته و به شناسه خودش متصل می‌شود.</p></div><Link className="rh-profile-outline" href={buildSolverHref("/app/solver/opportunities", context)}>فرصت‌های قابل اقدام <Icon name="arrow" /></Link></header>
      <section className="rh-summary-grid" aria-label="خلاصه وضعیت پیشنهادها">
        {[
          ["پیش‌نویس‌ها", count(["draft", "revision_draft"]), "brief"],
          ["ارسال‌شده‌ها", count(["submitted", "resubmitted", "clarification_submitted"]), "arrow"],
          ["در حال بررسی", count(["eligibility_review", "eligible", "reviewing"]), "search"],
          ["نیازمند اقدام", count(["revision_requested", "clarification_requested"]), "notification"],
        ].map(([label, value, icon]) => <article className="rh-card" key={String(label)}><span><Icon name={icon as "brief"} /></span><div><small>{label}</small><strong>{Number(value).toLocaleString("fa-IR")}</strong></div></article>)}
      </section>
      <section className="rh-card rh-profile-filters">
        <label className="rh-profile-search"><Icon name="search" /><span className="sr-only">جست‌وجوی پیشنهادها</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در عنوان فرصت، سازمان یا شناسه" /></label>
        <label><span className="sr-only">مرتب‌سازی</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="action">نیازمند اقدام</option><option value="updated">آخرین تغییر</option><option value="id">شناسه</option></select></label>
        <button type="button" className="rh-profile-outline" disabled={!query && status === "all" && sort === "action"} onClick={() => { setQuery(""); setStatus("all"); setSort("action"); }}><Icon name="filter" /> پاک‌کردن فیلترها</button>
      </section>
      <div className="rh-proposal-tabs" role="tablist" aria-label="فیلتر وضعیت پیشنهادها">{tabs.map(([value, label, countValue]) => <button role="tab" aria-selected={status === value} className={status === value ? "is-active" : ""} key={value} onClick={() => setStatus(value)}>{label} <b>{countValue.toLocaleString("fa-IR")}</b></button>)}</div>
      <section className="rh-card rh-worklist" aria-label="فهرست پیشنهادها">
        <header className="rh-worklist__header"><div><h2>پرونده‌های پیشنهاد</h2><p>{visible.length.toLocaleString("fa-IR")} مورد متناسب با فیلترها</p></div></header>
        {visible.map((proposal) => {
          const challenge = challenges.find((item) => item.id === proposal.challengeId);
          const editable = ["draft", "revision_requested", "revision_draft", "clarification_requested"].includes(proposal.state);
          return <article className={`rh-work-item ${actionStates.has(proposal.state) ? "is-urgent" : ""}`} key={proposal.id}>
            <div className="rh-work-item__identity"><span className="rh-work-item__logo"><ChallengeOrganizationLogo challengeId={proposal.challengeId} size="small" /></span><div><strong>{challenge?.title ?? `فرصت ${proposal.challengeId}`}</strong><small>{getChallengePublisher(proposal.challengeId).name} · <bdi dir="ltr">{proposal.id}</bdi></small></div></div>
            <div className="rh-work-item__status"><small>وضعیت پرونده</small><span className="rh-status rh-status--info">{labels[proposal.state]}</span></div>
            <dl className="rh-work-item__facts"><div><dt>آخرین تغییر</dt><dd><time dateTime={proposal.updatedAt}>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(proposal.updatedAt))}</time></dd></div><div><dt>نسخه جاری</dt><dd><bdi dir="ltr">{proposal.currentVersionId}</bdi></dd></div><div><dt>فضای ارسال</dt><dd>{workspaceLabel(state, proposal.ownerWorkspaceId)}</dd></div></dl>
            <div className="rh-work-item__next"><small>اقدام بعدی</small><Link href={buildSolverHref(`/app/solver/proposals/${proposal.id}/${editable ? "edit" : "preview"}`, context)}>{editable ? "ادامه پرونده" : "مشاهده نسخه قفل‌شده"} <Icon name="arrow" /></Link></div>
          </article>;
        })}
        {!visible.length && <div className="rh-profile-empty"><Icon name="search" /><h2>{proposals.length ? "موردی با این فیلتر پیدا نشد" : "هنوز پیشنهادی در این فضا ندارید"}</h2><p>{proposals.length ? "فیلترها را پاک کنید." : "از صفحه فرصت‌ها یک پیش‌نویس تازه بسازید."}</p>{proposals.length ? <button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>پاک‌کردن فیلترها</button> : <Link href={buildSolverHref("/app/solver/opportunities", context)}>مشاهده فرصت‌ها</Link>}</div>}
        <footer className="rh-worklist__footer"><span>نمایش همه {visible.length.toLocaleString("fa-IR")} مورد؛ صفحه‌بندی نمایشی حذف شده است.</span></footer>
      </section>
    </>
  );
}

export function SolverProposalDetail({ proposalId }: { proposalId: string }) {
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
            <span><bdi dir="ltr">{proposal.id}</bdi></span>
          </nav>
          <h1>{current.content.title || challenge?.title || `پیشنهاد ${proposal.id}`}</h1>
          <p>{workspaceLabel(state, proposal.ownerWorkspaceId)} · {labels[proposal.state]}</p>
        </div>
        <div className="rh-profile-actions">
          <Link className="rh-profile-outline" href={buildSolverHref(`/app/solver/opportunities/${challenge?.slug ?? proposal.challengeId}`, context)}>مشاهده فرصت</Link>
          {actionable && <Link className="rh-profile-primary" href={buildSolverHref(`/app/solver/proposals/${proposal.id}/edit`, context)}>اعمال اصلاحات</Link>}
          {caseRecord && <Link className="rh-profile-primary" href={buildSolverHref(`/app/solver/cases/${caseRecord.id}`, context)}>ورود به پرونده همکاری</Link>}
        </div>
      </header>
      <section className="rh-summary-grid rh-summary-grid--three" aria-label="خلاصه پیشنهاد">
        <article className="rh-card"><div><small>شناسه و نسخه</small><strong><bdi dir="ltr">{proposal.id} / {current.id}</bdi></strong></div></article>
        <article className="rh-card"><div><small>وضعیت</small><strong>{labels[proposal.state]}</strong></div></article>
        <article className="rh-card"><div><small>کد پیگیری</small><strong><bdi dir="ltr">{proposal.trackingCode ?? "تا ارسال نهایی صادر نمی‌شود"}</bdi></strong></div></article>
      </section>
      <section className="rh-card rh-solver-flow-card">
        <h2>نسخه جاری قفل‌شده</h2>
        <p>این صفحه مستقیماً از محتوای نسخه <bdi dir="ltr">{current.id}</bdi> ساخته شده و قابل ویرایش نیست.</p>
        <dl>
          {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Array.isArray(value) ? value.join("، ") || "ثبت نشده" : value || "ثبت نشده"}</dd></div>)}
          <div><dt>بودجه درخواستی</dt><dd>{current.content.requestedBudget || "ثبت نشده"}</dd></div>
          <div><dt>زمان اجرا</dt><dd>{current.content.durationWeeks ? `${current.content.durationWeeks} هفته` : "ثبت نشده"}</dd></div>
          <div><dt>فایل‌ها</dt><dd>{current.content.attachmentNames.length ? current.content.attachmentNames.map((name) => <bdi dir="ltr" key={name}>{name} </bdi>) : "فایلی ثبت نشده است"}</dd></div>
        </dl>
      </section>
      <section className="rh-card rh-membership-list">
        <header><div><h2>تاریخچه و رسید</h2><p>{versions.length.toLocaleString("fa-IR")} نسخه ثبت‌شده</p></div><Link href={buildSolverHref(`/app/solver/proposals/${proposal.id}/versions`, context)}>مقایسه نسخه‌ها</Link></header>
        {versions.map((version) => <article key={version.id}><div><small><bdi dir="ltr">{version.id}</bdi></small><h3>نسخه {version.number.toLocaleString("fa-IR")} {version.locked ? "· قفل‌شده" : ""}</h3><p>ثبت توسط {state.users.find((user) => user.id === version.actorUserId)?.displayName ?? version.actorUserId}</p></div><time dateTime={version.createdAt}>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))}</time></article>)}
      </section>
    </>
  );
}
