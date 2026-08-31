DROP TRIGGER challenge_version_append_only ON challenge_version;
DROP FUNCTION prevent_challenge_version_mutation();

CREATE FUNCTION protect_challenge_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL
     AND OLD.lock_reason IS NULL
     AND NEW.locked_at IS NOT NULL
     AND NEW.lock_reason IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['locked_at', 'lock_reason']) =
         (to_jsonb(OLD) - ARRAY['locked_at', 'lock_reason']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'challenge version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_version_evidence_protected
BEFORE UPDATE OR DELETE ON challenge_version
FOR EACH ROW EXECUTE FUNCTION protect_challenge_version_evidence();
