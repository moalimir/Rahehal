import {
  CURRENT_SOLVER_USER_ID,
  DEFAULT_TEAM_POLICY,
  EMPTY_PROPOSAL_CONTENT,
  PERSONAL_WORKSPACE_ID,
} from "@/data/solver-fixtures";
import type { ProposalContent, SolverState, SolverTeam } from "@/domain/solver";
import { isTeamKind } from "@/domain/taxonomy";
import {
  SOLVER_PREVIOUS_STORE_VERSION,
  SOLVER_STORE_VERSION,
} from "@/lib/solver/repository/constants";
import { clone, now, storageAvailable } from "@/lib/solver/repository/primitives";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasStateShape(value: unknown, version: number): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const currentUser = value.currentUser;
  return (
    value.version === version &&
    isRecord(currentUser) &&
    currentUser.id === CURRENT_SOLVER_USER_ID &&
    Array.isArray(value.teams) &&
    Array.isArray(value.memberships) &&
    Array.isArray(value.proposals) &&
    Array.isArray(value.directOffers) &&
    isRecord(value.savedByWorkspace)
  );
}

function normalizeTeam(value: unknown): SolverTeam | null {
  if (!isRecord(value)) return null;
  const candidate = value.teamKind ?? value.teamType;
  if (!isTeamKind(candidate)) return null;
  const normalized: Record<string, unknown> = { ...value, teamKind: candidate };
  delete normalized.teamType;
  return normalized as SolverTeam;
}

function normalizeState(value: unknown, version: number): SolverState | null {
  if (!hasStateShape(value, version)) return null;
  const teams = (value.teams as unknown[]).map(normalizeTeam);
  if (teams.some((team) => team === null)) return null;
  return {
    ...value,
    version: SOLVER_STORE_VERSION,
    teams: teams as SolverTeam[],
  } as SolverState;
}

export function normalizeCurrentSolverState(value: unknown): SolverState | null {
  return normalizeState(value, SOLVER_STORE_VERSION);
}

export function migrateSolverStateV3(value: unknown): SolverState | null {
  return normalizeState(value, SOLVER_PREVIOUS_STORE_VERSION);
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
    problemStatement: [value.executiveSummary, value.problemUnderstanding]
      .filter(Boolean)
      .join("\n"),
    valueProposition: value.value ?? "",
    maturityLevel: value.stage ?? "",
    prototypeWeeks: value.prototypeWeeks ?? "",
    technologies: (value.technologies ?? "")
      .split(/[،,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    technicalApproach: value.technicalApproach ?? "",
    architecture: value.architecture ?? "",
    dataNeeds: value.requiredData ?? "",
    successMetrics: value.successMetrics ?? "",
    ipStatus: value.ipStatus ?? "",
    durationWeeks: value.durationWeeks ?? "",
    roadmap: value.milestones ?? "",
    dependencies: [value.dependencies, value.pilotLocation && `محل پایلوت: ${value.pilotLocation}`]
      .filter(Boolean)
      .join("\n"),
    pilotLocation: value.pilotLocation ?? "",
    risks: [value.risks, value.mitigation && `برنامه کنترل: ${value.mitigation}`]
      .filter(Boolean)
      .join("\n"),
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
      if (existing)
        Object.assign(existing, migratedDraft, { id: existing.id, version: existing.version + 1 });
      else state.proposalDrafts.push(migratedDraft);
    } catch {
      // Malformed legacy proposal data is isolated and ignored.
    }
  }
}

export function migrateLegacy(seed: SolverState): SolverState {
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
          teamKind: "expert-team",
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
