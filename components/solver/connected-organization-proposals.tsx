"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import type { GatewayResult } from "@/lib/api/result";
import { RecordId } from "@/components/solver/record-identity";
import { proposalHref, readProposalRecordId } from "@/lib/workspace/proposal-navigation";
import { currencyLabels } from "@/domain/challenge";
import { formatMinorAmount } from "@/lib/challenges/model";
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

      <section className="org-connected-inbox" aria-label="فهرست پیشنهادهای دریافتی">
        {visible.map(({ item, challenge }) => (
          <article className="org-connected-inbox-card" key={item.id}>
            <header>
              <div className="org-connected-inbox-card__title">
                {/* The tracking code is the reference an organization quotes
                    back to a solver, so it leads. The challenge id below it
                    was the same opaque string twice -- once as a fallback
                    title, once labelled "فراخوان" -- and neither told anyone
                    which call this was. */}
                <small>
                  کد پیگیری <bdi dir="ltr">{item.tracking_code}</bdi>
                </small>
                <h2>{challenge?.title ?? "فراخوان بدون عنوان عمومی"}</h2>
                <p>{challenge ? challenge.category : "این فراخوان دیگر عمومی نیست"}</p>
              </div>
              <span className={`org-status ${proposalTone(item.state)}`}>
                {proposalStateLabels[item.state]}
              </span>
            </header>
            <dl className="org-connected-inbox-card__facts">
              <div>
                <dt>نوع فضای حل‌کننده</dt>
                <dd>{item.owner_workspace_kind === "team" ? "فضای تیمی" : "فضای شخصی"}</dd>
              </div>
              <div>
                <dt>نسخه قفل‌شده</dt>
                <dd>شماره {item.submitted_version.version_number.toLocaleString("fa-IR")}</dd>
              </div>
              <div>
                <dt>زمان دریافت</dt>
                <dd>{formatDate(item.submitted_at)}</dd>
              </div>
            </dl>
            <div className="org-connected-inbox-card__evidence">
              <Icon name="shield" />
              <span>
                <small>نسخه و اثر انگشت محتوا</small>
                <RecordId value={item.submitted_version.id} label="شناسه نسخه ارسالی" />
                <bdi dir="ltr">{item.submitted_version.content_hash.slice(0, 16)}</bdi>
              </span>
            </div>
            <footer>
              <p>نسخه دقیق ارسالی در {formatDate(item.submitted_version.locked_at)} قفل شده است.</p>
              <Link className="is-primary" href={proposalHref(`/app/org/proposals/${item.id}`)}>
                مشاهده پرونده <Icon name="arrow" />
              </Link>
            </footer>
          </article>
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
      </section>
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
          <p>
            {proposalStateLabels[proposal.state]} · نسخه{" "}
            {version.version_number.toLocaleString("fa-IR")} · قفل‌شده در{" "}
            {formatDate(version.locked_at)}
          </p>
        </div>
      </header>

      <section className="org-card" aria-label="محتوای نسخه ارسالی">
        <h2>محتوای نسخه ارسالی</h2>
        <dl>
          {(
            [
              ["بیان مسئله", content.problem_statement],
              ["ارزش پیشنهادی", content.value_proposition],
              ["رویکرد فنی", content.technical_approach],
              ["معماری راهکار", content.architecture],
              ["معیارهای موفقیت", content.success_metrics],
              ["نقشه راه", content.roadmap],
              ["ریسک‌ها", content.risks],
              ["تیم اجرا", content.team_summary],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "ثبت نشده"}</dd>
            </div>
          ))}
          <div>
            <dt>بودجه درخواستی</dt>
            <dd>
              {content.budget_amount_minor === null
                ? "ثبت نشده"
                : `${formatMinorAmount(content.budget_amount_minor)} ${currencyLabels[content.budget_currency]}`}
            </dd>
          </div>
        </dl>
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
