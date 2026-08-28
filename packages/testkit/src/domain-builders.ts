import {
  applicantScopeForTypes,
  idPrefixes,
  type ChallengeDraft,
  type ChallengeDraftContent,
  type IndividualWorkspace,
  type Membership,
  type OrganizationWorkspace,
  type TeamWorkspace,
  type User,
} from "@rahhal/domain";

import { deterministicId, fixedTimestamp } from "./deterministic.js";

type ChallengeDraftOverrides = Partial<Omit<ChallengeDraft, "content">> & {
  readonly content?: Partial<ChallengeDraftContent>;
};

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: deterministicId(idPrefixes.user),
    displayName: "Test User",
    primaryEmail: "test.user@example.test",
    emailVerified: true,
    ...overrides,
  };
}

export function buildOrganizationWorkspace(
  overrides: Partial<OrganizationWorkspace> = {},
): OrganizationWorkspace {
  return {
    id: deterministicId(idPrefixes.workspace),
    tenantId: deterministicId(idPrefixes.tenant),
    kind: "org",
    name: "Test Organization Workspace",
    ...overrides,
  };
}

export function buildIndividualWorkspace(
  overrides: Partial<IndividualWorkspace> = {},
): IndividualWorkspace {
  return {
    id: deterministicId(idPrefixes.workspace),
    tenantId: deterministicId(idPrefixes.tenant),
    kind: "individual",
    ownerUserId: deterministicId(idPrefixes.user),
    name: "Test Individual Workspace",
    ...overrides,
  };
}

export function buildTeamWorkspace(overrides: Partial<TeamWorkspace> = {}): TeamWorkspace {
  return {
    id: deterministicId(idPrefixes.workspace),
    tenantId: deterministicId(idPrefixes.tenant),
    kind: "team",
    teamKind: "expert-team",
    ownerUserId: deterministicId(idPrefixes.user),
    name: "Test Team Workspace",
    ...overrides,
  };
}

export function buildMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: deterministicId(idPrefixes.membership),
    tenantId: deterministicId(idPrefixes.tenant),
    workspaceId: deterministicId(idPrefixes.workspace),
    userId: deterministicId(idPrefixes.user),
    role: "org:member",
    state: "active",
    createdAt: fixedTimestamp,
    updatedAt: fixedTimestamp,
    ...overrides,
  };
}

export function buildChallengeDraftContent(
  overrides: Partial<ChallengeDraftContent> = {},
): ChallengeDraftContent {
  const content: ChallengeDraftContent = {
    title: "Test Challenge",
    summary: "A deterministic challenge draft for tests.",
    category: "operations",
    location: "remote",
    desiredOutcome: "Prove the target outcome.",
    currentState: "The current process is manual.",
    consequence: "The current process is slow.",
    expectedOutput: "A validated solution design.",
    successCriteria: [
      {
        id: "criterion-1",
        title: "Target result",
        target: "At least 20 percent improvement",
        method: "Compare the agreed baseline and pilot result.",
      },
    ],
    inScope: "The pilot workflow.",
    constraints: "Use approved test data only.",
    organizationSupport: "A subject-matter expert and test environment.",
    previousAttempts: "No prior pilot.",
    outputType: "pilot",
    sourcingModel: "public",
    applicantScope: "both",
    allowedApplicantTypes: ["individual", "expert-team", "company"],
    workMode: "hybrid",
    proposalDeadline: "2030-02-01T00:00:00.000Z",
    preferredStartDate: "2030-03-01T00:00:00.000Z",
    budget: { status: "fixed", amountMinor: 100_000_000, currency: "IRR" },
    invitees: [],
    visibility: "registered",
    publicSummary: "A public-safe summary.",
    verificationRequired: false,
    ndaRequired: false,
    documentGateRequired: false,
    ipTerms: "solver_license",
    contact: {
      name: "Test Contact",
      email: "contact@example.test",
      phone: "+980000000000",
    },
    accuracyConfirmed: false,
    legalNotes: "",
    attachmentIds: [],
    ...overrides,
  };
  return {
    ...content,
    applicantScope: applicantScopeForTypes(content.allowedApplicantTypes),
  };
}

export function buildChallengeDraft(overrides: ChallengeDraftOverrides = {}): ChallengeDraft {
  const { content: contentOverrides, ...aggregateOverrides } = overrides;

  return {
    id: deterministicId(idPrefixes.challenge),
    currentVersionId: deterministicId(idPrefixes.challengeVersion),
    tenantId: deterministicId(idPrefixes.tenant),
    workspaceId: deterministicId(idPrefixes.workspace),
    stage: "draft",
    authoringStatus: "draft",
    version: 1,
    content: buildChallengeDraftContent(contentOverrides),
    createdBy: deterministicId(idPrefixes.user),
    createdAt: fixedTimestamp,
    updatedAt: fixedTimestamp,
    ...aggregateOverrides,
  };
}
