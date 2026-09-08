import type { CreateRubricVersionBody, RubricResource, RubricNextAction } from "@rahhal/contracts";
import type { RubricId } from "@rahhal/domain";
import { ApiProblem } from "./errors.js";
import type { MutationOutcome, WorkspaceCommandContext, WorkspaceScope } from "./ports.js";

export interface RubricPort {
  get(scope: WorkspaceScope, challengeId: string): Promise<RubricResource | null>;
  createVersion(
    challengeId: string,
    body: CreateRubricVersionBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<RubricId, RubricNextAction>>;
}

/** The offline prototype does not provide authoritative rubric authoring. */
export class UnavailableRubricAdapter implements RubricPort {
  async get(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Rubric authoring requires the connected PostgreSQL runtime",
    );
  }
  async createVersion(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Rubric authoring requires the connected PostgreSQL runtime",
    );
  }
}
