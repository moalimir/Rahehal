import { getOrganization } from "@/data/organization-registry";
import { challenges } from "@/data/mock";
import { challengeEligibilityRules } from "@/lib/solver/eligibility";
import { proposalsForWorkspace, readSolverState } from "@/lib/solver/repository";

export type CategoryKey = "energy-environment" | "manufacturing" | "food-health";
export type Scenario = "new" | "saved" | "draft" | "submitted" | "review" | "revision" | "closed";
export type ChallengeLayout = "grid" | "list";
export type AllowedApplicant =
  | "فرد مستقل"
  | "شرکت رسمی"
  | "تیم مستقل"
  | "تیم دانشگاهی مستقل"
  | "تیم دانشگاه تحت نظر استاد";

export const categoryLabels: Record<CategoryKey, string> = {
  "energy-environment": "آب، انرژی و محیط‌زیست",
  manufacturing: "ساخت و تولید",
  "food-health": "غذا، سلامت و زیست‌فناوری",
};

export const scenarioLabels: Record<Scenario, string> = {
  new: "جدید برای شما",
  saved: "ذخیره‌شده",
  draft: "پیش‌نویس راه‌حل",
  submitted: "راه‌حل ارسال شده",
  review: "در حال بررسی",
  revision: "نیازمند اصلاح",
  closed: "پایان‌یافته",
};

export const allowedApplicantOptions: AllowedApplicant[] = [
  "فرد مستقل",
  "شرکت رسمی",
  "تیم مستقل",
  "تیم دانشگاهی مستقل",
  "تیم دانشگاه تحت نظر استاد",
];

const applicantLabel = {
  individual: "فرد مستقل",
  company: "شرکت رسمی",
  "expert-team": "تیم مستقل",
  lab: "تیم دانشگاهی مستقل",
  "academic-group": "تیم دانشگاه تحت نظر استاد",
} as const;

function categoryFor(industry: string): CategoryKey {
  if (industry === "ساخت‌وتولید") return "manufacturing";
  if (industry === "صنایع غذایی") return "food-health";
  return "energy-environment";
}

function scenarioFor(challengeId: string, deadline: string, workspaceId?: string): Scenario {
  if (new Date(deadline).getTime() <= Date.now()) return "closed";
  if (!workspaceId) return "new";
  const state = readSolverState();
  const proposal = proposalsForWorkspace(workspaceId, state).find(
    (candidate) => candidate.challengeId === challengeId,
  );
  if (proposal) {
    if (proposal.state === "draft") return "draft";
    if (proposal.state === "revision_requested" || proposal.state === "revision_draft")
      return "revision";
    if (
      proposal.state === "reviewing" ||
      proposal.state === "eligibility_review" ||
      proposal.state === "eligible"
    )
      return "review";
    return "submitted";
  }
  if (
    state.proposalDrafts.some(
      (draft) => draft.ownerWorkspaceId === workspaceId && draft.challengeId === challengeId,
    )
  )
    return "draft";
  if ((state.savedByWorkspace[workspaceId] ?? []).includes(challengeId)) return "saved";
  return "new";
}

export function buildChallengeItems(catalog = challenges, workspaceId?: string) {
  return catalog.map((challenge, index) => {
    const publisher = getOrganization(challenge.organizationId);
    const rule = challengeEligibilityRules[challenge.id];
    const applicants = rule
      ? rule.allowedApplicantTypes.map((type) => applicantLabel[type])
      : (["فرد مستقل", "تیم مستقل"] as AllowedApplicant[]);
    return {
      ...challenge,
      category: categoryFor(challenge.industry),
      scenario: scenarioFor(challenge.id, challenge.deadline, workspaceId),
      applicants,
      remote: challenge.route !== "خرید پژوهش",
      publisher,
      summary: `طراحی یک راهکار قابل اجرا برای ${challenge.title} با تمرکز بر سنجش‌پذیری، ایمنی و امکان پایلوت در محیط واقعی.`,
      publishedOrder: 100 - index,
      evidenceReasons: [
        challenge.tags.length ? `حوزه مرتبط: ${challenge.tags[0]}` : "حوزه تخصص نیازمند بررسی",
        challenge.route.includes("پایلوت") ? "امکان اجرای پایلوت" : "مدل همکاری مشخص",
        challenge.visibility === "عمومی" ? "اطلاعات عمومی قابل بررسی" : "نیازمند بررسی دسترسی",
      ],
    };
  });
}

export const challengeItems = buildChallengeItems();

export const challengeDiscoveryPaths = challengeItems.flatMap((challenge) => [
  `/challenges/${challenge.slug}`,
  `/challenges/${challenge.id}`,
]);

export function normalizeFa(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase("fa-IR")
    .trim();
}

export function readParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  if (document.documentElement.dataset.challengeStandalone === "true") {
    return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  }
  return new URLSearchParams(window.location.search);
}

export function daysRemaining(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

export function budgetLabel(value: number) {
  const millions = Math.round(value / 1_000_000);
  return `${millions.toLocaleString("fa-IR")} میلیون تومان`;
}
