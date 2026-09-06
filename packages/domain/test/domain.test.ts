import { describe, expect, expectTypeOf, it } from "vitest";

import {
  evaluateProposalEligibility,
  evaluateProposalReadiness,
  evaluateSolverProfileReadiness,
  proposalTransitions,
  proposalOutboxEventTypes,
  proposalVersionLockingStates,
  parseChallengeVersionId,
  parseWorkspaceId,
  type EligibilityApplicant,
  type EligibilityCallSnapshot,
  type EligibilityRuleSnapshot,
  InvalidIdentifierError,
  applicantScopeForTypes,
  applicantScopeMatchesTypes,
  applicantScopes,
  applicantTypes,
  canTransition,
  challengeStages,
  challengeTransitions,
  evaluateChallengeReadiness,
  evaluatePublicationReadiness,
  gateApproverRoles,
  isAggregateVersion,
  isApplicantType,
  isChallengeId,
  isEntityId,
  isGateApproverRole,
  isOutboxEventId,
  isPlatformRole,
  isPublicationGate,
  isRoleCompatibleWithWorkspace,
  isTeamRole,
  isWorkspaceRole,
  parseChallengeId,
  publicationGates,
  teamKinds,
  type ChallengeId,
  type ChallengeDraftContent,
  type Currency,
  type ProposalContent,
  type TeamKind,
  DEFAULT_TEAM_POLICY,
  canRemoveTeamMembership,
  decideTeamPermission,
  parseMembershipId,
  parseTenantId,
  parseUserId,
  teamActions,
  teamOutboxEventTypes,
  teamRole,
  type Membership,
  type TeamRole,
  directOfferStates,
  directOfferTransitions,
  evaluateOfferResponseReadiness,
  offerResponseStates,
} from "../src/index.js";

function readyChallengeContent(): ChallengeDraftContent {
  return {
    title: "کاهش اتلاف انرژی",
    summary: "شرح روشن و قابل سنجش از مسئله عملیاتی",
    category: "انرژی",
    location: "کارخانه یک",
    desiredOutcome: "کاهش سنجش‌پذیر مصرف انرژی خط تولید",
    currentState: "مصرف فعلی خط تولید بالاتر از خط مبنای مصوب است.",
    consequence: "هزینه تولید افزایش یافته است.",
    expectedOutput: "راهکار پایلوت‌شده و قابل اندازه‌گیری",
    successCriteria: [
      { id: "criterion-1", title: "کاهش مصرف", target: "۲۰ درصد", method: "مقایسه با خط مبنا" },
    ],
    inScope: "خط تولید شماره یک کارخانه",
    constraints: "داده واقعی خارج نمی‌شود.",
    organizationSupport: "تیم انرژی در دسترس است.",
    previousAttempts: "پایلوتی اجرا نشده است.",
    outputType: "pilot",
    sourcingModel: "public",
    applicantScope: "both",
    allowedApplicantTypes: ["individual", "company"],
    workMode: "hybrid",
    proposalDeadline: "2026-09-30T20:29:59.000Z",
    preferredStartDate: null,
    budget: { status: "fixed", amountMinor: 100_000_000, currency: "IRR" },
    invitees: [],
    visibility: "registered",
    publicSummary: "خلاصه عمومی ایمن برای معرفی مسئله اتلاف انرژی خط تولید.",
    verificationRequired: false,
    ndaRequired: false,
    documentGateRequired: false,
    ipTerms: "solver_license",
    contact: { name: "سارا نادری", email: "sara@example.test", phone: "+989121234567" },
    accuracyConfirmed: true,
    legalNotes: "",
    attachmentIds: [],
  };
}

