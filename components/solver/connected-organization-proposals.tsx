"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { PrivatePdfAttachments } from "@/components/private-pdf-attachments";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type { GatewayResult } from "@/lib/api/result";
import { RecordId } from "@/components/solver/record-identity";
import { proposalHref, readProposalRecordId } from "@/lib/workspace/proposal-navigation";
import {
  proposalAttachmentSummary,
  proposalContentGroups,
} from "@/lib/workspace/proposal-content-fields";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import {
  organizationInboxScopeLost,
  organizationProposalScopeLost,
  readOrganizationInbox,
  readOrganizationProposal,
  type OrganizationProposalView,
} from "@/lib/workspace/organization-inbox";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function proposalTone(state: keyof typeof proposalStateLabels): string {
  if (["eligible", "selected"].includes(state)) return "is-success";
  if (["ineligible", "rejected", "withdrawn"].includes(state)) return "is-danger";
  if (["submitted", "resubmitted", "clarification_submitted"].includes(state)) return "is-info";
  return "is-warning";
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
 * The organization's received proposals.
 *
 * Every row here exists because a solver submitted a locked version and C4
 * created a read grant for it. The inbox shows the tracking code, state, and
 * exact submitted version — the facts the grant covers — and deliberately
 * shows no score, budget, or solver identity, because the inbox resource
 * carries none and inventing them is the failure this page replaces.
 */
export function ConnectedOrganizationProposals() {
  const connected = useConnectedFamily(readOrganizationInbox, organizationInboxScopeLost);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const state = connected.state;
  const rows = useMemo(() => (state.kind === "ready" ? state.data.rows : []), [state]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (status === "all" || row.item.state === status) &&
          `${row.item.id} ${row.item.tracking_code} ${row.challenge?.title ?? ""}`.includes(
            query.trim(),
          ),
      ),
    [query, rows, status],
  );
  const newCount = rows.filter((row) => row.item.state === "submitted").length;
  const followUpCount = rows.filter((row) =>
    ["resubmitted", "clarification_submitted"].includes(row.item.state),
  ).length;

  /**
   * The inbox grouped by the call each proposal answers.
   *
   * A flat list forced an organization running several calls at once to read
   * the challenge line on every card to work out which competition it was
   * looking at, and offered no way to see how one call was doing. Proposals
   * are only comparable within a call, so the call is the unit.
   *
   * Groups are ordered by the work waiting in them, then by recency: a call
   * with answered clarifications sitting unread is the one that should be at
   * the top of the page.
   */
  const groups = useMemo(() => {
    const byChallenge = new Map<
      string,
      { challenge: (typeof visible)[number]["challenge"]; rows: typeof visible }
    >();
    for (const row of visible) {
      const existing = byChallenge.get(row.item.challenge_id);
      if (existing) existing.rows.push(row);
      else byChallenge.set(row.item.challenge_id, { challenge: row.challenge, rows: [row] });
    }
    return [...byChallenge.entries()]
      .map(([challengeId, group]) => ({
        challengeId,
        challenge: group.challenge,
        rows: [...group.rows].sort((left, right) =>
          right.item.submitted_at.localeCompare(left.item.submitted_at),
        ),
        waiting: group.rows.filter((row) =>
          ["submitted", "resubmitted", "clarification_submitted"].includes(row.item.state),
        ).length,
        latest: group.rows.reduce(
          (newest, row) => (row.item.submitted_at > newest ? row.item.submitted_at : newest),
          "",
        ),
      }))
      .sort(
        (left, right) => right.waiting - left.waiting || right.latest.localeCompare(left.latest),
      );
  }, [visible]);

  if (connected.state.kind !== "ready")
    return (
      <div className="org-workspace-page">
        <ConnectedFamilyFallback state={connected.state} label="پیشنهادهای دریافتی" />
      </div>
    );

  const states = [...new Set(rows.map((row) => row.item.state))];
  return (
    <div className="org-workspace-page">
      {connected.state.data.error && (
        <ConnectedFamilyError error={connected.state.data.error} label="پیشنهادهای دریافتی">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="org-page-head org-connected-page-head">
        <div>
          <span>مرکز پیشنهادها</span>
          <h1>پیشنهادهای دریافتی</h1>
          <p>
            نسخه‌های قفل‌شده را مرور کنید، پیشنهادهای تازه را از موارد نیازمند پیگیری جدا کنید و
            وارد پرونده دقیق هر پیشنهاد شوید.
          </p>
        </div>
      </header>

      <section
        className="org-metrics org-metrics--three org-connected-summary"
        aria-label="خلاصه پیشنهادها"
      >
        <article className="org-metric">
          <span>
            <Icon name="decision" />
          </span>
          <div>
            <small>همه پیشنهادها</small>
            <strong>{rows.length.toLocaleString("fa-IR")}</strong>
            <p>نسخه قابل مشاهده برای این سازمان</p>
          </div>
        </article>
        <article className="org-metric org-metric--violet">
          <span>
            <Icon name="mail" />
          </span>
          <div>
            <small>ارسال تازه</small>
            <strong>{newCount.toLocaleString("fa-IR")}</strong>
            <p>آماده شروع بررسی شرایط</p>
          </div>
        </article>
        <article className="org-metric org-metric--amber">
          <span>
            <Icon name="notification" />
          </span>
          <div>
            <small>نیازمند پیگیری</small>
            <strong>{followUpCount.toLocaleString("fa-IR")}</strong>
            <p>پاسخ شفاف‌سازی یا نسخه اصلاحی</p>
          </div>
        </article>
      </section>

      <section className="org-card org-connected-toolbar" aria-label="فیلتر پیشنهادها">
        <label className="org-connected-toolbar__search">
          <span>جست‌وجو</span>
          <span className="org-connected-toolbar__control">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="شناسه، کد پیگیری یا عنوان فراخوان"
            />
          </span>
        </label>
        <label>
          <span>وضعیت</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">همه وضعیت‌ها</option>
            {states.map((value) => (
              <option key={value} value={value}>
                {proposalStateLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="org-connected-toolbar__result" aria-live="polite">
          <strong>{visible.length.toLocaleString("fa-IR")}</strong>
          <span>نتیجه از {rows.length.toLocaleString("fa-IR")} پیشنهاد</span>
        </div>
        {(query || status !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
          >
            پاک‌کردن فیلترها
          </button>
        )}
      </section>

      {groups.map((group) => (
        <section
          className="org-connected-inbox-group"
          key={group.challengeId}
          aria-label={`پیشنهادهای فراخوان ${group.challenge?.title ?? group.challengeId}`}
        >
          <header className="org-connected-inbox-group__head">
            <div>
              <h2>{group.challenge?.title ?? "فراخوان بدون عنوان عمومی"}</h2>
              <p>
                {group.challenge ? (
                  <>
                    {group.challenge.category} · مهلت{" "}
                    {formatDate(group.challenge.proposal_deadline)}
                  </>
                ) : (
                  "این فراخوان دیگر در نمای عمومی خوانده نمی‌شود."
                )}
              </p>
            </div>
            <div className="org-connected-inbox-group__counts">
              <span>
                <strong>{group.rows.length.toLocaleString("fa-IR")}</strong> پیشنهاد
              </span>
              {group.waiting > 0 && (
                <span className="is-waiting">
                  <strong>{group.waiting.toLocaleString("fa-IR")}</strong> منتظر اقدام شما
                </span>
              )}
            </div>
          </header>

          <div className="org-connected-inbox">
            {group.rows.map(({ item }) => (
              <article className="org-connected-inbox-card" key={item.id}>
                <header>
                  <div className="org-connected-inbox-card__title">
                    {/* The call is named once, in the group header above, so a
                        card identifies the submission instead of repeating it.
                        The tracking code is what an organization quotes back
                        to a solver, which makes it the card's own name. */}
                    <h3>
                      <bdi dir="ltr">{item.tracking_code}</bdi>
                    </h3>
                    <p>
                      {item.owner_workspace_kind === "team" ? "فضای تیمی" : "فضای شخصی"} ·{" "}
                      {formatDate(item.submitted_at)}
                    </p>
                  </div>
                  <span className={`org-status ${proposalTone(item.state)}`}>
                    {proposalStateLabels[item.state]}
                  </span>
                </header>
                <footer>
                  <span className="org-connected-inbox-card__version">
                    نسخه قفل‌شده {item.submitted_version.version_number.toLocaleString("fa-IR")} ·
                    قفل در {formatDate(item.submitted_version.locked_at)}
                  </span>
                  <Link className="is-primary" href={proposalHref(`/app/org/proposals/${item.id}`)}>
                    مشاهده پرونده <Icon name="arrow" />
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}

      {!visible.length && !connected.state.data.error && (
        <div className="org-card rh-profile-empty">
          <Icon name="search" />
          <h2>{rows.length ? "موردی با این فیلتر پیدا نشد" : "هنوز پیشنهادی دریافت نشده است"}</h2>
          <p>
            {rows.length
              ? "عبارت جست‌وجو یا وضعیت انتخاب‌شده را تغییر دهید."
              : "پیشنهادهای ارسال‌شده به فراخوان‌های سازمان در اینجا ظاهر می‌شوند."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One received proposal, with the C5 actions the organization may take on it.
 *
 * Content comes from the grant-scoped record read, so a proposal outside this
 * organization's grants renders the same non-enumerating screen as one that
 * does not exist. Actions carry the proposal version they were offered
 * against, which is what makes a decision attributable to an exact version.
 */
export function ConnectedOrganizationProposalDetail({ proposalId }: { proposalId: string }) {
  const runtime = useWebRuntime();
  const connected = useConnectedFamily(
    useMemo(() => readOrganizationProposal(proposalId), [proposalId]),
    organizationProposalScopeLost,
    proposalId,
  );
  const { run, pending, toast } = useCommandRunner(connected.refresh);
  const [question, setQuestion] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [revisionScope, setRevisionScope] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");

  if (connected.state.kind !== "ready")
    return (
      <div className="org-workspace-page">
        <ConnectedFamilyFallback state={connected.state} label="این پیشنهاد" />
      </div>
    );

  const view: OrganizationProposalView = connected.state.data;
  const proposal = view.proposal;
  const gateways = runtime.workspaceGateways;
  if (!proposal)
    return (
      <div className="org-workspace-page">
        <section className="rh-card rh-profile-empty">
          <Icon name="lock" />
          <h1>این پرونده در دسترس این سازمان نیست</h1>
          <p>{view.error?.message ?? "برای حفظ محرمانگی جزئیات بیشتری نمایش داده نمی‌شود."}</p>
          <Link href="/app/org/proposals">بازگشت به مرکز پیشنهادها</Link>
        </section>
      </div>
    );

  const content = proposal.content;
  const version = proposal.submitted_version;
  const revisionDeadlineIso = revisionDeadline ? new Date(revisionDeadline).toISOString() : "";
  const canStartEligibility = proposal.state === "submitted";
  const canDecideEligibility = proposal.state === "eligibility_review";
  const canRequestClarification = proposal.state === "eligible";
  const canResolveClarification = proposal.state === "clarification_submitted";
  const canRequestRevision = proposal.state === "reviewing";
  const hasOrganizationAction =
    canStartEligibility ||
    canDecideEligibility ||
    canRequestClarification ||
    canResolveClarification ||
    canRequestRevision;
  return (
    <div className="org-workspace-page">
      {toast}
      <header className="rh-profile-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href="/app/org/proposals">پیشنهادها</Link>
            <span>/</span>
            <span>
              <bdi dir="ltr">{proposal.tracking_code}</bdi>
            </span>
          </nav>
          <h1>{content.title || view.challenge?.title || "پیشنهاد دریافتی"}</h1>
          <p>{view.challenge ? `در پاسخ به «${view.challenge.title}»` : "فراخوان این سازمان"}</p>
        </div>
      </header>

      {/* The evidence an organization needs to prove which exact version it
          decided on. It used to sit on every inbox card, where it competed
          with the facts that decide whether to open a proposal at all; here
          it is beside the decision it supports. */}
      <section className="org-connected-record-rail" aria-label="شناسه و شواهد نسخه">
        <div>
          <small>وضعیت</small>
          <strong className={`org-status ${proposalTone(proposal.state)}`}>
            {proposalStateLabels[proposal.state]}
          </strong>
        </div>
        <div>
          <small>کد پیگیری</small>
          <strong>
            <bdi dir="ltr">{proposal.tracking_code}</bdi>
          </strong>
        </div>
        <div>
          <small>فضای حل‌کننده</small>
          <strong>{proposal.owner_workspace_kind === "team" ? "فضای تیمی" : "فضای شخصی"}</strong>
        </div>
        <div>
          <small>نسخه قفل‌شده</small>
          <strong>شماره {version.version_number.toLocaleString("fa-IR")}</strong>
          <RecordId value={version.id} label="شناسه نسخه ارسالی" />
        </div>
        <div>
          <small>قفل‌شده در</small>
          <strong>{formatDate(version.locked_at)}</strong>
        </div>
        <div>
          <small>اثر انگشت محتوا</small>
          <RecordId value={version.content_hash} label="اثر انگشت محتوای نسخه" />
        </div>
      </section>

      <section className="org-card" aria-label="محتوای نسخه ارسالی">
        <h2>محتوای نسخه ارسالی</h2>
        {/* The whole submission, in the same groups the solver reads it in.
            This card used to render eight of thirty fields and none of the four
            declarations, so the party deciding on a proposal saw less of it
            than the party that wrote it -- and could not confirm that the terms
            the challenge required had been accepted. */}
        {proposalContentGroups.map((group) => (
          <div className="org-proposal-content-group" key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.rows.map((row) => (
                <div key={row.field}>
                  <dt>{row.label}</dt>
                  <dd>{row.value(content)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <div className="org-proposal-content-group">
          <h3>فایل‌ها</h3>
          <PrivatePdfAttachments
            entity_type="proposal"
            entity_id={proposal.id}
            attachedIds={content.attachment_ids}
          />
          <dl>
            <div>
              <dt>پیوست‌ها</dt>
              <dd>
                {proposalAttachmentSummary(content).length ? (
                  proposalAttachmentSummary(content).map((id) => (
                    <bdi dir="ltr" key={id}>
                      {id}{" "}
                    </bdi>
                  ))
                ) : (
                  <>فایلی ثبت نشده است</>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="org-card" aria-label="شفاف‌سازی‌ها">
        <h2>شفاف‌سازی‌ها</h2>
        {proposal.clarifications.map((clarification) => (
          <article key={clarification.id}>
            <p>
              <strong>پرسش:</strong> {clarification.question}
            </p>
            <p>
              <strong>پاسخ:</strong> {clarification.response ?? "هنوز پاسخی ثبت نشده است"}
            </p>
            <small>
              {clarification.state === "resolved"
                ? "جمع‌بندی‌شده"
                : clarification.state === "submitted"
                  ? "پاسخ دریافت شده"
                  : "در انتظار پاسخ"}{" "}
              · {formatDate(clarification.requested_at)}
            </small>
            {clarification.state === "submitted" && canResolveClarification && (
              <div>
                <label>
                  <span>جمع‌بندی پاسخ</span>
                  <textarea
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    rows={3}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || !resolution.trim()}
                  onClick={() =>
                    void run(
                      () =>
                        gateways!.organizationProposals.resolveClarification(proposal.id, {
                          expectedVersion: proposal.version,
                          clarificationId: clarification.id,
                          resolution: resolution.trim(),
                        }),
                      "شفاف‌سازی بسته شد",
                    )
                  }
                >
                  ثبت جمع‌بندی و شروع بررسی
                </button>
              </div>
            )}
          </article>
        ))}
        {!proposal.clarifications.length && <p>شفاف‌سازی ثبت نشده است.</p>}
      </section>

      <section className="org-card" aria-label="اقدام‌های سازمان">
        <h2>اقدام روی این نسخه</h2>
        {canStartEligibility && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void run(
                () =>
                  gateways!.organizationProposals.startEligibilityReview(
                    proposal.id,
                    proposal.version,
                  ),
                "بررسی شرایط آغاز شد",
              )
            }
          >
            شروع بررسی شرایط
          </button>
        )}
        {canDecideEligibility && (
          <>
            <label>
              <span>دلیل تصمیم</span>
              <textarea
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                rows={3}
              />
            </label>
            <div className="rh-profile-actions">
              <button
                type="button"
                disabled={pending || !decisionReason.trim()}
                onClick={() =>
                  void run(
                    () =>
                      gateways!.organizationProposals.decideEligibility(proposal.id, {
                        expectedVersion: proposal.version,
                        decision: "eligible",
                        reason: decisionReason.trim(),
                      }),
                    "واجد شرایط ثبت شد",
                  )
                }
              >
                واجد شرایط
              </button>
              <button
                type="button"
                disabled={pending || !decisionReason.trim()}
                onClick={() =>
                  void run(
                    () =>
                      gateways!.organizationProposals.decideEligibility(proposal.id, {
                        expectedVersion: proposal.version,
                        decision: "ineligible",
                        reason: decisionReason.trim(),
                      }),
                    "فاقد شرایط ثبت شد",
                  )
                }
              >
                فاقد شرایط
              </button>
            </div>
          </>
        )}
        {canRequestClarification && (
          <>
            <label>
              <span>پرسش شفاف‌سازی</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
              />
            </label>
            <button
              type="button"
              disabled={pending || !question.trim()}
              onClick={() =>
                void run(
                  () =>
                    gateways!.organizationProposals.requestClarification(proposal.id, {
                      expectedVersion: proposal.version,
                      question: question.trim(),
                    }),
                  "درخواست شفاف‌سازی ثبت شد",
                )
              }
            >
              درخواست شفاف‌سازی
            </button>
          </>
        )}
        {canRequestRevision && (
          <>
            <label>
              <span>دامنه اصلاحات درخواستی</span>
              <textarea
                value={revisionScope}
                onChange={(event) => setRevisionScope(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              <span>مهلت ارسال نسخه اصلاح‌شده</span>
              <input
                type="datetime-local"
                value={revisionDeadline}
                onChange={(event) => setRevisionDeadline(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={
                pending ||
                !revisionScope.trim() ||
                !revisionDeadlineIso ||
                Date.parse(revisionDeadlineIso) <= Date.now()
              }
              onClick={() =>
                void run(
                  () =>
                    gateways!.organizationProposals.requestRevision(proposal.id, {
                      expectedVersion: proposal.version,
                      scope: revisionScope.trim(),
                      revisionDeadline: revisionDeadlineIso,
                    }),
                  "درخواست اصلاحات ثبت شد",
                )
              }
            >
              درخواست نسخه اصلاح‌شده
            </button>
          </>
        )}
        {!hasOrganizationAction && (
          <p>در وضعیت فعلی، اقدام تازه‌ای برای سازمان در این مرحله وجود ندارد.</p>
        )}
        {canResolveClarification && (
          // The only action in this state is closing the answered clarification,
          // and that control belongs beside the question it answers rather than
          // here. Without this line the panel rendered a heading and an opaque
          // `pcl_…` identifier, which reads as a section that failed to load.
          <p>
            پاسخ شفاف‌سازی رسیده است. برای ادامه، جمع‌بندی خود را در همان بخش «شفاف‌سازی‌ها» بالاتر
            ثبت کنید.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The organization's record page for one received proposal.
 *
 * Like the solver record path, the id travels as `?id=prp_…` because a server
 * id can never be a pre-generated static route, and an absent or malformed id
 * is an explicit unavailable state rather than a fixture fallback.
 */
export function ConnectedOrganizationProposalRecord() {
  const [proposalId, setProposalId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const standalone = document.documentElement.dataset.challengeStandalone === "true";
    const source = standalone ? window.location.hash : window.location.search;
    const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
    setProposalId(readProposalRecordId(query));
  }, []);

  if (proposalId === undefined)
    return (
      <div className="org-workspace-page">
        <section className="rh-card rh-profile-empty" aria-busy="true">
          <span className="sr-only">در حال بازیابی پرونده پیشنهاد</span>
          <div className="route-fallback__skeleton" aria-hidden="true" />
        </section>
      </div>
    );

  if (!proposalId)
    return (
      <div className="org-workspace-page">
        <section className="rh-card rh-profile-empty">
          <Icon name="search" />
          <h1>شناسه پرونده مشخص نیست</h1>
          <p>این نشانی بدون شناسه معتبر پیشنهاد باز شده است.</p>
          <Link href="/app/org/proposals">بازگشت به مرکز پیشنهادها</Link>
        </section>
      </div>
    );

  return <ConnectedOrganizationProposalDetail proposalId={proposalId} />;
}
