"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { useWebRuntime } from "@/components/runtime-provider";
import {
  applicantTypeLabels,
  budgetStatusLabels,
  currencyLabels,
  ipTermLabels,
  workModeLabels,
} from "@/domain/challenge";
import type {
  ChallengePublicProjectionResource,
  EligibilityDecisionResource,
  ProposalListItemResource,
  SavedOpportunityResource,
} from "@rahhal/contracts";
import {
  listPublicChallenges,
  readPublicChallenge,
} from "@/lib/challenges/adapters/network-public-challenges";
import { formatDateTime, formatMinorAmount, tehranTimeLabel } from "@/lib/challenges/model";
import { proposalHref } from "@/lib/workspace/proposal-navigation";

const RECORD_PATH = "/app/solver/opportunities/record";

function recordHref(challengeId: string): string {
  return `${RECORD_PATH}/?id=${encodeURIComponent(challengeId)}`;
}

function formatBudget(challenge: ChallengePublicProjectionResource): string {
  if (challenge.budget.status !== "fixed" || challenge.budget.amount_minor === null)
    return budgetStatusLabels[challenge.budget.status];
  return `${formatMinorAmount(challenge.budget.amount_minor)} ${currencyLabels[challenge.budget.currency]}`;
}

export function ConnectedOpportunityDirectory() {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const [items, setItems] = useState<readonly ChallengePublicProjectionResource[]>([]);
  const [saved, setSaved] = useState<readonly SavedOpportunityResource[]>([]);
  const [proposals, setProposals] = useState<readonly ProposalListItemResource[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [catalog, savedRows, proposalRows] = await Promise.all([
      listPublicChallenges(),
      gateways.savedOpportunities.list(),
      gateways.proposals.list(),
    ]);
    setLoading(false);
    if (!catalog.ok) {
      setError(catalog.error.message);
      return;
    }
    if (!savedRows.ok) {
      setError(savedRows.error.message);
      return;
    }
    if (!proposalRows.ok) {
      setError(proposalRows.error.message);
      return;
    }
    setItems(catalog.data.items);
    setSaved(savedRows.data.items);
    setProposals(proposalRows.data.items);
  }, [gateways]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return needle
      ? items.filter((item) => `${item.title} ${item.category} ${item.location}`.includes(needle))
      : items;
  }, [items, query]);

  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>فراخوان‌های منتشرشده و متصل</small>
          <h1>چالش‌ها و فرصت‌ها</h1>
          <p>شرایط هر فراخوان و وضعیت فضای کاری فعال مستقیماً از سرور خوانده می‌شود.</p>
        </div>
      </header>
      <section className="rh-card rh-saved-filter">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی فرصت‌ها</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="عنوان، دسته یا محل"
          />
        </label>
      </section>
      {error && (
        <div className="challenge-inline-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      )}
      {loading ? (
        <section className="rh-card rh-profile-empty" aria-busy="true">
          <span className="sr-only">در حال دریافت فرصت‌ها</span>
          <div className="route-fallback__skeleton" aria-hidden="true" />
        </section>
      ) : (
        <section className="rh-saved-grid" aria-label="فرصت‌های منتشرشده">
          {visible.map((challenge) => {
            const savedRow = saved.find((row) => row.challenge_id === challenge.challenge_id);
            const proposal = proposals.find((row) => row.challenge_id === challenge.challenge_id);
            return (
              <article className="rh-card rh-saved-card" key={challenge.challenge_id}>
                <header>
                  <div>
                    <small>
                      <bdi dir="ltr">{challenge.challenge_id}</bdi>
                    </small>
                    <h2>{challenge.title}</h2>
                    <p>{challenge.public_summary}</p>
                  </div>
                </header>
                <div className="rh-tag-row">
                  <span>{challenge.category}</span>
                  <span>{challenge.location}</span>
                  {savedRow && <span>ذخیره‌شده</span>}
                  {proposal && <span>دارای پیشنهاد</span>}
                </div>
                <dl>
                  <div>
                    <dt>مهلت</dt>
                    <dd>{formatDateTime(challenge.proposal_deadline)}</dd>
                  </div>
                  <div>
                    <dt>بودجه</dt>
                    <dd>{formatBudget(challenge)}</dd>
                  </div>
                </dl>
                <Link href={recordHref(challenge.challenge_id)}>بررسی شرایط و اقدام</Link>
              </article>
            );
          })}
          {!visible.length && !error && (
            <div className="rh-profile-empty">
              <Icon name="search" />
              <h2>فرصتی پیدا نشد</h2>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function ConnectedOpportunityRecord() {
  const runtime = useWebRuntime();
  const gateways = runtime.workspaceGateways!;
  const [challengeId, setChallengeId] = useState<string | null | undefined>(undefined);
  const [challenge, setChallenge] = useState<ChallengePublicProjectionResource | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityDecisionResource | null>(null);
  const [saved, setSaved] = useState<SavedOpportunityResource | null>(null);
  const [proposal, setProposal] = useState<ProposalListItemResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setChallengeId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const load = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    const [record, decision, savedRows, proposalRows] = await Promise.all([
      readPublicChallenge(challengeId),
      gateways.solverProfile.evaluateEligibility(challengeId),
      gateways.savedOpportunities.list(),
      gateways.proposals.list(),
    ]);
    setLoading(false);
    if (!record.ok || !decision.ok || !savedRows.ok || !proposalRows.ok) {
      const failure = [record, decision, savedRows, proposalRows].find((result) => !result.ok);
      setNotice(failure && !failure.ok ? failure.error.message : "خواندن فرصت انجام نشد.");
      return;
    }
    setChallenge(record.data);
    setEligibility(decision.data);
    setSaved(savedRows.data.items.find((row) => row.challenge_id === challengeId) ?? null);
    setProposal(proposalRows.data.items.find((row) => row.challenge_id === challengeId) ?? null);
  }, [challengeId, gateways]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    command: () => Promise<{
      ok: boolean;
      error?: { message: string };
      meta: { correlation_id: string };
    }>,
    success: string,
  ) => {
    setPending(true);
    const result = await command();
    setPending(false);
    setNotice(
      result.ok
        ? `${success} · شناسه همبستگی ${result.meta.correlation_id}`
        : (result.error?.message ?? "اقدام انجام نشد."),
    );
    if (result.ok) await load();
  };

  if (challengeId === undefined || loading)
    return (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال خواندن فرصت</span>
        <div className="route-fallback__skeleton" />
      </section>
    );
  if (!challengeId || !challenge || !eligibility)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="search" />
        <h1>فرصت در دسترس نیست</h1>
        <p>{notice || "شناسه معتبر فراخوان مشخص نشده است."}</p>
        <Link href="/app/solver/opportunities">بازگشت به فرصت‌ها</Link>
      </section>
    );

  const actionableGates = eligibility.next_actions.filter(
    (action): action is "accept_nda" | "acknowledge_document_gate" =>
      action === "accept_nda" || action === "acknowledge_document_gate",
  );

  return (
    <>
      <header className="rh-profile-heading">
        <div>
          <small>
            <bdi dir="ltr">{challenge.challenge_id}</bdi>
          </small>
          <h1>{challenge.title}</h1>
          <p>{challenge.public_summary}</p>
        </div>
        <Link className="rh-profile-outline" href="/app/solver/opportunities">
          بازگشت به فرصت‌ها
        </Link>
      </header>
      <section className="rh-card rh-solver-flow-card">
        <h2>شرایط فراخوان</h2>
        <dl>
          <div>
            <dt>متقاضیان مجاز</dt>
            <dd>
              {challenge.allowed_applicant_types
                .map((type) => applicantTypeLabels[type])
                .join("، ")}
            </dd>
          </div>
          <div>
            <dt>محل اجرا</dt>
            <dd>{challenge.location}</dd>
          </div>
          <div>
            <dt>شیوه کار</dt>
            <dd>{workModeLabels[challenge.work_mode]}</dd>
          </div>
          <div>
            <dt>بودجه</dt>
            <dd>{formatBudget(challenge)}</dd>
          </div>
          <div>
            <dt>مهلت</dt>
            <dd>
              {formatDateTime(challenge.proposal_deadline)} <small>{tehranTimeLabel}</small>
            </dd>
          </div>
          <div>
            <dt>مالکیت فکری</dt>
            <dd>{ipTermLabels[challenge.ip_terms]}</dd>
          </div>
        </dl>
      </section>
      <section className="rh-card rh-team-origin-note">
        <Icon name={eligibility.status === "eligible" ? "check" : "notification"} />
        <div>
          <strong>
            {eligibility.status === "eligible"
              ? "این فضای کاری واجد شرایط است"
              : eligibility.status === "needs_action"
                ? "پیش از ارسال اقدام لازم است"
                : "این فضای کاری واجد شرایط نیست"}
          </strong>
          {eligibility.reasons.map((reason) => (
            <p key={reason.code}>{reason.message}</p>
          ))}
        </div>
      </section>
      {actionableGates.map((action) => (
        <button
          key={action}
          type="button"
          disabled={pending}
          onClick={() =>
            void run(
              () =>
                gateways.solverProfile.acceptEligibilityGate({
                  challengeId: challenge.challenge_id,
                  challengeVersionId: challenge.challenge_version_id,
                  gate: action === "accept_nda" ? "nda" : "document_acknowledgement",
                }),
              action === "accept_nda" ? "توافق محرمانگی پذیرفته شد" : "الزام مدارک تأیید شد",
            )
          }
        >
          {action === "accept_nda" ? "پذیرش توافق محرمانگی" : "تأیید الزام مدارک"}
        </button>
      ))}
      {eligibility.next_actions.includes("verify_workspace") && (
        <Link className="rh-profile-primary" href="/app/solver/profile">
          پیگیری احراز فضای کاری
        </Link>
      )}
      <section className="rh-card rh-profile-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void run(
              () =>
                saved
                  ? gateways.savedOpportunities.unsave(challenge.challenge_id, saved.version)
                  : gateways.savedOpportunities.save(challenge.challenge_id),
              saved ? "فرصت از ذخیره‌ها حذف شد" : "فرصت ذخیره شد",
            )
          }
        >
          {saved ? "حذف از ذخیره‌ها" : "ذخیره فرصت"}
        </button>
        {proposal ? (
          <Link
            className="rh-profile-primary"
            href={proposalHref(
              `/app/solver/proposals/${proposal.id}/${["draft", "revision_draft", "clarification_requested", "revision_requested"].includes(proposal.state) ? "edit" : "preview"}`,
            )}
          >
            ادامه پیشنهاد
          </Link>
        ) : (
          <button
            className="rh-profile-primary"
            type="button"
            disabled={pending || eligibility.status !== "eligible"}
            onClick={() => {
              setPending(true);
              void gateways.proposals
                .create({ challengeId: challenge.challenge_id })
                .then((result) => {
                  setPending(false);
                  if (!result.ok) {
                    setNotice(result.error.message);
                    return;
                  }
                  window.location.assign(
                    proposalHref(`/app/solver/proposals/${result.data.entity_id}/edit`),
                  );
                });
            }}
          >
            شروع تدوین پیشنهاد
          </button>
        )}
      </section>
      {notice && (
        <div className="rh-profile-toast" role="status">
          <Icon name="check" />
          <span>{notice}</span>
          <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
