"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { SolverProposalDetail } from "@/components/solver-proposals-list";
import { readProposalRecordId } from "@/lib/workspace/proposal-navigation";

/**
 * The connected proposal record page.
 *
 * The id arrives as `?id=prp_…` because a server-generated id can never be a
 * pre-generated static path. Resolution happens on mount rather than at render
 * so the static export's build-time render sees the same neutral placeholder a
 * connected first paint does.
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

  return <SolverProposalDetail proposalId={proposalId} />;
}
