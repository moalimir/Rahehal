# Security & Authorization

The broader prototype's biggest lie is that it _looks_ secure: deny-by-default helpers, publication gates, COI gates, payment prerequisites — still enforced in the browser and bypassable (M-01). A1c establishes one narrow PostgreSQL-authoritative challenge-draft exception, while the web and broader workflows remain demo-only. This document defines the server-side authority that replaces the remaining browser rules. It unifies the three client permission engines (X-05) into one decision model and keeps them as the **test oracle**.

> **Current executable proof (2026-09-03):** Phase 1 supplies principal-bound digest-only sessions, membership/workspace revalidation inside transaction scope, local authorization-code + S256-PKCE OIDC, and scoped immutable challenge drafts. Phase 2 adds distinct-actor publication gates with rejected-version rework, atomic publish/public projection, reasoned live-call controls, a purpose- and gate-scoped platform work queue/brief including ops triage, and projection/aggregate synchronization through migration `0012`. C1 adds durable solver facts and server eligibility; C2 adds the server team decision matrix and PostgreSQL-backed policy, invitation/request, membership, transfer, and archive commands through migration `0015`; C3 now activates private proposal draft create/read/save over the `0013` aggregate/version foundation. Native unit/contract/API tests pass. The owner subsequently exercised C2 in Docker and returned the denial-audit/membership-trigger refinements now present on the Phase-3 branch; C3's PostgreSQL adapter suite is authored for the same owner-run Docker review and is not claimed as executed in this change. The managed production IdP, MFA/step-up, RLS, separate database roles, rate limits, operated outbox delivery, private files, and authoritative worker remain pre-pilot/later roadmap gates.

---

## 1. Threat model (top risks → controls)

| Threat                                                                                   | Prototype exposure                                                                                                                                                               | Control                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Horizontal access** (read/write another workspace's records by swapping IDs)           | Browser is authority; any ID works                                                                                                                                               | Scope every query by `(tenant, workspace)` _before_ record permissions; RLS backstop; non-enumerating `404` (§3) |
| **Vertical escalation** (viewer/contributor performs owner/admin action)                 | Client role checks only                                                                                                                                                          | Server deny-by-default engine (§2); exhaustive role tests                                                        |
| **Confidential leakage** (reviewer/guest sees protected fields/files)                    | Public discovery now crosses an allowlisted `OpportunityView` port, but its demo adapter still derives that projection from a private browser store; COI remains in localStorage | Physically separate production public projection; field/file classification; COI server-gated (§4)               |
| **Stale authority** (removed member/expired session still acts)                          | 8-hour local TTL, no revocation                                                                                                                                                  | Short-lived tokens + revocation; membership state checked per request                                            |
| **Duplicate/replay** (double submit, double pay, callback replay)                        | Mock idempotency in mutable storage                                                                                                                                              | Server idempotency keys; authenticated, replay-safe provider callbacks; reconciliation                           |
| **Separation-of-duty bypass** (one actor approves all gates / pays their own acceptance) | Single-actor gates                                                                                                                                                               | Distinct-actor constraints on approvals & payment (§6)                                                           |
| **File-borne malware / unscanned evidence**                                              | Client type check only                                                                                                                                                           | Quarantine + scan before availability; signed reads (§4, 60 §8)                                                  |
| **Audit tampering** (edit history to hide an action)                                     | Mutable `auditEvents` array                                                                                                                                                      | Append-only sink, no UPDATE/DELETE grants, WORM export (§7)                                                      |

## 2. The one authorization decision (D5)

A single server-side function replaces `canPerform`, `decideTeamPermission`, and `canAccessReviewMaterials`. **Deny by default**: a missing tenant, membership, role, assignment, or policy is a denial.

```
decide(request) -> Allow | Deny(reason, code)

request = {
  subject:        user identity (from validated token)
  tenant:         active tenant
  workspace:      active workspace (validated vs membership)
  memberships:    subject's active roles in this workspace/tenant  (platform:* / org:* / team:*)
  grants:         active access_grants for the subject's workspace (cross-tenant reach, 42 §3)
  action:         canonical command (e.g. 'challenge:publish', 'review:submit')
  target:         { type, id, tenant_id, workspace_id, state, classification }
  assignment?:    review assignment linkage (for reviewer actions)
  coi_status?:    pending | clear | conflict
  step_up_fresh?: boolean
}
```

**Evaluation order (fail closed at each step):**

1. **Authn** — valid, unexpired token → else `NO_ACCESS`.
2. **Reach** — the subject reaches the record via _(a)_ the same active tenant, _(b)_ an active `access_grant` linking their active workspace to the record's collaboration (cross-tenant open-innovation sharing — [42 §3](42_FOUNDATION_HARDENING.md)), _(c)_ a public projection, or _(d)_ standing platform-role authority over one fixed, named action (not general reach — [25 ADR-0015](25_DECISIONS.md): list own triage/gate work, read its purpose-scoped brief, advance an ops triage item, or record one's own publication gate) → else `NOT_FOUND` (non-enumerating). Pure `tenant_id ==` isolation would deny the core org↔solver flow.
3. **Membership** — an _active_ membership exists → else `NO_ACCESS`.
4. **Role capability** — some held role grants `action` → else `NO_ACCESS`.
5. **State** — `action` is legal from `target.state` (state machine) → else `INVALID_STATE`.
6. **Assignment/COI** — reviewer material/scoring actions require an active assignment and `coi_status == clear` → else `NO_ACCESS`.
7. **Separation of duty** — distinct-actor rules (§6) hold → else `NO_ACCESS`.
8. **Step-up** — sensitive actions require `step_up_fresh` → else `STEP_UP_REQUIRED (403)`.
9. **Classification** — field/document access checked independently from page access.

