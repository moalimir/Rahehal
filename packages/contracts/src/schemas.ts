import {
  reviewStates,
  reviewCoiStates,
  reviewCoiRelationshipCategories,
  applicantScopes,
  applicantTypes,
  approvalDecisions,
  challengeManagedStages,
  challengeStages,
  challengePublicationStates,
  challengeBudgetStatuses,
  challengeDraftAuthoringStatuses,
  challengeIpTerms,
  challengeOutputTypes,
  challengeSourcingModels,
  challengeVisibilities,
  challengeWorkModes,
  currencies,
  directOfferStates,
  eligibilityGateKinds,
  eligibilityNextActions,
  eligibilityReasonCodes,
  membershipStates,
  organizationRoles,
  offerResponseStates,
  platformRoles,
  notificationKinds,
  proposalStates,
  publicationGates,
  teamInvitationStates,
  teamKinds,
  teamMembershipRequestStates,
  teamNonOwnerRoles,
  teamRoles,
  teamStatuses,
  workspaceKinds,
  workspaceRoles,
  verificationStates,
  contactVerificationChannels,
  solverStartIntents,
  evaluationReadinessBlockers,
  evaluationRosterProposalStates,
  decisionOutcomes,
  decisionReasonCodes,
  proposalDecisionOutcomes,
} from "@rahhal/domain";

import { apiErrorCodes } from "./envelopes.js";
import { teamJoinModes } from "./team.js";

export type JsonSchema = boolean | Readonly<Record<string, unknown>>;

const idSchema = (prefix: string): JsonSchema => ({
  type: "string",
  pattern: `^${prefix}_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`,
});

const dateTimeSchema = { type: "string", format: "date-time" } as const;
const nullableDateTimeSchema = { type: ["string", "null"], format: "date-time" } as const;
const shortTextSchema = { type: "string", maxLength: 500 } as const;
const longTextSchema = { type: "string", maxLength: 20_000 } as const;

const apiMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["server_time", "correlation_id"],
  properties: {
    server_time: dateTimeSchema,
    correlation_id: idSchema("cor"),
    entity_version: { type: "integer", minimum: 0 },
  },
} as const;

const versionedApiMetaSchema = {
  ...apiMetaSchema,
  required: ["server_time", "correlation_id", "entity_version"],
} as const;

const workspaceContextResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tenant_id", "workspace_id", "workspace_kind"],
  properties: {
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    workspace_kind: { type: "string", enum: workspaceKinds },
  },
} as const;

const userResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "display_name",
    "primary_email",
    "email_verified",
    "primary_phone",
    "phone_verified",
  ],
  properties: {
    id: idSchema("usr"),
    display_name: { type: "string", minLength: 1, maxLength: 200 },
    primary_email: {
      anyOf: [{ type: "string", format: "email", maxLength: 320 }, { type: "null" }],
    },
    email_verified: { type: "boolean" },
    primary_phone: {
      anyOf: [{ type: "string", pattern: "^09[0-9]{9}$", maxLength: 40 }, { type: "null" }],
    },
    phone_verified: { type: "boolean" },
  },
} as const;

const organizationWorkspaceResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenant_id", "kind", "name"],
  properties: {
    id: idSchema("wsp"),
    tenant_id: idSchema("ten"),
    kind: { const: "org" },
    name: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

const platformWorkspaceResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenant_id", "kind", "name"],
  properties: {
    id: idSchema("wsp"),
    tenant_id: idSchema("ten"),
    kind: { const: "platform" },
    name: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

const individualWorkspaceResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenant_id", "kind", "name", "owner_user_id"],
  properties: {
    id: idSchema("wsp"),
    tenant_id: idSchema("ten"),
    kind: { const: "individual" },
    name: { type: "string", minLength: 1, maxLength: 200 },
    owner_user_id: idSchema("usr"),
  },
} as const;

const teamWorkspaceResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "tenant_id", "kind", "name", "team_kind", "owner_user_id"],
  properties: {
    id: idSchema("wsp"),
    tenant_id: idSchema("ten"),
    kind: { const: "team" },
    name: { type: "string", minLength: 1, maxLength: 200 },
    team_kind: { type: "string", enum: teamKinds },
    owner_user_id: idSchema("usr"),
  },
} as const;

const workspaceResourceSchema = {
  oneOf: [
    platformWorkspaceResourceSchema,
    organizationWorkspaceResourceSchema,
    individualWorkspaceResourceSchema,
    teamWorkspaceResourceSchema,
  ],
  discriminator: { propertyName: "kind" },
} as const;

const membershipResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenant_id",
    "workspace_id",
    "user_id",
    "role",
    "state",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("mem"),
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    user_id: idSchema("usr"),
    role: {
      type: "string",
      enum: [...platformRoles, ...organizationRoles, ...teamRoles, "individual"],
    },
    state: { type: "string", enum: membershipStates },
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const sessionTokenSetSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_id",
    "access_token",
    "refresh_token",
    "token_type",
    "access_token_expires_at",
    "refresh_token_expires_at",
  ],
  properties: {
    session_id: idSchema("ses"),
    access_token: { type: "string", minLength: 16 },
    refresh_token: { type: "string", minLength: 16 },
    token_type: { const: "Bearer" },
    access_token_expires_at: dateTimeSchema,
    refresh_token_expires_at: dateTimeSchema,
  },
} as const;

const contactVerificationAttemptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "attempt_id",
    "channel",
    "masked_destination",
    "state",
    "version",
    "expires_at",
    "resend_available_at",
    "attempts_remaining",
  ],
  properties: {
    attempt_id: idSchema("otp"),
    channel: { type: "string", enum: contactVerificationChannels },
    masked_destination: { type: "string", minLength: 3, maxLength: 320 },
    state: { type: "string", enum: ["pending", "verified"] },
    version: { type: "integer", minimum: 1 },
    expires_at: dateTimeSchema,
    resend_available_at: dateTimeSchema,
    attempts_remaining: { type: "integer", minimum: 0, maximum: 5 },
  },
} as const;

const solverActivationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "user_id",
    "tenant_id",
    "individual_workspace_id",
    "start_intent",
    "version",
    "activated_at",
  ],
  properties: {
    id: idSchema("act"),
    user_id: idSchema("usr"),
    tenant_id: idSchema("ten"),
    individual_workspace_id: idSchema("wsp"),
    start_intent: { type: "string", enum: solverStartIntents },
    version: { const: 1 },
    activated_at: dateTimeSchema,
  },
} as const;

const meResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["user", "memberships", "workspaces", "active_context"],
  properties: {
    user: userResourceSchema,
    memberships: { type: "array", items: membershipResourceSchema },
    workspaces: { type: "array", items: workspaceResourceSchema },
    active_context: { oneOf: [workspaceContextResourceSchema, { type: "null" }] },
  },
} as const;

const successCriterionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "target", "method"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 100 },
    title: shortTextSchema,
    target: shortTextSchema,
    method: longTextSchema,
  },
} as const;

const budgetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "amount_minor", "currency"],
  properties: {
    status: { type: "string", enum: challengeBudgetStatuses },
    amount_minor: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    currency: { type: "string", enum: currencies },
  },
} as const;

const contactSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "email", "phone"],
  properties: {
    name: { type: "string", maxLength: 200 },
    email: {
      anyOf: [{ const: "" }, { type: "string", format: "email", maxLength: 320 }],
    },
    phone: { type: "string", maxLength: 40 },
  },
} as const;

const challengeContentProperties = {
  title: { type: "string", maxLength: 240 },
  summary: { type: "string", maxLength: 4_000 },
  category: shortTextSchema,
  location: shortTextSchema,
  desired_outcome: longTextSchema,
  current_state: longTextSchema,
  consequence: longTextSchema,
  expected_output: longTextSchema,
  success_criteria: {
    type: "array",
    maxItems: 100,
    items: successCriterionSchema,
  },
  in_scope: longTextSchema,
  constraints: longTextSchema,
  organization_support: longTextSchema,
  previous_attempts: longTextSchema,
  output_type: { type: ["string", "null"], enum: [...challengeOutputTypes, null] },
  sourcing_model: { type: ["string", "null"], enum: [...challengeSourcingModels, null] },
  applicant_scope: {
    type: ["string", "null"],
    enum: [...applicantScopes, null],
    description:
      "Derived from allowed_applicant_types. Compatibility input is accepted only when equal to the derived value.",
  },
  allowed_applicant_types: {
    type: "array",
    uniqueItems: true,
    items: { type: "string", enum: applicantTypes },
  },
  work_mode: { type: ["string", "null"], enum: [...challengeWorkModes, null] },
  proposal_deadline: nullableDateTimeSchema,
  preferred_start_date: nullableDateTimeSchema,
  budget: budgetSchema,
  invitees: {
    type: "array",
    uniqueItems: true,
    maxItems: 500,
    items: { type: "string", maxLength: 320 },
  },
  visibility: { type: ["string", "null"], enum: [...challengeVisibilities, null] },
  public_summary: { type: "string", maxLength: 4_000 },
  verification_required: { type: "boolean" },
  nda_required: { type: "boolean" },
  document_gate_required: { type: "boolean" },
  ip_terms: { type: ["string", "null"], enum: [...challengeIpTerms, null] },
  contact: contactSchema,
  accuracy_confirmed: { type: "boolean" },
  legal_notes: longTextSchema,
  attachment_ids: {
    type: "array",
    uniqueItems: true,
    maxItems: 100,
    items: idSchema("fil"),
  },
} as const;

const challengeContentRequired = [
  "title",
  "summary",
  "category",
  "location",
  "desired_outcome",
  "current_state",
  "consequence",
  "expected_output",
  "success_criteria",
  "in_scope",
  "constraints",
  "organization_support",
  "previous_attempts",
  "output_type",
  "sourcing_model",
  "applicant_scope",
  "allowed_applicant_types",
  "work_mode",
  "proposal_deadline",
  "preferred_start_date",
  "budget",
  "invitees",
  "visibility",
  "public_summary",
  "verification_required",
  "nda_required",
  "document_gate_required",
  "ip_terms",
  "contact",
  "accuracy_confirmed",
  "legal_notes",
  "attachment_ids",
] as const;

const challengeDraftContentSchema = {
  type: "object",
  additionalProperties: false,
  required: challengeContentRequired,
  properties: challengeContentProperties,
} as const;

const challengeDraftPatchSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    ...challengeContentProperties,
    authoring_status: { type: "string", enum: challengeDraftAuthoringStatuses },
  },
} as const;

const challengeReadinessIssueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "code", "message", "step"],
  properties: {
    path: { type: "string", maxLength: 500 },
    code: { type: "string", maxLength: 100 },
    message: { type: "string", maxLength: 2_000 },
    step: { type: "integer", minimum: 1, maximum: 4 },
  },
} as const;

const challengeReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "evaluated_version", "issues"],
  properties: {
    ready: { type: "boolean" },
    evaluated_version: { type: "integer", minimum: 1 },
    issues: { type: "array", items: challengeReadinessIssueSchema },
  },
} as const;

const proposalContentProperties = {
  title: { type: "string", maxLength: 240 },
  problem_statement: longTextSchema,
  value_proposition: longTextSchema,
  maturity_level: shortTextSchema,
  prototype_weeks: { type: "string", maxLength: 20 },
  technologies: {
    type: "array",
    uniqueItems: true,
    maxItems: 100,
    items: shortTextSchema,
  },
  technical_approach: longTextSchema,
  architecture: longTextSchema,
  data_needs: longTextSchema,
  success_metrics: longTextSchema,
  ip_status: shortTextSchema,
  duration_weeks: { type: "string", maxLength: 20 },
  roadmap: longTextSchema,
  dependencies: longTextSchema,
  pilot_location: shortTextSchema,
  risks: longTextSchema,
  mitigation: longTextSchema,
  lead_name: { type: "string", maxLength: 200 },
  team_summary: longTextSchema,
  relevant_experience: longTextSchema,
  budget_amount_minor: {
    type: ["integer", "null"],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  },
  budget_currency: { type: "string", enum: currencies },
  payment_model: shortTextSchema,
  budget_rationale: longTextSchema,
  start_availability: shortTextSchema,
  team_availability: shortTextSchema,
  nda_accepted: { type: "boolean" },
  conflict_declared: { type: "boolean" },
  ip_accepted: { type: "boolean" },
  accuracy_confirmed: { type: "boolean" },
  attachment_ids: {
    type: "array",
    uniqueItems: true,
    maxItems: 100,
    items: idSchema("fil"),
    description: "Opaque metadata references only; C3 does not authorize or store file content.",
  },
} as const;

const proposalContentRequired = [
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
] as const;

const proposalContentSchema = {
  type: "object",
  additionalProperties: false,
  required: proposalContentRequired,
  properties: proposalContentProperties,
} as const;

const proposalContentPatchSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: proposalContentProperties,
} as const;

const proposalReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "evaluated_version", "issues"],
  properties: {
    ready: { type: "boolean" },
    evaluated_version: { type: "integer", minimum: 1 },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "code", "message"],
        properties: {
          path: { type: "string", maxLength: 500 },
          code: { type: "string", enum: ["required", "min_length", "format"] },
          message: { type: "string", maxLength: 2_000 },
        },
      },
    },
  },
} as const;

const proposalVersionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "version_number",
    "base_version_id",
    "accepted_challenge_version_id",
    "changed_fields",
    "content_hash",
    "locked",
    "actor_user_id",
    "created_at",
  ],
  properties: {
    id: idSchema("prv"),
    version_number: { type: "integer", minimum: 1 },
    base_version_id: { oneOf: [idSchema("prv"), { type: "null" }] },
    accepted_challenge_version_id: { oneOf: [idSchema("chv"), { type: "null" }] },
    changed_fields: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: proposalContentRequired },
    },
    content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
    locked: { type: "boolean" },
    actor_user_id: idSchema("usr"),
    created_at: dateTimeSchema,
  },
} as const;

const proposalClarificationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "proposal_version_id",
    "state",
    "question",
    "response",
    "resolution",
    "requested_at",
    "submitted_at",
    "resolved_at",
  ],
  properties: {
    id: idSchema("pcl"),
    proposal_version_id: idSchema("prv"),
    state: { type: "string", enum: ["requested", "submitted", "resolved"] },
    question: { type: "string", minLength: 1, maxLength: 10_000 },
    response: { type: ["string", "null"], minLength: 1, maxLength: 20_000 },
    resolution: { type: ["string", "null"], minLength: 1, maxLength: 10_000 },
    requested_at: dateTimeSchema,
    submitted_at: nullableDateTimeSchema,
    resolved_at: nullableDateTimeSchema,
  },
} as const;

const proposalRevisionRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "base_version_id",
    "resubmitted_version_id",
    "state",
    "scope",
    "revision_deadline",
    "requested_at",
    "started_at",
    "resubmitted_at",
  ],
  properties: {
    id: idSchema("prr"),
    base_version_id: idSchema("prv"),
    resubmitted_version_id: { oneOf: [idSchema("prv"), { type: "null" }] },
    state: { type: "string", enum: ["requested", "in_progress", "resubmitted"] },
    scope: { type: "string", minLength: 1, maxLength: 10_000 },
    revision_deadline: dateTimeSchema,
    requested_at: dateTimeSchema,
    started_at: nullableDateTimeSchema,
    resubmitted_at: nullableDateTimeSchema,
  },
} as const;

const proposalResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "current_version_id",
    "tenant_id",
    "owner_workspace_id",
    "owner_workspace_kind",
    "challenge_id",
    "assigned_membership_ids",
    "state",
    "tracking_code",
    "version",
    "readiness",
    "content",
    "versions",
    "clarifications",
    "revision_requests",
    "submitted_at",
    "created_by",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("prp"),
    current_version_id: idSchema("prv"),
    tenant_id: idSchema("ten"),
    owner_workspace_id: idSchema("wsp"),
    owner_workspace_kind: { type: "string", enum: ["individual", "team"] },
    challenge_id: idSchema("chl"),
    assigned_membership_ids: {
      type: "array",
      uniqueItems: true,
      items: idSchema("mem"),
    },
    state: { type: "string", enum: proposalStates },
    tracking_code: { type: ["string", "null"], maxLength: 100 },
    version: { type: "integer", minimum: 1 },
    readiness: proposalReadinessSchema,
    content: proposalContentSchema,
    versions: { type: "array", minItems: 1, items: proposalVersionSchema },
    clarifications: { type: "array", items: proposalClarificationSchema },
    revision_requests: { type: "array", items: proposalRevisionRequestSchema },
    submitted_at: nullableDateTimeSchema,
    created_by: idSchema("usr"),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const organizationProposalVersionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "version_number",
    "base_version_id",
    "accepted_challenge_version_id",
    "changed_fields",
    "content_hash",
    "locked_at",
  ],
  properties: {
    id: idSchema("prv"),
    version_number: { type: "integer", minimum: 2 },
    base_version_id: idSchema("prv"),
    accepted_challenge_version_id: idSchema("chv"),
    changed_fields: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: proposalContentRequired },
    },
    content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
    locked_at: dateTimeSchema,
  },
} as const;

const proposalListItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "challenge_id",
    "state",
    "tracking_code",
    "version",
    "readiness",
    "submitted_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("prp"),
    challenge_id: idSchema("chl"),
    state: { type: "string", enum: proposalStates },
    tracking_code: { type: ["string", "null"], maxLength: 100 },
    version: { type: "integer", minimum: 1 },
    readiness: proposalReadinessSchema,
    submitted_at: nullableDateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const proposalListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: proposalListItemSchema } },
} as const;

const organizationProposalInboxItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "challenge_id",
    "owner_workspace_kind",
    "state",
    "tracking_code",
    "submitted_at",
    "submitted_version",
  ],
  properties: {
    id: idSchema("prp"),
    challenge_id: idSchema("chl"),
    owner_workspace_kind: { type: "string", enum: ["individual", "team"] },
    state: { type: "string", enum: proposalStates },
    tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    submitted_at: dateTimeSchema,
    submitted_version: organizationProposalVersionSchema,
  },
} as const;

const organizationProposalResourceSchema = {
  ...organizationProposalInboxItemSchema,
  required: [
    ...organizationProposalInboxItemSchema.required,
    "version",
    "content",
    "clarifications",
    "revision_requests",
  ],
  properties: {
    ...organizationProposalInboxItemSchema.properties,
    version: { type: "integer", minimum: 1 },
    content: proposalContentSchema,
    clarifications: { type: "array", items: proposalClarificationSchema },
    revision_requests: { type: "array", items: proposalRevisionRequestSchema },
  },
} as const;

const reviewAssignmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "state",
    "coi_status",
    "pre_coi_packet",
    "coi_declaration",
    "due_at",
    "overdue",
    "version",
  ],
  properties: {
    id: idSchema("rva"),
    state: { type: "string", enum: reviewStates },
    coi_status: { type: "string", enum: reviewCoiStates },
    pre_coi_packet: {
      type: "object",
      additionalProperties: false,
      required: ["organization_name", "challenge_title"],
      properties: {
        organization_name: { type: "string", minLength: 1, maxLength: 200 },
        challenge_title: { type: "string", minLength: 1, maxLength: 500 },
      },
    },
    coi_declaration: {
      type: "object",
      additionalProperties: false,
      required: ["status", "relationship_categories", "reason", "declared_at"],
      properties: {
        status: { type: "string", enum: reviewCoiStates },
        relationship_categories: {
          type: "array",
          uniqueItems: true,
          maxItems: reviewCoiRelationshipCategories.length,
          items: { type: "string", enum: reviewCoiRelationshipCategories },
        },
        reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
        declared_at: nullableDateTimeSchema,
      },
    },
    due_at: dateTimeSchema,
    overdue: { type: "boolean" },
    version: { type: "integer", minimum: 1 },
  },
} as const;

const reviewScoreSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criterion_id", "value", "rationale"],
  properties: {
    criterion_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
    value: { type: "integer", minimum: 0, maximum: 5 },
    rationale: { type: "string", maxLength: 4_000 },
  },
} as const;
const operationsReviewSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "version",
    "weighted_score_tenths",
    "submitted_at",
    "lock_reason",
    "locked_at",
    "invalidated_at",
    "invalidation_reason",
  ],
  properties: {
    id: idSchema("rev"),
    version: { type: "integer", minimum: 1 },
    weighted_score_tenths: { type: ["integer", "null"], minimum: 0, maximum: 1_000 },
    submitted_at: nullableDateTimeSchema,
    lock_reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
    locked_at: nullableDateTimeSchema,
    invalidated_at: nullableDateTimeSchema,
    invalidation_reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
  },
} as const;
const reviewResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "assignment_id",
    "version",
    "state",
    "scores",
    "weighted_score_tenths",
    "submitted_at",
    "lock_reason",
    "locked_at",
    "invalidated_at",
    "invalidation_reason",
  ],
  properties: {
    ...operationsReviewSummarySchema.properties,
    assignment_id: idSchema("rva"),
    state: { type: "string", enum: ["draft", "submitted", "locked", "invalidated"] },
    scores: { type: "array", maxItems: 20, items: reviewScoreSchema },
  },
} as const;

const operationsReviewConflictSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "assignment_id",
    "reviewer_membership_id",
    "reviewer_user_id",
    "reviewer_display_name",
    "organization_name",
    "challenge_title",
    "relationship_categories",
    "reason",
    "declared_at",
    "assignment_version",
  ],
  properties: {
    assignment_id: idSchema("rva"),
    reviewer_membership_id: idSchema("mem"),
    reviewer_user_id: idSchema("usr"),
    reviewer_display_name: { type: "string", minLength: 1, maxLength: 200 },
    organization_name: { type: "string", minLength: 1, maxLength: 200 },
    challenge_title: { type: "string", minLength: 1, maxLength: 500 },
    relationship_categories: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      maxItems: reviewCoiRelationshipCategories.length,
      items: { type: "string", enum: reviewCoiRelationshipCategories },
    },
    reason: { type: "string", minLength: 1, maxLength: 2_000 },
    declared_at: dateTimeSchema,
    assignment_version: { type: "integer", minimum: 2 },
  },
} as const;

const operationsReviewConflictListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", maxItems: 500, items: operationsReviewConflictSchema } },
} as const;
const reviewAssignmentListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: { type: "array", maxItems: 100, items: reviewAssignmentSchema },
    next_cursor: idSchema("rva"),
  },
} as const;

const reviewerCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["membership_id", "user_id", "display_name", "active_assignment_count"],
  properties: {
    membership_id: idSchema("mem"),
    user_id: idSchema("usr"),
    display_name: { type: "string", minLength: 1, maxLength: 200 },
    active_assignment_count: { type: "integer", minimum: 0 },
  },
} as const;

const operationsReviewAssignmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    ...reviewAssignmentSchema.required,
    "challenge_id",
    "proposal_id",
    "proposal_version_id",
    "proposal_tracking_code",
    "rubric_version_id",
    "reviewer_membership_id",
    "reviewer_user_id",
    "reviewer_display_name",
    "replaces_assignment_id",
    "cancellation_reason",
    "cancelled_at",
    "review_summary",
  ],
  properties: {
    ...reviewAssignmentSchema.properties,
    challenge_id: idSchema("chl"),
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    proposal_tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    rubric_version_id: idSchema("rbv"),
    reviewer_membership_id: idSchema("mem"),
    reviewer_user_id: idSchema("usr"),
    reviewer_display_name: { type: "string", minLength: 1, maxLength: 200 },
    replaces_assignment_id: { oneOf: [idSchema("rva"), { type: "null" }] },
    cancellation_reason: { type: ["string", "null"], maxLength: 2_000 },
    cancelled_at: nullableDateTimeSchema,
    review_summary: { oneOf: [operationsReviewSummarySchema, { type: "null" }] },
  },
} as const;

const operationsEvaluationProposalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "proposal_id",
    "proposal_version_id",
    "proposal_tracking_code",
    "rubric_version_id",
    "evaluation_version",
    "required_reviews",
    "active_assignment_count",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    proposal_tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    rubric_version_id: idSchema("rbv"),
    evaluation_version: { type: "integer", minimum: 1 },
    required_reviews: { const: 2 },
    active_assignment_count: { type: "integer", minimum: 0, maximum: 2 },
  },
} as const;

const operationsReviewAssignmentListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evaluation_proposals", "assignments", "reviewers"],
  properties: {
    evaluation_proposals: {
      type: "array",
      maxItems: 500,
      items: operationsEvaluationProposalSchema,
    },
    assignments: { type: "array", maxItems: 500, items: operationsReviewAssignmentSchema },
    reviewers: { type: "array", maxItems: 500, items: reviewerCandidateSchema },
  },
} as const;

const notificationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenant_id",
    "workspace_id",
    "user_id",
    "kind",
    "subject_type",
    "subject_id",
    "read_at",
    "occurred_at",
  ],
  properties: {
    id: idSchema("ntf"),
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    user_id: idSchema("usr"),
    kind: { type: "string", enum: notificationKinds },
    subject_type: { type: "string", enum: ["proposal", "team", "direct_offer"] },
    subject_id: { type: "string", minLength: 5, maxLength: 80 },
    read_at: nullableDateTimeSchema,
    occurred_at: dateTimeSchema,
  },
} as const;

const notificationListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "unread_count"],
  properties: {
    items: { type: "array", items: notificationSchema },
    unread_count: { type: "integer", minimum: 0 },
    next_cursor: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

const notificationSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["unread_count"],
  properties: { unread_count: { type: "integer", minimum: 0 } },
} as const;

const organizationProposalInboxSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: organizationProposalInboxItemSchema } },
} as const;

const savedOpportunitySchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "challenge_id", "challenge_version_id", "version", "saved_at"],
  properties: {
    id: idSchema("sop"),
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    version: { const: 1 },
    saved_at: dateTimeSchema,
  },
} as const;

const savedOpportunityListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: savedOpportunitySchema } },
} as const;

const offerResponseContentProperties = {
  approach: longTextSchema,
  scope: longTextSchema,
  start_availability: shortTextSchema,
  duration_weeks: { type: ["integer", "null"], minimum: 1, maximum: 520 },
  budget_amount_minor: {
    type: ["integer", "null"],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  },
  budget_currency: { type: "string", enum: currencies },
  payment_model: shortTextSchema,
  negotiables: longTextSchema,
  authority_confirmed: { type: "boolean" },
  attachment_ids: {
    type: "array",
    uniqueItems: true,
    maxItems: 100,
    items: idSchema("fil"),
    description: "Opaque metadata references only; C6 does not authorize or store file content.",
  },
} as const;

const offerResponseContentRequired = [
  "approach",
  "scope",
  "start_availability",
  "duration_weeks",
  "budget_amount_minor",
  "budget_currency",
  "payment_model",
  "negotiables",
  "authority_confirmed",
  "attachment_ids",
] as const;

const offerResponseContentSchema = {
  type: "object",
  additionalProperties: false,
  required: offerResponseContentRequired,
  properties: offerResponseContentProperties,
} as const;

const offerResponseContentPatchSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: offerResponseContentProperties,
} as const;

const offerResponseReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "evaluated_version", "issues"],
  properties: {
    ready: { type: "boolean" },
    evaluated_version: { type: "integer", minimum: 1 },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "code", "message"],
        properties: {
          path: { type: "string", maxLength: 500 },
          code: { type: "string", enum: ["required", "min_length", "format"] },
          message: { type: "string", maxLength: 2_000 },
        },
      },
    },
  },
} as const;

const offerResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "state",
    "version",
    "content",
    "readiness",
    "submitted_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("ofr"),
    state: { type: "string", enum: offerResponseStates },
    version: { type: "integer", minimum: 1 },
    content: offerResponseContentSchema,
    readiness: offerResponseReadinessSchema,
    submitted_at: nullableDateTimeSchema,
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const directOfferSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "challenge_id",
    "challenge_version_id",
    "sender_organization_workspace_id",
    "recipient_workspace_id",
    "recipient_workspace_kind",
    "title",
    "summary",
    "invitation_reasons",
    "requested_documents",
    "response_deadline",
    "state",
    "version",
    "response",
    "viewed_at",
    "decline_reason",
    "declined_at",
    "cancellation_reason",
    "cancelled_at",
    "expired_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("dof"),
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    sender_organization_workspace_id: idSchema("wsp"),
    recipient_workspace_id: idSchema("wsp"),
    recipient_workspace_kind: { type: "string", enum: ["individual", "team"] },
    title: { type: "string", minLength: 1, maxLength: 240 },
    summary: { type: "string", minLength: 1, maxLength: 4_000 },
    invitation_reasons: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: shortTextSchema,
    },
    requested_documents: {
      type: "array",
      maxItems: 20,
      uniqueItems: true,
      items: shortTextSchema,
    },
    response_deadline: dateTimeSchema,
    state: { type: "string", enum: directOfferStates },
    version: { type: "integer", minimum: 1 },
    response: { oneOf: [offerResponseSchema, { type: "null" }] },
    viewed_at: nullableDateTimeSchema,
    decline_reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
    declined_at: nullableDateTimeSchema,
    cancellation_reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
    cancelled_at: nullableDateTimeSchema,
    expired_at: nullableDateTimeSchema,
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const directOfferListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: directOfferSchema } },
} as const;

const challengeApprovalResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "challenge_id",
    "challenge_version_id",
    "gate",
    "decision",
    "reason",
    "recorded_by",
    "recorded_by_role",
    "recorded_at",
  ],
  properties: {
    id: idSchema("cap"),
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    gate: { type: "string", enum: publicationGates },
    decision: { type: "string", enum: approvalDecisions },
    reason: { type: "string", minLength: 1, maxLength: 2_000 },
    recorded_by: idSchema("usr"),
    recorded_by_role: { type: "string", enum: workspaceRoles },
    recorded_at: dateTimeSchema,
  },
} as const;

const challengeApprovalBriefContentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "category"],
  properties: {
    title: challengeContentProperties.title,
    summary: challengeContentProperties.summary,
    category: challengeContentProperties.category,
    location: challengeContentProperties.location,
    desired_outcome: challengeContentProperties.desired_outcome,
    current_state: challengeContentProperties.current_state,
    consequence: challengeContentProperties.consequence,
    expected_output: challengeContentProperties.expected_output,
    success_criteria: challengeContentProperties.success_criteria,
    in_scope: challengeContentProperties.in_scope,
    constraints: challengeContentProperties.constraints,
    organization_support: challengeContentProperties.organization_support,
    previous_attempts: challengeContentProperties.previous_attempts,
    output_type: challengeContentProperties.output_type,
    sourcing_model: challengeContentProperties.sourcing_model,
    applicant_scope: challengeContentProperties.applicant_scope,
    allowed_applicant_types: challengeContentProperties.allowed_applicant_types,
    work_mode: challengeContentProperties.work_mode,
    proposal_deadline: challengeContentProperties.proposal_deadline,
    preferred_start_date: challengeContentProperties.preferred_start_date,
    budget: challengeContentProperties.budget,
    visibility: challengeContentProperties.visibility,
    public_summary: challengeContentProperties.public_summary,
    verification_required: challengeContentProperties.verification_required,
    nda_required: challengeContentProperties.nda_required,
    document_gate_required: challengeContentProperties.document_gate_required,
    ip_terms: challengeContentProperties.ip_terms,
    accuracy_confirmed: challengeContentProperties.accuracy_confirmed,
    legal_notes: challengeContentProperties.legal_notes,
  },
} as const;

const challengeApprovalSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "gate",
    "decision",
    "reason",
    "recorded_by_role",
    "recorded_at",
    "recorded_by_current_actor",
  ],
  properties: {
    gate: { type: "string", enum: publicationGates },
    decision: { type: "string", enum: approvalDecisions },
    reason: { type: "string", minLength: 1, maxLength: 2_000 },
    recorded_by_role: { type: "string", enum: workspaceRoles },
    recorded_at: dateTimeSchema,
    recorded_by_current_actor: { type: "boolean" },
  },
} as const;

const publicationReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "satisfied", "missing"],
  properties: {
    ready: { type: "boolean" },
    satisfied: { type: "array", items: { type: "string", enum: publicationGates } },
    missing: { type: "array", items: { type: "string", enum: publicationGates } },
  },
} as const;

/**
 * One row of an organization's own challenge list. Closed like every other
 * read model: a list is the easiest place for a confidential field to arrive
 * unnoticed, so the two content-derived fields it carries (`title`,
 * `category`) are named here rather than spread from the content schema.
 */
const challengeListItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "current_version_id",
    "stage",
    "authoring_status",
    "publication_state",
    "proposal_deadline_at",
    "version",
    "title",
    "category",
    "ready",
    "publication_readiness",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", pattern: "^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
    current_version_id: { type: "string", pattern: "^chv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$" },
    stage: { type: "string", enum: challengeManagedStages },
    authoring_status: { type: "string", enum: challengeDraftAuthoringStatuses },
    publication_state: { type: ["string", "null"], enum: [...challengePublicationStates, null] },
    proposal_deadline_at: { type: ["string", "null"], format: "date-time" },
    version: { type: "integer", minimum: 1 },
    title: { type: "string", maxLength: 500 },
    category: { type: "string", maxLength: 500 },
    ready: { type: "boolean" },
    publication_readiness: publicationReadinessSchema,
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

/**
 * The published public projection's exact, closed field set. It is written out
 * literally rather than picked from `challengeContentProperties`, so a new
 * confidential content field cannot reach the public surface by inheriting a
 * shared definition — B5's snapshot test asserts against this list.
 */
const challengePublicProjectionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "challenge_version_id",
    "title",
    "category",
    "location",
    "public_summary",
    "output_type",
    "sourcing_model",
    "applicant_scope",
    "allowed_applicant_types",
    "work_mode",
    "proposal_deadline",
    "preferred_start_date",
    "budget",
    "visibility",
    "verification_required",
    "nda_required",
    "document_gate_required",
    "ip_terms",
    "state",
    "published_at",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    title: shortTextSchema,
    category: shortTextSchema,
    location: shortTextSchema,
    public_summary: { type: "string", maxLength: 4_000 },
    output_type: { type: "string", enum: challengeOutputTypes },
    sourcing_model: { type: "string", enum: challengeSourcingModels },
    applicant_scope: { type: "string", enum: applicantScopes },
    allowed_applicant_types: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: applicantTypes },
    },
    work_mode: { type: "string", enum: challengeWorkModes },
    proposal_deadline: dateTimeSchema,
    preferred_start_date: nullableDateTimeSchema,
    budget: budgetSchema,
    visibility: { type: "string", enum: ["public", "registered"] },
    verification_required: { type: "boolean" },
    nda_required: { type: "boolean" },
    document_gate_required: { type: "boolean" },
    ip_terms: { type: "string", enum: challengeIpTerms },
    state: { type: "string", enum: challengePublicationStates },
    published_at: dateTimeSchema,
  },
} as const;

const stringFactArraySchema = {
  type: "array",
  uniqueItems: true,
  maxItems: 100,
  items: { type: "string", minLength: 1, maxLength: 200 },
} as const;

const solverProfileReadinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ready", "issues"],
  properties: {
    ready: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "code", "message"],
        properties: {
          path: { type: "string", maxLength: 100 },
          code: { type: "string", enum: ["required", "min_length"] },
          message: { type: "string", maxLength: 2_000 },
        },
      },
    },
  },
} as const;

const solverWorkspaceProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tenant_id",
    "workspace_id",
    "workspace_kind",
    "applicant_type",
    "headline",
    "overview",
    "expertise",
    "geography",
    "readiness",
    "version",
    "created_at",
    "updated_at",
  ],
  properties: {
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    workspace_kind: { type: "string", enum: ["individual", "team"] },
    applicant_type: { type: "string", enum: applicantTypes },
    headline: { type: "string", maxLength: 240 },
    overview: { type: "string", maxLength: 4_000 },
    expertise: stringFactArraySchema,
    geography: stringFactArraySchema,
    readiness: solverProfileReadinessSchema,
    version: { type: "integer", minimum: 1 },
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const solverVerificationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenant_id",
    "workspace_id",
    "state",
    "version",
    "requested_at",
    "submitted_at",
    "verified_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("ver"),
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    state: { type: "string", enum: verificationStates },
    version: { type: "integer", minimum: 1 },
    requested_at: nullableDateTimeSchema,
    submitted_at: nullableDateTimeSchema,
    verified_at: nullableDateTimeSchema,
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const eligibilityDecisionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "evaluated_against_version_id",
    "applicant_type",
    "status",
    "reasons",
    "next_actions",
    "evaluated_at",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    evaluated_against_version_id: idSchema("chv"),
    applicant_type: { type: ["string", "null"], enum: [...applicantTypes, null] },
    status: { type: "string", enum: ["eligible", "needs_action", "ineligible"] },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", enum: eligibilityReasonCodes },
          message: { type: "string", maxLength: 2_000 },
        },
      },
    },
    next_actions: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: eligibilityNextActions },
    },
    evaluated_at: dateTimeSchema,
  },
} as const;

const challengeResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "current_version_id",
    "published_version_id",
    "publication_state",
    "proposal_deadline_at",
    "tenant_id",
    "workspace_id",
    "stage",
    "authoring_status",
    "version",
    "content_version",
    "readiness",
    "triage_readiness",
    "content",
    "approvals",
    "publication_readiness",
    "created_by",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("chl"),
    current_version_id: idSchema("chv"),
    published_version_id: { anyOf: [idSchema("chv"), { type: "null" }] },
    publication_state: { type: ["string", "null"], enum: [...challengePublicationStates, null] },
    proposal_deadline_at: nullableDateTimeSchema,
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    stage: { type: "string", enum: challengeManagedStages },
    authoring_status: { type: "string", enum: challengeDraftAuthoringStatuses },
    version: { type: "integer", minimum: 1 },
    content_version: { type: "integer", minimum: 1 },
    readiness: challengeReadinessSchema,
    triage_readiness: challengeReadinessSchema,
    content: challengeDraftContentSchema,
    approvals: { type: "array", items: challengeApprovalResourceSchema },
    publication_readiness: publicationReadinessSchema,
    created_by: idSchema("usr"),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const challengeApprovalBriefSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "current_version_id",
    "workspace_id",
    "stage",
    "gate",
    "version",
    "content",
    "approvals",
    "publication_readiness",
    "updated_at",
  ],
  properties: {
    id: idSchema("chl"),
    current_version_id: idSchema("chv"),
    workspace_id: idSchema("wsp"),
    stage: { type: "string", enum: ["triage", "approvals"] },
    gate: { type: "string", enum: publicationGates },
    version: { type: "integer", minimum: 1 },
    content: challengeApprovalBriefContentSchema,
    approvals: { type: "array", items: challengeApprovalSummarySchema },
    publication_readiness: publicationReadinessSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const platformChallengeApprovalQueueItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "current_version_id",
    "workspace_id",
    "version",
    "stage",
    "title",
    "category",
    "gate",
    "updated_at",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    current_version_id: idSchema("chv"),
    workspace_id: idSchema("wsp"),
    version: { type: "integer", minimum: 1 },
    stage: { type: "string", enum: ["triage", "approvals"] },
    title: { type: "string", maxLength: 240 },
    category: shortTextSchema,
    gate: { type: "string", enum: publicationGates },
    updated_at: dateTimeSchema,
  },
} as const;

const mutationReceiptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "entity_id",
    "receipt_id",
    "audit_event_id",
    "timestamp",
    "idempotent",
    "next_actions",
  ],
  properties: {
    entity_id: { type: "string", minLength: 5, maxLength: 72 },
    receipt_id: idSchema("rcp"),
    audit_event_id: idSchema("aud"),
    timestamp: dateTimeSchema,
    idempotent: { type: "boolean" },
    next_actions: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
} as const;

const apiErrorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string", enum: apiErrorCodes },
    message: { type: "string", minLength: 1, maxLength: 2_000 },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "code", "message"],
        properties: challengeReadinessIssueSchema.properties,
      },
    },
    current_version: { type: "integer", minimum: 0 },
    current_state: { type: "string", maxLength: 100 },
    allowed_transitions: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", maxLength: 100 },
    },
    readiness: challengeReadinessSchema,
    recovery: { type: "string", maxLength: 200 },
    eligibility: eligibilityDecisionSchema,
  },
} as const;

const successEnvelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "data", "meta"],
  properties: {
    ok: { const: true },
    data: {},
    meta: apiMetaSchema,
  },
} as const;

const errorEnvelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error", "meta"],
  properties: {
    ok: { const: false },
    error: apiErrorSchema,
    meta: apiMetaSchema,
  },
} as const;

const successEnvelopeFor = (data: JsonSchema, versioned = false): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["ok", "data", "meta"],
  properties: {
    ok: { const: true },
    data,
    meta: versioned ? versionedApiMetaSchema : apiMetaSchema,
  },
});

const outboxEventSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "event_id",
    "event_type",
    "schema_version",
    "aggregate_type",
    "aggregate_id",
    "tenant_id",
    "correlation_id",
    "occurred_at",
    "payload",
  ],
  properties: {
    event_id: idSchema("evt"),
    event_type: { type: "string", minLength: 1, maxLength: 200 },
    schema_version: { type: "integer", minimum: 1 },
    aggregate_type: { type: "string", minLength: 1, maxLength: 100 },
    aggregate_id: { type: "string", minLength: 5, maxLength: 72 },
    tenant_id: idSchema("ten"),
    correlation_id: idSchema("cor"),
    occurred_at: dateTimeSchema,
    payload: {},
  },
} as const;

const teamPolicySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "proposalManagersCanEditProfile",
    "proposalManagersCanInvite",
    "adminsCanSubmit",
    "proposalManagersCanSubmit",
    "viewersCanReadMessages",
    "adminsCanViewPayments",
    "proposalManagersCanViewPayments",
    "approvalBeforeSubmit",
  ],
  properties: {
    proposalManagersCanEditProfile: { type: "boolean" },
    proposalManagersCanInvite: { type: "boolean" },
    adminsCanSubmit: { type: "boolean" },
    proposalManagersCanSubmit: { type: "boolean" },
    viewersCanReadMessages: { type: "boolean" },
    adminsCanViewPayments: { type: "boolean" },
    proposalManagersCanViewPayments: { type: "boolean" },
    approvalBeforeSubmit: { type: "boolean" },
  },
} as const;

const teamPolicyPatchSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: Object.fromEntries(
    Object.keys(teamPolicySchema.properties).map((key) => [key, { type: "boolean" }]),
  ),
} as const;

const teamMemberSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "user_id",
    "display_name",
    "role",
    "state",
    "version",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("mem"),
    user_id: idSchema("usr"),
    display_name: { type: "string", minLength: 1, maxLength: 200 },
    role: { type: "string", enum: teamRoles },
    state: { type: "string", enum: membershipStates },
    version: { type: "integer", minimum: 1 },
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const teamResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tenant_id",
    "workspace_id",
    "name",
    "team_kind",
    "owner_user_id",
    "status",
    "join_mode",
    "default_invitation_role",
    "policy",
    "members",
    "version",
    "created_at",
    "updated_at",
  ],
  properties: {
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    name: { type: "string", minLength: 1, maxLength: 200 },
    team_kind: { type: "string", enum: teamKinds },
    owner_user_id: idSchema("usr"),
    status: { type: "string", enum: teamStatuses },
    join_mode: { type: "string", enum: teamJoinModes },
    default_invitation_role: { type: "string", enum: teamNonOwnerRoles },
    policy: teamPolicySchema,
    members: { type: "array", items: teamMemberSchema },
    version: { type: "integer", minimum: 1 },
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const teamInvitationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenant_id",
    "workspace_id",
    "team_name",
    "inviter_user_id",
    "recipient_user_id",
    "recipient_email",
    "proposed_role",
    "scope",
    "message",
    "commitment",
    "ip_notice",
    "state",
    "version",
    "expires_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("tiv"),
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    team_name: { type: "string", minLength: 1, maxLength: 200 },
    inviter_user_id: idSchema("usr"),
    recipient_user_id: { oneOf: [idSchema("usr"), { type: "null" }] },
    recipient_email: { type: "string", format: "email", maxLength: 320 },
    proposed_role: { type: "string", enum: teamNonOwnerRoles },
    scope: { type: "string", minLength: 1, maxLength: 1_000 },
    message: { type: "string", maxLength: 2_000 },
    commitment: { type: "string", minLength: 1, maxLength: 1_000 },
    ip_notice: { type: "string", minLength: 1, maxLength: 1_000 },
    state: { type: "string", enum: teamInvitationStates },
    version: { type: "integer", minimum: 1 },
    expires_at: dateTimeSchema,
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const teamMembershipRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenant_id",
    "workspace_id",
    "team_name",
    "requester_user_id",
    "requester_display_name",
    "requested_role",
    "assigned_role",
    "introduction",
    "availability",
    "state",
    "decision_reason",
    "version",
    "expires_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: idSchema("tmr"),
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    team_name: { type: "string", minLength: 1, maxLength: 200 },
    requester_user_id: idSchema("usr"),
    requester_display_name: { type: "string", minLength: 1, maxLength: 200 },
    requested_role: { type: "string", enum: teamNonOwnerRoles },
    assigned_role: {
      oneOf: [{ type: "string", enum: teamNonOwnerRoles }, { type: "null" }],
    },
    introduction: { type: "string", minLength: 1, maxLength: 2_000 },
    availability: { type: "string", minLength: 1, maxLength: 1_000 },
    state: { type: "string", enum: teamMembershipRequestStates },
    decision_reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
    version: { type: "integer", minimum: 1 },
    expires_at: dateTimeSchema,
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
  },
} as const;

const versionedCommandProperties = {
  expected_version: { type: "integer", minimum: 1 },
  reason: { type: "string", minLength: 1, maxLength: 2_000 },
  step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
} as const;

const rubricCriteriaSchema = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "weight", "min", "max"],
    properties: {
      id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
      label: { type: "string", minLength: 1, maxLength: 160 },
      weight: { type: "integer", minimum: 1, maximum: 100 },
      min: { type: "integer", const: 0 },
      max: { type: "integer", const: 5 },
    },
  },
} as const;
const reviewProposalContentRequired = [
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
  "start_availability",
  "team_availability",
] as const;
const reviewProposalContentSchema = {
  type: "object",
  additionalProperties: false,
  required: reviewProposalContentRequired,
  properties: {
    title: proposalContentProperties.title,
    problem_statement: proposalContentProperties.problem_statement,
    value_proposition: proposalContentProperties.value_proposition,
    maturity_level: proposalContentProperties.maturity_level,
    prototype_weeks: proposalContentProperties.prototype_weeks,
    technologies: proposalContentProperties.technologies,
    technical_approach: proposalContentProperties.technical_approach,
    architecture: proposalContentProperties.architecture,
    data_needs: proposalContentProperties.data_needs,
    success_metrics: proposalContentProperties.success_metrics,
    ip_status: proposalContentProperties.ip_status,
    duration_weeks: proposalContentProperties.duration_weeks,
    roadmap: proposalContentProperties.roadmap,
    dependencies: proposalContentProperties.dependencies,
    pilot_location: proposalContentProperties.pilot_location,
    risks: proposalContentProperties.risks,
    mitigation: proposalContentProperties.mitigation,
    start_availability: proposalContentProperties.start_availability,
    team_availability: proposalContentProperties.team_availability,
  },
} as const;
const reviewMaterialsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "assignment_id",
    "proposal_version_id",
    "rubric_version_id",
    "organization_name",
    "challenge_title",
    "proposal_content",
    "rubric_criteria",
  ],
  properties: {
    assignment_id: idSchema("rva"),
    proposal_version_id: idSchema("prv"),
    rubric_version_id: idSchema("rbv"),
    organization_name: { type: "string", minLength: 1, maxLength: 200 },
    challenge_title: { type: "string", minLength: 1, maxLength: 500 },
    proposal_content: reviewProposalContentSchema,
    rubric_criteria: rubricCriteriaSchema,
  },
} as const;
const rubricResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "version_id",
    "version",
    "challenge_id",
    "challenge_version_id",
    "criteria",
    "created_at",
  ],
  properties: {
    id: idSchema("rub"),
    version_id: idSchema("rbv"),
    version: { type: "integer", minimum: 1 },
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    criteria: rubricCriteriaSchema,
    created_at: dateTimeSchema,
  },
} as const;

const evaluationRosterProposalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposal_id", "proposal_version_id", "tracking_code", "source_state"],
  properties: {
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    source_state: { type: "string", enum: evaluationRosterProposalStates },
  },
} as const;

const challengeEvaluationResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "challenge_version_id",
    "stage",
    "publication_state",
    "proposal_deadline_at",
    "window_closed",
    "rubric_version_id",
    "required_reviews",
    "qualifying_proposal_count",
    "unresolved_proposal_count",
    "ready",
    "blockers",
    "roster",
    "opened_at",
    "version",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    challenge_version_id: { oneOf: [idSchema("chv"), { type: "null" }] },
    stage: { type: "string", enum: challengeStages },
    publication_state: {
      oneOf: [
        { type: "string", enum: ["open", "paused", "closed", "cancelled"] },
        { type: "null" },
      ],
    },
    proposal_deadline_at: nullableDateTimeSchema,
    window_closed: { type: "boolean" },
    rubric_version_id: { oneOf: [idSchema("rbv"), { type: "null" }] },
    required_reviews: { const: 2 },
    qualifying_proposal_count: { type: "integer", minimum: 0 },
    unresolved_proposal_count: { type: "integer", minimum: 0 },
    ready: { type: "boolean" },
    blockers: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: evaluationReadinessBlockers },
    },
    roster: { type: "array", items: evaluationRosterProposalSchema },
    opened_at: nullableDateTimeSchema,
    version: { type: "integer", minimum: 1 },
  },
} as const;

const reviewComparisonCriterionScoreSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criterion_id", "average_score_tenths"],
  properties: {
    criterion_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
    average_score_tenths: { type: "integer", minimum: 0, maximum: 50 },
  },
} as const;
const reviewComparisonScoreSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["average_weighted_score_tenths", "criteria"],
  properties: {
    average_weighted_score_tenths: { type: "integer", minimum: 0, maximum: 1_000 },
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: reviewComparisonCriterionScoreSchema,
    },
  },
} as const;
const reviewComparisonProposalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "proposal_id",
    "proposal_version_id",
    "tracking_code",
    "status",
    "active_assignment_count",
    "locked_review_count",
    "cancelled_assignment_count",
    "invalidated_review_count",
    "score_summary",
  ],
  properties: {
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    status: {
      type: "string",
      enum: ["needs_assignment", "reviews_in_progress", "complete"],
    },
    active_assignment_count: { type: "integer", minimum: 0, maximum: 2 },
    locked_review_count: { type: "integer", minimum: 0, maximum: 2 },
    cancelled_assignment_count: { type: "integer", minimum: 0 },
    invalidated_review_count: { type: "integer", minimum: 0 },
    score_summary: { oneOf: [reviewComparisonScoreSummarySchema, { type: "null" }] },
  },
} as const;
const challengeReviewComparisonResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "challenge_version_id",
    "rubric_version_id",
    "required_reviews",
    "proposal_count",
    "completed_proposal_count",
    "scores_released",
    "criteria",
    "proposals",
    "version",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    rubric_version_id: idSchema("rbv"),
    required_reviews: { const: 2 },
    proposal_count: { type: "integer", minimum: 0 },
    completed_proposal_count: { type: "integer", minimum: 0 },
    scores_released: { type: "boolean" },
    criteria: rubricCriteriaSchema,
    proposals: { type: "array", maxItems: 500, items: reviewComparisonProposalSchema },
    version: { type: "integer", minimum: 1 },
  },
} as const;

const decisionProposalReferenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposal_id", "proposal_version_id"],
  properties: {
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
  },
} as const;
const decisionProposalResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "proposal_id",
    "proposal_version_id",
    "tracking_code",
    "locked_review_count",
    "shortlisted",
    "outcome",
    "feedback",
  ],
  properties: {
    ...decisionProposalReferenceSchema.properties,
    tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    locked_review_count: { type: "integer", minimum: 0, maximum: 2 },
    shortlisted: { type: "boolean" },
    outcome: {
      oneOf: [{ type: "string", enum: proposalDecisionOutcomes }, { type: "null" }],
    },
    feedback: { oneOf: [{ type: "string", minLength: 1, maxLength: 4_000 }, { type: "null" }] },
  },
} as const;
const decisionShortlistResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "version_number", "proposal_versions", "rationale", "recorded_at"],
  properties: {
    id: idSchema("dsv"),
    version_number: { type: "integer", minimum: 1 },
    proposal_versions: {
      type: "array",
      minItems: 1,
      maxItems: 500,
      uniqueItems: true,
      items: decisionProposalReferenceSchema,
    },
    rationale: { type: "string", minLength: 1, maxLength: 10_000 },
    recorded_at: dateTimeSchema,
  },
} as const;
const finalDecisionResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "outcome",
    "selected_proposal_id",
    "selected_proposal_version_id",
    "reason_code",
    "rationale",
    "decided_at",
  ],
  properties: {
    id: idSchema("dec"),
    outcome: { type: "string", enum: decisionOutcomes },
    selected_proposal_id: { oneOf: [idSchema("prp"), { type: "null" }] },
    selected_proposal_version_id: { oneOf: [idSchema("prv"), { type: "null" }] },
    reason_code: { type: "string", enum: decisionReasonCodes },
    rationale: { type: "string", minLength: 1, maxLength: 10_000 },
    decided_at: dateTimeSchema,
  },
} as const;
const caseResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "challenge_id",
    "challenge_version_id",
    "proposal_id",
    "proposal_version_id",
    "decision_id",
    "state",
    "created_at",
  ],
  properties: {
    id: idSchema("case"),
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    decision_id: idSchema("dec"),
    state: { const: "created" },
    created_at: dateTimeSchema,
  },
} as const;
const challengeDecisionResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "challenge_id",
    "challenge_version_id",
    "rubric_version_id",
    "stage",
    "review_complete",
    "proposals",
    "shortlist",
    "decision",
    "case",
    "version",
  ],
  properties: {
    challenge_id: idSchema("chl"),
    challenge_version_id: idSchema("chv"),
    rubric_version_id: idSchema("rbv"),
    stage: { type: "string", enum: challengeStages },
    review_complete: { type: "boolean" },
    proposals: { type: "array", maxItems: 500, items: decisionProposalResourceSchema },
    shortlist: { oneOf: [decisionShortlistResourceSchema, { type: "null" }] },
    decision: { oneOf: [finalDecisionResourceSchema, { type: "null" }] },
    case: { oneOf: [caseResourceSchema, { type: "null" }] },
    version: { type: "integer", minimum: 1 },
  },
} as const;
const proposalDecisionFeedbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposal_id", "proposal_version_id", "feedback"],
  properties: {
    ...decisionProposalReferenceSchema.properties,
    feedback: { type: "string", minLength: 1, maxLength: 4_000 },
  },
} as const;
const proposalOutcomeResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "proposal_id",
    "proposal_version_id",
    "tracking_code",
    "status",
    "feedback",
    "decided_at",
    "case_id",
    "version",
  ],
  properties: {
    proposal_id: idSchema("prp"),
    proposal_version_id: idSchema("prv"),
    tracking_code: { type: "string", pattern: "^PRP-[0-9]{4}-[0-9]{3,6}$" },
    status: { type: "string", enum: ["pending", ...proposalDecisionOutcomes] },
    feedback: { oneOf: [{ type: "string", minLength: 1, maxLength: 4_000 }, { type: "null" }] },
    decided_at: nullableDateTimeSchema,
    case_id: { oneOf: [idSchema("case"), { type: "null" }] },
    version: { type: "integer", minimum: 1 },
  },
} as const;

