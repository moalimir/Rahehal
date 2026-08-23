# Data Model — PostgreSQL schema, tenancy, and projections

Implementation-ready schema for the MVP vertical slice (challenge → proposal → review → decision) plus the cross-cutting platform tables every slice needs. Names and states come from [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md); executable command/result envelopes come from `packages/contracts` and [60_API_CONTRACT](60_API_CONTRACT.md). The browser solver aggregate remains migration evidence, not the API contract. DDL is PostgreSQL 15+.

---

## 1. Conventions

- **IDs**: `text` primary keys, server-minted, prefixed (`chl_`, `chv_`, `prp_`, `prv_`, `rva_`, `rev_`, `dec_`, `case_`), globally unique, no embedded authorization (20 §7).
- **Tenancy columns**: every protected table has `tenant_id` (and `workspace_id` where a workspace owns the row). Queries scope by tenant/workspace **before** record permissions.
- **Timestamps**: `timestamptz`, UTC; display converts to Asia/Tehran. `created_at`/`updated_at` on every table.
- **Money**: never floats. `amount_minor bigint` + `currency char(3)` (ISO-4217). IRR is stored in minor units; Toman is a _display_ conversion (÷10), resolving X-11.
- **Versioned content**: immutable version rows + a pointer to `current_version_id` on the aggregate.
- **Enums**: Postgres `CHECK` constraints or `enum` types mirroring the canonical state machines exactly (values verbatim from `state-machines.ts`).
- **Optimistic concurrency**: aggregates carry `version integer` bumped on every write; commands pass `expected_version` (60 §4).

## 2. Tenancy strategy (ADR-006)

**Default: application-scoped tenancy + PostgreSQL Row-Level Security as defense-in-depth.**

- Every request runs in a transaction that sets `SET LOCAL app.tenant_id = $1; SET LOCAL app.workspace_id = $2; SET LOCAL app.user_id = $3;` (workspace is needed for grant-based access, below).
- **Records fall into three access classes** (full model in [42 §3](42_FOUNDATION_HARDENING.md)) — because open innovation is **cross-tenant by design** (an org must evaluate a proposal owned by the solver's tenant): _tenant-owned_ (pure isolation, RLS `tenant_id = app.tenant_id`), _shared/collaboration_ (owner tenant **OR** an active `access_grant` to the subject's workspace), and _public projection_ (separate unauthenticated tables). The app _also_ scopes every query — RLS is the backstop for a missed `WHERE`, not the only control.
- The **platform operator** is its own tenant; operations reads across tenants go through explicit, audited, purpose-scoped views (never a blanket bypass), satisfying least-privilege and support-consent rules.
- Rejected simpler options: schema-per-tenant (operational drag at pilot scale), DB-per-tenant (premature). Revisit only with scale/isolation evidence.

```sql
-- Tenant-owned record (e.g. a draft challenge): pure isolation
ALTER TABLE challenge ENABLE ROW LEVEL SECURITY;
CREATE POLICY challenge_tenant_owned ON challenge
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Shared record (e.g. a proposal an org must evaluate): tenant-owned OR an active grant
ALTER TABLE proposal ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_access ON proposal USING (
  tenant_id = current_setting('app.tenant_id', true)
  OR EXISTS (SELECT 1 FROM access_grant g
             WHERE g.scope_type = 'proposal' AND g.scope_id = proposal.id
               AND g.grantee_workspace_id = current_setting('app.workspace_id', true)
               AND g.state = 'active')
);
```

> The `access_grant` table and the grant lifecycle (who is granted what, when, and when it is revoked) are specified in [42_FOUNDATION_HARDENING §3](42_FOUNDATION_HARDENING.md). Grants are created/revoked in the same transaction as the command that opens/closes the relationship, are audited, and are membership-gated.

## 3. Identity, tenancy & access

