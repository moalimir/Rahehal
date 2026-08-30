import type { ChallengePublicProjectionResource, ErrorEnvelope } from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import type { ChallengeGatewayErrorCode, ChallengeResult } from "@/lib/challenges/gateway";
import { requestApi } from "@/lib/api/http";

type PublicChallengeEnvelope = {
  readonly ok: true;
  readonly data: ChallengePublicProjectionResource;
  readonly meta: { readonly server_time: string; readonly correlation_id: string };
};

/**
 * Reads one published challenge from B5's public projection.
 *
 * It never touches the authoring API, so it cannot reach a private field even
 * by mistake; and it returns the projection resource unchanged rather than
 * mapping into the demo `OpportunityView`, which requires an organization id,
 * a match score and a collaboration route that the projection deliberately
 * does not carry — mapping through it would mean inventing all three.
 */
export async function readPublicChallenge(
  id: string,
): Promise<ChallengeResult<ChallengePublicProjectionResource>> {
  const result = await requestApi<PublicChallengeEnvelope>(
    apiRoutes.publicChallengeById.replace("{challengeId}", encodeURIComponent(id)),
  );
  if (!result.ok) {
    const error = result as ErrorEnvelope;
    return {
      ok: false,
      error: { ...error.error, code: error.error.code as ChallengeGatewayErrorCode },
      meta: error.meta,
    };
  }
  return { ok: true, data: result.data, meta: result.meta };
}