export const apiSchemas = {
  EvaluationRosterProposal: evaluationRosterProposalSchema,
  ChallengeEvaluation: challengeEvaluationResourceSchema,
  ChallengeEvaluationSuccessEnvelope: successEnvelopeFor(challengeEvaluationResourceSchema, true),
  ReviewComparisonCriterionScore: reviewComparisonCriterionScoreSchema,
  ReviewComparisonScoreSummary: reviewComparisonScoreSummarySchema,
  ReviewComparisonProposal: reviewComparisonProposalSchema,
  ChallengeReviewComparison: challengeReviewComparisonResourceSchema,
  ChallengeReviewComparisonSuccessEnvelope: successEnvelopeFor(
    challengeReviewComparisonResourceSchema,
    true,
  ),
  DecisionProposalReference: decisionProposalReferenceSchema,
  DecisionProposal: decisionProposalResourceSchema,
  DecisionShortlist: decisionShortlistResourceSchema,
  FinalDecision: finalDecisionResourceSchema,
  Case: caseResourceSchema,
  CaseSuccessEnvelope: successEnvelopeFor(caseResourceSchema, true),
  ChallengeDecision: challengeDecisionResourceSchema,
  ChallengeDecisionSuccessEnvelope: successEnvelopeFor(challengeDecisionResourceSchema, true),
  SaveDecisionShortlistBody: {
    type: "object",
    additionalProperties: false,
    required: [
      "expected_version",
      "challenge_version_id",
      "rubric_version_id",
      "proposal_versions",
      "rationale",
    ],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      challenge_version_id: idSchema("chv"),
      rubric_version_id: idSchema("rbv"),
      proposal_versions: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        uniqueItems: true,
        items: decisionProposalReferenceSchema,
      },
      rationale: { type: "string", minLength: 1, maxLength: 10_000 },
    },
  },
  RecordChallengeDecisionBody: {
    type: "object",
    additionalProperties: false,
    required: [
      "expected_version",
      "challenge_version_id",
      "rubric_version_id",
      "shortlist_version_id",
      "outcome",
      "selected_proposal_id",
      "selected_proposal_version_id",
      "reason_code",
      "rationale",
      "proposal_feedback",
    ],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      challenge_version_id: idSchema("chv"),
      rubric_version_id: idSchema("rbv"),
      shortlist_version_id: { oneOf: [idSchema("dsv"), { type: "null" }] },
      outcome: { type: "string", enum: decisionOutcomes },
      selected_proposal_id: { oneOf: [idSchema("prp"), { type: "null" }] },
      selected_proposal_version_id: { oneOf: [idSchema("prv"), { type: "null" }] },
      reason_code: { type: "string", enum: decisionReasonCodes },
      rationale: { type: "string", minLength: 1, maxLength: 10_000 },
      proposal_feedback: {
        type: "array",
        maxItems: 500,
        uniqueItems: true,
        items: proposalDecisionFeedbackSchema,
      },
      step_up_token: { type: "string", minLength: 32, maxLength: 4_096 },
    },
  },
  BrowserDecisionStepUpStartBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { type: "integer", minimum: 1 } },
  },
  BrowserDecisionStepUpStartSuccessEnvelope: successEnvelopeFor(
    {
      type: "object",
      additionalProperties: false,
      required: ["authorization_url", "expires_at"],
      properties: {
        authorization_url: { type: "string", format: "uri", maxLength: 4_096 },
        expires_at: dateTimeSchema,
      },
    },
    true,
  ),
  ProposalOutcome: proposalOutcomeResourceSchema,
  ProposalOutcomeSuccessEnvelope: successEnvelopeFor(proposalOutcomeResourceSchema, true),
  OpenChallengeEvaluationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { type: "integer", minimum: 1 } },
  },
  RubricResource: rubricResourceSchema,
  RubricSuccessEnvelope: successEnvelopeFor({ anyOf: [rubricResourceSchema, { type: "null" }] }),
  CreateRubricVersionBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "challenge_version_id", "criteria"],
    properties: {
      expected_version: { type: "integer", minimum: 0 },
      challenge_version_id: idSchema("chv"),
      criteria: rubricCriteriaSchema,
    },
  },
  ApiMeta: apiMetaSchema,
  VersionedApiMeta: versionedApiMetaSchema,
  ApiError: apiErrorSchema,
  ErrorEnvelope: errorEnvelopeSchema,
  SuccessEnvelope: successEnvelopeSchema,
  MutationReceipt: mutationReceiptSchema,
  MutationSuccessEnvelope: successEnvelopeFor(mutationReceiptSchema, true),
  OidcAuthorizationStartBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "redirect_uri"],
    properties: {
      expected_version: { const: 0 },
      redirect_uri: { type: "string", format: "uri", maxLength: 2_048 },
    },
  },
  StartContactVerificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "channel", "destination"],
    properties: {
      expected_version: { const: 0 },
      channel: { type: "string", enum: contactVerificationChannels },
      destination: { type: "string", minLength: 3, maxLength: 320 },
    },
  },
  ContactVerificationAttempt: contactVerificationAttemptSchema,
  ContactVerificationAttemptSuccessEnvelope: successEnvelopeFor(
    contactVerificationAttemptSchema,
    true,
  ),
  ResendContactVerificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { type: "integer", minimum: 1 } },
  },
  VerifyContactBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "code"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      // Persian and Arabic-Indic digits are accepted alongside ASCII: the
      // provider normalizes them, and a Persian-first product cannot reject
      // the digits its own keyboards produce before that normalization runs.
      code: { type: "string", pattern: "^[0-9\\u06F0-\\u06F9\\u0660-\\u0669]{5}$" },
    },
  },
  VerifiedContact: {
    type: "object",
    additionalProperties: false,
    required: ["attempt", "verification_token", "verification_token_expires_at"],
    properties: {
      attempt: {
        ...contactVerificationAttemptSchema,
        properties: {
          ...contactVerificationAttemptSchema.properties,
          state: { const: "verified" },
        },
      },
      verification_token: { type: "string", minLength: 32, maxLength: 4096 },
      verification_token_expires_at: dateTimeSchema,
    },
  },
  VerifiedContactSuccessEnvelope: successEnvelopeFor(
    {
      type: "object",
      additionalProperties: false,
      required: ["attempt", "verification_token", "verification_token_expires_at"],
      properties: {
        attempt: {
          ...contactVerificationAttemptSchema,
          properties: {
            ...contactVerificationAttemptSchema.properties,
            state: { const: "verified" },
          },
        },
        verification_token: { type: "string", minLength: 32, maxLength: 4096 },
        verification_token_expires_at: dateTimeSchema,
      },
    },
    true,
  ),
  ContactSessionExchangeBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "verification_token"],
    properties: {
      expected_version: { const: 0 },
      verification_token: { type: "string", minLength: 32, maxLength: 4096 },
    },
  },
  ActivateSolverBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "verification_token", "display_name", "start_intent"],
    properties: {
      expected_version: { const: 0 },
      verification_token: { type: "string", minLength: 32, maxLength: 4096 },
      display_name: { type: "string", minLength: 1, maxLength: 200 },
      start_intent: { type: "string", enum: solverStartIntents },
    },
  },
  SolverActivation: solverActivationSchema,
  SolverActivationSessionResult: {
    type: "object",
    additionalProperties: false,
    required: ["activation", "tokens", "receipt"],
    properties: {
      activation: solverActivationSchema,
      tokens: sessionTokenSetSchema,
      receipt: mutationReceiptSchema,
    },
  },
  SolverActivationSuccessEnvelope: successEnvelopeFor(
    {
      type: "object",
      additionalProperties: false,
      required: ["activation", "tokens", "receipt"],
      properties: {
        activation: solverActivationSchema,
        tokens: sessionTokenSetSchema,
        receipt: mutationReceiptSchema,
      },
    },
    true,
  ),
  SolverActivationReadSuccessEnvelope: successEnvelopeFor(solverActivationSchema),
  /**
   * The browser sibling of `SolverActivationSuccessEnvelope`. The tokens are
   * deliberately absent: the same-origin route puts them in HttpOnly cookies,
   * and `additionalProperties: false` makes leaking them back into the body a
   * serialization error rather than a silent regression.
   */
  BrowserSolverActivationSuccessEnvelope: successEnvelopeFor(
    {
      type: "object",
      additionalProperties: false,
      required: ["activation", "receipt"],
      properties: {
        activation: solverActivationSchema,
        receipt: mutationReceiptSchema,
      },
    },
    true,
  ),
  OidcAuthorizationStartResult: {
    type: "object",
    additionalProperties: false,
    required: ["authorization_url", "state", "code_verifier", "expires_at"],
    properties: {
      authorization_url: { type: "string", format: "uri", maxLength: 4_096 },
      state: { type: "string", minLength: 32, maxLength: 1_024 },
      code_verifier: { type: "string", minLength: 43, maxLength: 128 },
      expires_at: dateTimeSchema,
    },
  },
  OidcAuthorizationStartSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["authorization_url", "state", "code_verifier", "expires_at"],
    properties: {
      authorization_url: { type: "string", format: "uri", maxLength: 4_096 },
      state: { type: "string", minLength: 32, maxLength: 1_024 },
      code_verifier: { type: "string", minLength: 43, maxLength: 128 },
      expires_at: dateTimeSchema,
    },
  }),
  SessionExchangeBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "authorization_code", "code_verifier", "redirect_uri", "state"],
    properties: {
      expected_version: { const: 0 },
      authorization_code: { type: "string", minLength: 8, maxLength: 4_096 },
      code_verifier: { type: "string", minLength: 43, maxLength: 128 },
      redirect_uri: { type: "string", format: "uri", maxLength: 2_048 },
      state: { type: "string", minLength: 8, maxLength: 1_024 },
    },
  },
  SessionRefreshBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "refresh_token"],
    properties: {
      expected_version: { type: "integer", minimum: 0 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      refresh_token: { type: "string", minLength: 16, maxLength: 4_096 },
    },
  },
  SessionRevokeBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "session_id"],
    properties: {
      expected_version: { type: "integer", minimum: 0 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      session_id: idSchema("ses"),
    },
  },
  SessionTokenSet: sessionTokenSetSchema,
  SessionTokenMutationResult: {
    type: "object",
    additionalProperties: false,
    required: ["tokens", "receipt"],
    properties: {
      tokens: sessionTokenSetSchema,
      receipt: mutationReceiptSchema,
    },
  },
  SessionSuccessEnvelope: successEnvelopeFor(
    {
      type: "object",
      additionalProperties: false,
      required: ["tokens", "receipt"],
      properties: {
        tokens: sessionTokenSetSchema,
        receipt: mutationReceiptSchema,
      },
    },
    true,
  ),
  SessionRevocationSuccessEnvelope: successEnvelopeFor(mutationReceiptSchema, true),
  UserResource: userResourceSchema,
  WorkspaceResource: workspaceResourceSchema,
  MembershipResource: membershipResourceSchema,
  WorkspaceContextResource: workspaceContextResourceSchema,
  MeResource: meResourceSchema,
  MeSuccessEnvelope: successEnvelopeFor(meResourceSchema, true),
  SwitchWorkspaceContextBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "workspace_id"],
    properties: {
      expected_version: { type: "integer", minimum: 0 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      workspace_id: idSchema("wsp"),
    },
  },
  WorkspaceContextMutationSuccessEnvelope: successEnvelopeFor(mutationReceiptSchema, true),
  ChallengeDraftContent: challengeDraftContentSchema,
  ChallengeDraftPatch: challengeDraftPatchSchema,
  ChallengeReadiness: challengeReadinessSchema,
  ChallengeResource: challengeResourceSchema,
  ChallengeSuccessEnvelope: successEnvelopeFor(challengeResourceSchema, true),
  CreateChallengeBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: {
      expected_version: { const: 0 },
      draft: challengeDraftPatchSchema,
    },
  },
  PatchChallengeBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "patch"],
    properties: {
      expected_version: { type: "integer", minimum: 0 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      patch: challengeDraftPatchSchema,
    },
  },
  ChallengeTransitionBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ExtendChallengeDeadlineBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "proposal_deadline", "reason"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      proposal_deadline: dateTimeSchema,
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ChallengePublicationStateBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ChallengeApprovalResource: challengeApprovalResourceSchema,
  ChallengeApprovalBrief: challengeApprovalBriefSchema,
  ChallengeApprovalBriefSuccessEnvelope: successEnvelopeFor(challengeApprovalBriefSchema, true),
  PlatformChallengeApprovalQueueSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: { items: { type: "array", items: platformChallengeApprovalQueueItemSchema } },
  }),
  ChallengePublicProjection: challengePublicProjectionSchema,
  ChallengePublicSuccessEnvelope: successEnvelopeFor(challengePublicProjectionSchema),
  ChallengePublicPageSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["items", "next_cursor"],
    properties: {
      items: { type: "array", items: challengePublicProjectionSchema },
      next_cursor: { type: ["string", "null"], maxLength: 200 },
    },
  }),
  PublicChallengeQuery: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", minLength: 1, maxLength: 500 },
      cursor: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  ChallengeListQuery: {
    type: "object",
    additionalProperties: false,
    properties: {
      stage: { type: "string", enum: challengeManagedStages },
      cursor: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  ChallengePageSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["items", "next_cursor"],
    properties: {
      items: { type: "array", items: challengeListItemSchema },
      next_cursor: { type: ["string", "null"], maxLength: 200 },
    },
  }),
  PublicationReadiness: publicationReadinessSchema,
  RecordChallengeApprovalBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "gate", "decision", "reason"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      gate: { type: "string", enum: publicationGates },
      decision: { type: "string", enum: approvalDecisions },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  OutboxEvent: outboxEventSchema,
  SolverWorkspaceProfile: solverWorkspaceProfileSchema,
  SolverWorkspaceProfileSuccessEnvelope: successEnvelopeFor(solverWorkspaceProfileSchema, true),
  PatchSolverWorkspaceProfileBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "patch"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      patch: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          headline: { type: "string", maxLength: 240 },
          overview: { type: "string", maxLength: 4_000 },
          expertise: stringFactArraySchema,
          geography: stringFactArraySchema,
        },
      },
    },
  },
  SolverVerification: solverVerificationSchema,
  SolverVerificationSuccessEnvelope: successEnvelopeFor(solverVerificationSchema, true),
  StartSolverVerificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  AcceptEligibilityGateBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "challenge_version_id"],
    properties: {
      expected_version: { const: 0 },
      challenge_version_id: idSchema("chv"),
    },
  },
  EligibilityGateParams: {
    type: "object",
    additionalProperties: false,
    required: ["challengeId", "gate"],
    properties: {
      challengeId: idSchema("chl"),
      gate: { type: "string", enum: eligibilityGateKinds },
    },
  },
  EligibilityDecision: eligibilityDecisionSchema,
  EligibilitySuccessEnvelope: successEnvelopeFor(eligibilityDecisionSchema),
  TeamPolicy: teamPolicySchema,
  TeamMember: teamMemberSchema,
  Team: teamResourceSchema,
  TeamSuccessEnvelope: successEnvelopeFor(teamResourceSchema, true),
  TeamInvitation: teamInvitationSchema,
  TeamInvitationListSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: { items: { type: "array", items: teamInvitationSchema } },
  }),
  TeamMembershipRequest: teamMembershipRequestSchema,
  TeamMembershipRequestListSuccessEnvelope: successEnvelopeFor({
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: { items: { type: "array", items: teamMembershipRequestSchema } },
  }),
  CreateTeamBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "name", "team_kind"],
    properties: {
      expected_version: { const: 0 },
      name: { type: "string", minLength: 1, maxLength: 200 },
      team_kind: { type: "string", enum: teamKinds },
      join_mode: { type: "string", enum: teamJoinModes },
    },
  },
  UpdateTeamPolicyBody: {
    type: "object",
    additionalProperties: false,
    minProperties: 3,
    required: ["expected_version", "reason"],
    properties: {
      ...versionedCommandProperties,
      join_mode: { type: "string", enum: teamJoinModes },
      default_invitation_role: { type: "string", enum: teamNonOwnerRoles },
      policy: teamPolicyPatchSchema,
    },
  },
  CreateTeamInvitationBody: {
    type: "object",
    additionalProperties: false,
    required: [
      "expected_version",
      "recipient_email",
      "proposed_role",
      "scope",
      "message",
      "commitment",
      "ip_notice",
    ],
    properties: {
      ...versionedCommandProperties,
      recipient_email: { type: "string", format: "email", maxLength: 320 },
      proposed_role: { type: "string", enum: teamNonOwnerRoles },
      scope: { type: "string", minLength: 1, maxLength: 1_000 },
      message: { type: "string", maxLength: 2_000 },
      commitment: { type: "string", minLength: 1, maxLength: 1_000 },
      ip_notice: { type: "string", minLength: 1, maxLength: 1_000 },
    },
  },
  RevokeTeamInvitationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: versionedCommandProperties,
  },
  RespondTeamInvitationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "decision"],
    properties: {
      ...versionedCommandProperties,
      decision: { type: "string", enum: ["accept", "decline"] },
    },
    allOf: [
      {
        if: { properties: { decision: { const: "decline" } }, required: ["decision"] },
        then: { required: ["reason"] },
      },
    ],
  },
  CreateTeamMembershipRequestBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "requested_role", "introduction", "availability"],
    properties: {
      expected_version: { const: 0 },
      requested_role: { type: "string", enum: teamNonOwnerRoles },
      introduction: { type: "string", minLength: 1, maxLength: 2_000 },
      availability: { type: "string", minLength: 1, maxLength: 1_000 },
    },
  },
  DecideTeamMembershipRequestBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "decision", "reason"],
    properties: {
      ...versionedCommandProperties,
      decision: { type: "string", enum: ["accept", "reject"] },
      assigned_role: { type: "string", enum: teamNonOwnerRoles },
    },
    allOf: [
      {
        if: { properties: { decision: { const: "accept" } }, required: ["decision"] },
        then: { required: ["assigned_role"] },
      },
    ],
  },
  WithdrawTeamMembershipRequestBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: versionedCommandProperties,
  },
  ChangeTeamMemberRoleBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "role", "reason"],
    properties: {
      ...versionedCommandProperties,
      role: { type: "string", enum: teamNonOwnerRoles },
    },
  },
  ChangeTeamMemberStateBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: versionedCommandProperties,
  },
  TransferTeamOwnershipBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "successor_membership_id", "reason"],
    properties: {
      ...versionedCommandProperties,
      successor_membership_id: idSchema("mem"),
    },
  },
  LeaveTeamBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: versionedCommandProperties,
  },
  ArchiveTeamBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: versionedCommandProperties,
  },
  TeamInvitationParams: {
    type: "object",
    additionalProperties: false,
    required: ["teamInvitationId"],
    properties: { teamInvitationId: idSchema("tiv") },
  },
  TeamMembershipRequestParams: {
    type: "object",
    additionalProperties: false,
    required: ["teamMembershipRequestId"],
    properties: { teamMembershipRequestId: idSchema("tmr") },
  },
  TeamWorkspaceParams: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId"],
    properties: { workspaceId: idSchema("wsp") },
  },
  TeamMemberParams: {
    type: "object",
    additionalProperties: false,
    required: ["membershipId"],
    properties: { membershipId: idSchema("mem") },
  },
  ProposalContent: proposalContentSchema,
  ProposalContentPatch: proposalContentPatchSchema,
  ProposalReadiness: proposalReadinessSchema,
  ProposalVersion: proposalVersionSchema,
  ProposalClarification: proposalClarificationSchema,
  ProposalRevisionRequest: proposalRevisionRequestSchema,
  Proposal: proposalResourceSchema,
  ProposalSuccessEnvelope: successEnvelopeFor(proposalResourceSchema, true),
  ProposalListItem: proposalListItemSchema,
  ProposalList: proposalListSchema,
  ProposalListSuccessEnvelope: successEnvelopeFor(proposalListSchema),
  OrganizationProposalVersion: organizationProposalVersionSchema,
  OrganizationProposalInboxItem: organizationProposalInboxItemSchema,
  OrganizationProposal: organizationProposalResourceSchema,
  OrganizationProposalInbox: organizationProposalInboxSchema,
  OrganizationProposalSuccessEnvelope: successEnvelopeFor(organizationProposalResourceSchema, true),
  OrganizationProposalInboxSuccessEnvelope: successEnvelopeFor(organizationProposalInboxSchema),
  ReviewAssignment: reviewAssignmentSchema,
  ReviewAssignmentSuccessEnvelope: successEnvelopeFor(reviewAssignmentSchema),
  ReviewAssignmentListSuccessEnvelope: successEnvelopeFor(reviewAssignmentListSchema),
  ReviewProposalContent: reviewProposalContentSchema,
  ReviewMaterials: reviewMaterialsSchema,
  ReviewMaterialsSuccessEnvelope: successEnvelopeFor(reviewMaterialsSchema),
  Review: reviewResourceSchema,
  ReviewSuccessEnvelope: successEnvelopeFor({ oneOf: [reviewResourceSchema, { type: "null" }] }),
  OperationsReviewAssignment: operationsReviewAssignmentSchema,
  OperationsEvaluationProposal: operationsEvaluationProposalSchema,
  ReviewerCandidate: reviewerCandidateSchema,
  OperationsReviewAssignmentListSuccessEnvelope: successEnvelopeFor(
    operationsReviewAssignmentListSchema,
  ),
  OperationsReviewConflict: operationsReviewConflictSchema,
  OperationsReviewConflictListSuccessEnvelope: successEnvelopeFor(
    operationsReviewConflictListSchema,
  ),
  OperationsReviewAssignmentListQuery: {
    type: "object",
    additionalProperties: false,
    properties: { challenge_id: idSchema("chl") },
  },
  CreateReviewAssignmentBody: {
    type: "object",
    additionalProperties: false,
    required: [
      "expected_version",
      "challenge_id",
      "proposal_id",
      "reviewer_membership_id",
      "due_at",
    ],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      challenge_id: idSchema("chl"),
      proposal_id: idSchema("prp"),
      reviewer_membership_id: idSchema("mem"),
      due_at: dateTimeSchema,
    },
  },
  CancelReviewAssignmentBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      reason: versionedCommandProperties.reason,
    },
  },
  ReplaceReviewAssignmentBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason", "reviewer_membership_id", "due_at"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      reason: versionedCommandProperties.reason,
      reviewer_membership_id: idSchema("mem"),
      due_at: dateTimeSchema,
    },
  },
  DeclareReviewCoiBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "status", "relationship_categories", "attestation"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      status: { type: "string", enum: ["clear", "conflict"] },
      relationship_categories: {
        type: "array",
        uniqueItems: true,
        maxItems: reviewCoiRelationshipCategories.length,
        items: { type: "string", enum: reviewCoiRelationshipCategories },
      },
      reason: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
      attestation: { const: true },
    },
  },
  SaveReviewDraftBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "scores"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      scores: { type: "array", maxItems: 20, items: reviewScoreSchema },
    },
  },
  SubmitReviewBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: versionedCommandProperties.expected_version },
  },
  LockReviewBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      reason: versionedCommandProperties.reason,
    },
  },
  InvalidateReviewBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      expected_version: versionedCommandProperties.expected_version,
      reason: versionedCommandProperties.reason,
    },
  },
  ReviewAssignmentParams: {
    type: "object",
    additionalProperties: false,
    required: ["assignmentId"],
    properties: { assignmentId: idSchema("rva") },
  },
  ReviewAssignmentListQuery: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      cursor: idSchema("rva"),
      state: { type: "string", enum: reviewStates },
    },
  },
  Notification: notificationSchema,
  NotificationList: notificationListSchema,
  NotificationSummary: notificationSummarySchema,
  NotificationListSuccessEnvelope: successEnvelopeFor(notificationListSchema),
  NotificationSummarySuccessEnvelope: successEnvelopeFor(notificationSummarySchema),
  NotificationParams: {
    type: "object",
    additionalProperties: false,
    required: ["notificationId"],
    properties: { notificationId: idSchema("ntf") },
  },
  NotificationListQuery: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 50 },
      cursor: { type: "string", minLength: 1, maxLength: 200 },
      unread_only: { type: "boolean" },
    },
  },
  MarkNotificationReadBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { const: 0 } },
  },
  MarkAllNotificationsReadBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { const: 0 } },
  },
  CreateProposalBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "challenge_id"],
    properties: {
      expected_version: { const: 0 },
      challenge_id: idSchema("chl"),
      draft: proposalContentPatchSchema,
    },
  },
  PatchProposalBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "patch"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      patch: proposalContentPatchSchema,
    },
  },
  SubmitProposalBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "accepted_challenge_version_id"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
      accepted_challenge_version_id: idSchema("chv"),
    },
  },
  StartProposalEligibilityReviewBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  DecideProposalEligibilityBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "decision", "reason"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      decision: { type: "string", enum: ["eligible", "ineligible"] },
      reason: { type: "string", minLength: 1, maxLength: 10_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  RequestProposalClarificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "question"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      question: { type: "string", minLength: 1, maxLength: 10_000 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  SubmitProposalClarificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "clarification_id", "response"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      clarification_id: idSchema("pcl"),
      response: { type: "string", minLength: 1, maxLength: 20_000 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ResolveProposalClarificationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "clarification_id", "resolution"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      clarification_id: idSchema("pcl"),
      resolution: { type: "string", minLength: 1, maxLength: 10_000 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  RequestProposalRevisionBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "scope", "revision_deadline"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      scope: { type: "string", minLength: 1, maxLength: 10_000 },
      revision_deadline: dateTimeSchema,
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  StartProposalRevisionBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "revision_request_id"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      revision_request_id: idSchema("prr"),
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ResubmitProposalBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "accepted_challenge_version_id", "revision_request_id"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      accepted_challenge_version_id: idSchema("chv"),
      revision_request_id: idSchema("prr"),
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  ProposalParams: {
    type: "object",
    additionalProperties: false,
    required: ["proposalId"],
    properties: { proposalId: idSchema("prp") },
  },
  CaseParams: {
    type: "object",
    additionalProperties: false,
    required: ["caseId"],
    properties: { caseId: idSchema("case") },
  },
  SavedOpportunity: savedOpportunitySchema,
  SavedOpportunityList: savedOpportunityListSchema,
  SavedOpportunityListSuccessEnvelope: successEnvelopeFor(savedOpportunityListSchema),
  SaveOpportunityBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: { expected_version: { const: 0 } },
  },
  UnsaveOpportunityBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
      step_up_token: { type: "string", minLength: 1, maxLength: 4_096 },
    },
  },
  OfferResponseContent: offerResponseContentSchema,
  OfferResponseContentPatch: offerResponseContentPatchSchema,
  OfferResponse: offerResponseSchema,
  DirectOffer: directOfferSchema,
  DirectOfferList: directOfferListSchema,
  DirectOfferSuccessEnvelope: successEnvelopeFor(directOfferSchema, true),
  DirectOfferListSuccessEnvelope: successEnvelopeFor(directOfferListSchema),
  CreateDirectOfferBody: {
    type: "object",
    additionalProperties: false,
    required: [
      "expected_version",
      "challenge_id",
      "challenge_version_id",
      "recipient_workspace_id",
      "title",
      "summary",
      "invitation_reasons",
      "requested_documents",
      "response_deadline",
    ],
    properties: {
      expected_version: { const: 0 },
      challenge_id: idSchema("chl"),
      challenge_version_id: idSchema("chv"),
      recipient_workspace_id: idSchema("wsp"),
      title: { type: "string", minLength: 1, maxLength: 240 },
      summary: { type: "string", minLength: 1, maxLength: 4_000 },
      invitation_reasons: directOfferSchema.properties.invitation_reasons,
      requested_documents: directOfferSchema.properties.requested_documents,
      response_deadline: dateTimeSchema,
    },
  },
  ViewDirectOfferBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: versionedCommandProperties,
  },
  StartOfferResponseBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: versionedCommandProperties,
  },
  PatchOfferResponseBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "patch"],
    properties: { ...versionedCommandProperties, patch: offerResponseContentPatchSchema },
  },
  SubmitOfferResponseBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: versionedCommandProperties,
  },
  DeclineDirectOfferBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      ...versionedCommandProperties,
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
    },
  },
  CancelDirectOfferBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version", "reason"],
    properties: {
      ...versionedCommandProperties,
      reason: { type: "string", minLength: 1, maxLength: 2_000 },
    },
  },
  StartDirectOfferNegotiationBody: {
    type: "object",
    additionalProperties: false,
    required: ["expected_version"],
    properties: versionedCommandProperties,
  },
  DirectOfferParams: {
    type: "object",
    additionalProperties: false,
    required: ["directOfferId"],
    properties: { directOfferId: idSchema("dof") },
  },
} as const satisfies Readonly<Record<string, JsonSchema>>;

export type ApiSchemaName = keyof typeof apiSchemas;
