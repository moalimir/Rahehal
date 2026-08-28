import { describe, expect, expectTypeOf, it } from "vitest";

import {
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
  type TeamKind,
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
