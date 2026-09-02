INSERT INTO solver_workspace_profile (
  workspace_id, tenant_id, workspace_kind, applicant_type,
  headline, overview, expertise, geography, lock_version, created_at, updated_at
)
SELECT workspace.id, workspace.tenant_id, workspace.kind,
       CASE WHEN workspace.kind = 'individual' THEN 'individual' ELSE workspace.team_kind END,
       '', '', '{}', '{}', 1, workspace.created_at, workspace.updated_at
FROM workspace
WHERE workspace.kind IN ('individual', 'team')
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO verification_record (
  id, tenant_id, workspace_id, state, lock_version, created_at, updated_at
)
SELECT 'ver_' || substring(profile.workspace_id FROM 5),
       profile.tenant_id, profile.workspace_id, 'not_started', 1,
       profile.created_at, profile.updated_at
FROM solver_workspace_profile AS profile
ON CONFLICT (workspace_id) DO NOTHING;
