CREATE OR REPLACE FUNCTION validate_challenge_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_gates integer;
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

  IF approved_gates <> 4 THEN
    RAISE EXCEPTION 'a published version requires all four approved publication gates'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER challenge_public_projection_protected ON challenge_public_projection;
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

CREATE TRIGGER challenge_public_projection_protected
BEFORE UPDATE OR DELETE ON challenge_public_projection
FOR EACH ROW EXECUTE FUNCTION protect_challenge_public_projection();

DROP INDEX challenge_public_projection_discovery_idx;
CREATE INDEX challenge_public_projection_discovery_idx
  ON challenge_public_projection (state, visibility, proposal_deadline DESC);
DROP INDEX challenge_public_projection_category_idx;
CREATE INDEX challenge_public_projection_category_idx
  ON challenge_public_projection (category);

-- Restore 0007's per-version behavior, including versions created while this
-- migration was active. Temporarily remove the editable-deadline guard so the
-- rollback can reconstruct historical rows exactly.
DROP TRIGGER eligibility_rule_editable_challenge_guard ON eligibility_rule;
INSERT INTO eligibility_rule (
  id, tenant_id, workspace_id, challenge_id, challenge_version_id,
  allowed_applicant_types, verification_required, nda_required,
  document_gate_required, proposal_deadline, state, created_at
)
SELECT
  'elr_' || substring(version.id FROM 5),
  challenge.tenant_id,
  challenge.workspace_id,
  challenge.id,
  version.id,
  ARRAY(SELECT jsonb_array_elements_text(version.content -> 'allowed_applicant_types')),
  COALESCE((version.content ->> 'verification_required')::boolean, false),
  COALESCE((version.content ->> 'nda_required')::boolean, false),
  COALESCE((version.content ->> 'document_gate_required')::boolean, false),
  (version.content ->> 'proposal_deadline')::timestamptz,
  CASE WHEN challenge.stage = 'closed' THEN 'closed' ELSE 'open' END,
  version.created_at
FROM challenge_version AS version
JOIN challenge ON challenge.id = version.challenge_id
ON CONFLICT (challenge_version_id) DO NOTHING;
CREATE TRIGGER eligibility_rule_editable_challenge_guard
BEFORE INSERT ON eligibility_rule
FOR EACH ROW EXECUTE FUNCTION validate_editable_challenge_eligibility_rule();

CREATE FUNCTION create_eligibility_rule_for_challenge_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO eligibility_rule (
    id, tenant_id, workspace_id, challenge_id, challenge_version_id,
    allowed_applicant_types, verification_required, nda_required,
    document_gate_required, proposal_deadline, state, created_at
  )
  SELECT
    'elr_' || substring(NEW.id FROM 5),
    challenge.tenant_id,
    challenge.workspace_id,
    challenge.id,
    NEW.id,
    ARRAY(SELECT jsonb_array_elements_text(NEW.content -> 'allowed_applicant_types')),
    COALESCE((NEW.content ->> 'verification_required')::boolean, false),
    COALESCE((NEW.content ->> 'nda_required')::boolean, false),
    COALESCE((NEW.content ->> 'document_gate_required')::boolean, false),
    (NEW.content ->> 'proposal_deadline')::timestamptz,
    CASE WHEN challenge.stage = 'closed' THEN 'closed' ELSE 'open' END,
    NEW.created_at
  FROM challenge
  WHERE challenge.id = NEW.challenge_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER challenge_version_create_eligibility_rule
AFTER INSERT ON challenge_version
FOR EACH ROW EXECUTE FUNCTION create_eligibility_rule_for_challenge_version();
