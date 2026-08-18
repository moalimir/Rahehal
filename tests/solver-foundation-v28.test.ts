// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
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

function contextForTeam(teamId: string) {
  const resolution = parseSolverContext(`space=team&teamId=${teamId}`);
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution.context;
}

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
    const roles: TeamRole[] = ["owner", "admin", "proposal-manager", "contributor", "viewer"];
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
      owner: true,
      admin: true,
      "proposal-manager": true,
      contributor: true,
      viewer: false,
    });
    expect(submit).toEqual({
      owner: true,
      admin: true,
      "proposal-manager": true,
      contributor: false,
      viewer: false,
    });
  });

  it("store نسخه‌دار corruption را بازیابی و کلید legacy ذخیره را migrate می‌کند", () => {
    localStorage.clear();
    localStorage.setItem("rahhal:saved:CH-LEGACY", "1");
    localStorage.setItem(SOLVER_STORE_KEY, "{broken");
    const recovered = readSolverState();
    expect(recovered.version).toBe(3);
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
    expect(
      canTransition(directOfferTransitions, "received", "viewed", "solver", [
        "recipient-authorized",
      ]),
    ).toBe(true);
    expect(canTransition(directOfferTransitions, "viewed", "selected", "solver", [])).toBe(false);
    expect(
      canTransition(proposalTransitions, "revision_requested", "revision_draft", "solver", [
        "editor-authorized",
      ]),
    ).toBe(true);
    expect(
      canTransition(teamInvitationTransitions, "viewed", "accepted", "solver", [
        "recipient-authorized",
        "not-expired",
      ]),
    ).toBe(true);
    expect(
      canTransition(membershipRequestTransitions, "requested", "accepted", "admin", [
        "scope-approved",
      ]),
    ).toBe(true);
    expect(
      canTransition(membershipTransitions, "active", "suspended", "admin", [
        "not-owner",
        "not-self",
      ]),
    ).toBe(true);
    expect(
      canTransition(verificationTransitions, "needs_revision", "submitted", "owner", [
        "documents-valid",
        "revision-addressed",
      ]),
    ).toBe(true);
    expect(
      canTransition(contractTransitions, "signature", "effective", "owner", [
        "approved-current-version",
      ]),
    ).toBe(true);
  });
});
