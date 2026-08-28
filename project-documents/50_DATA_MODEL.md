# Data Model — PostgreSQL schema, tenancy, and projections

Target schema for the MVP vertical slice (challenge → proposal → review → decision) plus the cross-cutting platform tables every slice needs. Names and states come from [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md); executable command/result envelopes come from `packages/contracts` and [60_API_CONTRACT](60_API_CONTRACT.md). For tables that have landed, `apps/api/migrations/*.up.sql` is the executable source of truth and its paired `.down.sql` is the rollback. Later SQL sketches in this document are plans, not runnable migrations. The browser solver aggregate remains migration evidence, not the API contract. The local baseline is PostgreSQL 16.

---

## 1. Conventions

- **IDs**: `text` primary keys, server-minted, prefixed (`chl_`, `chv_`, `prp_`, `prv_`, `rva_`, `rev_`, `dec_`, `case_`), globally unique, no embedded authorization (20 §7).
- **Tenancy columns**: every protected table has `tenant_id` (and `workspace_id` where a workspace owns the row). Queries scope by tenant/workspace **before** record permissions.
- **Timestamps**: `timestamptz`, UTC; display converts to Asia/Tehran. Mutable aggregates carry `created_at`/`updated_at`; append-only evidence carries `occurred_at`/`created_at` and is never rewritten merely to update a timestamp.
- **Money**: never floats. `amount_minor bigint` + `currency char(3)` (ISO-4217). IRR is stored in minor units; Toman is a _display_ conversion (÷10), resolving X-11.
- **Versioned content**: immutable version rows + a pointer to `current_version_id` on the aggregate.
- **Enums**: Postgres `CHECK` constraints or `enum` types mirroring the canonical state machines exactly (values verbatim from `state-machines.ts`).
- **Optimistic concurrency**: aggregates carry a non-negative lock version bumped on every write; commands pass `expected_version` (60 §4). The A1a `challenge` column is `lock_version`; API naming remains `entity_version`/`expected_version`.

## 2. Tenancy strategy (ADR-0004)

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

The executable baseline is `0001_a1a_foundation.up.sql`, `0002_a1b_identity_transaction.up.sql`, `0003_a1c_authoritative_challenge.up.sql`, and `0004_a2_oidc_authorization.up.sql`:

