INSERT INTO app_session (
  id,
  user_id,
  origin_tenant_id,
  token_family_id,
  access_token_digest,
  refresh_token_digest,
  session_version,
  active_tenant_id,
  active_workspace_id,
  issued_at,
  access_expires_at,
  refresh_expires_at,
  last_used_at
) VALUES (
  'ses_owner_alpha',
  'usr_owner_alpha',
  'ten_org_alpha',
  'family_owner_alpha',
  '2b2b6de3f069fc42fa4ddbc21ea9eb968e0b327392504d563bea7c424ef75bb3',
  'a8593dabb04e789ca008b6d8c5ebb1aa480b0e03486194409c2d81b3c6d86213',
  1,
  'ten_org_alpha',
  'wsp_org_alpha',
  '2026-01-01T00:00:00Z',
  '2029-01-01T00:00:00Z',
  '2030-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
