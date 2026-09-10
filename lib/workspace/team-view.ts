import type {
  TeamInvitationResource,
  TeamMembershipRequestResource,
  TeamResource,
} from "@rahhal/contracts";

import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * Everything the connected team pages read, in one pass.
 *
 * The four collections are separate authorization questions on the server —
 * the active team, invitations it sent, requests addressed to it, and the
 * invitations and requests belonging to *this human* across teams — so each
 * one records its own failure. A workspace that is not a team has no team to
 * read, and that is an ordinary answer here rather than an error: the
 * individual workspace still receives invitations.
 */
export type TeamView = {
  readonly team: TeamResource | null;
  readonly sentInvitations: readonly TeamInvitationResource[];
  readonly incomingInvitations: readonly TeamInvitationResource[];
  readonly incomingRequests: readonly TeamMembershipRequestResource[];
  readonly ownRequests: readonly TeamMembershipRequestResource[];
  readonly failures: readonly { readonly family: string; readonly error: GatewayFailure }[];
};

/** A failed family must not render its empty-state as though the server returned an empty list. */
export function teamFamilyAvailable(view: TeamView, family: string): boolean {
  return !view.failures.some((failure) => failure.family === family);
}

/**
 * A denied optional management family is an unavailable affordance, not a page error.
 * Other failures remain visible so a transient backend problem can still be retried.
 */
export function teamFailureNeedsAttention(failure: TeamView["failures"][number]): boolean {
  return failure.error.code !== "NO_ACCESS";
}

export async function readTeamView(
  gateways: WorkspaceGateways,
  includeActiveTeam = true,
): Promise<TeamView> {
  if (!includeActiveTeam) {
    const [incoming, own] = await Promise.all([
      gateways.team.incomingInvitations(),
      gateways.team.ownRequests(),
    ]);
    const failures: { family: string; error: GatewayFailure }[] = [];
    if (!incoming.ok) failures.push({ family: "incomingInvitations", error: incoming.error });
    if (!own.ok) failures.push({ family: "ownRequests", error: own.error });
    return {
      team: null,
      sentInvitations: [],
      incomingInvitations: incoming.ok ? incoming.data : [],
      incomingRequests: [],
      ownRequests: own.ok ? own.data : [],
      failures,
    };
  }

  const [team, sent, incoming, requests, own] = await Promise.all([
    gateways.team.read(),
    gateways.team.sentInvitations(),
    gateways.team.incomingInvitations(),
    gateways.team.incomingRequests(),
    gateways.team.ownRequests(),
  ]);

  const failures: { family: string; error: GatewayFailure }[] = [];
  // A team read denied because the active workspace is an individual one is
  // the expected answer there, not a failure worth showing: the human still
  // needs the invitation and request lists that did load.
  if (!team.ok && team.error.code !== "NO_ACCESS" && team.error.code !== "NOT_FOUND") {
    failures.push({ family: "team", error: team.error });
  }
  if (!sent.ok && team.ok) failures.push({ family: "sentInvitations", error: sent.error });
  if (!incoming.ok) failures.push({ family: "incomingInvitations", error: incoming.error });
  if (!requests.ok && team.ok) failures.push({ family: "requests", error: requests.error });
  if (!own.ok) failures.push({ family: "ownRequests", error: own.error });

  return {
    team: team.ok ? team.data : null,
    sentInvitations: sent.ok ? sent.data : [],
    incomingInvitations: incoming.ok ? incoming.data : [],
    incomingRequests: requests.ok ? requests.data : [],
    ownRequests: own.ok ? own.data : [],
    failures,
  };
}

/**
 * Scope is lost only when even this human's own invitation list is denied.
 *
 * That list is workspace-independent, so a denial there means the session no
 * longer holds — unlike a denied team read, which is the normal answer for an
 * individual workspace and must not eject the human from the page.
 */
export function teamViewScopeLost(view: TeamView): boolean {
  return view.failures.some(
    (failure) =>
      failure.family === "incomingInvitations" &&
      (failure.error.code === "NO_ACCESS" || failure.error.code === "ACTIVATION_REQUIRED"),
  );
}
