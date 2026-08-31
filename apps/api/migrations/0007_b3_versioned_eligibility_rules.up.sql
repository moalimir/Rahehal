CREATE FUNCTION valid_applicant_type_array(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    array_position(value, NULL) IS NULL
    AND value <@ ARRAY[
      'individual', 'expert-team', 'company', 'lab', 'academic-group'
    ]::text[]
    AND cardinality(value) = (
      SELECT count(DISTINCT applicant_type)
      FROM unnest(value) AS applicant_type
    );
$$;

CREATE TABLE eligibility_rule (
  id text PRIMARY KEY CHECK (id ~ '^elr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  allowed_applicant_types text[] NOT NULL DEFAULT '{}'
    CHECK (valid_applicant_type_array(allowed_applicant_types)),
  verification_required boolean NOT NULL,
  nda_required boolean NOT NULL,
  document_gate_required boolean NOT NULL,
  proposal_deadline timestamptz,
  state text NOT NULL CHECK (state IN ('open', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_id, tenant_id) REFERENCES challenge (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (challenge_version_id)
);

CREATE INDEX eligibility_rule_scope_idx
  ON eligibility_rule (workspace_id, tenant_id);

CREATE INDEX eligibility_rule_challenge_idx
  ON eligibility_rule (challenge_id, tenant_id);

CREATE FUNCTION validate_editable_challenge_eligibility_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  challenge_stage text;
BEGIN
  SELECT stage
  INTO challenge_stage
  FROM challenge
  WHERE id = NEW.challenge_id;

  IF challenge_stage IN ('draft', 'formulation')
     AND (
       NEW.state <> 'open'
       OR (
         NEW.proposal_deadline IS NOT NULL
         AND NEW.proposal_deadline <= clock_timestamp()
       )
     ) THEN
    RAISE EXCEPTION 'an editable challenge requires an open, unexpired eligibility rule'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER eligibility_rule_editable_challenge_guard
BEFORE INSERT ON eligibility_rule
FOR EACH ROW EXECUTE FUNCTION validate_editable_challenge_eligibility_rule();

INSERT INTO eligibility_rule (
  id,
  tenant_id,
  workspace_id,
  challenge_id,
  challenge_version_id,
  allowed_applicant_types,
  verification_required,
  nda_required,
  document_gate_required,
  proposal_deadline,
  state,
  created_at
)
SELECT
  'elr_' || substring(version.id FROM 5),
  challenge.tenant_id,
  challenge.workspace_id,
  challenge.id,
  version.id,
  ARRAY(
    SELECT jsonb_array_elements_text(version.content -> 'allowed_applicant_types')
  ),
  COALESCE((version.content ->> 'verification_required')::boolean, false),
  COALESCE((version.content ->> 'nda_required')::boolean, false),
  COALESCE((version.content ->> 'document_gate_required')::boolean, false),
  (version.content ->> 'proposal_deadline')::timestamptz,
  CASE WHEN challenge.stage = 'closed' THEN 'closed' ELSE 'open' END,
  version.created_at
FROM challenge_version AS version
JOIN challenge ON challenge.id = version.challenge_id;

CREATE FUNCTION create_eligibility_rule_for_challenge_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO eligibility_rule (
    id,
    tenant_id,
    workspace_id,
    challenge_id,
    challenge_version_id,
    allowed_applicant_types,
    verification_required,
    nda_required,
    document_gate_required,
    proposal_deadline,
    state,
    created_at
  )
  SELECT
    'elr_' || substring(NEW.id FROM 5),
    challenge.tenant_id,
    challenge.workspace_id,
    challenge.id,
    NEW.id,
    ARRAY(
      SELECT jsonb_array_elements_text(NEW.content -> 'allowed_applicant_types')
    ),
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

CREATE FUNCTION prevent_eligibility_rule_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'eligibility rules are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER eligibility_rule_append_only
BEFORE UPDATE OR DELETE ON eligibility_rule
FOR EACH ROW EXECUTE FUNCTION prevent_eligibility_rule_mutation();
