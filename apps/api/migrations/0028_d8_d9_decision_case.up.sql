CREATE TABLE step_up_attempt (
  id text PRIMARY KEY CHECK (id ~ '^sup_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  oidc_state_digest text NOT NULL UNIQUE CHECK (oidc_state_digest ~ '^[0-9a-f]{64}$'),
  session_id text NOT NULL REFERENCES app_session (id),
  session_version bigint NOT NULL CHECK (session_version >= 0),
  user_id text NOT NULL REFERENCES app_user (id),
  tenant_id text NOT NULL REFERENCES tenant (id),
  workspace_id text NOT NULL,
  action text NOT NULL CHECK (action = 'challenge.decision.record'),
  target_type text NOT NULL CHECK (target_type = 'challenge'),
  target_id text NOT NULL REFERENCES challenge (id),
  return_to text NOT NULL CHECK (
    return_to ~ '^/app/org/challenges/record/evaluation\?id=chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','consumed')),
  proof_digest text UNIQUE CHECK (proof_digest IS NULL OR proof_digest ~ '^[0-9a-f]{64}$'),
  provider_issuer text,
  provider_subject text,
  authenticated_at timestamptz,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  consumed_by_decision_id text,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'pending' AND proof_digest IS NULL AND provider_issuer IS NULL
      AND provider_subject IS NULL AND authenticated_at IS NULL AND verified_at IS NULL
      AND consumed_at IS NULL AND consumed_by_decision_id IS NULL)
    OR
    (status = 'verified' AND proof_digest IS NOT NULL AND provider_issuer IS NOT NULL
      AND provider_subject IS NOT NULL AND authenticated_at IS NOT NULL AND verified_at IS NOT NULL
      AND consumed_at IS NULL AND consumed_by_decision_id IS NULL)
    OR
    (status = 'consumed' AND proof_digest IS NOT NULL AND provider_issuer IS NOT NULL
      AND provider_subject IS NOT NULL AND authenticated_at IS NOT NULL AND verified_at IS NOT NULL
      AND consumed_at IS NOT NULL AND consumed_by_decision_id IS NOT NULL)
  )
);
CREATE INDEX step_up_attempt_context_idx
  ON step_up_attempt (session_id, user_id, tenant_id, workspace_id, target_id, status, expires_at);

CREATE FUNCTION validate_step_up_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'pending' OR NOT EXISTS (
    SELECT 1
    FROM app_session session
    JOIN challenge challenge ON challenge.id = NEW.target_id
    WHERE session.id = NEW.session_id
      AND session.user_id = NEW.user_id
      AND session.session_version = NEW.session_version
      AND session.revoked_at IS NULL
      AND session.access_expires_at > NEW.created_at
      AND session.active_tenant_id = NEW.tenant_id
      AND session.active_workspace_id = NEW.workspace_id
      AND challenge.tenant_id = NEW.tenant_id
      AND challenge.workspace_id = NEW.workspace_id
      AND challenge.stage = 'evaluating'
  ) THEN
    RAISE EXCEPTION 'step-up attempt requires the active session and exact challenge scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER step_up_attempt_insert_guard
BEFORE INSERT ON step_up_attempt
FOR EACH ROW EXECUTE FUNCTION validate_step_up_attempt_insert();

CREATE TABLE decision_shortlist_version (
  id text PRIMARY KEY CHECK (id ~ '^dsv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  workspace_id text NOT NULL,
  challenge_id text NOT NULL REFERENCES challenge_evaluation (challenge_id),
  challenge_version_id text NOT NULL,
  rubric_version_id text NOT NULL REFERENCES rubric_version (id),
  version_number integer NOT NULL CHECK (version_number > 0),
  challenge_lock_version bigint NOT NULL CHECK (challenge_lock_version > 0),
  proposal_versions jsonb NOT NULL CHECK (jsonb_typeof(proposal_versions) = 'array'),
  rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 10000),
  recorded_by_user_id text NOT NULL REFERENCES app_user (id),
  recorded_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (challenge_id, version_number),
  UNIQUE (challenge_id, challenge_lock_version),
  UNIQUE (id, challenge_id)
);

