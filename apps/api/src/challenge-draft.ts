import type {
  ApiReadiness,
  ChallengeApprovalBriefContentResource,
  ChallengeDraftContentResource,
  ChallengeDraftPatch,
  ChallengePublicProjectionResource,
  PublicationReadinessResource,
} from "@rahhal/contracts";
import {
  applicantScopeForTypes,
  evaluateChallengeReadiness,
  evaluateChallengeTriageReadiness,
  isApplicantScope,
  isMoneyAmountMinor,
  isPubliclyProjectable,
  publicationGatePreconditions,
  type ChallengeDraftContent,
  type ChallengeId,
  type ChallengePublicationState,
  type ChallengeVersionId,
  type PublicationGate,
} from "@rahhal/domain";

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
  verification_required: false,
  nda_required: false,
  document_gate_required: false,
  ip_terms: null,
  contact: { name: "", email: "", phone: "" },
  accuracy_confirmed: false,
  legal_notes: "",
  attachment_ids: [],
});

export function challengeReadiness(
  content: ChallengeDraftContentResource,
  aggregateVersion: number,
): ApiReadiness {
  return {
    ...evaluateChallengeReadiness(contractContentToDomain(content)),
    evaluated_version: aggregateVersion,
  };
}

function contractContentToDomain(content: ChallengeDraftContentResource): ChallengeDraftContent {
  return {
    title: content.title,
    summary: content.summary,
    category: content.category,
    location: content.location,
    desiredOutcome: content.desired_outcome,
    currentState: content.current_state,
    consequence: content.consequence,
    expectedOutput: content.expected_output,
    successCriteria: content.success_criteria,
    inScope: content.in_scope,
    constraints: content.constraints,
    organizationSupport: content.organization_support,
    previousAttempts: content.previous_attempts,
    outputType: content.output_type,
    sourcingModel: content.sourcing_model,
    applicantScope: content.applicant_scope,
    allowedApplicantTypes: content.allowed_applicant_types,
    workMode: content.work_mode,
    proposalDeadline: content.proposal_deadline,
    preferredStartDate: content.preferred_start_date,
    budget: {
      status: content.budget.status,
      amountMinor: content.budget.amount_minor,
      currency: content.budget.currency,
    },
    invitees: content.invitees,
    visibility: content.visibility,
    publicSummary: content.public_summary,
    verificationRequired: content.verification_required,
    ndaRequired: content.nda_required,
    documentGateRequired: content.document_gate_required,
    ipTerms: content.ip_terms,
    contact: content.contact,
    accuracyConfirmed: content.accuracy_confirmed,
    legalNotes: content.legal_notes,
    attachmentIds: content.attachment_ids,
  };
}

export function challengeTriageReadiness(
  content: ChallengeDraftContentResource,
  version: number,
): ApiReadiness {
  const readiness = evaluateChallengeTriageReadiness(contractContentToDomain(content));
  return { ...readiness, evaluated_version: version };
}

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

export function assertEligibilityRuleAttachable(
  content: ChallengeDraftContentResource,
  now: Date,
): void {
  if (
    content.proposal_deadline !== null &&
    new Date(content.proposal_deadline).getTime() <= now.getTime()
  ) {
    throw new ApiProblem(422, "VALIDATION", "Proposal deadline must be in the future", {
      fields: [
        {
          path: "/content/proposal_deadline",
          code: "future",
          message: "Proposal deadline must be in the future while the challenge is editable",
        },
      ],
    });
  }
}

/**
 * The transition preconditions the server can actually attest to right now.
 *
 * `canTransition` fails closed on any precondition it is not handed, so this
 * must never simply echo back the precondition of the transition being
 * attempted — doing so makes the check a tautology that silently auto-satisfies
 * any precondition added to `challengeTransitions` later.
 *
 * `brief-valid`/`formulation-complete` are attested by the shared readiness
 * contract. `triage-passed` has no authoritative record yet (no triage-outcome
 * entity is modelled before a later milestone), so reaching the `triage` stage
 * is the only signal that exists for it; that is stated here rather than hidden
 * behind a precondition that appears to be enforced.
 *
 * The four `*-approved`/`quality-passed` preconditions on `approvals ->
 * published` are attested by the recorded gates themselves (B2), and only ever
 * by gates whose decision is `approved` — `publicationReadiness.satisfied`
 * already excludes a recorded rejection.
 */
