CREATE TABLE challenge_approval (
  id text PRIMARY KEY CHECK (id ~ '^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  gate text NOT NULL CHECK (gate IN ('technical', 'legal', 'finance', 'quality')),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  recorded_by_user_id text NOT NULL REFERENCES app_user (id),
  recorded_by_role text NOT NULL CHECK (
    recorded_by_role IN (
      'org:approver_technical', 'org:approver_legal', 'org:approver_finance',
      'platform:ops', 'platform:finance', 'platform:legal'
    )
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_id, tenant_id) REFERENCES challenge (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id) REFERENCES challenge_version (id, challenge_id),
  CHECK (
    (gate = 'technical' AND recorded_by_role = 'org:approver_technical') OR
    (gate = 'legal' AND recorded_by_role IN ('org:approver_legal', 'platform:legal')) OR
    (gate = 'finance' AND recorded_by_role IN ('org:approver_finance', 'platform:finance')) OR
    (gate = 'quality' AND recorded_by_role = 'platform:ops')
  ),
  -- One row per (version, gate): a gate cannot be recorded twice on one version.
  UNIQUE (challenge_version_id, gate)
);

-- Separation of duty: the same actor cannot record two different gates on one version.
CREATE UNIQUE INDEX challenge_approval_one_actor_per_version_idx
  ON challenge_approval (challenge_version_id, recorded_by_user_id);

CREATE INDEX challenge_approval_challenge_idx
  ON challenge_approval (challenge_id, challenge_version_id);

CREATE FUNCTION prevent_challenge_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'challenge approvals are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_approval_append_only
BEFORE UPDATE OR DELETE ON challenge_approval
FOR EACH ROW EXECUTE FUNCTION prevent_challenge_approval_mutation();