describe("canonical domain primitives", () => {
  it("keeps the canonical applicant and lifecycle vocabularies", () => {
    expect(applicantScopes).toEqual(["person", "team", "both"]);
    expect(applicantTypes).toEqual([
      "individual",
      "expert-team",
      "company",
      "lab",
      "academic-group",
    ]);
    expect(teamKinds).toEqual(["expert-team", "company", "lab", "academic-group"]);
    expect(challengeStages).toHaveLength(11);
    expect(isApplicantType("formal-company")).toBe(false);
    expectTypeOf<TeamKind>().toEqualTypeOf<"expert-team" | "company" | "lab" | "academic-group">();
  });

  it("derives the coarse applicant scope from the authoritative allowed set", () => {
    expect(applicantScopeForTypes([])).toBeNull();
    expect(applicantScopeForTypes(["individual"])).toBe("person");
    expect(applicantScopeForTypes(["company", "lab"])).toBe("team");
    expect(applicantScopeForTypes(["individual", "academic-group"])).toBe("both");
    expect(applicantScopeMatchesTypes("team", ["expert-team", "company"])).toBe(true);
    expect(applicantScopeMatchesTypes("both", ["expert-team", "company"])).toBe(false);
  });

  it("owns the exact 11-stage challenge lifecycle and its guarded edges", () => {
    expect(challengeTransitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "draft->triage",
      "triage->formulation",
      "formulation->approvals",
      "approvals->published",
      "published->evaluating",
      "evaluating->decided",
      "decided->contracting",
      "contracting->pilot",
      "pilot->impact",
      "impact->closed",
    ]);
    expect(
      canTransition(challengeTransitions, "triage", "formulation", "platform:ops", [
        "triage-passed",
      ]),
    ).toBe(true);
    expect(canTransition(challengeTransitions, "triage", "formulation", "platform:ops")).toBe(
      false,
    );
    expect(canTransition(challengeTransitions, "pilot", "closed", "org:member")).toBe(false);
    expect(
      canTransition(challengeTransitions, "draft", "triage", "org:owner", ["brief-valid"]),
    ).toBe(true);
  });

  it("evaluates one deterministic readiness contract for every challenge boundary", () => {
    expect(evaluateChallengeReadiness(readyChallengeContent())).toEqual({
      ready: true,
      issues: [],
    });

    const incomplete = evaluateChallengeReadiness({
      ...readyChallengeContent(),
      title: "",
      accuracyConfirmed: false,
    });
    expect(incomplete).toMatchObject({
      ready: false,
      issues: [
        { path: "/content/title", code: "min_length", step: 1 },
        { path: "/content/accuracy_confirmed", code: "required", step: 4 },
      ],
    });
  });

  it("validates opaque prefixes without treating an ID shape as authority", () => {
    expect(isChallengeId("chl_00000001")).toBe(true);
    expect(isChallengeId("wsp_00000001")).toBe(false);
    expect(parseChallengeId("chl_00000001")).toBe("chl_00000001");
    expect(() => parseChallengeId("challenge-1")).toThrow(InvalidIdentifierError);
    expectTypeOf(parseChallengeId("chl_00000001")).toEqualTypeOf<ChallengeId>();
  });

  it("distinguishes aggregate entity IDs from correlation and evidence IDs", () => {
    expect(isEntityId("ses_00000001")).toBe(true);
    expect(isEntityId("evt_00000001")).toBe(true);
    expect(isOutboxEventId("evt_00000001")).toBe(true);
    expect(isOutboxEventId("chl_00000001")).toBe(false);
    expect(isEntityId("aud_00000001")).toBe(false);
    expect(isEntityId("cor_00000001")).toBe(false);
    expect(isEntityId("rcp_00000001")).toBe(false);
  });

  it("keeps workspace role namespaces explicit", () => {
    expect(isRoleCompatibleWithWorkspace("platform:ops", "platform")).toBe(true);
    expect(isRoleCompatibleWithWorkspace("org:member", "platform")).toBe(false);
    expect(isRoleCompatibleWithWorkspace("org:member", "org")).toBe(true);
    expect(isRoleCompatibleWithWorkspace("team:admin", "org")).toBe(false);
    expect(isRoleCompatibleWithWorkspace("individual", "individual")).toBe(true);
    expect(isTeamRole("team:owner")).toBe(true);
    expect(isTeamRole("owner")).toBe(false);
    expect(challengeTransitions.every((rule) => rule.roles.every(isWorkspaceRole))).toBe(true);
  });

  it("accepts only non-negative safe aggregate versions", () => {
    expect(isAggregateVersion(0)).toBe(true);
    expect(isAggregateVersion(4)).toBe(true);
    expect(isAggregateVersion(-1)).toBe(false);
    expect(isAggregateVersion(1.2)).toBe(false);
  });

  it("owns the exact four B2 publication gates and their eligible approver roles", () => {
    expect(publicationGates).toEqual(["technical", "legal", "finance", "quality"]);
    expect(isPublicationGate("technical")).toBe(true);
    expect(isPublicationGate("business")).toBe(false);

    expect(gateApproverRoles).toEqual({
      technical: ["org:approver_technical"],
      legal: ["org:approver_legal", "platform:legal"],
      finance: ["org:approver_finance", "platform:finance"],
      quality: ["platform:ops"],
    });
    for (const gate of publicationGates) {
      expect(gateApproverRoles[gate].every(isWorkspaceRole)).toBe(true);
    }

    expect(isGateApproverRole("technical", "org:approver_technical")).toBe(true);
    expect(isGateApproverRole("technical", "platform:legal")).toBe(false);
    expect(isGateApproverRole("legal", "org:approver_legal")).toBe(true);
    expect(isGateApproverRole("legal", "platform:legal")).toBe(true);
    expect(isGateApproverRole("finance", "org:approver_finance")).toBe(true);
    expect(isGateApproverRole("finance", "platform:finance")).toBe(true);
    expect(isGateApproverRole("quality", "platform:ops")).toBe(true);
    expect(isGateApproverRole("quality", "org:owner")).toBe(false);
  });

  it("requires all four gates approved before publication readiness is reached", () => {
    expect(evaluatePublicationReadiness([])).toEqual({
      ready: false,
      satisfied: [],
      missing: ["technical", "legal", "finance", "quality"],
    });

    const threeApproved = evaluatePublicationReadiness([
      { gate: "technical", decision: "approved" },
      { gate: "legal", decision: "approved" },
      { gate: "finance", decision: "approved" },
    ]);
    expect(threeApproved).toEqual({
      ready: false,
      satisfied: ["technical", "legal", "finance"],
      missing: ["quality"],
    });

    // A rejected decision still occupies its gate's one slot -- it does not
    // count as satisfied, and does not fall back to "missing" either.
    const oneRejected = evaluatePublicationReadiness([
      { gate: "technical", decision: "approved" },
      { gate: "legal", decision: "rejected" },
      { gate: "finance", decision: "approved" },
      { gate: "quality", decision: "approved" },
    ]);
    expect(oneRejected).toEqual({
      ready: false,
      satisfied: ["technical", "finance", "quality"],
      missing: ["legal"],
    });

    expect(
      evaluatePublicationReadiness([
        { gate: "technical", decision: "approved" },
        { gate: "legal", decision: "approved" },
        { gate: "finance", decision: "approved" },
        { gate: "quality", decision: "approved" },
      ]),
    ).toEqual({
      ready: true,
      satisfied: ["technical", "legal", "finance", "quality"],
      missing: [],
    });
  });

  it("recognizes only the platform:* role namespace as platform authority", () => {
    expect(isPlatformRole("platform:ops")).toBe(true);
    expect(isPlatformRole("platform:legal")).toBe(true);
    expect(isPlatformRole("org:approver_legal")).toBe(false);
    expect(isPlatformRole("individual")).toBe(false);
  });
});

