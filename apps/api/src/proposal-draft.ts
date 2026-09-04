import type {
  ProposalContentPatch,
  ProposalContentResource,
  ProposalReadinessResource,
} from "@rahhal/contracts";
import { evaluateProposalReadiness, isPrefixedId, type ProposalContent } from "@rahhal/domain";
import type { ProposalDeclarationRequirements } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";
import { commandFingerprint } from "./primitives.js";

export const proposalContentFields = [
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
] as const satisfies readonly (keyof ProposalContentResource)[];

export const emptyProposalContent = (): ProposalContentResource => ({
  title: "",
  problem_statement: "",
  value_proposition: "",
  maturity_level: "",
  prototype_weeks: "",
  technologies: [],
  technical_approach: "",
  architecture: "",
  data_needs: "",
  success_metrics: "",
  ip_status: "",
  duration_weeks: "",
  roadmap: "",
  dependencies: "",
  pilot_location: "",
  risks: "",
  mitigation: "",
  lead_name: "",
  team_summary: "",
  relevant_experience: "",
  budget_amount_minor: null,
  budget_currency: "IRR",
  payment_model: "",
  budget_rationale: "",
  start_availability: "",
  team_availability: "",
  nda_accepted: false,
  conflict_declared: false,
  ip_accepted: false,
  accuracy_confirmed: false,
  attachment_ids: [],
});

function validateContent(content: ProposalContentResource): void {
  if (
    content.budget_amount_minor !== null &&
    (!Number.isSafeInteger(content.budget_amount_minor) || content.budget_amount_minor < 0)
  ) {
    throw new ApiProblem(422, "VALIDATION", "Proposal budget must use non-negative minor units");
  }
  if (!content.attachment_ids.every((id) => isPrefixedId(id, "fil"))) {
    throw new ApiProblem(422, "VALIDATION", "Proposal attachment references are invalid");
  }
}

export function mergeProposalContent(
  current: ProposalContentResource,
  patch: ProposalContentPatch,
): ProposalContentResource {
  if (Object.keys(patch).length === 0) {
    throw new ApiProblem(422, "VALIDATION", "At least one proposal field is required");
  }
  const merged = {
    ...current,
    ...patch,
    ...(patch.technologies === undefined ? {} : { technologies: [...patch.technologies] }),
    ...(patch.attachment_ids === undefined ? {} : { attachment_ids: [...patch.attachment_ids] }),
  };
  validateContent(merged);
  return merged;
}

export function changedProposalFields(
  previous: ProposalContentResource,
  next: ProposalContentResource,
): readonly string[] {
  return proposalContentFields.filter(
    (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
  );
}

export function proposalContentHash(content: ProposalContentResource): string {
  return commandFingerprint(content);
}

function contractContentToDomain(content: ProposalContentResource): ProposalContent {
  return {
    title: content.title,
    problemStatement: content.problem_statement,
    valueProposition: content.value_proposition,
    maturityLevel: content.maturity_level,
    prototypeWeeks: content.prototype_weeks,
    technologies: content.technologies,
    technicalApproach: content.technical_approach,
    architecture: content.architecture,
    dataNeeds: content.data_needs,
    successMetrics: content.success_metrics,
    ipStatus: content.ip_status,
    durationWeeks: content.duration_weeks,
    roadmap: content.roadmap,
    dependencies: content.dependencies,
    pilotLocation: content.pilot_location,
    risks: content.risks,
    mitigation: content.mitigation,
    leadName: content.lead_name,
    teamSummary: content.team_summary,
    relevantExperience: content.relevant_experience,
    budgetAmountMinor: content.budget_amount_minor,
    budgetCurrency: content.budget_currency,
    paymentModel: content.payment_model,
    budgetRationale: content.budget_rationale,
    startAvailability: content.start_availability,
    teamAvailability: content.team_availability,
    ndaAccepted: content.nda_accepted,
    conflictDeclared: content.conflict_declared,
    ipAccepted: content.ip_accepted,
    accuracyConfirmed: content.accuracy_confirmed,
    attachmentIds: content.attachment_ids,
  };
}

export function proposalReadiness(
  content: ProposalContentResource,
  version: number,
  declarations?: ProposalDeclarationRequirements,
): ProposalReadinessResource {
  return {
    ...evaluateProposalReadiness(contractContentToDomain(content), declarations),
    evaluated_version: version,
  };
}

export function assertProposalContent(value: unknown): asserts value is ProposalContentResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned invalid proposal content");
  }
  const candidate = value as Record<string, unknown>;
  if (!proposalContentFields.every((field) => Object.hasOwn(candidate, field))) {
    throw new Error("Database returned incomplete proposal content");
  }
  const content = value as ProposalContentResource;
  validateContent(content);
}
