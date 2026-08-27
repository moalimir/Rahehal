ALTER TABLE challenge_version
  ADD COLUMN authoring_status text NOT NULL DEFAULT 'draft'
    CHECK (authoring_status IN ('draft', 'ready', 'needs_changes'));

UPDATE challenge_version
SET content = jsonb_build_object(
  'title', '',
  'summary', '',
  'category', '',
  'location', '',
  'desired_outcome', '',
  'current_state', '',
  'consequence', '',
  'expected_output', '',
  'success_criteria', '[]'::jsonb,
  'in_scope', '',
  'constraints', '',
  'organization_support', '',
  'previous_attempts', '',
  'output_type', NULL,
  'sourcing_model', NULL,
  'applicant_scope', NULL,
  'allowed_applicant_types', '[]'::jsonb,
  'work_mode', NULL,
  'proposal_deadline', NULL,
  'preferred_start_date', NULL,
  'budget', jsonb_build_object('status', 'undecided', 'amount_minor', NULL, 'currency', 'IRR'),
  'invitees', '[]'::jsonb,
  'visibility', NULL,
  'public_summary', '',
  'nda_required', false,
  'ip_terms', NULL,
  'contact', jsonb_build_object('name', '', 'email', '', 'phone', ''),
  'accuracy_confirmed', false,
  'legal_notes', '',
  'attachment_ids', '[]'::jsonb
) || content;

ALTER TABLE challenge_version
  ADD CONSTRAINT challenge_version_content_shape_ck CHECK (
    content ?& ARRAY[
      'title', 'summary', 'category', 'location', 'desired_outcome', 'current_state',
      'consequence', 'expected_output', 'success_criteria', 'in_scope', 'constraints',
      'organization_support', 'previous_attempts', 'output_type', 'sourcing_model',
      'applicant_scope', 'allowed_applicant_types', 'work_mode', 'proposal_deadline',
      'preferred_start_date', 'budget', 'invitees', 'visibility', 'public_summary',
      'nda_required', 'ip_terms', 'contact', 'accuracy_confirmed', 'legal_notes',
      'attachment_ids'
    ]
    AND jsonb_typeof(content -> 'success_criteria') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(content -> 'allowed_applicant_types') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(content -> 'budget') IS NOT DISTINCT FROM 'object'
    AND jsonb_typeof(content -> 'invitees') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(content -> 'contact') IS NOT DISTINCT FROM 'object'
    AND jsonb_typeof(content -> 'attachment_ids') IS NOT DISTINCT FROM 'array'
  );

UPDATE challenge AS aggregate
SET lock_version = current_version.version_number
FROM challenge_version AS current_version
WHERE current_version.id = aggregate.current_version_id
  AND current_version.challenge_id = aggregate.id;

ALTER TABLE challenge
  ADD CONSTRAINT challenge_lock_version_positive_ck CHECK (lock_version > 0);

DROP TRIGGER challenge_version_immutable_when_locked ON challenge_version;
DROP FUNCTION prevent_locked_challenge_version_mutation();

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

CREATE TABLE mutation_receipt (
  id text PRIMARY KEY CHECK (id ~ '^rcp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 2 AND 80),
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 5 AND 80),
  entity_version bigint NOT NULL CHECK (entity_version > 0),
  audit_event_id text NOT NULL UNIQUE REFERENCES audit_event (id),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^cor_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  next_actions jsonb NOT NULL CHECK (
    jsonb_typeof(next_actions) = 'array'
    AND jsonb_array_length(next_actions) > 0
    AND NOT jsonb_path_exists(next_actions, '$[*] ? (@.type() != "string")')
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  UNIQUE (entity_type, entity_id, entity_version)
);

CREATE INDEX mutation_receipt_scope_time_idx
  ON mutation_receipt (tenant_id, workspace_id, occurred_at DESC);

CREATE FUNCTION prevent_mutation_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mutation receipts are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mutation_receipt_append_only
BEFORE UPDATE OR DELETE ON mutation_receipt
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_receipt_mutation();
