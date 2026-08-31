ALTER TABLE app_session
  ADD COLUMN origin_tenant_id text;

UPDATE app_session AS session
SET origin_tenant_id = COALESCE(
  session.active_tenant_id,
  (
    SELECT membership.tenant_id
    FROM membership
    WHERE membership.user_id = session.user_id
    ORDER BY (membership.state = 'active') DESC, membership.created_at, membership.id
    LIMIT 1
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app_session WHERE origin_tenant_id IS NULL) THEN
    RAISE EXCEPTION
      '0002 cannot assign an origin tenant to every existing session; revoke orphaned sessions before retrying';
  END IF;
END;
$$;

ALTER TABLE app_session
  ALTER COLUMN origin_tenant_id SET NOT NULL,
  ADD CONSTRAINT app_session_origin_tenant_fk
    FOREIGN KEY (origin_tenant_id) REFERENCES tenant (id);

CREATE INDEX app_session_origin_tenant_idx ON app_session (origin_tenant_id, user_id);
