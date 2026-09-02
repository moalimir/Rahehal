INSERT INTO app_user (
  id, display_name, primary_email, email_verified, primary_phone, phone_verified,
  created_at, updated_at
) VALUES
  ('usr_team_admin_alpha', 'Synthetic Team Admin', 'team-admin-alpha@synthetic.invalid', true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_team_manager_alpha', 'Synthetic Proposal Manager', 'team-manager-alpha@synthetic.invalid', true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_team_contributor_alpha', 'Synthetic Team Contributor', 'team-contributor-alpha@synthetic.invalid', true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_team_viewer_alpha', 'Synthetic Team Viewer', 'team-viewer-alpha@synthetic.invalid', true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_team_candidate_alpha', 'Synthetic Team Candidate', 'team-candidate-alpha@synthetic.invalid', true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_workspace (
  workspace_id, tenant_id, status, join_mode, default_invitation_role,
  created_at, updated_at
) VALUES (
  'wsp_team_alpha', 'ten_solver_alpha', 'active', 'request', 'team:contributor',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
)
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO membership (
  id, tenant_id, workspace_id, workspace_kind, user_id, role, state,
  lock_version, created_at, updated_at
) VALUES
  ('mem_team_admin_alpha', 'ten_solver_alpha', 'wsp_team_alpha', 'team', 'usr_team_admin_alpha', 'team:admin', 'active', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_team_manager_alpha', 'ten_solver_alpha', 'wsp_team_alpha', 'team', 'usr_team_manager_alpha', 'team:proposal-manager', 'active', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_team_contributor_alpha', 'ten_solver_alpha', 'wsp_team_alpha', 'team', 'usr_team_contributor_alpha', 'team:contributor', 'active', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_team_viewer_alpha', 'ten_solver_alpha', 'wsp_team_alpha', 'team', 'usr_team_viewer_alpha', 'team:viewer', 'active', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
