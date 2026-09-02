import {
  applicantScopes,
  applicantTypes,
  approvalDecisions,
  challengeManagedStages,
  challengePublicationStates,
  challengeBudgetStatuses,
  challengeDraftAuthoringStatuses,
  challengeIpTerms,
  challengeOutputTypes,
  challengeSourcingModels,
  challengeVisibilities,
  challengeWorkModes,
  currencies,
  eligibilityGateKinds,
  eligibilityNextActions,
  eligibilityReasonCodes,
  membershipStates,
  organizationRoles,
  platformRoles,
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
  required: ["id", "display_name", "primary_email", "email_verified"],
  properties: {
    id: idSchema("usr"),
    display_name: { type: "string", minLength: 1, maxLength: 200 },
    primary_email: { type: "string", format: "email", maxLength: 320 },
    email_verified: { type: "boolean" },
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

export const apiSchemas = {
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
} as const satisfies Readonly<Record<string, JsonSchema>>;

export type ApiSchemaName = keyof typeof apiSchemas;
