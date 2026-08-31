-- Phase 3 foundation: the workspace-owned proposal aggregate and immutable
-- proposal-content versions. C3/C4 commands still enforce authorization,
-- idempotency, expected_version, audit, and outbox atomically; these constraints
-- keep ownership and submitted evidence safe from direct SQL drift.

CREATE FUNCTION valid_proposal_assignment_array(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    array_position(value, NULL) IS NULL
    AND cardinality(value) = count(DISTINCT membership_id)
    AND COALESCE(bool_and(membership_id ~ '^mem_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'), true)
  FROM unnest(value) AS membership_id;
$$;

CREATE FUNCTION valid_proposal_content(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  field_name text;
  amount numeric;
BEGIN
  IF jsonb_typeof(value) <> 'object'
     OR NOT value ?& ARRAY[
       'title', 'problem_statement', 'value_proposition', 'maturity_level',
       'prototype_weeks', 'technologies', 'technical_approach', 'architecture',
       'data_needs', 'success_metrics', 'ip_status', 'duration_weeks', 'roadmap',
       'dependencies', 'pilot_location', 'risks', 'mitigation', 'lead_name',
       'team_summary', 'relevant_experience', 'budget_amount_minor',
       'budget_currency', 'payment_model', 'budget_rationale', 'start_availability',
       'team_availability', 'nda_accepted', 'conflict_declared', 'ip_accepted',
       'accuracy_confirmed', 'attachment_ids'
     ] THEN
    RETURN false;
  END IF;

  FOREACH field_name IN ARRAY ARRAY[
    'title', 'problem_statement', 'value_proposition', 'maturity_level',
    'prototype_weeks', 'technical_approach', 'architecture', 'data_needs',
    'success_metrics', 'ip_status', 'duration_weeks', 'roadmap', 'dependencies',
    'pilot_location', 'risks', 'mitigation', 'lead_name', 'team_summary',
    'relevant_experience', 'budget_currency', 'payment_model', 'budget_rationale',
    'start_availability', 'team_availability'
  ] LOOP
    IF jsonb_typeof(value -> field_name) <> 'string' THEN
      RETURN false;
    END IF;
  END LOOP;

  FOREACH field_name IN ARRAY ARRAY[
    'nda_accepted', 'conflict_declared', 'ip_accepted', 'accuracy_confirmed'
  ] LOOP
    IF jsonb_typeof(value -> field_name) <> 'boolean' THEN
      RETURN false;
    END IF;
  END LOOP;

  IF jsonb_typeof(value -> 'technologies') <> 'array'
     OR jsonb_typeof(value -> 'attachment_ids') <> 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(value -> 'technologies') AS item
       WHERE jsonb_typeof(item) <> 'string'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(value -> 'attachment_ids') AS attachment_id
       WHERE attachment_id !~ '^fil_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'
     ) THEN
    RETURN false;
  END IF;

  IF (value ->> 'budget_currency') !~ '^[A-Z]{3}$' THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(value -> 'budget_amount_minor') = 'null' THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(value -> 'budget_amount_minor') <> 'number' THEN
    RETURN false;
  END IF;

  amount := (value ->> 'budget_amount_minor')::numeric;
  RETURN amount >= 0
    AND amount = trunc(amount)
    AND amount <= 9007199254740991;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;

CREATE TABLE proposal (
  id text PRIMARY KEY CHECK (id ~ '^prp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  owner_workspace_id text NOT NULL,
  owner_workspace_kind text NOT NULL CHECK (owner_workspace_kind IN ('individual', 'team')),
  challenge_id text NOT NULL,
  current_version_id text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'draft', 'submitted', 'eligibility_review', 'eligible', 'ineligible',
    'clarification_requested', 'clarification_submitted', 'reviewing',
    'revision_requested', 'revision_draft', 'resubmitted', 'selected',
    'rejected', 'withdrawn'
  )),
  assigned_membership_ids text[] NOT NULL DEFAULT '{}'
    CHECK (valid_proposal_assignment_array(assigned_membership_ids)),
  tracking_code text UNIQUE
    CHECK (tracking_code IS NULL OR tracking_code ~ '^PRP-[0-9]{4}-[0-9]{3,6}$'),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  submitted_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (owner_workspace_id, tenant_id, owner_workspace_kind)
    REFERENCES workspace (id, tenant_id, kind),
  FOREIGN KEY (challenge_id) REFERENCES challenge (id),
  UNIQUE (id, tenant_id),
  UNIQUE (id, challenge_id),
  CHECK (owner_workspace_kind = 'team' OR cardinality(assigned_membership_ids) = 0),
  CHECK (updated_at >= created_at),
  CHECK ((state = 'draft' AND submitted_at IS NULL)
      OR (state <> 'draft' AND submitted_at IS NOT NULL))
);

