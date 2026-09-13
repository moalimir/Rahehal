import type {
  CaseId,
  ChallengeId,
  ChallengeStage,
  ChallengeVersionId,
  DecisionId,
  DecisionOutcome,
  DecisionReasonCode,
  DecisionShortlistVersionId,
  ProposalDecisionOutcome,
  ProposalId,
  ProposalVersionId,
  RubricVersionId,
} from "@rahhal/domain";

import type { MutationSuccessEnvelope, VersionedApiMeta, VersionedCommand } from "./envelopes.js";

export type DecisionProposalReference = {
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
};

export type DecisionProposalResource = DecisionProposalReference & {
  readonly tracking_code: string;
  readonly locked_review_count: number;
  readonly shortlisted: boolean;
  readonly outcome: ProposalDecisionOutcome | null;
  readonly feedback: string | null;
};

export type DecisionShortlistResource = {
  readonly id: DecisionShortlistVersionId;
  readonly version_number: number;
  readonly proposal_versions: readonly DecisionProposalReference[];
  readonly rationale: string;
  readonly recorded_at: string;
};

export type FinalDecisionResource = {
  readonly id: DecisionId;
  readonly outcome: DecisionOutcome;
  readonly selected_proposal_id: ProposalId | null;
  readonly selected_proposal_version_id: ProposalVersionId | null;
  readonly reason_code: DecisionReasonCode;
  readonly rationale: string;
  readonly decided_at: string;
};

export type CaseResource = {
  readonly id: CaseId;
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly decision_id: DecisionId;
  readonly state: "created";
  readonly created_at: string;
};

export type ChallengeDecisionResource = {
  readonly challenge_id: ChallengeId;
  readonly challenge_version_id: ChallengeVersionId;
  readonly rubric_version_id: RubricVersionId;
  readonly stage: ChallengeStage;
  readonly review_complete: boolean;
  readonly proposals: readonly DecisionProposalResource[];
  readonly shortlist: DecisionShortlistResource | null;
  readonly decision: FinalDecisionResource | null;
  readonly case: CaseResource | null;
  readonly version: number;
};

export type ChallengeDecisionSuccessEnvelope = {
  readonly ok: true;
  readonly data: ChallengeDecisionResource;
  readonly meta: VersionedApiMeta;
};

export type CaseSuccessEnvelope = {
  readonly ok: true;
  readonly data: CaseResource;
  readonly meta: VersionedApiMeta;
};

export type SaveDecisionShortlistBody = Pick<VersionedCommand, "expected_version"> & {
  readonly challenge_version_id: ChallengeVersionId;
  readonly rubric_version_id: RubricVersionId;
  readonly proposal_versions: readonly DecisionProposalReference[];
  readonly rationale: string;
};

export type SaveDecisionShortlistNextAction = "reauthenticate_decision";
export type SaveDecisionShortlistSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeId,
  SaveDecisionShortlistNextAction
>;

export type ProposalDecisionFeedback = DecisionProposalReference & {
  readonly feedback: string;
};

export type RecordChallengeDecisionBody = Pick<
  VersionedCommand,
  "expected_version" | "step_up_token"
> & {
  readonly challenge_version_id: ChallengeVersionId;
  readonly rubric_version_id: RubricVersionId;
  readonly shortlist_version_id: DecisionShortlistVersionId | null;
  readonly outcome: DecisionOutcome;
  readonly selected_proposal_id: ProposalId | null;
  readonly selected_proposal_version_id: ProposalVersionId | null;
  readonly reason_code: DecisionReasonCode;
  readonly rationale: string;
  readonly proposal_feedback: readonly ProposalDecisionFeedback[];
};

export type RecordChallengeDecisionNextAction = "open_case" | "decision_complete";
export type RecordChallengeDecisionSuccessEnvelope = MutationSuccessEnvelope<
  ChallengeId,
  RecordChallengeDecisionNextAction
>;

export type BrowserDecisionStepUpStartBody = Pick<VersionedCommand, "expected_version">;
export type BrowserDecisionStepUpStartResult = {
  readonly authorization_url: string;
  readonly expires_at: string;
};
export type BrowserDecisionStepUpStartSuccessEnvelope = {
  readonly ok: true;
  readonly data: BrowserDecisionStepUpStartResult;
  readonly meta: VersionedApiMeta;
};

export type ProposalOutcomeResource = {
  readonly proposal_id: ProposalId;
  readonly proposal_version_id: ProposalVersionId;
  readonly tracking_code: string;
  readonly status: "pending" | ProposalDecisionOutcome;
  readonly feedback: string | null;
  readonly decided_at: string | null;
  readonly case_id: CaseId | null;
  readonly version: number;
};

export type ProposalOutcomeSuccessEnvelope = {
  readonly ok: true;
  readonly data: ProposalOutcomeResource;
  readonly meta: VersionedApiMeta;
};
