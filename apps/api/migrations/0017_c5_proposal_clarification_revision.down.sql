DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proposal_clarification)
     OR EXISTS (SELECT 1 FROM proposal_revision_request)
     OR EXISTS (SELECT 1 FROM proposal_version WHERE lock_reason = 'resubmission')
     OR EXISTS (
       SELECT 1 FROM proposal
       JOIN LATERAL (
         SELECT version_number FROM proposal_version
         WHERE proposal_id = proposal.id ORDER BY version_number DESC LIMIT 1
       ) AS latest ON true
       WHERE proposal.lock_version <> latest.version_number
     ) THEN
    RAISE EXCEPTION 'C5 evidence exists; rollback would discard immutable workflow evidence';
  END IF;
END;
$$;

DROP TRIGGER proposal_revision_request_evidence_protected ON proposal_revision_request;
DROP FUNCTION protect_proposal_revision_request_evidence();
DROP TABLE proposal_revision_request;
DROP TRIGGER proposal_clarification_evidence_protected ON proposal_clarification;
DROP FUNCTION protect_proposal_clarification_evidence();
DROP TABLE proposal_clarification;

CREATE OR REPLACE FUNCTION validate_proposal_current_pointer()
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
  FROM proposal WHERE id = target_proposal_id;
  SELECT id, version_number INTO latest_version_id, latest_version_number
  FROM proposal_version WHERE proposal_id = target_proposal_id
  ORDER BY version_number DESC LIMIT 1;
  IF latest_version_id IS NULL
     OR aggregate_current_version IS DISTINCT FROM latest_version_id
     OR aggregate_lock_version IS DISTINCT FROM latest_version_number THEN
    RAISE EXCEPTION 'proposal current version must point at the latest version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION validate_locked_proposal_version(text, text, text);

CREATE OR REPLACE FUNCTION validate_proposal_version_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
  expected_base_version_id text;
BEGIN
  PERFORM 1 FROM proposal
  WHERE id = NEW.proposal_id AND challenge_id = NEW.challenge_id FOR UPDATE;
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
    PERFORM validate_locked_proposal_version(NEW.proposal_id, NEW.accepted_challenge_version_id);
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
    PERFORM validate_locked_proposal_version(NEW.proposal_id, NEW.accepted_challenge_version_id);
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

-- Restore C4's insert-only grant rule. The rollback guard above guarantees no
-- C5 grant can be left behind under this earlier invariant.
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
  IF TG_OP = 'INSERT' AND (proposal_state <> 'submitted'
      OR proposal_current_version_id IS DISTINCT FROM NEW.proposal_version_id
      OR proposal_submitted_at IS NULL OR proposal_submitted_at IS DISTINCT FROM NEW.valid_from
      OR version_locked_at IS NULL OR version_lock_reason <> 'submission') THEN
    RAISE EXCEPTION 'proposal read grant requires the exact newly submitted locked version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