describe("C1 proposal eligibility", () => {
  const openRule: EligibilityRuleSnapshot = {
    challengeVersionId: parseChallengeVersionId("chv_published_0001"),
    allowedApplicantTypes: ["individual", "expert-team"],
    verificationRequired: false,
    ndaRequired: false,
    documentGateRequired: false,
  };
  const openCall: EligibilityCallSnapshot = {
    state: "open",
    proposalDeadline: "2030-01-01T00:00:00.000Z",
  };
  const applicant: EligibilityApplicant = {
    workspaceId: parseWorkspaceId("wsp_team_alpha"),
    applicantType: "expert-team",
    workspaceVerified: false,
    ndaAccepted: false,
    documentGateAcknowledged: false,
  };
  const now = new Date("2026-08-30T12:00:00.000Z");

  it("names the exact immutable rule version it judged", () => {
    const decision = evaluateProposalEligibility(openRule, openCall, applicant, now);
    expect(decision.evaluatedAgainstVersionId).toBe("chv_published_0001");
    expect(decision.status).toBe("eligible");
  });

  it("derives profile readiness from server facts without making it an eligibility rule", () => {
    expect(
      evaluateSolverProfileReadiness({
        headline: "متخصص تحلیل داده",
        overview: "تجربه اجرای پروژه‌های صنعتی و تحلیل داده در مقیاس عملیاتی.",
        expertise: ["تحلیل داده"],
        geography: ["ایران"],
      }),
    ).toEqual({ ready: true, issues: [] });
    expect(
      evaluateSolverProfileReadiness({
        headline: "",
        overview: "",
        expertise: [],
        geography: [],
      }).issues.map((issue) => issue.path),
    ).toEqual(["/headline", "/overview", "/expertise", "/geography"]);
  });

  it("separates a structural refusal from a gate the solver can still clear", () => {
    const wrongType = evaluateProposalEligibility(
      openRule,
      openCall,
      { ...applicant, applicantType: "lab" },
      now,
    );
    expect(wrongType.status).toBe("ineligible");
    expect(wrongType.reasons.map((reason) => reason.code)).toEqual(["applicant_type_not_allowed"]);
    expect(wrongType.nextActions).toEqual([]);

    const needsGates = evaluateProposalEligibility(
      { ...openRule, verificationRequired: true, ndaRequired: true },
      openCall,
      applicant,
      now,
    );
    expect(needsGates.status).toBe("needs_action");
    expect(needsGates.reasons.map((reason) => reason.code)).toEqual([
      "verification_required",
      "nda_required",
    ]);
    expect(needsGates.nextActions).toEqual(["verify_workspace", "accept_nda"]);
  });

  it("uses B6's current deadline and supports every terminal call state", () => {
    const expired = evaluateProposalEligibility(
      openRule,
      { ...openCall, proposalDeadline: "2026-08-30T11:59:59.000Z" },
      applicant,
      now,
    );
    expect(expired.reasons[0]?.code).toBe("deadline_passed");

    for (const state of ["paused", "closed", "cancelled"] as const) {
      const unavailable = evaluateProposalEligibility(
        openRule,
        { ...openCall, state },
        applicant,
        now,
      );
      expect(unavailable.reasons[0]?.code).toBe("call_not_open");
    }
  });

  it("fails closed for an unknown applicant type", () => {
    const unknown = evaluateProposalEligibility(
      openRule,
      openCall,
      { ...applicant, applicantType: null },
      now,
    );
    expect(unknown.reasons[0]?.code).toBe("applicant_type_unknown");
  });
});

