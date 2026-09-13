import type {
  BrowserDecisionStepUpStartBody,
  OidcAuthorizationStartResult,
  SessionExchangeBody,
} from "@rahhal/contracts";
import type { CorrelationId, SessionId } from "@rahhal/domain";

import { ApiProblem } from "./errors.js";
import type { AuthenticatedSession, WorkspaceCommandContext } from "./ports.js";

export type StepUpCommandContext = WorkspaceCommandContext & {
  readonly sessionId: SessionId;
  readonly sessionVersion: number;
};

export type CompletedStepUp = {
  readonly token: string;
  readonly expiresAt: string;
  readonly returnTo: string;
};

export type StartedStepUp = OidcAuthorizationStartResult & {
  readonly returnTo: string;
};

export type StepUpCompletionContext = {
  readonly correlationId: CorrelationId;
};

export interface StepUpCredentialIssuerPort {
  issue(attemptId: string, sessionId: SessionId, sessionVersion: number): string;
}

export interface StepUpPort {
  start(
    challengeId: string,
    body: BrowserDecisionStepUpStartBody,
    redirectUri: string,
    context: StepUpCommandContext,
  ): Promise<StartedStepUp>;
  complete(
    body: SessionExchangeBody,
    session: AuthenticatedSession,
    context: StepUpCompletionContext,
  ): Promise<CompletedStepUp>;
}

export class UnavailableStepUpAdapter implements StepUpPort {
  async start(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Decision step-up requires the connected PostgreSQL runtime",
    );
  }

  async complete(): Promise<never> {
    throw new ApiProblem(
      503,
      "STORAGE",
      "Decision step-up requires the connected PostgreSQL runtime",
    );
  }
}
