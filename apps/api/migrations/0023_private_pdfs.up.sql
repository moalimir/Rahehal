CREATE TABLE file_object (
  id text PRIMARY KEY CHECK (id ~ '^fil_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant(id),
  workspace_id text NOT NULL REFERENCES workspace(id),
  created_by_user_id text NOT NULL REFERENCES app_user(id),
  entity_type text NOT NULL CHECK (entity_type IN ('challenge','proposal')),
  entity_id text NOT NULL,
  filename text NOT NULL CHECK (length(filename) BETWEEN 5 AND 180),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  mime text NOT NULL DEFAULT 'application/pdf' CHECK (mime = 'application/pdf'),
  classification text NOT NULL DEFAULT 'confidential' CHECK (classification = 'confidential'),
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^[a-f0-9]{64}$'),
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('awaiting_upload','quarantined','pending_scan','clean','rejected','scan_failed')),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  scanned_at timestamptz,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace(id, tenant_id),
  CHECK (state NOT IN ('quarantined','pending_scan','clean','scan_failed') OR sha256 IS NOT NULL),
  CHECK (state <> 'clean' OR scanned_at IS NOT NULL)
);
CREATE INDEX file_object_scope ON file_object(tenant_id, workspace_id, entity_type, entity_id);
CREATE INDEX file_object_scan_queue ON file_object(created_at) WHERE state = 'pending_scan';

CREATE FUNCTION protect_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'awaiting_upload' OR NEW.lock_version <> 1 OR NEW.sha256 IS NOT NULL
      OR NOT ((NEW.entity_type='challenge' AND EXISTS (SELECT 1 FROM challenge
        WHERE id=NEW.entity_id AND tenant_id=NEW.tenant_id AND workspace_id=NEW.workspace_id))
      OR (NEW.entity_type='proposal' AND EXISTS (SELECT 1 FROM proposal
        WHERE id=NEW.entity_id AND tenant_id=NEW.tenant_id AND owner_workspace_id=NEW.workspace_id))) THEN
      RAISE EXCEPTION 'file requires an owning record and a new upload' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'file evidence is retained' USING ERRCODE = '55000'; END IF;
  IF (NEW.id, NEW.tenant_id, NEW.workspace_id, NEW.created_by_user_id, NEW.entity_type, NEW.entity_id,
      NEW.filename, NEW.size_bytes, NEW.mime, NEW.classification, NEW.object_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.workspace_id, OLD.created_by_user_id, OLD.entity_type, OLD.entity_id,
      OLD.filename, OLD.size_bytes, OLD.mime, OLD.classification, OLD.object_key, OLD.created_at)
     OR (OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256)
     OR OLD.state IN ('clean','rejected') THEN
    RAISE EXCEPTION 'file identity and terminal scan evidence are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 OR NOT (
    (OLD.state='awaiting_upload' AND NEW.state='quarantined') OR
    (OLD.state IN ('quarantined','scan_failed') AND NEW.state='pending_scan') OR
    (OLD.state='pending_scan' AND NEW.state IN ('clean','rejected','scan_failed'))
  ) THEN
    RAISE EXCEPTION 'invalid file state transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER file_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON file_object FOR EACH ROW EXECUTE FUNCTION protect_file_identity();

CREATE FUNCTION validate_private_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_tenant text; owner_workspace text; target_id text; target_type text; attachment text;
BEGIN
  IF TG_TABLE_NAME = 'proposal_version' THEN
    target_id := NEW.proposal_id; target_type := 'proposal';
    SELECT tenant_id, owner_workspace_id INTO owner_tenant, owner_workspace FROM proposal WHERE id = target_id;
  ELSE
    target_id := NEW.challenge_id; target_type := 'challenge';
    SELECT tenant_id, workspace_id INTO owner_tenant, owner_workspace FROM challenge WHERE id = target_id;
  END IF;
  FOR attachment IN SELECT jsonb_array_elements_text(COALESCE(NEW.content->'attachment_ids','[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM file_object WHERE id = attachment
      AND tenant_id = owner_tenant AND workspace_id = owner_workspace
      AND entity_type = target_type AND entity_id = target_id AND state = 'clean') THEN
      RAISE EXCEPTION 'attachment must be clean and owned by this exact record' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER proposal_private_attachments BEFORE INSERT ON proposal_version FOR EACH ROW EXECUTE FUNCTION validate_private_attachments();
CREATE TRIGGER challenge_private_attachments BEFORE INSERT ON challenge_version FOR EACH ROW EXECUTE FUNCTION validate_private_attachments();
