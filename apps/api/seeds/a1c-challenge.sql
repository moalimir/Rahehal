INSERT INTO mutation_receipt (
  id,
  tenant_id,
  workspace_id,
  entity_type,
  entity_id,
  entity_version,
  audit_event_id,
  correlation_id,
  next_actions,
  occurred_at
) VALUES (
  'rcp_seed_challenge_alpha',
  'ten_org_alpha',
  'wsp_org_alpha',
  'challenge',
  'chl_synthetic_alpha',
  1,
  'aud_seed_challenge_alpha',
  'cor_seed_challenge_alpha',
  '["edit"]'::jsonb,
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
