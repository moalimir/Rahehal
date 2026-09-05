-- C6: solver saved opportunities and the authoritative two-party direct-offer
-- aggregate. Offer access is represented by two exact, offer-bound grants:
-- collaborate on the offer and read the offered challenge.

ALTER TABLE access_grant
  DROP CONSTRAINT access_grant_resource_type_check,
  ADD CONSTRAINT access_grant_resource_type_check CHECK (
    resource_type IN ('challenge', 'proposal', 'direct_offer', 'case', 'file')
  );

CREATE TABLE saved_opportunity (
  id text PRIMARY KEY CHECK (id ~ '^sop_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  workspace_id text NOT NULL,
  workspace_kind text NOT NULL CHECK (workspace_kind IN ('individual', 'team')),
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  saved_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id, workspace_kind)
    REFERENCES workspace (id, tenant_id, kind),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (tenant_id, workspace_id, challenge_id),
  UNIQUE (id, tenant_id)
);

CREATE INDEX saved_opportunity_scope_idx
  ON saved_opportunity (tenant_id, workspace_id, saved_at DESC);

CREATE TABLE direct_offer (
  id text PRIMARY KEY CHECK (id ~ '^dof_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  sender_tenant_id text NOT NULL,
  sender_organization_workspace_id text NOT NULL,
  recipient_tenant_id text NOT NULL,
  recipient_workspace_id text NOT NULL,
  recipient_workspace_kind text NOT NULL CHECK (recipient_workspace_kind IN ('individual', 'team')),
  challenge_id text NOT NULL,
  challenge_version_id text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 4000),
  invitation_reasons text[] NOT NULL DEFAULT '{}'
    CHECK (array_position(invitation_reasons, NULL) IS NULL),
  requested_documents text[] NOT NULL DEFAULT '{}'
    CHECK (array_position(requested_documents, NULL) IS NULL),
  response_deadline timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN (
    'received', 'viewed', 'response_draft', 'response_submitted', 'negotiating',
    'selected', 'declined', 'expired', 'cancelled'
  )),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  viewed_at timestamptz,
  decline_reason text CHECK (
    decline_reason IS NULL OR length(btrim(decline_reason)) BETWEEN 1 AND 2000
  ),
  declined_at timestamptz,
  cancellation_reason text CHECK (
    cancellation_reason IS NULL OR length(btrim(cancellation_reason)) BETWEEN 1 AND 2000
  ),
  cancelled_at timestamptz,
  expired_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (sender_organization_workspace_id, sender_tenant_id)
    REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (recipient_workspace_id, recipient_tenant_id, recipient_workspace_kind)
    REFERENCES workspace (id, tenant_id, kind),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (id, sender_tenant_id),
  CHECK (sender_tenant_id <> recipient_tenant_id),
  CHECK (response_deadline > created_at),
  CHECK (updated_at >= created_at),
  CHECK ((viewed_at IS NULL) OR viewed_at >= created_at),
  CHECK (
    (state = 'declined' AND decline_reason IS NOT NULL AND declined_at IS NOT NULL)
    OR (state <> 'declined' AND decline_reason IS NULL AND declined_at IS NULL)
  ),
  CHECK (
    (state = 'cancelled' AND cancellation_reason IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (state <> 'cancelled' AND cancellation_reason IS NULL AND cancelled_at IS NULL)
  ),
  CHECK ((state = 'expired' AND expired_at IS NOT NULL) OR (state <> 'expired' AND expired_at IS NULL))
);

CREATE UNIQUE INDEX direct_offer_one_active_target_idx
  ON direct_offer (challenge_id, recipient_workspace_id)
  WHERE state NOT IN ('declined', 'expired', 'cancelled');
CREATE INDEX direct_offer_sender_scope_idx
  ON direct_offer (sender_tenant_id, sender_organization_workspace_id, updated_at DESC);
CREATE INDEX direct_offer_recipient_scope_idx
  ON direct_offer (recipient_tenant_id, recipient_workspace_id, updated_at DESC);
CREATE INDEX direct_offer_expiry_idx
  ON direct_offer (response_deadline)
  WHERE state IN ('received', 'viewed', 'response_draft');

