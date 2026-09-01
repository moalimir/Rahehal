-- Eligibility is governed when a version enters approvals, not on every
-- autosave-created version. Existing rows remain immutable evidence.
DROP TRIGGER challenge_version_create_eligibility_rule ON challenge_version;
DROP FUNCTION create_eligibility_rule_for_challenge_version();

-- Public discovery uses an immutable keyset. Category matching is normalized
-- by the query and this expression index keeps that lookup bounded.
DROP INDEX challenge_public_projection_discovery_idx;
CREATE INDEX challenge_public_projection_discovery_idx
  ON challenge_public_projection (state, visibility, published_at DESC, challenge_id DESC);
DROP INDEX challenge_public_projection_category_idx;
CREATE INDEX challenge_public_projection_category_idx
  ON challenge_public_projection (lower(btrim(category)));

-- Both a newly inserted projection and an allowed mutable-field update must
-- match the authoritative live-call state. DELETE and every other update stay
-- forbidden.
DROP TRIGGER challenge_public_projection_protected ON challenge_public_projection;
CREATE OR REPLACE FUNCTION protect_challenge_public_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  aggregate_state text;
  aggregate_deadline timestamptz;
BEGIN
  IF TG_OP = 'INSERT'
     OR (
       TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - ARRAY['state', 'proposal_deadline'])
         = (to_jsonb(OLD) - ARRAY['state', 'proposal_deadline'])
     ) THEN
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

CREATE TRIGGER challenge_public_projection_protected
BEFORE INSERT OR UPDATE OR DELETE ON challenge_public_projection
FOR EACH ROW EXECUTE FUNCTION protect_challenge_public_projection();

-- Direct SQL cannot publish an expired or unsnapshotted version. Application
-- checks return the typed problem; this trigger is the database backstop.
CREATE OR REPLACE FUNCTION validate_challenge_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_gates integer;
  governed_version boolean;
BEGIN
  IF NEW.published_version_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.published_version_id IS NOT DISTINCT FROM OLD.published_version_id THEN
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT gate)
  INTO approved_gates
  FROM challenge_approval
  WHERE challenge_version_id = NEW.published_version_id
    AND decision = 'approved';

  SELECT EXISTS (
    SELECT 1 FROM eligibility_rule WHERE challenge_version_id = NEW.published_version_id
  )
  INTO governed_version;

  IF approved_gates <> 4 THEN
    RAISE EXCEPTION 'a published version requires all four approved publication gates'
      USING ERRCODE = '23514';
  END IF;
  IF NOT governed_version THEN
    RAISE EXCEPTION 'a published version requires an eligibility rule snapshot'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.proposal_deadline_at IS NULL OR NEW.proposal_deadline_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'a published version requires a future proposal deadline'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
