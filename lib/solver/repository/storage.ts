import { createCanonicalSolverState } from "@/data/solver-fixtures";
import type { SolverState } from "@/domain/solver";
import {
  SOLVER_STORAGE_RECOVERY_KEY,
  SOLVER_STORE_EVENT,
  SOLVER_STORE_KEY,
} from "@/lib/solver/repository/constants";
import { migrateLegacy, validState } from "@/lib/solver/repository/migrations";
import { clone, now, storageAvailable } from "@/lib/solver/repository/primitives";

export function persist(state: SolverState) {
  if (!storageAvailable()) return;
  localStorage.setItem(SOLVER_STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(
    new CustomEvent(SOLVER_STORE_EVENT, { detail: { updatedAt: state.updatedAt } }),
  );
}

export function readSolverState(): SolverState {
  if (!storageAvailable()) return createCanonicalSolverState();
  const raw = localStorage.getItem(SOLVER_STORE_KEY);
  if (!raw) {
    const seeded = migrateLegacy(createCanonicalSolverState());
    persist(seeded);
    return clone(seeded);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validState(parsed)) {
      const compatible = clone(parsed);
      const defaults = createCanonicalSolverState();
      compatible.users ??= defaults.users;
      compatible.accountSettings.sessions ??= defaults.accountSettings.sessions;
      return compatible;
    }
  } catch {
    // The recovery marker below documents a safe corruption fallback for QA.
  }
  const recovered = migrateLegacy(createCanonicalSolverState());
  try {
    localStorage.setItem(
      SOLVER_STORAGE_RECOVERY_KEY,
      JSON.stringify({ recoveredAt: now(), reason: "invalid-or-corrupt-envelope" }),
    );
  } catch {
    // Storage can be unavailable; the recovered in-memory projection remains usable.
  }
  persist(recovered);
  return clone(recovered);
}

export function resetSolverDemoData() {
  const state = createCanonicalSolverState(now());
  persist(state);
  return clone(state);
}

export function subscribeSolverState(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOLVER_STORE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SOLVER_STORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SOLVER_STORE_EVENT, callback);
  };
}
