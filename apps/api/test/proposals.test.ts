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

describe("C5 bilateral proposal clarification and revision", () => {
  let app: FastifyInstance;
  let composition: DemoApiComposition;

  beforeEach(() => {
    composition = createDemoApiComposition({ mode: "demo", nodeEnv: "test", clock });
    app = buildApi(composition.ports);
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs the canonical flow and replaces the grant with the exact resubmitted version", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c5-create-0001"),
      payload: {
        expected_version: 0,
        challenge_id: demoPublishedChallengeId,
        draft: readyProposalDraft(),
      },
    });
    const proposalId = created.json<MutationSuccessEnvelope>().data.entity_id;
    await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-submit-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: "chv_published_public_001",
      },
    });

    const organizationCommand = async (
      route: string,
      key: string,
      payload: Readonly<Record<string, unknown>>,
    ) =>
      app.inject({
        method: "POST",
        url: route.replace("{proposalId}", proposalId),
        headers: headers(demoApiCredentials.foreignOwner, key),
        payload,
      });

    expect(
      (
        await organizationCommand(
          apiRoutes.startProposalEligibilityReview,
          "c5-start-eligibility-0001",
          { expected_version: 2 },
        )
      ).json<MutationSuccessEnvelope>().data.next_actions,
    ).toEqual(["record_eligibility"]);
    await organizationCommand(apiRoutes.decideProposalEligibility, "c5-decide-eligible-0001", {
      expected_version: 3,
      decision: "eligible",
      reason: "The submitted workspace and call requirements match.",
    });
    await organizationCommand(
      apiRoutes.requestProposalClarification,
      "c5-request-clarification-0001",
      {
        expected_version: 4,
        question: "Clarify the measurable baseline used by the pilot.",
      },
    );

    let solver = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver),
    });
    let proposal = solver.json<ProposalSuccessEnvelope>().data;
    const clarificationId = proposal.clarifications[0]!.id;
    expect(proposal).toMatchObject({ state: "clarification_requested", version: 5 });

    const clarificationBody = {
      expected_version: 5,
      clarification_id: clarificationId,
      response: "The baseline is the preceding 30-day normalized meter average.",
    } as const;
    const clarified = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposalClarification.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-submit-clarification-0001"),
      payload: clarificationBody,
    });
    expect(clarified.statusCode).toBe(200);
    const clarificationReplay = await app.inject({
      method: "POST",
      url: apiRoutes.submitProposalClarification.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-submit-clarification-0001"),
      payload: clarificationBody,
    });
    expect(clarificationReplay.json<MutationSuccessEnvelope>().data.idempotent).toBe(true);

    await organizationCommand(
      apiRoutes.resolveProposalClarification,
      "c5-resolve-clarification-0001",
      {
        expected_version: 6,
        clarification_id: clarificationId,
        resolution: "Baseline explanation accepted for review.",
      },
    );
    await organizationCommand(apiRoutes.requestProposalRevision, "c5-request-revision-0001", {
      expected_version: 7,
      scope: "Update the title and preserve the accepted baseline explanation.",
      revision_deadline: "2026-09-10T09:00:00.000Z",
    });

    solver = await app.inject({
      method: "GET",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver),
    });
    proposal = solver.json<ProposalSuccessEnvelope>().data;
    const revisionRequestId = proposal.revision_requests[0]!.id;
    const originalLockedVersionId = proposal.revision_requests[0]!.base_version_id;
    expect(proposal).toMatchObject({ state: "revision_requested", version: 8 });

    await app.inject({
      method: "POST",
      url: apiRoutes.startProposalRevision.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-start-revision-0001"),
      payload: { expected_version: 8, revision_request_id: revisionRequestId },
    });
    await app.inject({
      method: "PATCH",
      url: apiRoutes.proposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-edit-revision-0001"),
      payload: {
        expected_version: 9,
        patch: { title: "پیشنهاد پایش و بهینه‌سازی هوشمند انرژی" },
      },
    });
    const resubmitted = await app.inject({
      method: "POST",
      url: apiRoutes.resubmitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-resubmit-0001"),
      payload: {
        expected_version: 10,
        revision_request_id: revisionRequestId,
        accepted_challenge_version_id: "chv_published_public_001",
      },
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.json<MutationSuccessEnvelope>().data.next_actions).toEqual(["await_review"]);

    const organization = await app.inject({
      method: "GET",
      url: apiRoutes.organizationProposalById.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.foreignOwner),
    });
    const resource = organization.json<OrganizationProposalSuccessEnvelope>().data;
    expect(resource).toMatchObject({ state: "resubmitted" });
    expect(resource.content.title).toBe("پیشنهاد پایش و بهینه‌سازی هوشمند انرژی");
    expect(resource.submitted_version.id).not.toBe(originalLockedVersionId);
    expect(resource.submitted_version.changed_fields).toContain("title");
    expect(resource.clarifications[0]).toMatchObject({ state: "resolved" });
    expect(resource.revision_requests[0]).toMatchObject({
      state: "resubmitted",
      base_version_id: originalLockedVersionId,
      resubmitted_version_id: resource.submitted_version.id,
    });

    const snapshot = composition.proposals.snapshot();
    expect(snapshot.grants.filter(({ state }) => state === "active")).toHaveLength(1);
    expect(snapshot.grants.filter(({ state }) => state === "revoked")).toHaveLength(1);
    expect(snapshot.outboxEvents.map(({ event_type }) => event_type)).toEqual([
      "proposal.draft.created",
      "proposal.submitted",
      "proposal.eligibility.started",
      "proposal.eligible",
      "proposal.clarification.requested",
      "proposal.clarification.submitted",
      "proposal.review.started",
      "proposal.revision.requested",
      "proposal.revision.draft.created",
      "proposal.draft.updated",
      "proposal.resubmitted",
    ]);
  });

  it("denies a different organization and rejects expired or stale revision commands", async () => {
    const created = await app.inject({
      method: "POST",
      url: apiRoutes.proposals,
      headers: headers(demoApiCredentials.solver, "c5-negative-create-0001"),
      payload: {
        expected_version: 0,
        challenge_id: demoPublishedChallengeId,
        draft: readyProposalDraft(),
      },
    });
    const proposalId = created.json<MutationSuccessEnvelope>().data.entity_id;
    await app.inject({
      method: "POST",
      url: apiRoutes.submitProposal.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.solver, "c5-negative-submit-0001"),
      payload: {
        expected_version: 1,
        accepted_challenge_version_id: "chv_published_public_001",
      },
    });
    const wrongOrganization = await app.inject({
      method: "POST",
      url: apiRoutes.startProposalEligibilityReview.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.owner, "c5-wrong-org-0001"),
      payload: { expected_version: 2 },
    });
    expect(wrongOrganization.statusCode).toBe(404);

    const stale = await app.inject({
      method: "POST",
      url: apiRoutes.startProposalEligibilityReview.replace("{proposalId}", proposalId),
      headers: headers(demoApiCredentials.foreignOwner, "c5-stale-org-0001"),
      payload: { expected_version: 1 },
    });
    expect(stale.statusCode).toBe(409);
  });
});