/** A proposal whose every readiness rule already passes. */
const readyContent: ProposalContent = {
  title: "راهکار کاهش مصرف انرژی",
  problemStatement: "شرح کامل مسئله و وضعیت عملیاتی موجود در کارخانه.",
  valueProposition: "راهکار پیشنهادی مصرف را با سنجش مستمر کاهش می‌دهد.",
  maturityLevel: "prototype",
  prototypeWeeks: "8",
  technologies: ["sensor"],
  technicalApproach: "رویکرد فنی کامل برای نمونه‌سازی و ارزیابی راهکار.",
  architecture: "edge",
  dataNeeds: "telemetry",
  successMetrics: "کاهش حداقل بیست درصدی مصرف انرژی.",
  ipStatus: "owned",
  durationWeeks: "16",
  roadmap: "pilot",
  dependencies: "access",
  pilotLocation: "site",
  risks: "integration",
  mitigation: "staged rollout",
  leadName: "Solver",
  teamSummary: "team",
  relevantExperience: "experience",
  budgetAmountMinor: 100_000,
  budgetCurrency: "IRR",
  paymentModel: "milestone",
  budgetRationale: "estimate",
  startAvailability: "two-weeks",
  teamAvailability: "part-time",
  ndaAccepted: true,
  conflictDeclared: true,
  ipAccepted: true,
  accuracyConfirmed: true,
  attachmentIds: [],
};

