import type {
  ChallengeId,
  ChallengeVersionId,
  RubricId,
  RubricVersionId,
  RubricCriterion,
} from "@rahhal/domain";
import type { SuccessEnvelope, MutationSuccessEnvelope, VersionedCommand } from "./envelopes.js";

export type RubricResource = {
  readonly id: RubricId;
  readonly version_id: RubricVersionId;
  readonly version: number;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly criteria: readonly RubricCriterion[];
  readonly created_at: string;
};
export type CreateRubricVersionBody = Pick<VersionedCommand, "expected_version"> & {
  readonly challenge_version_id: ChallengeVersionId;
  readonly criteria: readonly RubricCriterion[];
};
export type RubricSuccessEnvelope = SuccessEnvelope<RubricResource | null>;
export type RubricNextAction = "edit_rubric" | "open_evaluation";
export type RubricMutationSuccessEnvelope = MutationSuccessEnvelope<RubricId, RubricNextAction>;
