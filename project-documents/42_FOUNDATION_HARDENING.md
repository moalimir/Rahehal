# Foundation Hardening & Robustness Review

A senior-review pass over the **foundation** (identity, tenancy, authorization, data, API, eventing, delivery) — stress-tested against _this_ use case before a line of it is built. It found one real correctness defect (cross-tenant access) and several places where implicit assumptions needed to become explicit contracts. Everything here is folded back into [40](40_BACKEND_ARCHITECTURE.md)/[50](50_DATA_MODEL.md)/[60](60_API_CONTRACT.md)/[70](70_SECURITY_AND_AUTHZ.md). AI/matching is out of scope here — foundation first ([45](45_AI_AND_MATCHING.md) is deferred).

---

## 1. What the foundation must be robust _for_

Right-sizing starts with an honest read of the workload — over-building is as much a failure as under-building.

| Property                               | This product                                                                                                              | Design consequence                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Cross-tenant collaboration**         | An org (tenant A) and a solver (tenant B) work on the _same_ proposal/case. This is the defining trait, not an edge case. | Pure tenant isolation is **wrong**. Need explicit, auditable, revocable relationship-scoped sharing (§3). |
| **Correctness ≫ throughput**           | Money, decisions, COI, immutability, audit. A wrong write is catastrophic; a slow read is not.                            | Optimize for transactional integrity + concurrency safety, not raw QPS (§4–5).                            |
| **Governed workflow**                  | Long-lived aggregates moving through explicit state machines with separation of duty.                                     | Strong consistency at the aggregate boundary; async only for side effects (§4).                           |
| **Bursty, human-paced load**           | Deadlines cause spikes (many submissions near a close); otherwise low write rate.                                         | Handle spikes with idempotency + queues + server-time arbitration, not fleet-scale infra (§7).            |
| **Invite-only pilot → moderate scale** | 10²–10³ users, 10³–10⁴ challenges/proposals at pilot; grows linearly, not virally.                                        | Single-primary Postgres + modular monolith is correctly sized for years; scale by known moves (§7).       |
| **Persian/RTL, in-region**             | Data residency; Persian normalization at every text boundary.                                                             | Region-pinned storage; `normalizePersian` at search/validation edges.                                     |

**Verdict up front:** the foundation is **solid and correctly sized** once the cross-tenant access model (§3) is adopted. It is deliberately _not_ micro-serviced, sharded, or multi-region — those would be premature and are ordered explicitly in §7.

## 2. Robustness scorecard

| Dimension            | Status                      | The one thing that matters                                                      |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| Identity & session   | **Solid**                   | Delegated OIDC; revocation + membership checks deny immediately (Phase-1 gate). |
| Tenancy & access     | **Hardened here (§3)**      | Was pure isolation → now tenant-owned **+** relationship-grant sharing.         |
| Authorization        | **Hardened here (§3)**      | `decide()` step 2 rewritten to allow grant-based cross-tenant reach.            |
| Consistency          | **Made explicit (§4)**      | Aggregate + audit + outbox in one tx; everything else eventual.                 |
| Concurrency          | **Made explicit (§5)**      | Right mechanism per invariant (version / unique / advisory lock / idempotency). |
| Resilience           | **Catalogued (§6)**         | Every provider can fail without corrupting business state.                      |
| Scalability          | **Grounded (§7)**           | Bottleneck-ordered plan; no premature infra.                                    |
| Evolvability         | **Made explicit (§9)**      | Expand/contract migrations; versioned API; module extraction on evidence.       |
| Guardrails over time | **Fitness functions (§10)** | CI enforces the invariants so they don't rot.                                   |

## 3. The correction — cross-tenant collaboration access

**Defect found:** [50 §2](50_DATA_MODEL.md) RLS (`tenant_id = current_setting('app.tenant_id')`) and [70 §2](70_SECURITY_AND_AUTHZ.md) step 2 (`target.tenant_id == request.tenant`) enforce **pure tenant isolation**. But the core flow requires an org to read a proposal owned by the solver's tenant, and a solver to reach case/contract/message records owned by the org's tenant. As written, the foundation would deny the product's central interaction.

**Fix — three access classes + an explicit grant.** Every protected record is exactly one of:

