import type {
  AcceptEligibilityGateBody,
  EligibilityDecisionResource,
  MutationReceipt,
  PatchSolverWorkspaceProfileBody,
  SolverProfileNextAction,
  SolverVerificationNextAction,
  SolverVerificationResource,
  SolverWorkspaceProfileResource,
  StartSolverVerificationBody,
  EligibilityGateNextAction,
} from "@rahhal/contracts";
import {
  evaluateProposalEligibility,
  evaluateSolverProfileReadiness,
  parseAuditEventId,
  parseEligibilityGateAcceptanceId,
  parseReceiptId,
  parseVerificationId,
  type EligibilityGateAcceptanceId,
  type EligibilityGateKind,
  type VerificationId,
  type WorkspaceId,
  type TeamWorkspace,
  type Workspace,
} from "@rahhal/domain";

import { ApiProblem, forbidden, idempotencyConflict, notFound, staleVersion } from "./errors.js";
import type { InMemoryChallengeRepository } from "./in-memory-challenges.js";
import { commandFingerprint } from "./primitives.js";
import { validateSolverProfilePatch } from "./solver-profile-validation.js";
import type {
  Clock,
  DemoIdentitySeed,
  EligibilityPort,
  IdFactory,
  MutationOutcome,
  SolverWorkspacePort,
  WorkspaceCommandContext,
  WorkspaceScope,
} from "./ports.js";

type CachedOutcome = {
  readonly fingerprint: string;
  readonly outcome: MutationOutcome<string, string>;
};

function canEditProfile(context: Pick<WorkspaceCommandContext, "role" | "teamPolicy">): boolean {
  return (
    context.role === "individual" ||
    context.role === "team:owner" ||
    context.role === "team:admin" ||
    (context.role === "team:proposal-manager" &&
      context.teamPolicy?.proposalManagersCanEditProfile === true)
  );
}

function canManageSolverAuthority(role: WorkspaceCommandContext["role"]): boolean {
  return role === "individual" || role === "team:owner" || role === "team:admin";
}

const scopedKey = (...parts: readonly string[]) => parts.join("\0");

export class InMemorySolverWorkspaceAdapter implements SolverWorkspacePort, EligibilityPort {
  private readonly profiles = new Map<WorkspaceId, SolverWorkspaceProfileResource>();
  private readonly verifications = new Map<WorkspaceId, SolverVerificationResource>();
  private readonly acceptances = new Map<string, EligibilityGateAcceptanceId>();
  private readonly idempotency = new Map<string, CachedOutcome>();
  private challengeReach?: (workspaceId: WorkspaceId, challengeId: string) => boolean;

