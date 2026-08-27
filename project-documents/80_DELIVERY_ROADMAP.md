# Delivery Roadmap

**Revised 2026-08-27 — pragmatic, MVP-first (numeric phases retained).** Earlier this plan front-loaded full production hardening (managed-OIDC+MFA, RLS, malware scanning, durable outbox/DLQ, observability, DR drills, pen test) into Phase 1, before the product journey worked end-to-end. That is backwards for reaching a usable MVP. This version keeps the numeric Phase 0–6 structure the rest of the docs use, but **re-scopes Phase 1 to a lean foundation and pulls the hardening out into one pre-pilot gate** (§9). The hardening is not dropped — it is re-sequenced and detailed in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

This document owns delivery order, milestone dependencies, and acceptance gates. [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md) owns Phase-0 evidence; [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md) maps requirements to milestones; [25_DECISIONS](25_DECISIONS.md) owns decisions; [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md) owns owner sign-offs.

---

## 1. Target outcome

The MVP proves one governed journey, working locally on real persistence:

> An organization creates and publishes a challenge → an eligible solver submits an **immutable** proposal version → a COI-cleared reviewer scores that exact version → the organization records a reasoned decision → every sensitive action is authorized **server-side**, versioned, and audited.

That is the whole MVP — Phases 1→4. Execution/payment (Phase 5) and a real external pilot (Phase 6) come after, and the pilot only after the hardening gate.

## 2. How we sequence (the pragmatic split)

We deliberately separate **load-bearing architecture** (do now — cheap now, a rewrite to retrofit) from **production hardening** (do at the pre-pilot gate). This is an owner-accepted risk decision for a **local build with synthetic data and no real users**; the hardening gate (§9) re-enters before any real org or confidential data is exposed on a server.

| Keep now — Phases 1–5 (mostly already built in `apps/api`)         | Defer to the pre-pilot hardening gate (§9)                                     |
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

`not-started` · `ready` · `in-progress` · `verification` (built; evidence/review pending) · `done` (built + tested + owner-accepted where required). The old `P1-F# / P2-C# / …` milestone IDs are superseded by the phase sections below; [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md)'s milestone column still cites them and is remapped in a follow-up (not delivery-blocking).

## 3. Phase 0 — baseline (essentially closed)

Engineering decisions, the repo baseline, canonical convergence, the in-memory API/worker boundary proof, the local Docker stack, and DEC-2026-010/011 owner sign-off are done ([82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md), [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md)). The remaining Phase-0 items are **not MVP blockers** and run in parallel: visual Golden Master (`test:visual`), first clean Linux CI run, and placeholder/brand/asset/legal sign-offs before any external distribution.

## 4. Phase 1 — lean foundation (re-scoped)

**Goal:** make the boundary real — one login, one database, the web talking to the API — so the MVP journey has something authoritative to run on. Reuse the ports and in-memory logic already in `apps/api`/`apps/worker`; swap the storage, not the design. **Hardening (MFA, RLS, scanning, WORM, observability, DR) is deferred to §9** — not built here.

**Owner:** Backend + Platform · **Review:** Security, Frontend

| Milestone | Deliverable                                                                                                                                                                                                                              | Status         | Acceptance                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A1a**   | PostgreSQL foundation: exact Compose pin; checksummed reversible SQL migration; tenant/user/identity-link/workspace/membership/`access_grant`/session/challenge+version/audit/outbox/idempotency tables; deterministic synthetic seeds.  | `verification` | `npm run db:up && npm run test:postgres`; migration up/down/up, seed rerun, and negative constraint checks all pass      |
| **A1b**   | PostgreSQL adapters behind the existing identity, workspace, challenge, audit, idempotency, and outbox ports; one transaction boundary for aggregate + version + audit + outbox + replay receipt.                                        | `ready`        | existing API behavior runs against PostgreSQL, including rollback, conflict, replay, allow/deny, and non-enumeration     |
| **A2**    | One **simple** real login against a standards-compatible local OIDC test provider: authorization code + PKCE, server-validated revocable session, verified test contact. MFA/KYB/step-up/rotation families remain deferred to hardening. | `ready`        | sign-in issues a real session; sign-out/expiry denies protected calls; no browser claim or app-owned password is trusted |
| **A3**    | Wire the web to the real API: production challenge gateway composition; `/me` + active-workspace switch; typed error/conflict states. Keep the offline/static export as a demo artifact.                                                 | `ready`        | a real browser does sign-in → active workspace → challenge create/read/save through the API and PostgreSQL               |

**Phase gate:** a person signs in, creates a challenge, it persists in Postgres, and reloading shows it — with the server (not the browser) enforcing who may do what. Idempotent commands + `expected_version` conflicts already hold (kept from the in-memory design).

## 5. Phase 2 — authoritative challenge (build lean)

Challenge lifecycle to `published`: draft → triage → formulation → approvals → publish an **immutable** version + a public projection. The implementation may stay operationally lean, but the canonical version-specific technical/legal/finance approvals and ops quality gate remain independently attributable; they are not collapsed into one actor or one audit row. **Acceptance:** every required gate cites the exact version and authorized distinct actor; the published version is immutable; the public projection carries only allowlisted fields; unknown/unpublished IDs fail safely.

## 6. Phase 3 — authoritative proposal (build lean)

Solver eligibility + proposal draft in a workspace, then **submit → one immutable proposal version** with a receipt. Clarification/revision make new versions with an explicit base. **Acceptance:** duplicate submit → one version + one receipt; submitted content cannot be edited; no cross-workspace read/write by changing IDs.

