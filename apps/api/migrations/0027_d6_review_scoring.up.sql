-- D6 activates assignment-scoped score drafts, immutable submission, explicit
-- Operations lock/invalidation, and append-only replacement after invalidation.
CREATE FUNCTION valid_review_scores(criteria jsonb, scores jsonb, complete boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE item jsonb; seen text[] := '{}'; criterion_count integer;
BEGIN
  IF NOT valid_mvp_rubric_criteria(criteria)
     OR jsonb_typeof(scores) <> 'array'
     OR jsonb_array_length(scores) > jsonb_array_length(criteria) THEN
    RETURN false;
  END IF;
  criterion_count := jsonb_array_length(criteria);
  IF complete AND jsonb_array_length(scores) <> criterion_count THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(scores) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 3
       OR NOT item ?& ARRAY['criterion_id','value','rationale'] THEN RETURN false; END IF;
    IF jsonb_typeof(item->'criterion_id') <> 'string'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(criteria) criterion
         WHERE criterion->>'id' = item->>'criterion_id'
       )
       OR item->>'criterion_id' = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen, item->>'criterion_id');
    IF jsonb_typeof(item->'value') <> 'number'
       OR (item->>'value')::numeric NOT BETWEEN 0 AND 5
       OR mod((item->>'value')::numeric, 1) <> 0 THEN RETURN false; END IF;
    IF jsonb_typeof(item->'rationale') <> 'string'
       OR length(item->>'rationale') > 4000
       OR (complete AND length(btrim(item->>'rationale')) < 1) THEN RETURN false; END IF;
  END LOOP;
  RETURN NOT complete OR cardinality(seen) = criterion_count;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$$;

CREATE FUNCTION review_weighted_score_tenths(criteria jsonb, scores jsonb)
RETURNS smallint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE weighted integer;
BEGIN
  IF NOT valid_review_scores(criteria, scores, true) THEN RETURN NULL; END IF;
  SELECT sum((criterion->>'weight')::integer * (score->>'value')::integer) * 2
  INTO weighted
  FROM jsonb_array_elements(criteria) criterion
  JOIN jsonb_array_elements(scores) score
    ON score->>'criterion_id' = criterion->>'id';
  RETURN weighted::smallint;
END;
$$;

