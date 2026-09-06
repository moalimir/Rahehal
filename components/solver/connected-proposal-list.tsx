"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import {
  ConnectedFamilyError,
  ConnectedFamilyFallback,
} from "@/components/solver/connected-family-state";
import { useConnectedFamily } from "@/components/solver/use-connected";
import { proposalStateLabels } from "@/lib/workspace/proposal-labels";
import { RecordId, RecordReference } from "@/components/solver/record-identity";
import { proposalHref } from "@/lib/workspace/proposal-navigation";
import { proposalListScopeLost, readProposalList } from "@/lib/workspace/proposal-rows";
import { proposalStatusGroups } from "@/lib/workspace/solver-summary";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

/** Active workspace proposal list; it never initializes the demo repository. */
export function ConnectedProposalList() {
  const connected = useConnectedFamily(readProposalList, proposalListScopeLost);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  // The dashboard's metric cards link here with a filter already applied. A
  // page that ignored it would make those cards a promise it does not keep.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("status");
    if (requested && (requested === "all" || requested in proposalStatusGroups)) {
      setStatus(requested);
    }
  }, []);
  const state = connected.state;
  const rows = useMemo(() => (state.kind === "ready" ? state.data.rows : []), [state]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          // Grouped exactly as the dashboard counts, so a card's number and
          // the rows it opens are the same set.
          (status === "all" ||
            (proposalStatusGroups[status]?.has(row.state) ?? row.state === status)) &&
          `${row.id} ${row.trackingCode ?? ""} ${row.challengeTitle ?? ""} ${row.challengeId}`.includes(
            query.trim(),
          ),
      ),
    [query, rows, status],
  );

  if (state.kind !== "ready") return <ConnectedFamilyFallback state={state} label="پیشنهادها" />;

  // The four canonical groups, always offered. Building the options from the
  // states that happen to be present meant an empty workspace could not
  // express the filter the dashboard had just linked it to.
  const statusOptions: readonly (readonly [string, string])[] = [
    ["draft", "پیش‌نویس"],
    ["submitted", "ارسال‌شده"],
    ["reviewing", "در حال بررسی"],
    ["revision_requested", "نیازمند اقدام"],
  ];
  return (
    <>
      {state.data.error && (
        <ConnectedFamilyError error={state.data.error} label="پیشنهادها">
          <button type="button" onClick={connected.refresh}>
            تلاش دوباره
          </button>
        </ConnectedFamilyError>
      )}
      <header className="rh-profile-heading">
        <div>
          <small>فضای کاری فعال</small>
          <h1>درخواست‌ها و راه‌حل‌های من</h1>
          <p>{rows.length.toLocaleString("fa-IR")} پیشنهاد سروری</p>
        </div>
        <Link className="rh-profile-primary" href="/app/solver/opportunities">
          شروع از یک فرصت
        </Link>
      </header>
      <section className="rh-card rh-profile-filters">
        <label>
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی پیشنهادها</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="عنوان فراخوان، شناسه یا کد پیگیری"
          />
        </label>
        <label>
          <span className="sr-only">وضعیت</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">همه وضعیت‌ها</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="rh-card rh-membership-list">
        {visible.map((row) => {
          const editable = [
            "draft",
            "revision_draft",
            "clarification_requested",
            "revision_requested",
          ].includes(row.state);
          const href = proposalHref(
            `/app/solver/proposals/${row.id}/${editable ? "edit" : "preview"}`,
          );
          return (
            <article key={row.id}>
              <div>
                {/* A tracking code is a reference; the proposal's own id is
                    not. Leading with the id titled every unsubmitted draft
                    with 32 hex characters and pushed the call it answers
                    underneath. */}
                <RecordReference code={row.trackingCode} />
                <h2>{row.challengeTitle ?? "فراخوان بدون عنوان عمومی"}</h2>
                <p>
                  {proposalStateLabels[row.state]} · نسخه{" "}
                  {row.versionNumber.toLocaleString("fa-IR")} · {formatDate(row.updatedAt)}
                </p>
                <RecordId value={row.id} label="شناسه پیشنهاد" />
              </div>
              <Link href={href}>{editable ? "ادامه و اقدام" : "مشاهده پرونده"}</Link>
            </article>
          );
        })}
        {!visible.length && !state.data.error && (
          <div className="rh-profile-empty">
            <Icon name="search" />
            <h2>{rows.length ? "موردی با این فیلتر پیدا نشد" : "هنوز پیشنهادی ندارید"}</h2>
            {!rows.length && <Link href="/app/solver/opportunities">مشاهده فرصت‌ها</Link>}
          </div>
        )}
      </section>
    </>
  );
}
