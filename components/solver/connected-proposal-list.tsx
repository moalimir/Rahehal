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

  /**
   * The list grouped by the call each proposal answers.
   *
   * A solver working several calls at once had to read the title on every row
   * to tell them apart, and revisions of the same call scattered through the
   * list. Grouping matches how the organization reads its own inbox, so both
   * sides of a conversation are organised the same way.
   *
   * Ordered by the work waiting in each call, then by recency: a call with a
   * clarification to answer belongs above one that is merely submitted.
   */
  const groups = useMemo(() => {
    const byChallenge = new Map<string, typeof visible>();
    for (const row of visible) {
      const existing = byChallenge.get(row.challengeId);
      if (existing) existing.push(row);
      else byChallenge.set(row.challengeId, [row]);
    }
    return [...byChallenge.entries()]
      .map(([challengeId, items]) => ({
        challengeId,
        title: items[0]?.challengeTitle ?? null,
        rows: [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        waiting: items.filter((row) => proposalStatusGroups.revision_requested.has(row.state))
          .length,
        latest: items.reduce(
          (newest, row) => (row.updatedAt > newest ? row.updatedAt : newest),
          "",
        ),
      }))
      .sort(
        (left, right) => right.waiting - left.waiting || right.latest.localeCompare(left.latest),
      );
  }, [visible]);

  if (state.kind !== "ready") return <ConnectedFamilyFallback state={state} label="پیشنهادها" />;

  /** Live counts for the filter chips, from the same groups the rows use. */
  const statusCounts = (key: string) =>
    key === "all"
      ? rows.length
      : rows.filter((row) => proposalStatusGroups[key]?.has(row.state) ?? row.state === key).length;

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
          {/* "پیشنهاد سروری" was developer shorthand for "read from the
              server" and meant nothing to the person reading it. */}
          <p>
            {rows.length === 0
              ? "هنوز پیشنهادی در این فضای کاری ندارید"
              : `${rows.length.toLocaleString("fa-IR")} پیشنهاد در ${groups.length.toLocaleString("fa-IR")} فراخوان`}
          </p>
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
      {/* The same four groups the dashboard counts, with their numbers, so a
          solver can see where the work is without opening each filter. */}
      <div className="rh-proposal-tabs" role="tablist" aria-label="فیلتر وضعیت پیشنهادها">
        {([["all", "همه"], ...statusOptions] as readonly (readonly [string, string])[]).map(
          ([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={status === value}
              className={status === value ? "is-active" : ""}
              key={value}
              onClick={() => setStatus(value)}
            >
              {label} <b>{statusCounts(value).toLocaleString("fa-IR")}</b>
            </button>
          ),
        )}
      </div>
      {groups.map((group) => (
        <section
          className="rh-connected-proposal-group"
          key={group.challengeId}
          aria-label={`پیشنهادهای فراخوان ${group.title ?? group.challengeId}`}
        >
          <header className="rh-connected-proposal-group__head">
            <div>
              <h2>{group.title ?? "فراخوان بدون عنوان عمومی"}</h2>
              <p>{group.rows.length.toLocaleString("fa-IR")} پیشنهاد در این فراخوان</p>
            </div>
            {group.waiting > 0 && (
              <span className="rh-connected-proposal-group__waiting">
                {group.waiting.toLocaleString("fa-IR")} نیازمند اقدام شما
              </span>
            )}
          </header>
          <div className="rh-card rh-membership-list">
            {group.rows.map((row) => {
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
                    {/* The call is named once in the group header, so a row
                        identifies the submission: its tracking code when one
                        has been issued, and its state before that. */}
                    <RecordReference code={row.trackingCode} />
                    <h3>{proposalStateLabels[row.state]}</h3>
                    <p>
                      نسخه {row.versionNumber.toLocaleString("fa-IR")} · {formatDate(row.updatedAt)}
                    </p>
                    <RecordId value={row.id} label="شناسه پیشنهاد" />
                  </div>
                  <Link href={href}>{editable ? "ادامه و اقدام" : "مشاهده پرونده"}</Link>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {!visible.length && !state.data.error && (
        <section className="rh-card rh-profile-empty">
          <Icon name="search" />
          <h2>{rows.length ? "موردی با این فیلتر پیدا نشد" : "هنوز پیشنهادی ندارید"}</h2>
          {!rows.length && <Link href="/app/solver/opportunities">مشاهده فرصت‌ها</Link>}
        </section>
      )}
    </>
  );
}