describe("Phase 3 proposal lifecycle", () => {
  it("limits the C5 worker allowlist to canonical metadata-only proposal facts", () => {
    expect(proposalOutboxEventTypes).toEqual([
      "proposal.draft.created",
      "proposal.draft.updated",
      "proposal.submitted",
      "proposal.eligibility.started",
      "proposal.eligible",
      "proposal.ineligible",
      "proposal.clarification.requested",
      "proposal.clarification.submitted",
      "proposal.review.started",
      "proposal.revision.requested",
      "proposal.revision.draft.created",
      "proposal.resubmitted",
    ]);
  });

  it("locks only proposal-content submissions", () => {
    expect(proposalVersionLockingStates).toEqual(["submitted", "resubmitted"]);
    for (const state of proposalVersionLockingStates) {
      const rule = proposalTransitions.find((transition) => transition.to === state);
      expect(rule?.sideEffects).toContain("lock-proposal-version");
    }
  });

  it("owns one complete canonical transition table", () => {
    expect(proposalTransitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "draft->submitted",
      "submitted->eligibility_review",
      "eligibility_review->eligible",
      "eligibility_review->ineligible",
      "eligible->clarification_requested",
      "clarification_requested->clarification_submitted",
      "clarification_submitted->reviewing",
      "reviewing->revision_requested",
      "revision_requested->revision_draft",
      "revision_draft->resubmitted",
      "resubmitted->reviewing",
      "reviewing->selected",
      "reviewing->rejected",
    ]);
  });

  it("treats listed submit roles as candidates subject to server authorization", () => {
    const submit = proposalTransitions.find((transition) => transition.to === "submitted");
    expect(submit?.roles).toEqual([
      "team:owner",
      "team:admin",
      "team:proposal-manager",
      "individual",
    ]);
    expect(submit?.preconditions).toContain("sender-authorized");
  });

  it("requires a base version before a revision may be resubmitted", () => {
    const resubmit = proposalTransitions.find((transition) => transition.to === "resubmitted");
    expect(resubmit?.preconditions).toContain("base-version-cited");
  });

  it("rejects malformed money and unconfirmed declarations", () => {
    const content = readyContent;

    expect(evaluateProposalReadiness(content).ready).toBe(true);
    expect(
      evaluateProposalReadiness({
        ...content,
        budgetAmountMinor: -1,
        budgetCurrency: "XYZ" as Currency,
        accuracyConfirmed: false,
      }).issues.map((issue) => issue.path),
    ).toEqual([
      "/content/budget_amount_minor",
      "/content/budget_currency",
      "/content/accuracy_confirmed",
    ]);
  });

  it("reads a week count written in Persian or Arabic-Indic digits", () => {
    // `\d` matches ASCII only, so a solver typing ۸ on the Persian keyboard the
    // product is built around was told the field was malformed, with no way to
    // discover that only Latin digits were accepted. Readiness is the rule
    // draft reads, preview and submit all share, so the whole submission was
    // unreachable from a Persian keyboard.
    const persian = evaluateProposalReadiness({
      ...readyContent,
      prototypeWeeks: "۸",
      durationWeeks: "۱۶",
    });
    expect(persian.issues).toEqual([]);
    expect(persian.ready).toBe(true);

    const arabic = evaluateProposalReadiness({
      ...readyContent,
      prototypeWeeks: "٨",
      durationWeeks: "١٦",
    });
    expect(arabic.ready).toBe(true);

    // Normalization is not permission: a non-numeric or zero week count is
    // still refused, in either script.
    expect(
      evaluateProposalReadiness({
        ...readyContent,
        prototypeWeeks: "۰",
        durationWeeks: "هشت",
      }).issues.map((issue) => issue.path),
    ).toEqual(["/content/prototype_weeks", "/content/duration_weeks"]);
  });
});

