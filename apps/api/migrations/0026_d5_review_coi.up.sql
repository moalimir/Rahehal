-- D5 makes the reviewer's conflict-of-interest declaration authoritative.
-- The allowlisted packet is copied into its own immutable relation so a
-- pending reviewer read never needs proposal, rubric, solver, or file data.
CREATE TABLE review_assignment_packet (
  assignment_id text PRIMARY KEY REFERENCES review_assignment (id),
  organization_name text NOT NULL CHECK (length(btrim(organization_name)) BETWEEN 1 AND 200),
  challenge_title text NOT NULL CHECK (length(btrim(challenge_title)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL
);

INSERT INTO review_assignment_packet (
  assignment_id, organization_name, challenge_title, created_at
)
SELECT assignment.id, workspace.name, challenge_version.content->>'title', assignment.created_at
FROM review_assignment assignment
JOIN challenge ON challenge.id = assignment.challenge_id
JOIN workspace ON workspace.id = challenge.workspace_id
JOIN rubric_version ON rubric_version.id = assignment.rubric_version_id
JOIN rubric ON rubric.id = rubric_version.rubric_id
JOIN challenge_version ON challenge_version.id = rubric.challenge_version_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_assignment assignment
    LEFT JOIN review_assignment_packet packet ON packet.assignment_id = assignment.id
    WHERE packet.assignment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'every review assignment requires a pre-COI packet'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TRIGGER review_assignment_packet_immutable
BEFORE UPDATE OR DELETE ON review_assignment_packet
FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();

CREATE OR REPLACE FUNCTION initialize_d1_coi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO coi_declaration (assignment_id, relationship_categories, created_at)
  VALUES (NEW.id, '{}'::text[], NEW.created_at);
  INSERT INTO review_assignment_packet (
    assignment_id, organization_name, challenge_title, created_at
  )
  SELECT NEW.id, workspace.name, challenge_version.content->>'title', NEW.created_at
  FROM challenge
  JOIN workspace ON workspace.id = challenge.workspace_id
  JOIN rubric_version ON rubric_version.id = NEW.rubric_version_id
  JOIN rubric ON rubric.id = rubric_version.rubric_id
  JOIN challenge_version ON challenge_version.id = rubric.challenge_version_id
  WHERE challenge.id = NEW.challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review assignment packet requires exact challenge and rubric context'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION valid_review_coi_categories(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_position(value, NULL) IS NULL
     AND value <@ ARRAY[
       'employment_affiliation', 'financial_interest', 'close_personal_relationship',
       'prior_collaboration', 'advisory_role', 'other'
     ]::text[]
     AND cardinality(value) = (SELECT count(DISTINCT item) FROM unnest(value) item)
$$;

ALTER TABLE coi_declaration
  ADD COLUMN relationship_categories text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN reason text,
  ADD COLUMN declared_by_user_id text REFERENCES app_user (id),
  ADD COLUMN declared_at timestamptz;
ALTER TABLE coi_declaration ALTER COLUMN relationship_categories DROP DEFAULT;
ALTER TABLE coi_declaration DROP CONSTRAINT d1_coi_initial_state;
ALTER TABLE coi_declaration
  ADD CONSTRAINT d5_coi_state CHECK (coi_status IN ('pending', 'clear', 'conflict')),
  ADD CONSTRAINT d5_coi_categories CHECK (valid_review_coi_categories(relationship_categories)),
  ADD CONSTRAINT d5_coi_evidence CHECK (
    (
      coi_status = 'pending'
      AND cardinality(relationship_categories) = 0
      AND reason IS NULL
      AND declared_by_user_id IS NULL
      AND declared_at IS NULL
    )
    OR (
      coi_status = 'clear'
      AND cardinality(relationship_categories) = 0
      AND reason IS NULL
      AND declared_by_user_id IS NOT NULL
      AND declared_at IS NOT NULL
      AND declared_at >= created_at
    )
    OR (
      coi_status = 'conflict'
      AND cardinality(relationship_categories) > 0
      AND length(btrim(reason)) BETWEEN 1 AND 2000
      AND declared_by_user_id IS NOT NULL
      AND declared_at IS NOT NULL
      AND declared_at >= created_at
    )
  );

DROP TRIGGER coi_declaration_immutable ON coi_declaration;
CREATE FUNCTION protect_d5_coi_declaration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COI declarations are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.coi_status <> 'pending'
     OR NEW.coi_status NOT IN ('clear', 'conflict')
     OR (to_jsonb(NEW) - ARRAY[
       'coi_status', 'relationship_categories', 'reason',
       'declared_by_user_id', 'declared_at'
     ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'coi_status', 'relationship_categories', 'reason',
       'declared_by_user_id', 'declared_at'
     ])
     OR NOT EXISTS (
       SELECT 1 FROM review_assignment assignment
       WHERE assignment.id = OLD.assignment_id
         AND assignment.reviewer_user_id = NEW.declared_by_user_id
         AND assignment.state = 'coi-gate'
         AND assignment.lock_version = 1
     ) THEN
    RAISE EXCEPTION 'COI declaration evidence is append-only'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER coi_declaration_immutable
BEFORE UPDATE OR DELETE ON coi_declaration
FOR EACH ROW EXECUTE FUNCTION protect_d5_coi_declaration();

ALTER TABLE review_assignment DROP CONSTRAINT d4_assignment_state;
ALTER TABLE review_assignment
  ADD CONSTRAINT d5_assignment_state CHECK (state IN ('coi-gate', 'accepted', 'cancelled'));

DROP TRIGGER review_assignment_immutable ON review_assignment;
DROP FUNCTION protect_d4_assignment();
CREATE FUNCTION protect_d5_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review assignments are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('coi-gate', 'accepted')
     AND NEW.state = 'cancelled'
     AND NEW.lock_version = OLD.lock_version + 1
     AND (to_jsonb(NEW) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'coi-gate'
     AND OLD.lock_version = 1
     AND NEW.state = 'accepted'
     AND NEW.lock_version = 2
     AND (to_jsonb(NEW) - ARRAY['state', 'lock_version'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'lock_version'])
     AND EXISTS (
       SELECT 1 FROM coi_declaration declaration
       WHERE declaration.assignment_id = OLD.id AND declaration.coi_status = 'clear'
     ) THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'coi-gate'
     AND OLD.lock_version = 1
     AND NEW.state = 'coi-gate'
     AND NEW.lock_version = 2
     AND (to_jsonb(NEW) - 'lock_version') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'lock_version')
     AND EXISTS (
       SELECT 1 FROM coi_declaration declaration
       WHERE declaration.assignment_id = OLD.id AND declaration.coi_status = 'conflict'
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'review assignment evidence is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION protect_d5_assignment();
