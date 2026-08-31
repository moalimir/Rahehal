import type {
  ChallengeApprovalBriefSuccessEnvelope,
  ChallengeSuccessEnvelope,
  ErrorEnvelope,
  MutationSuccessEnvelope,
  PlatformChallengeApprovalQueueSuccessEnvelope,
} from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import type { ChallengeGatewayErrorCode, ChallengeResult } from "@/lib/challenges/gateway";
import type {
  ChallengePublicationCommand,
  ChallengeGovernanceGateway,
  ChallengeGovernanceResource,
  RecordApprovalInput,
} from "@/lib/challenges/governance";
import { idempotencyKey, requestApi } from "@/lib/api/http";

type NetworkGovernanceOptions = {
  readonly activeWorkspaceId: () => string | null;
};

function failure<Data>(error: ErrorEnvelope): ChallengeResult<Data> {
  return {
    ok: false,
    error: { ...error.error, code: error.error.code as ChallengeGatewayErrorCode },
    meta: error.meta,
  };
}

function localFailure<Data>(
  code: ChallengeGatewayErrorCode,
  message: string,
): ChallengeResult<Data> {
  return {
    ok: false,
    error: { code, message },
    meta: { server_time: new Date().toISOString(), correlation_id: "cor_web_validation" },
  };
}

/**
 * B7's governance transport. Every precondition -- stage, role, separation of
 * duty, the four gates -- is decided server-side; this only carries the
 * version it last read and surfaces the typed refusal. It never infers a
 * gate's outcome locally, so a denied command leaves the screen showing the
 * server's state rather than an optimistic one.
 */
export function createNetworkChallengeGovernanceGateway(
  options: NetworkGovernanceOptions,
): ChallengeGovernanceGateway {
  const versions = new Map<string, number>();
  // Retrying a refused command must reuse its key: these are the two most
  // consequential writes in Phase 2 and both are non-reversible once accepted.
  const pendingKeys = new Map<string, string>();

  const workspaceHeaders = (targetWorkspaceId?: string) => {
    const workspaceId = targetWorkspaceId ?? options.activeWorkspaceId();
    return workspaceId ? { "x-workspace-id": workspaceId } : null;
  };

  const read = async (
    id: string,
    targetWorkspaceId?: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>> => {
    const headers = workspaceHeaders(targetWorkspaceId);
    if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری فعال انتخاب کنید.");
    const path = targetWorkspaceId
      ? apiRoutes.platformChallengeApprovalBrief.replace("{challengeId}", encodeURIComponent(id))
      : `/api/v1/challenges/${encodeURIComponent(id)}`;
    const result = targetWorkspaceId
      ? await requestApi<ChallengeApprovalBriefSuccessEnvelope>(path, { headers })
      : await requestApi<ChallengeSuccessEnvelope>(path, { headers });
    if (!result.ok) return failure(result);
    versions.set(id, result.data.version);
    return { ok: true, data: result.data, meta: result.meta };
  };

  const command = async (
    id: string,
    path: string,
    body: Record<string, unknown>,
    label: string,
    targetWorkspaceId?: string,
  ): Promise<ChallengeResult<ChallengeGovernanceResource>> => {
    const expectedVersion = versions.get(id);
    if (expectedVersion === undefined) {
      return localFailure("CONFLICT", "ابتدا نسخه به‌روز پرونده را دریافت کنید.");
    }
    const headers = workspaceHeaders(targetWorkspaceId);
    if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری فعال انتخاب کنید.");
    const fingerprint = `${label}:${id}:${expectedVersion}:${JSON.stringify(body)}`;
    const key = pendingKeys.get(fingerprint) ?? idempotencyKey(`web-${label}`);
    pendingKeys.set(fingerprint, key);
    const result = await requestApi<MutationSuccessEnvelope>(path, {
      method: "POST",
      headers: { ...headers, "idempotency-key": key },
      body: JSON.stringify({ ...body, expected_version: expectedVersion }),
    });
    if (!result.ok) return failure(result);
    const reloaded = await read(id, targetWorkspaceId);
    if (reloaded.ok) pendingKeys.delete(fingerprint);
    return reloaded;
  };

  return {
    read,
    async listPendingApprovals() {
      const headers = workspaceHeaders();
      if (!headers) return localFailure("NO_ACCESS", "ابتدا فضای کاری راه‌حل را فعال کنید.");
      const result = await requestApi<PlatformChallengeApprovalQueueSuccessEnvelope>(
        apiRoutes.platformChallengeApprovalQueue,
        { headers },
      );
      if (!result.ok) return failure(result);
      return { ok: true, data: result.data, meta: result.meta };
    },
    async advanceFormulation(id, targetWorkspaceId) {
      const expectedVersion = versions.get(id);
      if (expectedVersion === undefined) {
        return localFailure("CONFLICT", "ابتدا نسخه به‌روز پرونده را دریافت کنید.");
      }
      const headers = workspaceHeaders(targetWorkspaceId);
      if (!headers) return localFailure("NO_ACCESS", "ابتدا فضای کاری راه‌حل را فعال کنید.");
      const fingerprint = `challenge-advance-formulation:${id}:${expectedVersion}`;
      const key =
        pendingKeys.get(fingerprint) ?? idempotencyKey("web-challenge-advance-formulation");
      pendingKeys.set(fingerprint, key);
      const result = await requestApi<MutationSuccessEnvelope>(
        apiRoutes.advanceChallengeFormulation.replace("{challengeId}", encodeURIComponent(id)),
        {
          method: "POST",
          headers: { ...headers, "idempotency-key": key },
          body: JSON.stringify({ expected_version: expectedVersion }),
        },
      );
      if (!result.ok) return failure(result);

      // The purpose-scoped brief becomes unreadable once ops advances the
      // challenge out of triage, so a successful command cannot reload it.
      pendingKeys.delete(fingerprint);
      versions.delete(id);
      return { ok: true, data: null, meta: result.meta };
    },
    async recordApproval(id, input: RecordApprovalInput, targetWorkspaceId?: string) {
      return command(
        id,
        apiRoutes.recordChallengeApproval.replace("{challengeId}", encodeURIComponent(id)),
        { gate: input.gate, decision: input.decision, reason: input.reason },
        "challenge-approval",
        targetWorkspaceId,
      );
    },
    async publish(id) {
      return command(
        id,
        apiRoutes.publishChallenge.replace("{challengeId}", encodeURIComponent(id)),
        {},
        "challenge-publish",
      );
    },
    async extendDeadline(id, proposalDeadline, reason) {
      return command(
        id,
        apiRoutes.extendChallengeDeadline.replace("{challengeId}", encodeURIComponent(id)),
        { proposal_deadline: proposalDeadline, reason },
        "challenge-extend-deadline",
      );
    },
    async changePublicationState(id, publicationCommand: ChallengePublicationCommand, reason) {
      const routes = {
        pause: apiRoutes.pauseChallenge,
        resume: apiRoutes.resumeChallenge,
        close: apiRoutes.closeChallenge,
        cancel: apiRoutes.cancelChallenge,
      } as const;
      return command(
        id,
        routes[publicationCommand].replace("{challengeId}", encodeURIComponent(id)),
        { reason },
        `challenge-${publicationCommand}`,
      );
    },
  };
}
