// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_SOLVER_USER_ID,
  DEFAULT_TEAM_POLICY,
  PERSONAL_WORKSPACE_ID,
  PRIMARY_TEAM_ID,
  SECONDARY_TEAM_ID,
  createCanonicalSolverState,
} from "@/data/solver-fixtures";
import {
  canTransition,
  contractTransitions,
  directOfferTransitions,
  membershipRequestTransitions,
  membershipTransitions,
  proposalTransitions,
  teamInvitationTransitions,
  verificationTransitions,
} from "@/domain/state-machines";
import type { ActiveWorkspace, TeamRole } from "@/domain/solver";
import {
  buildSolverHref,
  buildStandaloneSolverHref,
  parseSolverContext,
} from "@/lib/solver/context";
import { challengeEligibilityRules, evaluateEligibility } from "@/lib/solver/eligibility";
import { decideTeamPermission } from "@/lib/solver/permissions";
import {
  SOLVER_STORAGE_RECOVERY_KEY,
  SOLVER_STORE_KEY,
  activeWorkspaces,
  assignTeamMember,
  canAccessRestrictedDocument,
  closeCase,
  createContractVersion,
  createTeam,
  approveContract,
  declineDirectOffer,
  directOffersForWorkspace,
  leaveTeam,
  proposalDraftTemplate,
  proposalsForWorkspace,
  readProposalDraft,
  readSolverState,
  resetSolverDemoData,
  respondToTeamInvitation,
  saveProposalDraft,
  savedOpportunityIds,
  signContract,
  suspendTeamMembership,
  restoreTeamMembership,
  setSavedOpportunity,
  startOfferResponse,
  submitOfferResponse,
  submitProposal,
  submitVerification,
  viewDirectOffer,
  acceptNda,
} from "@/lib/solver/repository";

const personal: ActiveWorkspace = {
  type: "individual",
  workspaceId: PERSONAL_WORKSPACE_ID,
};

const PREVIOUS_SOLVER_STORE_KEY = `rahhal.solver.v4.user.${CURRENT_SOLVER_USER_ID}`;
const PREVIOUS_SOLVER_STORE_FRESH_KEY = `rahhal.solver.v4.mirror-fresh.user.${CURRENT_SOLVER_USER_ID}`;
const LEGACY_SOLVER_STORE_KEY = `rahhal.solver.v3.user.${CURRENT_SOLVER_USER_ID}`;

type RawSolverState = Record<string, unknown> & {
  version: number;
  teams: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  membershipRequests: Array<Record<string, unknown>>;
  teamSettings: Array<Record<string, unknown>>;
  savedByWorkspace: Record<string, string[]>;
};

function rawCanonicalSolverState(): RawSolverState {
  return JSON.parse(JSON.stringify(createCanonicalSolverState())) as RawSolverState;
}

function previousV4SolverState(): RawSolverState {
  const state = rawCanonicalSolverState();
  state.version = 4;
  const legacyRole = (value: unknown) =>
    typeof value === "string" && value.startsWith("team:") ? value.slice(5) : value;
  state.memberships = state.memberships.map((membership) => ({
    ...membership,
    role: legacyRole(membership.role),
  }));
  state.invitations = state.invitations.map((invitation) => ({
    ...invitation,
    proposedRole: legacyRole(invitation.proposedRole),
  }));
  state.membershipRequests = state.membershipRequests.map((request) => ({
    ...request,
    requestedRole: legacyRole(request.requestedRole),
  }));
  state.teamSettings = state.teamSettings.map((settings) => ({
    ...settings,
    defaultInviteRole: legacyRole(settings.defaultInviteRole),
  }));
  return state;
}

function legacyV3SolverState(): RawSolverState {
  const state = previousV4SolverState();
  state.version = 3;
  state.teams = state.teams.map((team) => {
    const { teamKind, teamType, ...legacyTeam } = team;
    return { ...legacyTeam, teamType: teamKind ?? teamType };
  });
  return state;
}

function rawState(value: unknown): RawSolverState {
  return value as RawSolverState;
}

function contextForTeam(teamId: string) {
  const resolution = parseSolverContext(`space=team&teamId=${teamId}`);
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution.context;
}

