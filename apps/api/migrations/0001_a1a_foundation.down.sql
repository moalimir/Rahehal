DROP TABLE IF EXISTS idempotency_key;

DROP TRIGGER IF EXISTS outbox_event_content_immutable ON outbox_event;
DROP FUNCTION IF EXISTS protect_outbox_event_content();
DROP TABLE IF EXISTS outbox_event;

DROP TRIGGER IF EXISTS audit_event_append_only ON audit_event;
DROP FUNCTION IF EXISTS prevent_audit_event_mutation();
DROP TABLE IF EXISTS audit_event;

ALTER TABLE IF EXISTS challenge
  DROP CONSTRAINT IF EXISTS challenge_published_version_fk,
  DROP CONSTRAINT IF EXISTS challenge_current_version_fk;
DROP TRIGGER IF EXISTS challenge_version_immutable_when_locked ON challenge_version;
DROP FUNCTION IF EXISTS prevent_locked_challenge_version_mutation();
DROP TABLE IF EXISTS challenge_version;
DROP TABLE IF EXISTS challenge;

DROP TABLE IF EXISTS app_session;
DROP TABLE IF EXISTS access_grant;
DROP TABLE IF EXISTS membership;
DROP TABLE IF EXISTS workspace;
DROP TABLE IF EXISTS identity_link;
DROP TABLE IF EXISTS app_user;
DROP TABLE IF EXISTS tenant;

DROP EXTENSION IF EXISTS citext;
