import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  persianDigits,
  proposalContentGroups,
  renderedProposalContentFields,
} from "@/lib/workspace/proposal-content-fields";
import type { ProposalContentResource } from "@rahhal/contracts";

/**
 * Every key a submitted proposal carries, taken from the contract rather than
 * retyped, so adding a field to the contract fails this test until both record
 * pages show it.
 */
const contractFields: readonly (keyof ProposalContentResource)[] = [
  "title",
  "problem_statement",
  "value_proposition",
  "maturity_level",
  "prototype_weeks",
  "technologies",
  "technical_approach",
  "architecture",
  "data_needs",
  "success_metrics",
  "ip_status",
  "duration_weeks",
  "roadmap",
  "dependencies",
  "pilot_location",
  "risks",
  "mitigation",
  "lead_name",
  "team_summary",
  "relevant_experience",
  "budget_amount_minor",
  "budget_currency",
  "payment_model",
  "budget_rationale",
  "start_availability",
  "team_availability",
  "nda_accepted",
  "conflict_declared",
  "ip_accepted",
  "accuracy_confirmed",
  "attachment_ids",
];

/**
 * Rendered elsewhere on both pages, deliberately not in a content group:
 * the title is the heading, the currency is folded into the amount it
 * qualifies, and attachments are references rather than prose.
 */
const renderedOutsideTheGroups = new Set<keyof ProposalContentResource>([
  "title",
  "budget_currency",
  "attachment_ids",
]);

const content: ProposalContentResource = {
  title: "راهکار پایش مصرف انرژی",
  problem_statement: "شرح مسئله",
  value_proposition: "ارزش پیشنهادی",
  maturity_level: "نمونه اولیه",
  prototype_weeks: "۸",
  technologies: ["IoT", "TypeScript"],
  technical_approach: "رویکرد فنی",
  architecture: "معماری لبه",
  data_needs: "داده تله‌متری",
  success_metrics: "کاهش بیست درصدی",
  ip_status: "مالکیت کامل",
  duration_weeks: "16",
  roadmap: "سه مرحله",
  dependencies: "دسترسی به محیط آزمون",
  pilot_location: "تهران",
  risks: "تأخیر داده",
  mitigation: "بازبینی دوهفته‌ای",
  lead_name: "سرپرست",
  team_summary: "تیم چهار نفره",
  relevant_experience: "دو پروژه مشابه",
  budget_amount_minor: 150_000_000,
  budget_currency: "IRR",
  payment_model: "مرحله‌ای",
  budget_rationale: "برآورد نفر-ساعت",
  start_availability: "دو هفته",
  team_availability: "تمام‌وقت",
  nda_accepted: true,
  conflict_declared: true,
  ip_accepted: true,
  accuracy_confirmed: false,
  attachment_ids: [],
};

describe("one proposal reads the same to both parties", () => {
  it("renders every field a proposal carries", () => {
    // The organization's record showed eight of thirty fields, so the party
    // deciding on a proposal saw less of it than the party that wrote it. The
    // server had always returned the whole content; the two pages had simply
    // hand-listed different subsets of it.
    const missing = contractFields.filter(
      (field) => !renderedProposalContentFields.has(field) && !renderedOutsideTheGroups.has(field),
    );
    expect(missing).toEqual([]);
  });

  it("shows the declarations the challenge required before it accepted the submission", () => {
    // C4 requires the declarations the eligibility rule selected. The
    // organization could not see any of them, so it could not confirm the terms
    // it set had actually been accepted -- and Phase 4 scores this content.
    for (const field of [
      "nda_accepted",
      "conflict_declared",
      "ip_accepted",
      "accuracy_confirmed",
    ] as const) {
      expect(renderedProposalContentFields.has(field)).toBe(true);
    }
  });

  it("reads a declaration as a plain yes or no, not a raw boolean", () => {
    const rows = proposalContentGroups.flatMap((group) => group.rows);
    const accepted = rows.find((row) => row.field === "ip_accepted");
    const refused = rows.find((row) => row.field === "accuracy_confirmed");
    expect(accepted?.value(content)).toBe("تأیید شده");
    expect(refused?.value(content)).toBe("تأیید نشده");
  });

  it("renders both record pages from this one definition", () => {
    // Two hand-written lists are what drifted in the first place.
    for (const path of [
      "components/solver/connected-proposal-detail.tsx",
      "components/solver/connected-organization-proposals.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("proposalContentGroups.map");
      expect(source).toContain("row.value(content)");
    }
  });

  it("formats week counts and money the same way on both pages", () => {
    const rows = proposalContentGroups.flatMap((group) => group.rows);
    // A Persian-typed count and a Latin-typed one read alike.
    expect(rows.find((row) => row.field === "prototype_weeks")?.value(content)).toBe("۸ هفته");
    expect(rows.find((row) => row.field === "duration_weeks")?.value(content)).toBe("۱۶ هفته");
    expect(rows.find((row) => row.field === "budget_amount_minor")?.value(content)).toContain(
      "ریال",
    );
  });

  it("says a field is unset rather than rendering an empty row", () => {
    const rows = proposalContentGroups.flatMap((group) => group.rows);
    const empty = { ...content, dependencies: "   ", technologies: [], duration_weeks: "" };
    expect(rows.find((row) => row.field === "dependencies")?.value(empty)).toBe("ثبت نشده");
    expect(rows.find((row) => row.field === "technologies")?.value(empty)).toBe("ثبت نشده");
    expect(rows.find((row) => row.field === "duration_weeks")?.value(empty)).toBe("ثبت نشده");
  });

  it("leaves a non-numeric week count alone rather than mangling it", () => {
    // Normalization is not permission: readiness still refuses this, and the
    // page shows what the person actually typed.
    expect(persianDigits("هشت")).toBe("هشت");
    expect(persianDigits("٨")).toBe("۸");
  });

  it("groups the fields rather than listing thirty rows flat", () => {
    expect(proposalContentGroups.length).toBeGreaterThanOrEqual(6);
    for (const group of proposalContentGroups) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.rows.length).toBeGreaterThan(0);
    }
  });
});
