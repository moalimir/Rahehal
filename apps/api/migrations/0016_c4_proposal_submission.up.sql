-- C4: exact-base locked submission evidence and a version-bound organization read grant.

CREATE SEQUENCE proposal_tracking_sequence;

WITH tracked AS (
  SELECT max(substring(tracking_code FROM '^PRP-[0-9]{4}-([0-9]{3,6})$')::bigint) AS maximum
  FROM proposal
  WHERE tracking_code IS NOT NULL
)
SELECT setval(
  'proposal_tracking_sequence',
  COALESCE(maximum, 1),
  maximum IS NOT NULL
)
FROM tracked;

ALTER TABLE access_grant
  ADD COLUMN proposal_version_id text;

-- A down/up verification cycle retains C4 data. Recover the exact binding that
-- is still unambiguous while C4 permits only the first submitted version.
UPDATE access_grant AS grant_row
SET proposal_version_id = proposal.current_version_id
FROM proposal
JOIN proposal_version AS version
  ON version.id = proposal.current_version_id
 AND version.proposal_id = proposal.id
WHERE grant_row.resource_type = 'proposal'
  AND grant_row.capability = 'read'
  AND grant_row.resource_id = proposal.id
  AND proposal.state = 'submitted'
  AND proposal.submitted_at IS NOT NULL
  AND proposal.submitted_at = grant_row.valid_from
  AND version.locked_at IS NOT NULL
  AND version.lock_reason = 'submission';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM access_grant
    WHERE resource_type = 'proposal'
      AND capability = 'read'
      AND proposal_version_id IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot establish an exact version binding for an existing proposal read grant'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE access_grant
  ADD CONSTRAINT access_grant_proposal_version_fk
    FOREIGN KEY (proposal_version_id, resource_id)
    REFERENCES proposal_version (id, proposal_id),
  ADD CONSTRAINT access_grant_proposal_version_shape CHECK (
    (resource_type = 'proposal' AND capability = 'read' AND proposal_version_id IS NOT NULL)
    OR (NOT (resource_type = 'proposal' AND capability = 'read') AND proposal_version_id IS NULL)
  );

CREATE FUNCTION validate_c4_proposal_access_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Selected as individual scalars: PL/pgSQL rejects a record or row variable
  -- inside a multiple-item INTO list, so a `proposal%ROWTYPE` here makes the
  -- whole migration fail to apply.
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
      RAISE EXCEPTION 'proposal grant evidence is append-only'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       (OLD.resource_type = 'proposal' AND OLD.capability = 'read')
       OR (NEW.resource_type = 'proposal' AND NEW.capability = 'read')
     ) THEN
    IF (
       NEW.id IS DISTINCT FROM OLD.id
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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
     ) THEN
      RAISE EXCEPTION 'proposal grant identity and version binding are immutable'
        USING ERRCODE = '55000';
    END IF;

    IF OLD.state IN ('revoked', 'expired')
       AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'terminal proposal grants are immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.resource_type <> 'proposal' OR NEW.capability <> 'read' THEN
    RETURN NEW;
  END IF;

  SELECT proposal.tenant_id,
         proposal.owner_workspace_id,
         proposal.state,
         proposal.current_version_id,
         proposal.submitted_at,
         challenge.tenant_id,
         challenge.workspace_id,
         version.locked_at,
         version.lock_reason
  INTO proposal_tenant_id, proposal_owner_workspace_id, proposal_state,
       proposal_current_version_id, proposal_submitted_at,
       challenge_tenant, challenge_workspace,
       version_locked_at, version_lock_reason
  FROM proposal
  JOIN challenge ON challenge.id = proposal.challenge_id
  JOIN proposal_version AS version
    ON version.proposal_id = proposal.id AND version.id = NEW.proposal_version_id
  WHERE proposal.id = NEW.resource_id;

  IF NOT FOUND
     OR proposal_tenant_id IS DISTINCT FROM NEW.grantor_tenant_id
     OR proposal_owner_workspace_id IS DISTINCT FROM NEW.grantor_workspace_id
     OR challenge_tenant IS DISTINCT FROM NEW.grantee_tenant_id
     OR challenge_workspace IS DISTINCT FROM NEW.grantee_workspace_id THEN
    RAISE EXCEPTION 'proposal grant must bind the solver owner to the challenge-owning organization'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT'
     AND (
       proposal_state <> 'submitted'
       OR proposal_current_version_id IS DISTINCT FROM NEW.proposal_version_id
       OR proposal_submitted_at IS NULL
       OR proposal_submitted_at IS DISTINCT FROM NEW.valid_from
       OR version_locked_at IS NULL
       OR version_lock_reason <> 'submission'
     ) THEN
    RAISE EXCEPTION 'proposal read grant requires the exact newly submitted locked version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER c4_proposal_access_grant_validated
BEFORE INSERT OR UPDATE OR DELETE ON access_grant
FOR EACH ROW EXECUTE FUNCTION validate_c4_proposal_access_grant();

CREATE OR REPLACE FUNCTION validate_locked_proposal_version(
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
  IF call_state <> 'open'
     OR call_deadline IS NULL
     OR call_deadline <= transaction_timestamp() THEN
    RAISE EXCEPTION 'a proposal can only be submitted while the call is open and unexpired'
      USING ERRCODE = '23514';
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
  PERFORM 1
  FROM proposal
  WHERE id = NEW.proposal_id AND challenge_id = NEW.challenge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal version requires its proposal aggregate' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1,
         (array_agg(id ORDER BY version_number DESC))[1]
  INTO next_version, expected_base_version_id
  FROM proposal_version
  WHERE proposal_id = NEW.proposal_id;
  IF NEW.version_number <> next_version THEN
    RAISE EXCEPTION 'proposal versions must be inserted without gaps' USING ERRCODE = '23514';
  END IF;
  IF (NEW.version_number = 1 AND NEW.base_version_id IS NOT NULL)
     OR (NEW.version_number > 1
         AND NEW.base_version_id IS DISTINCT FROM expected_base_version_id) THEN
    RAISE EXCEPTION 'proposal version must cite the exact latest base version'
      USING ERRCODE = '23514';
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

CREATE OR REPLACE FUNCTION protect_proposal_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;
