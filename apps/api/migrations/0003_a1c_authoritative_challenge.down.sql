DROP TRIGGER IF EXISTS mutation_receipt_append_only ON mutation_receipt;
DROP FUNCTION IF EXISTS prevent_mutation_receipt_mutation();
DROP TABLE IF EXISTS mutation_receipt;

DROP TRIGGER IF EXISTS challenge_version_append_only ON challenge_version;
DROP FUNCTION IF EXISTS prevent_challenge_version_mutation();

CREATE FUNCTION prevent_locked_challenge_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked challenge versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER challenge_version_immutable_when_locked
BEFORE UPDATE OR DELETE ON challenge_version
FOR EACH ROW EXECUTE FUNCTION prevent_locked_challenge_version_mutation();

ALTER TABLE challenge
  DROP CONSTRAINT IF EXISTS challenge_lock_version_positive_ck;

ALTER TABLE challenge_version
  DROP CONSTRAINT IF EXISTS challenge_version_content_shape_ck,
  DROP COLUMN IF EXISTS authoring_status;