CREATE UNIQUE INDEX proposal_one_active_per_challenge_workspace_idx
  ON proposal (challenge_id, owner_workspace_id)
  WHERE state <> 'withdrawn';

CREATE INDEX proposal_scope_idx ON proposal (tenant_id, owner_workspace_id);
CREATE INDEX proposal_challenge_idx ON proposal (challenge_id, state);

CREATE TABLE proposal_version (
  id text PRIMARY KEY CHECK (id ~ '^prv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  proposal_id text NOT NULL,
  challenge_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  actor_user_id text NOT NULL REFERENCES app_user (id),
  content jsonb NOT NULL CHECK (valid_proposal_content(content)),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  changed_fields text[] NOT NULL DEFAULT '{}'
    CHECK (array_position(changed_fields, NULL) IS NULL),
  base_version_id text,
  accepted_challenge_version_id text,
  locked_at timestamptz,
  lock_reason text CHECK (lock_reason IN ('submission', 'resubmission')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (proposal_id, version_number),
  UNIQUE (id, proposal_id),
  FOREIGN KEY (proposal_id, challenge_id) REFERENCES proposal (id, challenge_id),
  FOREIGN KEY (base_version_id, proposal_id) REFERENCES proposal_version (id, proposal_id),
  FOREIGN KEY (accepted_challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  CHECK (
    (locked_at IS NULL AND lock_reason IS NULL AND accepted_challenge_version_id IS NULL)
    OR (locked_at IS NOT NULL AND lock_reason IS NOT NULL
        AND accepted_challenge_version_id IS NOT NULL)
  ),
  CHECK (locked_at IS NULL OR locked_at >= created_at),
  CHECK ((version_number = 1 AND base_version_id IS NULL)
      OR (version_number > 1 AND base_version_id IS NOT NULL))
);

CREATE INDEX proposal_version_proposal_idx
  ON proposal_version (proposal_id, version_number DESC);

ALTER TABLE proposal
  ADD CONSTRAINT proposal_current_version_fk
    FOREIGN KEY (current_version_id, id)
    REFERENCES proposal_version (id, proposal_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION validate_locked_proposal_version(
  target_proposal_id text,
  accepted_version_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  published_version text;
  call_state text;
  call_deadline timestamptz;
BEGIN
  SELECT challenge.published_version_id,
         challenge.publication_state,
         challenge.proposal_deadline_at
  INTO published_version, call_state, call_deadline
  FROM proposal
  JOIN challenge ON challenge.id = proposal.challenge_id
  WHERE proposal.id = target_proposal_id
  FOR UPDATE OF challenge;

  IF published_version IS NULL OR accepted_version_id IS DISTINCT FROM published_version THEN
    RAISE EXCEPTION 'a locked proposal version must accept the current published challenge version'
      USING ERRCODE = '23514';
  END IF;
  IF call_state <> 'open' OR call_deadline IS NULL OR call_deadline <= clock_timestamp() THEN
    RAISE EXCEPTION 'a proposal can only be submitted while the call is open and unexpired'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION validate_proposal_version_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
BEGIN
  PERFORM 1
  FROM proposal
  WHERE id = NEW.proposal_id AND challenge_id = NEW.challenge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal version requires its proposal aggregate' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO next_version
  FROM proposal_version
  WHERE proposal_id = NEW.proposal_id;
  IF NEW.version_number <> next_version THEN
    RAISE EXCEPTION 'proposal versions must be inserted without gaps' USING ERRCODE = '23514';
  END IF;

  IF NEW.locked_at IS NOT NULL THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id,
      NEW.accepted_challenge_version_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_version_insert_validated
BEFORE INSERT ON proposal_version
FOR EACH ROW EXECUTE FUNCTION validate_proposal_version_insert();

CREATE FUNCTION protect_proposal_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL
     AND OLD.lock_reason IS NULL
     AND OLD.accepted_challenge_version_id IS NULL
     AND NEW.locked_at IS NOT NULL
     AND NEW.lock_reason IS NOT NULL
     AND NEW.accepted_challenge_version_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY[
       'locked_at', 'lock_reason', 'accepted_challenge_version_id'
     ]) = (to_jsonb(OLD) - ARRAY[
       'locked_at', 'lock_reason', 'accepted_challenge_version_id'
     ]) THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id,
      NEW.accepted_challenge_version_id
    );
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER proposal_version_evidence_protected
BEFORE UPDATE OR DELETE ON proposal_version
FOR EACH ROW EXECUTE FUNCTION protect_proposal_version_evidence();

CREATE FUNCTION protect_proposal_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.owner_workspace_id IS DISTINCT FROM OLD.owner_workspace_id
     OR NEW.owner_workspace_kind IS DISTINCT FROM OLD.owner_workspace_kind
     OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'proposal identity and ownership are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_identity_protected
BEFORE UPDATE ON proposal
FOR EACH ROW EXECUTE FUNCTION protect_proposal_identity();

CREATE FUNCTION validate_proposal_challenge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  call_state text;
  call_deadline timestamptz;
  published_version text;
BEGIN
  SELECT publication_state, proposal_deadline_at, published_version_id
  INTO call_state, call_deadline, published_version
  FROM challenge
  WHERE id = NEW.challenge_id;

  IF published_version IS NULL THEN
    RAISE EXCEPTION 'a proposal requires a published challenge' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT'
     AND (call_state <> 'open' OR call_deadline IS NULL
          OR call_deadline <= clock_timestamp()) THEN
    RAISE EXCEPTION 'a proposal can only be created while the call is open and unexpired'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_requires_published_challenge
BEFORE INSERT OR UPDATE ON proposal
FOR EACH ROW EXECUTE FUNCTION validate_proposal_challenge();

CREATE FUNCTION validate_proposal_current_pointer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_proposal_id text;
  aggregate_current_version text;
  aggregate_lock_version bigint;
  latest_version_id text;
  latest_version_number integer;
BEGIN
  IF TG_TABLE_NAME = 'proposal' THEN
    target_proposal_id := NEW.id;
  ELSE
    target_proposal_id := NEW.proposal_id;
  END IF;

  SELECT current_version_id, lock_version
  INTO aggregate_current_version, aggregate_lock_version
  FROM proposal
  WHERE id = target_proposal_id;

  SELECT id, version_number
  INTO latest_version_id, latest_version_number
  FROM proposal_version
  WHERE proposal_id = target_proposal_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF latest_version_id IS NULL
     OR aggregate_current_version IS DISTINCT FROM latest_version_id
     OR aggregate_lock_version IS DISTINCT FROM latest_version_number THEN
    RAISE EXCEPTION 'proposal current version must point at the latest version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER proposal_current_pointer_consistent
AFTER INSERT OR UPDATE ON proposal
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_proposal_current_pointer();

CREATE CONSTRAINT TRIGGER proposal_version_pointer_consistent
AFTER INSERT ON proposal_version
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_proposal_current_pointer();
