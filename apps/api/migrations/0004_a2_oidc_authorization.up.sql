CREATE TABLE oidc_authorization_attempt (
  id text PRIMARY KEY CHECK (id ~ '^oat_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 8 AND 2048),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) BETWEEN 8 AND 2048),
  state_digest text NOT NULL UNIQUE CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  code_verifier_digest text NOT NULL CHECK (code_verifier_digest ~ '^[0-9a-f]{64}$'),
  nonce_digest text NOT NULL CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key_digest text NOT NULL UNIQUE CHECK (idempotency_key_digest ~ '^[0-9a-f]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'consumed')),
  subject text CHECK (subject IS NULL OR length(subject) BETWEEN 1 AND 255),
  verified_email citext CHECK (
    verified_email IS NULL OR length(verified_email::text) BETWEEN 3 AND 320
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  validated_at timestamptz,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'pending' AND subject IS NULL AND verified_email IS NULL
      AND validated_at IS NULL AND consumed_at IS NULL) OR
    (status = 'validated' AND subject IS NOT NULL AND verified_email IS NOT NULL
      AND validated_at IS NOT NULL AND consumed_at IS NULL) OR
    (status = 'consumed' AND subject IS NOT NULL AND verified_email IS NOT NULL
      AND validated_at IS NOT NULL AND consumed_at IS NOT NULL)
  ),
  CHECK (validated_at IS NULL OR validated_at >= created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= validated_at)
);

CREATE INDEX oidc_authorization_attempt_expiry_idx
  ON oidc_authorization_attempt (expires_at)
  WHERE status <> 'consumed';
