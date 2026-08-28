import type {
  ApiError,
  ChallengeApprovalResource,
  ChallengeDraftContentResource,
  ChallengeResource,
  CreateChallengeBody,
  ErrorEnvelope,
  MeResource,
  MutationReceipt,
  MutationSuccessEnvelope,
  OutboxEvent,
  PatchChallengeBody,
  SessionExchangeBody,
  SessionRefreshBody,
  SessionRevokeBody,
  SessionSuccessEnvelope,
  SessionTokenSet,
  SuccessEnvelope,
  SwitchWorkspaceContextBody,
  VersionedApiMeta,
  WorkspaceContextResource,
} from "@rahhal/contracts";
import { applicantScopeForTypes, idPrefixes, type EntityId } from "@rahhal/domain";

import { deterministicId, fixedTimestamp } from "./deterministic.js";

type ChallengeResourceOverrides = Partial<Omit<ChallengeResource, "content">> & {
  readonly content?: Partial<ChallengeDraftContentResource>;
};

export function buildApiMeta(overrides: Partial<VersionedApiMeta> = {}): VersionedApiMeta {
  return {
    server_time: fixedTimestamp,
    correlation_id: deterministicId(idPrefixes.correlation),
    entity_version: 1,
    ...overrides,
  };
}

export function buildMutationReceipt<
  TargetId extends string = EntityId,
  NextAction extends string = string,
>(
  overrides: Partial<MutationReceipt<TargetId, NextAction>> & {
    readonly entity_id: TargetId;
  },
): MutationReceipt<TargetId, NextAction> {
  return {
    receipt_id: deterministicId(idPrefixes.receipt),
    audit_event_id: deterministicId(idPrefixes.auditEvent),
    timestamp: fixedTimestamp,
    idempotent: false,
    next_actions: [],
    ...overrides,
  };
}

export function buildMutationSuccess<
  TargetId extends string = EntityId,
  NextAction extends string = string,
>(
  receiptOverrides: Partial<MutationReceipt<TargetId, NextAction>> & {
    readonly entity_id: TargetId;
  },
  metaOverrides: Partial<VersionedApiMeta> = {},
): MutationSuccessEnvelope<TargetId, NextAction> {
  return {
    ok: true,
    data: buildMutationReceipt(receiptOverrides),
    meta: buildApiMeta(metaOverrides),
  };
}

export function buildSuccessEnvelope<Data>(
  data: Data,
  metaOverrides: Partial<VersionedApiMeta> = {},
): SuccessEnvelope<Data> {
  return { ok: true, data, meta: buildApiMeta(metaOverrides) };
}

export function buildErrorEnvelope(
  errorOverrides: Partial<ApiError> = {},
  metaOverrides: Partial<VersionedApiMeta> = {},
): ErrorEnvelope {
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: "The request is invalid.",
      ...errorOverrides,
    },
    meta: buildApiMeta(metaOverrides),
  };
}

export function buildChallengeContentResource(
  overrides: Partial<ChallengeDraftContentResource> = {},
): ChallengeDraftContentResource {
  const content: ChallengeDraftContentResource = {
    title: "Test Challenge",
    summary: "A deterministic challenge draft for tests.",
    category: "operations",
    location: "remote",
    desired_outcome: "Prove the target outcome.",
    current_state: "The current process is manual.",
    consequence: "The current process is slow.",
    expected_output: "A validated solution design.",
    success_criteria: [
      {
        id: "criterion-1",
        title: "Target result",
        target: "At least 20 percent improvement",
        method: "Compare the agreed baseline and pilot result.",
      },
    ],
    in_scope: "The pilot workflow.",
    constraints: "Use approved test data only.",
    organization_support: "A subject-matter expert and test environment.",
    previous_attempts: "No prior pilot.",
    output_type: "pilot",
    sourcing_model: "public",
    applicant_scope: "both",
    allowed_applicant_types: ["individual", "expert-team", "company"],
    work_mode: "hybrid",
    proposal_deadline: "2030-02-01T00:00:00.000Z",
    preferred_start_date: "2030-03-01T00:00:00.000Z",
    budget: { status: "fixed", amount_minor: 100_000_000, currency: "IRR" },
    invitees: [],
    visibility: "registered",
    public_summary: "A public-safe summary.",
    verification_required: false,
    nda_required: false,
    document_gate_required: false,
    ip_terms: "solver_license",
    contact: {
      name: "Test Contact",
      email: "contact@example.test",
      phone: "+980000000000",
    },
    accuracy_confirmed: true,
    legal_notes: "",
    attachment_ids: [],
    ...overrides,
  };
  return {
    ...content,
    applicant_scope: applicantScopeForTypes(content.allowed_applicant_types),
  };
}

export function buildChallengeResource(
  overrides: ChallengeResourceOverrides = {},
): ChallengeResource {
  const { content: contentOverrides, ...aggregateOverrides } = overrides;

  return {
    id: deterministicId(idPrefixes.challenge),
    current_version_id: deterministicId(idPrefixes.challengeVersion),
    published_version_id: null,
    tenant_id: deterministicId(idPrefixes.tenant),
    workspace_id: deterministicId(idPrefixes.workspace),
    stage: "draft",
    authoring_status: "draft",
    version: 1,
    content_version: 1,
    readiness: { ready: true, evaluated_version: 1, issues: [] },
    content: buildChallengeContentResource(contentOverrides),
    approvals: [],
    publication_readiness: {
      ready: false,
      satisfied: [],
      missing: ["technical", "legal", "finance", "quality"],
    },
    created_by: deterministicId(idPrefixes.user),
    created_at: fixedTimestamp,
    updated_at: fixedTimestamp,
    ...aggregateOverrides,
  };
}

