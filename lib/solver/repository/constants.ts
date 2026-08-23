import { CURRENT_SOLVER_USER_ID } from "@/data/solver-fixtures";

export const SOLVER_STORE_VERSION = 5;
export const SOLVER_STORE_KEY = `rahhal.solver.v${SOLVER_STORE_VERSION}.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_STORE_SEEN_KEY = `rahhal.solver.v${SOLVER_STORE_VERSION}.seen.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_PREVIOUS_STORE_VERSION = 4;
export const SOLVER_PREVIOUS_STORE_KEY = `rahhal.solver.v${SOLVER_PREVIOUS_STORE_VERSION}.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_PREVIOUS_STORE_FRESH_KEY = `rahhal.solver.v${SOLVER_PREVIOUS_STORE_VERSION}.mirror-fresh.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_LEGACY_STORE_VERSION = 3;
export const SOLVER_LEGACY_STORE_KEY = `rahhal.solver.v${SOLVER_LEGACY_STORE_VERSION}.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_LEGACY_STORE_FRESH_KEY = `rahhal.solver.v${SOLVER_LEGACY_STORE_VERSION}.mirror-fresh.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_STORE_EVENT = "rahhal:solver-store-change";
export const SOLVER_STORAGE_RECOVERY_KEY = "rahhal.solver.recovery.v1";
