CREATE OR REPLACE FUNCTION protect_proposal_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL
     AND OLD.lock_reason IS NULL
     AND OLD.accepted_challenge_version_id IS NULL
     AND NEW.locked_at IS NOT NULL
     AND NEW.lock_reason IS NOT NULL
     AND NEW.accepted_challenge_version_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY[
       'locked_at', 'lock_reason', 'accepted_challenge_version_id'
     ]) = (to_jsonb(OLD) - ARRAY[
       'locked_at', 'lock_reason', 'accepted_challenge_version_id'
     ]) THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id,
      NEW.accepted_challenge_version_id
    );
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION validate_locked_proposal_version(
  target_proposal_id text,
  accepted_version_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  published_version text;
  call_state text;
  call_deadline timestamptz;
BEGIN
  SELECT challenge.published_version_id,
         challenge.publication_state,
         challenge.proposal_deadline_at
  INTO published_version, call_state, call_deadline
  FROM proposal
  JOIN challenge ON challenge.id = proposal.challenge_id
  WHERE proposal.id = target_proposal_id
  FOR UPDATE OF challenge;

  IF published_version IS NULL OR accepted_version_id IS DISTINCT FROM published_version THEN
    RAISE EXCEPTION 'a locked proposal version must accept the current published challenge version'
      USING ERRCODE = '23514';
  END IF;
  IF call_state <> 'open' OR call_deadline IS NULL OR call_deadline <= clock_timestamp() THEN
    RAISE EXCEPTION 'a proposal can only be submitted while the call is open and unexpired'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_proposal_version_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
BEGIN
  PERFORM 1
  FROM proposal
  WHERE id = NEW.proposal_id AND challenge_id = NEW.challenge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal version requires its proposal aggregate' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO next_version
  FROM proposal_version
  WHERE proposal_id = NEW.proposal_id;
  IF NEW.version_number <> next_version THEN
    RAISE EXCEPTION 'proposal versions must be inserted without gaps' USING ERRCODE = '23514';
  END IF;

  IF NEW.locked_at IS NOT NULL THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id,
      NEW.accepted_challenge_version_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER c4_proposal_access_grant_validated ON access_grant;
DROP FUNCTION validate_c4_proposal_access_grant();
ALTER TABLE access_grant
  DROP CONSTRAINT access_grant_proposal_version_shape,
  DROP CONSTRAINT access_grant_proposal_version_fk,
  DROP COLUMN proposal_version_id;
DROP SEQUENCE proposal_tracking_sequence;
