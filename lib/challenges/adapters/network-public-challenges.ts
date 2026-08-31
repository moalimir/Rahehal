import type {
  ChallengePublicPage,
  ChallengePublicPageSuccessEnvelope,
  ChallengePublicProjectionResource,
  ErrorEnvelope,
  PublicChallengeQuery,
} from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import type { ChallengeGatewayErrorCode, ChallengeResult } from "@/lib/challenges/gateway";
import { requestApi } from "@/lib/api/http";

type PublicChallengeEnvelope = {
  readonly ok: true;
  readonly data: ChallengePublicProjectionResource;
  readonly meta: { readonly server_time: string; readonly correlation_id: string };
};

function failure<Data>(error: ErrorEnvelope): ChallengeResult<Data> {
  return {
    ok: false,
    error: { ...error.error, code: error.error.code as ChallengeGatewayErrorCode },
    meta: error.meta,
  };
}

/** Lists discoverable challenges from B5's public projection only. */
export async function listPublicChallenges(
  query: PublicChallengeQuery = {},
): Promise<ChallengeResult<ChallengePublicPage>> {
  const search = new URLSearchParams();
  if (query.category) search.set("category", query.category);
  if (query.cursor) search.set("cursor", query.cursor);
  const suffix = search.size ? `?${search.toString()}` : "";
  const result = await requestApi<ChallengePublicPageSuccessEnvelope>(
    `${apiRoutes.publicChallenges}${suffix}`,
  );
  if (!result.ok) return failure(result);
  return { ok: true, data: result.data, meta: result.meta };
}

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
  if (!result.ok) return failure(result);
  return { ok: true, data: result.data, meta: result.meta };
}
