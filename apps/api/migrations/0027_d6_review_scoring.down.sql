DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM review_scorecard LIMIT 1)
     OR EXISTS (SELECT 1 FROM review_assignment WHERE state IN ('draft','submitted','locked','invalidated')) THEN
    RAISE EXCEPTION 'cannot remove D6 while scoring evidence exists' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_d1_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'coi-gate' OR NEW.lock_version <> 1
     OR NEW.cancellation_reason IS NOT NULL OR NEW.cancelled_by_user_id IS NOT NULL
     OR NEW.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'new assignments must begin at the COI gate' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM challenge_evaluation snapshot
    JOIN evaluation_proposal roster ON roster.challenge_id = snapshot.challenge_id
    JOIN proposal proposal ON proposal.id = roster.proposal_id
    WHERE snapshot.challenge_id = NEW.challenge_id AND snapshot.tenant_id = NEW.tenant_id
      AND snapshot.rubric_version_id = NEW.rubric_version_id
      AND roster.proposal_id = NEW.proposal_id
      AND roster.proposal_version_id = NEW.proposal_version_id
      AND proposal.current_version_id = NEW.proposal_version_id
  ) THEN
    RAISE EXCEPTION 'assignment requires the frozen evaluation proposal and rubric'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM membership membership
    WHERE membership.id = NEW.reviewer_membership_id
      AND membership.user_id = NEW.reviewer_user_id
      AND membership.workspace_kind = 'platform'
      AND membership.role = 'platform:reviewer' AND membership.state = 'active'
    FOR SHARE OF membership
  ) THEN
    RAISE EXCEPTION 'assignment requires an active reviewer membership' USING ERRCODE = '23514';
  END IF;
  IF NEW.replaces_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_assignment previous
    WHERE previous.id = NEW.replaces_assignment_id
      AND previous.challenge_id = NEW.challenge_id AND previous.proposal_id = NEW.proposal_id
      AND previous.proposal_version_id = NEW.proposal_version_id
      AND previous.rubric_version_id = NEW.rubric_version_id
      AND previous.reviewer_user_id <> NEW.reviewer_user_id
      AND previous.state = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'replacement must cite a cancelled assignment for the same evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER review_assignment_immutable ON review_assignment;
DROP FUNCTION protect_d6_assignment();
ALTER TABLE review_assignment DROP CONSTRAINT d6_assignment_state;
ALTER TABLE review_assignment
  ADD CONSTRAINT d5_assignment_state CHECK (state IN ('coi-gate','accepted','cancelled'));

CREATE FUNCTION protect_d5_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review assignments are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('coi-gate','accepted') AND NEW.state = 'cancelled'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY[
       'state','lock_version','cancellation_reason','cancelled_by_user_id','cancelled_at'
     ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'state','lock_version','cancellation_reason','cancelled_by_user_id','cancelled_at'
     ]) THEN RETURN NEW; END IF;
  IF OLD.state = 'coi-gate' AND OLD.lock_version = 1
     AND NEW.state = 'accepted' AND NEW.lock_version = 2
     AND (to_jsonb(NEW) - ARRAY['state','lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','lock_version'])
     AND EXISTS (SELECT 1 FROM coi_declaration declaration
                 WHERE declaration.assignment_id = OLD.id AND declaration.coi_status = 'clear')
     THEN RETURN NEW; END IF;
  IF OLD.state = 'coi-gate' AND OLD.lock_version = 1
     AND NEW.state = 'coi-gate' AND NEW.lock_version = 2
     AND (to_jsonb(NEW) - 'lock_version') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'lock_version')
     AND EXISTS (SELECT 1 FROM coi_declaration declaration
                 WHERE declaration.assignment_id = OLD.id AND declaration.coi_status = 'conflict')
     THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'review assignment evidence is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION protect_d5_assignment();

DROP TRIGGER review_scorecard_immutable ON review_scorecard;
DROP FUNCTION protect_d6_scorecard();
DROP TABLE review_scorecard;
DROP FUNCTION review_weighted_score_tenths(jsonb, jsonb);
DROP FUNCTION valid_review_scores(jsonb, jsonb, boolean);
