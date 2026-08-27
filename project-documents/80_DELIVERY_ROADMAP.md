# Delivery Roadmap

**Revised 2026-08-27 — pragmatic, MVP-first.** Earlier this plan front-loaded full production hardening (managed-OIDC+MFA, RLS, malware scanning, durable outbox/DLQ, observability, DR drills, pen test) before the product journey worked end-to-end. That is backwards for reaching a usable MVP. This version **builds the journey on minimal-but-real infrastructure first, then hardens before real users/data touch a server.** The hardening is not dropped — it is re-sequenced into one clearly-owned gate (Phase C) and detailed in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

This document owns delivery order, milestone dependencies, and acceptance gates. [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md) owns Phase-0 evidence; [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md) maps requirements to milestones; [25_DECISIONS](25_DECISIONS.md) owns decisions; [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md) owns owner sign-offs.

---

## 1. Target outcome

The MVP proves one governed journey, working locally on real persistence:

> An organization creates and publishes a challenge → an eligible solver submits an **immutable** proposal version → a COI-cleared reviewer scores that exact version → the organization records a reasoned decision → every sensitive action is authorized **server-side**, versioned, and audited.

That is the whole MVP. Contract, pilot, payment, and a real external pilot come after.

## 2. How we sequence (the pragmatic split)

We deliberately separate **load-bearing architecture** (do now — cheap now, a rewrite to retrofit) from **production hardening** (do at the server/pilot gate). This is an owner-accepted risk decision for a **local build with synthetic data and no real users**; the hardening gate (Phase C) re-enters before any real org or confidential data is exposed.

| Keep now (mostly already built in `apps/api`)                      | Defer to Phase C (before real users on a server)                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Server-side deny-by-default authorization                          | MFA, step-up freshness, session rotation families, KYB/verification workflow   |
| Tenant/workspace scoping + `access_grant` (data-model correctness) | PostgreSQL RLS as defense-in-depth (app-scoping is enough locally)             |
| Real PostgreSQL persistence                                        | File malware scanning + quarantine (start: private storage + type/size checks) |
| Immutable submitted versions + a basic audit table                 | WORM audit export; durable outbox with poison-isolation/DLQ sophistication     |
| Idempotency keys + optimistic `expected_version` (already present) | Observability stack (SLOs, traces, error budgets), WAF, CSP, rate limiting     |
| One **simple** real login (no MFA/KYB/step-up)                     | Backup/restore/DR drills, measured RTO/RPO                                     |
| Non-enumerating `NOT_FOUND` for protected records                  | External pen test, PIA, WCAG 2.2 AA audit, qualified legal/privacy review      |

**Why the left column stays even in an MVP:** these are the _shape of the app_, not security polish. Skipping server authority or tenant scoping now means building a throwaway and re-touching every table, query, and screen later. Everything on the right is genuinely additive and can be layered on without redesign.

### Status vocabulary

`not-started` · `ready` · `in-progress` · `verification` (built; evidence/review pending) · `done` (built + tested + owner-accepted where required).

### Supersedes the earlier F-numbered milestones

This plan replaces the old `P1-F1…F10 / P2-C / P3-S / P4-R / P5-E / P6-L` numbering. Other docs may still cite the old IDs; map them as:

| Old                                               | Now                                             |
| ------------------------------------------------- | ----------------------------------------------- |
| P1-F1 (canonical foundation)                      | done (Phase 0)                                  |
| P1-F2 local Docker · external environments/IaC    | done · **Phase C**                              |
| P1-F3 simple login · MFA/rotation/KYB             | **A2** · **Phase C**                            |
| P1-F4 migrations/app-scoping · RLS                | **A1** · **Phase C**                            |
| P1-F5/F6 idempotency/audit/outbox core · WORM/DLQ | **A/B** · **Phase C**                           |
| P1-F7 private files · malware scan                | when files land · **Phase C**                   |
| P1-F8 web composition                             | **A3**                                          |
| P1-F9/F10 observability/recovery/certification    | **Phase C**                                     |
| P2-C / P3-S / P4-R (challenge/proposal/review)    | compressed into **Phase B** (B1–B5)             |
| P5-E execution/payment                            | **Phase D**                                     |
| P6-L pilot assurance                              | assurance in **Phase C**, cohort in **Phase E** |

