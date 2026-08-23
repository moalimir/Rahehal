# Security & Authorization

The prototype's biggest lie is that it _looks_ secure: deny-by-default helpers, publication gates, COI gates, payment prerequisites — all enforced in the browser, all bypassable (M-01). This document defines the server-side authority that replaces them. It unifies the three client permission engines (X-05) into one decision model and keeps them as the **test oracle**.

---

## 1. Threat model (top risks → controls)

| Threat                                                                                   | Prototype exposure                                    | Control                                                                                                          |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Horizontal access** (read/write another workspace's records by swapping IDs)           | Browser is authority; any ID works                    | Scope every query by `(tenant, workspace)` _before_ record permissions; RLS backstop; non-enumerating `404` (§3) |
| **Vertical escalation** (viewer/contributor performs owner/admin action)                 | Client role checks only                               | Server deny-by-default engine (§2); exhaustive role tests                                                        |
| **Confidential leakage** (reviewer/guest sees protected fields/files)                    | Public pages render private data; COI in localStorage | Separate public projection; field/file classification; COI server-gated (§4)                                     |
| **Stale authority** (removed member/expired session still acts)                          | 8-hour local TTL, no revocation                       | Short-lived tokens + revocation; membership state checked per request                                            |
| **Duplicate/replay** (double submit, double pay, callback replay)                        | Mock idempotency in mutable storage                   | Server idempotency keys; authenticated, replay-safe provider callbacks; reconciliation                           |
| **Separation-of-duty bypass** (one actor approves all gates / pays their own acceptance) | Single-actor gates                                    | Distinct-actor constraints on approvals & payment (§6)                                                           |
| **File-borne malware / unscanned evidence**                                              | Client type check only                                | Quarantine + scan before availability; signed reads (§4, 60 §8)                                                  |
| **Audit tampering** (edit history to hide an action)                                     | Mutable `auditEvents` array                           | Append-only sink, no UPDATE/DELETE grants, WORM export (§7)                                                      |

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
2. **Reach** — the subject reaches the record via _(a)_ the same active tenant, _(b)_ an active `access_grant` linking their active workspace to the record's collaboration (cross-tenant open-innovation sharing — [42 §3](42_FOUNDATION_HARDENING.md)), or _(c)_ a public projection → else `NOT_FOUND` (non-enumerating). Pure `tenant_id ==` isolation would deny the core org↔solver flow.
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
- Test suite must cover: horizontal access, vertical escalation, stale membership, cross-workspace IDs, guessed IDs, bulk endpoints, and **grant lifecycle** (granted counterpart allowed; revoked/expired/absent grant → `404`).

## 4. Permission matrix (MVP slice)

Canonical roles (20 §3). ✔ = allowed; ✔* = allowed with step-up + reason; — = denied. `team:*`rows follow`decideTeamPermission` (`solver/permissions.ts`) exactly.

| Action (command)             | org:owner/member | org:approver\_\* | org:publisher | team:owner/admin            | team:proposal-manager | team:contributor | team:viewer | platform:reviewer | platform:ops             | platform:finance | platform:legal |
| ---------------------------- | ---------------- | ---------------- | ------------- | --------------------------- | --------------------- | ---------------- | ----------- | ----------------- | ------------------------ | ---------------- | -------------- |
| `challenge:create/edit`      | ✔               | —                | —             | —                           | —                     | —                | —           | —                 | —                        | —                | —              |
| `challenge/approvals:record` | —                | ✔ (own gate)    | —             | —                           | —                     | —                | —           | —                 | ✔ (quality)             | ✔ (finance)     | ✔ (legal)     |
| `challenge:publish`          | —                | —                | ✔\*          | —                           | —                     | —                | —           | —                 | ✔\*                     | —                | —              |
| `proposal:create/edit`       | —                | —                | —             | ✔                          | ✔                    | ✔ (if assigned) | —           | —                 | —                        | —                | —              |
| `proposal:submit`            | —                | —                | —             | ✔ (owner; admin if policy) | ✔ (if policy)        | —                | —           | —                 | —                        | —                | —              |
| `proposal:view-payments`     | —                | —                | —             | ✔ (if policy)              | ✔ (if policy)        | —                | —           | —                 | —                        | —                | —              |
| `assignment/coi:declare`     | —                | —                | —             | —                           | —                     | —                | —           | ✔                | —                        | —                | —              |
| `assignment/materials:view`  | —                | —                | —             | —                           | —                     | —                | —           | ✔ (coi clear)    | ✔ (no proposal content) | —                | —              |
| `review:submit`              | —                | —                | —             | —                           | —                     | —                | —           | ✔ (coi clear)    | —                        | —                | —              |
| `review:invalidate`          | —                | —                | —             | —                           | —                     | —                | —           | —                 | ✔\*                     | —                | —              |
| `decision:record`            | ✔\*             | —                | —             | —                           | —                     | —                | —           | —                 | —                        | —                | —              |
| `payment:approve`            | —                | —                | —             | —                           | —                     | —                | —           | —                 | ✔\* (hold)              | ✔\*             | —              |
| `contract:approve`           | ✔               | —                | —             | ✔ (admin)                  | —                     | —                | —           | —                 | —                        | —                | ✔             |
| `access:manage`              | ✔\*             | —                | —             | ✔ (roles)                  | —                     | —                | —           | —                 | ✔\*                     | —                | —              |

Team-role nuance (kept verbatim from `decideTeamPermission`): `viewer` cannot create proposals; `contributor` edits only assigned proposals; `proposal-manager`/`admin` submit only if `policy.*CanSubmit`; owner/last-manager cannot be removed without transfer (`canRemoveMembership`).

## 5. Client engines as the authz oracle

Do **not** discard the prototype's permission code — promote it:

- `decideTeamPermission` (`solver/permissions.ts:31`) → generate `team:*` matrix rows and their negative tests. Its human-readable Persian denial reasons become the API's `NO_ACCESS` messages.
- `canPerform` (`product.ts:50`) → seed `org:*`/`platform:*` capability tests (extended with the new sub-roles).
- `evaluateEligibility` (`eligibility.ts:117`) → the reference implementation for the server eligibility endpoint; port it, version the rules, add overrides + audit.
- `canAccessReviewMaterials` (`reviews/access.ts:17`) → the COI gate predicate, now server-side over `coi_declaration`.

Contract tests assert server `decide()` agrees with these oracles for every `(role, action, state)` combination.

## 6. Separation of duties (explicit constraints)

- The three publication approvals (`technical`, `legal`, `finance`) must be recorded by **distinct actors**; the ops `quality` gate is a fourth distinct actor. (`challenge_approval` unique per `(version, gate)`; app rule bans same `actor_user_id` across the required gates.)
- Payment: `finance_approved_by` must differ from the actor who recorded `technical_accepted_at`; neither may be the contract owner. Enforced in `payment` command + DB check.
- Review invalidation is ops-only and cannot be performed by the assigned reviewer or the deciding org member.
- Support/privileged access is consented, time-bounded, least-privileged, session-recorded, and audited (`privileged_access_grant`).

## 7. Audit, privacy & data governance

- **Audit** (50 §8): append-only, correlated, queryable by entity/correlation/actor, exportable under policy, independent of app admins (INSERT+SELECT grants only; WORM export). Corrections are new events, never edits.
- **Data classification** (D-07): `public / internal / confidential / highly_sensitive` on every field/file; classification changes are audited and role-restricted.
- **Privacy**: data map, legal basis, consent, residency (in-region pilot), retention + deletion jobs, subject access/export/erasure, breach notification — before pilot (NFR-PRV-001). Rejected proposals, expired invitations, review drafts, and identity evidence get explicit retention rules (open question, [95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md) §5).
- **NDA semantics (D-05, default)**: accepting an NDA **satisfies one prerequisite** for an explicit access grant; it does not auto-open files. NDA scope/version/jurisdiction/duration/identity are bound in `nda_acceptance`.
- **AI/matching**: whether confidential text may reach external model providers is an open decision ([95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md) §5) — default deny until approved; matching explanations are versioned and monitored for bias.

## 8. Web & platform hardening (OWASP-aligned, NFR-SEC-002)

Input validation + output encoding (server-side, not only `lib/validation/*`); CSRF/session protection; rate limiting + abuse controls; secure headers + CSP at the edge; secret management; dependency + container scanning in CI; tenant-isolation tests as a required gate. External penetration test + threat-model review before pilot (Phase 6).

## 9. Security exit gates (per phase — see [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md))

- **Phase 1**: cross-tenant/wrong-role denied at API _and_ UI; session expiry/revocation and membership removal immediately deny; duplicate/stale commands safe; uploaded content inaccessible until scanned; DB restore + audit-correlation exercise passes.
- **Phase 4 (MVP)**: COI-positive/pending reviewers get nothing at API/object/export/cache/UI layers; reviews immutable except via audited invalidation; decisions cite exact versions + authorized actor + reason.
- **Phase 5**: no payment without effective contract + technical acceptance + finance approval; provider callbacks/retries create no duplicate financial effect; reconciliation automated with owned exception queues.
- **Phase 6**: no unresolved critical/high security, privacy, legal finding; recovery objectives tested, not just documented.