CREATE TABLE decision (
  id text PRIMARY KEY CHECK (id ~ '^dec_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  workspace_id text NOT NULL,
  challenge_id text NOT NULL UNIQUE REFERENCES challenge_evaluation (challenge_id),
  challenge_version_id text NOT NULL,
  rubric_version_id text NOT NULL REFERENCES rubric_version (id),
  shortlist_version_id text REFERENCES decision_shortlist_version (id),
  outcome text NOT NULL CHECK (outcome IN ('selected','no_award')),
  selected_proposal_id text,
  selected_proposal_version_id text,
  reason_code text NOT NULL CHECK (reason_code IN (
    'best_overall_fit','strategic_fit','delivery_confidence','risk_adjusted_value',
    'no_qualifying_proposal','reviews_inconclusive','budget_or_timing_constraints',
    'risk_too_high','other'
  )),
  rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 10000),
  actor_user_id text NOT NULL REFERENCES app_user (id),
  step_up_attempt_id text NOT NULL UNIQUE REFERENCES step_up_attempt (id),
  challenge_lock_version bigint NOT NULL CHECK (challenge_lock_version > 0),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^cor_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  decided_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  FOREIGN KEY (selected_proposal_id, challenge_id)
    REFERENCES proposal (id, challenge_id),
  FOREIGN KEY (selected_proposal_version_id, selected_proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  CHECK (
    (outcome = 'selected' AND selected_proposal_id IS NOT NULL
      AND selected_proposal_version_id IS NOT NULL
      AND reason_code IN ('best_overall_fit','strategic_fit','delivery_confidence',
                          'risk_adjusted_value','other'))
    OR
    (outcome = 'no_award' AND selected_proposal_id IS NULL
      AND selected_proposal_version_id IS NULL
      AND reason_code IN ('no_qualifying_proposal','reviews_inconclusive',
                          'budget_or_timing_constraints','risk_too_high','other'))
  )
);
ALTER TABLE step_up_attempt
  ADD CONSTRAINT step_up_consumed_decision_fk
    FOREIGN KEY (consumed_by_decision_id) REFERENCES decision (id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE decision_review_evidence (
  decision_id text NOT NULL REFERENCES decision (id),
  review_id text NOT NULL REFERENCES review_scorecard (id),
  assignment_id text NOT NULL REFERENCES review_assignment (id),
  proposal_id text NOT NULL,
  proposal_version_id text NOT NULL,
  rubric_version_id text NOT NULL REFERENCES rubric_version (id),
  PRIMARY KEY (decision_id, review_id),
  UNIQUE (decision_id, assignment_id),
  FOREIGN KEY (proposal_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id)
);

CREATE TABLE case_record (
  id text PRIMARY KEY CHECK (id ~ '^case_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  workspace_id text NOT NULL,
  challenge_id text NOT NULL UNIQUE REFERENCES challenge (id),
  challenge_version_id text NOT NULL,
  proposal_id text NOT NULL UNIQUE,
  proposal_version_id text NOT NULL UNIQUE,
  decision_id text NOT NULL UNIQUE REFERENCES decision (id),
  solver_tenant_id text NOT NULL REFERENCES tenant (id),
  solver_workspace_id text NOT NULL,
  state text NOT NULL DEFAULT 'created' CHECK (state = 'created'),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (solver_workspace_id, solver_tenant_id)
    REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  FOREIGN KEY (proposal_id, challenge_id) REFERENCES proposal (id, challenge_id),
  FOREIGN KEY (proposal_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  CHECK (tenant_id <> solver_tenant_id)
);

CREATE TABLE decision_proposal_outcome (
  decision_id text NOT NULL REFERENCES decision (id),
  proposal_id text NOT NULL,
  proposal_version_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('selected','rejected')),
  feedback text NOT NULL CHECK (length(btrim(feedback)) BETWEEN 1 AND 4000),
  case_id text REFERENCES case_record (id),
  PRIMARY KEY (decision_id, proposal_id),
  UNIQUE (decision_id, proposal_version_id),
  FOREIGN KEY (proposal_version_id, proposal_id)
    REFERENCES proposal_version (id, proposal_id),
  CHECK (
    (outcome = 'selected' AND case_id IS NOT NULL)
    OR (outcome = 'rejected' AND case_id IS NULL)
  )
);

CREATE FUNCTION decision_reviews_complete(target_challenge_id text, target_rubric_version_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM evaluation_proposal roster
    WHERE roster.challenge_id = target_challenge_id
      AND (
        SELECT count(DISTINCT assignment.reviewer_user_id)
        FROM review_assignment assignment
        JOIN review_scorecard scorecard ON scorecard.assignment_id = assignment.id
        WHERE assignment.challenge_id = roster.challenge_id
          AND assignment.proposal_id = roster.proposal_id
          AND assignment.proposal_version_id = roster.proposal_version_id
          AND assignment.rubric_version_id = target_rubric_version_id
          AND assignment.state = 'locked'
          AND scorecard.locked_at IS NOT NULL
          AND scorecard.invalidated_at IS NULL
      ) <> 2
  )
$$;

CREATE FUNCTION valid_decision_proposal_references(target_challenge_id text, refs jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE item jsonb; seen text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(refs) <> 'array' OR jsonb_array_length(refs) < 1
     OR jsonb_array_length(refs) > 500 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(refs) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 2
       OR NOT item ?& ARRAY['proposal_id','proposal_version_id']
       OR item->>'proposal_id' = ANY(seen)
       OR NOT EXISTS (
         SELECT 1 FROM evaluation_proposal roster
         WHERE roster.challenge_id = target_challenge_id
           AND roster.proposal_id = item->>'proposal_id'
           AND roster.proposal_version_id = item->>'proposal_version_id'
       ) THEN RETURN false; END IF;
    seen := array_append(seen, item->>'proposal_id');
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION validate_decision_shortlist_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE aggregate challenge%ROWTYPE; snapshot challenge_evaluation%ROWTYPE; expected_number integer;
BEGIN
  SELECT * INTO aggregate FROM challenge WHERE id = NEW.challenge_id FOR SHARE;
  SELECT * INTO snapshot FROM challenge_evaluation WHERE challenge_id = NEW.challenge_id;
  SELECT coalesce(max(version_number), 0) + 1 INTO expected_number
  FROM decision_shortlist_version WHERE challenge_id = NEW.challenge_id;
  IF aggregate.id IS NULL OR snapshot.challenge_id IS NULL
     OR aggregate.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR aggregate.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR aggregate.stage <> 'evaluating'
     OR aggregate.lock_version + 1 <> NEW.challenge_lock_version
     OR snapshot.challenge_version_id IS DISTINCT FROM NEW.challenge_version_id
     OR snapshot.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id
     OR NEW.version_number <> expected_number
     OR NOT valid_decision_proposal_references(NEW.challenge_id, NEW.proposal_versions)
     OR NOT decision_reviews_complete(NEW.challenge_id, NEW.rubric_version_id)
     OR NOT EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.user_id = NEW.recorded_by_user_id
         AND membership.workspace_id = NEW.workspace_id
         AND membership.tenant_id = NEW.tenant_id
         AND membership.role IN ('org:owner','org:member')
         AND membership.state = 'active'
     ) THEN
    RAISE EXCEPTION 'invalid decision shortlist evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decision_shortlist_insert_guard
BEFORE INSERT ON decision_shortlist_version
FOR EACH ROW EXECUTE FUNCTION validate_decision_shortlist_insert();

CREATE FUNCTION validate_final_decision_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE aggregate challenge%ROWTYPE; snapshot challenge_evaluation%ROWTYPE; latest_shortlist text;
BEGIN
  SELECT * INTO aggregate FROM challenge WHERE id = NEW.challenge_id FOR SHARE;
  SELECT * INTO snapshot FROM challenge_evaluation WHERE challenge_id = NEW.challenge_id;
  SELECT id INTO latest_shortlist FROM decision_shortlist_version
  WHERE challenge_id = NEW.challenge_id ORDER BY version_number DESC LIMIT 1;
  IF aggregate.id IS NULL OR snapshot.challenge_id IS NULL
     OR aggregate.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR aggregate.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR aggregate.stage <> 'evaluating'
     OR aggregate.lock_version + 1 <> NEW.challenge_lock_version
     OR snapshot.challenge_version_id IS DISTINCT FROM NEW.challenge_version_id
     OR snapshot.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id
     OR NOT decision_reviews_complete(NEW.challenge_id, NEW.rubric_version_id)
     OR NOT EXISTS (
       SELECT 1 FROM membership membership
       WHERE membership.user_id = NEW.actor_user_id
         AND membership.workspace_id = NEW.workspace_id
         AND membership.tenant_id = NEW.tenant_id
         AND membership.role IN ('org:owner','org:member')
         AND membership.state = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM step_up_attempt proof
       WHERE proof.id = NEW.step_up_attempt_id
         AND proof.session_id IS NOT NULL
         AND proof.user_id = NEW.actor_user_id
         AND proof.tenant_id = NEW.tenant_id AND proof.workspace_id = NEW.workspace_id
         AND proof.action = 'challenge.decision.record'
         AND proof.target_type = 'challenge' AND proof.target_id = NEW.challenge_id
         AND proof.status = 'verified' AND proof.expires_at > NEW.decided_at
     ) THEN
    RAISE EXCEPTION 'invalid final decision evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW.outcome = 'selected' AND (
       latest_shortlist IS NULL OR NEW.shortlist_version_id IS DISTINCT FROM latest_shortlist
       OR NOT EXISTS (
         SELECT 1 FROM decision_shortlist_version shortlist,
              jsonb_array_elements(shortlist.proposal_versions) item
         WHERE shortlist.id = NEW.shortlist_version_id
           AND item->>'proposal_id' = NEW.selected_proposal_id
           AND item->>'proposal_version_id' = NEW.selected_proposal_version_id
       )
       OR NOT EXISTS (
         SELECT 1 FROM evaluation_proposal roster
         WHERE roster.challenge_id = NEW.challenge_id
           AND roster.proposal_id = NEW.selected_proposal_id
           AND roster.proposal_version_id = NEW.selected_proposal_version_id
       )
     ) THEN
    RAISE EXCEPTION 'selection requires the latest exact-version shortlist'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.outcome = 'no_award' AND NEW.shortlist_version_id IS NOT NULL
     AND NEW.shortlist_version_id IS DISTINCT FROM latest_shortlist THEN
    RAISE EXCEPTION 'no-award may cite only the latest shortlist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER final_decision_insert_guard
BEFORE INSERT ON decision
FOR EACH ROW EXECUTE FUNCTION validate_final_decision_insert();

CREATE FUNCTION validate_decision_review_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM decision decision_row
    JOIN review_assignment assignment ON assignment.id = NEW.assignment_id
    JOIN review_scorecard scorecard ON scorecard.id = NEW.review_id
      AND scorecard.assignment_id = assignment.id
    WHERE decision_row.id = NEW.decision_id
      AND EXISTS (
        SELECT 1 FROM challenge challenge
        WHERE challenge.id = decision_row.challenge_id AND challenge.stage = 'evaluating'
      )
      AND assignment.challenge_id = decision_row.challenge_id
      AND assignment.proposal_id = NEW.proposal_id
      AND assignment.proposal_version_id = NEW.proposal_version_id
      AND assignment.rubric_version_id = NEW.rubric_version_id
      AND NEW.rubric_version_id = decision_row.rubric_version_id
      AND assignment.state = 'locked'
      AND scorecard.locked_at IS NOT NULL AND scorecard.invalidated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'decision review citation requires locked valid exact evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decision_review_evidence_insert_guard
BEFORE INSERT ON decision_review_evidence
FOR EACH ROW EXECUTE FUNCTION validate_decision_review_evidence_insert();

CREATE FUNCTION validate_decision_proposal_outcome_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM decision decision_row
    JOIN challenge challenge ON challenge.id = decision_row.challenge_id
    JOIN evaluation_proposal roster
      ON roster.challenge_id = decision_row.challenge_id
     AND roster.proposal_id = NEW.proposal_id
     AND roster.proposal_version_id = NEW.proposal_version_id
    WHERE decision_row.id = NEW.decision_id
      AND challenge.stage = 'evaluating'
      AND (
        (NEW.outcome = 'selected'
          AND decision_row.outcome = 'selected'
          AND decision_row.selected_proposal_id = NEW.proposal_id
          AND decision_row.selected_proposal_version_id = NEW.proposal_version_id
          AND EXISTS (
            SELECT 1 FROM case_record record
            WHERE record.id = NEW.case_id
              AND record.decision_id = NEW.decision_id
              AND record.proposal_id = NEW.proposal_id
              AND record.proposal_version_id = NEW.proposal_version_id
          ))
        OR
        (NEW.outcome = 'rejected'
          AND (decision_row.selected_proposal_id IS NULL
            OR decision_row.selected_proposal_id <> NEW.proposal_id))
      )
  ) THEN
    RAISE EXCEPTION 'proposal outcome requires exact frozen decision evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decision_proposal_outcome_insert_guard
BEFORE INSERT ON decision_proposal_outcome
FOR EACH ROW EXECUTE FUNCTION validate_decision_proposal_outcome_insert();

CREATE FUNCTION validate_case_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM decision decision_row
    JOIN proposal proposal ON proposal.id = decision_row.selected_proposal_id
    WHERE decision_row.id = NEW.decision_id AND decision_row.outcome = 'selected'
      AND decision_row.tenant_id = NEW.tenant_id
      AND decision_row.workspace_id = NEW.workspace_id
      AND decision_row.challenge_id = NEW.challenge_id
      AND decision_row.challenge_version_id = NEW.challenge_version_id
      AND decision_row.selected_proposal_id = NEW.proposal_id
      AND decision_row.selected_proposal_version_id = NEW.proposal_version_id
      AND proposal.tenant_id = NEW.solver_tenant_id
      AND proposal.owner_workspace_id = NEW.solver_workspace_id
  ) THEN
    RAISE EXCEPTION 'case requires the exact selected decision and solver owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_insert_guard