| Class                                | Records                                                                                                                                                                  | Access rule                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Tenant-owned** (unilateral)        | draft challenge + versions + approvals, org-internal, solver personal/team **private** profile, verification                                                             | same-tenant active membership (RLS `tenant_id = app.tenant_id`)                                         |
| **Shared** (bilateral collaboration) | proposal (+versions, clarifications), direct*offer (+response), review_assignment (+coi, review — \_narrow*), case, contract, pilot, deliverable, payment, case messages | owning tenant **OR** an active **`access_grant`** linking the subject's workspace to that collaboration |
| **Public projection**                | published challenge/organization projection                                                                                                                              | unauthenticated, served from separate projection tables (already designed, [60 §6](60_API_CONTRACT.md)) |

### 3.1 `access_grant` — the relationship of record

A grant is created/revoked **transactionally by the command that opens/closes the relationship**, and is itself audited and revocable.

```sql
CREATE TABLE access_grant (
  id            text PRIMARY KEY,
  scope_type    text NOT NULL,          -- 'proposal' | 'direct_offer' | 'case' | 'review_assignment' | ...
  scope_id      text NOT NULL,          -- collaboration root id (e.g. the proposal id, the case id)
  grantee_tenant_id    text NOT NULL,
  grantee_workspace_id text NOT NULL,
  capability    text NOT NULL CHECK (capability IN ('read','collaborate','review-scoped')),
  source        text NOT NULL,          -- 'proposal.submitted' | 'offer.sent' | 'case.created' | 'assignment.created'
  state         text NOT NULL CHECK (state IN ('active','revoked','expired')) DEFAULT 'active',
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  UNIQUE (scope_type, scope_id, grantee_workspace_id, capability)
);
CREATE INDEX access_grant_lookup ON access_grant (scope_type, scope_id) WHERE state = 'active';
CREATE INDEX access_grant_grantee ON access_grant (grantee_workspace_id) WHERE state = 'active';
```

**Corrected RLS pattern** (tenant-owned OR granted):

```sql
CREATE POLICY proposal_access ON proposal USING (
  tenant_id = current_setting('app.tenant_id', true)
  OR EXISTS (
    SELECT 1 FROM access_grant g
    WHERE g.scope_type = 'proposal' AND g.scope_id = proposal.id
      AND g.grantee_workspace_id = current_setting('app.workspace_id', true)
      AND g.state = 'active'
  )
);
-- child rows (proposal_version, clarification) check the grant against the parent proposal id
```

### 3.2 Grant lifecycle (who gets what, when)

| Command                                      | Grant created                                                                                                              | Grant revoked                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `proposal:submit`                            | org (challenge tenant) gets **read** on _that proposal_ + its versions/clarifications                                      | on `proposal:withdraw` (per policy); on decision close per retention |
| `directoffer:send`                           | target workspace gets **collaborate** on the offer + shareable challenge detail                                            | on expire/decline/cancel                                             |
| `assignment:create` + COI clear              | reviewer gets **review-scoped** access to _one proposal version's evaluated materials only_ (never the solver's workspace) | on `review:invalidate`, reassignment, or COI=conflict                |
| `decision:record` (selected) → `case:create` | **both** parties (org + winning workspace) get **collaborate** on the case + contract/pilot/deliverable/payment/messages   | on case close per retention                                          |

Key properties: grants are **narrow** (a reviewer never reaches beyond one version; an org never reaches beyond one proposal), **auditable** (every grant/revoke is an `audit_event`), **revocable** (withdrawal, invalidation, membership removal), and **membership-gated** (a grant is to a _workspace_; the user still needs an active membership + role — so removing a member instantly cuts their reach even while the workspace grant stands).

### 3.3 Authz decision, corrected

[70 §2](70_SECURITY_AND_AUTHZ.md) step 2 becomes **Reach** (not pure tenancy): a subject reaches a record iff _(a)_ it is in their active tenant, **or** _(b)_ an active `access_grant` links their active workspace to the record's collaboration, **or** _(c)_ it is a public projection. Otherwise `NOT_FOUND` (non-enumerating). Steps 3–9 (membership, role, state, assignment/COI, separation-of-duty, step-up, classification) then apply unchanged. This keeps deny-by-default while making the product's cross-tenant collaboration a _modeled, audited_ capability rather than a hole.

