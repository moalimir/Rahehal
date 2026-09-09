DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM review_assignment LIMIT 1) THEN
    RAISE EXCEPTION 'cannot remove D4 while assignment evidence exists'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP INDEX review_assignment_challenge_idx;
DROP TRIGGER review_assignment_capacity ON review_assignment;
DROP FUNCTION validate_d4_assignment_capacity();
DROP TRIGGER review_assignment_immutable ON review_assignment;
DROP FUNCTION protect_d4_assignment();

CREATE OR REPLACE FUNCTION validate_d1_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM proposal_version pv
    JOIN proposal p ON p.id = pv.proposal_id
    JOIN challenge c ON c.id = p.challenge_id
    JOIN rubric_version rv ON rv.id = NEW.rubric_version_id
    JOIN rubric r ON r.id = rv.rubric_id
    WHERE pv.id = NEW.proposal_version_id AND pv.locked_at IS NOT NULL
      AND c.tenant_id = NEW.tenant_id AND r.tenant_id = NEW.tenant_id
      AND r.challenge_id = c.id
      AND r.challenge_version_id = pv.accepted_challenge_version_id
  ) THEN
    RAISE EXCEPTION 'assignment requires matching locked proposal and rubric terms'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM membership m
    WHERE m.id = NEW.reviewer_membership_id AND m.user_id = NEW.reviewer_user_id
      AND m.workspace_kind = 'platform' AND m.role = 'platform:reviewer' AND m.state = 'active'
    FOR SHARE OF m
  ) THEN
    RAISE EXCEPTION 'assignment requires an active reviewer membership'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();

ALTER TABLE review_assignment DROP CONSTRAINT d4_assignment_state;
ALTER TABLE review_assignment DROP CONSTRAINT review_assignment_cancellation_evidence;
ALTER TABLE review_assignment DROP CONSTRAINT review_assignment_single_replacement;
ALTER TABLE review_assignment DROP CONSTRAINT review_assignment_cancelled_by_fk;
ALTER TABLE review_assignment DROP CONSTRAINT review_assignment_replacement_fk;
ALTER TABLE review_assignment DROP CONSTRAINT review_assignment_evaluation_proposal_fk;
ALTER TABLE review_assignment
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by_user_id,
  DROP COLUMN cancellation_reason,
  DROP COLUMN replaces_assignment_id,
  DROP COLUMN proposal_id,
  DROP COLUMN challenge_id;
ALTER TABLE review_assignment
  ADD CONSTRAINT d1_assignment_initial_state CHECK (state = 'coi-gate');
