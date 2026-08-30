-- Phase 3 foundation: the proposal aggregate and its immutable versions.
--
-- Same shape A1c established for challenges: a mutable aggregate row carrying
-- the lifecycle state and an optimistic-concurrency counter, plus append-only
-- versions holding the content. Every Phase-3 milestone (C1 eligibility, C3
-- drafts, C4 submission, C5 revisions) builds on these two tables.
CREATE TABLE proposal (
  id text PRIMARY KEY CHECK (id ~ '^prp_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  tenant_id text NOT NULL,
  -- The OWNING solver workspace, never the host organization's. An org reads a
  -- proposal through cross-tenant collaboration, not ownership (42 §3).
  owner_workspace_id text NOT NULL,
  challenge_id text NOT NULL,
  current_version_id text,
  state text NOT NULL CHECK (state IN (
    'draft', 'submitted', 'eligibility_review', 'eligible', 'ineligible',
    'clarification_requested', 'clarification_submitted', 'reviewing',
    'revision_requested', 'revision_draft', 'resubmitted', 'selected',
    'rejected', 'withdrawn'
  )),
  -- Human-facing alias only. Never a key, never used for lookup authorization.
  tracking_code text UNIQUE
    CHECK (tracking_code IS NULL OR tracking_code ~ '^PRP-[0-9]{4}-[0-9]{3,6}$'),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  submitted_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (owner_workspace_id, tenant_id) REFERENCES workspace (id, tenant_id),
  FOREIGN KEY (challenge_id) REFERENCES challenge (id),
  UNIQUE (id, tenant_id),
  -- One active proposal per (challenge, workspace). Withdrawn ones are excluded
  -- below so a solver can start again after withdrawing.
  CHECK (updated_at >= created_at),
  CHECK ((state = 'draft' AND submitted_at IS NULL) OR state <> 'draft')
);

-- The uniqueness invariant, expressed as a partial index so a withdrawn
-- attempt does not permanently consume the solver's one slot.
CREATE UNIQUE INDEX proposal_one_active_per_challenge_workspace_idx
  ON proposal (challenge_id, owner_workspace_id)
  WHERE state <> 'withdrawn';

CREATE INDEX proposal_scope_idx ON proposal (tenant_id, owner_workspace_id);
CREATE INDEX proposal_challenge_idx ON proposal (challenge_id, state);

CREATE TABLE proposal_version (
  id text PRIMARY KEY CHECK (id ~ '^prv_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  proposal_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  actor_user_id text NOT NULL REFERENCES app_user (id),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  -- Exact-content proof (FR-SOL-006): what was submitted can be re-derived and
  -- compared later without trusting a timestamp.
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  changed_fields text[] NOT NULL DEFAULT '{}',
  -- A revision must cite the exact version it revises (C5).
  base_version_id text,
  locked_at timestamptz,
  lock_reason text CHECK (lock_reason IS NULL OR length(btrim(lock_reason)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (proposal_id, version_number),
  UNIQUE (id, proposal_id),
  FOREIGN KEY (proposal_id) REFERENCES proposal (id),
  FOREIGN KEY (base_version_id, proposal_id) REFERENCES proposal_version (id, proposal_id),
  CHECK ((locked_at IS NULL AND lock_reason IS NULL)
      OR (locked_at IS NOT NULL AND lock_reason IS NOT NULL)),
  CHECK (locked_at IS NULL OR locked_at >= created_at),
  -- The first version has nothing to revise; every later one may cite a base.
  CHECK (version_number > 1 OR base_version_id IS NULL)
);

CREATE INDEX proposal_version_proposal_idx ON proposal_version (proposal_id, version_number DESC);

ALTER TABLE proposal
  ADD CONSTRAINT proposal_current_version_fk
    FOREIGN KEY (current_version_id, id)
    REFERENCES proposal_version (id, proposal_id)
    DEFERRABLE INITIALLY DEFERRED;

/*
 * Immutability. A version may be locked exactly once — the unlocked-to-locked
 * write is the only permitted UPDATE, and it may touch nothing else. This is
 * the same protection `challenge_version` carries, so submitted proposal
 * content cannot be edited after the organization has seen it.
 */
CREATE FUNCTION protect_proposal_version_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.locked_at IS NULL
     AND OLD.lock_reason IS NULL
     AND NEW.locked_at IS NOT NULL
     AND NEW.lock_reason IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['locked_at', 'lock_reason'])
       = (to_jsonb(OLD) - ARRAY['locked_at', 'lock_reason']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'proposal version evidence is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER proposal_version_evidence_protected
BEFORE UPDATE OR DELETE ON proposal_version
FOR EACH ROW EXECUTE FUNCTION protect_proposal_version_evidence();

/*
 * A proposal may only exist against a challenge that was actually published,
 * and may only be created while that call is open. Enforced here as well as in
 * the command so a direct SQL write cannot attach a proposal to a draft
 * challenge or to a call that already closed.
 */
CREATE FUNCTION validate_proposal_challenge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  call_state text;
  published_version text;
BEGIN
  SELECT publication_state, published_version_id
  INTO call_state, published_version
  FROM challenge
  WHERE id = NEW.challenge_id;

  IF published_version IS NULL THEN
    RAISE EXCEPTION 'a proposal requires a published challenge' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND call_state <> 'open' THEN
    RAISE EXCEPTION 'a proposal can only be created while the call is open'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_requires_published_challenge
BEFORE INSERT OR UPDATE ON proposal
FOR EACH ROW EXECUTE FUNCTION validate_proposal_challenge();