export function satisfiedTransitionPreconditions(
  stage: string,
  readiness: ApiReadiness,
  publicationReadiness?: PublicationReadinessResource,
): readonly string[] {
  return [
    ...(readiness.ready ? ["brief-valid", "formulation-complete"] : []),
    ...(stage === "triage" ? ["triage-passed"] : []),
    ...(publicationReadiness?.satisfied ?? []).map((gate) => publicationGatePreconditions[gate]),
  ];
}

export function challengeApprovalBriefContent(
  content: ChallengeDraftContentResource,
  gate: PublicationGate,
): ChallengeApprovalBriefContentResource {
  const common = {
    title: content.title,
    summary: content.summary,
    category: content.category,
  };
  if (gate === "finance") {
    return {
      ...common,
      sourcing_model: content.sourcing_model,
      proposal_deadline: content.proposal_deadline,
      preferred_start_date: content.preferred_start_date,
      budget: content.budget,
    };
  }
  if (gate === "legal") {
    return {
      ...common,
      visibility: content.visibility,
      public_summary: content.public_summary,
      nda_required: content.nda_required,
      ip_terms: content.ip_terms,
      legal_notes: content.legal_notes,
    };
  }
  if (gate === "quality") {
    return {
      ...common,
      location: content.location,
      sourcing_model: content.sourcing_model,
      applicant_scope: content.applicant_scope,
      allowed_applicant_types: content.allowed_applicant_types,
      proposal_deadline: content.proposal_deadline,
      visibility: content.visibility,
      public_summary: content.public_summary,
      verification_required: content.verification_required,
      nda_required: content.nda_required,
      document_gate_required: content.document_gate_required,
      accuracy_confirmed: content.accuracy_confirmed,
    };
  }
  return {
    ...common,
    desired_outcome: content.desired_outcome,
    current_state: content.current_state,
    consequence: content.consequence,
    expected_output: content.expected_output,
    success_criteria: content.success_criteria,
    in_scope: content.in_scope,
    constraints: content.constraints,
    organization_support: content.organization_support,
    previous_attempts: content.previous_attempts,
    output_type: content.output_type,
    work_mode: content.work_mode,
  };
}

/**
 * Projects one approved challenge version onto the public allowlist
 * (`challengePublicProjectionFields`). Every field is named explicitly — there
 * is no spread of the private content — so a confidential field added to the
 * aggregate stays out of the public surface unless someone deliberately adds
 * it here, to the contract type, to the JSON schema, and to a database column.
 *
 * The non-null assertions are not optimism: publication is gated on
 * `evaluateChallengeReadiness`, which already requires every one of these
 * fields. The throw exists so that a future readiness change that drops one of
 * them fails loudly here instead of writing a half-empty public row.
 */
export function challengePublicProjection(
  challengeId: ChallengeId,
  challengeVersionId: ChallengeVersionId,
  content: ChallengeDraftContentResource,
  publishedAt: string,
  state: ChallengePublicationState,
): ChallengePublicProjectionResource {
  const {
    output_type: outputType,
    sourcing_model: sourcingModel,
    applicant_scope: applicantScope,
    work_mode: workMode,
    proposal_deadline: proposalDeadline,
    visibility,
    ip_terms: ipTerms,
  } = content;
  if (
    outputType === null ||
    sourcingModel === null ||
    applicantScope === null ||
    workMode === null ||
    proposalDeadline === null ||
    ipTerms === null ||
    !isPubliclyProjectable(visibility)
  ) {
    throw new Error("A publishable challenge version is missing a required public field");
  }
  return {
    challenge_id: challengeId,
    challenge_version_id: challengeVersionId,
    title: content.title,
    category: content.category,
    location: content.location,
    public_summary: content.public_summary,
    output_type: outputType,
    sourcing_model: sourcingModel,
    applicant_scope: applicantScope,
    allowed_applicant_types: content.allowed_applicant_types,
    work_mode: workMode,
    proposal_deadline: proposalDeadline,
    preferred_start_date: content.preferred_start_date,
    budget: content.budget,
    visibility,
    verification_required: content.verification_required,
    nda_required: content.nda_required,
    document_gate_required: content.document_gate_required,
    ip_terms: ipTerms,
    state,
    published_at: publishedAt,
  };
}