| Table                        | Landed invariant                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant`                     | Exact kinds `organization`, `solver`, `platform`; `(id, kind)` supports declarative compatibility references                                                                                                                    |
| `app_user`, `identity_link`  | Contacts and verification flags are separate from provider identity; an external identity is unique by `(issuer, subject)`; no IdP secret or password is stored                                                                 |
| `workspace`                  | `platform→platform`, `org→organization`, and `individual`/`team→solver`; only individual/team spaces have an owner and only teams have `TeamKind`                                                                               |
| `membership`                 | Workspace/tenant linkage is one composite foreign key; `platform:*`, `org:*`, `team:*`, and `individual` roles must match the workspace kind                                                                                    |
| `access_grant`               | Cross-tenant only, workspace-bound, resource- and capability-specific, time-bounded, explicitly revocable, and auditable by actor ID                                                                                            |
| `app_session`                | Stores only unique SHA-256-shaped access/refresh digests, expiry, version, active context, revocation metadata, and an evidence-partition `origin_tenant_id`; raw credentials are structurally absent                           |
| `oidc_authorization_attempt` | One-time exact redirect plus state/verifier/nonce/idempotency digests; only validated issuer/subject/verified email survive provider exchange; codes, verifiers, state, provider tokens, and raw claims are structurally absent |

DEC-2026-011 and its owner record in [27](27_PHASE1_OWNER_APPROVALS.md) accept these tenant/workspace semantics. A1a encodes structural compatibility. A1b scopes session/workspace queries, binds the database session to the user principal, revalidates active membership under row locks, and transacts session state with audit/outbox/idempotency evidence. A1c joins challenge commands to that same transaction boundary. A2 records only authorization-attempt digests and validated identity fields, then consumes the attempt in the same transaction that creates the app session. Grant authorization remains a later increment; RLS remains the pre-pilot defense-in-depth gate.

`origin_tenant_id` records the tenant under which the session was issued so session audit/outbox evidence always has a tenant partition; it is not the active authorization context. Migration `0002` backfills it from the active context or the user's earliest membership and fails explicitly if an existing orphaned session has no tenant source. Its down migration removes only that A1b column, constraint, and index.

## 4. Challenge aggregate + public projection

A1a lands `challenge` and `challenge_version`; A1c makes the draft path authoritative:

- A challenge belongs to a composite organization-tenant/`org`-workspace scope and accepts exactly the 11 canonical lifecycle stages.
- `current_version_id` is required; `published_version_id` is required from `published` onward. Deferred composite foreign keys prove each pointer references a version of that same challenge.
- Version numbers are positive and unique per challenge. Migration `0003` normalizes legacy seed content to the complete draft shape and rejects missing structural keys. Every version row is append-only, whether submitted or still a draft; a save inserts a replacement version instead of updating content.
- `lock_version` is the positive aggregate optimistic-concurrency value and equals the current version number. The editor's `ready`/`needs_changes` values are constrained `authoring_status` values on each version, never lifecycle stages.

Phase 2 migration `0006` adds version-specific, independently attributable `challenge_approval` evidence. Migration `0007` adds one append-only `eligibility_rule` snapshot per `challenge_version`, created by a database trigger in the same transaction as the version. The snapshot carries authoritative `allowed_applicant_types`, verification/NDA/document gates, proposal deadline, and rule state. Editable challenges accept only an open, unexpired rule; partial drafts may leave the deadline null until readiness validation requires it. Existing versions are backfilled without rewriting their immutable content. `applicant_scope` remains the DEC-2026-010 derived compatibility projection and is never independently writable.

Migration `0008` adds the structurally separate `challenge_public_projection`, written by B4's publish transaction. It has one explicit column per field on the `challengePublicProjectionFields` allowlist and no `content jsonb` column, so a confidential field added to `challenge_version.content` later has nowhere in the public table to land. Rows exist only for `public`/`registered` challenges — an `invite_only`/`nda` challenge publishes without ever entering the table, so discovery cannot leak it through a forgotten filter. The table is append-only; a `challenge` trigger additionally refuses any `published_version_id` that does not carry all four approved `challenge_approval` gates, so a direct SQL write cannot fabricate a publication the gates never cleared. B5 owns the public read path over this table.

## 5. Proposal aggregate (immutable versions)

The remaining schema sections describe later migrations and must not be treated as already present after A1a.

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

A1a lands three cross-cutting records; A1b writes session evidence and A1c writes challenge evidence into them. A1c also adds an append-only durable receipt:

| Table              | Landed invariant                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency_key`  | Tenant scope and pre-tenant credential-fingerprint scope are mutually exclusive; the scope/key tuple is unique with nulls treated as equal; request hash, state, credential-free cached object response, and expiry must be coherent; recursive guards reject raw session-token fields |
| `outbox_event`     | The durable envelope carries stable event ID, tenant/correlation, event and aggregate identity, positive schema version, object payload, dedupe key, and occurrence time; event content is immutable                                                                                   |
| `audit_event`      | Actor kind is explicit (`user/system/provider/anonymous`), user actors require a user ID, scope/target pairs are coherent, metadata is an object, and all updates/deletes are rejected                                                                                                 |
| `mutation_receipt` | A tenant/workspace-scoped entity version points to exactly one audit event and stores correlation, occurrence time, and typed next actions; all updates/deletes are rejected                                                                                                           |

Outbox delivery bookkeeping (`available_at`, attempts, lock, publication, redacted error code) remains mutable so a later worker adapter can claim and complete rows. The worker must validate the reconstructed envelope and pass `event_id` unchanged downstream. A1a–A1c do not yet provide durable claims/leases, an operated dead-letter queue, separate application/database roles, RLS, or WORM audit export.

`file_object`, `notification_delivery`, `policy_version`, `consent`, `dispute`, `privileged_access_grant`, `nda_acceptance`, and `verification_record` remain later migration work. File rows must eventually enforce the quarantine/scan/classification rules in [70](70_SECURITY_AND_AUTHZ.md); no placeholder table is created early.

**AI/matching is deferred** under ADR-0012. Phase 1 adds no embedding event, vector schema, model adapter, or data egress. The future `embedding`, `match_run`, `match_result`, `ai_interaction`, pgvector extension, and related events land only in the later authorized AI phase described by [45_AI_AND_MATCHING](45_AI_AND_MATCHING.md).

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
