import type {
  ChallengeApprovalBriefResource,
  ChallengeResource,
  PlatformChallengeApprovalQueueResource,
} from "@rahhal/contracts";
import type { ApprovalDecision, PublicationGate } from "@rahhal/domain";

import type { ChallengeResult } from "@/lib/challenges/gateway";

/**
 * The connected governance surface: recording publication gates (B2) and
 * publishing an approved version (B4).
 *
 * It deliberately returns `ChallengeResource` -- the server contract -- rather
 * than the demo's `ChallengeRecord`. `ChallengeRecord` has no field for
 * `approvals` or `publication_readiness`, and every one of those values is
 * attributed evidence that only the server can produce. Mapping through the
 * demo view model would mean either widening it with server-only concepts or
 * silently dropping the attribution this screen exists to show.
 */
export type RecordApprovalInput = {
  readonly gate: PublicationGate;
  readonly decision: ApprovalDecision;
  readonly reason: string;
};

export type ChallengePublicationCommand = "pause" | "resume" | "close" | "cancel";

export type ChallengeGovernanceResource = ChallengeResource | ChallengeApprovalBriefResource;

export interface ChallengeGovernanceGateway {
  /**
   * `targetWorkspaceId` addresses the workspace that owns the challenge. Org
   * members leave it unset and act in their active workspace; a platform gate
   * approver has no membership there and no way to activate it, so it must
   * name the target explicitly — that is the request shape the server's
   * standing-authority path expects.
   */
  read(
    id: string,
    targetWorkspaceId?: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>>;
  listPendingApprovals(): Promise<ChallengeResult<PlatformChallengeApprovalQueueResource>>;
  advanceFormulation(id: string, targetWorkspaceId: string): Promise<ChallengeResult<null>>;
  recordApproval(
    id: string,
    input: RecordApprovalInput,
    targetWorkspaceId?: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>>;
  publish(id: string): Promise<ChallengeResult<ChallengeGovernanceResource>>;
  extendDeadline(
    id: string,
    proposalDeadline: string,
    reason: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>>;
  changePublicationState(
    id: string,
    command: ChallengePublicationCommand,
    reason: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>>;
}