## 4. Consistency model (explicit boundaries)

| Must be strongly consistent (one Postgres tx)              | May be eventually consistent (async via outbox)    |
| ---------------------------------------------------------- | -------------------------------------------------- |
| Aggregate mutation + version bump                          | Notifications / email / SMS / push                 |
| Submission/version lock, approvals, decision               | Public projection rebuild (search catalog)         |
| Payment three-gate check, money state moves                | Search index updates                               |
| Membership/role/grant changes                              | Embeddings (deferred, [45](45_AI_AND_MATCHING.md)) |
| **`audit_event` + `outbox_event` (same tx as the change)** | Analytics / reporting rollups                      |

Rules: (1) the outbox row is written in the _same transaction_ as the aggregate — never a second connection. (2) The command response returns the new `entity_version` so the client has **read-your-writes**; downstream projections may lag, surfaced with an explicit state (e.g. a just-published challenge shows "publishing…" until the projection catches up). (3) Provider callbacks (payment/signature) are **reconciled**, never trusted as the source of truth.

## 5. Concurrency control (right mechanism per invariant)

| Invariant                                                                                                | Mechanism                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Aggregate mutation races                                                                                 | **Optimistic** `expected_version`; stale → `409 CONFLICT` with `current_version`          |
| One active proposal per (challenge, workspace); one COI per assignment; one approval per (version, gate) | **DB unique constraint** (already in [50](50_DATA_MODEL.md))                              |
| Last-active-manager / owner cannot be removed; publication gate aggregation; decision creation           | **Advisory lock on the aggregate + `SERIALIZABLE`** for the short critical section        |
| Duplicate submit / decide / pay / invite / sign (incl. deadline-spike double-clicks)                     | **Idempotency key** ([60 §3](60_API_CONTRACT.md)); exactly-once replay                    |
| Deadline / submission-window races                                                                       | **Server time inside the tx** decides; outcome audited — never client clocks              |
| Cross-row financial safety                                                                               | Payment reaches `processing` only when all three gates hold, checked in one tx under lock |

## 6. Resilience & failure modes

The rule: **no dependency failure may corrupt or silently advance business state.**

| Failure                           | Behaviour                                                  | Control                                                          |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| IdP down                          | Existing sessions valid to expiry; new logins fail cleanly | Short-token + refresh; graceful login error                      |
| Payment / signature provider down | State parks in `processing`/`signature`; no double effect  | Idempotent calls; reconciliation; `manual-review` queue          |
| Email / SMS / push down           | Business state unaffected                                  | Outbox retry → dead-letter; delivery ≠ state change (FR-OPS-006) |
| Outbox relay down                 | Events durably accumulate; replayed on recovery            | Consumers idempotent; unpublished-index drains                   |
| Poison message                    | Isolated, alerted, replayable                              | Dead-letter + ops replay + `retry: manual-review`                |
| DB primary failover               | Reads continue on replica; writes pause briefly            | Single primary for writes; measured RTO/RPO; restore drills      |
| Object storage down               | Uploads fail cleanly; reads retry                          | Quarantine-before-available; signed-URL retry                    |
| Partial deploy / migration        | No broken intermediate state                               | Expand/contract migrations + feature flags (§9)                  |

## 7. Scalability — grounded and bottleneck-ordered

**Right-sizing (indicative, validate with load tests):** at invite-only pilot scale (10²–10³ users, low tens of writes/sec even at a deadline spike, reads dominated by the cacheable public catalog), a **single well-provisioned PostgreSQL primary + a few stateless API instances + a few workers** has years of headroom. Millions of rows and this write rate are unremarkable for one Postgres node.

**Scale in this order, each only on evidence:**

