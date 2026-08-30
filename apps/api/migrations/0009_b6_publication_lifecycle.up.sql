-- B6: the lifecycle of an already-published challenge.
--
-- These live on `challenge`, not on `challenge_version` or `eligibility_rule`,
-- because both of those are append-only evidence bound to one approved version.
-- Extending a deadline or pausing a call must not fabricate a new version that
-- the four publication gates never approved, and must not mutate the version
-- they did approve. So the approved content stays frozen and the *call's*
-- current state lives beside it.
ALTER TABLE challenge
  ADD COLUMN publication_state text
    CHECK (publication_state IN ('open', 'paused', 'closed', 'cancelled')),
  ADD COLUMN proposal_deadline_at timestamptz;

-- Backfill BEFORE the pairing constraint. Challenges published under 0008
-- already exist, and adding the constraint first would reject every one of
-- them: they are open calls whose deadline is the one their approved version
-- carries.
UPDATE challenge
SET publication_state = 'open',
    proposal_deadline_at = (version.content ->> 'proposal_deadline')::timestamptz
FROM challenge_version AS version
WHERE version.id = challenge.published_version_id
  AND challenge.published_version_id IS NOT NULL;

-- Both columns are meaningless before publication and required after it.
ALTER TABLE challenge
  ADD CONSTRAINT challenge_publication_state_ck CHECK (
    (published_version_id IS NULL AND publication_state IS NULL AND proposal_deadline_at IS NULL)
    OR (published_version_id IS NOT NULL AND publication_state IS NOT NULL
        AND proposal_deadline_at IS NOT NULL)
  );

-- Terminal states stay terminal, and a deadline never moves backwards. Doing
-- this in the database as well as the command means a direct SQL write cannot
-- quietly reopen a cancelled call or shorten a deadline solvers already saw.
CREATE FUNCTION validate_challenge_publication_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.publication_state IS NOT NULL THEN
    IF OLD.publication_state IN ('closed', 'cancelled')
       AND NEW.publication_state IS DISTINCT FROM OLD.publication_state THEN
      RAISE EXCEPTION 'a % challenge cannot change publication state', OLD.publication_state
        USING ERRCODE = '23514';
    END IF;
    IF NEW.proposal_deadline_at < OLD.proposal_deadline_at THEN
      RAISE EXCEPTION 'a proposal deadline can only move forward'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER challenge_publication_lifecycle_guard
BEFORE UPDATE ON challenge
FOR EACH ROW EXECUTE FUNCTION validate_challenge_publication_lifecycle();

-- The public projection mirrors the call's state so discovery filters on one
-- indexed column instead of joining the private aggregate.
ALTER TABLE challenge_public_projection
  ADD COLUMN state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'paused', 'closed', 'cancelled'));

ALTER TABLE challenge_public_projection ALTER COLUMN state DROP DEFAULT;

DROP INDEX challenge_public_projection_discovery_idx;
CREATE INDEX challenge_public_projection_discovery_idx
  ON challenge_public_projection (state, visibility, proposal_deadline DESC);

-- B4 made this table strictly append-only and noted that B6 would replace the
-- trigger once states that legitimately mutate a published row existed. This is
-- that replacement: `state` and `proposal_deadline` may change, every other
-- column stays immutable, and deletes remain forbidden.
DROP TRIGGER challenge_public_projection_append_only ON challenge_public_projection;
DROP FUNCTION prevent_challenge_public_projection_mutation();

CREATE FUNCTION protect_challenge_public_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['state', 'proposal_deadline'])
       = (to_jsonb(OLD) - ARRAY['state', 'proposal_deadline']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'challenge public projections accept only state and deadline changes'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_public_projection_protected
BEFORE UPDATE OR DELETE ON challenge_public_projection
FOR EACH ROW EXECUTE FUNCTION protect_challenge_public_projection();
