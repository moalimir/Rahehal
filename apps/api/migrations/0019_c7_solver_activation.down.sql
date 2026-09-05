DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app_user WHERE primary_email IS NULL) THEN
    RAISE EXCEPTION
      '0019 cannot restore the email-only identity schema while mobile-only users exist';
  END IF;
END;
$$;

DROP TRIGGER contact_verification_consumption_append_only ON contact_verification_consumption;
DROP FUNCTION prevent_contact_verification_consumption_mutation();
DROP TABLE contact_verification_consumption;

DROP TRIGGER solver_activation_append_only ON solver_activation;
DROP FUNCTION prevent_solver_activation_mutation();
DROP TRIGGER solver_activation_scope_validated ON solver_activation;
DROP FUNCTION validate_solver_activation_scope();
DROP TABLE solver_activation;

DROP INDEX workspace_one_individual_per_owner_idx;
DROP INDEX app_user_unique_primary_phone_idx;

ALTER TABLE app_user
  DROP CONSTRAINT app_user_primary_contact_ck,
  ALTER COLUMN primary_email SET NOT NULL;
