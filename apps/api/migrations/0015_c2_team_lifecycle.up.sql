-- Phase 3 C2: authoritative team policy, invitations, membership requests,
-- membership administration, ownership transfer, and archival.

ALTER TABLE membership
  ADD COLUMN lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0);

CREATE TABLE team_workspace (
  workspace_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  join_mode text NOT NULL DEFAULT 'request' CHECK (join_mode IN ('open', 'request', 'invite-only')),
  default_invitation_role text NOT NULL DEFAULT 'team:contributor' CHECK (
    default_invitation_role IN (
      'team:admin', 'team:proposal-manager', 'team:contributor', 'team:viewer'
    )
  ),
  proposal_managers_can_edit_profile boolean NOT NULL DEFAULT true,
  proposal_managers_can_invite boolean NOT NULL DEFAULT false,
  admins_can_submit boolean NOT NULL DEFAULT true,
  proposal_managers_can_submit boolean NOT NULL DEFAULT true,
  viewers_can_read_messages boolean NOT NULL DEFAULT true,
  admins_can_view_payments boolean NOT NULL DEFAULT true,
  proposal_managers_can_view_payments boolean NOT NULL DEFAULT true,
  approval_before_submit boolean NOT NULL DEFAULT false,
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  archived_at timestamptz,
  archived_by_user_id text REFERENCES app_user (id),
  archive_reason text CHECK (
    archive_reason IS NULL OR length(btrim(archive_reason)) BETWEEN 1 AND 2000
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES workspace (id, tenant_id),
  UNIQUE (workspace_id, tenant_id),
  CHECK (updated_at >= created_at),
  CHECK (
    (status = 'active' AND archived_at IS NULL AND archived_by_user_id IS NULL AND archive_reason IS NULL)
    OR
    (status = 'archived' AND archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL AND archive_reason IS NOT NULL)
  )
);

CREATE FUNCTION validate_team_workspace_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace
    WHERE id = NEW.workspace_id AND tenant_id = NEW.tenant_id AND kind = 'team'
  ) THEN
    RAISE EXCEPTION 'team lifecycle rows require a team workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_workspace_kind_validated
BEFORE INSERT ON team_workspace
FOR EACH ROW EXECUTE FUNCTION validate_team_workspace_kind();

CREATE FUNCTION protect_team_workspace_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team lifecycle evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team lifecycle identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'archived' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'archived teams are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW IS DISTINCT FROM OLD AND NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'team lifecycle updates must advance exactly one version'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'invalid team lifecycle transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_workspace_identity_protected
BEFORE UPDATE OR DELETE ON team_workspace
FOR EACH ROW EXECUTE FUNCTION protect_team_workspace_identity();

CREATE TABLE team_invitation (
  id text PRIMARY KEY CHECK (id ~ '^tiv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  inviter_user_id text NOT NULL REFERENCES app_user (id),
  recipient_user_id text REFERENCES app_user (id),
  recipient_email citext NOT NULL CHECK (length(recipient_email::text) BETWEEN 3 AND 320),
  proposed_role text NOT NULL CHECK (proposed_role IN (
    'team:admin', 'team:proposal-manager', 'team:contributor', 'team:viewer'
  )),
  scope text NOT NULL CHECK (length(btrim(scope)) BETWEEN 1 AND 1000),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 2000),
  commitment text NOT NULL CHECK (length(btrim(commitment)) BETWEEN 1 AND 1000),
  ip_notice text NOT NULL CHECK (length(btrim(ip_notice)) BETWEEN 1 AND 1000),
  state text NOT NULL DEFAULT 'sent' CHECK (
    state IN ('sent', 'viewed', 'accepted', 'declined', 'expired', 'revoked')
  ),
  decision_reason text CHECK (
    decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 1 AND 2000
  ),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES team_workspace (workspace_id, tenant_id),
  CHECK (expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK ((state IN ('declined', 'revoked') AND decision_reason IS NOT NULL) OR state NOT IN ('declined', 'revoked'))
);

CREATE UNIQUE INDEX team_invitation_one_pending_email_idx
  ON team_invitation (workspace_id, recipient_email)
  WHERE state IN ('sent', 'viewed');
CREATE INDEX team_invitation_recipient_idx
  ON team_invitation (recipient_user_id, state, expires_at);

CREATE FUNCTION protect_team_invitation_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team invitation evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.inviter_user_id IS DISTINCT FROM OLD.inviter_user_id
     OR (OLD.recipient_user_id IS NOT NULL AND NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id)
     OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.proposed_role IS DISTINCT FROM OLD.proposed_role
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.commitment IS DISTINCT FROM OLD.commitment
     OR NEW.ip_notice IS DISTINCT FROM OLD.ip_notice
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team invitation evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.recipient_user_id IS NULL AND NEW.recipient_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM app_user
       WHERE id = NEW.recipient_user_id
         AND primary_email = NEW.recipient_email
         AND email_verified = true
     ) THEN
    RAISE EXCEPTION 'team invitation recipient must match the invited email'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.state IN ('accepted', 'declined', 'expired', 'revoked') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal team invitation evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state
     OR NEW.state NOT IN ('viewed', 'accepted', 'declined', 'expired', 'revoked') THEN
    RAISE EXCEPTION 'invalid team invitation transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'team invitation updates must advance exactly one version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_invitation_evidence_protected
BEFORE UPDATE OR DELETE ON team_invitation
FOR EACH ROW EXECUTE FUNCTION protect_team_invitation_evidence();

