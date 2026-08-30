-- Phase 2 closure: a mutable projection field must mirror the authoritative
-- challenge row. The 0009 trigger limited *which* fields could change but did
-- not prove that their new values came from the aggregate.
CREATE OR REPLACE FUNCTION protect_challenge_public_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  aggregate_state text;
  aggregate_deadline timestamptz;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['state', 'proposal_deadline'])
       = (to_jsonb(OLD) - ARRAY['state', 'proposal_deadline']) THEN
    SELECT publication_state, proposal_deadline_at
    INTO aggregate_state, aggregate_deadline
    FROM challenge
    WHERE id = NEW.challenge_id;

    IF aggregate_state IS NULL
       OR NEW.state IS DISTINCT FROM aggregate_state
       OR NEW.proposal_deadline IS DISTINCT FROM aggregate_deadline THEN
      RAISE EXCEPTION 'challenge public projection must match its authoritative aggregate'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'challenge public projections accept only synchronized state and deadline changes'
    USING ERRCODE = '55000';
END;
$$;
