DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rubric) OR EXISTS (SELECT 1 FROM review_assignment) THEN
    RAISE EXCEPTION 'cannot discard review or rubric evidence during rollback' USING ERRCODE = '55000';
  END IF;
END;
$$;
DROP TABLE coi_declaration;
DROP TABLE review_assignment;
DROP TABLE rubric_version;
DROP TABLE rubric;
DROP FUNCTION initialize_d1_coi();
DROP FUNCTION validate_d1_assignment();
DROP FUNCTION prevent_d1_evidence_mutation();
