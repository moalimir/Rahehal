import { EMPTY_PROPOSAL_CONTENT } from "@/data/solver-fixtures";
import type {
  DirectOffer,
  MembershipRequest,
  Proposal,
  ProposalContent,
  SolverNotification,
} from "@/domain/solver";
import { clone } from "@/lib/solver/repository/primitives";
import { readSolverState } from "@/lib/solver/repository/storage";

export function savedOpportunityIds(workspaceId: string, state = readSolverState()) {
  return [...(state.savedByWorkspace[workspaceId] ?? [])];
}

export function proposalsForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.proposals.filter((proposal) => proposal.ownerWorkspaceId === workspaceId);
}

export function proposalById(proposalId: string, workspaceId?: string, state = readSolverState()) {
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal || (workspaceId && proposal.ownerWorkspaceId !== workspaceId)) return undefined;
  return proposal;
}

export function proposalContent(
  proposalId: string,
  workspaceId: string,
  state = readSolverState(),
) {
  const proposal = proposalById(proposalId, workspaceId, state);
  if (!proposal) return undefined;
  return state.proposalVersions.find((version) => version.id === proposal.currentVersionId)
    ?.content;
}

export function readProposalDraft(
  challengeId: string,
  workspaceId: string,
  state = readSolverState(),
) {
  return state.proposalDrafts.find(
    (draft) => draft.challengeId === challengeId && draft.ownerWorkspaceId === workspaceId,
  );
}

export function directOffersForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.directOffers.filter((offer) => offer.recipientWorkspaceId === workspaceId);
}

export function directOfferById(offerId: string, workspaceId: string, state = readSolverState()) {
  return state.directOffers.find(
    (offer) => offer.id === offerId && offer.recipientWorkspaceId === workspaceId,
  );
}

export function notificationsForWorkspace(workspaceId: string, state = readSolverState()) {
  return state.notifications
    .filter((notification) => notification.recipientWorkspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadNotificationCount(workspaceId: string, state = readSolverState()) {
  return notificationsForWorkspace(workspaceId, state).filter(
    (notification) => !notification.readAt,
  ).length;
}

export function canAccessRestrictedDocument(
  workspaceId: string,
  entityId: string,
  state = readSolverState(),
) {
  return state.ndaAcceptances.some(
    (nda) =>
      nda.workspaceId === workspaceId &&
      nda.entityId === entityId &&
      nda.state === "active" &&
      new Date(nda.expiresAt).getTime() > Date.now(),
  );
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

export function workspaceProjection(
  workspaceId: string,
  state = readSolverState(),
): SolverWorkspaceProjection {
  const team = state.teams.find((candidate) => candidate.workspaceId === workspaceId);
  return {
    proposals: proposalsForWorkspace(workspaceId, state),
    offers: directOffersForWorkspace(workspaceId, state),
    notifications: notificationsForWorkspace(workspaceId, state),
    requests: team ? state.membershipRequests.filter((request) => request.teamId === team.id) : [],
  };
}