describe("Solver store v3/v4 → v5 canonical migration", () => {
  beforeEach(() => localStorage.clear());

  it("داده v4 را حفظ، نقش‌های تیم را canonical و مهاجرت را idempotent می‌کند", () => {
    const legacy = previousV4SolverState();
    legacy.savedByWorkspace[PERSONAL_WORKSPACE_ID] = ["CH-USER-PRESERVED"];
    legacy.teams[0] = { ...legacy.teams[0], name: "تیم حفظ‌شده کاربر" };
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(legacy));

    const first = rawState(readSolverState());
    expect(SOLVER_STORE_KEY).toBe(`rahhal.solver.v5.user.${CURRENT_SOLVER_USER_ID}`);
    expect(first.version).toBe(5);
    expect(first.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toEqual(["CH-USER-PRESERVED"]);
    expect(first.teams.find((team) => team.name === "تیم حفظ‌شده کاربر")).toMatchObject({
      teamKind: "expert-team",
    });
    expect(first.teams.every((team) => !("teamType" in team))).toBe(true);
    expect(
      first.memberships.every((membership) => String(membership.role).startsWith("team:")),
    ).toBe(true);
    const initialRollbackMirror = rawState(
      JSON.parse(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY) ?? "null"),
    );
    expect(initialRollbackMirror.version).toBe(4);
    expect(initialRollbackMirror.teams[0]).toMatchObject({ teamKind: "expert-team" });
    expect(initialRollbackMirror.memberships[0]).toMatchObject({ role: "owner" });
    expect(
      initialRollbackMirror.memberships.every(
        (membership) => !String(membership.role).startsWith("team:"),
      ),
    ).toBe(true);
    expect(
      initialRollbackMirror.invitations.every(
        (invitation) => !String(invitation.proposedRole).startsWith("team:"),
      ),
    ).toBe(true);
    expect(
      initialRollbackMirror.membershipRequests.every(
        (request) => !String(request.requestedRole).startsWith("team:"),
      ),
    ).toBe(true);
    expect(
      initialRollbackMirror.teamSettings.every(
        (settings) => !String(settings.defaultInviteRole).startsWith("team:"),
      ),
    ).toBe(true);

    const persistedAfterFirstRead = localStorage.getItem(SOLVER_STORE_KEY);
    const second = rawState(readSolverState());
    expect(second.teams).toHaveLength(first.teams.length);
    expect(second.savedByWorkspace).toEqual(first.savedByWorkspace);
    expect(localStorage.getItem(SOLVER_STORE_KEY)).toBe(persistedAfterFirstRead);

    setSavedOpportunity(PERSONAL_WORKSPACE_ID, "CH-AFTER-MIGRATION", true);
    const createdTeam = createTeam({
      name: "شرکت تازه پس از مهاجرت",
      teamKind: "company",
      introduction: "تیم تازه برای بررسی mirror سازگار نسخه قبل.",
      expertise: ["تحلیل داده"],
      publicContact: "rollback-team@example.test",
    });
    expect(createdTeam.ok).toBe(true);
    const rollbackMirror = rawState(
      JSON.parse(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY) ?? "null"),
    );
    expect(rollbackMirror.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toContain("CH-AFTER-MIGRATION");
    expect(rollbackMirror.teams.every((team) => !("teamType" in team))).toBe(true);
    expect(
      rollbackMirror.teams.find((team) => team.name === "شرکت تازه پس از مهاجرت"),
    ).toMatchObject({ teamKind: "company" });
  });

  it("store معتبر v5 را بر snapshot قدیمی v4 مقدم می‌داند", () => {
    const legacy = previousV4SolverState();
    legacy.savedByWorkspace[PERSONAL_WORKSPACE_ID] = ["CH-STALE-V4"];
    const current = rawCanonicalSolverState();
    current.savedByWorkspace[PERSONAL_WORKSPACE_ID] = ["CH-CURRENT-V5"];
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(legacy));
    localStorage.setItem(SOLVER_STORE_KEY, JSON.stringify(current));

    const result = rawState(readSolverState());
    expect(result.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toEqual(["CH-CURRENT-V5"]);
    expect(result.savedByWorkspace[PERSONAL_WORKSPACE_ID]).not.toContain("CH-STALE-V4");
    const refreshedMirror = rawState(
      JSON.parse(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY) ?? "null"),
    );
    expect(refreshedMirror.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toEqual(["CH-CURRENT-V5"]);
  });

  it("در خرابی store جاری، snapshot تازه v4 را بازیابی و به v5 می‌برد", () => {
    const legacy = previousV4SolverState();
    legacy.savedByWorkspace[PERSONAL_WORKSPACE_ID] = ["CH-RECOVERED-FROM-V4"];
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(legacy));
    expect(readSolverState().savedByWorkspace[PERSONAL_WORKSPACE_ID]).toContain(
      "CH-RECOVERED-FROM-V4",
    );
    localStorage.setItem(SOLVER_STORE_KEY, "{broken");

    const recovered = rawState(readSolverState());
    expect(recovered.version).toBe(5);
    expect(recovered.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toContain("CH-RECOVERED-FROM-V4");
    expect(localStorage.getItem(SOLVER_STORAGE_RECOVERY_KEY)).toContain(
      "invalid-or-corrupt-envelope",
    );
    expect(JSON.parse(localStorage.getItem(SOLVER_STORE_KEY) ?? "null")).toMatchObject({
      version: 5,
    });
  });

  it.each([
    ["mirror", PREVIOUS_SOLVER_STORE_KEY],
    ["freshness marker", PREVIOUS_SOLVER_STORE_FRESH_KEY],
  ])("خرابی %s کمکی، mutation موفق v5 را به شکست مبهم تبدیل نمی‌کند", (_label, failedKey) => {
    resetSolverDemoData();
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === failedKey) throw new DOMException("rollback mirror quota", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });

    let result: ReturnType<typeof createTeam>;
    try {
      result = createTeam({
        name: `تیم با ${_label} ناموجود`,
        teamKind: "expert-team",
        introduction: "mutation باید فقط بر مبنای store اصلی موفق یا ناموفق شود.",
        expertise: ["کنترل"],
        publicContact: "mirror-failure@example.test",
      });
      expect(result.ok).toBe(true);
      const persisted = rawState(JSON.parse(localStorage.getItem(SOLVER_STORE_KEY) ?? "null"));
      expect(
        persisted.teams.filter((team) => team.name === `تیم با ${_label} ناموجود`),
      ).toHaveLength(1);
      expect(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY)).toBeNull();
      expect(localStorage.getItem(PREVIOUS_SOLVER_STORE_FRESH_KEY)).toBeNull();
    } finally {
      setItem.mockRestore();
    }

    expect(
      readSolverState().teams.filter((team) => team.name === `تیم با ${_label} ناموجود`),
    ).toHaveLength(1);
  });

  it("snapshot معتبر v3 را مستقیم به TeamKind و نقش‌های v5 مهاجرت می‌دهد", () => {
    const legacy = legacyV3SolverState();
    legacy.savedByWorkspace[PERSONAL_WORKSPACE_ID] = ["CH-DIRECT-V3"];
    localStorage.setItem(LEGACY_SOLVER_STORE_KEY, JSON.stringify(legacy));

    const migrated = rawState(readSolverState());
    expect(migrated.version).toBe(5);
    expect(migrated.teams[0]).toMatchObject({ teamKind: "expert-team" });
    expect(migrated.memberships[0]).toMatchObject({ role: "team:owner" });
    expect(migrated.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toContain("CH-DIRECT-V3");
    expect(localStorage.getItem(LEGACY_SOLVER_STORE_KEY)).toBeNull();
    const rollbackMirror = rawState(
      JSON.parse(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY) ?? "null"),
    );
    expect(rollbackMirror.version).toBe(4);
    expect(rollbackMirror.memberships[0]).toMatchObject({ role: "owner" });
  });

  it.each([
    ["ناشناخته", "super-admin"],
    ["مفقود", undefined],
  ] as const)("نقش تیم v4 %s را به نقش گسترده‌تر تبدیل نمی‌کند", (_label, legacyRole) => {
    const legacy = previousV4SolverState();
    const corruptMembership = { ...legacy.memberships[0], role: legacyRole };
    if (legacyRole === undefined) delete corruptMembership.role;
    legacy.memberships[0] = corruptMembership;
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(legacy));

    const recovered = rawState(readSolverState());
    expect(recovered.memberships).toEqual(rawCanonicalSolverState().memberships);
    expect(recovered.memberships.some((membership) => membership.role === "team:super-admin")).toBe(
      false,
    );
    expect(localStorage.getItem(SOLVER_STORAGE_RECOVERY_KEY)).toContain(
      "invalid-or-corrupt-envelope",
    );
  });

  it.each([
    ["ناشناخته", "unsupported-kind"],
    ["مفقود", undefined],
  ] as const)("TeamType %s را بی‌صدا reclassify نمی‌کند", (_label, legacyTeamType) => {
    const legacy = legacyV3SolverState();
    const corruptTeam: Record<string, unknown> = {
      ...legacy.teams[0],
      name: `تیم با نوع ${_label}`,
    };
    if (legacyTeamType === undefined) delete corruptTeam.teamType;
    else corruptTeam.teamType = legacyTeamType;
    legacy.teams[0] = corruptTeam;
    localStorage.setItem(LEGACY_SOLVER_STORE_KEY, JSON.stringify(legacy));

    const recovered = rawState(readSolverState());
    expect(recovered.teams.some((team) => team.name === `تیم با نوع ${_label}`)).toBe(false);
    expect(recovered.teams).toEqual(rawCanonicalSolverState().teams);
    expect(localStorage.getItem(SOLVER_STORAGE_RECOVERY_KEY)).toContain(
      "invalid-or-corrupt-envelope",
    );
  });

  it("در رکورد نیمه‌مهاجرت‌یافته TeamKind canonical را مقدم و TeamType را حذف می‌کند", () => {
    const legacy = legacyV3SolverState();
    legacy.teams[0] = {
      ...legacy.teams[0],
      teamKind: "lab",
      teamType: "expert-team",
    };
    localStorage.setItem(LEGACY_SOLVER_STORE_KEY, JSON.stringify(legacy));

    const migrated = rawState(readSolverState());
    expect(migrated.teams[0]).toMatchObject({ teamKind: "lab" });
    expect(migrated.teams[0]).not.toHaveProperty("teamType");
    const persisted = rawState(JSON.parse(localStorage.getItem(SOLVER_STORE_KEY) ?? "null"));
    expect(persisted.teams[0]).toMatchObject({ teamKind: "lab" });
    expect(persisted.teams[0]).not.toHaveProperty("teamType");
  });

  it("draft بسیار قدیمی تیم را با TeamKind صریح به store جاری می‌آورد", () => {
    localStorage.setItem(
      "rahhal:solver-team-draft",
      JSON.stringify({ teamName: "تیم مهاجرت‌یافته قدیمی" }),
    );

    const migrated = rawState(readSolverState());
    expect(migrated.teams.find((team) => team.name === "تیم مهاجرت‌یافته قدیمی")).toMatchObject({
      teamKind: "expert-team",
      status: "draft",
    });
    expect(migrated.teams.every((team) => !("teamType" in team))).toBe(true);
  });

  it("reset، mirror v4 را تازه می‌کند و داده کاربر را دوباره زنده نمی‌کند", () => {
    const legacy = previousV4SolverState();
    legacy.teams[0] = { ...legacy.teams[0], name: "تیم قدیمی حذف‌شده" };
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(legacy));
    expect(readSolverState().teams.some((team) => team.name === "تیم قدیمی حذف‌شده")).toBe(true);

    resetSolverDemoData();
    const resetCurrent = rawState(JSON.parse(localStorage.getItem(SOLVER_STORE_KEY) ?? "null"));
    const resetMirror = rawState(
      JSON.parse(localStorage.getItem(PREVIOUS_SOLVER_STORE_KEY) ?? "null"),
    );
    expect(resetCurrent.version).toBe(5);
    expect(resetMirror.version).toBe(4);
    expect(resetCurrent.teams.some((team) => team.name === "تیم قدیمی حذف‌شده")).toBe(false);
    expect(resetMirror.teams.some((team) => team.name === "تیم قدیمی حذف‌شده")).toBe(false);
    localStorage.removeItem(SOLVER_STORE_KEY);

    const recoveredAfterReset = readSolverState();
    expect(recoveredAfterReset.teams.some((team) => team.name === "تیم قدیمی حذف‌شده")).toBe(false);
    expect(recoveredAfterReset.teams).toHaveLength(createCanonicalSolverState().teams.length);
  });

  it("پس از مشاهده v5، snapshot کهنه v3 را حتی با حذف دو store جدید زنده نمی‌کند", () => {
    const previous = previousV4SolverState();
    previous.teams[0] = { ...previous.teams[0], name: "تیم معتبر v4" };
    const stale = legacyV3SolverState();
    stale.teams[0] = { ...stale.teams[0], name: "تیم کهنه v3" };
    localStorage.setItem(PREVIOUS_SOLVER_STORE_KEY, JSON.stringify(previous));
    localStorage.setItem(LEGACY_SOLVER_STORE_KEY, JSON.stringify(stale));

    expect(readSolverState().teams.some((team) => team.name === "تیم معتبر v4")).toBe(true);
    localStorage.setItem(LEGACY_SOLVER_STORE_KEY, JSON.stringify(stale));
    localStorage.removeItem(SOLVER_STORE_KEY);
    localStorage.removeItem(PREVIOUS_SOLVER_STORE_KEY);

    const recovered = readSolverState();
    expect(recovered.teams.some((team) => team.name === "تیم کهنه v3")).toBe(false);
    expect(recovered.teams).toHaveLength(createCanonicalSolverState().teams.length);
  });
});