Every decision (allow _and_ deny) emits an `audit_event` with `outcome ∈ {success, denied}` and `correlation_id` — no sensitive content logged.

## 3. Query scoping rules (defense in depth)

- Never authorize from route prefix alone (a `/app/org/…` URL proves nothing).
- Every repository read is scoped to records the subject **owns** (`tenant_id = $active_tenant`) **or holds an active `access_grant` for** (shared collaboration records, [42 §3](42_FOUNDATION_HARDENING.md)), then applies record permissions.
- PostgreSQL RLS enforces the tenant-**or-grant** predicate as a backstop ([50 §2](50_DATA_MODEL.md)).
- Public projection tables are physically separate from private aggregates (60 §6).
- Protected records return non-enumerating `404` to non-members (hidden == denied, indistinguishable).
- The full organization `ChallengeResource` is same-workspace only. Platform publication roles receive a separate SQL-projected brief with a closed content allowlist per triage purpose or approval gate; it excludes contact/invite/file identifiers and replaces other actors' user ids with only the current actor's separation-of-duty boolean.
- The platform work queue requires an active platform workspace, returns only ops triage or the active role's gate, excludes completed/self-recorded versions, and is bounded. It is not a general cross-tenant challenge catalogue; an ops triage brief disappears immediately after `:advance-formulation`.
- Test suite must cover: horizontal access, vertical escalation, stale membership, cross-workspace IDs, guessed IDs, bulk endpoints, and **grant lifecycle** (granted counterpart allowed; revoked/expired/absent grant → `404`).

## 4. Permission matrix (MVP slice)

Canonical roles (20 §3). ✔ = allowed; ✔* = allowed with step-up + reason; — = denied. `team:*`rows follow`decideTeamPermission` (`packages/domain/src/team.ts`) exactly.

**`challenge:publish` vs `challenge:publish-override`.** These were one row until 2026-08-29, which conflated two different operations and misread as "`platform:ops` may publish an org's challenge". They are separate:

- **`challenge:publish`** — the routine `approvals → published` transition with all four gates recorded as `approved`. `org:publisher` only, matching [20 §8](20_CANONICAL_MODEL.md)'s stage table and the executable `challengeTransitions`. No step-up and no separate reason: the four gate reasons already carry the justification, and a mandatory free-text field on a routine action dilutes the audit trail rather than enriching it. **Implemented (B4).**
- **`challenge:publish-override`** — publishing when readiness or the gates are _not_ satisfied ([95 §2](95_RISKS_AND_OPEN_QUESTIONS.md): "Only `org:publisher` + `platform:ops` may override (recorded, reasoned)"). Step-up **and** a structured reason are required here, because the actor is asserting something no gate attests. `platform:ops` appears only on this row — it co-signs an override, it never publishes in an organization's place. **Not implemented and not part of the completed MVP Phase 2; schedule only after DEC-2026-012 is resolved.**

One question is still open on the override and belongs to the owner: whether `org:publisher` **+** `platform:ops` means a joint co-signature or each role overriding within its own lane (the org owns brief quality, ops owns the publication-quality gate). Do not implement the override until that is decided — see [25 DEC-2026-012](25_DECISIONS.md).

