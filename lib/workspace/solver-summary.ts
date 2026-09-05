import type {
  NotificationSummaryResource,
  ProposalListResource,
  SolverWorkspaceProfileResource,
  TeamResource,
} from "@rahhal/contracts";

import { readPublicChallenge } from "@/lib/challenges/adapters/network-public-challenges";
import type { GatewayFailure } from "@/lib/api/result";
import type { WorkspaceGateways } from "@/lib/workspace/gateways";

/**
 * The live solver dashboard summary.
 *
 * C9's rule for this page is that a connected session never sees a fixture
 * count. Every number here is derived from a server read for the active
 * workspace, and a family that fails contributes `null` rather than zero:
 * a dashboard that shows "0 drafts" when the drafts request was denied is
 * exactly the fake-count failure the audit set out to remove.
 */
export type SolverProposalCounts = {
  readonly drafts: number;
  readonly submitted: number;
  readonly inReview: number;
  readonly needsAction: number;
};

export type SolverDashboardSummary = {
  readonly profile: SolverWorkspaceProfileResource | null;
  readonly proposals: SolverProposalCounts | null;
  /** The rows behind the counts, for the dashboard's recent-work table. */
  readonly proposalRows: ProposalListResource["items"] | null;
  /**
   * Published titles for the challenges those rows name, from B5's public
   * projection.
   *
   * The organization dashboard shows a challenge by its title; the solver
   * dashboard showed the opaque id, so the two sides described the same call
   * differently. A challenge that is no longer publicly readable is absent
   * here and the row falls back to its id, which is true, rather than to a
   * fixture title.
   */
  readonly challengeTitles: ReadonlyMap<string, string>;
  /**
   * The active team, when the workspace is one.
   *
   * A team dashboard that says nothing about the team is the same page as the
   * personal one with a different heading. `null` on an individual workspace
   * is the expected answer, not a failure: the read is refused there by
   * design, exactly as `readTeamView` treats it.
   */
  readonly team: TeamResource | null;
  readonly unreadNotifications: number | null;
  /** One entry per family that could not be read, for an honest partial state. */
  readonly failures: readonly { readonly family: string; readonly error: GatewayFailure }[];
};

const draftStates = new Set(["draft", "revision_draft"]);
const submittedStates = new Set(["submitted", "resubmitted", "clarification_submitted"]);
const reviewStates = new Set(["eligibility_review", "eligible", "reviewing"]);
/** States where the ball is in the solver's court. */
const actionStates = new Set(["clarification_requested", "revision_requested"]);

/**
 * The groups the dashboard counts, keyed by the filter value its cards link to.
 *
 * The list filters by the same table, so a card's number and the rows behind
 * it cannot disagree: filtering by exact state would have shown "۳ ارسال‌شده"
 * on the dashboard and one row on the list, because `submitted` there means
 * three canonical states.
 */
export const proposalStatusGroups: Readonly<Record<string, ReadonlySet<string>>> = {
  draft: draftStates,
  submitted: submittedStates,
  reviewing: reviewStates,
  revision_requested: actionStates,
};

export function countProposals(list: ProposalListResource): SolverProposalCounts {
  let drafts = 0;
  let submitted = 0;
  let inReview = 0;
  let needsAction = 0;
  for (const item of list.items) {
    if (draftStates.has(item.state)) drafts += 1;
    else if (submittedStates.has(item.state)) submitted += 1;
    else if (reviewStates.has(item.state)) inReview += 1;
    if (actionStates.has(item.state)) needsAction += 1;
  }
  return { drafts, submitted, inReview, needsAction };
}

/**
 * Reads every family the dashboard needs, concurrently, and reports what
 * succeeded. A single denied or unreachable family degrades that card only;
 * it never fails the whole page and never substitutes a plausible number.
 */
export async function readSolverDashboardSummary(
  gateways: WorkspaceGateways,
): Promise<SolverDashboardSummary> {
  const [profile, proposals, notifications, team] = await Promise.all([
    gateways.solverProfile.read(),
    gateways.proposals.list(),
    gateways.notifications.summary(),
    gateways.team.read(),
  ]);

  // One read per distinct challenge, through the public projection only, so a
  // dashboard cannot become a way to reach a challenge's private fields.
  const challengeTitles = new Map<string, string>();
  if (proposals.ok) {
    const distinct = [...new Set(proposals.data.items.map((item) => item.challenge_id))];
    const resolved = await Promise.all(
      distinct.map(async (id) => {
        const challenge = await readPublicChallenge(id);
        return [id, challenge.ok ? challenge.data.title : null] as const;
      }),
    );
    for (const [id, title] of resolved) if (title) challengeTitles.set(id, title);
  }

  const failures: { family: string; error: GatewayFailure }[] = [];
  if (!profile.ok) failures.push({ family: "profile", error: profile.error });
  if (!proposals.ok) failures.push({ family: "proposals", error: proposals.error });
  if (!notifications.ok) failures.push({ family: "notifications", error: notifications.error });
  // An individual workspace has no team, and the server says so with a denial.
  // Reporting that would put an error on a page that is working correctly.
  if (!team.ok && team.error.code !== "NO_ACCESS" && team.error.code !== "NOT_FOUND") {
    failures.push({ family: "team", error: team.error });
  }

  return {
    profile: profile.ok ? profile.data : null,
    proposals: proposals.ok ? countProposals(proposals.data) : null,
    proposalRows: proposals.ok ? proposals.data.items : null,
    challengeTitles,
    team: team.ok ? team.data : null,
    unreadNotifications: notifications.ok
      ? (notifications.data as NotificationSummaryResource).unread_count
      : null,
    failures,
  };
}

/**
 * True when the whole summary is unusable because the session or scope is
 * gone, so the page must recover rather than render an empty dashboard.
 */
export function summaryScopeLost(summary: SolverDashboardSummary): boolean {
  // Every family must have been denied. One denial alongside a successful read
  // is a per-family permission difference, not a lost session, and sending the
  // human back to `/app` for that would lose a page they can still use.
  const nothingLoaded =
    summary.profile === null && summary.proposals === null && summary.unreadNotifications === null;
  return (
    nothingLoaded &&
    summary.failures.length > 0 &&
    summary.failures.every((failure) => failure.error.code === "NO_ACCESS")
  );
}
