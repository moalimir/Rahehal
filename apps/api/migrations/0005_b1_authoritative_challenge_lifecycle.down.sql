DROP TRIGGER IF EXISTS challenge_version_evidence_protected ON challenge_version;
DROP FUNCTION IF EXISTS protect_challenge_version_evidence();

CREATE FUNCTION prevent_challenge_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'challenge versions are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_version_append_only
BEFORE UPDATE OR DELETE ON challenge_version
FOR EACH ROW EXECUTE FUNCTION prevent_challenge_version_mutation();
