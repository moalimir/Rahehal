-- Local development sessions for the four publication-gate approvers and the
-- publisher.
--
-- `a1b-identity.sql` seeds only the organization owner, so a local stack could
-- exercise authoring but never the gates: an owner authors and deliberately
-- cannot publish, an approver records exactly one gate and authors nothing,
-- and `quality` is platform-only because it exists specifically not to be
-- self-certified (20_CANONICAL_MODEL §8.2, 70_SECURITY_AND_AUTHZ §6). Without
-- these sessions the only way to reach `published` locally is to write the
-- projection by hand, which is how the seeded challenges drifted from their
-- own aggregates.
--
-- Every identity and membership these bind to already exists in
-- `a1a-synthetic.sql`; this file adds no role and widens no authority. The
-- tokens are local-only synthetic values, never valid outside this stack.
--
-- They use a `local-seed-` prefix rather than the `local-b2-`/`local-b4-`
-- names the PostgreSQL tests use for their own ad-hoc sessions: those tests
-- run against a database this seed has already populated, and sharing a token
-- string would collide on `app_session_access_token_digest_key`.
INSERT INTO app_session (
  id, user_id, origin_tenant_id, token_family_id,
  access_token_digest, refresh_token_digest, session_version,
  active_tenant_id, active_workspace_id,
  issued_at, access_expires_at, refresh_expires_at, last_used_at
) VALUES
  (
    'ses_approver_alpha', 'usr_approver_alpha', 'ten_org_alpha', 'family_approver_alpha',
    'c97e7263f92be781a2984e9a6b1e102d9983b202ecd83deed043d765f3759457',
    '303cd236aaa41b4387a1d1b098bdce0e422ef0c0530bf7f7e771bffaa0bbac02',
    1, 'ten_org_alpha', 'wsp_org_alpha',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'ses_publisher_alpha', 'usr_publisher_alpha', 'ten_org_alpha', 'family_publisher_alpha',
    '09ac87ea8163722dd656952764686d9237353397b194079588f69c3c242c648b',
    '7fdd05a680567824d6bc6bd06f7d266f1147ee0c90fdcd402763439850da7fd1',
    1, 'ten_org_alpha', 'wsp_org_alpha',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'ses_platform_legal', 'usr_platform_legal', 'ten_platform', 'family_platform_legal',
    '5843538e80a1b40683bac2b0a22fa9386d6f324c8f77782fcad54cc4594ab907',
    '80285a7f289f6a3e33059f723c64e1832dc47b7845d25d4663ffe62ace127a29',
    1, 'ten_platform', 'wsp_platform_main',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'ses_platform_finance', 'usr_platform_finance', 'ten_platform', 'family_platform_finance',
    'c8baf12e967181946788c2ba910a0a4e6f9b355d36c93138cc5b03d00e5208b8',
    '75601c278f717171c613a2d82fb64bddcf4d868fd655717ab359267d5dfe518f',
    1, 'ten_platform', 'wsp_platform_main',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'ses_platform_ops', 'usr_platform_ops', 'ten_platform', 'family_platform_ops',
    '13f2bea093f460eae26d7ccfed7a7a3d4633c1de05115954436d255295a53942',
    'da1dc6eb48d9ec5033f910adc38be3d6232749f4d48d968c838765ba3acaeb1f',
    1, 'ten_platform', 'wsp_platform_main',
    '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;