  constructor(
    seeds: readonly DemoIdentitySeed[],
    private readonly challenges: InMemoryChallengeRepository,
    private readonly clock: Clock,
    private readonly ids: IdFactory,
  ) {
    const now = clock.now().toISOString();
    for (const seed of seeds) {
      if (seed.workspace.kind !== "individual" && seed.workspace.kind !== "team") continue;
      if (this.profiles.has(seed.workspace.id)) continue;
      const applicantType =
        seed.workspace.kind === "individual" ? "individual" : seed.workspace.teamKind;
      const facts = { headline: "", overview: "", expertise: [], geography: [] };
      this.profiles.set(seed.workspace.id, {
        tenant_id: seed.workspace.tenantId,
        workspace_id: seed.workspace.id,
        workspace_kind: seed.workspace.kind,
        applicant_type: applicantType,
        ...facts,
        readiness: evaluateSolverProfileReadiness(facts),
        version: 1,
        created_at: now,
        updated_at: now,
      });
      this.verifications.set(seed.workspace.id, {
        id: parseVerificationId("ver_" + seed.workspace.id.slice(4)),
        tenant_id: seed.workspace.tenantId,
        workspace_id: seed.workspace.id,
        state: "not_started",
        version: 1,
        requested_at: null,
        submitted_at: null,
        verified_at: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  initializeTeamWorkspaceForTeam(workspace: TeamWorkspace): void {
    this.initializeSolverWorkspace(workspace);
  }

  initializeIndividualWorkspaceForActivation(
    workspace: Extract<Workspace, { readonly kind: "individual" }>,
  ): void {
    this.initializeSolverWorkspace(workspace);
  }

  private initializeSolverWorkspace(
    workspace: Extract<Workspace, { readonly kind: "individual" | "team" }>,
  ): void {
    if (this.profiles.has(workspace.id) || this.verifications.has(workspace.id)) {
      throw new Error("The demo team solver facts already exist");
    }
    const now = this.clock.now().toISOString();
    const facts = { headline: "", overview: "", expertise: [], geography: [] };
    this.profiles.set(workspace.id, {
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      workspace_kind: workspace.kind,
      applicant_type: workspace.kind === "individual" ? "individual" : workspace.teamKind,
      ...facts,
      readiness: evaluateSolverProfileReadiness(facts),
      version: 1,
      created_at: now,
      updated_at: now,
    });
    this.verifications.set(workspace.id, {
      id: parseVerificationId("ver_" + workspace.id.slice(4)),
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      state: "not_started",
      version: 1,
      requested_at: null,
      submitted_at: null,
      verified_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  setChallengeReachResolver(
    resolver: (workspaceId: WorkspaceId, challengeId: string) => boolean,
  ): void {
    this.challengeReach = resolver;
  }

  findOfferTarget(workspaceId: string): {
    readonly tenantId: SolverWorkspaceProfileResource["tenant_id"];
    readonly workspaceId: SolverWorkspaceProfileResource["workspace_id"];
    readonly workspaceKind: SolverWorkspaceProfileResource["workspace_kind"];
  } | null {
    const profile = [...this.profiles.values()].find(
      (candidate) => candidate.workspace_id === workspaceId,
    );
    return profile
      ? {
          tenantId: profile.tenant_id,
          workspaceId: profile.workspace_id,
          workspaceKind: profile.workspace_kind,
        }
      : null;
  }

  private scopedProfile(scope: WorkspaceScope): SolverWorkspaceProfileResource | null {
    const profile = this.profiles.get(scope.workspaceId);
    if (!profile || profile.tenant_id !== scope.tenantId) return null;
    return profile;
  }

  private receipt<Target extends string, Next extends string>(
    target: Target,
    version: number,
    nextActions: readonly Next[],
  ): MutationOutcome<Target, Next> {
    const receipt: MutationReceipt<Target, Next> = {
      entity_id: target,
      receipt_id: parseReceiptId(this.ids.next("rcp")),
      audit_event_id: parseAuditEventId(this.ids.next("aud")),
      timestamp: this.clock.now().toISOString(),
      idempotent: false,
      next_actions: nextActions,
    };
    return { receipt, entityVersion: version };
  }

  private replay<Target extends string, Next extends string>(
    context: WorkspaceCommandContext,
    fingerprint: string,
  ): MutationOutcome<Target, Next> | null {
    const cached = this.idempotency.get(scopedKey(context.tenantId, context.idempotencyKey));
    if (!cached) return null;
    if (cached.fingerprint !== fingerprint) throw idempotencyConflict();
    return {
      ...(structuredClone(cached.outcome) as MutationOutcome<Target, Next>),
      receipt: { ...cached.outcome.receipt, idempotent: true } as MutationReceipt<Target, Next>,
    };
  }

  private remember(
    context: WorkspaceCommandContext,
    fingerprint: string,
    outcome: MutationOutcome<string, string>,
  ): void {
    this.idempotency.set(scopedKey(context.tenantId, context.idempotencyKey), {
      fingerprint,
      outcome: structuredClone(outcome),
    });
  }

  async getProfile(scope: WorkspaceScope): Promise<SolverWorkspaceProfileResource | null> {
    return structuredClone(this.scopedProfile(scope));
  }

  async patchProfile(
    body: PatchSolverWorkspaceProfileBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<WorkspaceId, SolverProfileNextAction>> {
    validateSolverProfilePatch(body);
    const fingerprint = commandFingerprint({
      action: "solver.profile.updated",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    const replay = this.replay<WorkspaceId, SolverProfileNextAction>(context, fingerprint);
    if (replay) return replay;
    const current = this.scopedProfile(context);
    if (!current) throw notFound();
    if (!canEditProfile(context)) throw forbidden();
    if (body.expected_version !== current.version) throw staleVersion(current.version);
    const facts = { ...current, ...body.patch };
    const updated: SolverWorkspaceProfileResource = {
      ...facts,
      readiness: evaluateSolverProfileReadiness(facts),
      version: current.version + 1,
      updated_at: this.clock.now().toISOString(),
    };
    this.profiles.set(context.workspaceId, updated);
    const outcome = this.receipt(
      context.workspaceId,
      updated.version,
      updated.readiness.ready ? ["continue"] : ["review_profile"],
    );
    this.remember(context, fingerprint, outcome);
    return outcome;
  }

  async getVerification(scope: WorkspaceScope): Promise<SolverVerificationResource | null> {
    const profile = this.scopedProfile(scope);
    const verification = this.verifications.get(scope.workspaceId);
    if (!profile || !verification) return null;
    return structuredClone(verification);
  }

  async startVerification(
    body: StartSolverVerificationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<VerificationId, SolverVerificationNextAction>> {
    const fingerprint = commandFingerprint({
      action: "verification.draft.created",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      body,
    });
    const replay = this.replay<VerificationId, SolverVerificationNextAction>(context, fingerprint);
    if (replay) return replay;
    const current = await this.getVerification(context);
    if (!current) throw notFound();
    if (!canManageSolverAuthority(context.role)) throw forbidden();
    if (body.expected_version !== current.version) throw staleVersion(current.version);
    if (current.state !== "not_started") {
      throw new ApiProblem(409, "INVALID_STATE", "Verification has already started", {
        currentState: current.state,
      });
    }
    const now = this.clock.now().toISOString();
    const updated: SolverVerificationResource = {
      ...current,
      state: "draft",
      version: current.version + 1,
      requested_at: now,
      updated_at: now,
    };
    this.verifications.set(context.workspaceId, updated);
    const outcome = this.receipt(updated.id, updated.version, ["complete_verification_request"]);
    this.remember(context, fingerprint, outcome);
    return outcome;
  }

  async acceptEligibilityGate(
    challengeId: string,
    gate: EligibilityGateKind,
    body: AcceptEligibilityGateBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<EligibilityGateAcceptanceId, EligibilityGateNextAction>> {
    const fingerprint = commandFingerprint({
      action: "eligibility.gate.accepted",
      actorUserId: context.actorUserId,
      workspaceId: context.workspaceId,
      challengeId,
      gate,
      body,
    });
    const replay = this.replay<EligibilityGateAcceptanceId, EligibilityGateNextAction>(
      context,
      fingerprint,
    );
    if (replay) return replay;
    if (!this.scopedProfile(context)) throw notFound();
    if (!canManageSolverAuthority(context.role)) throw forbidden();
    if (body.expected_version !== 0) {
      throw new ApiProblem(422, "VALIDATION", "A new gate acceptance must expect version zero");
    }
    const projection = this.challenges
      .snapshot()
      .publicProjections.find(
        (item) =>
          item.challenge_id === challengeId &&
          item.challenge_version_id === body.challenge_version_id,
      );
    const offeredAggregate = this.challenges
      .snapshot()
      .challenges.find(
        (candidate) =>
          candidate.id === challengeId &&
          candidate.published_version_id === body.challenge_version_id &&
          this.challengeReach?.(context.workspaceId, challengeId),
      );
    const required =
      gate === "nda"
        ? (projection?.nda_required ?? offeredAggregate?.content.nda_required)
        : (projection?.document_gate_required ?? offeredAggregate?.content.document_gate_required);
    if ((!projection && !offeredAggregate) || !required) throw notFound();
    const key = scopedKey(context.workspaceId, body.challenge_version_id, gate);
    if (this.acceptances.has(key)) {
      throw new ApiProblem(409, "CONFLICT", "The eligibility gate is already accepted", {
        recovery: "recheck_eligibility",
      });
    }
    const id = parseEligibilityGateAcceptanceId(this.ids.next("ega"));
    this.acceptances.set(key, id);
    const outcome = this.receipt(id, 1, ["recheck_eligibility"]);
    this.remember(context, fingerprint, outcome);
    return outcome;
  }

  async evaluate(
    scope: WorkspaceScope,
    challengeId: string,
  ): Promise<EligibilityDecisionResource | null> {
    const profile = this.scopedProfile(scope);
    const verification = this.verifications.get(scope.workspaceId);
    if (!profile || !verification) return null;
    const snapshot = this.challenges.snapshot();
    const aggregate = snapshot.challenges.find((item) => item.id === challengeId);
    const projection = snapshot.publicProjections.find((item) => item.challenge_id === challengeId);
    const offered =
      aggregate?.published_version_id && this.challengeReach?.(scope.workspaceId, challengeId)
        ? aggregate
        : null;
    if (
      !aggregate ||
      (!projection && !offered) ||
      (projection && aggregate.published_version_id !== projection.challenge_version_id)
    ) {
      return null;
    }
    const challengeVersionId = projection?.challenge_version_id ?? aggregate.published_version_id;
    if (!challengeVersionId) return null;
    const accepted = (gate: EligibilityGateKind) =>
      this.acceptances.has(scopedKey(scope.workspaceId, challengeVersionId, gate));
    const now = this.clock.now();
    const decision = evaluateProposalEligibility(
      {
        challengeVersionId,
        invitationRequired:
          (projection?.sourcing_model ?? aggregate.content.sourcing_model) === "private" ||
          aggregate.content.visibility === "invite_only",
        allowedApplicantTypes:
          projection?.allowed_applicant_types ?? aggregate.content.allowed_applicant_types,
        verificationRequired:
          projection?.verification_required ?? aggregate.content.verification_required,
        ndaRequired: projection?.nda_required ?? aggregate.content.nda_required,
        documentGateRequired:
          projection?.document_gate_required ?? aggregate.content.document_gate_required,
      },
      {
        state: aggregate.publication_state ?? "closed",
        proposalDeadline:
          aggregate.proposal_deadline_at ??
          projection?.proposal_deadline ??
          "1970-01-01T00:00:00.000Z",
      },
      {
        workspaceId: scope.workspaceId,
        hasActiveInvitation: Boolean(offered),
        applicantType: profile.applicant_type,
        workspaceVerified: verification.state === "verified",
        ndaAccepted: accepted("nda"),
        documentGateAcknowledged: accepted("document_acknowledgement"),
      },
      now,
    );
    return {
      challenge_id: aggregate.id,
      evaluated_against_version_id: challengeVersionId,
      applicant_type: profile.applicant_type,
      status: decision.status,
      reasons: decision.reasons,
      next_actions: decision.nextActions,
      evaluated_at: now.toISOString(),
    };
  }
}