CREATE TABLE review_scorecard (
  id text PRIMARY KEY CHECK (id ~ '^rev_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  assignment_id text NOT NULL UNIQUE REFERENCES review_assignment (id),
  scores jsonb NOT NULL CHECK (jsonb_typeof(scores) = 'array'),
  review_version bigint NOT NULL DEFAULT 1 CHECK (review_version > 0),
  weighted_score_tenths smallint CHECK (weighted_score_tenths BETWEEN 0 AND 1000),
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  submitted_by_user_id text REFERENCES app_user (id),
  submitted_at timestamptz,
  locked_by_user_id text REFERENCES app_user (id),
  lock_reason text,
  locked_at timestamptz,
  invalidated_by_user_id text REFERENCES app_user (id),
  invalidation_reason text,
  invalidated_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK (
    (submitted_at IS NULL AND submitted_by_user_id IS NULL AND weighted_score_tenths IS NULL)
    OR (submitted_at IS NOT NULL AND submitted_by_user_id IS NOT NULL
        AND weighted_score_tenths IS NOT NULL AND submitted_at >= created_at)
  ),
  CHECK (
    (locked_at IS NULL AND locked_by_user_id IS NULL AND lock_reason IS NULL)
    OR (locked_at IS NOT NULL AND locked_by_user_id IS NOT NULL
        AND length(btrim(lock_reason)) BETWEEN 1 AND 2000
        AND submitted_at IS NOT NULL AND locked_at >= submitted_at)
  ),
  CHECK (
    (invalidated_at IS NULL AND invalidated_by_user_id IS NULL AND invalidation_reason IS NULL)
    OR (invalidated_at IS NOT NULL AND invalidated_by_user_id IS NOT NULL
        AND length(btrim(invalidation_reason)) BETWEEN 1 AND 2000
        AND locked_at IS NOT NULL AND invalidated_at >= locked_at)
  )
);

CREATE FUNCTION protect_d6_scorecard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE assignment review_assignment%ROWTYPE; criteria jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review scorecards are append-only after creation' USING ERRCODE = '55000';
  END IF;
  SELECT item.* INTO assignment FROM review_assignment item WHERE item.id = NEW.assignment_id;
  SELECT rubric_version.criteria INTO criteria
  FROM rubric_version WHERE rubric_version.id = assignment.rubric_version_id;
  IF assignment.id IS NULL OR criteria IS NULL THEN
    RAISE EXCEPTION 'review scorecard requires exact assignment evidence' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF assignment.state <> 'accepted'
       OR assignment.reviewer_user_id <> NEW.created_by_user_id
       OR NOT EXISTS (
         SELECT 1 FROM membership membership
         WHERE membership.id = assignment.reviewer_membership_id
           AND membership.user_id = assignment.reviewer_user_id
           AND membership.role = 'platform:reviewer' AND membership.state = 'active'
       )
       OR NEW.review_version <> 1
       OR NEW.created_at <> NEW.updated_at
       OR NOT valid_review_scores(criteria, NEW.scores, false)
       OR NEW.submitted_at IS NOT NULL OR NEW.locked_at IS NOT NULL OR NEW.invalidated_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid initial review scorecard' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.submitted_at IS NULL AND NEW.submitted_at IS NULL
     AND assignment.state = 'draft'
     AND EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.id = assignment.reviewer_membership_id
         AND membership.user_id = assignment.reviewer_user_id
         AND membership.role = 'platform:reviewer' AND membership.state = 'active'
     )
     AND NEW.review_version = OLD.review_version + 1
     AND NEW.updated_at >= OLD.updated_at
     AND valid_review_scores(criteria, NEW.scores, false)
     AND (to_jsonb(NEW) - ARRAY['scores','review_version','updated_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['scores','review_version','updated_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL
     AND assignment.state = 'draft'
     AND EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.id = assignment.reviewer_membership_id
         AND membership.user_id = assignment.reviewer_user_id
         AND membership.role = 'platform:reviewer' AND membership.state = 'active'
     )
     AND NEW.review_version = OLD.review_version + 1
     AND NEW.updated_at = NEW.submitted_at
     AND NEW.submitted_by_user_id = assignment.reviewer_user_id
     AND NEW.weighted_score_tenths = review_weighted_score_tenths(criteria, NEW.scores)
     AND NEW.scores IS NOT DISTINCT FROM OLD.scores
     AND (to_jsonb(NEW) - ARRAY[
       'review_version','weighted_score_tenths','updated_at','submitted_by_user_id','submitted_at'
     ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'review_version','weighted_score_tenths','updated_at','submitted_by_user_id','submitted_at'
     ]) THEN
    RETURN NEW;
  END IF;
  IF OLD.locked_at IS NULL AND NEW.locked_at IS NOT NULL
     AND assignment.state = 'submitted'
     AND NEW.locked_by_user_id <> assignment.reviewer_user_id
     AND EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.user_id = NEW.locked_by_user_id
         AND membership.workspace_kind = 'platform'
         AND membership.role = 'platform:ops' AND membership.state = 'active'
     )
     AND NEW.updated_at = NEW.locked_at
     AND (to_jsonb(NEW) - ARRAY['updated_at','locked_by_user_id','lock_reason','locked_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','locked_by_user_id','lock_reason','locked_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL
     AND assignment.state = 'locked'
     AND NEW.invalidated_by_user_id <> assignment.reviewer_user_id
     AND EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.user_id = NEW.invalidated_by_user_id
         AND membership.workspace_kind = 'platform'
         AND membership.role = 'platform:ops' AND membership.state = 'active'
     )
     AND NOT EXISTS (
       SELECT 1 FROM membership membership
       JOIN challenge challenge ON challenge.workspace_id = membership.workspace_id
       WHERE challenge.id = assignment.challenge_id
         AND membership.user_id = NEW.invalidated_by_user_id
         AND membership.role IN ('org:owner','org:member')
         AND membership.state = 'active'
     )
     AND NEW.updated_at = NEW.invalidated_at
     AND (to_jsonb(NEW) - ARRAY[
       'updated_at','invalidated_by_user_id','invalidation_reason','invalidated_at'
     ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'updated_at','invalidated_by_user_id','invalidation_reason','invalidated_at'
     ]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'submitted review evidence is immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER review_scorecard_immutable
BEFORE INSERT OR UPDATE OR DELETE ON review_scorecard
FOR EACH ROW EXECUTE FUNCTION protect_d6_scorecard();

ALTER TABLE review_assignment DROP CONSTRAINT d5_assignment_state;
ALTER TABLE review_assignment
  ADD CONSTRAINT d6_assignment_state CHECK (
    state IN ('coi-gate','accepted','draft','submitted','locked','invalidated','cancelled')
  );

DROP TRIGGER review_assignment_immutable ON review_assignment;
DROP FUNCTION protect_d5_assignment();
CREATE FUNCTION protect_d6_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review assignments are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('coi-gate', 'accepted', 'draft') AND NEW.state = 'cancelled'
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
  IF OLD.state = 'accepted' AND NEW.state = 'draft'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY['state','lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','lock_version'])
     AND EXISTS (SELECT 1 FROM review_scorecard review
                 WHERE review.assignment_id = OLD.id AND review.submitted_at IS NULL)
     THEN RETURN NEW; END IF;
  IF OLD.state = 'draft' AND NEW.state = 'draft'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - 'lock_version') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'lock_version')
     AND EXISTS (SELECT 1 FROM review_scorecard review
                 WHERE review.assignment_id = OLD.id AND review.submitted_at IS NULL)
     THEN RETURN NEW; END IF;
  IF OLD.state = 'draft' AND NEW.state = 'submitted'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY['state','lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','lock_version'])
     AND EXISTS (SELECT 1 FROM review_scorecard review
                 WHERE review.assignment_id = OLD.id AND review.submitted_at IS NOT NULL
                   AND review.locked_at IS NULL)
     THEN RETURN NEW; END IF;
  IF OLD.state = 'submitted' AND NEW.state = 'locked'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY['state','lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','lock_version'])
     AND EXISTS (SELECT 1 FROM review_scorecard review
                 WHERE review.assignment_id = OLD.id AND review.locked_at IS NOT NULL
                   AND review.invalidated_at IS NULL)
     THEN RETURN NEW; END IF;
  IF OLD.state = 'locked' AND NEW.state = 'invalidated'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY['state','lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','lock_version'])
     AND EXISTS (SELECT 1 FROM review_scorecard review
                 WHERE review.assignment_id = OLD.id AND review.invalidated_at IS NOT NULL)
     THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'review assignment evidence is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION protect_d6_assignment();

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
      AND previous.state IN ('cancelled','invalidated')
  ) THEN
    RAISE EXCEPTION 'replacement must cite cancelled or invalidated evidence for the same proposal'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
