import type { ChallengePublicProjectionResource, DirectOfferResource } from "@rahhal/contracts";

import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * A saved opportunity, joined to the published call it refers to.
 *
 * The saved row itself carries only ids and a timestamp — a save is a pointer,
 * not a copy — so the title, deadline, and budget come from B5's public
 * projection at read time. A call that has stopped being publicly readable
 * keeps its row with `challenge` null: the human still sees that they saved
 * something and can unsave it, which is truer than dropping the row silently.
 */
export type SavedOpportunityRow = {
  readonly id: string;
  readonly challengeId: string;
  readonly savedAt: string;
  readonly version: 1;
  readonly challenge: ChallengePublicProjectionResource | null;
};

export type SavedOpportunityView = {
  readonly rows: readonly SavedOpportunityRow[];
  readonly error: GatewayFailure | null;
};

export async function readSavedOpportunities(
  gateways: WorkspaceGateways,
): Promise<SavedOpportunityView> {
  const result = await gateways.savedOpportunities.list();
  if (!result.ok) return { rows: [], error: result.error };
  const rows = await Promise.all(
    result.data.items.map(async (item) => {
      const challenge = await readPublicChallenge(item.challenge_id);
      return {
        id: item.id,
        challengeId: item.challenge_id,
        savedAt: item.saved_at,
        version: item.version,
        challenge: challenge.ok ? challenge.data : null,
      };
    }),
  );
  return { rows, error: null };
}

export function savedOpportunitiesScopeLost(view: SavedOpportunityView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}

/**
 * Direct offers addressed to the active workspace.
 *
 * The list already carries everything an offer card shows, including the
 * response when the workspace is allowed to see it, so no second read is
 * needed. The challenge behind an offer is deliberately not fetched here: an
 * offer names its own title and summary, and a recipient's access to the call
 * is the grant the offer created, not the public projection.
 */
export type DirectOfferView = {
  readonly offers: readonly DirectOfferResource[];
  readonly error: GatewayFailure | null;
};

export async function readDirectOffers(gateways: WorkspaceGateways): Promise<DirectOfferView> {
  const result = await gateways.directOffers.list();
  if (!result.ok) return { offers: [], error: result.error };
  return { offers: result.data.items, error: null };
}

export function directOffersScopeLost(view: DirectOfferView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}
