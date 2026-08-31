INSERT INTO tenant (id, kind, name, created_at) VALUES
  ('ten_platform', 'platform', 'Rahhal Synthetic Platform', '2026-01-01T00:00:00Z'),
  ('ten_org_alpha', 'organization', 'Synthetic Organization Alpha', '2026-01-01T00:00:00Z'),
  ('ten_org_beta', 'organization', 'Synthetic Organization Beta', '2026-01-01T00:00:00Z'),
  ('ten_solver_alpha', 'solver', 'Synthetic Solver Alpha', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user (
  id,
  display_name,
  primary_email,
  email_verified,
  primary_phone,
  phone_verified,
  created_at,
  updated_at
) VALUES
  (
    'usr_platform_ops',
    'Synthetic Platform Operator',
    'platform-ops@synthetic.invalid',
    true,
    NULL,
    false,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'usr_owner_alpha',
    'Synthetic Organization Owner',
    'owner-alpha@synthetic.invalid',
    true,
    NULL,
    false,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'usr_solver_alpha',
    'Synthetic Solver',
    'solver-alpha@synthetic.invalid',
    true,
    NULL,
    false,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity_link (
  id,
  user_id,
  issuer,
  subject,
  created_at,
  last_authenticated_at
) VALUES
  (
    'idl_platform_ops',
    'usr_platform_ops',
    'https://oidc.synthetic.invalid',
    'platform-ops',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'idl_owner_alpha',
    'usr_owner_alpha',
    'https://oidc.synthetic.invalid',
    'owner-alpha',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'idl_solver_alpha',
    'usr_solver_alpha',
    'https://oidc.synthetic.invalid',
    'solver-alpha',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'idl_owner_alpha_local_oidc',
    'usr_owner_alpha',
    'http://dex.localhost:5556/dex',
    'Cgtvd25lci1hbHBoYRIFbG9jYWw',
    '2026-01-01T00:00:00Z',
    NULL
  )
ON CONFLICT (id) DO UPDATE
SET issuer = EXCLUDED.issuer,
    subject = EXCLUDED.subject;

INSERT INTO workspace (
  id,
  tenant_id,
  tenant_kind,
  kind,
  name,
  owner_user_id,
  team_kind,
  created_at,
  updated_at
) VALUES
  (
    'wsp_platform_main',
    'ten_platform',
    'platform',
    'platform',
    'Synthetic Platform Workspace',
    NULL,
    NULL,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'wsp_org_alpha',
    'ten_org_alpha',
    'organization',
    'org',
    'Synthetic Organization Alpha',
    NULL,
    NULL,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'wsp_org_beta',
    'ten_org_beta',
    'organization',
    'org',
    'Synthetic Organization Beta',
    NULL,
    NULL,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'wsp_individual_alpha',
    'ten_solver_alpha',
    'solver',
    'individual',
    'Synthetic Solver Individual Workspace',
    'usr_solver_alpha',
    NULL,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'wsp_team_alpha',
    'ten_solver_alpha',
    'solver',
    'team',
    'Synthetic Expert Team',
    'usr_solver_alpha',
    'expert-team',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO membership (
  id,
  tenant_id,
  workspace_id,
  workspace_kind,
  user_id,
  role,
  state,
  created_at,
  updated_at
) VALUES
  (
    'mem_platform_ops',
    'ten_platform',
    'wsp_platform_main',
    'platform',
    'usr_platform_ops',
    'platform:ops',
    'active',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'mem_owner_alpha',
    'ten_org_alpha',
    'wsp_org_alpha',
    'org',
    'usr_owner_alpha',
    'org:owner',
    'active',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'mem_individual_alpha',
    'ten_solver_alpha',
    'wsp_individual_alpha',
    'individual',
    'usr_solver_alpha',
    'individual',
    'active',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'mem_team_owner_alpha',
    'ten_solver_alpha',
    'wsp_team_alpha',
    'team',
    'usr_solver_alpha',
    'team:owner',
    'active',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO challenge (
  id,
  tenant_id,
  tenant_kind,
  workspace_id,
  workspace_kind,
  stage,
  current_version_id,
  published_version_id,
  lock_version,
  created_by_user_id,
  created_at,
  updated_at
) VALUES (
  'chl_synthetic_alpha',
  'ten_org_alpha',
  'organization',
  'wsp_org_alpha',
  'org',
  'draft',
  'chv_synthetic_alpha_v1',
  NULL,
  1,
  'usr_owner_alpha',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO challenge_version (
  id,
  challenge_id,
  version_number,
  content,
  created_by_user_id,
  created_at,
  locked_at,
  lock_reason
) VALUES (
  'chv_synthetic_alpha_v1',
  'chl_synthetic_alpha',
  1,
  '{
    "title":"چالش آزمایشی قطعی",
    "summary":"Synthetic local-only seed data.",
    "category":"",
    "location":"",
    "desired_outcome":"",
    "current_state":"",
    "consequence":"",
    "expected_output":"",
    "success_criteria":[],
    "in_scope":"",
    "constraints":"",
    "organization_support":"",
    "previous_attempts":"",
    "output_type":null,
    "sourcing_model":null,
    "applicant_scope":null,
    "allowed_applicant_types":[],
    "work_mode":null,
    "proposal_deadline":null,
    "preferred_start_date":null,
    "budget":{"status":"undecided","amount_minor":null,"currency":"IRR"},
    "invitees":[],
    "visibility":null,
    "public_summary":"",
    "nda_required":false,
    "ip_terms":null,
    "contact":{"name":"","email":"","phone":""},
    "accuracy_confirmed":false,
    "legal_notes":"",
    "attachment_ids":[]
  }'::jsonb,
  'usr_owner_alpha',
  '2026-01-01T00:00:00Z',
  NULL,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO access_grant (
  id,
  grantor_tenant_id,
  grantor_workspace_id,
  grantee_tenant_id,
  grantee_workspace_id,
  resource_type,
  resource_id,
  capability,
  state,
  valid_from,
  expires_at,
  created_by_user_id,
  created_at
) VALUES (
  'agr_challenge_alpha_team',
  'ten_org_alpha',
  'wsp_org_alpha',
  'ten_solver_alpha',
  'wsp_team_alpha',
  'challenge',
  'chl_synthetic_alpha',
  'read',
  'active',
  '2026-01-01T00:00:00Z',
  '2030-01-01T00:00:00Z',
  'usr_owner_alpha',
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_event (
  id,
  correlation_id,
  tenant_id,
  workspace_id,
  actor_kind,
  actor_user_id,
  action,
  outcome,
  reason_code,
  target_type,
  target_id,
  metadata,
  occurred_at
) VALUES (
  'aud_seed_challenge_alpha',
  'cor_seed_challenge_alpha',
  'ten_org_alpha',
  'wsp_org_alpha',
  'user',
  'usr_owner_alpha',
  'challenge.draft.created',
  'success',
  'SEED_CREATED',
  'challenge',
  'chl_synthetic_alpha',
  '{"synthetic":true}'::jsonb,
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO outbox_event (
  id,
  tenant_id,
  correlation_id,
  event_type,
  schema_version,
  aggregate_type,
  aggregate_id,
  payload,
  dedupe_key,
  occurred_at,
  available_at
) VALUES (
  'evt_seed_challenge_alpha',
  'ten_org_alpha',
  'cor_seed_challenge_alpha',
  'challenge.draft.created',
  1,
  'challenge',
  'chl_synthetic_alpha',
  '{"challenge_id":"chl_synthetic_alpha","version_id":"chv_synthetic_alpha_v1"}'::jsonb,
  'seed:challenge:alpha:v1',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO idempotency_key (
  id,
  scope_kind,
  tenant_id,
  credential_fingerprint,
  idempotency_key,
  request_hash,
  status,
  response_status,
  response_body,
  created_at,
  expires_at
) VALUES (
  'idk_seed_challenge_alpha',
  'tenant',
  'ten_org_alpha',
  NULL,
  'seed-create-challenge-alpha',
  repeat('c', 64),
  'completed',
  201,
  '{"synthetic":true,"challenge_id":"chl_synthetic_alpha"}'::jsonb,
  '2026-01-01T00:00:00Z',
  '2030-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- B7 governance identities. The Phase-2 exit gate needs four *distinct*
-- approvers plus a separate publisher, because separation of duty forbids one
-- actor recording two gates on a version. Every identity is synthetic and
-- local-only: `@synthetic.invalid` is a reserved, unroutable domain and the
-- password hash is the shared local Dex fixture in infra/local/dex/config.yaml.
INSERT INTO app_user (
  id, display_name, primary_email, email_verified, primary_phone, phone_verified,
  created_at, updated_at
) VALUES
  ('usr_approver_alpha', 'Synthetic Technical Approver', 'approver-alpha@synthetic.invalid',
   true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_publisher_alpha', 'Synthetic Organization Publisher', 'publisher-alpha@synthetic.invalid',
   true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_platform_finance', 'Synthetic Platform Finance', 'platform-finance@synthetic.invalid',
   true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('usr_platform_legal', 'Synthetic Platform Legal', 'platform-legal@synthetic.invalid',
   true, NULL, false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Dex subjects are protobuf(userID, connectorID) base64url-encoded, matching
-- `idl_owner_alpha_local_oidc` above. `usr_platform_ops` already existed but
-- had no Dex link, so it could not sign in to record the quality gate.
INSERT INTO identity_link (id, user_id, issuer, subject, created_at, last_authenticated_at) VALUES
  ('idl_platform_ops_local_oidc', 'usr_platform_ops',
   'http://dex.localhost:5556/dex', 'CgxwbGF0Zm9ybS1vcHMSBWxvY2Fs', '2026-01-01T00:00:00Z', NULL),
  ('idl_approver_alpha_local_oidc', 'usr_approver_alpha',
   'http://dex.localhost:5556/dex', 'Cg5hcHByb3Zlci1hbHBoYRIFbG9jYWw', '2026-01-01T00:00:00Z', NULL),
  ('idl_publisher_alpha_local_oidc', 'usr_publisher_alpha',
   'http://dex.localhost:5556/dex', 'Cg9wdWJsaXNoZXItYWxwaGESBWxvY2Fs', '2026-01-01T00:00:00Z', NULL),
  ('idl_platform_finance_local_oidc', 'usr_platform_finance',
   'http://dex.localhost:5556/dex', 'ChBwbGF0Zm9ybS1maW5hbmNlEgVsb2NhbA', '2026-01-01T00:00:00Z', NULL),
  ('idl_platform_legal_local_oidc', 'usr_platform_legal',
   'http://dex.localhost:5556/dex', 'Cg5wbGF0Zm9ybS1sZWdhbBIFbG9jYWw', '2026-01-01T00:00:00Z', NULL)
ON CONFLICT (id) DO UPDATE
SET issuer = EXCLUDED.issuer,
    subject = EXCLUDED.subject;

INSERT INTO membership (
  id, tenant_id, workspace_id, workspace_kind, user_id, role, state, created_at, updated_at
) VALUES
  ('mem_approver_alpha', 'ten_org_alpha', 'wsp_org_alpha', 'org',
   'usr_approver_alpha', 'org:approver_technical', 'active',
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_publisher_alpha', 'ten_org_alpha', 'wsp_org_alpha', 'org',
   'usr_publisher_alpha', 'org:publisher', 'active',
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_platform_finance', 'ten_platform', 'wsp_platform_main', 'platform',
   'usr_platform_finance', 'platform:finance', 'active',
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('mem_platform_legal', 'ten_platform', 'wsp_platform_main', 'platform',
   'usr_platform_legal', 'platform:legal', 'active',
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