| Action (command)                | org:owner/member | org:approver\_\* | org:publisher | team:owner/admin            | team:proposal-manager | team:contributor | team:viewer | platform:reviewer | platform:ops             | platform:finance | platform:legal |
| ------------------------------- | ---------------- | ---------------- | ------------- | --------------------------- | --------------------- | ---------------- | ----------- | ----------------- | ------------------------ | ---------------- | -------------- |
| `challenge:create/edit`         | ✔               | —                | —             | —                           | —                     | —                | —           | —                 | —                        | —                | —              |
| `challenge:advance-formulation` | ✔               | —                | —             | —                           | —                     | —                | —           | —                 | ✔ (triage only)         | —                | —              |
| `challenge/approvals:record`    | —                | ✔ (own gate)    | —             | —                           | —                     | —                | —           | —                 | ✔ (quality)             | ✔ (finance)     | ✔ (legal)     |
| `challenge:publish`             | —                | —                | ✔            | —                           | —                     | —                | —           | —                 | —                        | —                | —              |
| `challenge:publish-override`    | —                | —                | ✔\*          | —                           | —                     | —                | —           | —                 | ✔\*                     | —                | —              |
| `proposal:create/edit`          | —                | —                | —             | ✔                          | ✔                    | ✔ (if assigned) | —           | —                 | —                        | —                | —              |
| `proposal:submit`               | —                | —                | —             | ✔ (owner; admin if policy) | ✔ (if policy)        | —                | —           | —                 | —                        | —                | —              |
| `proposal:view-payments`        | —                | —                | —             | ✔ (if policy)              | ✔ (if policy)        | —                | —           | —                 | —                        | —                | —              |
| `assignment/coi:declare`        | —                | —                | —             | —                           | —                     | —                | —           | ✔                | —                        | —                | —              |
| `assignment/materials:view`     | —                | —                | —             | —                           | —                     | —                | —           | ✔ (coi clear)    | ✔ (no proposal content) | —                | —              |
| `review:submit`                 | —                | —                | —             | —                           | —                     | —                | —           | ✔ (coi clear)    | —                        | —                | —              |
| `review:invalidate`             | —                | —                | —             | —                           | —                     | —                | —           | —                 | ✔\*                     | —                | —              |
| `decision:record`               | ✔\*             | —                | —             | —                           | —                     | —                | —           | —                 | —                        | —                | —              |
| `payment:approve`               | —                | —                | —             | —                           | —                     | —                | —           | —                 | ✔\* (hold)              | ✔\*             | —              |
| `contract:approve`              | ✔               | —                | —             | ✔ (admin)                  | —                     | —                | —           | —                 | —                        | —                | ✔             |
| `access:manage`                 | ✔\*             | —                | —             | ✔ (roles)                  | —                     | —                | —           | —                 | ✔\*                     | —                | —              |

Team-role nuance (kept verbatim from `decideTeamPermission`): `team:viewer` cannot create proposals; `team:contributor` edits only assigned proposals; `team:proposal-manager`/`team:admin` submit only if `policy.*CanSubmit`; owner/last-manager cannot be removed without transfer (`canRemoveTeamMembership`).

## 5. Client engines as the authz oracle

Do **not** discard the prototype's permission code — promote it:

- `decideTeamPermission` (`packages/domain/src/team.ts`) → the shared C2 decision matrix and exhaustive `team:*` role/action tests. Human-readable Persian reasons remain presentation-safe detail; API authorization still returns stable `NO_ACCESS`/non-enumerating `NOT_FOUND` codes.
- `canPerform` (`product.ts:50`) → seed `org:*`/`platform:*` capability tests (extended with the new sub-roles).
- `evaluateEligibility` (`eligibility.ts:117`) → the prototype reference. C1's authoritative evaluator now reads the exact published `eligibility_rule`, the aggregate's live state/deadline, and active-workspace facts on the server; no browser result or unversioned profile field can broaden eligibility. Policy overrides remain future governed work.
- `canAccessReviewMaterials` (`reviews/access.ts:17`) → the COI gate predicate, now server-side over `coi_declaration`.

Contract tests assert server `decide()` agrees with these oracles for every `(role, action, state)` combination.

C1 protected reads and writes are scoped through `runAuthorizedWorkspace`, which revalidates the current session, active workspace and membership inside the same PostgreSQL unit of work. C2 additionally permits a proposal manager to edit team profile facts only when the server-loaded team policy allows it; verification start and exact-version eligibility acknowledgements remain limited to the individual, team owner, or team admin. Solver mutations carry expected version plus idempotency and atomically write receipt/audit/outbox evidence. Eligibility reach is projection-backed while live availability is read from the private aggregate; unknown, unpublished, NDA-only/out-of-reach and cross-workspace targets fail as the same `NOT_FOUND`. Verified OIDC contact is never accepted as verified workspace status, and the solver-facing verification command can create only a draft request.

C2 manager-side queries begin with the active `(tenant, team workspace)` scope and current membership, then apply `decideTeamPermission`; guessed invitation/request/member IDs are resolved only inside that scope. Incoming invitations bind to the authenticated user's verified primary email or stored recipient ID, and request response/withdrawal binds to the stored requester. Removal and suspension preserve the membership row and immediately fail future `activeAccess`; archive is terminal and makes every team membership unusable for authority. Manager-count changes lock the team row before memberships, ownership transfer updates both roles plus `workspace.owner_user_id` atomically, and deferred database constraints require exactly one matching active owner at commit. Invitation, request, membership, and archived-team evidence is delete-protected and terminal transitions are immutable. Audit metadata retains structured reasons while outbox payloads exclude those reasons and contact addresses.

