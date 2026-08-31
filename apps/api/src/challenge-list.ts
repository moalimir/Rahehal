import type { ChallengeListItemResource } from "@rahhal/contracts";

import { parseChallengeId } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";

/**
 * One page of an organization's own challenges. Bounded on the server for the
 * same reason the public catalogue is: a caller-chosen page size on a scoped
 * list is still an amplification lever, and no screen needs a different one.
 */
export const challengePageSize = 50;

/**
 * The two fields the list is ordered by. `created_at` rather than
 * `updated_at`: a keyset cursor has to ride an immutable column, and an org
 * list is exactly where rows get edited while someone is paging through them.
 */
export type ChallengeOrderKey = Pick<ChallengeListItemResource, "created_at" | "id">;

export function encodeChallengeCursor(row: ChallengeOrderKey): string {
  return Buffer.from(`${row.created_at}|${row.id}`, "utf8").toString("base64url");
}

export function decodeChallengeCursor(value: string | undefined): ChallengeOrderKey | null {
  if (value === undefined) return null;
  const invalid = () =>
    new ApiProblem(422, "VALIDATION", "The challenge list cursor is not readable", {
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
  const createdAt = decoded.slice(0, separator);
  const challengeId = decoded.slice(separator + 1);
  if (!/^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(challengeId)) throw invalid();
  if (!Number.isFinite(Date.parse(createdAt))) throw invalid();
  return { created_at: createdAt, id: parseChallengeId(challengeId) };
}

/** Newest first, id breaking ties so the order is total. */
export function compareChallenges(left: ChallengeOrderKey, right: ChallengeOrderKey): number {
  const byCreated = Date.parse(right.created_at) - Date.parse(left.created_at);
  return byCreated !== 0 ? byCreated : right.id.localeCompare(left.id);
}
