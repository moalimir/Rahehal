DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM file_object) THEN
    RAISE EXCEPTION 'private file evidence exists; retain storage and roll forward';
  END IF;
END $$;
DROP TRIGGER challenge_private_attachments ON challenge_version;
DROP TRIGGER proposal_private_attachments ON proposal_version;
DROP FUNCTION validate_private_attachments();
DROP TABLE file_object;
DROP FUNCTION protect_file_identity();