BEFORE INSERT ON case_record
FOR EACH ROW EXECUTE FUNCTION validate_case_insert();

CREATE FUNCTION validate_case_access_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE target case_record%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.resource_type = 'case' THEN
      RAISE EXCEPTION 'case access grants are append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.resource_type = 'case' OR NEW.resource_type = 'case' THEN
    IF TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.grantor_tenant_id IS DISTINCT FROM OLD.grantor_tenant_id
       OR NEW.grantor_workspace_id IS DISTINCT FROM OLD.grantor_workspace_id
       OR NEW.grantee_tenant_id IS DISTINCT FROM OLD.grantee_tenant_id
       OR NEW.grantee_workspace_id IS DISTINCT FROM OLD.grantee_workspace_id
       OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
      RAISE EXCEPTION 'case grant identity is immutable' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state IN ('revoked','expired')
       AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'terminal case grants are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.resource_type <> 'case' THEN RETURN NEW; END IF;
  SELECT * INTO target FROM case_record WHERE id = NEW.resource_id;
  IF target.id IS NULL
     OR NEW.grantor_tenant_id IS DISTINCT FROM target.tenant_id
     OR NEW.grantor_workspace_id IS DISTINCT FROM target.workspace_id
     OR NEW.grantee_tenant_id IS DISTINCT FROM target.solver_tenant_id
     OR NEW.grantee_workspace_id IS DISTINCT FROM target.solver_workspace_id
     OR NEW.capability <> 'collaborate'
     OR (TG_OP = 'INSERT' AND (
       NEW.state <> 'active'
       OR NEW.valid_from IS DISTINCT FROM target.created_at
       OR NEW.created_at IS DISTINCT FROM target.created_at
       OR NEW.expires_at > target.created_at + interval '365 days'
       OR NOT EXISTS (
         SELECT 1 FROM membership membership
         WHERE membership.user_id = NEW.created_by_user_id
           AND membership.tenant_id = target.tenant_id
           AND membership.workspace_id = target.workspace_id
           AND membership.role IN ('org:owner','org:member')
           AND membership.state = 'active'
       )
     )) THEN
    RAISE EXCEPTION 'case access grant must match the selected solver relationship'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER d9_case_access_grant_validated
