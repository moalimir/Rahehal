import {
  apiRoutes,
  type ErrorEnvelope,
  type MutationSuccessEnvelope,
  type OrganizationProposalInboxSuccessEnvelope,
  type OrganizationProposalSuccessEnvelope,
  type ProposalSuccessEnvelope,
  type TeamSuccessEnvelope,
} from "@rahhal/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "../src/app.js";
import {
  createDemoApiComposition,
  demoApiCredentials,
  demoPublishedChallengeId,
  type DemoApiComposition,
} from "../src/demo-composition.js";

const clock = { now: () => new Date("2026-09-03T09:00:00.000Z") };

const readyProposalDraft = () => ({
  title: "پیشنهاد پایش هوشمند انرژی",
  problem_statement: "مصرف انرژی بدون پایش دقیق باعث اتلاف منابع و افزایش هزینه می‌شود.",
  value_proposition: "این راهکار الگوهای مصرف را آشکار و اقدام اصلاحی قابل سنجش پیشنهاد می‌کند.",
  prototype_weeks: "6",
  technical_approach:
    "داده‌های کنتور با قواعد قطعی تحلیل و نتایج در داشبورد امن نمایش داده می‌شوند.",
  success_metrics: "کاهش ده درصدی مصرف در دوره پایلوت",
  ip_status: "owned",
  duration_weeks: "12",
  budget_amount_minor: 125_000_000,
  budget_currency: "IRR" as const,
  nda_accepted: false,
  conflict_declared: true,
  ip_accepted: true,
  accuracy_confirmed: true,
});

