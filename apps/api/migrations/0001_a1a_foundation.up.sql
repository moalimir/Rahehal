CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE tenant (
  id text PRIMARY KEY CHECK (id ~ '^ten_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  kind text NOT NULL CHECK (kind IN ('organization', 'solver', 'platform')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, kind)
);

CREATE TABLE app_user (
  id text PRIMARY KEY CHECK (id ~ '^usr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  primary_email citext NOT NULL CHECK (length(primary_email::text) BETWEEN 3 AND 320),
  email_verified boolean NOT NULL DEFAULT false,
  primary_phone text,
  phone_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (primary_email),
  CHECK (primary_phone IS NOT NULL OR NOT phone_verified),
  CHECK (updated_at >= created_at)
);

CREATE TABLE identity_link (
  id text PRIMARY KEY CHECK (id ~ '^idl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  user_id text NOT NULL REFERENCES app_user (id),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 8 AND 2048),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_authenticated_at timestamptz,
  UNIQUE (issuer, subject),
  UNIQUE (user_id, issuer),
  CHECK (last_authenticated_at IS NULL OR last_authenticated_at >= created_at)
);

CREATE TABLE workspace (
  id text PRIMARY KEY CHECK (id ~ '^wsp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  tenant_kind text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('platform', 'org', 'individual', 'team')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  owner_user_id text REFERENCES app_user (id),
  team_kind text CHECK (team_kind IN ('expert-team', 'company', 'lab', 'academic-group')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, tenant_kind) REFERENCES tenant (id, kind),
  UNIQUE (id, tenant_id),
  UNIQUE (id, tenant_id, kind),
  UNIQUE (id, tenant_id, kind, tenant_kind),
  CHECK (
    (kind = 'platform' AND tenant_kind = 'platform') OR
    (kind = 'org' AND tenant_kind = 'organization') OR
    (kind IN ('individual', 'team') AND tenant_kind = 'solver')
  ),
  CHECK (
    (kind IN ('platform', 'org') AND owner_user_id IS NULL AND team_kind IS NULL) OR
    (kind = 'individual' AND owner_user_id IS NOT NULL AND team_kind IS NULL) OR
    (kind = 'team' AND owner_user_id IS NOT NULL AND team_kind IS NOT NULL)
  ),
  CHECK (updated_at >= created_at)
);

CREATE TABLE membership (
  id text PRIMARY KEY CHECK (id ~ '^mem_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  workspace_kind text NOT NULL,
  user_id text NOT NULL REFERENCES app_user (id),
  role text NOT NULL CHECK (role IN (
    'platform:ops', 'platform:finance', 'platform:legal', 'platform:reviewer', 'platform:admin',
    'org:owner', 'org:member', 'org:approver_technical', 'org:approver_legal',
    'org:approver_finance', 'org:publisher',
    'team:owner', 'team:admin', 'team:proposal-manager', 'team:contributor', 'team:viewer',
    'individual'
  )),
  state text NOT NULL CHECK (state IN (
    'invited', 'requested', 'active', 'rejected', 'expired', 'suspended', 'removed'
  )),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id, workspace_kind)
    REFERENCES workspace (id, tenant_id, kind),
  UNIQUE (workspace_id, user_id),
  CHECK (
    (workspace_kind = 'platform' AND role LIKE 'platform:%') OR
    (workspace_kind = 'org' AND role LIKE 'org:%') OR
    (workspace_kind = 'team' AND role LIKE 'team:%') OR
    (workspace_kind = 'individual' AND role = 'individual')
  ),
  CHECK (updated_at >= created_at)
);

CREATE INDEX membership_user_state_idx ON membership (user_id, state);
CREATE INDEX membership_tenant_workspace_state_idx ON membership (tenant_id, workspace_id, state);

CREATE TABLE access_grant (
  id text PRIMARY KEY CHECK (id ~ '^agr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  grantor_tenant_id text NOT NULL REFERENCES tenant (id),
  grantor_workspace_id text NOT NULL,
  grantee_tenant_id text NOT NULL REFERENCES tenant (id),
  grantee_workspace_id text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('challenge', 'proposal', 'case', 'file')),
  resource_id text NOT NULL CHECK (length(resource_id) BETWEEN 5 AND 80),
  capability text NOT NULL CHECK (capability IN ('read', 'collaborate', 'review')),
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'expired')),
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_user_id text REFERENCES app_user (id),
  revocation_reason text CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 1 AND 500),
  FOREIGN KEY (grantor_workspace_id, grantor_tenant_id)
    REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (grantee_workspace_id, grantee_tenant_id)
    REFERENCES workspace (id, tenant_id),
  CHECK (grantor_tenant_id <> grantee_tenant_id),
  CHECK (expires_at > valid_from),
  CHECK (
    (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason IS NOT NULL) OR
    (state IN ('active', 'expired') AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
  )
);

CREATE UNIQUE INDEX access_grant_one_active_capability_idx
  ON access_grant (
    grantor_tenant_id,
    grantor_workspace_id,
    grantee_tenant_id,
    grantee_workspace_id,
    resource_type,
    resource_id,
    capability
  )
  WHERE state = 'active';
CREATE INDEX access_grant_grantee_scope_idx
  ON access_grant (grantee_tenant_id, grantee_workspace_id, state, expires_at);

CREATE TABLE app_session (
  id text PRIMARY KEY CHECK (id ~ '^ses_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  user_id text NOT NULL REFERENCES app_user (id),
  token_family_id text NOT NULL CHECK (id <> token_family_id AND length(token_family_id) BETWEEN 8 AND 80),
  access_token_digest text NOT NULL UNIQUE CHECK (access_token_digest ~ '^[0-9a-f]{64}$'),
  refresh_token_digest text NOT NULL UNIQUE CHECK (refresh_token_digest ~ '^[0-9a-f]{64}$'),
  session_version bigint NOT NULL DEFAULT 0 CHECK (session_version >= 0),
  active_tenant_id text,
  active_workspace_id text,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 1 AND 500),
  FOREIGN KEY (active_workspace_id, active_tenant_id)
    REFERENCES workspace (id, tenant_id),
  CHECK ((active_tenant_id IS NULL) = (active_workspace_id IS NULL)),
  CHECK (access_token_digest <> refresh_token_digest),
  CHECK (access_expires_at > issued_at),
  CHECK (refresh_expires_at > access_expires_at),
  CHECK (last_used_at IS NULL OR last_used_at >= issued_at),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);

CREATE INDEX app_session_user_active_idx ON app_session (user_id, refresh_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE challenge (
  id text PRIMARY KEY CHECK (id ~ '^chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  tenant_kind text NOT NULL CHECK (tenant_kind = 'organization'),
  workspace_id text NOT NULL,
  workspace_kind text NOT NULL CHECK (workspace_kind = 'org'),
  stage text NOT NULL CHECK (stage IN (
    'draft', 'triage', 'formulation', 'approvals', 'published', 'evaluating',
    'decided', 'contracting', 'pilot', 'impact', 'closed'
  )),
  current_version_id text NOT NULL,
  published_version_id text,
  lock_version bigint NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id, workspace_kind, tenant_kind)
    REFERENCES workspace (id, tenant_id, kind, tenant_kind),
  UNIQUE (id, tenant_id),
  CHECK (
    (stage IN ('draft', 'triage', 'formulation', 'approvals') AND published_version_id IS NULL) OR
    (stage IN ('published', 'evaluating', 'decided', 'contracting', 'pilot', 'impact', 'closed') AND published_version_id IS NOT NULL)
  ),
  CHECK (updated_at >= created_at)
);

CREATE TABLE challenge_version (
  id text PRIMARY KEY CHECK (id ~ '^chv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  challenge_id text NOT NULL REFERENCES challenge (id),
  version_number integer NOT NULL CHECK (version_number > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_at timestamptz,
  lock_reason text CHECK (lock_reason IS NULL OR length(btrim(lock_reason)) BETWEEN 1 AND 100),
  UNIQUE (challenge_id, version_number),
  UNIQUE (id, challenge_id),
  CHECK ((locked_at IS NULL AND lock_reason IS NULL) OR (locked_at IS NOT NULL AND lock_reason IS NOT NULL)),
  CHECK (locked_at IS NULL OR locked_at >= created_at)
);

ALTER TABLE challenge
  ADD CONSTRAINT challenge_current_version_fk
    FOREIGN KEY (current_version_id, id)
    REFERENCES challenge_version (id, challenge_id)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT challenge_published_version_fk
    FOREIGN KEY (published_version_id, id)
    REFERENCES challenge_version (id, challenge_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION prevent_locked_challenge_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked challenge versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER challenge_version_immutable_when_locked
BEFORE UPDATE OR DELETE ON challenge_version
FOR EACH ROW EXECUTE FUNCTION prevent_locked_challenge_version_mutation();

CREATE TABLE audit_event (
  id text PRIMARY KEY CHECK (id ~ '^aud_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^cor_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text REFERENCES tenant (id),
  workspace_id text,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'system', 'provider', 'anonymous')),
  actor_user_id text REFERENCES app_user (id),
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 160),
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 2 AND 100),
  target_type text CHECK (target_type IS NULL OR length(target_type) BETWEEN 2 AND 80),
  target_id text CHECK (target_id IS NULL OR length(target_id) BETWEEN 3 AND 80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  CHECK ((workspace_id IS NULL) OR (tenant_id IS NOT NULL)),
  CHECK ((target_type IS NULL) = (target_id IS NULL)),
  CHECK ((actor_kind = 'user' AND actor_user_id IS NOT NULL) OR (actor_kind <> 'user' AND actor_user_id IS NULL))
);

CREATE INDEX audit_event_tenant_time_idx ON audit_event (tenant_id, occurred_at DESC);
CREATE INDEX audit_event_actor_time_idx ON audit_event (actor_user_id, occurred_at DESC);
CREATE INDEX audit_event_target_time_idx ON audit_event (target_type, target_id, occurred_at DESC);

CREATE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TABLE outbox_event (
  id text PRIMARY KEY CHECK (id ~ '^evt_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^cor_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 3 AND 160),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aggregate_type text NOT NULL CHECK (length(aggregate_type) BETWEEN 2 AND 80),
  aggregate_id text NOT NULL CHECK (length(aggregate_id) BETWEEN 5 AND 80),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 8 AND 200),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_at timestamptz,
  published_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 2 AND 100),
  CHECK (available_at >= occurred_at),
  CHECK (published_at IS NULL OR published_at >= occurred_at)
);

CREATE INDEX outbox_event_pending_idx ON outbox_event (available_at, occurred_at)
  WHERE published_at IS NULL;

CREATE FUNCTION protect_outbox_event_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
    OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
  THEN
    RAISE EXCEPTION 'outbox event content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_event_content_immutable
BEFORE UPDATE ON outbox_event
FOR EACH ROW EXECUTE FUNCTION protect_outbox_event_content();

CREATE TABLE idempotency_key (
  id text PRIMARY KEY CHECK (id ~ '^idk_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  scope_kind text NOT NULL CHECK (scope_kind IN ('tenant', 'credential')),
  tenant_id text REFERENCES tenant (id),
  credential_fingerprint text CHECK (credential_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb CHECK (response_body IS NULL OR jsonb_typeof(response_body) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT idempotency_scope_key_uq
    UNIQUE NULLS NOT DISTINCT (scope_kind, tenant_id, credential_fingerprint, idempotency_key),
  CHECK (
    (scope_kind = 'tenant' AND tenant_id IS NOT NULL AND credential_fingerprint IS NULL) OR
    (scope_kind = 'credential' AND tenant_id IS NULL AND credential_fingerprint IS NOT NULL)
  ),
  CHECK (
    (status = 'in_progress' AND response_status IS NULL AND response_body IS NULL) OR
    (status = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL)
  ),
  CHECK (
    response_body IS NULL OR (
      NOT jsonb_path_exists(response_body, '$.**.access_token') AND
      NOT jsonb_path_exists(response_body, '$.**.refresh_token')
    )
  ),
  CHECK (expires_at > created_at)
);

CREATE INDEX idempotency_key_expiry_idx ON idempotency_key (expires_at);
