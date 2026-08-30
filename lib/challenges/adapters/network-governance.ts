import type {
  ChallengeSuccessEnvelope,
  ChallengeResource,
  ErrorEnvelope,
  MutationSuccessEnvelope,
} from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import type { ChallengeGatewayErrorCode, ChallengeResult } from "@/lib/challenges/gateway";
import type { ChallengeGovernanceGateway, RecordApprovalInput } from "@/lib/challenges/governance";
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
  ): Promise<ChallengeResult<ChallengeResource>> => {
    const headers = workspaceHeaders(targetWorkspaceId);
    if (!headers) return localFailure("NO_ACCESS", "ابتدا یک فضای کاری فعال انتخاب کنید.");
    const result = await requestApi<ChallengeSuccessEnvelope>(
      `/api/v1/challenges/${encodeURIComponent(id)}`,
      { headers },
    );
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
  ): Promise<ChallengeResult<ChallengeResource>> => {
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
  };
}
