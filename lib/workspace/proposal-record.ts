import type { ProposalResource } from "@rahhal/contracts";

import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * One connected proposal record.
 *
 * The record read is where proposal content lives; the list deliberately
 * carries none. `challengeTitle` comes from the public projection rather than
 * the fixture catalogue, and is `null` when the challenge is no longer
 * publicly readable — the page then shows the opaque id, which is true, in
 * place of a title that would be invented.
 */
export type ProposalRecordView = {
  readonly proposal: ProposalResource | null;
  readonly challengeTitle: string | null;
  readonly error: GatewayFailure | null;
};

export function readProposalRecord(
  proposalId: string,
): (gateways: WorkspaceGateways) => Promise<ProposalRecordView> {
  return async (gateways) => {
    const result = await gateways.proposals.get(proposalId);
    if (!result.ok) return { proposal: null, challengeTitle: null, error: result.error };
    const challenge = await readPublicChallenge(result.data.challenge_id);
    return {
      proposal: result.data,
      challengeTitle: challenge.ok ? challenge.data.title : null,
      error: null,
    };
  };
}

/**
 * A denied record is scope loss; a missing one is not.
 *
 * `NOT_FOUND` and `NO_ACCESS` are deliberately different screens here even
 * though the API returns the same non-enumerating shape for a foreign record:
 * scope loss means the whole family is unreachable and the human should pick a
 * workspace, while a missing record leaves the rest of the workspace usable.
 */
export function proposalRecordScopeLost(view: ProposalRecordView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}
