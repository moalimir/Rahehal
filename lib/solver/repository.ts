import {
  CURRENT_SOLVER_USER_ID,
  DEFAULT_TEAM_POLICY,
  EMPTY_PROPOSAL_CONTENT,
  PERSONAL_WORKSPACE_ID,
  createCanonicalSolverState,
} from "@/data/solver-fixtures";
import type {
  AccountSettings,
  ActiveWorkspace,
  DirectOffer,
  MembershipRequest,
  MutationFailure,
  MutationReceipt,
  MutationResult,
  OfferResponse,
  PersonalProfile,
  Proposal,
  ProposalContent,
  SolverNotification,
  SolverState,
  TeamInvitation,
  TeamPolicy,
  TeamProfile,
  TeamRole,
  TeamSettings,
  TeamType,
} from "@/domain/solver";
import {
  canRemoveMembership,
  permissionForMembership,
  type TeamAction,
} from "@/lib/solver/permissions";

export const SOLVER_STORE_VERSION = 3;
export const SOLVER_STORE_KEY = `rahhal.solver.v${SOLVER_STORE_VERSION}.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_STORE_EVENT = "rahhal:solver-store-change";
export const SOLVER_STORAGE_RECOVERY_KEY = "rahhal.solver.recovery.v1";

const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fail(code: MutationFailure["code"], message: string): MutationFailure {
  return { ok: false, code, message };
}

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function validState(value: unknown): value is SolverState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SolverState>;
  return (
    state.version === SOLVER_STORE_VERSION &&
    typeof state.currentUser?.id === "string" &&
    state.currentUser.id === CURRENT_SOLVER_USER_ID &&
    Array.isArray(state.teams) &&
    Array.isArray(state.memberships) &&
    Array.isArray(state.proposals) &&
    Array.isArray(state.directOffers) &&
    Boolean(state.savedByWorkspace)
  );
}

function legacySavedIds() {
  if (!storageAvailable()) return [] as string[];
  const ids: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("rahhal:saved:")) continue;
    if (localStorage.getItem(key) === "1") ids.push(key.slice("rahhal:saved:".length));
  }
  return ids;
}

type LegacyProposalDraft = Partial<{
  title: string;
  executiveSummary: string;
  stage: string;
  prototypeWeeks: string;
  value: string;
  technologies: string;
  problemUnderstanding: string;
  technicalApproach: string;
  architecture: string;
  requiredData: string;
  successMetrics: string;
  ipStatus: string;
  durationWeeks: string;
  milestones: string;
  dependencies: string;
  pilotLocation: string;
  risks: string;
  mitigation: string;
  teamLead: string;
  teamComposition: string;
  relevantExperience: string;
  requestedBudget: string;
  paymentModel: string;
  budgetRationale: string;
  startAvailability: string;
  teamAvailability: string;
  ndaAccepted: boolean;
  conflictDeclared: boolean;
  ipAccepted: boolean;
  accuracyConfirmed: boolean;
}>;

function legacyProposalContent(value: LegacyProposalDraft): ProposalContent {
  return {
    ...EMPTY_PROPOSAL_CONTENT,
    title: value.title ?? "",
    problemStatement: [value.executiveSummary, value.problemUnderstanding].filter(Boolean).join("\n"),
    valueProposition: value.value ?? "",
    maturityLevel: value.stage ?? "",
    prototypeWeeks: value.prototypeWeeks ?? "",
    technologies: (value.technologies ?? "").split(/[،,]/).map((item) => item.trim()).filter(Boolean),
    technicalApproach: value.technicalApproach ?? "",
    architecture: value.architecture ?? "",
    dataNeeds: value.requiredData ?? "",
    successMetrics: value.successMetrics ?? "",
    ipStatus: value.ipStatus ?? "",
    durationWeeks: value.durationWeeks ?? "",
    roadmap: value.milestones ?? "",
    dependencies: [value.dependencies, value.pilotLocation && `محل پایلوت: ${value.pilotLocation}`].filter(Boolean).join("\n"),
    pilotLocation: value.pilotLocation ?? "",
    risks: [value.risks, value.mitigation && `برنامه کنترل: ${value.mitigation}`].filter(Boolean).join("\n"),
    mitigation: value.mitigation ?? "",
    leadName: value.teamLead ?? "",
    teamSummary: value.teamComposition ?? "",
    relevantExperience: value.relevantExperience ?? "",
    requestedBudget: value.requestedBudget ?? "",
    paymentModel: value.paymentModel ?? "",
    budgetRationale: value.budgetRationale ?? "",
    startAvailability: value.startAvailability ?? value.teamAvailability ?? "",
    teamAvailability: value.teamAvailability ?? "",
    ndaAccepted: Boolean(value.ndaAccepted),
    conflictDeclared: Boolean(value.conflictDeclared),
    ipAccepted: Boolean(value.ipAccepted),
    accuracyConfirmed: Boolean(value.accuracyConfirmed),
    attachmentNames: [],
  };
}

function migrateLegacyProposalDrafts(state: SolverState) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    const match = key?.match(/^rahhal:proposal:(CH-[^:]+):(individual|team)$/);
    if (!key || !match) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null") as LegacyProposalDraft | null;
      if (!value) continue;
      const workspaceId = match[2] === "team" ? "WS-TEAM-21" : PERSONAL_WORKSPACE_ID;
      const existing = state.proposalDrafts.find(
        (draft) => draft.challengeId === match[1] && draft.ownerWorkspaceId === workspaceId,
      );
      const migratedDraft = {
        id: `DRAFT-MIGRATED-${match[1]}-${match[2]}`,
        challengeId: match[1],
        ownerWorkspaceId: workspaceId,
        content: legacyProposalContent(value),
        version: 1,
        updatedAt: now(),
      };
      // On first v3 boot, recover the user's legacy draft over the bundled demo
      // seed for the same workspace/challenge. Otherwise valid user work would be
      // silently shadowed by a sample draft.
      if (existing) Object.assign(existing, migratedDraft, { id: existing.id, version: existing.version + 1 });
      else state.proposalDrafts.push(migratedDraft);
    } catch {
      // Malformed legacy proposal data is isolated and ignored.
    }
  }
}

function migrateLegacy(seed: SolverState): SolverState {
  if (!storageAvailable()) return seed;
  const migrated = clone(seed);
  const saved = legacySavedIds();
  if (saved.length)
    migrated.savedByWorkspace[PERSONAL_WORKSPACE_ID] = [
      ...new Set([...(migrated.savedByWorkspace[PERSONAL_WORKSPACE_ID] ?? []), ...saved]),
    ];
  try {
    const legacyDraft = localStorage.getItem("rahhal:solver-team-draft");
    if (legacyDraft) {
      const parsed = JSON.parse(legacyDraft) as { name?: string; teamName?: string };
      const name = parsed.name ?? parsed.teamName;
      if (name && !migrated.teams.some((team) => team.name === name)) {
        const teamId = `TEAM-MIGRATED-${migrated.teams.length + 1}`;
        migrated.teams.push({
          id: teamId,
          type: "team",
          workspaceId: `WS-${teamId}`,
          name,
          teamType: "expert-team",
          status: "draft",
          ownerUserId: CURRENT_SOLVER_USER_ID,
          profileId: `TP-${teamId}`,
          policyId: `POL-${teamId}`,
          policy: { ...DEFAULT_TEAM_POLICY },
          createdAt: now(),
        });
      }
    }
  } catch {
    // A malformed legacy draft is ignored without affecting the canonical seed.
  }
  migrateLegacyProposalDrafts(migrated);
  migrated.updatedAt = now();
  return migrated;
}

function persist(state: SolverState) {
  if (!storageAvailable()) return;
  localStorage.setItem(SOLVER_STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(SOLVER_STORE_EVENT, { detail: { updatedAt: state.updatedAt } }));
}

export function readSolverState(): SolverState {
  if (!storageAvailable()) return createCanonicalSolverState();
  const raw = localStorage.getItem(SOLVER_STORE_KEY);
  if (!raw) {
    const seeded = migrateLegacy(createCanonicalSolverState());
    persist(seeded);
    return clone(seeded);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validState(parsed)) {
      const compatible = clone(parsed);
      const defaults = createCanonicalSolverState();
      compatible.users ??= defaults.users;
      compatible.accountSettings.sessions ??= defaults.accountSettings.sessions;
      return compatible;
    }
  } catch {
    // The recovery marker below documents a safe corruption fallback for QA.
  }
  const recovered = migrateLegacy(createCanonicalSolverState());
  try {
    localStorage.setItem(
      SOLVER_STORAGE_RECOVERY_KEY,
      JSON.stringify({ recoveredAt: now(), reason: "invalid-or-corrupt-envelope" }),
    );
  } catch {
    // Storage can be unavailable; the recovered in-memory projection remains usable.
  }
  persist(recovered);
  return clone(recovered);
}

export function resetSolverDemoData() {
  const state = createCanonicalSolverState(now());
  persist(state);
  return clone(state);
}

export function subscribeSolverState(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOLVER_STORE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SOLVER_STORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SOLVER_STORE_EVENT, callback);
  };
}

function receipt(
  state: SolverState,
  workspaceId: string,
  entityId: string,
  action: string,
  idempotencyKey?: string,
): MutationReceipt {
  if (idempotencyKey && state.idempotency[idempotencyKey]) {
    const previous = state.idempotency[idempotencyKey];
    return {
      ok: true,
      entityId: previous.entityId,
      receiptId: previous.receiptId,
      auditEventId:
        state.auditEvents.find((event) => event.receiptId === previous.receiptId)?.id ?? "AUD-UNKNOWN",
      timestamp: previous.createdAt,
      idempotent: true,
    };
  }
  const timestamp = now();
  const receiptId = id("REC");
  const auditEventId = id("AUD");
  state.auditEvents.push({
    id: auditEventId,
    actorUserId: state.currentUser.id,
    workspaceId,
    entityId,
    action,
    createdAt: timestamp,
    receiptId,
  });
  if (idempotencyKey)
    state.idempotency[idempotencyKey] = { entityId, receiptId, createdAt: timestamp };
  return { ok: true, entityId, receiptId, auditEventId, timestamp, idempotent: false };
}

function updateState(
  mutation: (state: SolverState) => MutationResult,
): MutationResult {
  const state = readSolverState();
  const result = mutation(state);
  if (!result.ok) return result;
  state.updatedAt = result.timestamp;
  try {
    persist(state);
    return result;
  } catch {
    return fail("STORAGE", "ذخیره تغییر ممکن نشد؛ ورودی شما برای تلاش دوباره حفظ شده است.");
  }
}

export function activeWorkspaces(state = readSolverState()): ActiveWorkspace[] {
  const workspaces: ActiveWorkspace[] = [
    { type: "individual", workspaceId: state.personalWorkspace.id },
  ];
  for (const membership of state.memberships) {
    if (membership.userId !== state.currentUser.id || membership.state !== "active") continue;
    const team = state.teams.find(
      (candidate) => candidate.id === membership.teamId && candidate.status === "active",
    );
    if (team)
      workspaces.push({
        type: "team",
        workspaceId: team.workspaceId,
        teamId: team.id,
        membershipId: membership.id,
      });
  }
  return workspaces;
}

export function registerSolverAccount(input: {
  displayName: string;
  email: string;
  mobile: string;
  headline: string;
  bio: string;
  skills: string[];
  availability: string;
  resumeFileName?: string;
}): MutationResult {
  return updateState((state) => {
    if (input.displayName.trim().length < 3 || !/^\S+@\S+\.\S+$/.test(input.email))
      return fail("VALIDATION", "نام و ایمیل معتبر برای ساخت حساب لازم است.");
    state.currentUser.displayName = input.displayName.trim();
    state.currentUser.email = input.email.trim();
    state.currentUser.mobile = input.mobile;
    state.currentUser.headline = input.headline.trim();
    const registryUser = state.users.find((user) => user.id === state.currentUser.id);
    if (registryUser) Object.assign(registryUser, clone(state.currentUser));
    const profile = state.personalProfiles.find(
      (candidate) => candidate.workspaceId === state.personalWorkspace.id,
    );
    if (profile) {
      profile.displayName = state.currentUser.displayName;
      profile.headline = input.headline.trim();
      profile.bio = input.bio.trim();
      profile.skills = [...new Set(input.skills)];
      profile.availability = input.availability;
      profile.resumeFileName = input.resumeFileName;
      profile.updatedAt = now();
    }
    return receipt(state, state.personalWorkspace.id, state.currentUser.id, "register-solver-account", `register:${input.email.trim().toLowerCase()}`);
  });
}

export function teamPermission(
  context: ActiveWorkspace,
  action: TeamAction,
  options: { assigned?: boolean } = {},
  state = readSolverState(),
) {
  if (context.type === "individual") return { allowed: true as const };
  const team = state.teams.find((candidate) => candidate.id === context.teamId);
  const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
  if (!team) return { allowed: false as const, reason: "تیم پیدا نشد." };
  if (team.workspaceId !== context.workspaceId)
    return { allowed: false as const, reason: "فضای کاری با تیم فعال سازگار نیست." };
  if (membership?.userId !== state.currentUser.id)
    return { allowed: false as const, reason: "عضویت انتخاب‌شده متعلق به کاربر جاری نیست." };
  return permissionForMembership(action, team, membership, options);
}

export function savedOpportunityIds(workspaceId: string, state = readSolverState()) {
  return [...(state.savedByWorkspace[workspaceId] ?? [])];
}

export function setSavedOpportunity(
  workspaceId: string,
  challengeId: string,
  saved: boolean,
): MutationResult {
  return updateState((state) => {
    if (!activeWorkspaces(state).some((workspace) => workspace.workspaceId === workspaceId))
      return fail("NO_ACCESS", "این فضای کاری در دسترس کاربر جاری نیست.");
    const current = state.savedByWorkspace[workspaceId] ?? [];
    state.savedByWorkspace[workspaceId] = saved
      ? [...new Set([...current, challengeId])]
      : current.filter((id) => id !== challengeId);
    return receipt(state, workspaceId, challengeId, saved ? "save-opportunity" : "unsave-opportunity");
  });
}

export function proposalsForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.proposals.filter((proposal) => proposal.ownerWorkspaceId === workspaceId);
}

export function proposalById(proposalId: string, workspaceId?: string, state = readSolverState()) {
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal || (workspaceId && proposal.ownerWorkspaceId !== workspaceId)) return undefined;
  return proposal;
}

export function proposalContent(proposalId: string, workspaceId: string, state = readSolverState()) {
  const proposal = proposalById(proposalId, workspaceId, state);
  if (!proposal) return undefined;
  return state.proposalVersions.find((version) => version.id === proposal.currentVersionId)?.content;
}

export function readProposalDraft(challengeId: string, workspaceId: string, state = readSolverState()) {
  return state.proposalDrafts.find(
    (draft) => draft.challengeId === challengeId && draft.ownerWorkspaceId === workspaceId,
  );
}

export function saveProposalDraft(
  challengeId: string,
  workspaceId: string,
  content: ProposalContent,
  expectedVersion?: number,
): MutationResult {
  return updateState((state) => {
    const existing = state.proposalDrafts.find(
      (draft) => draft.challengeId === challengeId && draft.ownerWorkspaceId === workspaceId,
    );
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion)
      return fail("CONFLICT", "پیش‌نویس در نمای دیگری تغییر کرده است؛ نسخه تازه را بارگذاری کنید.");
    if (existing) {
      existing.content = clone(content);
      existing.version += 1;
      existing.updatedAt = now();
      return receipt(state, workspaceId, existing.id, "save-proposal-draft");
    }
    const draftId = id("DRAFT");
    state.proposalDrafts.push({
      id: draftId,
      challengeId,
      ownerWorkspaceId: workspaceId,
      content: clone(content),
      version: 1,
      updatedAt: now(),
    });
    return receipt(state, workspaceId, draftId, "create-proposal-draft");
  });
}

export function submitProposal(
  context: ActiveWorkspace,
  challengeId: string,
  idempotencyKey: string,
): MutationResult {
  return updateState((state) => {
    const previousSubmission = state.idempotency[idempotencyKey];
    if (previousSubmission)
      return receipt(
        state,
        context.workspaceId,
        previousSubmission.entityId,
        "submit-proposal",
        idempotencyKey,
      );
    if (context.type === "team") {
      const permission = teamPermission(context, "submit-proposal", {}, state);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    const draft = state.proposalDrafts.find(
      (candidate) =>
        candidate.challengeId === challengeId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!draft) return fail("NOT_FOUND", "پیش‌نویس این فرصت پیدا نشد.");
    if (!draft.content.accuracyConfirmed)
      return fail("VALIDATION", "تأیید صحت اطلاعات و اختیار ارسال الزامی است.");
    const existing = state.proposals.find(
      (proposal) =>
        proposal.challengeId === challengeId && proposal.ownerWorkspaceId === context.workspaceId,
    );
    if (existing && !["draft", "revision_requested", "revision_draft"].includes(existing.state))
      return fail("INVALID_STATE", "برای این فرصت یک پیشنهاد قفل‌شده وجود دارد.");
    const proposalId = existing?.id ?? id("PR");
    const number =
      Math.max(
        0,
        ...state.proposalVersions
          .filter((version) => version.proposalId === proposalId)
          .map((version) => version.number),
      ) + 1;
    const versionId = `${proposalId}-V${number}`;
    const previous = existing
      ? state.proposalVersions.find((version) => version.id === existing.currentVersionId)?.content
      : undefined;
    const changedFields = (Object.keys(draft.content) as Array<keyof ProposalContent>).filter(
      (key) => JSON.stringify(previous?.[key]) !== JSON.stringify(draft.content[key]),
    );
    state.proposalVersions.push({
      id: versionId,
      proposalId,
      number,
      actorUserId: state.currentUser.id,
      createdAt: now(),
      content: clone(draft.content),
      changedFields,
      locked: true,
    });
    const trackingCode = `TRK-${proposalId}-V${number}`;
    if (existing) {
      existing.currentVersionId = versionId;
      existing.state = number > 1 ? "resubmitted" : "submitted";
      existing.submittedAt = now();
      existing.updatedAt = now();
      existing.trackingCode = trackingCode;
    } else {
      state.proposals.push({
        id: proposalId,
        challengeId,
        ownerWorkspaceId: context.workspaceId,
        currentVersionId: versionId,
        state: "submitted",
        assignedMembershipIds: context.type === "team" ? [context.membershipId] : [],
        createdAt: now(),
        updatedAt: now(),
        submittedAt: now(),
        trackingCode,
      });
    }
    state.proposalDrafts = state.proposalDrafts.filter((candidate) => candidate.id !== draft.id);
    state.notifications.push({
      id: id("NOT"),
      recipientUserId: state.currentUser.id,
      recipientWorkspaceId: context.workspaceId,
      type: "proposal_submitted",
      title: `پیشنهاد ${proposalId} ارسال شد`,
      body: `نسخه ${number.toLocaleString("fa-IR")} قفل و رسید ارسال صادر شد.`,
      entityId: proposalId,
      deepLink: `/app/solver/proposals/${proposalId}/preview`,
      readAt: now(),
      createdAt: now(),
      priority: "normal",
      actionRequired: false,
    });
    return receipt(state, context.workspaceId, proposalId, "submit-proposal", idempotencyKey);
  });
}

export function createTeam(input: {
  name: string;
  teamType: TeamType;
  introduction: string;
  expertise: string[];
  publicContact: string;
  policy?: Partial<TeamPolicy>;
  initialInviteEmail?: string;
}): MutationResult {
  return updateState((state) => {
    const name = input.name.trim();
    if (name.length < 3) return fail("VALIDATION", "نام تیم باید دست‌کم ۳ کاراکتر باشد.");
    if (state.teams.some((team) => team.name === name))
      return fail("CONFLICT", "تیمی با این نام در داده نمونه وجود دارد.");
    if (input.initialInviteEmail && !/^\S+@\S+\.\S+$/.test(input.initialInviteEmail))
      return fail("VALIDATION", "ایمیل دعوت اولیه معتبر نیست.");
    const teamId = id("TEAM");
    const workspaceId = `WS-${teamId}`;
    const policy = { ...DEFAULT_TEAM_POLICY, ...input.policy };
    const team = {
      id: teamId,
      type: "team" as const,
      workspaceId,
      name,
      teamType: input.teamType,
      status: "active" as const,
      ownerUserId: state.currentUser.id,
      profileId: `TP-${teamId}`,
      policyId: `POL-${teamId}`,
      policy,
      createdAt: now(),
    };
    state.teams.push(team);
    state.memberships.push({
      id: `MEM-${teamId}-${state.currentUser.id}`,
      teamId,
      userId: state.currentUser.id,
      role: "owner",
      state: "active",
      assignedProposalIds: [],
      assignedCaseIds: [],
      createdAt: now(),
      updatedAt: now(),
    });
    state.teamProfiles.push({
      id: team.profileId,
      kind: "team",
      workspaceId,
      teamId,
      name,
      introduction: input.introduction,
      valueProposition: "",
      expertise: input.expertise,
      industries: [],
      technologies: [],
      capacity: "در حال تکمیل",
      availability: "در حال شکل‌گیری",
      caseStudies: [],
      facilities: [],
      collaborationMode: "تعیین نشده",
      publicContact: input.publicContact,
      visibility: "members",
      updatedAt: now(),
    });
    state.teamSettings.push({
      teamId,
      publicContact: input.publicContact,
      visibility: "members",
      membershipPolicy: "invite-only",
      defaultInviteRole: "contributor",
      notificationPolicy: "owner",
      policy,
    });
    state.verifications.push({
      id: `VER-${teamId}`,
      subjectType: "team",
      subjectId: teamId,
      workspaceId,
      state: "not_started",
      documents: [
        {
          id: `DOC-${teamId}-FOUNDATION`,
          label:
            input.teamType === "lab"
              ? "مجوز آزمایشگاه"
              : input.teamType === "company"
                ? "مدرک ثبت شرکت"
                : input.teamType === "academic-group"
                  ? "معرفی‌نامه گروه دانشگاهی"
                  : "توافق اعضای تیم",
          state: "draft",
        },
      ],
      updatedAt: now(),
    });
    state.savedByWorkspace[workspaceId] = [];
    if (input.initialInviteEmail)
      state.invitations.push({
        id: id("INV"),
        teamId,
        inviterUserId: state.currentUser.id,
        recipientEmail: input.initialInviteEmail,
        proposedRole: "contributor",
        scope: "همکاری اولیه برای تکمیل تیم",
        message: `دعوت اولیه برای پیوستن به ${name}`,
        commitment: "پس از پذیرش هماهنگ می‌شود",
        ipNotice: "شرایط مالکیت فکری پیش از پذیرش دعوت قابل مشاهده است.",
        state: "sent",
        createdAt: now(),
        updatedAt: now(),
        expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      });
    return receipt(state, workspaceId, teamId, "create-team");
  });
}

export function sendTeamInvitation(
  context: ActiveWorkspace,
  input: Pick<
    TeamInvitation,
    "recipientEmail" | "proposedRole" | "scope" | "message" | "commitment" | "ipNotice"
  > & { relatedEntityId?: string },
): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "دعوت عضو فقط از فضای تیمی ممکن است.");
    const permission = teamPermission(context, "invite-member", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    if (!/^\S+@\S+\.\S+$/.test(input.recipientEmail))
      return fail("VALIDATION", "ایمیل دعوت معتبر نیست.");
    const invitationId = id("INV");
    state.invitations.push({
      id: invitationId,
      teamId: context.teamId,
      inviterUserId: state.currentUser.id,
      ...input,
      state: "sent",
      createdAt: now(),
      updatedAt: now(),
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    return receipt(state, context.workspaceId, invitationId, "send-team-invitation");
  });
}

export function revokeTeamInvitation(context: ActiveWorkspace, invitationId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "لغو دعوت فقط در فضای تیم ممکن است.");
    const permission = teamPermission(context, "invite-member", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const invitation = state.invitations.find(
      (candidate) => candidate.id === invitationId && candidate.teamId === context.teamId,
    );
    if (!invitation) return fail("NOT_FOUND", "دعوت‌نامه در این تیم پیدا نشد.");
    if (!["sent", "viewed"].includes(invitation.state))
      return fail("INVALID_STATE", "فقط دعوت pending قابل لغو است.");
    invitation.state = "revoked";
    invitation.updatedAt = now();
    return receipt(state, context.workspaceId, invitation.id, "revoke-team-invitation");
  });
}

export function resendTeamInvitation(context: ActiveWorkspace, invitationId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "ارسال دوباره فقط در فضای تیم ممکن است.");
    const permission = teamPermission(context, "invite-member", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const invitation = state.invitations.find(
      (candidate) => candidate.id === invitationId && candidate.teamId === context.teamId,
    );
    if (!invitation) return fail("NOT_FOUND", "دعوت‌نامه در این تیم پیدا نشد.");
    if (!["sent", "viewed", "expired"].includes(invitation.state))
      return fail("INVALID_STATE", "این دعوت قابل ارسال دوباره نیست.");
    invitation.state = "sent";
    invitation.expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    invitation.updatedAt = now();
    return receipt(state, context.workspaceId, invitation.id, "resend-team-invitation");
  });
}

export function requestTeamMembership(
  teamId: string,
  input: Pick<MembershipRequest, "requestedRole" | "introduction" | "resumeFileName" | "availability">,
): MutationResult {
  return updateState((state) => {
    const team = state.teams.find((candidate) => candidate.id === teamId && candidate.status === "active");
    if (!team) return fail("NOT_FOUND", "تیم فعال پیدا نشد.");
    if (state.memberships.some((membership) => membership.teamId === teamId && membership.userId === state.currentUser.id && membership.state === "active"))
      return fail("CONFLICT", "شما عضو فعال این تیم هستید.");
    if (input.introduction.trim().length < 20 || !input.resumeFileName || !input.availability)
      return fail("VALIDATION", "معرفی، رزومه و ظرفیت همکاری را کامل کنید.");
    const existing = state.membershipRequests.find(
      (request) => request.teamId === teamId && request.requesterUserId === state.currentUser.id && request.state === "requested",
    );
    if (existing) return fail("CONFLICT", "یک درخواست فعال برای این تیم دارید.");
    const requestId = id("REQ");
    state.membershipRequests.push({
      id: requestId,
      teamId,
      requesterUserId: state.currentUser.id,
      ...input,
      state: "requested",
      createdAt: now(),
      updatedAt: now(),
    });
    state.notifications.push({
      id: id("NOT"),
      recipientUserId: team.ownerUserId,
      recipientWorkspaceId: team.workspaceId,
      type: "membership_request",
      title: "درخواست عضویت تازه",
      body: `${state.currentUser.displayName} برای عضویت در ${team.name} درخواست ثبت کرد.`,
      entityId: requestId,
      deepLink: `/app/solver/invitations`,
      createdAt: now(),
      priority: "high",
      actionRequired: true,
    });
    return receipt(state, PERSONAL_WORKSPACE_ID, requestId, "request-team-membership");
  });
}

export function respondToTeamInvitation(
  invitationId: string,
  decision: "accepted" | "declined",
  reason = "",
): MutationResult {
  return updateState((state) => {
    const invitation = state.invitations.find((candidate) => candidate.id === invitationId);
    if (!invitation) return fail("NOT_FOUND", "دعوت‌نامه پیدا نشد.");
    if (invitation.recipientUserId !== state.currentUser.id)
      return fail("NO_ACCESS", "این دعوت برای کاربر فعلی صادر نشده است.");
    if (!["sent", "viewed"].includes(invitation.state))
      return fail("INVALID_STATE", "این دعوت قبلاً تعیین تکلیف شده است.");
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      invitation.state = "expired";
      return fail("INVALID_STATE", "مهلت دعوت‌نامه پایان یافته است.");
    }
    if (decision === "declined" && reason.trim().length < 10)
      return fail("VALIDATION", "برای رد دعوت، دلیل کوتاهی با حداقل ۱۰ کاراکتر بنویسید.");
    invitation.state = decision;
    invitation.decisionReason = decision === "declined" ? reason.trim() : undefined;
    invitation.updatedAt = now();
    const team = state.teams.find((candidate) => candidate.id === invitation.teamId);
    if (!team) return fail("NOT_FOUND", "تیم دعوت‌کننده پیدا نشد.");
    if (decision === "accepted") {
      const existing = state.memberships.find(
        (membership) =>
          membership.teamId === invitation.teamId && membership.userId === state.currentUser.id,
      );
      if (existing) {
        existing.state = "active";
        existing.role = invitation.proposedRole;
        existing.updatedAt = now();
      } else
        state.memberships.push({
          id: id("MEM"),
          teamId: invitation.teamId,
          userId: state.currentUser.id,
          role: invitation.proposedRole,
          state: "active",
          assignedProposalIds: [],
          assignedCaseIds: [],
          createdAt: now(),
          updatedAt: now(),
        });
    }
    state.notifications.push({
      id: id("NOT"),
      recipientUserId: invitation.inviterUserId,
      recipientWorkspaceId: team.workspaceId,
      type: "invitation_response",
      title: decision === "accepted" ? "دعوت عضویت پذیرفته شد" : "دعوت عضویت رد شد",
      body: `${state.currentUser.displayName} به دعوت ${team.name} پاسخ داد.`,
      entityId: invitation.id,
      deepLink: `/app/solver/teams/${team.id}`,
      createdAt: now(),
      priority: "normal",
      actionRequired: false,
    });
    return receipt(state, PERSONAL_WORKSPACE_ID, invitation.id, `team-invitation-${decision}`);
  });
}

export function reviewMembershipRequest(
  context: ActiveWorkspace,
  requestId: string,
  decision: "accepted" | "rejected",
  role?: Exclude<TeamRole, "owner">,
): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "بررسی درخواست فقط در فضای تیم است.");
    const permission = teamPermission(context, "review-membership-request", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const request = state.membershipRequests.find(
      (candidate) => candidate.id === requestId && candidate.teamId === context.teamId,
    );
    if (!request) return fail("NOT_FOUND", "درخواست عضویت در این تیم پیدا نشد.");
    if (request.state !== "requested") return fail("INVALID_STATE", "درخواست قبلاً بررسی شده است.");
    request.state = decision;
    request.updatedAt = now();
    if (decision === "accepted")
      state.memberships.push({
        id: id("MEM"),
        teamId: context.teamId,
        userId: request.requesterUserId,
        role: role ?? request.requestedRole,
        state: "active",
        assignedProposalIds: [],
        assignedCaseIds: [],
        createdAt: now(),
        updatedAt: now(),
      });
    state.notifications.push({
      id: id("NOT"),
      recipientUserId: request.requesterUserId,
      recipientWorkspaceId: context.workspaceId,
      type: "membership_request",
      title: decision === "accepted" ? "درخواست عضویت پذیرفته شد" : "درخواست عضویت رد شد",
      body: `نتیجه درخواست عضویت ${request.id} ثبت شد.`,
      entityId: request.id,
      deepLink: `/app/solver/teams/${context.teamId}`,
      createdAt: now(),
      priority: "normal",
      actionRequired: false,
    });
    return receipt(state, context.workspaceId, request.id, `membership-request-${decision}`);
  });
}

export function changeMembershipRole(
  context: ActiveWorkspace,
  membershipId: string,
  role: Exclude<TeamRole, "owner">,
): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "تغییر نقش فقط در فضای تیم است.");
    const permission = teamPermission(context, "change-member-role", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const target = state.memberships.find(
      (membership) => membership.id === membershipId && membership.teamId === context.teamId,
    );
    if (!target) return fail("NOT_FOUND", "عضو تیم پیدا نشد.");
    if (target.role === "owner") return fail("INVALID_STATE", "نقش مالک فقط با انتقال مالکیت تغییر می‌کند.");
    if (target.role === "admin" && role !== "admin") {
      const guard = canRemoveMembership(state.memberships, target);
      if (!guard.allowed) return fail("INVALID_STATE", guard.reason);
    }
    target.role = role;
    target.updatedAt = now();
    return receipt(state, context.workspaceId, target.id, "change-team-role");
  });
}

export function removeTeamMembership(context: ActiveWorkspace, membershipId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "حذف عضو فقط در فضای تیم است.");
    const permission = teamPermission(context, "change-member-role", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const target = state.memberships.find(
      (membership) => membership.id === membershipId && membership.teamId === context.teamId,
    );
    if (!target) return fail("NOT_FOUND", "عضو تیم پیدا نشد.");
    const guard = canRemoveMembership(state.memberships, target);
    if (!guard.allowed) return fail("INVALID_STATE", guard.reason);
    target.state = "removed";
    target.updatedAt = now();
    return receipt(state, context.workspaceId, target.id, "remove-team-member");
  });
}

export function suspendTeamMembership(context: ActiveWorkspace, membershipId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "تعلیق عضو فقط در فضای تیم است.");
    const permission = teamPermission(context, "change-member-role", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const target = state.memberships.find(
      (membership) => membership.id === membershipId && membership.teamId === context.teamId,
    );
    if (!target) return fail("NOT_FOUND", "عضو تیم پیدا نشد.");
    if (target.id === context.membershipId)
      return fail("INVALID_STATE", "برای خروج خودتان از اقدام «خروج از تیم» استفاده کنید.");
    const guard = canRemoveMembership(state.memberships, target);
    if (!guard.allowed) return fail("INVALID_STATE", guard.reason);
    target.state = "suspended";
    target.updatedAt = now();
    return receipt(state, context.workspaceId, target.id, "suspend-team-member");
  });
}

export function restoreTeamMembership(context: ActiveWorkspace, membershipId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "بازگردانی عضو فقط در فضای تیم است.");
    const permission = teamPermission(context, "change-member-role", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const target = state.memberships.find(
      (membership) =>
        membership.id === membershipId &&
        membership.teamId === context.teamId &&
        membership.state === "suspended",
    );
    if (!target) return fail("NOT_FOUND", "عضو تعلیق‌شده پیدا نشد.");
    target.state = "active";
    target.updatedAt = now();
    return receipt(state, context.workspaceId, target.id, "restore-team-member");
  });
}

export function assignTeamMember(
  context: ActiveWorkspace,
  membershipId: string,
  target: { type: "proposal" | "case"; id: string },
): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "تخصیص عضو فقط در فضای تیم است.");
    const permission = teamPermission(context, "change-member-role", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const membership = state.memberships.find(
      (candidate) =>
        candidate.id === membershipId &&
        candidate.teamId === context.teamId &&
        candidate.state === "active",
    );
    if (!membership) return fail("NOT_FOUND", "عضو فعال تیم پیدا نشد.");
    if (membership.role === "viewer")
      return fail("NO_ACCESS", "مشاهده‌گر را نمی‌توان به اجرای پیشنهاد یا پرونده تخصیص داد.");
    const exists = target.type === "proposal"
      ? state.proposals.some(
          (proposal) => proposal.id === target.id && proposal.ownerWorkspaceId === context.workspaceId,
        )
      : state.cases.some(
          (caseRecord) => caseRecord.id === target.id && caseRecord.ownerWorkspaceId === context.workspaceId,
        );
    if (!exists) return fail("NOT_FOUND", "رکورد مقصد در این فضای کاری پیدا نشد.");
    const assignments = target.type === "proposal"
      ? membership.assignedProposalIds
      : membership.assignedCaseIds;
    if (!assignments.includes(target.id)) assignments.push(target.id);
    membership.updatedAt = now();
    return receipt(state, context.workspaceId, target.id, `assign-member-${target.type}`);
  });
}

export function leaveTeam(context: ActiveWorkspace): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "خروج فقط از فضای تیمی ممکن است.");
    const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
    if (!membership) return fail("NOT_FOUND", "عضویت فعال پیدا نشد.");
    if (membership.role === "owner")
      return fail("INVALID_STATE", "مالک پیش از خروج باید مالکیت را انتقال دهد.");
    membership.state = "removed";
    membership.updatedAt = now();
    return receipt(state, context.workspaceId, membership.id, "leave-team");
  });
}

export function archiveTeam(context: ActiveWorkspace): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "بایگانی فقط در فضای تیم ممکن است.");
    const permission = teamPermission(context, "archive-team", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const team = state.teams.find((candidate) => candidate.id === context.teamId);
    if (!team) return fail("NOT_FOUND", "تیم پیدا نشد.");
    team.status = "archived";
    return receipt(state, context.workspaceId, team.id, "archive-team");
  });
}

export function transferOwnership(context: ActiveWorkspace, membershipId: string): MutationResult {
  return updateState((state) => {
    if (context.type !== "team") return fail("NO_ACCESS", "انتقال مالکیت فقط در فضای تیم است.");
    const permission = teamPermission(context, "transfer-ownership", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const current = state.memberships.find((membership) => membership.id === context.membershipId);
    const next = state.memberships.find(
      (membership) =>
        membership.id === membershipId &&
        membership.teamId === context.teamId &&
        membership.state === "active",
    );
    const team = state.teams.find((candidate) => candidate.id === context.teamId);
    if (!current || !next || !team) return fail("NOT_FOUND", "عضو مقصد پیدا نشد.");
    if (next.id === current.id) return fail("VALIDATION", "مالک فعلی نمی‌تواند مقصد انتقال باشد.");
    current.role = "admin";
    next.role = "owner";
    current.updatedAt = now();
    next.updatedAt = now();
    team.ownerUserId = next.userId;
    return receipt(state, context.workspaceId, team.id, "transfer-team-ownership");
  });
}

export function directOffersForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.directOffers.filter((offer) => offer.recipientWorkspaceId === workspaceId);
}

export function directOfferById(offerId: string, workspaceId: string, state = readSolverState()) {
  return state.directOffers.find(
    (offer) => offer.id === offerId && offer.recipientWorkspaceId === workspaceId,
  );
}

export function viewDirectOffer(offerId: string, workspaceId: string): MutationResult {
  return updateState((state) => {
    const offer = directOfferById(offerId, workspaceId, state);
    if (!offer) return fail("NOT_FOUND", "پیشنهاد مستقیم در این فضای کاری پیدا نشد.");
    if (offer.state === "received") offer.state = "viewed";
    offer.viewedAt ??= now();
    offer.updatedAt = now();
    return receipt(state, workspaceId, offer.id, "view-direct-offer");
  });
}

export function startOfferResponse(offerId: string, workspaceId: string): MutationResult {
  return updateState((state) => {
    const offer = directOfferById(offerId, workspaceId, state);
    if (!offer) return fail("NOT_FOUND", "پیشنهاد مستقیم در این فضای کاری پیدا نشد.");
    if (["declined", "expired", "cancelled", "selected"].includes(offer.state))
      return fail("INVALID_STATE", "این پیشنهاد دیگر قابل پاسخ نیست.");
    let response = state.offerResponses.find(
      (candidate) => candidate.offerId === offerId && candidate.ownerWorkspaceId === workspaceId,
    );
    if (!response) {
      response = {
        id: id("RESP"),
        offerId,
        ownerWorkspaceId: workspaceId,
        version: 1,
        state: "draft",
        approach: "",
        budget: "",
        duration: "",
        attachmentNames: [],
        updatedAt: now(),
      };
      state.offerResponses.push(response);
    }
    offer.state = "response_draft";
    offer.viewedAt ??= now();
    offer.updatedAt = now();
    return receipt(state, workspaceId, response.id, "start-offer-response");
  });
}

export function saveOfferResponse(response: OfferResponse): MutationResult {
  return updateState((state) => {
    const current = state.offerResponses.find(
      (candidate) =>
        candidate.id === response.id && candidate.ownerWorkspaceId === response.ownerWorkspaceId,
    );
    if (!current) return fail("NOT_FOUND", "پیش‌نویس پاسخ پیدا نشد.");
    if (current.state === "submitted") return fail("INVALID_STATE", "نسخه ارسال‌شده قفل است.");
    Object.assign(current, clone(response), { version: current.version + 1, updatedAt: now() });
    return receipt(state, current.ownerWorkspaceId, current.id, "save-offer-response");
  });
}

export function submitOfferResponse(
  offerId: string,
  workspaceId: string,
  input: Pick<OfferResponse, "approach" | "budget" | "duration" | "attachmentNames">,
  idempotencyKey: string,
): MutationResult {
  return updateState((state) => {
    const previousSubmission = state.idempotency[idempotencyKey];
    if (previousSubmission)
      return receipt(state, workspaceId, previousSubmission.entityId, "submit-offer-response", idempotencyKey);
    const offer = directOfferById(offerId, workspaceId, state);
    if (!offer) return fail("NOT_FOUND", "پیشنهاد مستقیم در این فضای کاری پیدا نشد.");
    const team = state.teams.find((candidate) => candidate.workspaceId === workspaceId);
    if (team) {
      const membership = state.memberships.find(
        (candidate) => candidate.teamId === team.id && candidate.userId === state.currentUser.id && candidate.state === "active",
      );
      const permission = permissionForMembership("submit-proposal", team, membership);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    if (new Date(offer.deadline).getTime() <= Date.now()) {
      offer.state = "expired";
      return fail("INVALID_STATE", "مهلت ارسال پاسخ پایان یافته است.");
    }
    if (!input.approach.trim() || !input.budget.trim() || !input.duration.trim())
      return fail("VALIDATION", "رویکرد، بودجه و زمان اجرا را کامل کنید.");
    let response = state.offerResponses.find(
      (candidate) => candidate.offerId === offerId && candidate.ownerWorkspaceId === workspaceId,
    );
    if (!response) {
      response = {
        id: id("RESP"),
        offerId,
        ownerWorkspaceId: workspaceId,
        version: 1,
        state: "draft",
        approach: "",
        budget: "",
        duration: "",
        attachmentNames: [],
        updatedAt: now(),
      };
      state.offerResponses.push(response);
    }
    Object.assign(response, input, {
      state: "submitted" as const,
      version: response.version + 1,
      submittedAt: now(),
      trackingCode: `TRK-${response.id}-V${response.version + 1}`,
      updatedAt: now(),
    });
    offer.state = "response_submitted";
    offer.updatedAt = now();
    state.notifications.push({
      id: id("NOT"), recipientUserId: state.currentUser.id, recipientWorkspaceId: workspaceId,
      type: "direct_offer", title: "پاسخ پیشنهاد مستقیم ارسال شد",
      body: `نسخه پاسخ ${response.id} قفل و برای بررسی ارسال شد.`, entityId: offer.id,
      deepLink: `/app/solver/received-proposals/${offer.id}/respond`, readAt: now(), createdAt: now(),
      priority: "normal", actionRequired: false,
    });
    return receipt(state, workspaceId, response.id, "submit-offer-response", idempotencyKey);
  });
}

export function declineDirectOffer(offerId: string, workspaceId: string, reason: string): MutationResult {
  return updateState((state) => {
    const offer = directOfferById(offerId, workspaceId, state);
    if (!offer) return fail("NOT_FOUND", "پیشنهاد مستقیم در این فضای کاری پیدا نشد.");
    if (!reason.trim()) return fail("VALIDATION", "دلیل رد پیشنهاد را ثبت کنید.");
    if (["selected", "declined", "expired", "cancelled"].includes(offer.state))
      return fail("INVALID_STATE", "این پیشنهاد دیگر قابل رد نیست.");
    offer.state = "declined";
    offer.declineReason = reason.trim();
    offer.declinedAt = now();
    offer.updatedAt = now();
    state.notifications.push({
      id: id("NOT"), recipientUserId: state.currentUser.id, recipientWorkspaceId: workspaceId,
      type: "direct_offer", title: "پیشنهاد مستقیم رد شد", body: reason.trim(), entityId: offer.id,
      deepLink: "/app/solver/received-proposals", readAt: now(), createdAt: now(), priority: "normal", actionRequired: false,
    });
    return receipt(state, workspaceId, offer.id, `decline-direct-offer:${reason.trim()}`);
  });
}

export function notificationsForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.notifications
    .filter((notification) => notification.recipientWorkspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadNotificationCount(workspaceId: string, state = readSolverState()) {
  return notificationsForWorkspace(workspaceId, state).filter((notification) => !notification.readAt)
    .length;
}

export function markNotificationRead(
  workspaceId: string,
  notificationId?: string,
): MutationResult {
  return updateState((state) => {
    const targets = state.notifications.filter(
      (notification) =>
        notification.recipientWorkspaceId === workspaceId &&
        (!notificationId || notification.id === notificationId),
    );
    if (notificationId && !targets.length) return fail("NOT_FOUND", "اعلان پیدا نشد.");
    targets.forEach((notification) => (notification.readAt ??= now()));
    return receipt(state, workspaceId, notificationId ?? workspaceId, "mark-notification-read");
  });
}

export function saveAccountSettings(settings: AccountSettings): MutationResult {
  return updateState((state) => {
    state.accountSettings = clone(settings);
    return receipt(state, state.personalWorkspace.id, state.currentUser.id, "save-account-settings");
  });
}

export function saveTeamSettings(context: ActiveWorkspace, settings: TeamSettings): MutationResult {
  return updateState((state) => {
    if (context.type !== "team" || context.teamId !== settings.teamId)
      return fail("NO_ACCESS", "تنظیمات به فضای تیم فعال تعلق ندارد.");
    const permission = teamPermission(context, "manage-team-settings", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const current = state.teamSettings.find((candidate) => candidate.teamId === context.teamId);
    if (!current) return fail("NOT_FOUND", "تنظیمات تیم پیدا نشد.");
    Object.assign(current, clone(settings));
    const team = state.teams.find((candidate) => candidate.id === context.teamId);
    if (team) team.policy = clone(settings.policy);
    return receipt(state, context.workspaceId, context.teamId, "save-team-settings");
  });
}

export function savePersonalProfile(profile: PersonalProfile): MutationResult {
  return updateState((state) => {
    if (profile.workspaceId !== state.personalWorkspace.id)
      return fail("NO_ACCESS", "پروفایل به فضای شخصی فعلی تعلق ندارد.");
    const index = state.personalProfiles.findIndex((candidate) => candidate.id === profile.id);
    const next = { ...clone(profile), displayName: state.currentUser.displayName, updatedAt: now() };
    if (index >= 0) state.personalProfiles[index] = next;
    else state.personalProfiles.push(next);
    return receipt(state, profile.workspaceId, profile.id, "save-personal-profile");
  });
}

export function saveTeamProfile(context: ActiveWorkspace, profile: TeamProfile): MutationResult {
  return updateState((state) => {
    if (context.type !== "team" || context.teamId !== profile.teamId)
      return fail("NO_ACCESS", "پروفایل به تیم فعال تعلق ندارد.");
    const permission = teamPermission(context, "edit-team-profile", {}, state);
    if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    const index = state.teamProfiles.findIndex((candidate) => candidate.teamId === context.teamId);
    const next = { ...clone(profile), updatedAt: now() };
    if (index >= 0) state.teamProfiles[index] = next;
    else state.teamProfiles.push(next);
    return receipt(state, context.workspaceId, profile.id, "save-team-profile");
  });
}

export function submitVerification(
  workspaceId: string,
  documentNames: string[],
  context?: ActiveWorkspace,
): MutationResult {
  return updateState((state) => {
    const team = state.teams.find((candidate) => candidate.workspaceId === workspaceId);
    if (team) {
      if (!context || context.type !== "team" || context.teamId !== team.id)
        return fail("NO_ACCESS", "احراز تیم فقط از workspace همان تیم قابل ارسال است.");
      const membership = state.memberships.find(
        (candidate) =>
          candidate.id === context.membershipId &&
          candidate.teamId === team.id &&
          candidate.userId === state.currentUser.id &&
          candidate.state === "active",
      );
      if (!membership || !["owner", "admin"].includes(membership.role))
        return fail("NO_ACCESS", "فقط مالک یا مدیر می‌تواند مدارک احراز تیم را ارسال کند.");
    }
    const verification = state.verifications.find((candidate) => candidate.workspaceId === workspaceId);
    if (!verification) return fail("NOT_FOUND", "پرونده احراز این فضا پیدا نشد.");
    if (!documentNames.length) return fail("VALIDATION", "حداقل یک مدرک معتبر لازم است.");
    verification.state = "submitted";
    verification.documents.forEach((document, index) => {
      document.fileName = documentNames[index] ?? document.fileName;
      document.state = "submitted";
      delete document.reason;
    });
    verification.submittedAt = now();
    verification.updatedAt = now();
    return receipt(state, workspaceId, verification.id, "submit-verification");
  });
}

export function acceptNda(
  context: ActiveWorkspace,
  entityId: string,
  version: string,
  idempotencyKey: string,
): MutationResult {
  return updateState((state) => {
    if (context.type === "team") {
      const team = state.teams.find(
        (candidate) =>
          candidate.id === context.teamId && candidate.workspaceId === context.workspaceId,
      );
      if (!team) return fail("NO_ACCESS", "فضای کاری با تیم فعال سازگار نیست.");
      const membership = state.memberships.find(
        (candidate) =>
          candidate.id === context.membershipId &&
          candidate.teamId === context.teamId &&
          candidate.userId === state.currentUser.id &&
          candidate.state === "active",
      );
      if (!membership || !["owner", "admin", "proposal-manager"].includes(membership.role))
        return fail("NO_ACCESS", "پذیرش NDA تیم به مالک، مدیر یا مدیر پیشنهاد محدود است.");
    } else if (context.workspaceId !== state.personalWorkspace.id)
      return fail("NO_ACCESS", "فضای فردی درخواست‌شده متعلق به کاربر جاری نیست.");
    const existing = state.ndaAcceptances.find(
      (nda) =>
        nda.workspaceId === context.workspaceId &&
        nda.entityId === entityId &&
        nda.version === version &&
        nda.state === "active",
    );
    if (!existing)
      state.ndaAcceptances.push({
        id: id("NDA"),
        workspaceId: context.workspaceId,
        entityId,
        version,
        actorUserId: state.currentUser.id,
        acceptedAt: now(),
        expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        state: "active",
      });
    return receipt(state, context.workspaceId, entityId, "accept-nda", idempotencyKey);
  });
}

export function canAccessRestrictedDocument(workspaceId: string, entityId: string, state = readSolverState()) {
  return state.ndaAcceptances.some(
    (nda) =>
      nda.workspaceId === workspaceId &&
      nda.entityId === entityId &&
      nda.state === "active" &&
      new Date(nda.expiresAt).getTime() > Date.now(),
  );
}

export function createContractVersion(context: ActiveWorkspace, contractId: string): MutationResult {
  return updateState((state) => {
    const contract = state.contracts.find(
      (candidate) =>
        candidate.id === contractId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!contract) return fail("NOT_FOUND", "قرارداد در این فضای کاری پیدا نشد.");
    if (context.type === "team") {
      const permission = teamPermission(context, "approve-contract", {}, state);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    contract.version += 1;
    contract.state = "negotiation";
    contract.approvals = [];
    delete contract.signedAt;
    delete contract.effectiveAt;
    contract.updatedAt = now();
    return receipt(state, context.workspaceId, contract.id, "create-contract-version");
  });
}

export function approveContract(context: ActiveWorkspace, contractId: string): MutationResult {
  return updateState((state) => {
    const contract = state.contracts.find(
      (candidate) =>
        candidate.id === contractId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!contract) return fail("NOT_FOUND", "قرارداد در این فضای کاری پیدا نشد.");
    if (context.type === "team") {
      const permission = teamPermission(context, "approve-contract", {}, state);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    if (!["negotiation", "approval"].includes(contract.state))
      return fail("INVALID_STATE", "نسخه فعلی قرارداد در مرحله تأیید نیست.");
    if (!contract.approvals.some((approval) => approval.version === contract.version))
      contract.approvals.push({
        version: contract.version,
        actorUserId: state.currentUser.id,
        approvedAt: now(),
      });
    contract.state = "signature";
    contract.updatedAt = now();
    return receipt(state, context.workspaceId, contract.id, "approve-contract");
  });
}

export function signContract(
  context: ActiveWorkspace,
  contractId: string,
  idempotencyKey: string,
): MutationResult {
  return updateState((state) => {
    if (state.idempotency[idempotencyKey])
      return receipt(state, context.workspaceId, contractId, "sign-contract", idempotencyKey);
    const contract = state.contracts.find(
      (candidate) =>
        candidate.id === contractId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!contract) return fail("NOT_FOUND", "قرارداد در این فضای کاری پیدا نشد.");
    if (context.type === "team") {
      const permission = teamPermission(context, "approve-contract", {}, state);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    if (contract.state !== "signature")
      return fail("INVALID_STATE", "قرارداد فقط پس از تأیید نسخه جاری قابل امضا است.");
    if (!contract.approvals.some((approval) => approval.version === contract.version))
      return fail("INVALID_STATE", "تأیید معتبر برای نسخه جاری قرارداد وجود ندارد.");
    contract.signedAt = now();
    contract.effectiveAt = contract.signedAt;
    contract.state = "effective";
    contract.updatedAt = contract.signedAt;
    return receipt(state, context.workspaceId, contract.id, "sign-contract", idempotencyKey);
  });
}

export function closeCase(
  context: ActiveWorkspace,
  caseId: string,
  idempotencyKey: string,
): MutationResult {
  return updateState((state) => {
    if (state.idempotency[idempotencyKey])
      return receipt(state, context.workspaceId, caseId, "close-case", idempotencyKey);
    const caseRecord = state.cases.find(
      (candidate) => candidate.id === caseId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!caseRecord) return fail("NOT_FOUND", "پرونده همکاری پیدا نشد.");
    if (context.type === "team") {
      const permission = teamPermission(context, "approve-contract", {}, state);
      if (!permission.allowed) return fail("NO_ACCESS", permission.reason);
    }
    if (caseRecord.state !== "completed")
      return fail("INVALID_STATE", "فقط پرونده تکمیل‌شده قابل بستن است.");
    if (!caseRecord.deliverables.every((deliverable) => deliverable.state === "accepted"))
      return fail("INVALID_STATE", "همه تحویل‌دادنی‌ها باید پذیرفته شده باشند.");
    if (!caseRecord.payments.every((payment) => payment.state === "paid"))
      return fail("INVALID_STATE", "پیش از بستن پرونده، پرداخت‌های باز باید تسویه شوند.");
    const contract = state.contracts.find((candidate) => candidate.id === caseRecord.contractId);
    if (contract?.state !== "effective")
      return fail("INVALID_STATE", "قرارداد مؤثر برای بستن پرونده لازم است.");
    caseRecord.state = "closed";
    caseRecord.closedAt = now();
    return receipt(state, context.workspaceId, caseRecord.id, "close-case", idempotencyKey);
  });
}

export function submitCaseFeedback(
  context: ActiveWorkspace,
  caseId: string,
  outcome: string,
  comment: string,
): MutationResult {
  return updateState((state) => {
    const caseRecord = state.cases.find(
      (candidate) => candidate.id === caseId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!caseRecord) return fail("NOT_FOUND", "پرونده همکاری پیدا نشد.");
    if (caseRecord.feedback) return fail("CONFLICT", "بازخورد این پرونده قبلاً ثبت شده است.");
    if (caseRecord.state !== "completed" && caseRecord.state !== "closed")
      return fail("INVALID_STATE", "بازخورد پس از تکمیل پرونده ثبت می‌شود.");
    caseRecord.feedback = {
      id: id("FDB"),
      actorUserId: state.currentUser.id,
      outcome,
      comment,
      createdAt: now(),
    };
    return receipt(state, context.workspaceId, caseRecord.id, "submit-case-feedback");
  });
}

export function sendCaseMessage(
  context: ActiveWorkspace,
  caseId: string,
  body: string,
): MutationResult {
  return updateState((state) => {
    const caseRecord = state.cases.find(
      (candidate) => candidate.id === caseId && candidate.ownerWorkspaceId === context.workspaceId,
    );
    if (!caseRecord) return fail("NOT_FOUND", "پرونده همکاری در این workspace پیدا نشد.");
    if (context.type === "team") {
      const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
      const assigned = membership?.assignedCaseIds.includes(caseId) ?? false;
      const permission = teamPermission(context, "view-case-messages", { assigned }, state);
      if (!permission.allowed || membership?.role === "viewer")
        return fail("NO_ACCESS", permission.allowed ? "مشاهده‌گر اجازه ارسال پیام ندارد." : permission.reason);
    }
    if (body.trim().length < 2) return fail("VALIDATION", "متن پیام را وارد کنید.");
    const messageId = id("MSG");
    caseRecord.messages.push({ id: messageId, actorUserId: state.currentUser.id, body: body.trim(), createdAt: now(), readAt: now() });
    return receipt(state, context.workspaceId, messageId, "send-case-message");
  });
}

export function updatePilotTask(
  context: ActiveWorkspace,
  caseId: string,
  taskId: string,
  done: boolean,
): MutationResult {
  return updateState((state) => {
    const caseRecord = state.cases.find((candidate) => candidate.id === caseId && candidate.ownerWorkspaceId === context.workspaceId);
    if (!caseRecord) return fail("NOT_FOUND", "پرونده همکاری پیدا نشد.");
    if (context.type === "team") {
      const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
      const allowed = membership && membership.role !== "viewer" && (membership.role !== "contributor" || membership.assignedCaseIds.includes(caseId));
      if (!allowed) return fail("NO_ACCESS", "این نقش اجازه تغییر وظیفه پایلوت را ندارد.");
    }
    const task = caseRecord.pilot.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return fail("NOT_FOUND", "وظیفه پایلوت پیدا نشد.");
    task.done = done;
    if (caseRecord.pilot.tasks.every((candidate) => candidate.done)) caseRecord.pilot.state = "completed";
    return receipt(state, context.workspaceId, task.id, "update-pilot-task");
  });
}

export function submitDeliverable(
  context: ActiveWorkspace,
  caseId: string,
  deliverableId: string,
  fileName: string,
): MutationResult {
  return updateState((state) => {
    const caseRecord = state.cases.find((candidate) => candidate.id === caseId && candidate.ownerWorkspaceId === context.workspaceId);
    if (!caseRecord) return fail("NOT_FOUND", "پرونده همکاری پیدا نشد.");
    if (context.type === "team") {
      const membership = state.memberships.find((candidate) => candidate.id === context.membershipId);
      if (!membership || membership.role === "viewer" || (membership.role === "contributor" && !membership.assignedCaseIds.includes(caseId)))
        return fail("NO_ACCESS", "نقش فعلی اجازه ارسال تحویل‌دادنی را ندارد.");
    }
    if (!/\.pdf$/i.test(fileName)) return fail("VALIDATION", "فایل تحویل نمونه باید PDF باشد.");
    const deliverable = caseRecord.deliverables.find((candidate) => candidate.id === deliverableId);
    if (!deliverable) return fail("NOT_FOUND", "تحویل‌دادنی پیدا نشد.");
    if (["accepted", "submitted"].includes(deliverable.state)) return fail("INVALID_STATE", "این نسخه قابل ارسال نیست.");
    deliverable.fileName = fileName;
    deliverable.state = "submitted";
    deliverable.updatedAt = now();
    state.notifications.push({
      id: id("NOT"), recipientUserId: state.currentUser.id, recipientWorkspaceId: context.workspaceId,
      type: "deliverable", title: "تحویل‌دادنی ارسال شد", body: deliverable.title,
      entityId: deliverable.id, deepLink: `/app/solver/cases/${caseId}/pilot`, readAt: now(), createdAt: now(),
      priority: "normal", actionRequired: false,
    });
    return receipt(state, context.workspaceId, deliverable.id, "submit-deliverable");
  });
}

export function proposalDraftTemplate(): ProposalContent {
  return clone(EMPTY_PROPOSAL_CONTENT);
}

export type SolverRepositorySnapshot = ReturnType<typeof readSolverState>;
export type SolverWorkspaceProjection = {
  proposals: Proposal[];
  offers: DirectOffer[];
  notifications: SolverNotification[];
  requests: MembershipRequest[];
};

export function workspaceProjection(workspaceId: string, state = readSolverState()): SolverWorkspaceProjection {
  const team = state.teams.find((candidate) => candidate.workspaceId === workspaceId);
  return {
    proposals: proposalsForWorkspace(workspaceId, state),
    offers: directOffersForWorkspace(workspaceId, state),
    notifications: notificationsForWorkspace(workspaceId, state),
    requests: team
      ? state.membershipRequests.filter((request) => request.teamId === team.id)
      : [],
  };
}

export type { AccountSettings, DirectOffer, OfferResponse, TeamSettings };
