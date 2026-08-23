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
  isAggregateVersion,
  isApplicantType,
  isChallengeId,
  isEntityId,
  isOutboxEventId,
  isRoleCompatibleWithWorkspace,
  isTeamRole,
  isWorkspaceRole,
  parseChallengeId,
  teamKinds,
  type ChallengeId,
  type TeamKind,
} from "../src/index.js";

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
});
