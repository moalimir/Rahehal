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

### Milestone-letter convention

Each phase's milestones share one letter, sequenced within it: **A** = Phase 1 (done above), **B** = Phase 2, **C** = Phase 3, **D** = Phase 4, **E** = Phase 5, **G** = the pre-pilot hardening gate (§9), **F** = Phase 6. Letters are stable identifiers for cross-referencing from `25_DECISIONS`, `27_PHASE1_OWNER_APPROVALS`, `90_REQUIREMENTS_TRACEABILITY`, and PR/commit messages — they do not imply a fixed calendar order across phases beyond the dependency chain in §1.

## 3. Phase 0 — baseline (essentially closed)

Engineering decisions, the repo baseline, canonical convergence, the in-memory API/worker boundary proof, the local Docker stack, and DEC-2026-010/011 owner sign-off are done ([82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md), [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md)). The remaining Phase-0 items are **not MVP blockers** and run in parallel: visual Golden Master (`test:visual`), first clean Linux CI run, and placeholder/brand/asset/legal sign-offs before any external distribution.

## 4. Phase 1 — lean foundation (re-scoped)

**Goal:** make the boundary real — one login, one database, the web talking to the API — so the MVP journey has something authoritative to run on. Reuse the ports and in-memory logic already in `apps/api`/`apps/worker`; swap the storage, not the design. **Hardening (MFA, RLS, scanning, WORM, observability, DR) is deferred to §9** — not built here.

**Owner:** Backend + Platform · **Review:** Security, Frontend

| Milestone | Deliverable                                                                                                                                                                                                                              | Status         | Acceptance                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1a**   | PostgreSQL foundation: exact Compose pin; checksummed reversible SQL migrations; tenant/user/identity-link/workspace/membership/`access_grant`/session/challenge+version/audit/outbox/idempotency tables; deterministic synthetic seeds. | `verification` | `npm run test:postgres` proves migration down/up, seed rerun, and negative constraints; exact pinned-image startup still needs registry access              |
| **A1b**   | PostgreSQL session/workspace/access-audit adapters; explicit transaction-scoped unit of work; digest-only credentials; transaction-time session/membership revalidation; injected test-only OIDC exchange pending A2.                    | `verification` | PostgreSQL integration tests prove allow/deny, expiry/revocation, concurrent replay, locks, atomic evidence, and rollback; human security review remains    |
| **A1c**   | Scoped PostgreSQL challenge create/read/save; immutable versions; atomic durable receipt/audit/outbox/idempotency result; explicit PostgreSQL runtime with no demo fallback.                                                             | `verification` | Native integration proves concurrency, scope denial, stale conflict, rollback, and API-runtime restart; exact pinned container smoke awaits registry access |
| **A2**    | One **simple** real login against a standards-compatible local OIDC test provider: authorization code + PKCE, server-validated revocable session, verified test contact. MFA/KYB/step-up remain deferred to hardening.                   | `ready`        | sign-in issues a real session; sign-out/expiry denies protected calls; no browser claim or app-owned password is trusted                                    |
| **A3**    | Wire the web to the real API: network gateway composition, `/me` + active-workspace switch, and typed error/conflict states. Keep static export as demo-only.                                                                            | `ready`        | a real browser does sign-in → active workspace → challenge create/read/save through the API and PostgreSQL                                                  |

**Phase gate:** a person signs in, creates a challenge, it persists in Postgres, and reloading shows it — with the server (not the browser) enforcing who may do what. Idempotent commands + `expected_version` conflicts already hold (kept from the in-memory design).

## 5. Phase 2 — authoritative challenge (build lean)

**Goal:** carry the A1c challenge draft through the rest of the canonical lifecycle to `published`, with a structurally separate public projection. Reuse the A1c unit-of-work/idempotency/audit pattern verbatim — Phase 2 is new tables and transitions, not a new architecture.

**Owner:** Backend + Product · **Review:** Security, Frontend, Operations