([90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md)'s milestone column still uses the old IDs; remap it in a follow-up — it does not block delivery.)

## 3. Phase 0 — baseline (essentially closed)

Engineering decisions, the repo baseline, canonical convergence, the in-memory API/worker boundary proof, the local Docker stack, and DEC-2026-010/011 owner sign-off are done ([82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md), [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md)). The remaining Phase-0 items are **not MVP blockers** and run in parallel: visual Golden Master (`test:visual`), first clean Linux CI run, and placeholder/brand/asset/legal sign-offs before any external distribution.

## 4. Phase A — lean local foundation

**Goal:** make the boundary real — one login, one database, the web talking to the API — so the MVP journey has something authoritative to run on. Reuse the ports and in-memory logic already in `apps/api`/`apps/worker`; swap the storage, not the design.

**Owner:** Backend + Platform · **Review:** Security, Frontend

| Milestone | Deliverable                                                                                                                                                                                                                            | Status  | Acceptance                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| **A1**    | PostgreSQL adapters behind the existing application ports (identity, workspace, challenge, audit); one first migration for user/tenant/workspace/membership/`access_grant`/challenge+version/audit/idempotency.                        | `ready` | up migration applies to local Postgres; existing API tests pass against the Postgres adapter, not just in-memory |
| **A2**    | One **simple** real login: session cookie/token, server-validated, revocable. No MFA, KYB, step-up, or rotation families yet. (A local dev IdP or a minimal credential store is fine; the OIDC surface is provider-neutral for later.) | `ready` | sign-in issues a real session; sign-out/expiry denies protected calls; no browser claim is trusted as authority  |
| **A3**    | Wire the web to the real API: production challenge gateway composition; `/me` + active-workspace switch; typed error/conflict states. Keep the offline/static export as a demo artifact.                                               | `ready` | a real browser does sign-in → active workspace → challenge create/read/save through the API and Postgres         |

**Phase gate (foundation is real):** a person signs in, creates a challenge, it persists in Postgres, and reloading shows it — with the server (not the browser) enforcing who may do what. Idempotent commands + `expected_version` conflicts already hold (kept from the in-memory design).

## 5. Phase B — the MVP vertical slice

**Goal:** build the actual product journey on the Phase-A foundation. This is the MVP.

**Owner:** Backend + Frontend + Product · **Review:** Security (design only, not a full hardening pass yet)

| Milestone | Deliverable                                                                                                                                                                                                                                               | Acceptance                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **B1**    | Challenge lifecycle to `published`: draft → (lightweight) approve → publish an **immutable** version + a public projection. Keep approvals simple (a single publish action with an audit row is fine for MVP; multi-party separation-of-duty is Phase C). | published version is immutable; public projection contains only allowlisted fields; unknown/unpublished IDs fail safely              |
| **B2**    | Solver eligibility + proposal draft in a workspace, then **submit → one immutable proposal version** with a receipt.                                                                                                                                      | duplicate submit → one version + one receipt; submitted content cannot be edited; revisions make a new version with an explicit base |
| **B3**    | Reviewer assignment + **COI declaration gate** + rubric scoring → submit an immutable review. COI stays server-enforced (it's core to the product); the enforcement can be simple (an assignment can't reach materials until `coi_status = clear`).       | a pending/conflict reviewer gets nothing; a submitted review can't be silently edited                                                |
| **B4**    | Organization records a **reasoned decision** citing the exact proposal + review versions; all parties see durable status; the full chain is auditable.                                                                                                    | decision cites exact versions + an authorized actor + a reason; challenge→proposal→review→decision is traceable in the audit table   |
| **B5**    | The journey works end-to-end in a real browser, locally, with roles enforced server-side and data in Postgres.                                                                                                                                            | one person can drive org + solver + reviewer through the whole journey; cross-workspace/cross-tenant ID swaps are denied             |

**MVP is complete at the end of Phase B.** It runs locally, persists, enforces roles server-side, and keeps submissions immutable and audited — enough to demo to friendly users and validate the product with synthetic data.

## 6. Phase C — harden for real users (the server-deploy gate)

**Goal:** everything the MVP deliberately deferred, done **before any real organization or confidential data is exposed on a server.** Detail lives in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md); this phase is the trigger, not a redesign.

**Owner:** Platform + Security · **Review:** Backend, Frontend, Privacy, Operations