describe("Solver v28 foundation contracts", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSolverDemoData();
  });

  it("context کامل فردی و دو تیم را parse/build می‌کند و teamId قدیمی را حمل نمی‌کند", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    const team34 = contextForTeam(SECONDARY_TEAM_ID);
    expect(team21).toMatchObject({ teamId: PRIMARY_TEAM_ID, workspaceId: "WS-TEAM-21" });
    expect(team34).toMatchObject({ teamId: SECONDARY_TEAM_ID, workspaceId: "WS-TEAM-34" });
    expect(buildSolverHref("/app/solver/dashboard?teamId=STALE", personal)).toBe(
      "/app/solver/dashboard?space=individual&workspaceId=WS-PERSONAL-001",
    );
    expect(buildSolverHref("/app/solver/proposals?status=draft", team34)).toContain(
      "teamId=TEAM-34",
    );
    expect(buildStandaloneSolverHref("/app/solver/dashboard", team21)).toContain(
      "#%s".replace("%s", "/app/solver/dashboard?"),
    );
  });

  it("unknown، workspace ناسازگار و تیم بدون عضویت fallback نمی‌شوند", () => {
    expect(parseSolverContext("space=team")).toMatchObject({ ok: false, error: "invalid" });
    expect(parseSolverContext("space=team&teamId=TEAM-UNKNOWN")).toMatchObject({
      ok: false,
      error: "not-found",
    });
    expect(parseSolverContext("space=team&teamId=TEAM-21&workspaceId=WS-TEAM-34")).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(parseSolverContext("space=team&teamId=TEAM-55")).toMatchObject({
      ok: false,
      error: "no-access",
    });
  });

  it("RBAC تمام نقش‌ها را برای ساخت و ارسال proposal enforce می‌کند", () => {
    const roles: TeamRole[] = [
      "team:owner",
      "team:admin",
      "team:proposal-manager",
      "team:contributor",
      "team:viewer",
    ];
    const create = Object.fromEntries(
      roles.map((role) => [
        role,
        decideTeamPermission("create-proposal", { role, policy: DEFAULT_TEAM_POLICY }).allowed,
      ]),
    );
    const submit = Object.fromEntries(
      roles.map((role) => [
        role,
        decideTeamPermission("submit-proposal", { role, policy: DEFAULT_TEAM_POLICY }).allowed,
      ]),
    );
    expect(create).toEqual({
      "team:owner": true,
      "team:admin": true,
      "team:proposal-manager": true,
      "team:contributor": true,
      "team:viewer": false,
    });
    expect(submit).toEqual({
      "team:owner": true,
      "team:admin": true,
      "team:proposal-manager": true,
      "team:contributor": false,
      "team:viewer": false,
    });
  });

  it("store نسخه‌دار corruption را بازیابی و کلید legacy ذخیره را migrate می‌کند", () => {
    localStorage.clear();
    localStorage.setItem("rahhal:saved:CH-LEGACY", "1");
    localStorage.setItem(SOLVER_STORE_KEY, "{broken");
    const recovered = readSolverState();
    expect(recovered.version).toBe(5);
    expect(recovered.savedByWorkspace[PERSONAL_WORKSPACE_ID]).toContain("CH-LEGACY");
    expect(localStorage.getItem(SOLVER_STORAGE_RECOVERY_KEY)).toContain(
      "invalid-or-corrupt-envelope",
    );
  });

  it("Saved برای فرد و دو تیم کاملاً جدا می‌ماند", () => {
    setSavedOpportunity(PERSONAL_WORKSPACE_ID, "CH-SAME", true);
    setSavedOpportunity("WS-TEAM-21", "CH-SAME", true);
    setSavedOpportunity("WS-TEAM-34", "CH-OTHER", true);
    expect(savedOpportunityIds(PERSONAL_WORKSPACE_ID)).toContain("CH-SAME");
    expect(savedOpportunityIds("WS-TEAM-21")).toContain("CH-SAME");
    expect(savedOpportunityIds("WS-TEAM-34")).not.toContain("CH-SAME");
    expect(savedOpportunityIds("WS-TEAM-34")).toContain("CH-OTHER");
  });

  it("draft یک challenge در دو workspace تداخل ندارد و submit idempotent است", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    const personalContent = { ...proposalDraftTemplate(), title: "فردی", accuracyConfirmed: true };
    const teamContent = { ...proposalDraftTemplate(), title: "تیمی", accuracyConfirmed: true };
    expect(saveProposalDraft("CH-1405-028", personal.workspaceId, personalContent).ok).toBe(true);
    expect(saveProposalDraft("CH-1405-028", team21.workspaceId, teamContent).ok).toBe(true);
    expect(readProposalDraft("CH-1405-028", personal.workspaceId)?.content.title).toBe("فردی");
    expect(readProposalDraft("CH-1405-028", team21.workspaceId)?.content.title).toBe("تیمی");
    const first = submitProposal(personal, "CH-1405-028", "submit-personal-028");
    const second = submitProposal(personal, "CH-1405-028", "submit-personal-028");
    expect(first.ok).toBe(true);
    expect(second.ok && second.idempotent).toBe(true);
    if (!first.ok) throw new Error(first.message);
    expect(
      proposalsForWorkspace(personal.workspaceId).some((item) => item.id === first.entityId),
    ).toBe(true);
  });

  it("Contributor می‌تواند draft بسازد اما submit نهایی handler آن را رد می‌کند", () => {
    const team34 = contextForTeam(SECONDARY_TEAM_ID);
    saveProposalDraft("CH-1405-024", team34.workspaceId, {
      ...proposalDraftTemplate(),
      title: "نسخه مشارکت‌کننده",
      accuracyConfirmed: true,
    });
    expect(submitProposal(team34, "CH-1405-024", "team34-submit")).toMatchObject({
      ok: false,
      code: "NO_ACCESS",
    });
  });

  it("مشاهده direct offer فقط viewed می‌سازد و submit پاسخ workspace-scoped است", () => {
    expect(viewDirectOffer("OFF-226", PERSONAL_WORKSPACE_ID).ok).toBe(true);
    expect(directOffersForWorkspace(PERSONAL_WORKSPACE_ID)[0]?.state).toBe("viewed");
    expect(directOffersForWorkspace("WS-TEAM-21").some((offer) => offer.id === "OFF-226")).toBe(
      false,
    );
    expect(startOfferResponse("OFF-226", PERSONAL_WORKSPACE_ID).ok).toBe(true);
    const submitted = submitOfferResponse(
      "OFF-226",
      PERSONAL_WORKSPACE_ID,
      {
        approach: "پایلوت سه‌مرحله‌ای",
        budget: "120000000",
        duration: "8 هفته",
        attachmentNames: [],
      },
      "offer-226-response",
    );
    expect(submitted.ok).toBe(true);
    expect(directOffersForWorkspace(PERSONAL_WORKSPACE_ID)[0]?.state).toBe("response_submitted");
  });

  it("رد پیشنهاد مستقیم دلیل را روی همان رکورد نگه می‌دارد و Saved فضای جعلی را رد می‌کند", () => {
    expect(
      declineDirectOffer("OFF-226", PERSONAL_WORKSPACE_ID, "با ظرفیت فعلی سازگار نیست").ok,
    ).toBe(true);
    expect(directOffersForWorkspace(PERSONAL_WORKSPACE_ID)[0]).toMatchObject({
      state: "declined",
      declineReason: "با ظرفیت فعلی سازگار نیست",
    });
    expect(setSavedOpportunity("WS-TEAM-UNKNOWN", "CH-1405-021", true)).toMatchObject({
      ok: false,
      code: "NO_ACCESS",
    });
  });

  it("پذیرش دعوت membership می‌سازد و workspace جدید را قابل انتخاب می‌کند", () => {
    expect(activeWorkspaces()).toHaveLength(3);
    expect(respondToTeamInvitation("INV-301", "accepted").ok).toBe(true);
    expect(
      activeWorkspaces().some(
        (workspace) => workspace.type === "team" && workspace.teamId === "TEAM-55",
      ),
    ).toBe(true);
  });

  it("eligibility بر داده ساخت‌یافته است و rule ناشناخته نیازمند بررسی می‌ماند", () => {
    const state = createCanonicalSolverState();
    expect(
      evaluateEligibility(challengeEligibilityRules["CH-1405-022"], state, personal).status,
    ).toBe("eligible");
    expect(evaluateEligibility(undefined, state, personal).status).toBe("needs-review");
    expect(
      evaluateEligibility(challengeEligibilityRules["CH-1405-028"], state, personal).status,
    ).toBe("ineligible");
    expect(
      evaluateEligibility(challengeEligibilityRules["CH-1405-022"], state, {
        type: "team",
        workspaceId: "WS-TEAM-MISSING",
        teamId: "TEAM-MISSING",
        membershipId: "MEM-MISSING",
      }).status,
    ).toBe("ineligible");
  });

  it("NDA به workspace scope می‌شود و قرارداد نسخه جدید approval قبلی را invalidate می‌کند", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    expect(canAccessRestrictedDocument(team21.workspaceId, "CH-1405-021")).toBe(false);
    expect(acceptNda(team21, "CH-1405-021", "NDA-2", "nda-team21").ok).toBe(true);
    expect(canAccessRestrictedDocument(team21.workspaceId, "CH-1405-021")).toBe(true);
    expect(canAccessRestrictedDocument(PERSONAL_WORKSPACE_ID, "CH-1405-021")).toBe(false);
    expect(createContractVersion(team21, "CON-127").ok).toBe(true);
    expect(
      readSolverState().contracts.find((contract) => contract.id === "CON-127")?.approvals,
    ).toEqual([]);
  });

  it("امضای قرارداد و بستن پرونده idempotent، نسخه‌محور و دارای receipt هستند", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    expect(createContractVersion(team21, "CON-127").ok).toBe(true);
    expect(approveContract(team21, "CON-127").ok).toBe(true);
    const signed = signContract(team21, "CON-127", "sign-con-127-v3");
    const duplicateSignature = signContract(team21, "CON-127", "sign-con-127-v3");
    expect(signed.ok).toBe(true);
    expect(duplicateSignature).toMatchObject({ ok: true, idempotent: true });
    expect(readSolverState().contracts.find((item) => item.id === "CON-127")?.state).toBe(
      "effective",
    );

    const closed = closeCase(personal, "CASE-138", "close-case-138");
    const duplicateClosure = closeCase(personal, "CASE-138", "close-case-138");
    expect(closed.ok).toBe(true);
    expect(duplicateClosure).toMatchObject({ ok: true, idempotent: true });
    expect(readSolverState().cases.find((item) => item.id === "CASE-138")?.state).toBe("closed");
  });

  it("تخصیص، تعلیق، بازگردانی و خروج عضو کاملاً team-scoped است", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    expect(assignTeamMember(team21, "MEM-21-002", { type: "case", id: "CASE-127" }).ok).toBe(true);
    expect(
      readSolverState().memberships.find((item) => item.id === "MEM-21-002")?.assignedCaseIds,
    ).toContain("CASE-127");
    expect(suspendTeamMembership(team21, "MEM-21-002").ok).toBe(true);
    expect(readSolverState().memberships.find((item) => item.id === "MEM-21-002")?.state).toBe(
      "suspended",
    );
    expect(restoreTeamMembership(team21, "MEM-21-002").ok).toBe(true);
    expect(readSolverState().memberships.find((item) => item.id === "MEM-21-002")?.state).toBe(
      "active",
    );
    expect(leaveTeam(team21)).toMatchObject({ ok: false, code: "INVALID_STATE" });

    const team34 = contextForTeam(SECONDARY_TEAM_ID);
    expect(leaveTeam(team34).ok).toBe(true);
    expect(
      activeWorkspaces().some(
        (workspace) => workspace.type === "team" && workspace.teamId === SECONDARY_TEAM_ID,
      ),
    ).toBe(false);
  });

  it("احراز دو تیم مستقل است و actor نمی‌تواند membership عضو دیگری را جعل کند", () => {
    const team21 = contextForTeam(PRIMARY_TEAM_ID);
    const before34 = readSolverState().verifications.find(
      (item) => item.workspaceId === "WS-TEAM-34",
    );
    expect(submitVerification("WS-TEAM-21", ["team-21-new.pdf"], team21).ok).toBe(true);
    const state = readSolverState();
    expect(state.verifications.find((item) => item.workspaceId === "WS-TEAM-21")?.state).toBe(
      "submitted",
    );
    expect(state.verifications.find((item) => item.workspaceId === "WS-TEAM-34")).toEqual(before34);

    const forgedViewer: ActiveWorkspace = {
      type: "team",
      teamId: "TEAM-21",
      workspaceId: "WS-TEAM-21",
      membershipId: "MEM-21-004",
    };
    expect(acceptNda(forgedViewer, "CH-1405-021", "NDA-2", "forged-nda")).toMatchObject({
      ok: false,
      code: "NO_ACCESS",
    });
    expect(createContractVersion(forgedViewer, "CON-127")).toMatchObject({
      ok: false,
      code: "NO_ACCESS",
    });
    expect(approveContract(forgedViewer, "CON-127")).toMatchObject({
      ok: false,
      code: "NO_ACCESS",
    });
  });

  it("state machine مشاهده offer را از پذیرش نهایی جدا نگه می‌دارد", () => {
    // The canonical machine also requires `not-expired`: server time, not a
    // browser form opened earlier, decides whether the offer is still live.
    expect(
      canTransition(directOfferTransitions, "received", "viewed", "individual", [
        "recipient-authorized",
        "not-expired",
      ]),
    ).toBe(true);
    expect(
      canTransition(directOfferTransitions, "received", "viewed", "individual", [
        "recipient-authorized",
      ]),
    ).toBe(false);
    expect(canTransition(directOfferTransitions, "viewed", "selected", "individual", [])).toBe(
      false,
    );
    expect(
      canTransition(proposalTransitions, "revision_requested", "revision_draft", "individual", [
        "editor-authorized",
      ]),
    ).toBe(true);
    expect(
      canTransition(teamInvitationTransitions, "viewed", "accepted", "individual", [
        "recipient-authorized",
        "not-expired",
      ]),
    ).toBe(true);
    expect(
      canTransition(membershipRequestTransitions, "requested", "accepted", "team:admin", [
        "scope-approved",
      ]),
    ).toBe(true);
    expect(
      canTransition(membershipTransitions, "active", "suspended", "team:admin", [
        "not-owner",
        "not-self",
      ]),
    ).toBe(true);
    expect(
      canTransition(verificationTransitions, "needs_revision", "submitted", "team:owner", [
        "documents-valid",
        "revision-addressed",
      ]),
    ).toBe(true);
    expect(
      canTransition(contractTransitions, "signature", "effective", "team:owner", [
        "approved-current-version",
      ]),
    ).toBe(true);
  });
});
