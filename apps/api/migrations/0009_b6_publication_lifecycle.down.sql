DROP TRIGGER challenge_public_projection_protected ON challenge_public_projection;
DROP FUNCTION protect_challenge_public_projection();

CREATE FUNCTION prevent_challenge_public_projection_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'challenge public projections are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_public_projection_append_only
BEFORE UPDATE OR DELETE ON challenge_public_projection
FOR EACH ROW EXECUTE FUNCTION prevent_challenge_public_projection_mutation();

DROP INDEX challenge_public_projection_discovery_idx;
CREATE INDEX challenge_public_projection_discovery_idx
  ON challenge_public_projection (visibility, proposal_deadline DESC);

ALTER TABLE challenge_public_projection DROP COLUMN state;

DROP TRIGGER challenge_publication_lifecycle_guard ON challenge;
DROP FUNCTION validate_challenge_publication_lifecycle();

ALTER TABLE challenge
  DROP CONSTRAINT challenge_publication_state_ck,
  DROP COLUMN proposal_deadline_at,
  DROP COLUMN publication_state;
