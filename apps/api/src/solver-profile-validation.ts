import type { PatchSolverWorkspaceProfileBody } from "@rahhal/contracts";

import { ApiProblem } from "./errors.js";

function validFactArray(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim().toLowerCase());
  return (
    values.length <= 100 &&
    normalized.every((value) => value.length >= 1 && value.length <= 200) &&
    new Set(normalized).size === normalized.length
  );
}

/** Keep API validation aligned with migration 0014's normalized array constraint. */
export function validateSolverProfilePatch(body: PatchSolverWorkspaceProfileBody): void {
  for (const field of ["expertise", "geography"] as const) {
    const values = body.patch[field];
    if (values !== undefined && !validFactArray(values)) {
      throw new ApiProblem(422, "VALIDATION", "Solver profile facts are invalid", {
        fields: [
          {
            path: `/patch/${field}`,
            code: "format",
            message: "Values must be non-empty and unique after trimming and normalization.",
          },
        ],
      });
    }
  }
}