BEFORE INSERT OR UPDATE OR DELETE ON access_grant
FOR EACH ROW EXECUTE FUNCTION validate_case_access_grant();

CREATE FUNCTION protect_step_up_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'step-up evidence is append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'verified'
     AND NEW.authenticated_at >= OLD.created_at - interval '2 minutes'
     AND NEW.authenticated_at <= NEW.verified_at + interval '2 minutes'
     AND NEW.expires_at <= OLD.expires_at
     AND NEW.expires_at > NEW.verified_at
     AND (to_jsonb(NEW) - ARRAY[
       'status','proof_digest','provider_issuer','provider_subject','authenticated_at',
       'verified_at','expires_at'
     ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'status','proof_digest','provider_issuer','provider_subject','authenticated_at',
       'verified_at','expires_at'
     ]) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'verified' AND NEW.status = 'consumed'
     AND NEW.consumed_at >= OLD.verified_at
     AND (to_jsonb(NEW) - ARRAY['status','consumed_at','consumed_by_decision_id'])
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','consumed_at','consumed_by_decision_id']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid step-up evidence transition' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER step_up_attempt_immutable
BEFORE UPDATE OR DELETE ON step_up_attempt
FOR EACH ROW EXECUTE FUNCTION protect_step_up_attempt();

CREATE FUNCTION protect_d8_d9_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'decision and case evidence is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER decision_shortlist_immutable
BEFORE UPDATE OR DELETE ON decision_shortlist_version
FOR EACH ROW EXECUTE FUNCTION protect_d8_d9_evidence();
CREATE TRIGGER decision_immutable
BEFORE UPDATE OR DELETE ON decision
FOR EACH ROW EXECUTE FUNCTION protect_d8_d9_evidence();
CREATE TRIGGER decision_review_evidence_immutable
BEFORE UPDATE OR DELETE ON decision_review_evidence
FOR EACH ROW EXECUTE FUNCTION protect_d8_d9_evidence();
CREATE TRIGGER decision_proposal_outcome_immutable
BEFORE UPDATE OR DELETE ON decision_proposal_outcome
FOR EACH ROW EXECUTE FUNCTION protect_d8_d9_evidence();
CREATE TRIGGER case_record_immutable
BEFORE UPDATE OR DELETE ON case_record
FOR EACH ROW EXECUTE FUNCTION protect_d8_d9_evidence();