function headers(
  credential: { readonly accessToken: string; readonly workspaceId: string },
  idempotencyKey?: string,
) {
  return {
    authorization: `Bearer ${credential.accessToken}`,
    "x-workspace-id": credential.workspaceId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

describe("C3 authoritative proposal drafts", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;

  beforeEach(() => {
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates, reads, and appends unlocked workspace-scoped draft versions atomically", async () => {
    const createBody = {
      expected_version: 0,
      challenge_id: demoPublishedChallengeId,
      draft: {
        title: "پیشنهاد پایش هوشمند انرژی",
        budget_amount_minor: 125_000_000,
        budget_currency: "IRR",
        attachment_ids: ["fil_synthetic_metadata_001"],
      },
    } as const;
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c3-create-individual-0001"),
      payload: createBody,
    });
    expect(created.statusCode).toBe(201);
    const firstReceipt = created.json<MutationSuccessEnvelope>().data;
    const proposalId = firstReceipt.entity_id;

    const replay = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c3-create-individual-0001"),
      payload: createBody,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...firstReceipt,
      idempotent: true,
    });

    const initial = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver),
    });
    expect(initial.statusCode).toBe(200);
    const first = initial.json<ProposalSuccessEnvelope>().data;
    expect(first).toMatchObject({
      id: proposalId,
      owner_workspace_kind: "individual",
      challenge_id: demoPublishedChallengeId,
      assigned_membership_ids: [],
      state: "draft",
      version: 1,
      content: {
        budget_amount_minor: 125_000_000,
        budget_currency: "IRR",
        attachment_ids: ["fil_synthetic_metadata_001"],
      },
      versions: [
        {
          version_number: 1,
          base_version_id: null,
          accepted_challenge_version_id: null,
          locked: false,
        },
      ],
    });

    const patchBody = {
      expected_version: 1,
      patch: {
        title: "پیشنهاد پایش و کاهش هوشمند انرژی",
        budget_amount_minor: 130_000_000,
      },
    } as const;
    const patched = await app.inject({
      method: "PATCH",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c3-patch-individual-0001"),
      payload: patchBody,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<MutationSuccessEnvelope>().meta.entity_version).toBe(2);
    const patchReplay = await app.inject({
      method: "PATCH",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c3-patch-individual-0001"),
      payload: patchBody,
    });
    expect(patchReplay.json<MutationSuccessEnvelope>().data.idempotent).toBe(true);

    const after = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver),
    });
    const current = after.json<ProposalSuccessEnvelope>().data;
    expect(current.version).toBe(2);
    expect(current.versions[1]).toMatchObject({
      version_number: 2,
      base_version_id: first.current_version_id,
      changed_fields: ["title", "budget_amount_minor"],
      locked: false,
    });
    expect(current.versions[1]?.content_hash).toMatch(/^[0-9a-f]{64}$/);

    await expect(
      app.inject({
        method: "PATCH",
        url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
        headers: headers(demoApiCredentials.solver, "c3-patch-stale-0001"),
        payload: patchBody,
      }),
    ).resolves.toMatchObject({ statusCode: 409 });
    const snapshot = composition.proposals.snapshot();
    expect(snapshot.auditEvents.map(({ action }) => action)).toEqual([
      "proposal.draft.created",
      "proposal.draft.updated",
    ]);
    expect(snapshot.outboxEvents).toHaveLength(2);
    expect(JSON.stringify(snapshot.outboxEvents)).not.toContain("پیشنهاد پایش");
    expect(snapshot.idempotencyEntryCount).toBe(2);
  });

  it("denies unreachable calls, duplicate drafts, cross-workspace ID swaps, and viewers", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c3-create-unknown-0001"),
      payload: { expected_version: 0, challenge_id: "chl_unreachable_0001" },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");

    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c3-create-scope-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    const proposalId = created.json<MutationSuccessEnvelope>().data.entity_id;
    const duplicate = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c3-create-duplicate-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    expect(duplicate.statusCode).toBe(409);

    for (const method of ["GET", "PATCH"] as const) {
      const swapped = await app.inject({
        method,
        url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
        headers: headers(
          demoApiCredentials.solverTeam,
          method === "PATCH" ? "c3-cross-workspace-patch-0001" : undefined,
        ),
        ...(method === "PATCH"
          ? { payload: { expected_version: 1, patch: { title: "نباید ذخیره شود" } } }
          : {}),
      });
      expect(swapped.statusCode).toBe(404);
      expect(swapped.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    }

    const viewerDenied = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solverTeamViewer, "c3-viewer-create-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    expect(viewerDenied.statusCode).toBe(403);
    expect(viewerDenied.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");
    expect(composition.decisionAudit.snapshot()).toContainEqual(
      expect.objectContaining({
        outcome: "denied",
        action: "proposal:create",
        entityType: "proposal",
        reason: "command_denied",
      }),
    );
  });

  it("auto-assigns a contributing creator and rechecks role authority before replay", async () => {
    const team = await app.inject({
      method: "GET",
      url: apiRoutes.solverTeam,
      headers: headers(demoApiCredentials.solverTeam),
    });
    const viewer = team
      .json<TeamSuccessEnvelope>()
      .data.members.find((member) => member.role === "team:viewer")!;
    const promoted = await app.inject({
      method: "POST",
      url: apiRoutes.changeSolverTeamMemberRole.replace("{membershipId}", viewer.id),
      headers: headers(demoApiCredentials.solverTeam, "c3-promote-contributor-0001"),
      payload: {
        expected_version: viewer.version,
        role: "team:contributor",
        reason: "تخصیص برای تدوین پیشنهاد",
      },
    });
    expect(promoted.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solverTeamViewer, "c3-contributor-create-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    expect(created.statusCode).toBe(201);
    const proposalId = created.json<MutationSuccessEnvelope>().data.entity_id;
    const readable = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solverTeamViewer),
    });
    expect(readable.statusCode).toBe(200);
    expect(readable.json<ProposalSuccessEnvelope>().data.assigned_membership_ids).toEqual([
      viewer.id,
    ]);

    const demoted = await app.inject({
      method: "POST",
      url: apiRoutes.changeSolverTeamMemberRole.replace("{membershipId}", viewer.id),
      headers: headers(demoApiCredentials.solverTeam, "c3-demote-contributor-0001"),
      payload: {
        expected_version: viewer.version + 1,
        role: "team:viewer",
        reason: "پایان دسترسی تدوین",
      },
    });
    expect(demoted.statusCode).toBe(200);

    const deniedReplay = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solverTeamViewer, "c3-contributor-create-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    expect(deniedReplay.statusCode).toBe(403);
    expect(deniedReplay.json<ErrorEnvelope>().error.code).toBe("NO_ACCESS");

    const denied = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solverTeamViewer),
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
  });

  it("keeps an unassigned contributor outside another member's private draft", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solverTeam, "c3-owner-team-create-0001"),
      payload: { expected_version: 0, challenge_id: demoPublishedChallengeId },
    });
    expect(created.statusCode).toBe(201);
    const proposalId = created.json<MutationSuccessEnvelope>().data.entity_id;

    const team = await app.inject({
      method: "GET",
      url: apiRoutes.solverTeam,
      headers: headers(demoApiCredentials.solverTeam),
    });
    const viewer = team
      .json<TeamSuccessEnvelope>()
      .data.members.find((member) => member.role === "team:viewer")!;
    const promoted = await app.inject({
      method: "POST",
      url: apiRoutes.changeSolverTeamMemberRole.replace("{membershipId}", viewer.id),
      headers: headers(demoApiCredentials.solverTeam, "c3-promote-unassigned-0001"),
      payload: {
        expected_version: viewer.version,
        role: "team:contributor",
        reason: "عضو فعال بدون تخصیص این پیشنهاد",
      },
    });
    expect(promoted.statusCode).toBe(200);

    for (const method of ["GET", "PATCH"] as const) {
      const denied = await app.inject({
        method,
        url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
        headers: headers(
          demoApiCredentials.solverTeamViewer,
          method === "PATCH" ? "c3-unassigned-patch-0001" : undefined,
        ),
        ...(method === "PATCH"
          ? { payload: { expected_version: 1, patch: { title: "نباید ذخیره شود" } } }
          : {}),
      });
      expect(denied.statusCode).toBe(404);
      expect(denied.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
    }
  });
});

