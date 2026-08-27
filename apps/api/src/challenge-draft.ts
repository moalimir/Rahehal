import type { ChallengeDraftContentResource, ChallengeDraftPatch } from "@rahhal/contracts";
import { applicantScopeForTypes, isApplicantScope, isMoneyAmountMinor } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";

export const emptyChallengeContent = (): ChallengeDraftContentResource => ({
  title: "",
  summary: "",
  category: "",
  location: "",
  desired_outcome: "",
  current_state: "",
  consequence: "",
  expected_output: "",
  success_criteria: [],
  in_scope: "",
  constraints: "",
  organization_support: "",
  previous_attempts: "",
  output_type: null,
  sourcing_model: null,
  applicant_scope: null,
  allowed_applicant_types: [],
  work_mode: null,
  proposal_deadline: null,
  preferred_start_date: null,
  budget: { status: "undecided", amount_minor: null, currency: "IRR" },
  invitees: [],
  visibility: null,
  public_summary: "",
  nda_required: false,
  ip_terms: null,
  contact: { name: "", email: "", phone: "" },
  accuracy_confirmed: false,
  legal_notes: "",
  attachment_ids: [],
});

export function mergeChallengeDraftPatch(
  current: ChallengeDraftContentResource,
  patch: ChallengeDraftPatch,
): {
  content: ChallengeDraftContentResource;
  authoringStatus?: ChallengeDraftPatch["authoring_status"];
} {
  const { authoring_status: authoringStatus, ...contentPatch } = patch;
  if (
    contentPatch.applicant_scope !== undefined &&
    contentPatch.applicant_scope !== null &&
    !isApplicantScope(contentPatch.applicant_scope)
  ) {
    throw new ApiProblem(422, "VALIDATION", "Applicant scope is invalid", {
      fields: [
        {
          path: "/patch/applicant_scope",
          code: "enum",
          message: "Expected person, team, both, or null",
        },
      ],
    });
  }
  if (
    contentPatch.budget?.amount_minor !== undefined &&
    contentPatch.budget.amount_minor !== null &&
    !isMoneyAmountMinor(contentPatch.budget.amount_minor)
  ) {
    throw new ApiProblem(422, "VALIDATION", "Budget amount must be a safe minor-unit integer", {
      fields: [
        {
          path: "/patch/budget/amount_minor",
          code: "maximum",
          message: `Expected at most ${Number.MAX_SAFE_INTEGER}`,
        },
      ],
    });
  }
  const mergedContent = { ...current, ...contentPatch };
  const derivedApplicantScope = applicantScopeForTypes(mergedContent.allowed_applicant_types);
  if (
    contentPatch.applicant_scope !== undefined &&
    contentPatch.applicant_scope !== derivedApplicantScope
  ) {
    throw new ApiProblem(422, "VALIDATION", "Applicant scope must match allowed applicant types", {
      fields: [
        {
          path: "/patch/applicant_scope",
          code: "derived_value",
          message: "Applicant scope is derived from allowed_applicant_types",
        },
      ],
    });
  }
  return {
    content: { ...mergedContent, applicant_scope: derivedApplicantScope },
    ...(authoringStatus === undefined ? {} : { authoringStatus }),
  };
}