```sql
CREATE TABLE tenant (
  id          text PRIMARY KEY,              -- ten_*
  kind        text NOT NULL CHECK (kind IN ('organization','solver','platform')),
  display_name text NOT NULL,
  region      text NOT NULL,                 -- data residency (D-07)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id            text PRIMARY KEY,            -- usr_*
  idp_subject   text UNIQUE NOT NULL,        -- link to OIDC IdP; no secrets stored here
  display_name  text NOT NULL,
  primary_email citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  mobile        text,
  mobile_verified_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace (
  id          text PRIMARY KEY,              -- wsp_*
  tenant_id   text NOT NULL REFERENCES tenant(id),
  kind        text NOT NULL CHECK (kind IN ('org','individual','team')),
  team_kind   text CHECK (team_kind IS NULL OR team_kind IN
                 ('expert-team','lab','academic-group','company')), -- canonical TeamKind (20 §5)
  owner_user_id text REFERENCES app_user(id),  -- individual/team owner
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_team_kind_matches_kind CHECK (
    (kind = 'team') = (team_kind IS NOT NULL)
  )
);

-- roles are namespaced text: 'org:owner','org:approver_technical','team:proposal-manager','platform:reviewer'... (20 §3)
CREATE TABLE membership (
  id          text PRIMARY KEY,              -- mem_*
  tenant_id   text NOT NULL REFERENCES tenant(id),
  workspace_id text NOT NULL REFERENCES workspace(id),
  user_id     text NOT NULL REFERENCES app_user(id),
  role        text NOT NULL,
  state       text NOT NULL CHECK (state IN
                ('invited','requested','active','rejected','expired','suspended','removed')),
  assigned_proposal_ids text[] NOT NULL DEFAULT '{}',
  assigned_case_ids     text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, role)
);
CREATE INDEX ON membership (user_id) WHERE state = 'active';
CREATE INDEX ON membership (workspace_id, state);
```

The `solver` tenant kind and workspace-ownership rules are the engineering default in DEC-2026-011 and remain blocked on product+security owner sign-off. Every protected row has one owning tenant; multi-tenant user reach comes from active memberships and explicit `access_grant` rows, never from a shared platform-tenant bucket.

## 4. Challenge aggregate + public projection

```sql
CREATE TABLE challenge (
  id            text PRIMARY KEY,            -- chl_*
  tenant_id     text NOT NULL REFERENCES tenant(id),
  workspace_id  text NOT NULL REFERENCES workspace(id),   -- owning org workspace
  stage         text NOT NULL CHECK (stage IN            -- canonical 11-stage lifecycle (20 §4)
                  ('draft','triage','formulation','approvals','published',
                   'evaluating','decided','contracting','pilot','impact','closed')),
  authoring_status text CHECK (authoring_status IN        -- intake-editor sub-status of draft (D3)
                  ('draft','ready','under_review','needs_changes','published','closed')),
  current_version_id text,                   -- FK set after first version
  published_version_id text,                 -- locked at publication
  version       integer NOT NULL DEFAULT 0,  -- optimistic concurrency
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE challenge_version (
  id            text PRIMARY KEY,            -- chv_*
  challenge_id  text NOT NULL REFERENCES challenge(id),
  number        integer NOT NULL,
  actor_user_id text NOT NULL REFERENCES app_user(id),
  content       jsonb NOT NULL,             -- canonical ChallengeDraftContent; transport projection is ChallengeDraftContentResource
  locked        boolean NOT NULL DEFAULT false,   -- true once submitted/published
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, number)
);

-- Independent, version-specific approvals (publicationGates, product.ts:65) — separation of duty
CREATE TABLE challenge_approval (
  id            text PRIMARY KEY,
  challenge_id  text NOT NULL REFERENCES challenge(id),
  challenge_version_id text NOT NULL REFERENCES challenge_version(id),
  gate          text NOT NULL CHECK (gate IN ('business','technical','finance','legal','quality')),
  passed        boolean NOT NULL,
  actor_user_id text NOT NULL REFERENCES app_user(id),   -- must differ per separation rules (70 §6)
  evidence      text,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_version_id, gate)
);

CREATE TABLE eligibility_rule (
  id            text PRIMARY KEY,
  challenge_id  text NOT NULL REFERENCES challenge(id),
  version       integer NOT NULL,
  allowed_applicant_types text[] NOT NULL,   -- canonical ApplicantType (20 §5)
  verification_required boolean NOT NULL DEFAULT false,
  minimum_readiness integer NOT NULL DEFAULT 0,
  required_expertise text[] NOT NULL DEFAULT '{}',
  geography     text[],
  nda_required  boolean NOT NULL DEFAULT false,
  document_gate boolean NOT NULL DEFAULT false,
  deadline      timestamptz NOT NULL,
  state         text NOT NULL CHECK (state IN ('open','closed','paused')),
  UNIQUE (challenge_id, version)
);

-- Read-only publishable subset; ONLY explicitly publishable fields (FR-PUB-002, exit gate Phase 2)
CREATE TABLE challenge_public_projection (
  challenge_id  text PRIMARY KEY REFERENCES challenge(id),
  published_version_id text NOT NULL REFERENCES challenge_version(id),
  public_payload jsonb NOT NULL,             -- safe fields only; confidential fields never here
  search_vector tsvector,                    -- Persian-normalized FTS
  published_at  timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX challenge_projection_fts ON challenge_public_projection USING gin (search_vector);
```

