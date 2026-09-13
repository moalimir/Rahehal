-- Preserves every rubric version and its evidence; 0022 still refuses destructive rollback.
ALTER TABLE rubric_version DROP CONSTRAINT rubric_mvp_criteria;
DROP FUNCTION valid_mvp_rubric_criteria(jsonb);
DROP INDEX rubric_challenge_version_unique;
