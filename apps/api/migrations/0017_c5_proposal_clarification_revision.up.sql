-- C5: controlled bilateral clarification and exact-base proposal revision evidence.

CREATE TABLE proposal_clarification (
  id text PRIMARY KEY CHECK (id ~ '^pcl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  proposal_id text NOT NULL REFERENCES proposal (id),
  proposal_version_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('requested', 'submitted', 'resolved')),
  question text NOT NULL CHECK (length(btrim(question)) BETWEEN 1 AND 10000),
  response text CHECK (response IS NULL OR length(btrim(response)) BETWEEN 1 AND 20000),
  resolution text CHECK (resolution IS NULL OR length(btrim(resolution)) BETWEEN 1 AND 10000),
  requested_by_user_id text NOT NULL REFERENCES app_user (id),
  submitted_by_user_id text REFERENCES app_user (id),
  resolved_by_user_id text REFERENCES app_user (id),
  requested_at timestamptz NOT NULL,
  submitted_at timestamptz,
  resolved_at timestamptz,
  FOREIGN KEY (proposal_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  CHECK (
    (state = 'requested' AND response IS NULL AND resolution IS NULL
      AND submitted_by_user_id IS NULL AND resolved_by_user_id IS NULL
      AND submitted_at IS NULL AND resolved_at IS NULL)
    OR (state = 'submitted' AND response IS NOT NULL AND resolution IS NULL
      AND submitted_by_user_id IS NOT NULL AND resolved_by_user_id IS NULL
      AND submitted_at IS NOT NULL AND resolved_at IS NULL)
    OR (state = 'resolved' AND response IS NOT NULL AND resolution IS NOT NULL
      AND submitted_by_user_id IS NOT NULL AND resolved_by_user_id IS NOT NULL
      AND submitted_at IS NOT NULL AND resolved_at IS NOT NULL)
  ),
  CHECK (submitted_at IS NULL OR submitted_at >= requested_at),
  CHECK (resolved_at IS NULL OR resolved_at >= submitted_at)
);

CREATE INDEX proposal_clarification_proposal_idx
  ON proposal_clarification (proposal_id, requested_at);

CREATE TABLE proposal_revision_request (
  id text PRIMARY KEY CHECK (id ~ '^prr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  proposal_id text NOT NULL REFERENCES proposal (id),
  base_version_id text NOT NULL,
  resubmitted_version_id text,
  state text NOT NULL CHECK (state IN ('requested', 'in_progress', 'resubmitted')),
  scope text NOT NULL CHECK (length(btrim(scope)) BETWEEN 1 AND 10000),
  revision_deadline timestamptz NOT NULL,
  requested_by_user_id text NOT NULL REFERENCES app_user (id),
  requested_at timestamptz NOT NULL,
  started_by_user_id text REFERENCES app_user (id),
  started_at timestamptz,
  resubmitted_by_user_id text REFERENCES app_user (id),
  resubmitted_at timestamptz,
  FOREIGN KEY (base_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  FOREIGN KEY (resubmitted_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  CHECK (revision_deadline > requested_at),
  CHECK (
    (state = 'requested' AND started_by_user_id IS NULL AND started_at IS NULL
      AND resubmitted_version_id IS NULL AND resubmitted_by_user_id IS NULL
      AND resubmitted_at IS NULL)
    OR (state = 'in_progress' AND started_by_user_id IS NOT NULL AND started_at IS NOT NULL
      AND resubmitted_version_id IS NULL AND resubmitted_by_user_id IS NULL
      AND resubmitted_at IS NULL)
    OR (state = 'resubmitted' AND started_by_user_id IS NOT NULL AND started_at IS NOT NULL
      AND resubmitted_version_id IS NOT NULL AND resubmitted_by_user_id IS NOT NULL
      AND resubmitted_at IS NOT NULL)
  ),
  CHECK (started_at IS NULL OR started_at >= requested_at),
  CHECK (resubmitted_at IS NULL OR resubmitted_at >= started_at)
);

CREATE INDEX proposal_revision_request_proposal_idx
  ON proposal_revision_request (proposal_id, requested_at);

-- Clarification and review transitions change the aggregate without creating
-- fake proposal-content versions. Keep the current pointer exact, while
-- lock_version remains the independent optimistic-concurrency token.
CREATE OR REPLACE FUNCTION validate_proposal_current_pointer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_proposal_id text;
  aggregate_current_version text;
  latest_version_id text;
BEGIN
  IF TG_TABLE_NAME = 'proposal' THEN
    target_proposal_id := NEW.id;
  ELSE
    target_proposal_id := NEW.proposal_id;
  END IF;
  SELECT current_version_id INTO aggregate_current_version
  FROM proposal WHERE id = target_proposal_id;
  SELECT id INTO latest_version_id
  FROM proposal_version WHERE proposal_id = target_proposal_id
  ORDER BY version_number DESC LIMIT 1;
  IF latest_version_id IS NULL
     OR aggregate_current_version IS DISTINCT FROM latest_version_id THEN
    RAISE EXCEPTION 'proposal current version must point at the latest version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION protect_proposal_clarification_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'proposal clarification evidence is append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
     OR OLD.proposal_version_id IS DISTINCT FROM NEW.proposal_version_id
     OR OLD.question IS DISTINCT FROM NEW.question
     OR OLD.requested_by_user_id IS DISTINCT FROM NEW.requested_by_user_id
     OR OLD.requested_at IS DISTINCT FROM NEW.requested_at THEN
    RAISE EXCEPTION 'proposal clarification identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state = 'requested' AND NEW.state = 'submitted' THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'submitted' AND NEW.state = 'resolved'
     AND NEW.response IS NOT DISTINCT FROM OLD.response
     AND NEW.submitted_by_user_id IS NOT DISTINCT FROM OLD.submitted_by_user_id
     AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid proposal clarification evidence transition' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER proposal_clarification_evidence_protected
BEFORE UPDATE OR DELETE ON proposal_clarification
FOR EACH ROW EXECUTE FUNCTION protect_proposal_clarification_evidence();

CREATE FUNCTION protect_proposal_revision_request_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'proposal revision request evidence is append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
     OR OLD.base_version_id IS DISTINCT FROM NEW.base_version_id
     OR OLD.scope IS DISTINCT FROM NEW.scope
     OR OLD.revision_deadline IS DISTINCT FROM NEW.revision_deadline
     OR OLD.requested_by_user_id IS DISTINCT FROM NEW.requested_by_user_id
     OR OLD.requested_at IS DISTINCT FROM NEW.requested_at THEN
    RAISE EXCEPTION 'proposal revision request identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state = 'requested' AND NEW.state = 'in_progress' THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'in_progress' AND NEW.state = 'resubmitted'
     AND NEW.started_by_user_id IS NOT DISTINCT FROM OLD.started_by_user_id
     AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid proposal revision request evidence transition' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER proposal_revision_request_evidence_protected
BEFORE UPDATE OR DELETE ON proposal_revision_request
FOR EACH ROW EXECUTE FUNCTION protect_proposal_revision_request_evidence();

CREATE OR REPLACE FUNCTION validate_locked_proposal_version(
  target_proposal_id text,
  accepted_version_id text,
  target_lock_reason text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  published_version text;
  proposal_state text;
  call_state text;
  call_deadline timestamptz;
BEGIN
  SELECT challenge.published_version_id, proposal.state,
         challenge.publication_state, challenge.proposal_deadline_at
  INTO published_version, proposal_state, call_state, call_deadline
  FROM proposal
  JOIN challenge ON challenge.id = proposal.challenge_id
  WHERE proposal.id = target_proposal_id
  FOR UPDATE OF proposal, challenge;

  IF published_version IS NULL OR accepted_version_id IS DISTINCT FROM published_version THEN
    RAISE EXCEPTION 'a locked proposal version must accept the current published challenge version'
      USING ERRCODE = '23514';
  END IF;
  IF target_lock_reason = 'submission' THEN
    IF proposal_state <> 'draft' OR call_state <> 'open'
       OR call_deadline IS NULL OR call_deadline <= transaction_timestamp() THEN
      RAISE EXCEPTION 'a proposal can only be submitted from a draft while the call is open'
        USING ERRCODE = '23514';
    END IF;
  ELSIF target_lock_reason = 'resubmission' THEN
    IF proposal_state <> 'revision_draft' OR NOT EXISTS (
      SELECT 1 FROM proposal_revision_request
      WHERE proposal_id = target_proposal_id
        AND state = 'in_progress'
        AND revision_deadline > transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'a proposal can only be resubmitted from an active revision draft'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown proposal version lock reason' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_proposal_version_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
  expected_base_version_id text;
BEGIN
  PERFORM 1 FROM proposal
  WHERE id = NEW.proposal_id AND challenge_id = NEW.challenge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal version requires its proposal aggregate' USING ERRCODE = '23503';
  END IF;
  SELECT COALESCE(max(version_number), 0) + 1,
         (array_agg(id ORDER BY version_number DESC))[1]
  INTO next_version, expected_base_version_id
  FROM proposal_version WHERE proposal_id = NEW.proposal_id;
  IF NEW.version_number <> next_version THEN
    RAISE EXCEPTION 'proposal versions must be inserted without gaps' USING ERRCODE = '23514';
  END IF;
  IF (NEW.version_number = 1 AND NEW.base_version_id IS NOT NULL)
     OR (NEW.version_number > 1 AND NEW.base_version_id IS DISTINCT FROM expected_base_version_id) THEN
    RAISE EXCEPTION 'proposal version must cite the exact latest base version'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.locked_at IS NOT NULL THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id, NEW.accepted_challenge_version_id, NEW.lock_reason
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_proposal_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL AND OLD.lock_reason IS NULL
     AND OLD.accepted_challenge_version_id IS NULL
     AND NEW.locked_at IS NOT NULL AND NEW.lock_reason IS NOT NULL
     AND NEW.accepted_challenge_version_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['locked_at','lock_reason','accepted_challenge_version_id']) =
         (to_jsonb(OLD) - ARRAY['locked_at','lock_reason','accepted_challenge_version_id']) THEN
    PERFORM validate_locked_proposal_version(
      NEW.proposal_id, NEW.accepted_challenge_version_id, NEW.lock_reason
    );
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION validate_c4_proposal_access_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_tenant_id text;
  proposal_owner_workspace_id text;
  proposal_state text;
  proposal_current_version_id text;
  proposal_submitted_at timestamptz;
  challenge_tenant text;
  challenge_workspace text;
  version_locked_at timestamptz;
  version_lock_reason text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.resource_type = 'proposal' AND OLD.capability = 'read' THEN
      RAISE EXCEPTION 'proposal grant evidence is append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND ((OLD.resource_type = 'proposal' AND OLD.capability = 'read')
      OR (NEW.resource_type = 'proposal' AND NEW.capability = 'read')) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.grantor_tenant_id IS DISTINCT FROM OLD.grantor_tenant_id
       OR NEW.grantor_workspace_id IS DISTINCT FROM OLD.grantor_workspace_id
       OR NEW.grantee_tenant_id IS DISTINCT FROM OLD.grantee_tenant_id
       OR NEW.grantee_workspace_id IS DISTINCT FROM OLD.grantee_workspace_id
       OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.proposal_version_id IS DISTINCT FROM OLD.proposal_version_id
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'proposal grant identity and version binding are immutable'
        USING ERRCODE = '55000';
    END IF;
    IF OLD.state IN ('revoked','expired') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'terminal proposal grants are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.resource_type <> 'proposal' OR NEW.capability <> 'read' THEN RETURN NEW; END IF;
  SELECT proposal.tenant_id, proposal.owner_workspace_id, proposal.state,
         proposal.current_version_id, proposal.submitted_at,
         challenge.tenant_id, challenge.workspace_id, version.locked_at, version.lock_reason
  INTO proposal_tenant_id, proposal_owner_workspace_id, proposal_state,
       proposal_current_version_id, proposal_submitted_at,
       challenge_tenant, challenge_workspace, version_locked_at, version_lock_reason
  FROM proposal
  JOIN challenge ON challenge.id = proposal.challenge_id
  JOIN proposal_version AS version
    ON version.proposal_id = proposal.id AND version.id = NEW.proposal_version_id
  WHERE proposal.id = NEW.resource_id;
  IF NOT FOUND OR proposal_tenant_id IS DISTINCT FROM NEW.grantor_tenant_id
     OR proposal_owner_workspace_id IS DISTINCT FROM NEW.grantor_workspace_id
     OR challenge_tenant IS DISTINCT FROM NEW.grantee_tenant_id
     OR challenge_workspace IS DISTINCT FROM NEW.grantee_workspace_id THEN
    RAISE EXCEPTION 'proposal grant must bind the solver owner to the challenge organization'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND (
      proposal_current_version_id IS DISTINCT FROM NEW.proposal_version_id
      OR proposal_submitted_at IS NULL OR proposal_submitted_at IS DISTINCT FROM NEW.valid_from
      OR version_locked_at IS NULL
      OR NOT ((proposal_state = 'submitted' AND version_lock_reason = 'submission')
           OR (proposal_state = 'resubmitted' AND version_lock_reason = 'resubmission'))
    ) THEN
    RAISE EXCEPTION 'proposal read grant requires the exact submitted locked version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
