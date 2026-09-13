"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  decisionApiRoutes,
  type CaseResource,
  type CaseSuccessEnvelope,
  type ProposalOutcomeResource,
  type ProposalOutcomeSuccessEnvelope,
} from "@rahhal/contracts";

import { Icon } from "@/components/icons";
import { ConnectedFamilyFallback } from "@/components/solver/connected-family-state";
import { ConnectedProposalDetail } from "@/components/solver/connected-proposal-detail";
import { useConnectedFamily } from "@/components/solver/use-connected";
import { useWebRuntime } from "@/components/runtime-provider";
import { requestApi } from "@/lib/api/http";
import { readProposalRecordId } from "@/lib/workspace/proposal-navigation";
import { proposalRecordScopeLost, readProposalRecord } from "@/lib/workspace/proposal-record";

/**
 * The connected proposal record page.
 *
 * The id arrives as `?id=prp_…` because a server-generated id can never be a
 * pre-generated static path. Resolution happens on mount rather than at render
 * so the static export's build-time render sees the same neutral placeholder a
 * connected first paint does.
 *
 * The record itself is read from the server. This route previously rendered
 * the demo repository's detail, so a real `prp_…` was never found there and
 * every connected record answered "not found" without asking the server at
 * all -- a live route falling back to fixture authority.
 */
export function ConnectedProposalRecord() {
  const [proposalId, setProposalId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // The standalone export keeps its route in the hash, so the query lives
    // there rather than in `location.search`.
    const standalone = document.documentElement.dataset.challengeStandalone === "true";
    const source = standalone ? window.location.hash : window.location.search;
    const query = source.includes("?") ? source.slice(source.indexOf("?") + 1) : "";
    setProposalId(readProposalRecordId(query));
  }, []);

  if (proposalId === undefined)
    return (
      <section className="rh-card rh-profile-empty" aria-busy="true">
        <span className="sr-only">در حال بازیابی پرونده پیشنهاد</span>
        <div className="route-fallback__skeleton" aria-hidden="true" />
      </section>
    );

  if (!proposalId)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="search" />
        <h1>شناسه پرونده مشخص نیست</h1>
        <p>این نشانی بدون شناسه معتبر پیشنهاد باز شده است.</p>
        <Link href="/app/solver/proposals">بازگشت به فهرست پیشنهادها</Link>
      </section>
    );

  return <ConnectedProposalRecordDetail proposalId={proposalId} />;
}

function ConnectedProposalRecordDetail({ proposalId }: { proposalId: string }) {
  const connected = useConnectedFamily(
    // The read closes over the record id, so the hook is told the id: without
    // it, opening a second proposal would keep showing the first one's content.
    useMemo(() => readProposalRecord(proposalId), [proposalId]),
    proposalRecordScopeLost,
    proposalId,
  );

  if (connected.state.kind !== "ready")
    return <ConnectedFamilyFallback state={connected.state} label="این پیشنهاد" />;

  return (
    <>
      <ConnectedProposalDetail view={connected.state.data} />
      <ConnectedProposalOutcome proposalId={proposalId} />
    </>
  );
}

function ConnectedProposalOutcome({ proposalId }: { proposalId: string }) {
  const workspaceId = useWebRuntime().me?.active_context?.workspace_id;
  const [outcome, setOutcome] = useState<ProposalOutcomeResource | null>(null);
  const [caseRecord, setCaseRecord] = useState<CaseResource | null>(null);
  const [outcomeError, setOutcomeError] = useState("");
  const [caseError, setCaseError] = useState("");

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    setOutcome(null);
    setCaseRecord(null);
    setOutcomeError("");
    setCaseError("");
    void requestApi<ProposalOutcomeSuccessEnvelope>(
      decisionApiRoutes.proposalOutcome.replace("{proposalId}", encodeURIComponent(proposalId)),
      { headers: { "X-Workspace-Id": workspaceId } },
    ).then(async (result) => {
      if (!active) return;
      if (!result.ok) {
        setOutcomeError(result.error.message);
        return;
      }
      setOutcome(result.data);
      if (!result.data.case_id) return;
      const caseResult = await requestApi<CaseSuccessEnvelope>(
        decisionApiRoutes.case.replace("{caseId}", encodeURIComponent(result.data.case_id)),
        { headers: { "X-Workspace-Id": workspaceId } },
      );
      if (!active) return;
      if (!caseResult.ok) {
        setCaseError(caseResult.error.message);
        return;
      }
      setCaseRecord(caseResult.data);
    });
    return () => {
      active = false;
    };
  }, [proposalId, workspaceId]);

  if (outcomeError) {
    return (
      <section className="rh-card rh-solver-flow-card" role="alert">
        <h2>نتیجه تصمیم دریافت نشد</h2>
        <p>{outcomeError}</p>
      </section>
    );
  }
  if (!outcome || outcome.status === "pending") return null;

  return (
    <section className="rh-card rh-solver-flow-card" aria-labelledby="proposal-outcome-title">
      <h2 id="proposal-outcome-title">
        {outcome.status === "selected" ? "پیشنهاد شما انتخاب شد" : "نتیجه پیشنهاد ثبت شد"}
      </h2>
      <p>{outcome.feedback}</p>
      {caseError ? (
        <p className="rh-alert rh-alert--warning" role="alert">
          نتیجه تصمیم دریافت شد، اما پرونده همکاری اکنون در دسترس نیست: {caseError}
        </p>
      ) : null}
      <dl className="rh-proposal-content-group">
        <div>
          <dt>نتیجه</dt>
          <dd>{outcome.status === "selected" ? "منتخب" : "انتخاب نشد"}</dd>
        </div>
        <div>
          <dt>زمان تصمیم</dt>
          <dd>
            {outcome.decided_at
              ? new Intl.DateTimeFormat("fa-IR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Tehran",
                }).format(new Date(outcome.decided_at))
              : "—"}
          </dd>
        </div>
        {caseRecord ? (
          <div>
            <dt>پرونده همکاری فعال</dt>
            <dd>
              <bdi dir="ltr">{caseRecord.id}</bdi> · وضعیت ایجادشده
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
