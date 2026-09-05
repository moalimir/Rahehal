import type { ProposalListItemResource } from "@rahhal/contracts";
import type { ProposalState } from "@rahhal/domain";

import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * One row of the connected proposal list.
 *
 * The demo list renders `Proposal` from the browser repository, which carries
 * an owner workspace, a current version id, and an assignment list. The server
 * list resource deliberately carries none of those: it answers "what does this
 * workspace have and what state is it in" and leaves content and version
 * identity behind the per-record read. Mapping live rows into the demo shape
 * would mean inventing the three missing fields, so the list renders this
 * narrower row instead and both sources produce it.
 */
export type ProposalRow = {
  readonly id: string;
  readonly challengeId: string;
  /** The published title when the projection still carries it; otherwise null. */
  readonly challengeTitle: string | null;
  /**
   * Only the demo projection has a publisher name. The public projection
   * deliberately does not carry one, so a connected row leaves this null
   * rather than borrowing the fixture publisher for a real challenge id.
   */
  readonly publisherName: string | null;
  readonly state: ProposalState;
  readonly updatedAt: string;
  readonly versionNumber: number;
  readonly trackingCode: string | null;
  readonly ready: boolean;
};

export type ProposalListView = {
  readonly rows: readonly ProposalRow[];
  readonly error: GatewayFailure | null;
};

/**
 * Resolves published titles for the challenges a workspace has proposals on.
 *
 * Reads go one per distinct challenge through B5's public projection, never
 * through the authoring aggregate, so a solver's list cannot become a way to
 * read a challenge's private fields. A challenge that is no longer publicly
 * readable resolves to `null` and the row shows its opaque id, which is the
 * honest answer; it never falls back to a fixture title.
 */
async function resolveTitles(
  challengeIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const distinct = [...new Set(challengeIds)];
  const resolved = await Promise.all(
    distinct.map(async (id) => {
      const result = await readPublicChallenge(id);
      return [id, result.ok ? result.data.title : null] as const;
    }),
  );
  const titles = new Map<string, string>();
  for (const [id, title] of resolved) if (title) titles.set(id, title);
  return titles;
}

export function toProposalRow(
  item: ProposalListItemResource,
  titles: ReadonlyMap<string, string>,
): ProposalRow {
  return {
    id: item.id,
    challengeId: item.challenge_id,
    challengeTitle: titles.get(item.challenge_id) ?? null,
    publisherName: null,
    state: item.state,
    updatedAt: item.updated_at,
    versionNumber: item.version,
    trackingCode: item.tracking_code,
    ready: item.readiness.ready,
  };
}

/** Reads the active workspace's proposals and the titles their rows need. */
export async function readProposalList(gateways: WorkspaceGateways): Promise<ProposalListView> {
  const result = await gateways.proposals.list();
  if (!result.ok) return { rows: [], error: result.error };
  const titles = await resolveTitles(result.data.items.map((item) => item.challenge_id));
  return {
    rows: result.data.items.map((item) => toProposalRow(item, titles)),
    error: null,
  };
}

/**
 * True when the list is unreadable because the session or scope no longer
 * reaches this workspace, so the page recovers rather than showing "no
 * proposals yet" — an empty list and a denied list must not look the same.
 */
export function proposalListScopeLost(view: ProposalListView): boolean {
  return view.error?.code === "NO_ACCESS" || view.error?.code === "ACTIVATION_REQUIRED";
}
