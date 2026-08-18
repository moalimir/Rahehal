import type { MutationReceipt, MutationResult, SolverState } from "@/domain/solver";
import { id, fail, now } from "@/lib/solver/repository/primitives";
import { persist, readSolverState } from "@/lib/solver/repository/storage";

export function receipt(
  state: SolverState,
  workspaceId: string,
  entityId: string,
  action: string,
  idempotencyKey?: string,
): MutationReceipt {
  if (idempotencyKey && state.idempotency[idempotencyKey]) {
    const previous = state.idempotency[idempotencyKey];
    return {
      ok: true,
      entityId: previous.entityId,
      receiptId: previous.receiptId,
      auditEventId:
        state.auditEvents.find((event) => event.receiptId === previous.receiptId)?.id ??
        "AUD-UNKNOWN",
      timestamp: previous.createdAt,
      idempotent: true,
    };
  }
  const timestamp = now();
  const receiptId = id("REC");
  const auditEventId = id("AUD");
  state.auditEvents.push({
    id: auditEventId,
    actorUserId: state.currentUser.id,
    workspaceId,
    entityId,
    action,
    createdAt: timestamp,
    receiptId,
  });
  if (idempotencyKey)
    state.idempotency[idempotencyKey] = { entityId, receiptId, createdAt: timestamp };
  return { ok: true, entityId, receiptId, auditEventId, timestamp, idempotent: false };
}

export function updateState(mutation: (state: SolverState) => MutationResult): MutationResult {
  const state = readSolverState();
  const result = mutation(state);
  if (!result.ok) return result;
  state.updatedAt = result.timestamp;
  try {
    persist(state);
    return result;
  } catch {
    return fail("STORAGE", "ذخیره تغییر ممکن نشد؛ ورودی شما برای تلاش دوباره حفظ شده است.");
  }
}
