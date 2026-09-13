DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM coi_declaration WHERE coi_status <> 'pending')
     OR EXISTS (SELECT 1 FROM review_assignment WHERE state = 'accepted') THEN
    RAISE EXCEPTION 'cannot remove D5 while COI or acceptance evidence exists'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER review_assignment_immutable ON review_assignment;
DROP FUNCTION protect_d5_assignment();
ALTER TABLE review_assignment DROP CONSTRAINT d5_assignment_state;
ALTER TABLE review_assignment
  ADD CONSTRAINT d4_assignment_state CHECK (state IN ('coi-gate', 'cancelled'));

CREATE FUNCTION protect_d4_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'review assignments are append-only' USING ERRCODE = '55000';
  END IF;
  IF OLD.state <> 'coi-gate'
     OR NEW.state <> 'cancelled'
     OR NEW.lock_version <> OLD.lock_version + 1
     OR (to_jsonb(NEW) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
       'state', 'lock_version', 'cancellation_reason',
       'cancelled_by_user_id', 'cancelled_at'
     ]) THEN
    RAISE EXCEPTION 'review assignment evidence is append-only'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_assignment_immutable
BEFORE UPDATE OR DELETE ON review_assignment
FOR EACH ROW EXECUTE FUNCTION protect_d4_assignment();

DROP TRIGGER coi_declaration_immutable ON coi_declaration;
DROP FUNCTION protect_d5_coi_declaration();
ALTER TABLE coi_declaration DROP CONSTRAINT d5_coi_evidence;
ALTER TABLE coi_declaration DROP CONSTRAINT d5_coi_categories;
ALTER TABLE coi_declaration DROP CONSTRAINT d5_coi_state;
ALTER TABLE coi_declaration
  DROP COLUMN declared_at,
  DROP COLUMN declared_by_user_id,
  DROP COLUMN reason,
  DROP COLUMN relationship_categories;
ALTER TABLE coi_declaration
  ADD CONSTRAINT d1_coi_initial_state CHECK (coi_status = 'pending');
DROP FUNCTION valid_review_coi_categories(text[]);
CREATE TRIGGER coi_declaration_immutable
BEFORE UPDATE OR DELETE ON coi_declaration
FOR EACH ROW EXECUTE FUNCTION prevent_d1_evidence_mutation();

CREATE OR REPLACE FUNCTION initialize_d1_coi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO coi_declaration (assignment_id, created_at) VALUES (NEW.id, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER review_assignment_packet_immutable ON review_assignment_packet;
DROP TABLE review_assignment_packet;
