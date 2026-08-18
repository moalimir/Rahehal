import { challenges as canonicalChallenges } from "@/data/mock";
import type { ChallengeRecord } from "@/domain/challenge";
import { listChallenges } from "@/lib/challenges/storage";
import type { Challenge } from "@/types";

function industryFor(record: ChallengeRecord): Challenge["industry"] {
  if (/غذا|زیست|سلامت|بسته/.test(record.category)) return "صنایع غذایی";
  if (/تولید|تجهیز|نگهداری/.test(record.category)) return "ساخت‌وتولید";
  return "انرژی و آب";
}

function numericBudget(value: string): number {
  const normalized = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function mergeRecord(base: Challenge, record: ChallengeRecord): Challenge {
  return {
    ...base,
    title: record.title || base.title,
    industry: record.category ? industryFor(record) : base.industry,
    status: record.status === "published" ? "دریافت راهکار" : base.status,
    budget: numericBudget(record.budgetAmount) || base.budget,
    deadline: record.proposalDeadline ? `${record.proposalDeadline}T14:30:00+03:30` : base.deadline,
    tags: [record.category, record.outputType, ...base.tags].filter(Boolean).slice(0, 3),
  };
}

function fromPublishedRecord(record: ChallengeRecord): Challenge {
  return {
    id: record.id,
    slug: record.id.toLocaleLowerCase("en-US"),
    title: record.title,
    industry: industryFor(record),
    organizationId: "mapna",
    visibility: "عمومی",
    route: "توسعه مشترک و پایلوت",
    status: "دریافت راهکار",
    budget: numericBudget(record.budgetAmount),
    deadline: record.proposalDeadline
      ? `${record.proposalDeadline}T14:30:00+03:30`
      : "2026-12-31T14:30:00+03:30",
    fit: 0,
    tags: [record.category, record.outputType].filter(Boolean),
  };
}

/** Public and solver catalogs select from the same organization repository. */
export function listCatalogChallenges(): Challenge[] {
  if (typeof window === "undefined") return canonicalChallenges;
  const records = listChallenges();
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const merged = canonicalChallenges.map((challenge) => {
    const record = recordsById.get(challenge.id);
    return record ? mergeRecord(challenge, record) : challenge;
  });
  const known = new Set(merged.map((challenge) => challenge.id));
  const published = records
    .filter(
      (record) =>
        record.status === "published" && record.visibility === "public" && !known.has(record.id),
    )
    .map(fromPublishedRecord);
  return [...merged, ...published];
}
