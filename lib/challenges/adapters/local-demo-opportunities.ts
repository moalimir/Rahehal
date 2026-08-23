import { challenges as staticDemoCatalog } from "@/data/mock";
import type { ChallengeRecord } from "@/domain/challenge";
import type {
  OpportunityGateway,
  OpportunityQueryErrorCode,
  OpportunityView,
} from "@/lib/challenges/public-catalog";
import { createDemoResultFactory } from "@/lib/challenges/adapters/demo-results";
import { listChallenges } from "@/lib/challenges/storage";

const { failure, success, withDemoStorage } = createDemoResultFactory<OpportunityQueryErrorCode>(
  "opportunity",
  "فهرست فرصت‌های نسخه نمایشی در این مرورگر در دسترس نیست؛ دوباره تلاش کنید.",
);

function industryFor(record: ChallengeRecord): OpportunityView["industry"] {
  if (/غذا|زیست|سلامت|بسته/.test(record.category)) return "صنایع غذایی";
  if (/تولید|تجهیز|نگهداری/.test(record.category)) return "ساخت‌وتولید";
  return "انرژی و آب";
}

function numericBudget(value: string): number {
  const normalized = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function projectOpportunity(
  opportunity: OpportunityView,
  publisherPublishedCount?: number,
): OpportunityView {
  return {
    id: opportunity.id,
    slug: opportunity.slug,
    title: opportunity.title,
    industry: opportunity.industry,
    organizationId: opportunity.organizationId,
    publisherPublishedCount,
    visibility: opportunity.visibility,
    route: opportunity.route,
    status: opportunity.status,
    budget: opportunity.budget,
    deadline: opportunity.deadline,
    fit: opportunity.fit,
    tags: [...opportunity.tags],
  };
}

function mergePublishedRecord(base: OpportunityView, record: ChallengeRecord): OpportunityView {
  return {
    ...projectOpportunity(base),
    title: record.title || base.title,
    industry: record.category ? industryFor(record) : base.industry,
    status: "دریافت راهکار",
    budget: numericBudget(record.budgetAmount) || base.budget,
    deadline: record.proposalDeadline ? `${record.proposalDeadline}T14:30:00+03:30` : base.deadline,
    tags: [record.category, record.outputType, ...base.tags].filter(Boolean).slice(0, 3),
  };
}

function fromPublishedRecord(record: ChallengeRecord): OpportunityView {
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

function listOpportunityViews(): OpportunityView[] {
  const publishedRecords = listChallenges().filter(
    (record) => record.status === "published" && record.visibility === "public",
  );
  const recordsById = new Map(publishedRecords.map((record) => [record.id, record]));
  const merged = staticDemoCatalog.map((opportunity) => {
    const record = recordsById.get(opportunity.id);
    return record ? mergePublishedRecord(opportunity, record) : projectOpportunity(opportunity);
  });
  const knownIds = new Set(merged.map((opportunity) => opportunity.id));
  const opportunities = [
    ...merged,
    ...publishedRecords.filter((record) => !knownIds.has(record.id)).map(fromPublishedRecord),
  ];
  return opportunities.map((opportunity) =>
    projectOpportunity(
      opportunity,
      opportunities.filter((candidate) => candidate.organizationId === opportunity.organizationId)
        .length,
    ),
  );
}

export function createLocalDemoOpportunityGateway(): OpportunityGateway {
  return {
    queries: {
      async list() {
        return withDemoStorage("list", () => success("list", listOpportunityViews()));
      },
      async get(key) {
        return withDemoStorage("get", () => {
          const normalizedKey = key.toLocaleLowerCase("en-US");
          const opportunity = listOpportunityViews().find(
            (candidate) =>
              candidate.id.toLocaleLowerCase("en-US") === normalizedKey ||
              candidate.slug.toLocaleLowerCase("en-US") === normalizedKey,
          );
          return opportunity
            ? success("get", opportunity)
            : failure("get", "NOT_FOUND", "فرصت منتشرشده پیدا نشد.");
        });
      },
    },
  };
}