CREATE TABLE team_membership_request (
  id text PRIMARY KEY CHECK (id ~ '^tmr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  requester_user_id text NOT NULL REFERENCES app_user (id),
  requested_role text NOT NULL CHECK (requested_role IN (
    'team:admin', 'team:proposal-manager', 'team:contributor', 'team:viewer'
  )),
  assigned_role text CHECK (assigned_role IN (
    'team:admin', 'team:proposal-manager', 'team:contributor', 'team:viewer'
  )),
  introduction text NOT NULL CHECK (length(btrim(introduction)) BETWEEN 1 AND 2000),
  availability text NOT NULL CHECK (length(btrim(availability)) BETWEEN 1 AND 1000),
  state text NOT NULL DEFAULT 'requested' CHECK (
    state IN ('requested', 'accepted', 'rejected', 'withdrawn', 'expired')
  ),
  reviewed_by_user_id text REFERENCES app_user (id),
  decision_reason text CHECK (
    decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 1 AND 2000
  ),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES team_workspace (workspace_id, tenant_id),
  CHECK (expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    (state = 'accepted' AND assigned_role IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND decision_reason IS NOT NULL)
    OR (state = 'rejected' AND assigned_role IS NULL AND reviewed_by_user_id IS NOT NULL AND decision_reason IS NOT NULL)
    OR (state = 'withdrawn' AND assigned_role IS NULL AND reviewed_by_user_id IS NULL AND decision_reason IS NOT NULL)
    OR (state IN ('requested', 'expired') AND assigned_role IS NULL AND reviewed_by_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX team_membership_request_one_pending_user_idx
  ON team_membership_request (workspace_id, requester_user_id)
  WHERE state = 'requested';
CREATE INDEX team_membership_request_requester_idx
  ON team_membership_request (requester_user_id, state, expires_at);

CREATE FUNCTION protect_team_membership_request_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team membership request evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.requested_role IS DISTINCT FROM OLD.requested_role
     OR NEW.introduction IS DISTINCT FROM OLD.introduction
     OR NEW.availability IS DISTINCT FROM OLD.availability
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'team membership request evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('accepted', 'rejected', 'withdrawn', 'expired') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal team membership request evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.state <> 'requested'
     OR NEW.state NOT IN ('accepted', 'rejected', 'withdrawn', 'expired') THEN
    RAISE EXCEPTION 'invalid team membership request transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'team membership request updates must advance exactly one version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_membership_request_evidence_protected
BEFORE UPDATE OR DELETE ON team_membership_request
FOR EACH ROW EXECUTE FUNCTION protect_team_membership_request_evidence();

CREATE UNIQUE INDEX team_one_active_owner_idx
  ON membership (workspace_id)
  WHERE workspace_kind = 'team' AND role = 'team:owner' AND state = 'active';

CREATE FUNCTION enforce_team_owner_membership(target_workspace_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  expected_owner text;
  active_owner_count integer;
  active_owner_user text;
BEGIN
  SELECT workspace.owner_user_id
  INTO expected_owner
  FROM workspace
  JOIN team_workspace ON team_workspace.workspace_id = workspace.id
                     AND team_workspace.tenant_id = workspace.tenant_id
  WHERE workspace.id = target_workspace_id AND workspace.kind = 'team';

  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*), min(user_id)
  INTO active_owner_count, active_owner_user
  FROM membership
  WHERE workspace_id = target_workspace_id
    AND workspace_kind = 'team'
    AND role = 'team:owner'
    AND state = 'active';

  IF active_owner_count <> 1 OR active_owner_user IS DISTINCT FROM expected_owner THEN
    RAISE EXCEPTION 'team workspace owner must match exactly one active owner membership'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION check_team_owner_after_workspace_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM enforce_team_owner_membership(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER team_owner_checked_after_workspace_change
AFTER INSERT OR UPDATE OF owner_user_id ON workspace
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.kind = 'team')
EXECUTE FUNCTION check_team_owner_after_workspace_change();

CREATE FUNCTION check_team_owner_after_team_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM enforce_team_owner_membership(NEW.workspace_id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER team_owner_checked_after_team_change
AFTER INSERT ON team_workspace
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_team_owner_after_team_change();

CREATE FUNCTION check_team_owner_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.workspace_kind = 'team' THEN
    PERFORM enforce_team_owner_membership(OLD.workspace_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.workspace_kind = 'team'
     AND (TG_OP = 'INSERT' OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id) THEN
    PERFORM enforce_team_owner_membership(NEW.workspace_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER team_owner_checked_after_membership_change
AFTER INSERT OR UPDATE OR DELETE ON membership
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_team_owner_after_membership_change();

CREATE FUNCTION protect_team_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.workspace_kind = 'team' THEN
    RAISE EXCEPTION 'team membership evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD.workspace_kind = 'team' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.workspace_kind IS DISTINCT FROM OLD.workspace_kind
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
     ) THEN
    RAISE EXCEPTION 'team membership identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.workspace_kind = 'team' AND NEW IS DISTINCT FROM OLD
     AND NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'team membership updates must advance exactly one version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_membership_identity_protected
BEFORE UPDATE OR DELETE ON membership
FOR EACH ROW EXECUTE FUNCTION protect_team_membership_identity();

INSERT INTO team_workspace (
  workspace_id, tenant_id, status, created_at, updated_at
)
SELECT id, tenant_id, 'active', created_at, updated_at
FROM workspace
WHERE kind = 'team';

DO $$
DECLARE row record;
BEGIN
  FOR row IN SELECT workspace_id FROM team_workspace LOOP
    PERFORM enforce_team_owner_membership(row.workspace_id);
  END LOOP;
END;
$$;
