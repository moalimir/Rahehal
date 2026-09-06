"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { ConnectedFamilyFallback } from "@/components/solver/connected-family-state";
import { ConnectedProposalDetail } from "@/components/solver/connected-proposal-detail";
import { useConnectedFamily } from "@/components/solver/use-connected";
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

  return <ConnectedProposalDetail view={connected.state.data} />;
}
