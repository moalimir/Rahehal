import type {
  ChallengeId,
  ChallengeStage,
  ChallengeVersionId,
  EvaluationReadinessBlocker,
  EvaluationRosterProposalState,
  ProposalId,
  ProposalVersionId,
  RubricVersionId,
} from "@rahhal/domain";

import type { MutationSuccessEnvelope, VersionedApiMeta, VersionedCommand } from "./envelopes.js";

export type EvaluationRosterProposalResource = {
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly tracking_code: string;
  readonly source_state: EvaluationRosterProposalState;
};

export type ChallengeEvaluationResource = {
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId | null;
  readonly stage: ChallengeStage;
  readonly publication_state: "open" | "paused" | "closed" | "cancelled" | null;
  readonly proposal_deadline_at: string | null;
  readonly window_closed: boolean;
  readonly rubric_version_id: RubricVersionId | null;
  readonly required_reviews: 2;
  readonly qualifying_proposal_count: number;
  readonly unresolved_proposal_count: number;
  readonly ready: boolean;
  readonly blockers: readonly EvaluationReadinessBlocker[];
  readonly roster: readonly EvaluationRosterProposalResource[];
  readonly opened_at: string | null;
  readonly version: number;
};

export type ChallengeEvaluationSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeEvaluationResource;
  readonly meta: VersionedApiMeta;
};

export type OpenChallengeEvaluationBody = Pick<VersionedCommand, "expected_version">;
export type ChallengeEvaluationNextAction = "assign_reviewers" | "record_no_award";
export type ChallengeEvaluationMutationSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeId,
  ChallengeEvaluationNextAction
>;
