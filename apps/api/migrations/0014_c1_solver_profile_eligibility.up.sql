-- Phase 3 C1: server-owned solver workspace profile and verification facts,
-- plus exact-version gate acknowledgements. No file/evidence authority is
-- introduced: document_acknowledgement records acknowledgement only.

CREATE FUNCTION valid_solver_fact_array(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    cardinality(value) <= 100
    AND array_position(value, NULL) IS NULL
    AND COALESCE(bool_and(length(btrim(item)) BETWEEN 1 AND 200), true)
    AND cardinality(value) = count(DISTINCT lower(btrim(item)))
  FROM unnest(value) AS item;
$$;

CREATE TABLE solver_workspace_profile (
  workspace_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  workspace_kind text NOT NULL CHECK (workspace_kind IN ('individual', 'team')),
  applicant_type text NOT NULL CHECK (
    applicant_type IN ('individual', 'expert-team', 'company', 'lab', 'academic-group')
  ),
  headline text NOT NULL DEFAULT '' CHECK (length(headline) <= 240),
  overview text NOT NULL DEFAULT '' CHECK (length(overview) <= 4000),
  expertise text[] NOT NULL DEFAULT '{}' CHECK (valid_solver_fact_array(expertise)),
  geography text[] NOT NULL DEFAULT '{}' CHECK (valid_solver_fact_array(geography)),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id, workspace_kind)
    REFERENCES workspace (id, tenant_id, kind),
  UNIQUE (workspace_id, tenant_id),
  CHECK (updated_at >= created_at)
);

CREATE FUNCTION validate_solver_profile_applicant_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_applicant_type text;
BEGIN
  SELECT CASE WHEN kind = 'individual' THEN 'individual' ELSE team_kind END
  INTO derived_applicant_type
  FROM workspace
  WHERE id = NEW.workspace_id
    AND tenant_id = NEW.tenant_id
    AND kind = NEW.workspace_kind;

  IF derived_applicant_type IS NULL
     OR NEW.applicant_type IS DISTINCT FROM derived_applicant_type THEN
    RAISE EXCEPTION 'solver profile applicant type must be derived from its workspace'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER solver_profile_applicant_type_derived
BEFORE INSERT OR UPDATE ON solver_workspace_profile
FOR EACH ROW EXECUTE FUNCTION validate_solver_profile_applicant_type();

CREATE FUNCTION protect_solver_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_kind IS DISTINCT FROM OLD.workspace_kind
     OR NEW.applicant_type IS DISTINCT FROM OLD.applicant_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'solver profile identity and applicant type are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER solver_profile_identity_protected
BEFORE UPDATE ON solver_workspace_profile
FOR EACH ROW EXECUTE FUNCTION protect_solver_profile_identity();

CREATE TABLE verification_record (
  id text PRIMARY KEY CHECK (id ~ '^ver_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'not_started', 'draft', 'submitted', 'under_review', 'verified',
    'needs_revision', 'rejected', 'expired'
  )),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  requested_at timestamptz,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES solver_workspace_profile (workspace_id, tenant_id),
  UNIQUE (workspace_id),
  CHECK (updated_at >= created_at),
  CHECK ((state = 'not_started' AND requested_at IS NULL) OR state <> 'not_started'),
  CHECK (submitted_at IS NULL OR requested_at IS NOT NULL),
  CHECK (verified_at IS NULL OR state IN ('verified', 'expired'))
);

CREATE FUNCTION protect_verification_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'verification identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_identity_protected
BEFORE UPDATE ON verification_record
FOR EACH ROW EXECUTE FUNCTION protect_verification_identity();

CREATE TABLE eligibility_gate_acceptance (
  id text PRIMARY KEY CHECK (id ~ '^ega_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  gate text NOT NULL CHECK (gate IN ('nda', 'document_acknowledgement')),
  accepted_by_user_id text NOT NULL REFERENCES app_user (id),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES solver_workspace_profile (workspace_id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (workspace_id, challenge_version_id, gate)
);

CREATE INDEX eligibility_gate_acceptance_scope_idx
  ON eligibility_gate_acceptance (tenant_id, workspace_id, challenge_version_id);

CREATE FUNCTION validate_eligibility_gate_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  published_version text;
  gate_required boolean;
BEGIN
  SELECT challenge.published_version_id,
         CASE NEW.gate
           WHEN 'nda' THEN rule.nda_required
           ELSE rule.document_gate_required
         END
  INTO published_version, gate_required
  FROM challenge
  JOIN eligibility_rule AS rule
    ON rule.challenge_version_id = challenge.published_version_id
   AND rule.challenge_id = challenge.id
  WHERE challenge.id = NEW.challenge_id;

  IF published_version IS NULL
     OR NEW.challenge_version_id IS DISTINCT FROM published_version THEN
    RAISE EXCEPTION 'eligibility gate acceptance must cite the current published version'
      USING ERRCODE = '23514';
  END IF;
  IF gate_required IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'eligibility gate acceptance requires a governed gate'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER eligibility_gate_acceptance_validated
BEFORE INSERT ON eligibility_gate_acceptance
FOR EACH ROW EXECUTE FUNCTION validate_eligibility_gate_acceptance();

CREATE FUNCTION prevent_eligibility_gate_acceptance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'eligibility gate acceptances are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER eligibility_gate_acceptance_append_only
BEFORE UPDATE OR DELETE ON eligibility_gate_acceptance
FOR EACH ROW EXECUTE FUNCTION prevent_eligibility_gate_acceptance_mutation();

INSERT INTO solver_workspace_profile (
  workspace_id, tenant_id, workspace_kind, applicant_type, created_at, updated_at
)
SELECT id, tenant_id, kind,
       CASE WHEN kind = 'individual' THEN 'individual' ELSE team_kind END,
       created_at, updated_at
FROM workspace
WHERE kind IN ('individual', 'team');

INSERT INTO verification_record (
  id, tenant_id, workspace_id, state, created_at, updated_at
)
SELECT 'ver_' || substring(workspace_id FROM 5), tenant_id, workspace_id,
       'not_started', created_at, updated_at
FROM solver_workspace_profile;
