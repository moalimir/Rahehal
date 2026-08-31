import type { ChallengeRecord } from "@/domain/challenge";
import type { ApiReadiness } from "@rahhal/contracts";
import type { ChallengeManagedStage } from "@rahhal/domain";

export type InitialChallengeInput = Pick<
  ChallengeRecord,
  | "title"
  | "summary"
  | "category"
  | "location"
  | "ownerName"
  | "desiredOutcome"
  | "urgency"
  | "attachments"
>;

export type ChallengeGatewayErrorCode =
  | "VALIDATION"
  | "NO_ACCESS"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONFLICT"
  | "STEP_UP_REQUIRED"
  | "STORAGE";

export type ChallengeResultMeta = {
  readonly server_time: string;
  readonly correlation_id: string;
  readonly readiness?: ApiReadiness;
  readonly stage?: ChallengeManagedStage;
};

export type ChallengeResult<Data> =
  | { ok: true; data: Data; meta: ChallengeResultMeta }
  | {
      ok: false;
      error: {
        code: ChallengeGatewayErrorCode;
        message: string;
        fields?: readonly { path: string; code: string; message: string; step?: 1 | 2 | 3 | 4 }[];
        current_version?: number;
        current_state?: string;
        allowed_transitions?: readonly string[];
        readiness?: ApiReadiness;
        recovery?: string;
      };
      meta: ChallengeResultMeta;
    };

export interface ChallengeQueries {
  list(): Promise<ChallengeResult<ChallengeRecord[]>>;
  get(id: string): Promise<ChallengeResult<ChallengeRecord>>;
}

export interface ChallengeCommands {
  create(input: InitialChallengeInput): Promise<ChallengeResult<ChallengeRecord>>;
  save(record: ChallengeRecord): Promise<ChallengeResult<ChallengeRecord>>;
  delete(id: string): Promise<ChallengeResult<{ id: string }>>;
  submit(record: ChallengeRecord): Promise<ChallengeResult<ChallengeRecord>>;
  advanceFormulation(id: string): Promise<ChallengeResult<ChallengeRecord>>;
  publish(id: string): Promise<ChallengeResult<ChallengeRecord>>;
}

export type ChallengeGateway = {
  queries: ChallengeQueries;
  commands: ChallengeCommands;
};
