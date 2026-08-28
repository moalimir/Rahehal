import {
  applicantScopes,
  applicantTypes,
  approvalDecisions,
  challengeManagedStages,
  challengeBudgetStatuses,
  challengeDraftAuthoringStatuses,
  challengeIpTerms,
  challengeOutputTypes,
  challengeSourcingModels,
  challengeVisibilities,
  challengeWorkModes,
  currencies,
  membershipStates,
  organizationRoles,
  platformRoles,
  publicationGates,
  teamKinds,
  teamRoles,
  workspaceKinds,
  workspaceRoles,
} from "@rahhal/domain";

import { apiErrorCodes } from "./envelopes.js";

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
    published_at: dateTimeSchema,
  },
} as const;

const challengeResourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "current_version_id",
    "published_version_id",
    "tenant_id",
    "workspace_id",
    "stage",
    "authoring_status",
    "version",
    "content_version",
    "readiness",
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
    tenant_id: idSchema("ten"),
    workspace_id: idSchema("wsp"),
    stage: { type: "string", enum: challengeManagedStages },
    authoring_status: { type: "string", enum: challengeDraftAuthoringStatuses },
    version: { type: "integer", minimum: 1 },
    content_version: { type: "integer", minimum: 1 },
    readiness: challengeReadinessSchema,
    content: challengeDraftContentSchema,
    approvals: { type: "array", items: challengeApprovalResourceSchema },
    publication_readiness: publicationReadinessSchema,
    created_by: idSchema("usr"),
    created_at: dateTimeSchema,
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
  ChallengeApprovalResource: challengeApprovalResourceSchema,
  ChallengePublicProjection: challengePublicProjectionSchema,
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
} as const satisfies Readonly<Record<string, JsonSchema>>;

export type ApiSchemaName = keyof typeof apiSchemas;