- **Identity hardening:** managed in-region OIDC provider, MFA/step-up for sensitive actions, session rotation/revocation families, abuse/rate controls, KYB/verification workflow.
- **Data defense-in-depth:** PostgreSQL RLS behind the app-scoping already in place; multi-party publication approvals (separation of duty); the three-gate payment rule when payments arrive.
- **Files:** private object storage with quarantine + malware scan + signed authorized reads (MVP may start with private storage + type/size validation only).
- **Durability & audit:** durable outbox with poison-isolation/DLQ, append-only WORM audit export, correlation search.
- **Ops & edge:** structured logs/metrics/traces, Web Vitals, SLOs/error budgets, CSP/security headers, WAF, secret + dependency + container scanning, tenant-isolation CI gates.
- **Environments & recovery:** isolated dev/preview/staging/production via IaC, build-once-promote-digest, backup/restore + outbox-recovery + audit-correlation drills with measured RTO/RPO.
- **External assurance:** penetration test, privacy impact assessment + data map + subject-request process, WCAG 2.2 AA audit, qualified legal/privacy/finance review.

**Phase gate:** no cross-tenant/wrong-role access at API/RLS/object/UI; revocation and membership removal deny immediately; uploads inaccessible until scanned; recovery drills pass; production mode refuses every mock adapter; no unresolved critical/high finding.

## 7. Phase D — execution & payment (Slice 2, later)

Contract/IP versioning + provider-backed signature, pilot plan + deliverables acceptance, **non-custodial** payment status with the three-gate rule, disputes, closure. Gated on DEC-2026-007/008 sign-off and Phase C. Unchanged in intent; see [70](70_SECURITY_AND_AUTHZ.md)/[60](60_API_CONTRACT.md).

## 8. Phase E — controlled pilot (Slice 3, later)

A deliberately limited real cohort, admitted only after Phase C assurance is exercised (not assumed). Go/no-go signed by product, engineering, security, legal/privacy, finance, operations.

## 9. Non-negotiables even in the MVP

These are cheap now and a rewrite to retrofit, so they hold from Phase A:

1. **The browser is never the authority.** Every mutation is a server command that is authorized, validated, and persisted server-side.
2. **Tenant/workspace scoping + `access_grant`.** Every protected row has one owning tenant; cross-tenant reach only via a grant (DEC-2026-011).
3. **Immutable submissions + an audit row** for every sensitive action.
4. **Idempotency + `expected_version`** on commands (already built).
5. **Canonical vocabulary** stays enforced (`verify:vocabulary` + `verify:boundaries`).

Everything else may be simple, stubbed, or deferred to Phase C without guilt.

## 10. Definition of done — two bars

- **MVP done (end of Phase B):** the journey works locally on Postgres; roles enforced server-side; submissions immutable + audited; the standard gates below pass. Good enough to demo and validate with synthetic data. **Not** for real confidential data.
- **Pilot-ready (end of Phase C):** the hardening gate in §6 passes and the required owners have signed off. Only then does real org/solver data go on a server.

## 11. Standard acceptance gates (unchanged, still mandatory for web/shared changes)

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run verify:boundaries
npm run verify:vocabulary
npm run analyze:source:check
npm run build
npm run verify:routes
npm run verify:links
npm run test:smoke
npm run verify:offline
npm run test:standalone-interactive
npm run check:budgets
npm run test:browser
```

Phase A/B add: PostgreSQL migration up (and down where safe) tests, API↔database integration tests, generated-contract drift check, and a real browser→API→Postgres journey test. Phase C adds the RLS/durability/security/recovery gates in §6. New scripts are named only when they land.

## 12. What's explicitly deferred (not deleted — Phase C or later)

MFA/KYB/step-up · RLS · malware scanning · WORM audit / DLQ sophistication · observability stack / WAF / rate limiting · backup/DR drills · pen test / PIA / WCAG audit / legal review · AI matching & embeddings ([45](45_AI_AND_MATCHING.md)) · contract/payment ([70](70_SECURITY_AND_AUTHZ.md) Phase D) · microservices, multi-region, sharding, event sourcing.

## 13. Working method

Each milestone is decomposed with [agent/planner.md](../agent/planner.md) into a bounded task (goal, allowed files, tests, acceptance) before code. High-risk surfaces that _do_ appear in the MVP — authorization, tenancy/`access_grant`, migrations, immutable evidence — still get an [agent/security.md](../agent/security.md) design check, because those are the parts we are _not_ deferring. Everything deferred to Phase C is flagged, not silently skipped.
