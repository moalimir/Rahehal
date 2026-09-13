-- D4 activates Operations-owned reviewer assignment commands. Assignment
-- identity/version bindings remain immutable; cancellation is the only update
-- and records its actor, reason, time, and optional append-only replacement.
ALTER TABLE review_assignment
  ADD COLUMN challenge_id text,
  ADD COLUMN proposal_id text,
  ADD COLUMN replaces_assignment_id text,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN cancelled_by_user_id text,
  ADD COLUMN cancelled_at timestamptz;

UPDATE review_assignment assignment
SET challenge_id = proposal.challenge_id,
    proposal_id = proposal.id
FROM proposal_version version
JOIN proposal ON proposal.id = version.proposal_id
WHERE version.id = assignment.proposal_version_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_assignment
    WHERE challenge_id IS NULL OR proposal_id IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot bind existing review assignments to proposals'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE review_assignment
  ALTER COLUMN challenge_id SET NOT NULL,
  ALTER COLUMN proposal_id SET NOT NULL,
  ADD CONSTRAINT review_assignment_evaluation_proposal_fk
    FOREIGN KEY (challenge_id, proposal_id)
    REFERENCES evaluation_proposal (challenge_id, proposal_id),
  ADD CONSTRAINT review_assignment_replacement_fk
    FOREIGN KEY (replaces_assignment_id)
    REFERENCES review_assignment (id),
  ADD CONSTRAINT review_assignment_cancelled_by_fk
    FOREIGN KEY (cancelled_by_user_id)
    REFERENCES app_user (id),
  ADD CONSTRAINT review_assignment_single_replacement UNIQUE (replaces_assignment_id),
  ADD CONSTRAINT review_assignment_cancellation_evidence CHECK (
    (
      state = 'cancelled'
      AND cancellation_reason IS NOT NULL
      AND length(btrim(cancellation_reason)) BETWEEN 1 AND 2000
      AND cancelled_by_user_id IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_at >= created_at
    )
    OR (
      state <> 'cancelled'
      AND cancellation_reason IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancelled_at IS NULL
    )
  );

ALTER TABLE review_assignment DROP CONSTRAINT d1_assignment_initial_state;
ALTER TABLE review_assignment
  ADD CONSTRAINT d4_assignment_state CHECK (state IN ('coi-gate', 'cancelled'));

DROP TRIGGER review_assignment_immutable ON review_assignment;

CREATE FUNCTION protect_d4_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review assignments are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.state <> 'coi-gate'
     OR NEW.state <> 'cancelled'
     OR NEW.lock_version <> OLD.lock_version + 1
     OR (to_jsonb(NEW) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) THEN
    RAISE EXCEPTION 'review assignment evidence is append-only'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION protect_d4_assignment();

CREATE OR REPLACE FUNCTION validate_d1_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'coi-gate'
     OR NEW.lock_version <> 1
     OR NEW.cancellation_reason IS NOT NULL
     OR NEW.cancelled_by_user_id IS NOT NULL
     OR NEW.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'new assignments must begin at the COI gate'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM challenge_evaluation snapshot
    JOIN evaluation_proposal roster
      ON roster.challenge_id = snapshot.challenge_id
    JOIN proposal proposal
      ON proposal.id = roster.proposal_id
    WHERE snapshot.challenge_id = NEW.challenge_id
      AND snapshot.tenant_id = NEW.tenant_id
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
      AND membership.role = 'platform:reviewer'
      AND membership.state = 'active'
    FOR SHARE OF membership
  ) THEN
    RAISE EXCEPTION 'assignment requires an active reviewer membership'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.replaces_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_assignment previous
    WHERE previous.id = NEW.replaces_assignment_id
      AND previous.challenge_id = NEW.challenge_id
      AND previous.proposal_id = NEW.proposal_id
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

CREATE FUNCTION validate_d4_assignment_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_reviews smallint;
  active_reviews bigint;
BEGIN
  SELECT required_reviews INTO allowed_reviews
  FROM challenge_evaluation
  WHERE challenge_id = NEW.challenge_id;
  SELECT count(*) INTO active_reviews
  FROM review_assignment
  WHERE challenge_id = NEW.challenge_id
    AND proposal_id = NEW.proposal_id
    AND state NOT IN ('cancelled', 'invalidated');
  IF allowed_reviews IS NULL OR active_reviews > allowed_reviews THEN
    RAISE EXCEPTION 'active assignments exceed the evaluation review requirement'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER review_assignment_capacity
AFTER INSERT OR UPDATE OF state ON review_assignment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_d4_assignment_capacity();

CREATE INDEX review_assignment_challenge_idx
  ON review_assignment (challenge_id, proposal_id, state, id);