describe("C4 authoritative proposal submission", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;

  beforeEach(() => {
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createReadyProposal(
    credential: {
      readonly accessToken: string;
      readonly workspaceId: string;
    } = demoApiCredentials.solver,
  ) {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(credential, `c4-create-${credential.workspaceId}`),
      payload: {
        expected_version: 0,
        challenge_id: demoPublishedChallengeId,
        draft: readyProposalDraft(),
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json<MutationSuccessEnvelope>().data.entity_id;
  }

  it("submits an unverified solver when verification is not required and replays one lock and grant", async () => {
    const proposalId = await createReadyProposal();
    const body = {
      expected_version: 1,
      accepted_challenge_version_id: "chv_published_public_001",
    } as const;
    const submitted = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-success-0001"),
      payload: body,
    });
    expect(submitted.statusCode).toBe(200);
    const receipt = submitted.json<MutationSuccessEnvelope>();
    expect(receipt.meta.entity_version).toBe(2);
    expect(receipt.data.next_actions).toEqual(["await_eligibility"]);

    const replay = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-success-0001"),
      payload: body,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<MutationSuccessEnvelope>().data).toEqual({
      ...receipt.data,
      idempotent: true,
    });

    const solverRead = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver),
    });
    const proposal = solverRead.json<ProposalSuccessEnvelope>().data;
    expect(proposal).toMatchObject({
      state: "submitted",
      version: 2,
      submitted_at: "2026-09-03T09:00:00.000Z",
    });
    expect(proposal.tracking_code).toMatch(/^PRP-2026-\d{6}$/);
    expect(proposal.versions[1]).toMatchObject({
      base_version_id: proposal.versions[0]?.id,
      accepted_challenge_version_id: "chv_published_public_001",
      changed_fields: [],
      locked: true,
    });

    const snapshot = composition.proposals.snapshot();
    expect(snapshot.grants).toHaveLength(1);
    expect(
      snapshot.auditEvents.filter(({ action }) => action === "proposal.submitted"),
    ).toHaveLength(1);
    const submissionEvents = snapshot.outboxEvents.filter(
      ({ event_type }) => event_type === "proposal.submitted",
    );
    expect(submissionEvents).toHaveLength(1);
    expect(JSON.stringify(submissionEvents)).not.toContain("مصرف انرژی");

    const mismatchedReplay = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-success-0001"),
      payload: { ...body, expected_version: 2 },
    });
    expect(mismatchedReplay.statusCode).toBe(409);

    const doubleSubmit = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-double-0001"),
      payload: { ...body, expected_version: 2 },
    });
    expect(doubleSubmit.statusCode).toBe(409);
    expect(doubleSubmit.json<ErrorEnvelope>().error.code).toBe("INVALID_STATE");
  });

  it("exposes only the exact locked version through the active challenge-owner grant", async () => {
    const proposalId = await createReadyProposal();
    await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-org-read-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: "chv_published_public_001",
      },
    });

    const inbox = await app.inject({
      method: "GET",
      url: apiRoutes.organizationProposalInbox,
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(inbox.statusCode).toBe(200);
    const item = inbox.json<OrganizationProposalInboxSuccessEnvelope>().data.items[0];
    expect(item).toMatchObject({ id: proposalId, challenge_id: demoPublishedChallengeId });
    expect(item).not.toHaveProperty("content");
    expect(item).not.toHaveProperty("grant_id");

    const detail = await app.inject({
      method: "GET",
      url: apiRoutes.organizationProposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(detail.statusCode).toBe(200);
    const resource = detail.json<OrganizationProposalSuccessEnvelope>().data;
    expect(resource.submitted_version).toMatchObject({
      id: item?.submitted_version.id,
      accepted_challenge_version_id: "chv_published_public_001",
    });
    expect(resource.content.title).toBe(readyProposalDraft().title);
    expect(resource).not.toHaveProperty("tenant_id");
    expect(resource).not.toHaveProperty("owner_workspace_id");

    const outOfScope = await app.inject({
      method: "GET",
      url: apiRoutes.organizationProposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.owner),
    });
    const unknown = await app.inject({
      method: "GET",
      url: apiRoutes.organizationProposalById.replace("{proposalId}", "prp_unknown_c4_001"),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    expect(outOfScope.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(outOfScope.json<ErrorEnvelope>().error).toEqual(unknown.json<ErrorEnvelope>().error);
  });

  it("returns exact actionable eligibility, terms, readiness, and sender denials", async () => {
    const currentProjection = composition.challenges
      .snapshot()
      .publicProjections.find(({ challenge_id }) => challenge_id === demoPublishedChallengeId)!;
    composition.challenges.seedPublicProjection({
      ...currentProjection,
      verification_required: true,
    });
    const verificationBlockedId = await createReadyProposal();
    const verificationBlocked = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", verificationBlockedId),
      headers: headers(demoApiCredentials.solver, "c4-submit-verification-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: currentProjection.challenge_version_id,
      },
    });
    expect(verificationBlocked.statusCode).toBe(409);
    expect(verificationBlocked.json<ErrorEnvelope>().error.eligibility).toMatchObject({
      evaluated_against_version_id: currentProjection.challenge_version_id,
      status: "needs_action",
      next_actions: ["verify_workspace"],
      reasons: [{ code: "verification_required" }],
    });
    expect(composition.proposals.snapshot().grants).toHaveLength(0);

    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    await app.close();
    app = buildApi(composition.ports);
    const invalidId = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c4-create-invalid-0001"),
      payload: {
        expected_version: 0,
        challenge_id: demoPublishedChallengeId,
        draft: { ...readyProposalDraft(), conflict_declared: false },
      },
    });
    const invalidProposalId = invalidId.json<MutationSuccessEnvelope>().data.entity_id;
    const staleTerms = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", invalidProposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-stale-terms-0001"),
      payload: { expected_version: 1, accepted_challenge_version_id: "chv_stale_terms_001" },
    });
    expect(staleTerms.statusCode).toBe(409);
    expect(staleTerms.json<ErrorEnvelope>().error.recovery).toBe("refresh_challenge_terms");

    const invalid = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", invalidProposalId),
      headers: headers(demoApiCredentials.solver, "c4-submit-invalid-form-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: currentProjection.challenge_version_id,
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json<ErrorEnvelope>().error.fields).toContainEqual(
      expect.objectContaining({ path: "/content/conflict_declared", code: "required" }),
    );

    const teamProposalId = await createReadyProposal(demoApiCredentials.solverTeam);
    const viewerDenied = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", teamProposalId),
      headers: headers(demoApiCredentials.solverTeamViewer, "c4-viewer-submit-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: currentProjection.challenge_version_id,
      },
    });
    expect(viewerDenied.statusCode).toBe(404);
    expect(viewerDenied.json<ErrorEnvelope>().error.code).toBe("NOT_FOUND");
  });
});
