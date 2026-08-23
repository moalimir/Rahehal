import type { ChallengeRecord } from "@/domain/challenge";

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

export type ChallengeGatewayErrorCode = "NOT_FOUND" | "INVALID_STATE" | "VALIDATION" | "STORAGE";

export type ChallengeResultMeta = {
  readonly server_time: string;
  readonly correlation_id: string;
};

export type ChallengeResult<Data> =
  | { ok: true; data: Data; meta: ChallengeResultMeta }
  | {
      ok: false;
      error: {
        code: ChallengeGatewayErrorCode;
        message: string;
        fields?: readonly { path: string; code: string; message: string }[];
        current_version?: number;
        current_state?: string;
        allowed_transitions?: readonly string[];
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
  publish(id: string): Promise<ChallengeResult<ChallengeRecord>>;
}

export type ChallengeGateway = {
  queries: ChallengeQueries;
  commands: ChallengeCommands;
};
