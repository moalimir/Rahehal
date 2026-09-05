-- C6 correction: one clock decides whether a response deadline is still in the
-- future.
--
-- `protect_c6_direct_offer` re-checked `NEW.response_deadline <=
-- transaction_timestamp()`, an invariant the send command has already decided
-- against the authoritative application clock, which returns a typed
-- `422 VALIDATION` naming the field. Two clocks for one invariant means the
-- write is admissible under the clock that authorised it and refused by the
-- clock that stores it whenever the two differ, and the caller receives an
-- opaque database exception instead of the typed answer the contract promises.
--
-- Every invariant the trigger uniquely guards is kept: the sender must own the
-- challenge, the offer must name its exact published version, the call must be
-- open, and the response deadline must not outlive the call's own deadline --
-- all comparisons between stored values, none against a clock. Only the
-- future-ness comparison is removed, because the writer already made it.
CREATE OR REPLACE FUNCTION protect_c6_direct_offer()
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

-- The same correction for `protect_c6_offer_response`, which compared the
-- offer's response deadline against `transaction_timestamp()` on both the
-- draft insert and every draft update. The command path already refuses a
-- response after the deadline with a typed `409 INVALID_STATE` carrying
-- `current_state: expired`, decided by the authoritative clock; the trigger's
-- own comparison could only ever disagree with it. The offer's stored state --
-- `response_draft` for a draft, `response_submitted` for a submission -- still
-- gates every write, and expiry itself moves that state, so a response cannot
-- be written against an expired offer.
CREATE OR REPLACE FUNCTION protect_c6_offer_response()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offer_recipient_tenant text;
  offer_recipient_workspace text;
  offer_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'offer response evidence is append-only' USING ERRCODE = '55000';
  END IF;
  SELECT recipient_tenant_id, recipient_workspace_id, state
  INTO offer_recipient_tenant, offer_recipient_workspace, offer_state
  FROM direct_offer WHERE id = NEW.direct_offer_id;
  IF NOT FOUND OR offer_recipient_tenant IS DISTINCT FROM NEW.owner_tenant_id
     OR offer_recipient_workspace IS DISTINCT FROM NEW.owner_workspace_id THEN
    RAISE EXCEPTION 'offer response must be owned by the offer recipient'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR NEW.lock_version <> 1 OR offer_state <> 'response_draft' THEN
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
  RETURN NEW;
END;
$$;