C3 proposal reads predicate on the active solver `(tenant_id, workspace_id)` before the proposal ID; version-history reads repeat that owning-scope predicate rather than trusting the parent ID. A team actor is then checked against the current active membership, durable team policy, and proposal assignment through `decideTeamPermission`; viewers and unassigned contributors receive the same `NOT_FOUND` as foreign or unknown proposal IDs. Draft creation also begins from the separate public projection and requires both projection and private aggregate to be published, open, and unexpired under server time. Current authority is checked before idempotent replay, so a demoted or removed actor cannot reuse an earlier successful key.

C3 writes use expected-version and tenant-scoped idempotency locks inside the existing PostgreSQL unit of work. Create and save commit the aggregate pointer, append-only unlocked version, receipt, audit, metadata-only outbox event, and cached response together; create additionally serializes the one-active-proposal natural key, while save row-locks the aggregate. Outbox and audit metadata contain stable IDs/version numbers only. Syntactically valid `fil_*` values are metadata references, not proof of ownership, upload, scan, or read access; no C3 endpoint serves file content.

No C2 route fabricates step-up. The current matrix does not mark routine team administration as `✔*`; managed MFA/step-up remains G1/pre-pilot work. If owner policy later classifies transfer/archive as step-up actions, that change requires the approved IdP freshness contract rather than accepting the present optional `step_up_token` field as proof.

## 6. Separation of duties (explicit constraints)

- The three publication approvals (`technical`, `legal`, `finance`) must be recorded by **distinct actors**; the ops `quality` gate is a fourth distinct actor. (`challenge_approval` unique per `(version, gate)`; app rule bans same `actor_user_id` across the required gates.)
- Payment: `finance_approved_by` must differ from the actor who recorded `technical_accepted_at`; neither may be the contract owner. Enforced in `payment` command + DB check.
- Review invalidation is ops-only and cannot be performed by the assigned reviewer or the deciding org member.
- Support/privileged access is consented, time-bounded, least-privileged, session-recorded, and audited (`privileged_access_grant`).

## 7. Audit, privacy & data governance

- **Audit** (50 §8): append-only, correlated, queryable by entity/correlation/actor, exportable under policy, independent of app admins (INSERT+SELECT grants only; WORM export). Corrections are new events, never edits.
- **Data classification** (D-07): `public / internal / confidential / highly_sensitive` on every field/file; classification changes are audited and role-restricted. The owner accepted this as the pilot policy default in [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md); qualified legal/privacy confirmation of retention, key ownership, and the tier matrix remains mandatory before real data.
- **Privacy**: data map, legal basis, consent, residency (in-region pilot), retention + deletion jobs, subject access/export/erasure, breach notification — before pilot (NFR-PRV-001). Rejected proposals, expired invitations, review drafts, and identity evidence get explicit retention rules (open question, [95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md) §5).
- **NDA semantics (D-05, default)**: accepting an NDA **satisfies one prerequisite** for an explicit access grant; it does not auto-open files. NDA scope/version/jurisdiction/duration/identity are bound in `nda_acceptance`.
- **AI/matching**: whether confidential text may reach external model providers is an open decision ([95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md) §5) — default deny until approved; matching explanations are versioned and monitored for bias.

## 8. Web & platform hardening (OWASP-aligned, NFR-SEC-002)

Input validation + output encoding (server-side, not only `lib/validation/*`); CSRF/session protection; rate limiting + abuse controls; secure headers + CSP at the edge; secret management; dependency + container scanning in CI; tenant-isolation tests as a required gate. External penetration test + threat-model review before pilot (Phase 6).

## 9. Security exit gates (per phase — see [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md))

- **Foundation & pre-pilot hardening gate** (roadmap [80](80_DELIVERY_ROADMAP.md) §9): cross-tenant/wrong-role denied at API _and_ UI (foundation); session expiry/revocation and membership removal immediately deny, uploaded content inaccessible until scanned, DB restore + audit-correlation exercise passes (hardening gate); duplicate/stale commands safe.
- **Phase 4 (MVP)**: COI-positive/pending reviewers get nothing at API/object/export/cache/UI layers; reviews immutable except via audited invalidation; decisions cite exact versions + authorized actor + reason.
- **Phase 5**: no payment without effective contract + technical acceptance + finance approval; provider callbacks/retries create no duplicate financial effect; reconciliation automated with owned exception queues.
- **Phase 6**: no unresolved critical/high security, privacy, legal finding; recovery objectives tested, not just documented.
