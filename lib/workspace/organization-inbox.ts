import type {
  ChallengePublicProjectionResource,
  OrganizationProposalInboxItemResource,
  OrganizationProposalResource,
} from "@rahhal/contracts";

import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * The organization's grant-scoped proposal inbox.
 *
 * Rows carry no proposal content — the inbox resource is closed on purpose,
 * and content is only available through the per-record grant-scoped read — so
 * this view adds the challenge title and nothing else. There is no score, no
 * budget, and no solver name: none of those is a fact the inbox is entitled
 * to, and the fixture inbox that showed all three is what C9 replaces.
 */
export type OrganizationInboxRow = {
  readonly item: OrganizationProposalInboxItemResource;
  readonly challenge: ChallengePublicProjectionResource | null;
};

export type OrganizationInboxView = {
  readonly rows: readonly OrganizationInboxRow[];
  readonly error: GatewayFailure | null;
};

export async function readOrganizationInbox(
  gateways: WorkspaceGateways,
): Promise<OrganizationInboxView> {
  const result = await gateways.organizationProposals.inbox();
  if (!result.ok) return { rows: [], error: result.error };
  const distinct = [...new Set(result.data.items.map((item) => item.challenge_id))];
  const resolved = await Promise.all(
    distinct.map(async (id) => {
      const challenge = await readPublicChallenge(id);
      return [id, challenge.ok ? challenge.data : null] as const;
    }),
  );
  const challenges = new Map(resolved);
  return {
    rows: result.data.items.map((item) => ({
      item,
      challenge: challenges.get(item.challenge_id) ?? null,
    })),
    error: null,
  };
}

export function organizationInboxScopeLost(view: OrganizationInboxView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}

/** One received proposal, opened through the grant C4 created at submission. */
export type OrganizationProposalView = {
  readonly proposal: OrganizationProposalResource | null;
  readonly challenge: ChallengePublicProjectionResource | null;
  readonly error: GatewayFailure | null;
};

export function readOrganizationProposal(
  proposalId: string,
): (gateways: WorkspaceGateways) => Promise<OrganizationProposalView> {
  return async (gateways) => {
    const result = await gateways.organizationProposals.get(proposalId);
    if (!result.ok) return { proposal: null, challenge: null, error: result.error };
    const challenge = await readPublicChallenge(result.data.challenge_id);
    return {
      proposal: result.data,
      challenge: challenge.ok ? challenge.data : null,
      error: null,
    };
  };
}

export function organizationProposalScopeLost(view: OrganizationProposalView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}
