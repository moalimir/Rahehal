-- Never erase owner-publication evidence or restore a gate policy it violates.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM challenge WHERE owner_publisher_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot roll back M1 after owner publication; retain migration and roll forward';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_challenge_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  approved_gates integer;
  governed_version boolean;
BEGIN
  IF NEW.published_version_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.published_version_id IS NOT DISTINCT FROM OLD.published_version_id THEN
    RETURN NEW;
  END IF;
  SELECT count(DISTINCT gate) INTO approved_gates FROM challenge_approval
    WHERE challenge_version_id = NEW.published_version_id AND decision = 'approved';
  SELECT EXISTS (SELECT 1 FROM eligibility_rule WHERE challenge_version_id = NEW.published_version_id)
    INTO governed_version;
  IF approved_gates <> 4 THEN
    RAISE EXCEPTION 'a published version requires all four approved publication gates' USING ERRCODE = '23514';
  END IF;
  IF NOT governed_version THEN
    RAISE EXCEPTION 'a published version requires an eligibility rule snapshot' USING ERRCODE = '23514';
  END IF;
  IF NEW.proposal_deadline_at IS NULL OR NEW.proposal_deadline_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'a published version requires a future proposal deadline' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER TABLE challenge DROP CONSTRAINT challenge_owner_publication_evidence;
ALTER TABLE challenge DROP COLUMN owner_publisher_user_id;
