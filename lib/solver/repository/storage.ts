import { createCanonicalSolverState } from "@/data/solver-fixtures";
import type { SolverState } from "@/domain/solver";
import {
  SOLVER_PREVIOUS_STORE_FRESH_KEY,
  SOLVER_PREVIOUS_STORE_KEY,
  SOLVER_PREVIOUS_STORE_VERSION,
  SOLVER_STORAGE_RECOVERY_KEY,
  SOLVER_STORE_EVENT,
  SOLVER_STORE_KEY,
} from "@/lib/solver/repository/constants";
import {
  migrateLegacy,
  migrateSolverStateV3,
  normalizeCurrentSolverState,
} from "@/lib/solver/repository/migrations";
import { clone, now, storageAvailable } from "@/lib/solver/repository/primitives";

function previousStoreSnapshot(state: SolverState) {
  const teams = state.teams.map(({ teamKind, ...team }) => ({
    ...team,
    teamType: teamKind,
  }));
  return { ...state, version: SOLVER_PREVIOUS_STORE_VERSION, teams };
}

function refreshPreviousStoreSnapshot(state: SolverState) {
  try {
    localStorage.removeItem(SOLVER_PREVIOUS_STORE_FRESH_KEY);
    const serialized = JSON.stringify(previousStoreSnapshot(state));
    if (localStorage.getItem(SOLVER_PREVIOUS_STORE_KEY) !== serialized)
      localStorage.setItem(SOLVER_PREVIOUS_STORE_KEY, serialized);
    localStorage.setItem(SOLVER_PREVIOUS_STORE_FRESH_KEY, state.updatedAt);
  } catch {
    try {
      localStorage.removeItem(SOLVER_PREVIOUS_STORE_KEY);
      localStorage.removeItem(SOLVER_PREVIOUS_STORE_FRESH_KEY);
    } catch {
      // The authoritative v4 write remains valid even when rollback storage is unavailable.
    }
  }
}

export function persist(state: SolverState) {
  if (!storageAvailable()) return;
  localStorage.setItem(SOLVER_STORE_KEY, JSON.stringify(state));
  refreshPreviousStoreSnapshot(state);
  window.dispatchEvent(
    new CustomEvent(SOLVER_STORE_EVENT, { detail: { updatedAt: state.updatedAt } }),
  );
}

function parseState(raw: string | null, normalize: (value: unknown) => SolverState | null) {
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function withCompatibilityDefaults(state: SolverState) {
  const compatible = clone(state);
  const defaults = createCanonicalSolverState();
  compatible.users ??= defaults.users;
  compatible.accountSettings ??= defaults.accountSettings;
  compatible.accountSettings.sessions ??= defaults.accountSettings.sessions;
  return compatible;
}

function markRecovery() {
  try {
    localStorage.setItem(
      SOLVER_STORAGE_RECOVERY_KEY,
      JSON.stringify({ recoveredAt: now(), reason: "invalid-or-corrupt-envelope" }),
    );
  } catch {
    // Storage can be unavailable; the recovered in-memory projection remains usable.
  }
}

export function readSolverState(): SolverState {
  if (!storageAvailable()) return createCanonicalSolverState();
  const currentRaw = localStorage.getItem(SOLVER_STORE_KEY);
  const current = parseState(currentRaw, normalizeCurrentSolverState);
  if (current) {
    const compatible = withCompatibilityDefaults(current);
    refreshPreviousStoreSnapshot(compatible);
    return compatible;
  }

  const previousRaw = localStorage.getItem(SOLVER_PREVIOUS_STORE_KEY);
  const previous = parseState(previousRaw, migrateSolverStateV3);
  const previousIsFresh =
    !currentRaw ||
    Boolean(
      previous && localStorage.getItem(SOLVER_PREVIOUS_STORE_FRESH_KEY) === previous.updatedAt,
    );
  if (previous && previousIsFresh) {
    const migrated = withCompatibilityDefaults(previous);
    if (currentRaw) markRecovery();
    persist(migrated);
    return clone(migrated);
  }

  const recovered = migrateLegacy(createCanonicalSolverState());
  if (currentRaw || previousRaw) markRecovery();
  persist(recovered);
  return clone(recovered);
}

export function resetSolverDemoData() {
  if (storageAvailable()) {
    localStorage.removeItem(SOLVER_PREVIOUS_STORE_KEY);
    localStorage.removeItem(SOLVER_PREVIOUS_STORE_FRESH_KEY);
  }
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