| Milestone | Deliverable                                                                                                                                                                                                                                                                    | Status        | Acceptance                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1**    | Extend the challenge state machine through `triage` → `formulation` → `approvals`, sharing one server-side readiness/validation contract across draft, preview, and submit (closes FR-ORG-003).                                                                                | `ready`       | draft/preview/submit return identical field-level errors and readiness state for the same content; invalid transitions rejected by the state machine, not just the UI                                                                  |
| **B2**    | `challenge_approval` table: one row per `(challenge_version_id, gate)` for `business`/`technical`/`finance`/`legal`/`quality`, each recorded by a distinct actor (separation of duty, [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §6).                                   | `not-started` | the same actor cannot record two required gates on one version; a missing/duplicate gate blocks publish with a typed error naming the missing gate                                                                                     |
| **B3**    | `eligibility_rule` table: versioned `allowed_applicant_types`, verification/NDA/document requirements, deadline, tied to the challenge version it governs.                                                                                                                     | `not-started` | a new challenge version gets its own eligibility rule row; an expired/closed rule cannot be attached to a still-editable draft                                                                                                         |
| **B4**    | Atomic publish transaction: lock the approved version immutable (`published_version_id` set, all B2 gates present), write `challenge_public_projection` from an explicit allowlist, emit outbox `challenge.published` — one transaction, same shape as A1c's `recordMutation`. | `not-started` | publish race yields one immutable published version and one receipt; a forced mid-commit failure leaves zero partial rows across challenge/version/projection/audit/outbox/idempotency (same proof pattern as A1c's rollback test)     |
| **B5**    | Public discovery API serves only from `challenge_public_projection`; the private aggregate is never queried on an unauthenticated path.                                                                                                                                        | `not-started` | a confidential field added to the aggregate but not the allowlist never appears in the public response, even by omission-by-accident (a snapshot test on the projection's exact field set)                                             |
| **B6**    | Deadline, extend, pause, close, cancel, and material-amendment commands: explicit reason + version + server-time decision on any deadline race.                                                                                                                                | `not-started` | a paused/closed challenge is hidden from discovery but existing proposals remain readable by their own workspace; a material amendment creates a new version and notifies affected solvers, never mutates a published version in place |
| **B7**    | Real-browser E2E: org drafts → triage → approvals (three distinct approvers) → publish; public visits the published challenge; ops runs the quality gate.                                                                                                                      | `not-started` | happy path plus: unapproved-version publish attempt denied; unauthorized actor cannot self-approve a second required gate; unknown/unpublished challenge ID returns non-enumerating `NOT_FOUND`                                        |

**Phase gate:** an incomplete, unauthorized, or under-approved challenge cannot be published via a direct API call. Published output is structurally separate from the private aggregate and exactly matches the approved version.

## 6. Phase 3 — authoritative proposal (build lean)

**Goal:** let an eligible solver or team workspace submit one immutable, versioned proposal against a published challenge's exact terms — the same create/immutable-version/atomic-evidence shape as A1c, applied to `proposal`/`proposal_version`.

**Owner:** Backend + Product · **Review:** Security, Frontend

| Milestone | Deliverable                                                                                                                                                                                                                                                               | Status        | Acceptance                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1**    | Server-side `evaluateEligibility` port: ports the existing client-side eligibility logic behind the API, versioned against the B3 `eligibility_rule`, with explainable reasons/next-actions (closes FR-SOL-002).                                                          | `not-started` | the same inputs always evaluate against the exact rule version active when the challenge was published, not the current one; ineligible responses include a specific, non-generic reason                                                      |
| **C2**    | Team create/invite/request/role-policy/ownership-transfer/removal/archive, porting the existing `decideTeamPermission` matrix server-side ([70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §4).                                                                         | `not-started` | exhaustive owner/admin/proposal-manager/contributor/viewer permission tests pass server-side; the last active manager and the owner cannot be removed without a prior transfer, checked under a row lock to close the concurrent-removal race |
| **C3**    | Workspace-scoped `proposal` draft create/read/save behind A1c's unit-of-work pattern; attachments are recorded as metadata references only — private object storage with quarantine/scan is G3's scope, not Phase 3's.                                                    | `not-started` | draft reads/writes are scoped to `(tenant_id, workspace_id)`; a cross-workspace ID guess returns non-enumerating `NOT_FOUND`, not a 403 that confirms existence                                                                               |
| **C4**    | Submission transaction: checks challenge is `published` and its deadline has not passed (server time), sender is authorized by C2's policy, required declarations are accepted; creates the first **locked** `proposal_version`; atomic receipt/audit/outbox/idempotency. | `not-started` | duplicate submit with the same idempotency key replays one receipt; a submit racing the challenge's close/deadline is decided by server time, never client clocks; the submitted version becomes DB-trigger-enforced append-only              |
| **C5**    | Clarification/revision flow: `clarification_requested` → `clarification_submitted` → `revision_draft` → `resubmitted`, each new version carrying an explicit `base_version_id` and `changed_fields` diff.                                                                 | `not-started` | a revision always cites its exact base version; the diff is computed and stored, not just implied by timestamps                                                                                                                               |
| **C6**    | Saved opportunities + authoritative `direct_offer`/`offer_response` two-party aggregate with expiry.                                                                                                                                                                      | `not-started` | only the sending org and the receiving workspace can act on an offer; an expired offer cannot be responded to even if the response was already in progress                                                                                    |
| **C7**    | Real-browser E2E: solver discovers → checks eligibility → drafts → submits; org receives the submission; ID-swap and deadline-race negative paths.                                                                                                                        | `not-started` | no cross-workspace read/write is possible by changing IDs in the URL or request body; role policy from C2 is enforced server-side, not just hidden in the UI                                                                                  |

**Phase gate:** no cross-workspace read/write is possible by changing IDs; team role policy is enforced server-side; a duplicate submission produces exactly one locked version and one receipt; every revision cites an immutable base version.

## 7. Phase 4 — review, decision, and MVP completion

**Goal:** assignment-scoped, COI-gated review and a reasoned organization decision — the last slice of the accepted MVP boundary.

**Owner:** Backend + Product · **Review:** Security, Operations

| Milestone | Deliverable                                                                                                                                                                                                                   | Status        | Acceptance                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**    | Reviewer identity/eligibility/assignment/workload port; `review_assignment` table linking reviewer, exact `proposal_version_id`, and `rubric_version_id`.                                                                     | `not-started` | an assignment is scoped to one exact proposal version; workload/assignment listing never enumerates assignments outside the requesting reviewer's own set                                       |
| **D2**    | First-class `coi_declaration` record (`pending`/`clear`/`conflict`) per assignment, server-gated at the API — retires the prototype's `localStorage` COI flag entirely ([20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) §4.3).    | `not-started` | an assignment in `pending` or `conflict` returns nothing from the materials/scoring endpoints — no field, no metadata, no cache leak; only `clear` unlocks the `coi-gate → accepted` transition |
| **D3**    | Versioned `rubric`/`rubric_version` + criterion validation + required rationale; `draft` review state.                                                                                                                        | `not-started` | a score outside a criterion's valid range, or a criterion missing its rationale, is rejected before the review can reach `submitted`                                                            |
| **D4**    | Immutable final review (`submitted` → `locked`) plus a separated `invalidated` path: ops-only, reason required, distinct actor from the assigned reviewer and the deciding organization member.                               | `not-started` | a locked review cannot be edited by the reviewer through any endpoint; invalidation is always attributed to an ops actor with a recorded reason, never silent                                   |
| **D5**    | Blind/timed comparison projection for the organization: reviewer identity and other reviewers' scores withheld until the policy-defined timing/anonymity window opens ([70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §6). | `not-started` | the withheld fields are absent from the API response before the window opens, not merely hidden in the UI                                                                                       |
| **D6**    | Shortlist, no-award, and exact-version reasoned **decision**: cites the exact `proposal_version_id` and `review` version(s), authorized actor, structured reason, step-up.                                                    | `not-started` | a decision cannot be recorded twice for one challenge; a stale/duplicate decision command is rejected with the current state, not silently accepted                                             |
| **D7**    | Atomic `case` creation on a `selected` decision, in the same transaction as the decision record; full correlation chain challenge_version → proposal_version → assignment/review → decision → case.                           | `not-started` | one authorized request produces exactly one case; the correlation ID threads through every row so the whole chain is reconstructable from any one of them                                       |
| **D8**    | MVP real-browser E2E across org, solver, and reviewer: the full happy path plus COI-conflict denial, stale-version decision attempt, and duplicate-decision replay.                                                           | `not-started` | happy path passes; every listed negative path fails safely with the correct typed error, not a 500 or a silent no-op                                                                            |

> **MVP is complete at the end of Phase 4.** It runs locally, persists in Postgres, enforces roles server-side, and keeps submissions immutable and audited — enough to demo to friendly users and validate the product with synthetic data. **Not** for real confidential data (that needs §9).

**Phase gate:** COI-`pending`/`conflict` reviewers obtain nothing at the API; a locked review is immutable except through an audited, separated invalidation; every decision cites exact versions, an authorized actor, and a reason; challenge → proposal → assignment/review → decision is traceable end to end.

## 8. Phase 5 — execution & payment (build lean, Slice 2)

**Goal:** turn a `selected` decision's case into an effective contract, a run pilot, accepted deliverables, and non-custodial payment status — built lean and local like the MVP, with real providers deferred to the hardening gate.

**Owner:** Backend + Finance/Legal (decisions) · **Review:** Security, Operations

| Milestone | Deliverable                                                                                                                                                                                                   | Status        | Acceptance                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **E1**    | Versioned `contract_version`/IP schedule; negotiation → approval → signature → `effective` transitions; provider-backed signature is a stub/local test provider until DEC-2026-007 selects a real one.        | `not-started` | a contract becomes effective only from its approved current version; superseding a version never mutates the superseded one          |
| **E2**    | Participation-scoped case messages/documents: access follows the case's `access_grant`, not a blanket org/solver relationship.                                                                                | `not-started` | a workspace outside the case's grant cannot read case messages/documents even with a guessed ID                                      |
| **E3**    | Pilot plan: milestones, owners, KPI baselines/targets, evidence, change control (`planned` → `running`).                                                                                                      | `not-started` | a plan change after `running` creates a new reasoned version; it never silently rewrites the original baseline                       |
| **E4**    | Deliverable submit/accept/revise/reject protocol; the accepting actor is distinct from the finance approver (separation of duty carried from A1b's audit pattern).                                            | `not-started` | acceptance requires evidence attached to the exact criteria; the same actor cannot both accept a deliverable and approve its payment |
| **E5**    | Non-custodial invoice/payment schedule and status ledger — the platform records status only; the org pays the solver directly (DEC-2026-008).                                                                 | `not-started` | money is stored as `amount_minor` + ISO currency, never a float; no code path moves funds through the platform                       |
| **E6**    | Three-gate payment command: `processing` requires effective contract (E1) + technical acceptance (E4) + a distinct finance approval, checked in one transaction under lock; provider callback reconciliation. | `not-started` | a payment cannot reach `processing` with any one gate missing; a duplicate provider callback produces one ledger effect, not two     |
| **E7**    | Dispute/evidence/SLA/appeal queues with bounded ops access and legal hold.                                                                                                                                    | `not-started` | a disputed case's evidence is retained even if a later, unrelated cleanup job runs; access to dispute evidence is itself audited     |
| **E8**    | Case closure: reconciled payment status, one-time structured feedback per authorized party, impact evidence, case-study consent.                                                                              | `not-started` | closure is blocked while any deliverable or payment remains unresolved; feedback can be submitted exactly once per authorized party  |
| **E9**    | Full execution/payment real-browser E2E plus a provider-outage/replay/reconciliation drill.                                                                                                                   | `not-started` | the E1–E8 happy path passes; a simulated provider outage/duplicate callback is reconciled without a duplicate financial effect       |

**Phase gate:** no payment advances without an effective contract, technical acceptance, and a distinct finance approval. Provider callbacks are reconciled, never trusted as sole authority. See [60_API_CONTRACT](60_API_CONTRACT.md)/[70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

## 9. Pre-pilot hardening gate (before real users/data on a server)

**Goal:** everything Phases 1–5 deliberately deferred, done **before any real organization or confidential data is exposed on a server** and before real-money pilot use. This is a required gate between local building and the Phase 6 pilot — not a redesign; detail lives in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md).

**Owner:** Platform + Security · **Review:** Backend, Frontend, Privacy, Operations

| ID     | Deliverable                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1** | Identity hardening: managed in-region OIDC provider, MFA/step-up for sensitive actions, session rotation/revocation families, abuse/rate controls, KYB/verification workflow.                                                                          |
| **G2** | Data defense-in-depth: PostgreSQL RLS behind the app-scoping already in place; multi-party publication approvals (separation of duty); the three-gate payment rule enforced for live money.                                                            |
| **G3** | Files: private object storage with quarantine + malware scan + signed authorized reads (MVP may start with private storage + type/size validation only).                                                                                               |
| **G4** | Durability & audit: durable outbox with poison-isolation/DLQ, append-only WORM audit export, correlation search.                                                                                                                                       |
| **G5** | Ops & edge: structured logs/metrics/traces, Web Vitals, SLOs/error budgets, CSP/security headers, WAF, secret + dependency + container scanning, tenant-isolation CI gates; role code-split + feature-CSS split to lower byte ceilings (DEC-2026-009). |
| **G6** | Environments & recovery: isolated dev/preview/staging/production via IaC, build-once-promote-digest, backup/restore + outbox-recovery + audit-correlation drills with measured RTO/RPO.                                                                |
| **G7** | External assurance: penetration test, privacy impact assessment + data map + subject-request process, WCAG 2.2 AA audit, qualified legal/privacy/finance review.                                                                                       |

**Gate:** no cross-tenant/wrong-role access at API/RLS/object/UI; revocation and membership removal deny immediately; uploads inaccessible until scanned; recovery drills pass; production mode refuses every mock adapter; no unresolved critical/high finding.

## 10. Phase 6 — controlled pilot (Slice 3)

**Goal:** admit a deliberately limited real cohort only after the §9 hardening gate is exercised (not assumed). Phase 6 is cohort onboarding and operation, not a second hardening pass — it consumes G1–G7's evidence rather than re-deriving it.

**Owner:** Product + Operations · **Review:** Engineering, Security, Legal/Privacy, Finance

| Milestone | Deliverable                                                                                                                                                                                                          | Status        | Acceptance                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| **F1**    | Confirm all G1–G7 evidence is current (not stale from an earlier snapshot) and re-run any drill whose environment changed since it was last exercised.                                                               | `not-started` | every G-item has a dated, linked evidence artifact from within the current release cycle                        |
| **F2**    | Pilot participant selection: a named, bounded set of organizations/solvers/reviewers; data-sensitivity classification per participant matches the residency/classification decisions in `27_PHASE1_OWNER_APPROVALS`. | `not-started` | no participant's data classification exceeds what the approved region/provider set can legally hold             |
| **F3**    | Onboarding runbook: invitation, verification/KYB completion, first-login support path, rollback/feature-flag plan if the cohort needs to be paused.                                                                  | `not-started` | a participant can be paused or removed from the cohort without corrupting in-flight case state                  |
| **F4**    | On-call, incident severity, and privileged-support-access procedures are staffed and rehearsed (not just documented).                                                                                                | `not-started` | a simulated incident is triaged, escalated, and resolved by the named rotation within its defined severity SLA  |
| **F5**    | Instrumented success measures wired to real (not synthetic) pilot data: the funnel metrics in `10_PRODUCT_VISION` §7, SLO/error-budget dashboards, and guardrail metrics together.                                   | `not-started` | a stakeholder can see funnel + guardrail metrics for the live cohort without a manual data pull                 |
| **F6**    | Cross-functional go/no-go: product, engineering, security, legal/privacy, finance, operations each sign off explicitly against the G1–G7 evidence and F1–F5 readiness.                                               | `not-started` | every required signatory has recorded an explicit accept/reject with date, not an implicit absence-of-objection |
| **F7**    | Scheduled pilot review: a fixed checkpoint to assess funnel/guardrail data and decide continue/expand/pause/stop.                                                                                                    | `not-started` | the review happens on schedule with the F5 dashboards as its primary evidence, not ad hoc anecdote              |

**Phase gate:** no unresolved critical/high security, privacy, legal, accessibility, data-loss, operational, or financial finding. Product, Engineering, Security, Legal/Privacy, and Finance sign the controlled-pilot go/no-go.

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
