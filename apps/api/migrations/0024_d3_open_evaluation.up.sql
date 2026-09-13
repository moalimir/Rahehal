-- D3 freezes the exact proposal and rubric versions admitted to evaluation.
-- The snapshot belongs to the challenge-owning organization and remains
-- authoritative even if the submission-time read grant later expires.
CREATE TABLE challenge_evaluation (
  challenge_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  challenge_version_id text NOT NULL,
  rubric_version_id text NOT NULL REFERENCES rubric_version (id),
  required_reviews smallint NOT NULL DEFAULT 2 CHECK (required_reviews = 2),
  challenge_lock_version bigint NOT NULL CHECK (challenge_lock_version > 0),
  opened_by_user_id text NOT NULL REFERENCES app_user (id),
  opened_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (challenge_id, tenant_id) REFERENCES challenge (id, tenant_id),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (challenge_id, rubric_version_id)
);
CREATE INDEX challenge_evaluation_scope_idx
  ON challenge_evaluation (tenant_id, workspace_id, challenge_id);

CREATE TABLE evaluation_proposal (
  challenge_id text NOT NULL REFERENCES challenge_evaluation (challenge_id),
  proposal_id text NOT NULL,
  proposal_version_id text NOT NULL,
  source_state text NOT NULL CHECK (source_state IN ('eligible', 'reviewing', 'resubmitted')),
  snapshotted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (challenge_id, proposal_id),
  UNIQUE (challenge_id, proposal_version_id),
  FOREIGN KEY (proposal_id, challenge_id) REFERENCES proposal (id, challenge_id),
  FOREIGN KEY (proposal_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id)
);
CREATE INDEX evaluation_proposal_version_idx ON evaluation_proposal (proposal_version_id);

CREATE FUNCTION validate_challenge_evaluation_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  aggregate challenge%ROWTYPE;
  latest_rubric_version_id text;
BEGIN
  SELECT * INTO aggregate
  FROM challenge
  WHERE id = NEW.challenge_id
    AND tenant_id = NEW.tenant_id
    AND workspace_id = NEW.workspace_id
  FOR SHARE;

  IF NOT FOUND
     OR aggregate.stage <> 'published'
     OR aggregate.published_version_id IS NULL
     OR aggregate.published_version_id IS DISTINCT FROM NEW.challenge_version_id THEN
    RAISE EXCEPTION 'evaluation requires the exact published challenge version'
      USING ERRCODE = '23514';
  END IF;
  IF aggregate.publication_state = 'cancelled'
     OR aggregate.publication_state IS NULL
     OR aggregate.proposal_deadline_at IS NULL
     OR (
       aggregate.publication_state <> 'closed'
       AND aggregate.proposal_deadline_at > transaction_timestamp()
     ) THEN
    RAISE EXCEPTION 'evaluation requires a closed or expired submission window'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.challenge_lock_version <> aggregate.lock_version + 1 THEN
    RAISE EXCEPTION 'evaluation must bind the next challenge version'
      USING ERRCODE = '23514';
  END IF;

  SELECT rv.id INTO latest_rubric_version_id
  FROM rubric r
  JOIN rubric_version rv ON rv.rubric_id = r.id
  WHERE r.tenant_id = NEW.tenant_id
    AND r.challenge_id = NEW.challenge_id
    AND r.challenge_version_id = NEW.challenge_version_id
  ORDER BY rv.version_number DESC
  LIMIT 1;
  IF latest_rubric_version_id IS NULL
     OR latest_rubric_version_id IS DISTINCT FROM NEW.rubric_version_id THEN
    RAISE EXCEPTION 'evaluation requires the latest rubric for the published version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER challenge_evaluation_binding
BEFORE INSERT ON challenge_evaluation
FOR EACH ROW EXECUTE FUNCTION validate_challenge_evaluation_insert();

CREATE FUNCTION validate_evaluation_proposal_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot challenge_evaluation%ROWTYPE;
BEGIN
  SELECT * INTO snapshot
  FROM challenge_evaluation
  WHERE challenge_id = NEW.challenge_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evaluation proposal requires an evaluation snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM proposal p
    JOIN proposal_version pv
      ON pv.id = NEW.proposal_version_id AND pv.proposal_id = p.id
    WHERE p.id = NEW.proposal_id
      AND p.challenge_id = NEW.challenge_id
      AND p.current_version_id = NEW.proposal_version_id
      AND p.state = NEW.source_state
      AND p.state IN ('eligible', 'reviewing', 'resubmitted')
      AND p.tracking_code IS NOT NULL
      AND pv.locked_at IS NOT NULL
      AND pv.accepted_challenge_version_id = snapshot.challenge_version_id
  ) THEN
    RAISE EXCEPTION 'evaluation roster requires the current locked proposal version'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM access_grant grant_row
    JOIN proposal p ON p.id = NEW.proposal_id
    WHERE grant_row.resource_type = 'proposal'
      AND grant_row.resource_id = NEW.proposal_id
      AND grant_row.proposal_version_id = NEW.proposal_version_id
      AND grant_row.capability = 'read'
      AND grant_row.state = 'active'
      AND grant_row.valid_from <= transaction_timestamp()
      AND grant_row.expires_at > transaction_timestamp()
      AND grant_row.grantor_tenant_id = p.tenant_id
      AND grant_row.grantor_workspace_id = p.owner_workspace_id
      AND grant_row.grantee_tenant_id = snapshot.tenant_id
      AND grant_row.grantee_workspace_id = snapshot.workspace_id
  ) THEN
    RAISE EXCEPTION 'evaluation roster requires active exact-version organization access'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evaluation_proposal_binding