describe("C6 opportunity and direct-offer domain", () => {
  it("keeps the complete canonical offer vocabulary and bounded C6 transitions", () => {
    expect(directOfferStates).toEqual([
      "received",
      "viewed",
      "response_draft",
      "response_submitted",
      "negotiating",
      "selected",
      "declined",
      "expired",
      "cancelled",
    ]);
    expect(offerResponseStates).toEqual(["draft", "submitted"]);
    expect(
      directOfferTransitions.some(({ from, to }) => from === "response_draft" && to === "expired"),
    ).toBe(true);
    expect(
      directOfferTransitions.some(({ from, to }) => from === "negotiating" && to === "selected"),
    ).toBe(true);
  });

  it("requires a substantive, priced, authorized response before submission", () => {
    const incomplete = evaluateOfferResponseReadiness({
      approach: "",
      scope: "",
      startAvailability: "",
      durationWeeks: null,
      budgetAmountMinor: null,
      budgetCurrency: "IRR",
      paymentModel: "",
      negotiables: "",
      authorityConfirmed: false,
      attachmentIds: [],
    });
    expect(incomplete.ready).toBe(false);
    expect(incomplete.issues.map(({ path }) => path)).toEqual([
      "/response/approach",
      "/response/scope",
      "/response/start_availability",
      "/response/payment_model",
      "/response/duration_weeks",
      "/response/budget_amount_minor",
      "/response/authority_confirmed",
    ]);
    expect(
      evaluateOfferResponseReadiness({
        approach: "A".repeat(60),
        scope: "S".repeat(60),
        startAvailability: "دو هفته آینده",
        durationWeeks: 12,
        budgetAmountMinor: 125_000_000,
        budgetCurrency: "IRR",
        paymentModel: "پرداخت مرحله‌ای",
        negotiables: "زمان‌بندی قابل مذاکره است.",
        authorityConfirmed: true,
        attachmentIds: [],
      }).ready,
    ).toBe(true);
  });
});

