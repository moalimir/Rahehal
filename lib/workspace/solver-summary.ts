import type {
  NotificationSummaryResource,
  ProposalListResource,
  SolverWorkspaceProfileResource,
} from "@rahhal/contracts";

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
  readonly unreadNotifications: number | null;
  /** One entry per family that could not be read, for an honest partial state. */
  readonly failures: readonly { readonly family: string; readonly error: GatewayFailure }[];
};

const draftStates = new Set(["draft", "revision_draft"]);
const submittedStates = new Set(["submitted", "resubmitted", "clarification_submitted"]);
const reviewStates = new Set(["eligibility_review", "eligible", "reviewing"]);
/** States where the ball is in the solver's court. */
const actionStates = new Set(["clarification_requested", "revision_requested"]);

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
  const [profile, proposals, notifications] = await Promise.all([
    gateways.solverProfile.read(),
    gateways.proposals.list(),
    gateways.notifications.summary(),
  ]);

  const failures: { family: string; error: GatewayFailure }[] = [];
  if (!profile.ok) failures.push({ family: "profile", error: profile.error });
  if (!proposals.ok) failures.push({ family: "proposals", error: proposals.error });
  if (!notifications.ok) failures.push({ family: "notifications", error: notifications.error });

  return {
    profile: profile.ok ? profile.data : null,
    proposals: proposals.ok ? countProposals(proposals.data) : null,
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
