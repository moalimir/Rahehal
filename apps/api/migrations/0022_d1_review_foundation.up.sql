-- D1 stores exact review bindings, but exposes no assignment/COI/scoring writes.
-- Later slices extend the initial-only state constraints with atomic commands.
CREATE TABLE rubric (
  id text PRIMARY KEY CHECK (id ~ '^rub_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  FOREIGN KEY (challenge_id, tenant_id) REFERENCES challenge (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id) REFERENCES challenge_version (id, challenge_id),
  UNIQUE (id, challenge_version_id)
);
CREATE INDEX rubric_challenge_idx ON rubric (challenge_id);

CREATE TABLE rubric_version (
  id text PRIMARY KEY CHECK (id ~ '^rbv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  rubric_id text NOT NULL REFERENCES rubric (id),
  version_number integer NOT NULL CHECK (version_number > 0),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) > 0),
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (rubric_id, version_number)
);

CREATE TABLE review_assignment (
  id text PRIMARY KEY CHECK (id ~ '^rva_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  proposal_version_id text NOT NULL REFERENCES proposal_version (id),
  rubric_version_id text NOT NULL REFERENCES rubric_version (id),
  reviewer_membership_id text NOT NULL REFERENCES membership (id),
  reviewer_user_id text NOT NULL REFERENCES app_user (id),
  state text NOT NULL DEFAULT 'coi-gate' CONSTRAINT d1_assignment_initial_state CHECK (state = 'coi-gate'),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  due_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (due_at > created_at),
  UNIQUE (proposal_version_id, reviewer_user_id)
);
CREATE INDEX review_assignment_reviewer_idx ON review_assignment (reviewer_membership_id, id);
CREATE INDEX review_assignment_rubric_idx ON review_assignment (rubric_version_id);
CREATE INDEX review_assignment_tenant_idx ON review_assignment (tenant_id);

CREATE TABLE coi_declaration (
  assignment_id text PRIMARY KEY REFERENCES review_assignment (id),
  coi_status text NOT NULL DEFAULT 'pending' CONSTRAINT d1_coi_initial_state CHECK (coi_status = 'pending'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION prevent_d1_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review foundation evidence is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER rubric_immutable BEFORE UPDATE OR DELETE ON rubric
  FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();
CREATE TRIGGER rubric_version_immutable BEFORE UPDATE OR DELETE ON rubric_version
  FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();
CREATE TRIGGER review_assignment_immutable BEFORE UPDATE OR DELETE ON review_assignment
  FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();
CREATE TRIGGER coi_declaration_immutable BEFORE UPDATE OR DELETE ON coi_declaration
  FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();

CREATE FUNCTION validate_d1_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The review belongs to the challenge-owning organization, not the solver or
  -- platform tenant. Both immutable versions must refer to the same published terms.
  IF NOT EXISTS (
    SELECT 1 FROM proposal_version pv
    JOIN proposal p ON p.id = pv.proposal_id
    JOIN challenge c ON c.id = p.challenge_id
    JOIN rubric_version rv ON rv.id = NEW.rubric_version_id
    JOIN rubric r ON r.id = rv.rubric_id
    WHERE pv.id = NEW.proposal_version_id AND pv.locked_at IS NOT NULL
      AND c.tenant_id = NEW.tenant_id AND r.tenant_id = NEW.tenant_id
      AND r.challenge_id = c.id
      AND r.challenge_version_id = pv.accepted_challenge_version_id
  ) THEN
    RAISE EXCEPTION 'assignment requires matching locked proposal and rubric terms' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM membership m
    WHERE m.id = NEW.reviewer_membership_id AND m.user_id = NEW.reviewer_user_id
      AND m.workspace_kind = 'platform' AND m.role = 'platform:reviewer' AND m.state = 'active'
    FOR SHARE OF m
  ) THEN
    RAISE EXCEPTION 'assignment requires an active reviewer membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_assignment_binding BEFORE INSERT ON review_assignment
  FOR EACH ROW EXECUTE FUNCTION validate_d1_assignment();

CREATE FUNCTION initialize_d1_coi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO coi_declaration (assignment_id, created_at) VALUES (NEW.id, NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_assignment_pending_coi AFTER INSERT ON review_assignment
  FOR EACH ROW EXECUTE FUNCTION initialize_d1_coi();
