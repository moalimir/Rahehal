-- B4: the structurally separate public face of a published challenge.
--
-- Every column here is one field on the `challengePublicProjectionFields`
-- allowlist. There is deliberately no `content jsonb` column and no way to
-- copy the private aggregate wholesale: a confidential field added to
-- `challenge_version.content` later has nowhere to land, so it cannot reach
-- a public reader by omission. Rows exist only for `public`/`registered`
-- challenges, so an `invite_only`/`nda` challenge is invisible to discovery
-- even if a future query forgets its visibility filter.
CREATE TABLE challenge_public_projection (
  challenge_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  challenge_version_id text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 500),
  location text NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 500),
  public_summary text NOT NULL CHECK (length(btrim(public_summary)) BETWEEN 1 AND 4000),
  output_type text NOT NULL
    CHECK (output_type IN ('idea', 'solution', 'poc', 'pilot', 'project', 'technology')),
  sourcing_model text NOT NULL CHECK (sourcing_model IN ('public', 'private', 'hybrid')),
  applicant_scope text NOT NULL CHECK (applicant_scope IN ('person', 'team', 'both')),
  allowed_applicant_types text[] NOT NULL
    CHECK (valid_applicant_type_array(allowed_applicant_types)
           AND cardinality(allowed_applicant_types) > 0),
  work_mode text NOT NULL CHECK (work_mode IN ('onsite', 'remote', 'hybrid')),
  proposal_deadline timestamptz NOT NULL,
  preferred_start_date timestamptz,
  budget_status text NOT NULL CHECK (budget_status IN ('fixed', 'quote', 'undecided', 'non_cash')),
  budget_amount_minor bigint CHECK (budget_amount_minor IS NULL OR budget_amount_minor >= 0),
  budget_currency text NOT NULL CHECK (budget_currency IN ('IRR', 'USD', 'EUR')),
  -- Only the two listable visibilities reach this table at all; the column
  -- still exists because `registered` must never be served to an anonymous
  -- reader (B5).
  visibility text NOT NULL CHECK (visibility IN ('public', 'registered')),
  verification_required boolean NOT NULL,
  nda_required boolean NOT NULL,
  document_gate_required boolean NOT NULL,
  ip_terms text NOT NULL
    CHECK (ip_terms IN ('solver_license', 'contract_transfer', 'joint_contract')),
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (challenge_id, tenant_id) REFERENCES challenge (id, tenant_id),
  FOREIGN KEY (challenge_version_id, challenge_id)
    REFERENCES challenge_version (id, challenge_id),
  UNIQUE (challenge_version_id),
  CHECK (budget_status <> 'fixed' OR budget_amount_minor IS NOT NULL)
);

CREATE INDEX challenge_public_projection_discovery_idx
  ON challenge_public_projection (visibility, proposal_deadline DESC);

CREATE INDEX challenge_public_projection_category_idx
  ON challenge_public_projection (category);

-- Published output is immutable evidence: a correction publishes a new
-- version. B6's amend/pause/close commands replace this trigger when they
-- introduce the states that legitimately mutate a published row.
CREATE FUNCTION prevent_challenge_public_projection_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'challenge public projections are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER challenge_public_projection_append_only
BEFORE UPDATE OR DELETE ON challenge_public_projection
FOR EACH ROW EXECUTE FUNCTION prevent_challenge_public_projection_mutation();

-- A published challenge must point at the exact version that carried all four
-- approval gates. The base CHECK on `challenge` only requires
-- published_version_id to be non-null in published stages; this pins it to a
-- version of the same challenge that actually holds four approved gates, so a
-- direct SQL update cannot fabricate a publication the gates never cleared.
CREATE FUNCTION validate_challenge_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_gates integer;
BEGIN
  IF NEW.published_version_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- `OLD` is unassigned on INSERT, so the unchanged-value shortcut is only
  -- reachable on UPDATE.
  IF TG_OP = 'UPDATE'
     AND NEW.published_version_id IS NOT DISTINCT FROM OLD.published_version_id THEN
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT gate)
  INTO approved_gates
  FROM challenge_approval
  WHERE challenge_version_id = NEW.published_version_id
    AND decision = 'approved';

  IF approved_gates <> 4 THEN
    RAISE EXCEPTION 'a published version requires all four approved publication gates'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER challenge_publication_requires_gates
BEFORE INSERT OR UPDATE ON challenge
FOR EACH ROW EXECUTE FUNCTION validate_challenge_publication();
