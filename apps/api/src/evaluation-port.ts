import type {
  ChallengeEvaluationNextAction,
  ChallengeEvaluationResource,
  ChallengeReviewComparisonResource,
  OpenChallengeEvaluationBody,
} from "@rahhal/contracts";
import type { ChallengeId } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";
import type { MutationOutcome, WorkspaceCommandContext, WorkspaceScope } from "./ports.js";

export interface EvaluationPort {
  get(scope: WorkspaceScope, challengeId: string): Promise<ChallengeEvaluationResource | null>;
  comparison(
    scope: WorkspaceScope,
    challengeId: string,
  ): Promise<ChallengeReviewComparisonResource | null>;
  open(
    challengeId: string,
    body: OpenChallengeEvaluationBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ChallengeId, ChallengeEvaluationNextAction>>;
}

/** The static/demo runtime never claims an authoritative evaluation snapshot. */
export class UnavailableEvaluationAdapter implements EvaluationPort {
  async get(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Evaluation opening requires the connected PostgreSQL runtime",
    );
  }

  async open(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Evaluation opening requires the connected PostgreSQL runtime",
    );
  }

  async comparison(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Review comparison requires the connected PostgreSQL runtime",
    );
  }
}
