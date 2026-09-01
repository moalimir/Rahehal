"use client";

import { challengeHref } from "@/lib/challenges/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmModal, Toast } from "@/components/challenge-flow/fields";
import { ChallengeShell, StatusBadge } from "@/components/challenge-flow/shell";
import {
  challengeStatusLabels,
  isDraftStatus,
  type ChallengeRecord,
  type ChallengeStatus,
} from "@/domain/challenge";
import { useChallengeList } from "@/components/challenge-flow/hooks";
import { useChallengeGateway } from "@/components/runtime-provider";
import { formatDateTime } from "@/lib/challenges/model";

type TabId = "all" | "draft" | "under_review" | "published";

function tabMatches(record: ChallengeRecord, tab: TabId) {
  if (tab === "all") return true;
  if (tab === "draft") return isDraftStatus(record.status);
  return record.status === tab;
}

function primaryAction(record: ChallengeRecord) {
  if (isDraftStatus(record.status)) {
    return {
      label: "ادامه تکمیل",
      href: challengeHref(`/app/org/challenges/${record.id}/edit?step=${record.lastStep}`),
    };
  }
  return {
    label: record.status === "published" ? "مشاهده جزئیات" : "مشاهده پرونده",
    href: challengeHref(`/app/org/challenges/${record.id}`),
  };
}

export function ChallengeListPage() {
  const challengeGateway = useChallengeGateway();
  const { records, refresh, loadError } = useChallengeList();
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ChallengeStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<ChallengeRecord | null>(null);
  const [toast, setToast] = useState("");

  const counts = useMemo(
    () => ({
      all: records.length,
      draft: records.filter((record) => isDraftStatus(record.status)).length,
      under_review: records.filter((record) => record.status === "under_review").length,
      published: records.filter((record) => record.status === "published").length,
    }),
    [records],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa-IR");
    return records.filter((record) => {
      const matchesQuery =
        !normalizedQuery ||
        `${record.title} ${record.id}`.toLocaleLowerCase("fa-IR").includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      return matchesQuery && matchesStatus && tabMatches(record, tab);
    });
  }, [query, records, statusFilter, tab]);

  const filtersActive = Boolean(query.trim()) || statusFilter !== "all" || tab !== "all";
  const tabs: Array<[TabId, string]> = [
    ["all", "همه"],
    ["draft", "پیش‌نویس‌ها"],
    ["under_review", "در انتظار بررسی"],
    ["published", "منتشرشده"],
  ];

  return (
    <ChallengeShell
      title="مسئله‌ها و چالش‌ها"
      description="پیش‌نویس‌ها و پرونده‌های ارسالی سازمان را از اینجا مدیریت کنید."
      actions={
        <Link className="challenge-button challenge-button--primary" href="/app/org/challenges/new">
          ثبت مسئله جدید
        </Link>
      }
    >
      <div className="challenge-tabs" role="tablist" aria-label="وضعیت پرونده‌ها">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            <span>{counts[id].toLocaleString("fa-IR")}</span>
          </button>
        ))}
      </div>

      <div className="challenge-list-toolbar">
        <label className="challenge-search-field">
          <span className="sr-only">جست‌وجو براساس عنوان یا شناسه</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی عنوان یا شناسه"
          />
        </label>
        <label className="challenge-status-filter">
          <span className="sr-only">فیلتر وضعیت</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | ChallengeStatus)}
          >
            <option value="all">همه وضعیت‌ها</option>
            {(Object.entries(challengeStatusLabels) as Array<[ChallengeStatus, string]>).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            className="challenge-clear-filters"
            onClick={() => {
              setTab("all");
              setQuery("");
              setStatusFilter("all");
            }}
          >
            پاک‌کردن فیلترها
          </button>
        )}
      </div>

      {loadError && filtered.length > 0 && (
        <div className="challenge-inline-error" role="alert">
          {loadError}
          <button
            type="button"
            className="challenge-button challenge-button--secondary challenge-button--small"
            onClick={() => void refresh()}
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <section className="challenge-empty-state">
          <h2>
            {loadError
              ? "خواندن فهرست انجام نشد"
              : records.length
                ? "نتیجه‌ای پیدا نشد"
                : "هنوز مسئله‌ای ثبت نشده است"}
          </h2>
          <p>
            {loadError
              ? loadError
              : records.length
                ? "عبارت جست‌وجو یا فیلترها را تغییر دهید."
                : "با ثبت مسئله جدید، یک پیش‌نویس قابل ادامه ساخته می‌شود."}
          </p>
          {loadError ? (
            <button
              type="button"
              className="challenge-button challenge-button--secondary"
              onClick={() => void refresh()}
            >
              تلاش دوباره
            </button>
          ) : records.length ? (
            <button
              type="button"
              className="challenge-button challenge-button--secondary"
              onClick={() => {
                setTab("all");
                setQuery("");
                setStatusFilter("all");
              }}
            >
              نمایش همه پرونده‌ها
            </button>
          ) : (
            <Link
              className="challenge-button challenge-button--primary"
              href="/app/org/challenges/new"
            >
              ثبت اولین مسئله
            </Link>
          )}
        </section>
      ) : (
        <section className="challenge-data-list" aria-label="فهرست مسئله‌ها و چالش‌ها">
          <div className="challenge-data-list__head" aria-hidden="true">
            <span>عنوان و شناسه</span>
            <span>دسته‌بندی</span>
            <span>وضعیت</span>
            <span>آخرین تغییر</span>
            <span>اقدام</span>
          </div>
          {filtered.map((record) => {
            const action = primaryAction(record);
            return (
              <article key={record.id} className="challenge-data-row">
                <div className="challenge-data-row__title">
                  {/* Deliberately not wrapped in <bdi>: the cell truncates with
                      an ellipsis, and an isolated inline box makes a Latin
                      title clip from its start instead of its end. An untitled
                      draft still needs something clickable. */}
                  <Link href={challengeHref(`/app/org/challenges/${record.id}`)}>
                    {record.title.trim() || "پیش‌نویس بدون عنوان"}
                  </Link>
                  {/* Truncated in CSS; the full id stays available to a pointer
                      and to assistive technology. */}
                  <bdi title={record.id}>{record.id}</bdi>
                </div>
                <div data-label="دسته‌بندی">{record.category}</div>
                <div data-label="وضعیت">
                  <StatusBadge status={record.status} />
                </div>
                <div data-label="آخرین تغییر">{formatDateTime(record.updatedAt)}</div>
                <div className="challenge-data-row__actions">
                  <Link
                    className="challenge-button challenge-button--secondary challenge-button--small"
                    href={action.href}
                  >
                    {action.label}
                  </Link>
                  {isDraftStatus(record.status) && (
                    <button
                      type="button"
                      className="challenge-delete-button"
                      aria-label={`حذف پیش‌نویس ${record.title}`}
                      onClick={() => setDeleteTarget(record)}
                    >
                      حذف
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف پیش‌نویس؟"
        description={
          <p>پیش‌نویس «{deleteTarget?.title}» از این مرورگر حذف می‌شود و قابل بازیابی نیست.</p>
        }
        confirmLabel="حذف پیش‌نویس"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            const result = await challengeGateway.commands.delete(id);
            if (!result.ok) {
              setToast(result.error.message);
              return;
            }
            await refresh();
            setToast("پیش‌نویس حذف شد.");
            window.setTimeout(() => setToast(""), 2200);
          }
        }}
      />
      <Toast message={toast} />
    </ChallengeShell>
  );
}
