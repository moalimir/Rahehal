DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM decision_shortlist_version LIMIT 1)
     OR EXISTS (SELECT 1 FROM decision LIMIT 1)
     OR EXISTS (SELECT 1 FROM case_record LIMIT 1)
     OR EXISTS (SELECT 1 FROM step_up_attempt LIMIT 1) THEN
    RAISE EXCEPTION 'cannot remove D8-D9 while step-up, shortlist, decision, or case evidence exists'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER challenge_decided_stage_guard ON challenge;
DROP FUNCTION validate_decided_stage_transition();
DROP TRIGGER review_invalidation_after_decision_guard ON review_scorecard;
DROP FUNCTION prevent_review_invalidation_after_decision();
DROP TRIGGER step_up_attempt_immutable ON step_up_attempt;
DROP FUNCTION protect_step_up_attempt();
DROP TRIGGER case_record_immutable ON case_record;
DROP TRIGGER decision_proposal_outcome_immutable ON decision_proposal_outcome;
DROP TRIGGER decision_review_evidence_immutable ON decision_review_evidence;
DROP TRIGGER decision_immutable ON decision;
DROP TRIGGER decision_shortlist_immutable ON decision_shortlist_version;
DROP FUNCTION protect_d8_d9_evidence();
DROP TRIGGER d9_case_access_grant_validated ON access_grant;
DROP FUNCTION validate_case_access_grant();
DROP TRIGGER case_insert_guard ON case_record;
DROP FUNCTION validate_case_insert();
DROP TRIGGER decision_proposal_outcome_insert_guard ON decision_proposal_outcome;
DROP FUNCTION validate_decision_proposal_outcome_insert();
DROP TRIGGER decision_review_evidence_insert_guard ON decision_review_evidence;
DROP FUNCTION validate_decision_review_evidence_insert();
DROP TRIGGER final_decision_insert_guard ON decision;
DROP FUNCTION validate_final_decision_insert();
DROP TRIGGER decision_shortlist_insert_guard ON decision_shortlist_version;
DROP FUNCTION validate_decision_shortlist_insert();
DROP FUNCTION valid_decision_proposal_references(text, jsonb);
DROP FUNCTION decision_reviews_complete(text, text);
DROP TRIGGER step_up_attempt_insert_guard ON step_up_attempt;
DROP FUNCTION validate_step_up_attempt_insert();
DROP TABLE decision_proposal_outcome;
DROP TABLE case_record;
DROP TABLE decision_review_evidence;
ALTER TABLE step_up_attempt DROP CONSTRAINT step_up_consumed_decision_fk;
DROP TABLE decision;
DROP TABLE decision_shortlist_version;
DROP TABLE step_up_attempt;
