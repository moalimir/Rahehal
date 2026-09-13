DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM challenge_evaluation LIMIT 1) THEN
    RAISE EXCEPTION 'cannot remove D3 while evaluation evidence exists'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER evaluation_proposal_aggregate_frozen ON proposal;
DROP FUNCTION protect_evaluation_proposal_aggregate();
DROP TRIGGER evaluation_proposal_version_frozen ON proposal_version;
DROP FUNCTION freeze_evaluation_proposal_version();
DROP TRIGGER evaluation_rubric_version_frozen ON rubric_version;
DROP FUNCTION freeze_evaluation_rubric_version();
DROP TRIGGER evaluation_proposal_immutable ON evaluation_proposal;
DROP TRIGGER challenge_evaluation_immutable ON challenge_evaluation;
DROP FUNCTION protect_evaluation_snapshot();
DROP TRIGGER challenge_evaluation_committed ON challenge_evaluation;
DROP FUNCTION require_committed_evaluation_stage();
DROP TRIGGER challenge_evaluation_stage_guard ON challenge;
DROP FUNCTION validate_evaluation_stage_transition();
DROP TRIGGER evaluation_proposal_binding ON evaluation_proposal;
DROP FUNCTION validate_evaluation_proposal_insert();
DROP TRIGGER challenge_evaluation_binding ON challenge_evaluation;
DROP FUNCTION validate_challenge_evaluation_insert();
DROP TABLE evaluation_proposal;
DROP TABLE challenge_evaluation;