## 7. Phase 4 — review, decision, and MVP completion

Reviewer assignment + **COI declaration gate** (kept server-enforced — it's core to the product) + rubric scoring → immutable review; then the organization records a **reasoned decision** citing the exact proposal + review versions. **Acceptance:** a pending/conflict reviewer gets nothing; a submitted review can't be silently edited; the decision cites exact versions + an authorized actor + a reason; challenge→proposal→review→decision is traceable in the audit table.

> **MVP is complete at the end of Phase 4.** It runs locally, persists in Postgres, enforces roles server-side, and keeps submissions immutable and audited — enough to demo to friendly users and validate the product with synthetic data. **Not** for real confidential data (that needs §9).

## 8. Phase 5 — execution & payment (build lean, Slice 2)

Contract/IP versioning + provider-backed signature, pilot plan + deliverables acceptance, **non-custodial** payment status with the three-gate rule, disputes, closure. Built lean and local like the MVP; gated on DEC-2026-007/008 sign-off. Real money only appears at the Phase 6 pilot, after the hardening gate. See [60_API_CONTRACT](60_API_CONTRACT.md)/[70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

## 9. Pre-pilot hardening gate (before real users/data on a server)

**Goal:** everything Phases 1–5 deliberately deferred, done **before any real organization or confidential data is exposed on a server** and before real-money pilot use. This is a required gate between local building and the Phase 6 pilot — not a redesign; detail lives in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

**Owner:** Platform + Security · **Review:** Backend, Frontend, Privacy, Operations

- **Identity hardening:** managed in-region OIDC provider, MFA/step-up for sensitive actions, session rotation/revocation families, abuse/rate controls, KYB/verification workflow.
- **Data defense-in-depth:** PostgreSQL RLS behind the app-scoping already in place; multi-party publication approvals (separation of duty); the three-gate payment rule enforced for live money.
- **Files:** private object storage with quarantine + malware scan + signed authorized reads (MVP may start with private storage + type/size validation only).
- **Durability & audit:** durable outbox with poison-isolation/DLQ, append-only WORM audit export, correlation search.
- **Ops & edge:** structured logs/metrics/traces, Web Vitals, SLOs/error budgets, CSP/security headers, WAF, secret + dependency + container scanning, tenant-isolation CI gates; role code-split + feature-CSS split to lower byte ceilings (DEC-2026-009).
- **Environments & recovery:** isolated dev/preview/staging/production via IaC, build-once-promote-digest, backup/restore + outbox-recovery + audit-correlation drills with measured RTO/RPO.
- **External assurance:** penetration test, privacy impact assessment + data map + subject-request process, WCAG 2.2 AA audit, qualified legal/privacy/finance review.

**Gate:** no cross-tenant/wrong-role access at API/RLS/object/UI; revocation and membership removal deny immediately; uploads inaccessible until scanned; recovery drills pass; production mode refuses every mock adapter; no unresolved critical/high finding.

## 10. Phase 6 — controlled pilot (Slice 3)

A deliberately limited real cohort, admitted only after the §9 hardening gate is exercised (not assumed) and the required owners have signed off. Go/no-go signed by product, engineering, security, legal/privacy, finance, operations.

## 11. Non-negotiables even in the MVP

These are cheap now and a rewrite to retrofit, so they hold from Phase 1:

1. **The browser is never the authority.** Every mutation is a server command that is authorized, validated, and persisted server-side.
2. **Tenant/workspace scoping + `access_grant`.** Every protected row has one owning tenant; cross-tenant reach only via a grant (DEC-2026-011).
3. **Immutable submissions + an audit row** for every sensitive action.
4. **Idempotency + `expected_version`** on commands (already built).
5. **Canonical vocabulary** stays enforced (`verify:vocabulary` + `verify:boundaries`).

Everything else may be simple, stubbed, or deferred to the hardening gate without guilt.

## 12. Definition of done — two bars

- **MVP done (end of Phase 4):** the journey works locally on Postgres; roles enforced server-side; submissions immutable + audited; the standard gates below pass. Good enough to demo and validate with synthetic data. **Not** for real confidential data.
- **Pilot-ready (§9 passed):** the hardening gate passes and the required owners have signed off. Only then does real org/solver data go on a server (Phase 6).

## 13. Standard acceptance gates (unchanged, still mandatory for web/shared changes)

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

Phases 1–4 add: PostgreSQL migration up (and down where safe) tests, API↔database integration tests, generated-contract drift check, and a real browser→API→Postgres journey test. The hardening gate (§9) adds the RLS/durability/security/recovery gates. New scripts are named only when they land.

## 14. What's explicitly deferred (not deleted — hardening gate §9 or later)

MFA/KYB/step-up · RLS · malware scanning · WORM audit / DLQ sophistication · observability stack / WAF / rate limiting · backup/DR drills · pen test / PIA / WCAG audit / legal review · payload reduction (role/CSS split, DEC-2026-009) · AI matching & embeddings ([45](45_AI_AND_MATCHING.md)) · microservices, multi-region, sharding, event sourcing.

## 15. Working method

Each milestone is decomposed with [agent/planner.md](../agent/planner.md) into a bounded task (goal, allowed files, tests, acceptance) before code. High-risk surfaces that _do_ appear in the MVP — authorization, tenancy/`access_grant`, migrations, immutable evidence — still get an [agent/security.md](../agent/security.md) design check, because those are the parts we are _not_ deferring. Everything deferred to the hardening gate is flagged, not silently skipped.