`allowed_applicant_types` is authoritative. `applicant_scope` remains a compatibility field in the versioned transport/content document and is derived by DEC-2026-010; it is not an independently writable aggregate column. Commands validate any supplied compatibility value and persist only the derived projection.

## 5. Proposal aggregate (immutable versions)

```sql
CREATE TABLE proposal (
  id            text PRIMARY KEY,            -- prp_*
  tenant_id     text NOT NULL REFERENCES tenant(id),   -- the OWNING solver tenant/workspace
  owner_workspace_id text NOT NULL REFERENCES workspace(id),
  challenge_id  text NOT NULL REFERENCES challenge(id),
  current_version_id text,
  state         text NOT NULL CHECK (state IN          -- ProposalState (solver.ts:166)
                  ('draft','submitted','eligibility_review','eligible','ineligible',
                   'clarification_requested','clarification_submitted','reviewing',
                   'revision_requested','revision_draft','resubmitted','selected',
                   'rejected','withdrawn')),
  assigned_membership_ids text[] NOT NULL DEFAULT '{}',
  tracking_code text UNIQUE,                  -- human alias, not a key (20 §7.3)
  version       integer NOT NULL DEFAULT 0,
  submitted_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- a workspace submits at most one active proposal per challenge
  UNIQUE (challenge_id, owner_workspace_id)
);

CREATE TABLE proposal_version (
  id            text PRIMARY KEY,            -- prv_*
  proposal_id   text NOT NULL REFERENCES proposal(id),
  number        integer NOT NULL,
  actor_user_id text NOT NULL REFERENCES app_user(id),
  content       jsonb NOT NULL,             -- ProposalContent (solver.ts:182)
  content_hash  text NOT NULL,             -- exact-content proof (FR-SOL-006)
  changed_fields text[] NOT NULL DEFAULT '{}',
  base_version_id text REFERENCES proposal_version(id),  -- explicit base for revisions
  locked        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, number)
);
-- Enforce immutability: no UPDATE of a locked version (trigger or restricted grants)
```

## 6. Rubric, review assignment, COI, review, decision

```sql
CREATE TABLE rubric (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenant(id),
  challenge_id text NOT NULL REFERENCES challenge(id), current_version_id text
);
CREATE TABLE rubric_version (
  id text PRIMARY KEY, rubric_id text NOT NULL REFERENCES rubric(id),
  number integer NOT NULL, criteria jsonb NOT NULL,   -- [{id,label,weight,min,max}]
  locked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_id, number)
);

CREATE TABLE review_assignment (
  id            text PRIMARY KEY,            -- rva_*
  tenant_id     text NOT NULL REFERENCES tenant(id),   -- the ORG that owns the review
  proposal_version_id text NOT NULL REFERENCES proposal_version(id),
  rubric_version_id text NOT NULL REFERENCES rubric_version(id),
  reviewer_user_id text NOT NULL REFERENCES app_user(id),
  state         text NOT NULL CHECK (state IN          -- ReviewState (state-machines.ts:625)
                  ('coi-gate','accepted','draft','submitted','locked','invalidated')),
  due_at        timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_version_id, reviewer_user_id)
);

-- COI as a first-class record (D8, X-07) — replaces localStorage flag
CREATE TABLE coi_declaration (
  id            text PRIMARY KEY,
  assignment_id text NOT NULL UNIQUE REFERENCES review_assignment(id),
  coi_status    text NOT NULL CHECK (coi_status IN ('pending','clear','conflict')),
  declared_relationships text,
  lookback_note text,
  declared_at   timestamptz,
  escalated_to_ops boolean NOT NULL DEFAULT false,
  ops_override  text CHECK (ops_override IN ('none','overridden_clear','confirmed_conflict')) DEFAULT 'none',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE review (
  id            text PRIMARY KEY,            -- rev_*
  assignment_id text NOT NULL REFERENCES review_assignment(id),
  scores        jsonb NOT NULL,             -- [{criterion_id, value, rationale}] — rationale required
  overall_rationale text NOT NULL,
  submitted_at  timestamptz,
  receipt_id    text,
  locked        boolean NOT NULL DEFAULT false,
  UNIQUE (assignment_id)
);

CREATE TABLE decision (
  id            text PRIMARY KEY,            -- dec_*
  tenant_id     text NOT NULL REFERENCES tenant(id),
  challenge_id  text NOT NULL REFERENCES challenge(id),
  outcome       text NOT NULL CHECK (outcome IN ('selected','no_award')),
  selected_proposal_version_id text REFERENCES proposal_version(id),
  rationale     text NOT NULL,
  actor_user_id text NOT NULL REFERENCES app_user(id),   -- authorized decider; step-up required
  decided_at    timestamptz NOT NULL DEFAULT now(),
  correlation_id text NOT NULL
);
```