CREATE FUNCTION valid_offer_response_content(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  field_name text;
  amount numeric;
  duration numeric;
BEGIN
  IF jsonb_typeof(value) <> 'object'
     OR NOT value ?& ARRAY[
       'approach', 'scope', 'start_availability', 'duration_weeks',
       'budget_amount_minor', 'budget_currency', 'payment_model', 'negotiables',
       'authority_confirmed', 'attachment_ids'
     ] THEN
    RETURN false;
  END IF;
  FOREACH field_name IN ARRAY ARRAY[
    'approach', 'scope', 'start_availability', 'budget_currency',
    'payment_model', 'negotiables'
  ] LOOP
    IF jsonb_typeof(value -> field_name) <> 'string' THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(value -> 'authority_confirmed') <> 'boolean'
     OR jsonb_typeof(value -> 'attachment_ids') <> 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(value -> 'attachment_ids') AS attachment_id
       WHERE attachment_id !~ '^fil_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'
     )
     OR (value ->> 'budget_currency') NOT IN ('IRR', 'USD', 'EUR') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value -> 'duration_weeks') <> 'null' THEN
    IF jsonb_typeof(value -> 'duration_weeks') <> 'number' THEN RETURN false; END IF;
    duration := (value ->> 'duration_weeks')::numeric;
    IF duration <> trunc(duration) OR duration < 1 OR duration > 520 THEN RETURN false; END IF;
  END IF;
  IF jsonb_typeof(value -> 'budget_amount_minor') <> 'null' THEN
    IF jsonb_typeof(value -> 'budget_amount_minor') <> 'number' THEN RETURN false; END IF;
    amount := (value ->> 'budget_amount_minor')::numeric;
    IF amount <> trunc(amount) OR amount < 0 OR amount > 9007199254740991 THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$$;

CREATE TABLE offer_response (
  id text PRIMARY KEY CHECK (id ~ '^ofr_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  direct_offer_id text NOT NULL UNIQUE REFERENCES direct_offer (id),
  owner_tenant_id text NOT NULL,
  owner_workspace_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'submitted')),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  content jsonb NOT NULL CHECK (valid_offer_response_content(content)),
  submitted_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (owner_workspace_id, owner_tenant_id)
    REFERENCES workspace (id, tenant_id),
  CHECK ((state = 'draft' AND submitted_at IS NULL)
      OR (state = 'submitted' AND submitted_at IS NOT NULL)),
  CHECK (updated_at >= created_at),
  CHECK (submitted_at IS NULL OR submitted_at >= created_at)
);

ALTER TABLE access_grant
  ADD COLUMN direct_offer_id text,
  ADD CONSTRAINT access_grant_direct_offer_fk
    FOREIGN KEY (direct_offer_id) REFERENCES direct_offer (id),
  ADD CONSTRAINT access_grant_direct_offer_shape CHECK (
    direct_offer_id IS NULL
    OR (
      (resource_type = 'direct_offer' AND capability = 'collaborate'
       AND resource_id = direct_offer_id)
      OR (resource_type = 'challenge' AND capability = 'read')
    )
  );

-- `0001` allowed one active grant per grantor/grantee/resource/capability, a
-- rule written when every grant was a standing one. An offer carries its own
-- short-lived challenge read grant, so a recipient that already holds a
-- standing grant for the same challenge would collide and the send would fail.
-- Keep the rule for standing grants and let an offer-scoped grant sit beside
-- one: `direct_offer_one_active_target_idx` already bounds live offers to one
-- per challenge and recipient, and offer grants are revoked with their offer.
DROP INDEX access_grant_one_active_capability_idx;
CREATE UNIQUE INDEX access_grant_one_active_capability_idx
  ON access_grant (
    grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
    grantee_workspace_id, resource_type, resource_id, capability
  )
  WHERE state = 'active' AND direct_offer_id IS NULL;

CREATE FUNCTION validate_c6_saved_opportunity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  projection_version text;
  projection_state text;
BEGIN
  SELECT challenge_version_id, state
  INTO projection_version, projection_state
  FROM challenge_public_projection
  WHERE challenge_id = NEW.challenge_id;
  IF NOT FOUND OR projection_version IS DISTINCT FROM NEW.challenge_version_id
     OR projection_state <> 'open' THEN
    RAISE EXCEPTION 'saved opportunities require the exact open public projection'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'saved opportunities are replaced, not updated' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER c6_saved_opportunity_validated
BEFORE INSERT OR UPDATE ON saved_opportunity
FOR EACH ROW EXECUTE FUNCTION validate_c6_saved_opportunity();

