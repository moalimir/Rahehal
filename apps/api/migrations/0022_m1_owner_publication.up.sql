-- DEC-2026-018: an attributable owner publication is an alternative to the
-- existing four-gate path, not four synthetic approvals.
ALTER TABLE challenge ADD COLUMN owner_publisher_user_id text REFERENCES app_user(id);
ALTER TABLE challenge ADD CONSTRAINT challenge_owner_publication_evidence
  CHECK (owner_publisher_user_id IS NULL OR published_version_id IS NOT NULL);

CREATE OR REPLACE FUNCTION validate_challenge_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  approved_gates integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.published_version_id IS NOT NULL THEN
    IF NEW.owner_publisher_user_id IS DISTINCT FROM OLD.owner_publisher_user_id
       OR (OLD.owner_publisher_user_id IS NOT NULL AND
           NEW.published_version_id IS DISTINCT FROM OLD.published_version_id) THEN
      RAISE EXCEPTION 'publication attribution is immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.published_version_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.published_version_id IS NOT DISTINCT FROM OLD.published_version_id THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_publisher_user_id IS NOT NULL THEN
    -- Lock membership against concurrent removal/role changes until commit.
    PERFORM 1 FROM membership
      WHERE tenant_id = NEW.tenant_id AND workspace_id = NEW.workspace_id
        AND user_id = NEW.owner_publisher_user_id AND role = 'org:owner'
        AND state = 'active' AND workspace_kind = 'org'
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'owner publication requires an active scoped owner' USING ERRCODE = '23514';
    END IF;
    IF NEW.current_version_id IS DISTINCT FROM NEW.published_version_id OR NOT EXISTS (
      SELECT 1 FROM challenge_version WHERE id = NEW.published_version_id
        AND challenge_id = NEW.id AND locked_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'owner publication requires the locked current version' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT count(DISTINCT gate) INTO approved_gates FROM challenge_approval
      WHERE challenge_version_id = NEW.published_version_id AND decision = 'approved';
    IF approved_gates <> 4 THEN
      RAISE EXCEPTION 'a published version requires all four approved publication gates'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM eligibility_rule WHERE challenge_version_id = NEW.published_version_id) THEN
    RAISE EXCEPTION 'a published version requires an eligibility rule snapshot' USING ERRCODE = '23514';
  END IF;
  IF NEW.proposal_deadline_at IS NULL OR NEW.proposal_deadline_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'a published version requires a future proposal deadline' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