CREATE FUNCTION prevent_review_invalidation_after_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM review_assignment assignment
       JOIN decision decision_row ON decision_row.challenge_id = assignment.challenge_id
       WHERE assignment.id = NEW.assignment_id
     ) THEN
    RAISE EXCEPTION 'review evidence cannot be invalidated after final decision'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_invalidation_after_decision_guard
BEFORE UPDATE ON review_scorecard
FOR EACH ROW EXECUTE FUNCTION prevent_review_invalidation_after_decision();

CREATE FUNCTION validate_decided_stage_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE final_decision decision%ROWTYPE; roster_count bigint; outcome_count bigint;
DECLARE selected_count bigint; rejected_count bigint; case_count bigint; evidence_gap_count bigint;
BEGIN
  IF OLD.stage <> 'evaluating' OR NEW.stage <> 'decided' THEN RETURN NEW; END IF;
  SELECT * INTO final_decision FROM decision WHERE challenge_id = NEW.id;
  SELECT count(*) INTO roster_count FROM evaluation_proposal WHERE challenge_id = NEW.id;
  SELECT count(*), count(*) FILTER (WHERE outcome = 'selected'),
         count(*) FILTER (WHERE outcome = 'rejected')
  INTO outcome_count, selected_count, rejected_count
  FROM decision_proposal_outcome WHERE decision_id = final_decision.id;
  SELECT count(*) INTO case_count FROM case_record WHERE decision_id = final_decision.id;
  SELECT count(*) INTO evidence_gap_count
  FROM evaluation_proposal roster
  WHERE roster.challenge_id = NEW.id
    AND (
      SELECT count(DISTINCT evidence.assignment_id)
      FROM decision_review_evidence evidence
      JOIN review_assignment assignment ON assignment.id = evidence.assignment_id
      WHERE evidence.decision_id = final_decision.id
        AND evidence.proposal_id = roster.proposal_id
        AND assignment.reviewer_user_id IS NOT NULL
    ) <> 2;
  IF final_decision.id IS NULL
     OR final_decision.challenge_lock_version <> NEW.lock_version
     OR final_decision.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR final_decision.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR roster_count <> outcome_count OR evidence_gap_count <> 0
     OR NOT EXISTS (
       SELECT 1 FROM step_up_attempt proof
       WHERE proof.id = final_decision.step_up_attempt_id
         AND proof.status = 'consumed'
         AND proof.consumed_by_decision_id = final_decision.id
     )
     OR (
       final_decision.outcome = 'selected'
       AND (selected_count <> 1 OR rejected_count <> roster_count - 1 OR case_count <> 1)
     )
     OR (
       final_decision.outcome = 'no_award'
       AND (selected_count <> 0 OR rejected_count <> roster_count OR case_count <> 0)
     ) THEN
    RAISE EXCEPTION 'decided stage requires complete atomic decision evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER challenge_decided_stage_guard
BEFORE UPDATE OF stage, lock_version ON challenge
FOR EACH ROW EXECUTE FUNCTION validate_decided_stage_transition();
