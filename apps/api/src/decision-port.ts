import type {
  CaseResource,
  ChallengeDecisionResource,
  ProposalOutcomeResource,
  RecordChallengeDecisionBody,
  RecordChallengeDecisionNextAction,
  SaveDecisionShortlistBody,
  SaveDecisionShortlistNextAction,
} from "@rahhal/contracts";
import type { ChallengeId, SessionId } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";
import type { MutationOutcome, WorkspaceCommandContext, WorkspaceScope } from "./ports.js";

export type DecisionCommandContext = WorkspaceCommandContext & {
  readonly sessionId: SessionId;
  readonly sessionVersion: number;
  readonly stepUpToken?: string;
};

export interface DecisionPort {
  get(scope: WorkspaceScope, challengeId: string): Promise<ChallengeDecisionResource | null>;
  saveShortlist(
    challengeId: string,
    body: SaveDecisionShortlistBody,
    context: WorkspaceCommandContext,
  ): Promise<MutationOutcome<ChallengeId, SaveDecisionShortlistNextAction>>;
  record(
    challengeId: string,
    body: RecordChallengeDecisionBody,
    context: DecisionCommandContext,
  ): Promise<MutationOutcome<ChallengeId, RecordChallengeDecisionNextAction>>;
  proposalOutcome(
    scope: WorkspaceScope,
    proposalId: string,
  ): Promise<ProposalOutcomeResource | null>;
  case(scope: WorkspaceScope, caseId: string): Promise<CaseResource | null>;
}

export class UnavailableDecisionAdapter implements DecisionPort {
  async get(): Promise<never> {
    throw new ApiProblem(503, "STORAGE", "Decision reads require the connected PostgreSQL runtime");
  }
  async saveShortlist(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Decision shortlists require the connected PostgreSQL runtime",
    );
  }
  async record(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Final decisions require the connected PostgreSQL runtime",
    );
  }
  async proposalOutcome(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Proposal outcomes require the connected PostgreSQL runtime",
    );
  }
  async case(): Promise<never> {
    throw new ApiProblem(503, "STORAGE", "Case reads require the connected PostgreSQL runtime");
  }
}
