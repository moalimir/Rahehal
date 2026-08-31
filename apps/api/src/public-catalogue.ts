import type { ChallengePublicProjectionResource, PublicAudience } from "@rahhal/contracts";

import { parseChallengeId } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";

/**
 * One public page. Bounded on the server, not by the caller: an anonymous
 * endpoint that lets the client choose the page size is an amplification
 * lever, and B5 needs no variable page size.
 */
export const publicChallengePageSize = 50;

/**
 * Which projection rows an audience may see. `registered` challenges are
 * published, but only to signed-in readers; anonymous callers must not be able
 * to tell that such a row exists at all.
 */
export function visibleVisibilities(
  audience: PublicAudience,
): readonly ("public" | "registered")[] {
  return audience === "registered" ? ["public", "registered"] : ["public"];
}

/**
 * Keyset cursor over `(proposal_deadline DESC, challenge_id DESC)`. Keyset
 * rather than offset because the catalogue grows while it is being scanned:
 * an offset would silently skip or repeat a challenge when a new one is
 * published mid-scan.
 *
 * The encoding is opaque but not secret — it carries only a deadline and a
 * challenge id that the same response already exposed.
 */
export function encodePublicChallengeCursor(row: PublicChallengeOrderKey): string {
  return Buffer.from(`${row.proposal_deadline}|${row.challenge_id}`, "utf8").toString("base64url");
}

export function decodePublicChallengeCursor(
  value: string | undefined,
): PublicChallengeOrderKey | null {
  if (value === undefined) return null;
  const invalid = () =>
    new ApiProblem(422, "VALIDATION", "The catalogue cursor is not readable", {
      fields: [{ path: "cursor", code: "format", message: "Use a cursor from a previous page" }],
    });

  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw invalid();
  }
  const separator = decoded.indexOf("|");
  if (separator <= 0) throw invalid();
  const proposalDeadline = decoded.slice(0, separator);
  const challengeId = decoded.slice(separator + 1);
  if (!/^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(challengeId)) throw invalid();
  if (!Number.isFinite(Date.parse(proposalDeadline))) throw invalid();
  return { proposal_deadline: proposalDeadline, challenge_id: parseChallengeId(challengeId) };
}

/**
 * The two fields the catalogue is ordered by. Narrower than the full
 * projection so a cursor position can be compared against a row without
 * fabricating a whole resource to hold two values.
 */
export type PublicChallengeOrderKey = Pick<
  ChallengePublicProjectionResource,
  "proposal_deadline" | "challenge_id"
>;

/** Newest deadline first, challenge id breaking ties so the order is total. */
export function comparePublicChallenges(
  left: PublicChallengeOrderKey,
  right: PublicChallengeOrderKey,
): number {
  const byDeadline = Date.parse(right.proposal_deadline) - Date.parse(left.proposal_deadline);
  return byDeadline !== 0 ? byDeadline : right.challenge_id.localeCompare(left.challenge_id);
}
