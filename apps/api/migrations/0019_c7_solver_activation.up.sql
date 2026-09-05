-- Phase 3 C7: provider-verified human activation. OTP codes and provider
-- challenge payloads stay outside PostgreSQL; only the consumed assertion ID
-- and the resulting durable app identity/workspace evidence are stored here.

ALTER TABLE app_user
  ALTER COLUMN primary_email DROP NOT NULL,
  ADD CONSTRAINT app_user_primary_contact_ck CHECK (
    primary_email IS NOT NULL OR primary_phone IS NOT NULL
  );

CREATE UNIQUE INDEX workspace_one_individual_per_owner_idx
  ON workspace (owner_user_id)
  WHERE kind = 'individual';

CREATE UNIQUE INDEX app_user_unique_primary_phone_idx
  ON app_user (primary_phone)
  WHERE primary_phone IS NOT NULL;

CREATE TABLE solver_activation (
  id text PRIMARY KEY CHECK (id ~ '^act_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  user_id text NOT NULL UNIQUE REFERENCES app_user (id),
  tenant_id text NOT NULL,
  individual_workspace_id text NOT NULL UNIQUE,
  individual_membership_id text NOT NULL UNIQUE,
  provider_issuer text NOT NULL CHECK (length(provider_issuer) BETWEEN 8 AND 2048),
  provider_subject text NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 255),
  contact_channel text NOT NULL CHECK (contact_channel IN ('email', 'mobile')),
  start_intent text NOT NULL CHECK (start_intent IN ('individual', 'team')),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version = 1),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (individual_workspace_id, tenant_id)
    REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (individual_membership_id) REFERENCES membership (id),
  UNIQUE (provider_issuer, provider_subject)
);

CREATE FUNCTION validate_solver_activation_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM workspace
    WHERE id = NEW.individual_workspace_id
      AND tenant_id = NEW.tenant_id
      AND kind = 'individual'
      AND owner_user_id = NEW.user_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM membership
    WHERE id = NEW.individual_membership_id
      AND tenant_id = NEW.tenant_id
      AND workspace_id = NEW.individual_workspace_id
      AND workspace_kind = 'individual'
      AND user_id = NEW.user_id
      AND role = 'individual'
      AND state = 'active'
  ) THEN
    RAISE EXCEPTION 'solver activation must bind the permanent individual workspace owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER solver_activation_scope_validated
BEFORE INSERT ON solver_activation
FOR EACH ROW EXECUTE FUNCTION validate_solver_activation_scope();

CREATE TABLE contact_verification_consumption (
  provider_issuer text NOT NULL CHECK (length(provider_issuer) BETWEEN 8 AND 2048),
  assertion_id text NOT NULL CHECK (assertion_id ~ '^otp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  provider_subject text NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 255),
  user_id text NOT NULL REFERENCES app_user (id),
  session_id text NOT NULL UNIQUE REFERENCES app_session (id),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (provider_issuer, assertion_id)
);

CREATE FUNCTION prevent_solver_activation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'solver activation evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER solver_activation_append_only
BEFORE UPDATE OR DELETE ON solver_activation
FOR EACH ROW EXECUTE FUNCTION prevent_solver_activation_mutation();

CREATE FUNCTION prevent_contact_verification_consumption_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'contact verification consumption is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER contact_verification_consumption_append_only
BEFORE UPDATE OR DELETE ON contact_verification_consumption
FOR EACH ROW EXECUTE FUNCTION prevent_contact_verification_consumption_mutation();