describe("C2 authoritative team permissions", () => {
  const allowedByDefault: Record<TeamRole, readonly (typeof teamActions)[number][]> = {
    "team:owner": teamActions,
    "team:admin": [
      "view-workspace",
      "edit-team-profile",
      "invite-member",
      "review-membership-request",
      "change-member-role",
      "create-proposal",
      "edit-proposal",
      "submit-proposal",
      "view-direct-offer",
      "edit-offer-response",
      "submit-offer-response",
      "decline-direct-offer",
      "view-case-messages",
      "view-payments",
      "manage-team-settings",
      "leave-team",
      "approve-contract",
    ],
    "team:proposal-manager": [
      "view-workspace",
      "edit-team-profile",
      "create-proposal",
      "edit-proposal",
      "submit-proposal",
      "view-direct-offer",
      "edit-offer-response",
      "submit-offer-response",
      "decline-direct-offer",
      "view-case-messages",
      "view-payments",
      "leave-team",
    ],
    "team:contributor": [
      "view-workspace",
      "create-proposal",
      "view-direct-offer",
      "edit-offer-response",
      "leave-team",
    ],
    "team:viewer": ["view-workspace", "view-direct-offer", "view-case-messages", "leave-team"],
  };

  it("exhaustively evaluates every owner/admin/manager/contributor/viewer action", () => {
    for (const role of Object.keys(allowedByDefault) as TeamRole[]) {
      for (const action of teamActions) {
        expect(
          decideTeamPermission(action, { role, policy: DEFAULT_TEAM_POLICY }).allowed,
          `${role} -> ${action}`,
        ).toBe(allowedByDefault[role].includes(action));
      }
    }
  });

  it("applies every policy and assignment switch without widening the base matrix", () => {
    const allDisabled = Object.fromEntries(
      Object.keys(DEFAULT_TEAM_POLICY).map((key) => [key, false]),
    ) as unknown as typeof DEFAULT_TEAM_POLICY;
    expect(
      decideTeamPermission("edit-team-profile", {
        role: teamRole.proposalManager,
        policy: allDisabled,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("invite-member", {
        role: teamRole.proposalManager,
        policy: { ...allDisabled, proposalManagersCanInvite: true },
      }).allowed,
    ).toBe(true);
    expect(
      decideTeamPermission("submit-proposal", {
        role: teamRole.admin,
        policy: allDisabled,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("submit-proposal", {
        role: teamRole.proposalManager,
        policy: allDisabled,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("view-case-messages", {
        role: teamRole.viewer,
        policy: allDisabled,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("view-payments", { role: teamRole.admin, policy: allDisabled }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("view-payments", {
        role: teamRole.proposalManager,
        policy: allDisabled,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("edit-proposal", {
        role: teamRole.contributor,
        policy: allDisabled,
        assigned: false,
      }).allowed,
    ).toBe(false);
    expect(
      decideTeamPermission("edit-proposal", {
        role: teamRole.contributor,
        policy: allDisabled,
        assigned: true,
      }).allowed,
    ).toBe(true);
    expect(
      decideTeamPermission("view-case-messages", {
        role: teamRole.contributor,
        policy: allDisabled,
        assigned: true,
      }).allowed,
    ).toBe(true);
    expect(
      decideTeamPermission("archive-team", {
        role: teamRole.admin,
        policy: { ...DEFAULT_TEAM_POLICY, proposalManagersCanInvite: true },
      }).allowed,
    ).toBe(false);
  });

  it("requires ownership transfer and preserves at least one active manager", () => {
    const workspaceId = parseWorkspaceId("wsp_c2_team");
    const tenantId = parseTenantId("ten_c2_team");
    const membership = (
      id: string,
      userId: string,
      role: TeamRole,
    ): Membership & { readonly role: TeamRole } => ({
      id: parseMembershipId(id),
      tenantId,
      workspaceId,
      userId: parseUserId(userId),
      role,
      state: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const owner = membership("mem_c2_owner", "usr_c2_owner", teamRole.owner);
    const admin = membership("mem_c2_admin", "usr_c2_admin", teamRole.admin);
    expect(canRemoveTeamMembership([owner, admin], owner).allowed).toBe(false);
    expect(canRemoveTeamMembership([owner], owner).allowed).toBe(false);
    expect(canRemoveTeamMembership([admin], admin).allowed).toBe(false);
    expect(canRemoveTeamMembership([owner, admin], admin).allowed).toBe(true);
  });

  it("allowlists every C2 event for durable worker routing", () => {
    expect(teamOutboxEventTypes).toContain("team.created");
    expect(teamOutboxEventTypes).toContain("team.ownership.transferred");
    expect(teamOutboxEventTypes).toContain("team.archived");
    expect(new Set(teamOutboxEventTypes).size).toBe(teamOutboxEventTypes.length);
  });
});
