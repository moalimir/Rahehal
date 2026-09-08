-- Synthetic local reviewers only. Seed reruns never reactivate memberships or sessions.

INSERT INTO app_user (id, display_name, primary_email, email_verified, created_at, updated_at)
VALUES ('usr_reviewer_alpha', 'Synthetic Reviewer alpha', 'reviewer-alpha@synthetic.invalid', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO identity_link (id, user_id, issuer, subject, created_at) VALUES
('idl_reviewer_alpha_local', 'usr_reviewer_alpha', 'http://dex.localhost:5556/dex', 'Cg5yZXZpZXdlci1hbHBoYRIFbG9jYWw', '2026-01-01T00:00:00Z'),
('idl_reviewer_alpha_synthetic', 'usr_reviewer_alpha', 'https://oidc.synthetic.invalid', 'reviewer-alpha', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO membership (id, tenant_id, workspace_id, workspace_kind, user_id, role, state, created_at, updated_at)
VALUES ('mem_reviewer_alpha', 'ten_platform', 'wsp_platform_main', 'platform', 'usr_reviewer_alpha', 'platform:reviewer', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO app_session (id, user_id, origin_tenant_id, token_family_id, access_token_digest, refresh_token_digest, session_version, active_tenant_id, active_workspace_id, issued_at, access_expires_at, refresh_expires_at, last_used_at)
VALUES ('ses_reviewer_alpha', 'usr_reviewer_alpha', 'ten_platform', 'family_reviewer_alpha', 'a76efc918df18617412190fd1db0978c58fc7977e23d00257d411ed1ba5f6bec', '510d4dac9fab01517ba6675fb7e055c0861ce024c85ae7a0aae767aa11aec6bc', 1, 'ten_platform', 'wsp_platform_main', '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user (id, display_name, primary_email, email_verified, created_at, updated_at)
VALUES ('usr_reviewer_beta', 'Synthetic Reviewer beta', 'reviewer-beta@synthetic.invalid', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO identity_link (id, user_id, issuer, subject, created_at) VALUES
('idl_reviewer_beta_local', 'usr_reviewer_beta', 'http://dex.localhost:5556/dex', 'Cg1yZXZpZXdlci1iZXRhEgVsb2NhbA', '2026-01-01T00:00:00Z'),
('idl_reviewer_beta_synthetic', 'usr_reviewer_beta', 'https://oidc.synthetic.invalid', 'reviewer-beta', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO membership (id, tenant_id, workspace_id, workspace_kind, user_id, role, state, created_at, updated_at)
VALUES ('mem_reviewer_beta', 'ten_platform', 'wsp_platform_main', 'platform', 'usr_reviewer_beta', 'platform:reviewer', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
INSERT INTO app_session (id, user_id, origin_tenant_id, token_family_id, access_token_digest, refresh_token_digest, session_version, active_tenant_id, active_workspace_id, issued_at, access_expires_at, refresh_expires_at, last_used_at)
VALUES ('ses_reviewer_beta', 'usr_reviewer_beta', 'ten_platform', 'family_reviewer_beta', '7c8d10242c60b1eb767b55919e48bcac3995a4343790c611947cacec4a79a6ac', 'ee831c829e8a4c874d74f23289baf2b782993cf878a066cdcad0b9825eb3ae47', 1, 'ten_platform', 'wsp_platform_main', '2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
