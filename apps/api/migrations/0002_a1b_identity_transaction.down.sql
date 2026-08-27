DROP INDEX IF EXISTS app_session_origin_tenant_idx;

ALTER TABLE app_session
  DROP CONSTRAINT IF EXISTS app_session_origin_tenant_fk,
  DROP COLUMN IF EXISTS origin_tenant_id;