1. **Vertical + stateless horizontal** — bigger Postgres; add API/worker instances behind the load balancer (both are stateless). Covers the pilot and well beyond.
2. **Read replicas** — serve the public catalog and heavy read projections from replicas + CDN. The projection tables are _already separated_ from private aggregates, so this needs no redesign.
3. **Partition the hot append-only tables** — `audit_event`, `outbox_event`, `notification_delivery` by time (monthly), with archival of old partitions. This is the **first real bottleneck** (table growth), and it is a config change, not a redesign.
4. **Queue backend swap** — Postgres-backed queue → Redis/SQS if worker throughput demands (the outbox interface hides this).
5. **Module extraction** — pull a module into its own service **only** when scaling, security isolation, or team ownership gives evidence. Finance/Payment is the likely first extraction (isolation); the module boundaries + contracts already make this a lift, not a rewrite.

**Explicitly NOT now (would be premature):** microservices, Kafka, Kubernetes sprawl, multi-region, database sharding, a dedicated vector/search cluster, CQRS event-sourcing. Each has a documented trigger; none is met at pilot.

## 8. Data lifecycle at scale

- **Partition + archive** the append-only tables (§7.3); keep hot partitions lean.
- **Outbox pruning:** published events older than the retention window are archived/deleted; the unpublished partial index stays tiny.
- **Idempotency TTL:** keys expire per command class (e.g. 24–72h for submits/decisions, longer for payments) — bounded table growth, still safe against realistic retries.
- **Retention/deletion jobs** for rejected proposals, expired invitations, review drafts, and identity evidence per the (owner-approved) policy — audit is retained separately and never deleted by these jobs.

## 9. Evolvability — change without downtime

- **Expand/contract migrations:** add nullable/new structures → backfill → switch reads → drop old, in separate deploys. Never a breaking column change in one step.
- **Versioned API** (`/api/v1`) + generated clients; additive fields don't bump the version.
- **Feature flags** gate new behaviour and enable instant rollback without a redeploy.
- **Immutability preserved across change:** locked versions and `audit_event` are never migrated destructively; corrections are new versions/events.
- **Module boundaries** (zero import cycles today — keep it) make later extraction mechanical.

## 10. Architecture fitness functions (CI gates that keep it solid)

The foundation stays solid only if the invariants are **enforced automatically**, not by memory:

- **No import cycles** / dependency-direction test (already green — make it a gate).
- **Tenant + grant isolation test:** cross-tenant ID swap → `404`; granted counterpart → allowed; revoked grant → `404`.
- **"No confidential field in any public projection"** snapshot test.
- **"Every mutation emits an `audit_event` + `outbox_event` in the same tx"** integration test.
- **"No money as float"** lint (only `amount_minor bigint + currency`).
- **Immutability test:** UPDATE of a locked version / `audit_event` is rejected.
- **Contract tests** per endpoint ([60 §9](60_API_CONTRACT.md)) against the client-engine oracles.
- **Restore + reconciliation drill** in CI/staging (not just documented).

## 11. Foundation scope — build now vs defer

To keep the foundation lean (AI and later stages parked):

**Build in Phase 1 (the load-bearing foundation):** OIDC identity + session revocation · tenant/workspace/membership/role model · the `access_grant` collaboration model (§3) · the unified `decide()` authz engine · PostgreSQL schema for identity/tenancy/challenge/proposal/review + the cross-cutting tables (idempotency, outbox, audit, file_object, notification_delivery) · idempotency + optimistic concurrency + receipts + correlation · transactional outbox + append-only audit · private object storage + scan pipeline · observability skeleton + edge hardening · CI with the §10 fitness functions.

**Defer (not foundational — later slices/features):** payment provider + ledger + reconciliation (Slice 2) · e-signature (Slice 2) · dispute workflow (Slice 2) · search beyond Postgres FTS · **all AI/vector work** ([45](45_AI_AND_MATCHING.md)) · dedicated queue/vector/search clusters · multi-region.

> One cheap forward-compatibility hook: create the `outbox_event` contract and emit events from Phase-1 commands even for consumers that don't exist yet. Turning on notifications, search, or (later) embeddings becomes "deploy a consumer," never a schema migration.

## 12. Verdict

The foundation is **solid, robust, and correctly sized for this use case** — after applying the §3 cross-tenant collaboration model, which was the one genuine correctness gap. Consistency, concurrency, and resilience are now explicit contracts rather than assumptions; scalability is a short, evidence-gated, bottleneck-ordered path with no premature infrastructure; and §10 turns the invariants into CI gates so the foundation does not erode as the team builds on it. It is ready to build as Phase 1.
