import { CURRENT_SOLVER_USER_ID } from "@/data/solver-fixtures";

export const SOLVER_STORE_VERSION = 3;
export const SOLVER_STORE_KEY = `rahhal.solver.v${SOLVER_STORE_VERSION}.user.${CURRENT_SOLVER_USER_ID}`;
export const SOLVER_STORE_EVENT = "rahhal:solver-store-change";
export const SOLVER_STORAGE_RECOVERY_KEY = "rahhal.solver.recovery.v1";
