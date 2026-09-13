DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM step_up_attempt
       WHERE correlation_id IS NOT NULL
       LIMIT 1
     )
     OR EXISTS (
       SELECT 1 FROM access_grant
       WHERE resource_type = 'case' AND expires_at = 'infinity'::timestamptz
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'cannot remove D8-D9 remediation while correlated step-up or lifetime case access evidence exists'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_case_access_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE target case_record%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.resource_type = 'case' THEN
      RAISE EXCEPTION 'case access grants are append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.resource_type = 'case' OR NEW.resource_type = 'case' THEN
    IF TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.grantor_tenant_id IS DISTINCT FROM OLD.grantor_tenant_id
       OR NEW.grantor_workspace_id IS DISTINCT FROM OLD.grantor_workspace_id
       OR NEW.grantee_tenant_id IS DISTINCT FROM OLD.grantee_tenant_id
       OR NEW.grantee_workspace_id IS DISTINCT FROM OLD.grantee_workspace_id
       OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
      RAISE EXCEPTION 'case grant identity is immutable' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state IN ('revoked','expired')
       AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'terminal case grants are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.resource_type <> 'case' THEN RETURN NEW; END IF;
  SELECT * INTO target FROM case_record WHERE id = NEW.resource_id;
  IF target.id IS NULL
     OR NEW.grantor_tenant_id IS DISTINCT FROM target.tenant_id
     OR NEW.grantor_workspace_id IS DISTINCT FROM target.workspace_id
     OR NEW.grantee_tenant_id IS DISTINCT FROM target.solver_tenant_id
     OR NEW.grantee_workspace_id IS DISTINCT FROM target.solver_workspace_id
     OR NEW.capability <> 'collaborate'
     OR (TG_OP = 'INSERT' AND (
       NEW.state <> 'active'
       OR NEW.valid_from IS DISTINCT FROM target.created_at
       OR NEW.created_at IS DISTINCT FROM target.created_at
       OR NEW.expires_at > target.created_at + interval '365 days'
       OR NOT EXISTS (
         SELECT 1 FROM membership membership
         WHERE membership.user_id = NEW.created_by_user_id
           AND membership.tenant_id = target.tenant_id
           AND membership.workspace_id = target.workspace_id
           AND membership.role IN ('org:owner','org:member')
           AND membership.state = 'active'
       )
     )) THEN
    RAISE EXCEPTION 'case access grant must match the selected solver relationship'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_step_up_attempt_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'pending' OR NOT EXISTS (
    SELECT 1
    FROM app_session session
    JOIN challenge challenge ON challenge.id = NEW.target_id
    WHERE session.id = NEW.session_id
      AND session.user_id = NEW.user_id
      AND session.session_version = NEW.session_version
      AND session.revoked_at IS NULL
      AND session.access_expires_at > NEW.created_at
      AND session.active_tenant_id = NEW.tenant_id
      AND session.active_workspace_id = NEW.workspace_id
      AND challenge.tenant_id = NEW.tenant_id
      AND challenge.workspace_id = NEW.workspace_id
      AND challenge.stage = 'evaluating'
  ) THEN
    RAISE EXCEPTION 'step-up attempt requires the active session and exact challenge scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE step_up_attempt DROP COLUMN correlation_id;