CREATE FUNCTION protect_c6_direct_offer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  challenge_tenant text;
  challenge_workspace text;
  challenge_published_version text;
  challenge_state text;
  challenge_deadline timestamptz;
  sender_kind text;
  transition_allowed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'direct offer evidence is append-only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT challenge.tenant_id, challenge.workspace_id, challenge.published_version_id,
           challenge.publication_state, challenge.proposal_deadline_at,
           workspace.kind
    INTO challenge_tenant, challenge_workspace, challenge_published_version,
         challenge_state, challenge_deadline, sender_kind
    FROM challenge
    JOIN workspace ON workspace.id = NEW.sender_organization_workspace_id
                  AND workspace.tenant_id = NEW.sender_tenant_id
    WHERE challenge.id = NEW.challenge_id;
    IF NOT FOUND OR sender_kind <> 'org'
       OR challenge_tenant IS DISTINCT FROM NEW.sender_tenant_id
       OR challenge_workspace IS DISTINCT FROM NEW.sender_organization_workspace_id
       OR challenge_published_version IS DISTINCT FROM NEW.challenge_version_id
       OR challenge_state <> 'open'
       OR challenge_deadline IS NULL
       OR NEW.response_deadline > challenge_deadline
       OR NEW.response_deadline <= transaction_timestamp()
       OR NEW.state <> 'received' OR NEW.lock_version <> 1 THEN
      RAISE EXCEPTION 'direct offer requires the sender-owned exact open challenge version'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_tenant_id IS DISTINCT FROM OLD.sender_tenant_id
     OR NEW.sender_organization_workspace_id IS DISTINCT FROM OLD.sender_organization_workspace_id
     OR NEW.recipient_tenant_id IS DISTINCT FROM OLD.recipient_tenant_id
     OR NEW.recipient_workspace_id IS DISTINCT FROM OLD.recipient_workspace_id
     OR NEW.recipient_workspace_kind IS DISTINCT FROM OLD.recipient_workspace_kind
     OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
     OR NEW.challenge_version_id IS DISTINCT FROM OLD.challenge_version_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.invitation_reasons IS DISTINCT FROM OLD.invitation_reasons
     OR NEW.requested_documents IS DISTINCT FROM OLD.requested_documents
     OR NEW.response_deadline IS DISTINCT FROM OLD.response_deadline
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'direct offer identity is immutable and versions are sequential'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('selected', 'declined', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'terminal direct offers are immutable' USING ERRCODE = '55000';
  END IF;
  transition_allowed :=
    (OLD.state = 'received' AND NEW.state IN ('viewed', 'declined', 'expired', 'cancelled'))
    OR (OLD.state = 'viewed' AND NEW.state IN ('response_draft', 'declined', 'expired', 'cancelled'))
    OR (OLD.state = 'response_draft' AND NEW.state IN (
      'response_draft', 'response_submitted', 'declined', 'expired', 'cancelled'
    ))
    OR (OLD.state = 'response_submitted' AND NEW.state IN ('negotiating', 'cancelled'))
    OR (OLD.state = 'negotiating' AND NEW.state = 'cancelled');
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'invalid direct offer transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'expired' AND NEW.expired_at < OLD.response_deadline THEN
    RAISE EXCEPTION 'direct offers cannot expire before their response deadline'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER c6_direct_offer_protected
BEFORE INSERT OR UPDATE OR DELETE ON direct_offer
FOR EACH ROW EXECUTE FUNCTION protect_c6_direct_offer();

CREATE FUNCTION protect_c6_offer_response()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offer_recipient_tenant text;
  offer_recipient_workspace text;
  offer_state text;
  offer_deadline timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'offer response evidence is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT recipient_tenant_id, recipient_workspace_id, state, response_deadline
  INTO offer_recipient_tenant, offer_recipient_workspace, offer_state, offer_deadline
  FROM direct_offer WHERE id = NEW.direct_offer_id;
  IF NOT FOUND OR offer_recipient_tenant IS DISTINCT FROM NEW.owner_tenant_id
     OR offer_recipient_workspace IS DISTINCT FROM NEW.owner_workspace_id THEN
    RAISE EXCEPTION 'offer response must be owned by the offer recipient'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.lock_version <> 1 OR offer_state <> 'response_draft'
       OR offer_deadline <= transaction_timestamp() THEN
      RAISE EXCEPTION 'offer response draft requires a live response_draft offer'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'submitted'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.direct_offer_id IS DISTINCT FROM OLD.direct_offer_id
     OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
     OR NEW.owner_workspace_id IS DISTINCT FROM OLD.owner_workspace_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.lock_version <> OLD.lock_version + 1
     OR NOT (
       (OLD.state = 'draft' AND NEW.state = 'draft' AND offer_state = 'response_draft')
       OR (OLD.state = 'draft' AND NEW.state = 'submitted' AND offer_state = 'response_submitted')
     ) THEN
    RAISE EXCEPTION 'invalid offer response evidence transition' USING ERRCODE = '55000';
  END IF;
  IF offer_deadline <= transaction_timestamp() THEN
    RAISE EXCEPTION 'offer response deadline has passed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER c6_offer_response_protected
BEFORE INSERT OR UPDATE OR DELETE ON offer_response
FOR EACH ROW EXECUTE FUNCTION protect_c6_offer_response();

CREATE FUNCTION validate_c6_offer_access_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offer_row direct_offer%ROWTYPE;
BEGIN
  -- A BEFORE DELETE trigger that falls through to `RETURN NEW` returns NULL,
  -- which cancels the delete silently. Only offer grants are append-only
  -- evidence here, so every other access_grant has to keep the delete
  -- semantics it had before C6 rather than become quietly undeletable.
  IF TG_OP = 'DELETE' THEN
    IF OLD.direct_offer_id IS NOT NULL THEN
      RAISE EXCEPTION 'direct offer grants are append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.direct_offer_id IS NOT NULL OR NEW.direct_offer_id IS NOT NULL) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.grantor_tenant_id IS DISTINCT FROM OLD.grantor_tenant_id
       OR NEW.grantor_workspace_id IS DISTINCT FROM OLD.grantor_workspace_id
       OR NEW.grantee_tenant_id IS DISTINCT FROM OLD.grantee_tenant_id
       OR NEW.grantee_workspace_id IS DISTINCT FROM OLD.grantee_workspace_id
       OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.direct_offer_id IS DISTINCT FROM OLD.direct_offer_id
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'direct offer grant identity is immutable' USING ERRCODE = '55000';
    END IF;
    IF OLD.state IN ('revoked', 'expired') THEN
      RAISE EXCEPTION 'terminal direct offer grants are immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.direct_offer_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO offer_row FROM direct_offer WHERE id = NEW.direct_offer_id;
  IF NOT FOUND
     OR NEW.grantor_tenant_id IS DISTINCT FROM offer_row.sender_tenant_id
     OR NEW.grantor_workspace_id IS DISTINCT FROM offer_row.sender_organization_workspace_id
     OR NEW.grantee_tenant_id IS DISTINCT FROM offer_row.recipient_tenant_id
     OR NEW.grantee_workspace_id IS DISTINCT FROM offer_row.recipient_workspace_id
     OR NEW.valid_from IS DISTINCT FROM offer_row.created_at
     OR NEW.expires_at < offer_row.response_deadline
     OR NOT (
       (NEW.resource_type = 'direct_offer' AND NEW.capability = 'collaborate'
        AND NEW.resource_id = offer_row.id)
       OR (NEW.resource_type = 'challenge' AND NEW.capability = 'read'
        AND NEW.resource_id = offer_row.challenge_id)
     ) THEN
    RAISE EXCEPTION 'direct offer grant does not match its offer relationship'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER c6_offer_access_grant_validated
BEFORE INSERT OR UPDATE OR DELETE ON access_grant
FOR EACH ROW EXECUTE FUNCTION validate_c6_offer_access_grant();

CREATE FUNCTION validate_c6_offer_coherence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_offer_id text;
  offer_state text;
  response_state text;
  active_grants integer;
BEGIN
  IF TG_TABLE_NAME = 'direct_offer' THEN
    target_offer_id := NEW.id;
  ELSE
    target_offer_id := NEW.direct_offer_id;
  END IF;
  IF target_offer_id IS NULL THEN RETURN NULL; END IF;
  SELECT state INTO offer_state FROM direct_offer WHERE id = target_offer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT state INTO response_state FROM offer_response WHERE direct_offer_id = target_offer_id;
  SELECT count(*) INTO active_grants FROM access_grant
  WHERE direct_offer_id = target_offer_id AND state = 'active';
  IF offer_state IN ('received', 'viewed', 'response_draft', 'response_submitted', 'negotiating')
     AND active_grants <> 2 THEN
    RAISE EXCEPTION 'an open direct offer requires exactly two active grants'
      USING ERRCODE = '23514';
  END IF;
  IF offer_state IN ('declined', 'expired', 'cancelled') AND active_grants <> 0 THEN
    RAISE EXCEPTION 'a closed direct offer cannot retain active grants'
      USING ERRCODE = '23514';
  END IF;
  IF offer_state = 'response_draft' AND response_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'response_draft offer requires its draft response' USING ERRCODE = '23514';
  END IF;
  IF offer_state IN ('response_submitted', 'negotiating')
     AND response_state IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'submitted offer state requires submitted response evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER c6_direct_offer_coherent
AFTER INSERT OR UPDATE ON direct_offer
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_c6_offer_coherence();
CREATE CONSTRAINT TRIGGER c6_offer_response_coherent
AFTER INSERT OR UPDATE ON offer_response
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_c6_offer_coherence();
CREATE CONSTRAINT TRIGGER c6_offer_grant_coherent
AFTER INSERT OR UPDATE ON access_grant
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_c6_offer_coherence();
