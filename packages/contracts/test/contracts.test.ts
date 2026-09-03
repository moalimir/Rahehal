import { describe, expect, expectTypeOf, it } from "vitest";

import {
  apiErrorCodes,
  apiRoutes,
  apiSchemas,
  isOutboxEvent,
  openApiDocument,
  type ApiError,
  type ApiErrorCode,
  type CreateChallengeBody,
  type ErrorEnvelope,
  type PatchChallengeBody,
  type OutboxEvent,
  type OidcAuthorizationStartBody,
  type CreateProposalBody,
  type PatchProposalBody,
  type SessionExchangeBody,
  type SuccessEnvelope,
} from "../src/index.js";

describe("authoritative API contracts", () => {
  it("keeps access denial, absence, and step-up as distinct stable codes", () => {
    expect(apiErrorCodes).toContain("NO_ACCESS");
    expect(apiErrorCodes).toContain("NOT_FOUND");
    expect(apiErrorCodes).toContain("STEP_UP_REQUIRED");
    expect(new Set(apiErrorCodes).size).toBe(apiErrorCodes.length);
    expectTypeOf<ApiError["code"]>().toEqualTypeOf<ApiErrorCode>();
  });

  it("carries optimistic concurrency in every implemented command body", () => {
    expect(apiSchemas.OidcAuthorizationStartBody.required).toContain("expected_version");
    expect(apiSchemas.SessionExchangeBody.required).toContain("expected_version");
    expect(apiSchemas.SessionRefreshBody.required).toContain("expected_version");
    expect(apiSchemas.SessionRevokeBody.required).toContain("expected_version");
    expect(apiSchemas.SwitchWorkspaceContextBody.required).toContain("expected_version");
    expect(apiSchemas.CreateChallengeBody.required).toContain("expected_version");
    expect(apiSchemas.PatchChallengeBody.required).toContain("expected_version");
    expect(apiSchemas.ChallengeTransitionBody.required).toContain("expected_version");
    expect(apiSchemas.PatchSolverWorkspaceProfileBody.required).toContain("expected_version");
    expect(apiSchemas.StartSolverVerificationBody.required).toContain("expected_version");
    expect(apiSchemas.AcceptEligibilityGateBody.required).toContain("expected_version");
    expect(apiSchemas.CreateTeamBody.required).toContain("expected_version");
    expect(apiSchemas.UpdateTeamPolicyBody.required).toContain("expected_version");
    expect(apiSchemas.UpdateTeamPolicyBody.required).toContain("reason");
    expect(apiSchemas.CreateTeamInvitationBody.required).toContain("expected_version");
    expect(apiSchemas.RespondTeamInvitationBody.required).toContain("expected_version");
    expect(apiSchemas.CreateTeamMembershipRequestBody.required).toContain("expected_version");
    expect(apiSchemas.DecideTeamMembershipRequestBody.required).toContain("expected_version");
    expect(apiSchemas.ChangeTeamMemberRoleBody.required).toContain("expected_version");
    expect(apiSchemas.TransferTeamOwnershipBody.required).toContain("expected_version");
    expect(apiSchemas.ArchiveTeamBody.required).toContain("expected_version");
    expect(apiSchemas.CreateProposalBody.required).toContain("expected_version");
    expect(apiSchemas.PatchProposalBody.required).toContain("expected_version");

    expectTypeOf<CreateChallengeBody["expected_version"]>().toEqualTypeOf<0>();
    expectTypeOf<PatchChallengeBody["expected_version"]>().toEqualTypeOf<number>();
    expectTypeOf<SessionExchangeBody["state"]>().toEqualTypeOf<string>();
    expectTypeOf<OidcAuthorizationStartBody["expected_version"]>().toEqualTypeOf<0>();
    expectTypeOf<CreateProposalBody["expected_version"]>().toEqualTypeOf<0>();
    expectTypeOf<PatchProposalBody["expected_version"]>().toEqualTypeOf<number>();
  });

  it("defines the complete canonical mutation receipt", () => {
    expect(apiSchemas.MutationReceipt.required).toEqual([
      "entity_id",
      "receipt_id",
      "audit_event_id",
      "timestamp",
      "idempotent",
      "next_actions",
    ]);
    expect(apiSchemas.VersionedApiMeta.required).toContain("entity_version");
  });

  it("publishes the implemented authoritative routes as OpenAPI 3.1", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(Object.keys(openApiDocument.paths)).toEqual(
      expect.arrayContaining([
        apiRoutes.openApi,
        apiRoutes.oidcAuthorizationStart,
        apiRoutes.sessionExchange,
        apiRoutes.sessionRefresh,
        apiRoutes.sessionRevoke,
        apiRoutes.me,
        apiRoutes.switchWorkspaceContext,
        apiRoutes.challenges,
        apiRoutes.challengeById,
        apiRoutes.requestChallengeTriage,
        apiRoutes.advanceChallengeFormulation,
        apiRoutes.requestChallengeApprovals,
        apiRoutes.platformChallengeApprovalQueue,
        apiRoutes.platformChallengeApprovalBrief,
        apiRoutes.solverProfile,
        apiRoutes.solverVerification,
        apiRoutes.startSolverVerification,
        apiRoutes.challengeEligibility,
        apiRoutes.acceptChallengeEligibilityGate,
        apiRoutes.solverTeams,
        apiRoutes.solverTeam,
        apiRoutes.solverTeamPolicy,
        apiRoutes.solverTeamInvitations,
        apiRoutes.revokeSolverTeamInvitation,
        apiRoutes.solverTeamIncomingInvitations,
        apiRoutes.respondSolverTeamInvitation,
        apiRoutes.createSolverTeamMembershipRequest,
        apiRoutes.solverTeamMembershipRequests,
        apiRoutes.decideSolverTeamMembershipRequest,
        apiRoutes.solverOwnTeamMembershipRequests,
        apiRoutes.withdrawSolverTeamMembershipRequest,
        apiRoutes.changeSolverTeamMemberRole,
        apiRoutes.suspendSolverTeamMember,
        apiRoutes.restoreSolverTeamMember,
        apiRoutes.removeSolverTeamMember,
        apiRoutes.transferSolverTeamOwnership,
        apiRoutes.leaveSolverTeam,
        apiRoutes.archiveSolverTeam,
        apiRoutes.proposals,
        apiRoutes.proposalById,
      ]),
    );

    const createOperation = openApiDocument.paths[apiRoutes.challenges].post;
    expect(createOperation.parameters.map((parameter) => parameter.name)).toEqual([
      "X-Workspace-Id",
      "Idempotency-Key",
    ]);
    expect(apiSchemas.ChallengeResource.required).toEqual(
      expect.arrayContaining(["version", "content_version", "readiness"]),
    );
  });

  it("keeps contact verification and synthetic document acknowledgement explicit", () => {
    expect(apiSchemas.SolverVerification.properties.state.enum).toContain("not_started");
    expect(apiSchemas.EligibilityGateParams.properties.gate.enum).toEqual([
      "nda",
      "document_acknowledgement",
    ]);
    expect(apiSchemas.EligibilityDecision.properties.next_actions.items.enum).toEqual([
      "verify_workspace",
      "accept_nda",
      "acknowledge_document_gate",
    ]);
    expect(apiSchemas.EligibilityDecision.properties).not.toHaveProperty("contact_verified");
    expect(apiSchemas.SolverWorkspaceProfile.properties).not.toHaveProperty("verification_state");
  });

  it("publishes the complete C2 team policy and recipient-safe lifecycle", () => {
    expect(apiSchemas.TeamPolicy.required).toHaveLength(8);
    expect(apiSchemas.Team.properties.status.enum).toEqual(["active", "archived"]);
    expect(apiSchemas.Team.properties.default_invitation_role.enum).not.toContain("team:owner");
    expect(apiSchemas.TeamInvitation.properties.id).toMatchObject({
      pattern: expect.stringContaining("tiv_"),
    });
    expect(apiSchemas.TeamMembershipRequest.properties.id).toMatchObject({
      pattern: expect.stringContaining("tmr_"),
    });
    expect(apiSchemas.DecideTeamMembershipRequestBody.required).toContain("reason");
    expect(apiSchemas.TransferTeamOwnershipBody.required).toContain("reason");
    expect(apiSchemas.ArchiveTeamBody.required).toContain("reason");
  });

  it("publishes C3 draft create/read/save without exposing submission or file authority", () => {
    expect(openApiDocument.paths[apiRoutes.proposals].post.operationId).toBe("createProposalDraft");
    expect(openApiDocument.paths[apiRoutes.proposalById].get.operationId).toBe("getProposalDraft");
    expect(openApiDocument.paths[apiRoutes.proposalById].patch.operationId).toBe(
      "patchProposalDraft",
    );
    expect(openApiDocument.paths[apiRoutes.proposalById]).not.toHaveProperty("post");
    expect(apiSchemas.Proposal.properties.id).toMatchObject({
      pattern: expect.stringContaining("prp_"),
    });
    expect(apiSchemas.ProposalVersion.properties.id).toMatchObject({
      pattern: expect.stringContaining("prv_"),
    });
    expect(apiSchemas.ProposalContentPatch.minProperties).toBe(1);
    expect(apiSchemas.ProposalContent.properties.budget_amount_minor).toMatchObject({
      type: ["integer", "null"],
      minimum: 0,
    });
    expect(apiSchemas.ProposalContent.properties.attachment_ids).toMatchObject({
      maxItems: 100,
      description: expect.stringContaining("metadata references only"),
    });
  });

  it("keeps the platform approval brief structurally narrower than the org aggregate", () => {
    const properties = Object.keys(apiSchemas.ChallengeApprovalBrief.properties.content.properties);
    expect(properties).not.toContain("contact");
    expect(properties).not.toContain("invitees");
    expect(properties).not.toContain("attachment_ids");
    expect(apiSchemas.ChallengeApprovalBrief.properties).not.toHaveProperty("tenant_id");
    expect(apiSchemas.ChallengeApprovalBrief.properties).not.toHaveProperty("created_by");
  });

  it("keeps transport contracts language-neutral", () => {
    expect(JSON.stringify({ apiSchemas, openApiDocument })).not.toMatch(/[\u0600-\u06ff]/u);
    expectTypeOf<SuccessEnvelope<{ value: string }> | ErrorEnvelope>().toMatchTypeOf<{
      ok: boolean;
    }>();
  });

  it("publishes every canonical workspace kind, including the operator workspace", () => {
    expect(
      apiSchemas.WorkspaceResource.oneOf.map((schema) => schema.properties.kind.const),
    ).toEqual(["platform", "org", "individual", "team"]);
  });

  it("validates untrusted outbox records at runtime", () => {
    const valid = {
      event_id: "evt_00000001",
      event_type: "challenge.draft.updated",
      schema_version: 1,
      aggregate_type: "challenge",
      aggregate_id: "chl_00000001",
      tenant_id: "ten_00000001",
      correlation_id: "cor_00000001",
      occurred_at: "2026-01-01T00:00:00.000Z",
      payload: { entity_version: 2 },
    };

    expect(isOutboxEvent(valid)).toBe(true);
    expect(isOutboxEvent({ ...valid, schema_version: 2 })).toBe(true);
    expect(isOutboxEvent({ ...valid, event_id: "not-an-event-id" })).toBe(false);
    expect(isOutboxEvent({ ...valid, aggregate_id: "aud_00000001" })).toBe(false);
    expect(isOutboxEvent({ ...valid, aggregate_id: "evt_00000002" })).toBe(false);
    expect(isOutboxEvent({ ...valid, occurred_at: "yesterday" })).toBe(false);
    expect(isOutboxEvent({ ...valid, payload: undefined })).toBe(false);
    expect(isOutboxEvent({ ...valid, unexpected: true })).toBe(false);

    const candidate: unknown = valid;
    if (!isOutboxEvent(candidate)) throw new Error("valid event did not narrow");
    expectTypeOf(candidate).toEqualTypeOf<OutboxEvent>();
  });
});