## 7. Case & execution (slice 2 — schema stubs for continuity)

`case`, `contract_version`, `pilot`, `milestone`, `task`, `deliverable`, `payment`, `ledger_entry`, `impact_record`. States mirror the canonical machines: `ContractState` (7), `PilotState` (6), `PaymentState` (8). Key money/gate columns:

```sql
CREATE TABLE payment (
  id text PRIMARY KEY,                       -- pay_*
  case_id text NOT NULL, milestone text NOT NULL,
  amount_minor bigint NOT NULL, currency char(3) NOT NULL,
  state text NOT NULL CHECK (state IN
    ('triggered','approval','processing','paid','reconciled','hold','failed','refunded')),
  technical_accepted_at timestamptz,          -- gate 1
  finance_approved_by text REFERENCES app_user(id),  -- gate 2 (must differ from technical acceptor)
  contract_effective_id text,                 -- gate 3
  provider_ref text, receipt_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- CHECK/trigger: state can reach 'processing' only when all three gates are satisfied (invariant 20 §8.6)
```

## 8. Cross-cutting platform tables

```sql
CREATE TABLE idempotency_key (
  scope_kind text NOT NULL CHECK (scope_kind IN ('tenant','credential')),
  scope_id   text NOT NULL,                  -- tenant ID or one-way credential-scope digest; never a raw token/code
  tenant_id  text,                           -- null only before tenant context exists
  key        text NOT NULL,                  -- client-supplied
  command    text NOT NULL,                  -- stable command name
  request_fingerprint text NOT NULL,          -- actor/workspace/target/normalized-body binding
  actor_user_id text,
  workspace_id text,
  entity_id  text,
  receipt_id text,
  response   jsonb NOT NULL,                 -- cached exact response for replay
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope_kind, scope_id, command, key),
  CHECK ((scope_kind = 'tenant' AND tenant_id = scope_id) OR
         (scope_kind = 'credential' AND tenant_id IS NULL))
);

CREATE TABLE outbox_event (
  event_id    text PRIMARY KEY,              -- evt_*; stable downstream idempotency key
  event_type  text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aggregate_type text NOT NULL, aggregate_id text NOT NULL,
  tenant_id   text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload     jsonb NOT NULL,
  published_at timestamptz                    -- null = unrelayed
);
CREATE INDEX ON outbox_event (published_at) WHERE published_at IS NULL;

CREATE TABLE audit_event (                    -- append-only; app role has INSERT+SELECT only
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  actor_user_id text NOT NULL,
  workspace_id text,
  entity_type text NOT NULL, entity_id text NOT NULL, entity_version integer,
  action      text NOT NULL,                  -- audit code from state machine (e.g. 'review.submitted')
  outcome     text NOT NULL CHECK (outcome IN ('success','denied','failed')),
  reason      text,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_event (entity_type, entity_id);
CREATE INDEX ON audit_event (correlation_id);

CREATE TABLE file_object (
  id text PRIMARY KEY, tenant_id text NOT NULL, workspace_id text NOT NULL,
  entity_type text, entity_id text,
  object_key text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL,
  classification text NOT NULL CHECK (classification IN
    ('public','internal','confidential','highly_sensitive')),
  scan_state text NOT NULL CHECK (scan_state IN ('quarantined','clean','infected','error')) DEFAULT 'quarantined',
  available boolean NOT NULL DEFAULT false,   -- true only after clean scan
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_delivery (
  id text PRIMARY KEY, recipient_user_id text NOT NULL, workspace_id text,
  type text NOT NULL, template_version text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','push','in_app')),
  entity_id text, deep_link text,
  state text NOT NULL CHECK (state IN ('queued','sent','delivered','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
```

The relay/queue adapter, not the business event envelope, owns stable claim IDs, delivery attempts, visibility/lease time, published/dead-letter state, retry scheduling, and the operated dead-letter queue. Every consumer validates the envelope plus supported schema version/event allowlist and passes `event_id` unchanged as the downstream provider idempotency key. The checked-in worker proves those semantics in memory only; the production queue mapping remains a Phase-1 adapter and migration.

Also: `policy_version` (versioned trust/legal/privacy content), `consent`, `dispute`, `privileged_access_grant`, `nda_acceptance` (from `solver.ts:349`), `verification_record` (from `solver.ts:332`) — same patterns.