BEFORE INSERT ON evaluation_proposal
FOR EACH ROW EXECUTE FUNCTION validate_evaluation_proposal_insert();

CREATE FUNCTION validate_evaluation_stage_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot challenge_evaluation%ROWTYPE;
  qualifying_count bigint;
  roster_count bigint;
  unresolved_count bigint;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;
  IF OLD.stage <> 'published' OR NEW.stage <> 'evaluating' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO snapshot
  FROM challenge_evaluation
  WHERE challenge_id = NEW.id;
  IF NOT FOUND
     OR snapshot.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR snapshot.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR snapshot.challenge_version_id IS DISTINCT FROM NEW.published_version_id
     OR snapshot.challenge_lock_version IS DISTINCT FROM NEW.lock_version
     OR NEW.publication_state <> 'closed' THEN
    RAISE EXCEPTION 'evaluating requires a matching frozen snapshot and closed intake'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) FILTER (WHERE state IN ('eligible', 'reviewing', 'resubmitted')),
         count(*) FILTER (WHERE state IN (
           'submitted', 'eligibility_review', 'clarification_requested',
           'clarification_submitted', 'revision_requested', 'revision_draft'
         ))
  INTO qualifying_count, unresolved_count
  FROM proposal
  WHERE challenge_id = NEW.id;
  SELECT count(*) INTO roster_count
  FROM evaluation_proposal
  WHERE challenge_id = NEW.id;

  IF unresolved_count <> 0 THEN
    RAISE EXCEPTION 'unresolved proposal workflows block evaluation'
      USING ERRCODE = '23514';
  END IF;
  IF roster_count <> qualifying_count THEN
    RAISE EXCEPTION 'evaluation roster must contain every qualifying proposal exactly once'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER challenge_evaluation_stage_guard
BEFORE UPDATE OF stage, publication_state, lock_version ON challenge
FOR EACH ROW EXECUTE FUNCTION validate_evaluation_stage_transition();

CREATE FUNCTION require_committed_evaluation_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM challenge
    WHERE id = NEW.challenge_id
      AND tenant_id = NEW.tenant_id
      AND workspace_id = NEW.workspace_id
      AND stage = 'evaluating'
      AND publication_state = 'closed'
      AND lock_version = NEW.challenge_lock_version
  ) THEN
    RAISE EXCEPTION 'an evaluation snapshot must commit with its challenge in evaluation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER challenge_evaluation_committed
AFTER INSERT ON challenge_evaluation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_committed_evaluation_stage();

CREATE FUNCTION protect_evaluation_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'evaluation snapshots are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER challenge_evaluation_immutable
BEFORE UPDATE OR DELETE ON challenge_evaluation
FOR EACH ROW EXECUTE FUNCTION protect_evaluation_snapshot();
CREATE TRIGGER evaluation_proposal_immutable
BEFORE UPDATE OR DELETE ON evaluation_proposal
FOR EACH ROW EXECUTE FUNCTION protect_evaluation_snapshot();

CREATE FUNCTION freeze_evaluation_proposal_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evaluation_proposal
    WHERE proposal_id = NEW.proposal_id
  ) THEN
    RAISE EXCEPTION 'an evaluation roster proposal cannot gain another version'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evaluation_proposal_version_frozen
BEFORE INSERT ON proposal_version
FOR EACH ROW EXECUTE FUNCTION freeze_evaluation_proposal_version();

CREATE FUNCTION freeze_evaluation_rubric_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rubric r
    JOIN challenge_evaluation snapshot ON snapshot.challenge_id = r.challenge_id
    WHERE r.id = NEW.rubric_id
  ) THEN
    RAISE EXCEPTION 'an evaluation rubric cannot gain another version'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evaluation_rubric_version_frozen
BEFORE INSERT ON rubric_version
FOR EACH ROW EXECUTE FUNCTION freeze_evaluation_rubric_version();

CREATE FUNCTION protect_evaluation_proposal_aggregate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evaluation_proposal
    WHERE proposal_id = OLD.id
  ) THEN
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
       OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
       OR NEW.owner_workspace_id IS DISTINCT FROM OLD.owner_workspace_id
       OR NEW.owner_workspace_kind IS DISTINCT FROM OLD.owner_workspace_kind
       OR NEW.tracking_code IS DISTINCT FROM OLD.tracking_code
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.state NOT IN ('eligible', 'reviewing', 'resubmitted', 'selected', 'rejected') THEN
      RAISE EXCEPTION 'evaluation freezes proposal identity, version and intake state'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evaluation_proposal_aggregate_frozen
BEFORE UPDATE ON proposal
FOR EACH ROW EXECUTE FUNCTION protect_evaluation_proposal_aggregate();