export function buildChallengeApprovalResource(
  overrides: Partial<ChallengeApprovalResource> = {},
): ChallengeApprovalResource {
  return {
    id: deterministicId(idPrefixes.challengeApproval),
    challenge_id: deterministicId(idPrefixes.challenge),
    challenge_version_id: deterministicId(idPrefixes.challengeVersion),
    gate: "technical",
    decision: "approved",
    reason: "پروفایل فنی و امکان‌سنجی بررسی و تأیید شد.",
    recorded_by: deterministicId(idPrefixes.user),
    recorded_by_role: "org:approver_technical",
    recorded_at: fixedTimestamp,
    ...overrides,
  };
}

export function buildWorkspaceContextResource(
  overrides: Partial<WorkspaceContextResource> = {},
): WorkspaceContextResource {
  return {
    tenant_id: deterministicId(idPrefixes.tenant),
    workspace_id: deterministicId(idPrefixes.workspace),
    workspace_kind: "org",
    ...overrides,
  };
}

export function buildSessionTokenSet(overrides: Partial<SessionTokenSet> = {}): SessionTokenSet {
  return {
    session_id: deterministicId(idPrefixes.session),
    access_token: "test-access-token-0000000000000001",
    refresh_token: "test-refresh-token-00000000000001",
    token_type: "Bearer",
    access_token_expires_at: "2026-01-01T00:15:00.000Z",
    refresh_token_expires_at: "2026-01-08T00:00:00.000Z",
    ...overrides,
  };
}

export function buildSessionExchangeBody(
  overrides: Partial<SessionExchangeBody> = {},
): SessionExchangeBody {
  return {
    expected_version: 0,
    authorization_code: "test-authorization-code",
    code_verifier: "test-code-verifier-000000000000000000000000000",
    redirect_uri: "https://app.example.test/auth/callback",
    state: "test-state-0001",
    ...overrides,
  };
}

export function buildSessionRefreshBody(
  overrides: Partial<SessionRefreshBody> = {},
): SessionRefreshBody {
  return {
    expected_version: 1,
    refresh_token: "test-refresh-token-00000000000001",
    ...overrides,
  };
}

export function buildSessionRevokeBody(
  overrides: Partial<SessionRevokeBody> = {},
): SessionRevokeBody {
  return {
    expected_version: 1,
    session_id: deterministicId(idPrefixes.session),
    ...overrides,
  };
}

export function buildSwitchWorkspaceContextBody(
  overrides: Partial<SwitchWorkspaceContextBody> = {},
): SwitchWorkspaceContextBody {
  return {
    expected_version: 1,
    workspace_id: deterministicId(idPrefixes.workspace),
    ...overrides,
  };
}

export function buildCreateChallengeBody(
  overrides: Partial<CreateChallengeBody> = {},
): CreateChallengeBody {
  return {
    expected_version: 0,
    draft: {
      title: "Test Challenge",
      applicant_scope: "both",
      allowed_applicant_types: ["individual", "expert-team", "company"],
    },
    ...overrides,
  };
}

export function buildPatchChallengeBody(
  overrides: Partial<PatchChallengeBody> = {},
): PatchChallengeBody {
  return {
    expected_version: 1,
    patch: { summary: "Updated deterministic summary." },
    ...overrides,
  };
}

export function buildSessionSuccessEnvelope(
  overrides: Partial<SessionSuccessEnvelope> = {},
): SessionSuccessEnvelope {
  const tokens = buildSessionTokenSet();

  return {
    ok: true,
    data: {
      tokens,
      receipt: buildMutationReceipt({
        entity_id: tokens.session_id,
        next_actions: ["continue"],
      }),
    },
    meta: buildApiMeta(),
    ...overrides,
  };
}

export function buildOutboxEvent<Payload>(
  payload: Payload,
  overrides: Partial<OutboxEvent<Payload>> = {},
): OutboxEvent<Payload> {
  return {
    event_id: deterministicId(idPrefixes.outboxEvent),
    event_type: "challenge.draft.updated",
    schema_version: 1,
    aggregate_type: "challenge",
    aggregate_id: deterministicId(idPrefixes.challenge),
    tenant_id: deterministicId(idPrefixes.tenant),
    correlation_id: deterministicId(idPrefixes.correlation),
    occurred_at: fixedTimestamp,
    payload,
    ...overrides,
  };
}

export function buildMeResource(overrides: Partial<MeResource> = {}): MeResource {
  const context = buildWorkspaceContextResource();
  const userId = deterministicId(idPrefixes.user);

  return {
    user: {
      id: userId,
      display_name: "Test User",
      primary_email: "test.user@example.test",
      email_verified: true,
    },
    memberships: [
      {
        id: deterministicId(idPrefixes.membership),
        tenant_id: context.tenant_id,
        workspace_id: context.workspace_id,
        user_id: userId,
        role: "org:member",
        state: "active",
        created_at: fixedTimestamp,
        updated_at: fixedTimestamp,
      },
    ],
    workspaces: [
      {
        id: context.workspace_id,
        tenant_id: context.tenant_id,
        kind: "org",
        name: "Test Organization Workspace",
      },
    ],
    active_context: context,
    ...overrides,
  };
}
