-- Phase 3 C8: the in-app notification read model. Rows carry stable
-- identifiers and a projected kind only: no proposal or response content, no
-- clarification or revision text, no contact details, no credentials, and no
-- foreign-tenant metadata. A deep link is rebuilt from the subject reference
-- and re-authorized on read, never trusted from the notification itself.

CREATE TABLE notification (
  id text PRIMARY KEY CHECK (id ~ '^ntf_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL REFERENCES tenant (id),
  workspace_id text NOT NULL,
  user_id text NOT NULL REFERENCES app_user (id),
  kind text NOT NULL CHECK (length(kind) BETWEEN 3 AND 80),
  subject_type text NOT NULL CHECK (subject_type IN ('proposal', 'team', 'direct_offer')),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 5 AND 80),
  -- The outbox event this row was projected from. One notification per event
  -- per recipient makes redelivery a no-op rather than a duplicate.
  source_event_id text NOT NULL CHECK (source_event_id ~ '^evt_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^cor_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  read_at timestamptz,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  UNIQUE (source_event_id, user_id),
  CHECK (read_at IS NULL OR read_at >= occurred_at)
);

CREATE INDEX notification_recipient_idx
  ON notification (tenant_id, workspace_id, user_id, occurred_at DESC, id);

CREATE INDEX notification_unread_idx
  ON notification (tenant_id, workspace_id, user_id)
  WHERE read_at IS NULL;

-- Delivery evidence for the durable worker. `runOnce` inserts here inside the
-- projection transaction, so a redelivered event finds the row and skips the
-- effect instead of writing a second notification.
CREATE TABLE outbox_delivery (
  event_id text PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  delivered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION protect_notification_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A BEFORE DELETE trigger that falls through to `RETURN NEW` returns NULL
  -- and cancels the delete silently, so the delete path returns OLD
  -- explicitly. Notifications are a read model rather than evidence: a
  -- recipient's rows may be removed, but the projected facts are immutable
  -- and only `read_at` may ever move, and only from NULL to a real time.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'projected notification facts are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'a read notification cannot be unread' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_projection_protected
BEFORE UPDATE OR DELETE ON notification
FOR EACH ROW EXECUTE FUNCTION protect_notification_projection();

CREATE FUNCTION prevent_outbox_delivery_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbox delivery evidence is append-only' USING ERRCODE = '55000';
  END IF;
  RAISE EXCEPTION 'outbox delivery evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER outbox_delivery_append_only
BEFORE UPDATE OR DELETE ON outbox_delivery
FOR EACH ROW EXECUTE FUNCTION prevent_outbox_delivery_mutation();