**AI/matching is deferred** under ADR-0012. Phase 1 adds only the provider-neutral `embedding.requested` outbox event contract. The future `embedding`, `match_run`, `match_result`, `ai_interaction`, pgvector extension, model adapter, and any data egress land only in the later authorized AI phase described by [45_AI_AND_MATCHING](45_AI_AND_MATCHING.md).

## 9. Migration mapping (browser stores → tables)

| Browser store (evidence)                                                   | → Table(s)                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rahhal.session.v1` (`lib/auth/session.ts`)                                | IdP + `app_user` + server session (not a table — token/refresh store)                                                                                                            |
| `rahhal.organization-challenges.v9` (`v8`/`v7`/`v6` first-upgrade sources) | `challenge`, `challenge_version`, `challenge_approval`, `challenge_public_projection`                                                                                            |
| `rahhal.solver.v5.user.*` (`v4` role and direct `v3` taxonomy migrations)  | `workspace`, `membership`, `proposal`, `proposal_version`, `direct_offer`, `verification_record`, `nda_acceptance`, `contract_version`, `case`, `audit_event`, `idempotency_key` |
| `rahhal.demo-command-store.v1`                                             | `idempotency_key`, `outbox_event`, `audit_event`                                                                                                                                 |
| Direct-offer store (`lib/offers/store.ts`)                                 | `direct_offer` + `offer_response`                                                                                                                                                |
| Reviewer COI keys (`lib/reviews/access.ts`)                                | `review_assignment` + `coi_declaration`                                                                                                                                          |
| Payment store (`lib/payments/store.ts`)                                    | `payment` + `ledger_entry` + reconciliation                                                                                                                                      |

Challenge demo-store v9 renames v8 `solverTypes` to canonical `allowedApplicantTypes` and maps `individual → individual`, `team → expert-team`, `company → company`, and `university → academic-group`; it never infers `lab`. A present canonical detailed field wins in mixed records, unknown or missing values become an empty allow-set, and `applicantScope` is derived from that set. Existing contradictory v9 records are normalized and rewritten on read. The migration validates the complete `ChallengeRecord` shape—including required identifiers/timestamps, enums, booleans, and nested attachment/criterion/applicant arrays—and rejects malformed records before sorting or use. The v8 rollback mirror is all-or-nothing: it is written and marked fresh only when every applicant value has an exact old representation. If any record contains `lab`, v9 removes the entire v8 mirror/freshness pair rather than advertising a truncated snapshot. A v9-seen marker plus cleanup of consumed v7/v6 inputs ensures those older stores remain first-upgrade sources only and cannot resurrect after v9 is lost or corrupt. Auxiliary mirror/cleanup failure does not reverse an authoritative v9 write.

Solver demo-store v5 maps each valid flat v4 team role to its `team:*` value throughout memberships, invitations, membership requests, and settings. Direct v3 upgrade additionally maps `SolverTeam.teamType` to `teamKind`. An authoritative v5 persist attempts a down-mapped v4 rollback mirror (canonical `teamKind`, flat role values) and marks it fresh only after success; auxiliary mirror failure does not fail or duplicate the v5 mutation. Valid v5 wins, corrupt-current recovery accepts only a fresh v4 mirror, and a v5-seen guard prevents stale v3 resurrection. Unknown/missing kinds or roles invalidate the snapshot instead of widening access. The old name-only team draft remains the explicit `expert-team` exception; the ephemeral registration `SolverTeamType` is not an authoritative migration source.

The browser `SolverState.idempotency` map and solver receipt/failure types were useful prototype inputs. The exact executable contract is now `packages/contracts`; production migration must add durable authorization, fingerprint-scoped idempotency, optimistic concurrency, and a single PostgreSQL unit of work for aggregate/version + audit + outbox + cached response. It is therefore more than a persistence swap, even where field meanings are preserved.

## 10. Indexing & integrity checklist

- Composite indexes on every `(tenant_id, …)` access path; partial indexes for hot states (`membership active`, `outbox unpublished`).
- Unique constraints encode invariants: one active proposal per `(challenge, workspace)`; one COI per assignment; one approval per `(version, gate)`.
- Foreign keys everywhere; `ON DELETE` is **RESTRICT** for auditable entities (never cascade-delete evidence).
- Immutability enforced by triggers or column-level grants on locked versions and `audit_event`.
- All money via `amount_minor + currency`; a CI check bans `float`/`numeric` money columns and hard-coded Toman math outside the display layer.
