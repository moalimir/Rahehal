# Delivery Roadmap

**Strategy: depth before breadth.** The prototype already demonstrates the complete product journey. Delivery now means making one thin vertical slice authoritative, widening only after its data, permissions, failure behavior, audit, recovery, and operations are proven. A rendered page is evidence of product intent, not completion.

This document owns delivery order, milestone dependencies, acceptance gates, and progress reporting. [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md) owns Phase-0 evidence; [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md) maps requirements to milestones; [25_DECISIONS](25_DECISIONS.md) owns accepted and pending decisions. Do not create a second competing roadmap.

---

## 1. Target outcome and dependency chain

The first authoritative release proves one governed journey:

> An organization publishes an approved challenge → an eligible solver submits an immutable proposal version → a COI-cleared reviewer scores that exact version → the organization records a reasoned decision → every sensitive action is authorized, versioned, auditable, recoverable, and operationally supported.

```text
Phase 0 evidence + owner decisions
  → Phase 1 identity · tenancy · authz · persistence · audit · files · operations
  → Phase 2 challenge approval and publication                         (Slice 1a)
  → Phase 3 solver workspace and proposal submission                   (Slice 1b)
  → Phase 4 reviewer COI/scoring and organization decision             (Slice 1c = MVP)
  → Phase 5 contract · pilot · deliverable · payment · operations      (Slice 2)
  → Phase 6 controlled production pilot                               (Slice 3)
```

Identity, tenancy, canonical states, roles, authorization, and shared command semantics are serialized decisions: teams must not implement competing versions in parallel. Platform, product/design, legal/privacy, and provider evaluation may overlap once those shared definitions are frozen.

## 2. Planning basis

### 2.1 Accepted constraints

- One TypeScript modular monolith API plus asynchronous workers; no pilot-stage microservices (ADR-0003/0013/0014).
- PostgreSQL is authoritative; application-scoped access plus RLS is defense in depth (ADR-0004).
- Cross-tenant collaboration uses narrow, auditable, revocable `access_grant` records (ADR-0005).
- Identity is delegated to managed OIDC; verification/KYB remains a separate workflow (ADR-0010).
- Sensitive commands require authorization, validation, idempotency, optimistic concurrency, atomic audit/outbox, and typed receipts (ADR-0007/0008).
- Files are private: pre-signed quarantine upload, server validation and scan, then short-lived authorized reads (ADR-0009).
- The production web is hybrid; the static/offline export remains a read-only demo artifact (ADR-0002, DEC-2026-006).
- AI infrastructure, embeddings, model egress, and AI events are deferred (ADR-0012).
- Pilot payment orchestration is non-custodial, pending finance/legal/product sign-off (ADR-0011, DEC-2026-008).

### 2.2 Current implementation evidence

- npm workspaces contain the root Next.js web, `apps/api`, `apps/worker`, and shared domain/contracts/testkit packages.
- The challenge UI consumes typed private query/command gateways; public discovery consumes an allowlisted opportunity projection. Unknown IDs fail explicitly without fixture fallback.
- OpenAPI 3.1 covers the first session, `/me`, workspace-context, and challenge-draft create/read/save paths.
- The API and worker prove authorization, concurrency, idempotency, audit/outbox, poison isolation, retry, dead-letter, and crash-window behavior with explicit in-memory development adapters.
- Demo API/worker compositions refuse production mode. They are executable boundary proofs, not production authority.
- The local release bundle, 45 files/307 tests, real-browser behavior, offline artifact, performance gates, and dependency audit are green on the verified development machine.

### 2.3 Capacity and schedule assumptions

Indicative ranges assume 3–4 delivery engineers with fractional product, design, platform, security, legal/privacy, finance, and operations support. Provider procurement, residency approval, legal review, and owner availability may dominate elapsed time. With two delivery engineers, treat the ranges as effort order rather than calendar commitments.

| Phase                          | Outcome                                                              | Indicative range | Gate class          |
| ------------------------------ | -------------------------------------------------------------------- | ---------------: | ------------------- |
| **0. Baseline closure**        | Human/external evidence closes while Phase 1 begins                  |         parallel | ready to build      |
| **1. Platform foundation**     | Production identity, data authority, files, delivery, and operations |       6–10 weeks | safe foundation     |
| **2. Authoritative challenge** | Approved draft publishes an immutable public projection              |        4–6 weeks | real challenge      |
| **3. Authoritative proposal**  | Eligible solver submits an immutable proposal version                |        4–6 weeks | real proposal       |
| **4. Review and decision**     | COI-gated review and reasoned decision complete the MVP              |        4–6 weeks | MVP complete        |
| **5. Execution and payment**   | Contract, pilot, deliverables, non-custodial payment, disputes       |        6–9 weeks | full case lifecycle |
| **6. Controlled pilot**        | Operated, reviewed, limited production cohort                        |        4–6 weeks | pilot go/no-go      |

Ranges are re-estimated at each phase gate from measured throughput and provider lead time. Do not compress a security or recovery gate to meet a date.

## 3. Status and ownership model

Every milestone uses one status:

| Status         | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `not-started`  | Dependencies or scope are not ready.                                                      |
| `ready`        | Decisions, dependencies, owner, and acceptance evidence are defined.                      |
| `in-progress`  | Implementation is active within the approved scope.                                       |
| `blocked`      | A named external decision/dependency prevents meaningful progress.                        |
| `verification` | Implementation is complete; acceptance evidence or owner review remains.                  |
| `done`         | Implementation, automated evidence, operating procedure, and required approval all exist. |

Each milestone must name one directly responsible owner and required reviewers. Suggested ownership below is a responsibility boundary, not a staffing assignment:

- **Product:** journey policy, MVP acceptance, public behavior, exceptions.
- **Architecture/Backend:** canonical application boundary, data/transaction design, API.
- **Platform:** environments, deployment, PostgreSQL operation, queue, observability, recovery.
- **Security:** identity, authorization, threat model, files, edge controls, security gates.
- **Frontend/Design:** network composition, Persian/RTL, accessibility, performance, browser evidence.
- **Operations:** verification queues, exception handling, audit use, support and incident procedures.
- **Legal/Privacy/Finance:** decisions and procedures within their regulated scope.

## 4. Phase 0 — baseline closure

> **Current status (2026-08-23):** engineering decisions and the local repository baseline are complete. The visual Golden Master, first clean Linux CI evidence, owner sign-offs, and placeholder contact/asset confirmations remain in [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md). None blocks bounded Phase-1 engineering, but the applicable item must close before an external pilot or artifact distribution.

| Milestone | Deliverable                                                         | Owner / reviewers              | Depends on                      | Acceptance evidence                                                                                      |
| --------- | ------------------------------------------------------------------- | ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **P0-G1** | Review and commit the visual Golden Master; make visual CI blocking | Frontend+Design / Product      | approved reference environment  | 18 scenarios × 7 viewports reviewed; `npm run test:visual` passes; CI no longer uses `continue-on-error` |
| **P0-G2** | First clean Linux CI execution                                      | Platform / Architecture        | repository access and runner    | clean clone passes the required workflow; artifacts and digests retained                                 |
| **P0-G3** | Replace security/license/ownership placeholders                     | Product+Legal+Security         | named contacts and legal choice | approved files contain no placeholders; vulnerability channel tested                                     |
| **P0-G4** | Close brand, third-party asset, market, and residency sign-offs     | Product+Legal+Privacy+Security | owner workshop                  | DEC-2026-001/002/005 statuses updated by their owners; unapproved recognizable assets removed            |
| **P0-G5** | Attach offline artifact digest to distribution                      | Platform+Product               | P0-G2                           | build digest recorded; artifact is visibly demo/read-only and passes standalone smoke                    |

## 5. Phase 1 — platform foundation

**Goal:** replace the in-memory boundary proof with operated production authority while keeping the initial API surface deliberately narrow. Challenge approval/publication remains Phase 2.

### Current Phase-1 readiness snapshot

| Milestone  | Status        | Immediate next action or dependency                                                 |
| ---------- | ------------- | ----------------------------------------------------------------------------------- |
| **P1-F1**  | `owner-gate`  | Code/evidence complete; obtain DEC-2026-010/011 sign-off in document 27.            |
| **P1-F2**  | `blocked`     | Document 27 lacks approved provider/region/secrets/deployment owners.               |
| **P1-F3**  | `blocked`     | Document 27 lacks an approved OIDC provider/issuer and residency boundary.          |
| **P1-F4**  | `ready`       | Approve the first migration task against local ephemeral PostgreSQL.                |
| **P1-F5**  | `not-started` | Depends on the first P1-F4 migration and transaction boundary.                      |
| **P1-F6**  | `not-started` | Depends on P1-F4/F5 durable audit/outbox records.                                   |
| **P1-F7**  | `blocked`     | Close residency constraints and select the private object-storage/scanner boundary. |
| **P1-F8**  | `not-started` | Depends on stable P1-F3/F5 contracts and adapters.                                  |
| **P1-F9**  | `ready`       | Define telemetry/redaction/SLO contracts; deployment waits on P1-F2.                |
| **P1-F10** | `not-started` | Certification begins only after P1-F2…F9 reach verification.                        |

`blocked` here identifies an external decision or provider dependency; it does not prevent independent `ready` milestones from proceeding.

### P1-F1 — canonical foundation closure

**Owner:** Architecture+Product · **Review:** Security, Backend, Frontend

Deliverables:

- ✅ Complete the canonical 11-stage lifecycle in `packages/domain`, including `formulation` and `impact`; retain `ChallengeStatus` only as the authoring projection.
- ✅ Implement DEC-2026-010's fail-closed default: detailed `allowedApplicantTypes` is authoritative and `ApplicantScope` is derived. Product-owner sign-off remains required.
- ✅ Converge transition, permission, API, fixture, and solver persistence roles on `platform:*`, `org:*`, and `team:*`; the v5 store owns the flat-v4 compatibility adapter and `AppPersona` is presentation-only.
- ⬚ Obtain product+security approval for DEC-2026-011 before freezing tenant/workspace/membership/access-grant semantics in a production migration.
- Extend vocabulary and dependency fitness tests so API, database, web, and fixtures cannot introduce competing canonical types.

Acceptance:

- X-01/X-06 and the scope/set implementation are resolved in 20/25/30; DEC-2026-010/011 carry explicit human sign-off.
- One server-safe transition definition passes exhaustive valid/invalid actor-transition tests.
- No localized label or legacy enum becomes a command/database value.

### P1-F2 — environments and delivery pipeline

**Owner:** Platform · **Review:** Security, Architecture

Deliverables:

- Provision isolated dev, test, preview, staging, and production environments using IaC.
- Separate databases, domains, credentials, encryption keys, object stores, queues, provider accounts, and audit retention.
- Add secret management, configuration validation, revision metadata, and environment-specific allowlists.
- Build once and promote the same immutable web/API/worker/contracts artifacts through environments.
- Define migration, feature-flag, canary, rollback, and environment-destruction procedures.
- Forbid production identity documents, confidential files, or raw production database clones in preview/test.

Acceptance:

- Staging can be recreated from versioned definitions without manual console state.
- Production startup fails closed on missing/invalid configuration or demo adapter selection.
- Deployment evidence identifies source revision, migration version, artifact digest, actor, and time.

### P1-F3 — managed identity and session authority

**Owner:** Backend+Security · **Review:** Platform, Product, Operations

Deliverables:

- Select the managed in-region OIDC provider within ADR-0010/DEC-2026-005 constraints.
- Implement authorization code + PKCE, one-time state/code handling, server-validated return-to, and user↔subject linking.
- Persist verified contacts, MFA assurance/freshness, rotating sessions, refresh families, and revocation.
- Implement initial invitations/activation and separate verification/KYB case records without storing IdP credentials.
- Require step-up for the canonical sensitive actions; make session revocation and membership removal deny immediately.
- Add abuse/rate controls around exchange, refresh, recovery, and invitation flows.

Acceptance:

- No production endpoint accepts demo tokens, fixture identities, or browser claims as authority.
- Expired, replayed, rotated, revoked, wrong-state, wrong-redirect, and wrong-PKCE attempts fail with non-sensitive typed errors.
- Revocation and membership-removal race tests deny the protected operation inside the authoritative unit of work.

### P1-F4 — PostgreSQL tenancy, authorization, and migrations

**Owner:** Backend+Platform · **Review:** Security, Architecture

Deliverables:

- Create expand/contract migrations for user, tenant, organization, workspace, membership, invitation, verification case, `access_grant`, the initial challenge-draft/version persistence required by the walking skeleton, and cross-cutting audit/idempotency/outbox records. Approval/publication tables remain Phase 2.
- Add constraints, foreign keys, partial/composite indexes, immutable timestamps, and explicit retention behavior.
- Set request-scoped tenant/workspace/actor context and scope every protected query before record policy evaluation.
- Add RLS policies for tenant-owned, explicitly shared, and public-projection records; grants remain membership-gated.
- Implement non-enumerating `NOT_FOUND` for unreachable protected records.
- Add deterministic migrations/test builders without importing runtime fixtures into production adapters.

Acceptance:

- Up, down where safe, forward-compatibility, interrupted-backfill, and rollback-window tests pass against ephemeral PostgreSQL.
- Cross-tenant ID swaps, revoked/expired grants, removed memberships, wrong active context, and wrong roles are denied at application and RLS layers.
- A missed application `WHERE` in a negative fixture is still stopped by RLS.

### P1-F5 — durable command and query foundation

**Owner:** Backend · **Review:** Architecture, Security, Frontend

Deliverables:

- Implement PostgreSQL adapters behind the existing application ports; domain and transport remain storage-independent.
- Persist request fingerprints and idempotent responses with credential/actor/workspace/target scope.
- Enforce `expected_version`, database uniqueness, short critical-section locks where required, and server transaction time for races.
- Commit aggregate/version, audit, outbox, and cached receipt in one transaction.
- Generate and publish the TypeScript web client from the canonical OpenAPI document; generation must be deterministic and drift-checked.
- Carry correlation IDs through HTTP, transaction, audit, outbox, worker, and response.

Acceptance:

- Exact duplicate commands replay one result; same key/different fingerprint fails; concurrent stale writers produce one commit and typed conflict.
- Forced failures at every pre-commit boundary leave no partial aggregate/audit/outbox/idempotency state.
- API responses conform to generated schemas and strip adapter-only fields.

### P1-F6 — durable audit, outbox, and worker operation

**Owner:** Backend+Platform · **Review:** Security, Operations

Deliverables:

- Make the application audit role INSERT+SELECT-only; corrections append new events.
- Add durable outbox claims, stable leases, bounded exponential retry, poison isolation, and an operated dead-letter queue.
- Preserve `event_id` as every downstream idempotency key and record provider delivery attempts without confidential payload logging.
- Add audit search/export by correlation/entity/actor under privileged authorization.
- Define periodic signed WORM export, retention, alerting, replay, and dead-letter operating procedures.
- Keep the initial emitted/consumed event allowlist exact; do not introduce AI events.

Acceptance:

- Worker restart, lease expiry, duplicate delivery, out-of-order input, crash-after-effect, poison event, and DLQ replay tests pass against durable adapters.
- An API success cannot exist without its audit/outbox records; an auxiliary delivery failure cannot roll back committed business state.
- Operations can trace one request from API receipt through audit, outbox, delivery attempt, and final disposition.

### P1-F7 — private file and evidence boundary

**Owner:** Backend+Security · **Review:** Platform, Privacy, Operations, Frontend

Deliverables:

- Select an in-region S3-compatible provider and create private quarantine/durable prefixes or buckets.
- Persist file owner, tenant/workspace, purpose, classification, declared/detected type, size, hash, scan state, retention, and legal-hold metadata.
- Issue short-lived pre-signed quarantine uploads after server type/size/quota authorization.
- Type-sniff and malware-scan asynchronously; only passing objects become available.
- Authorize every short-lived signed read against live membership/grant, classification, NDA prerequisite where applicable, and file state; audit reads.
- Add expiry, orphan cleanup, retention/deletion, legal hold, and scan-failure procedures.

Acceptance:

- Unscanned, failed, expired, cross-tenant, revoked-grant, wrong-classification, and tampered-key reads are denied without existence leakage.
- Provider callbacks/jobs are authenticated or internally trusted, replay-safe, idempotent, and reconciled.
- Object/database mismatch and scanner outage recovery exercises have owned procedures.

### P1-F8 — production web composition

**Owner:** Frontend · **Review:** Backend, Security, Design

Deliverables:

- Add the generated network client and a production challenge gateway composition.
- Select network-only composition through validated build/runtime configuration; production must not import or fall back to local demo repositories or QA state switchers.
- Integrate real authentication bootstrap, `/me`, active-context switching, typed unavailable/error states, and receipt/conflict handling.
- Run non-production contract comparison between deterministic demo/testkit cases and API results without dual authority.
- Preserve the static/offline build as a clearly labelled, non-authoritative demo artifact.
- Split role code and feature CSS while this boundary is introduced; lower byte ceilings as measured reduction lands.

Acceptance:

- A real browser completes sign-in → active workspace → challenge create/read/save through API and PostgreSQL.
- Network, authorization, conflict, expired-session, and unknown-ID failures never display fixture data or mutate local authority.
- Persian/RTL, keyboard, focus, responsive, and constrained-mobile performance evidence remains green.

### P1-F9 — observability, edge, privacy, and operational controls

**Owner:** Platform+Security · **Review:** Backend, Frontend, Privacy, Operations

Deliverables:

- Add structured redacted logs, metrics, distributed traces, Web Vitals, error monitoring, correlation propagation, and privacy-governed analytics.
- Add liveness/readiness endpoints, API/journey SLOs, error budgets, dashboards, alert ownership, and incident severity/runbooks.
- Add CSP/security headers, CSRF/session protections, rate limits/abuse controls, WAF rules, secret scanning, dependency/container scanning, and tenant-isolation CI gates.
- Create the pilot data map, processing purpose/legal-basis inventory, access model, retention schedule, breach workflow, and data-subject-request skeleton.
- Re-enable React compiler lint rules one at a time with regression evidence; record narrow exceptions rather than disabling the class globally.

Acceptance:

- A staged API/database/worker/file failure raises an actionable alert linked to a runbook and correlation trail without leaking confidential content.
- Security headers, rate-limit behavior, log-redaction canaries, and secret/dependency/container scans are automated gates.
- SLO ownership and data-processing responsibilities are named.

### P1-F10 — recovery and Phase-1 certification

**Owner:** Platform+Security · **Review:** Product, Architecture, Backend, Frontend, Operations, Privacy

Deliverables and exit evidence:

1. **Isolation:** cross-tenant and wrong-role attempts are denied at API, RLS, object, export/cache where applicable, and UI.
2. **Immediate revocation:** session expiry/revocation, membership removal, context change, and grant revocation deny before a protected operation commits.
3. **Safe retries/races:** duplicate fingerprints replay once; conflicting reuse and stale versions fail; server time decides deadline races.
4. **File quarantine:** uploaded content is inaccessible until validation and scanning pass.
5. **Recovery/audit:** database restore, outbox recovery, and end-to-end audit-correlation exercises pass with measured RTO/RPO.
6. **Authoritative E2E:** real browser → API → PostgreSQL → audit/outbox/worker succeeds in staging; production mode refuses every mock authority.
7. **Review:** Phase-1 threat model and security diff review have no unresolved P0/P1 findings; residual risks have named owners and expiry.

Phase 1 is complete only when all seven items pass. In-memory equivalents do not satisfy this gate.

## 6. Phase 2 — authoritative challenge (Slice 1a)

**Goal:** make one organization-owned challenge draft, approval set, immutable published version, and public projection authoritative.

| Milestone | Deliverable                                                                  | Depends on        | Primary acceptance evidence                                                      |
| --------- | ---------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| **P2-C1** | Extend the durable challenge aggregate/version schema and full API contract  | P1-F1/P1-F4/P1-F5 | autosave, resume, stale/conflict, migration and tenant-negative tests            |
| **P2-C2** | One server readiness/validation contract for all authoring steps             | P2-C1             | draft/preview/submit return identical field errors and readiness state           |
| **P2-C3** | Version-specific technical/legal/finance approvals and ops-quality gate      | P2-C2, step-up    | author cannot self-complete required separation; wrong/stale version denied      |
| **P2-C4** | Atomic publication of immutable version, audit/outbox, and projection intent | P2-C3             | publish race yields one immutable version/receipt; rollback has no partial state |
| **P2-C5** | Separate public challenge/organization projection and catalog queries        | P2-C4             | exact allowlist; private fields absent from API/DOM/cache/export                 |
| **P2-C6** | Deadline, extend, pause, close, cancel, anonymize, and amendment commands    | P2-C4/P1-F6       | explicit reason/version/server-time behavior; notifications idempotent           |
| **P2-C7** | Org+ops+public authoritative browser journeys                                | P2-C1…C6          | real E2E, a11y, Persian/RTL, security and audit evidence                         |

**Phase gate:** an incomplete, unauthorized, stale, or insufficiently approved challenge cannot be published through direct API calls. Public output is structurally separate, exact, and traceable to the approved immutable version.

## 7. Phase 3 — authoritative proposal (Slice 1b)

**Goal:** allow an authorized solver workspace to prove eligibility and submit one immutable, versioned proposal against the exact challenge terms.

| Milestone | Deliverable                                                        | Depends on        | Primary acceptance evidence                                         |
| --------- | ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------- |
| **P3-S1** | Solver profile, privacy, verification, and evidence APIs           | P1-F3/P1-F4/P1-F7 | workspace isolation, classification, moderation and retention tests |
| **P3-S2** | Team create/invite/request/role-policy/transfer/remove/archive     | P3-S1             | exhaustive permission matrix; owner/last-manager concurrency tests  |
| **P3-S3** | Versioned eligibility engine with reasons, deadlines and overrides | P2-C4, P1-F1      | rule-version evidence; server-time and scope/type negatives         |
| **P3-S4** | Saved opportunities and authoritative direct-offer aggregate       | P2-C5, P3-S2      | two-party permissions, expiry, idempotent notification tests        |
| **P3-S5** | Workspace-scoped proposal draft and secure evidence                | P3-S2/P3-S3/P1-F7 | collaborator permissions, ID-swap and unscanned-evidence denial     |
| **P3-S6** | Submission transaction and immutable proposal version              | P3-S5             | duplicate submit → one version/receipt; deadline/version races safe |
| **P3-S7** | Clarification, revision, withdrawal, base-version diff and history | P3-S6             | immutable submitted history; explicit permissions and audit         |
| **P3-S8** | Solver+organization authoritative browser journeys                 | P3-S1…S7          | real E2E, a11y, Persian/RTL, security and notification evidence     |

**Phase gate:** no cross-workspace read/write is possible by changing IDs; role policy is enforced server-side; duplicate submission creates one locked version; deadline races use server time; every revision cites an immutable base.

## 8. Phase 4 — review and reasoned decision (Slice 1c / MVP)

**Goal:** complete the accepted MVP boundary with assignment-scoped, COI-gated review and an exact-version, reasoned organization decision.

| Milestone | Deliverable                                                         | Depends on | Primary acceptance evidence                                                    |
| --------- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| **P4-R1** | Reviewer identity, eligibility, assignment and workload policy      | P3-S6      | assignment and workload rules; no assignment enumeration                       |
| **P4-R2** | First-class COI declaration and escalation before protected access  | P4-R1      | pending/conflict gets nothing at API/object/export/cache/UI                    |
| **P4-R3** | Versioned rubric, criterion validation, rationale and draft review  | P4-R2      | exact proposal/rubric version; invalid scores rejected                         |
| **P4-R4** | Immutable final review plus separated reopen/invalidation           | P4-R3      | reviewer cannot edit final; ops action requires reason/evidence and separation |
| **P4-R5** | Blind/timed comparison and organization projections                 | P4-R4      | anonymity fields absent until policy permits; aggregation timing tested        |
| **P4-R6** | Shortlist, no-award, selection, and exact-version reasoned decision | P4-R5      | authorized step-up actor, rationale and duplicate/stale safety                 |
| **P4-R7** | Atomic selected-case creation and full correlation chain            | P4-R6      | challenge→proposal→assignment/review→decision→case trace                       |
| **P4-R8** | MVP browser, accessibility, security and funnel evidence            | P4-R1…R7   | happy and principal negative paths pass in staging                             |

**Phase gate:** the four Phase-4 security gates in [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §9 pass. Product, Security, Operations, and Architecture approve the authoritative MVP journey.

## 9. Phase 5 — execution, payment, and operations (Slice 2)

**Goal:** operate the selected case through an effective contract, governed pilot, evidence-based acceptance, non-custodial payment status, and closure.

| Milestone | Deliverable                                                        | Depends on                   | Primary acceptance evidence                                                |
| --------- | ------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| **P5-E1** | Versioned contract/IP schedules and provider-backed signature      | DEC-2026-007 sign-off, P4-R7 | authenticated/replay-safe callback reconciliation; exact effective version |
| **P5-E2** | Participation-scoped case messages/documents                       | P5-E1/P1-F7                  | classification/grant/retention/access-audit tests                          |
| **P5-E3** | Pilot plan, milestones, KPIs, evidence and change control          | P5-E1/P5-E2                  | approved baseline; reasoned immutable changes                              |
| **P5-E4** | Deliverable submit/accept/revise/reject protocol                   | P5-E3                        | exact criteria/evidence; separated authorized acceptor                     |
| **P5-E5** | Non-custodial invoice/payment schedule and status ledger           | DEC-2026-008 sign-off/P5-E1  | integer money; no platform custody; reconciliation evidence                |
| **P5-E6** | Three-gate payment command and provider integration                | P5-E4/P5-E5                  | effective contract + technical acceptance + separate finance approval      |
| **P5-E7** | Dispute, evidence, SLA, appeal and operations exception queues     | P5-E2…E6                     | separation, legal hold, bounded access, immutable resolution               |
| **P5-E8** | Closure, one-time feedback, impact evidence and case-study consent | P5-E6/P5-E7                  | reconciled payment status, consent/version and audit tests                 |
| **P5-E9** | Full execution/payment E2E and recovery certification              | P5-E1…E8                     | Phase-5 gates, provider outage/replay/reconciliation and rollback drills   |

**Phase gate:** no payment advances without an effective contract, technical acceptance, and distinct finance approval. Provider callbacks never directly become authority. Finance, Legal, Privacy, Security, and Operations approve procedures and recovery playbooks.

## 10. Phase 6 — controlled production pilot (Slice 3)

**Goal:** admit a deliberately limited real cohort only after security, privacy, legal, accessibility, reliability, and operations evidence is exercised rather than assumed.

| Milestone | Deliverable                                                         | Primary acceptance evidence                                              |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **P6-L1** | External penetration test and remediation                           | no unresolved critical/high finding; accepted retest                     |
| **P6-L2** | Privacy impact assessment, data map, rights and retention operation | access/export/correction/erasure/hold/breach exercises                   |
| **P6-L3** | Qualified legal/finance review                                      | approved terms, IP, marks/assets, contracts, payments/tax and disputes   |
| **P6-L4** | WCAG 2.2 AA review                                                  | automated plus keyboard, zoom, screen-reader and RTL manual evidence     |
| **P6-L5** | Load, resilience, queue, backup/restore/DR/reconciliation exercise  | measured RTO/RPO and SLO/error-budget evidence                           |
| **P6-L6** | On-call, support, privileged-access, incident and rollback drills   | named rotations, time-bound support consent, completed simulations       |
| **P6-L7** | Invite-only cohort readiness and go/no-go                           | participant/provider/data limits documented; cross-functional signatures |

**Phase gate:** no unresolved critical/high security, privacy, legal, accessibility, data-loss, operational, or financial finding. Product, Engineering, Security, Legal/Privacy, Finance, and Operations sign the controlled-pilot go/no-go.

## 11. Parallel execution and critical path

After P1-F1 freezes shared definitions, the following streams may overlap:

| Stream            | Work                                                    | Must wait for                           |
| ----------------- | ------------------------------------------------------- | --------------------------------------- |
| Platform          | P1-F2, deployment, observability, recovery              | environment/provider constraints        |
| Identity/Security | P1-F3 and authorization policy                          | identity/residency decision             |
| Data/Backend      | P1-F4→F6                                                | P1-F1; database environment             |
| Files/Worker      | P1-F6/F7                                                | storage/region provider; event contract |
| Web/Design        | generated client, P1-F8, a11y/performance               | stable API contract and identity flow   |
| Product/Domain    | Phase-2 readiness and approval detail                   | P1-F1                                   |
| Legal/Privacy/Ops | classifications, retention, providers, pilot procedures | named owners; can begin immediately     |

The Phase-1 critical path is normally **F1 → F4 → F5 → F8 → F10**, with F2/F3 required before authoritative E2E and F6/F7/F9 required before certification. Provider procurement and owner decisions are tracked as explicit dependencies, not hidden engineering delay.

## 12. Delivery control and Definition of Done

Before implementation, every milestone is decomposed into bounded tasks using `agent/planner.md`. Each task records:

1. goal plus requirement/ADR references;
2. current evidence and unresolved owner choices;
3. allowed files and generated artifacts;
4. boundary/data/authorization design;
5. ordered implementation steps;
6. happy, negative, security, concurrency, and recovery tests;
7. exact acceptance commands and expected evidence;
8. migration, backfill, rollout, feature-flag, and rollback strategy;
9. operational procedure and named owner;
10. deliberate out-of-scope work.

A milestone is `done` only when all four exist:

1. **Authority:** production implementation enforces the requirement server-side.
2. **Evidence:** relevant unit, contract, integration, real E2E, accessibility, security, performance, and recovery gates are green in CI.
3. **Operation:** deployment, monitoring, support, migration, backup/recovery, and incident procedures exist and have been exercised where required.
4. **Approval:** the required product/security/legal/privacy/finance/operations owner has accepted the result.

Prototype and in-memory evidence remain valuable test oracles, but never satisfy production completion by themselves.

## 13. Standard acceptance and release evidence

Existing repository gates remain mandatory for changes that touch the web or shared packages:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run verify:boundaries
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

Phase 1 must add and make CI-blocking:

- PostgreSQL migration up/down/compatibility and RLS tests;
- API/database integration and generated-contract drift tests;
- durable worker retry/lease/DLQ/restart tests;
- authoritative browser→API→database E2E;
- file quarantine/scan/signed-read integration tests;
- security headers, redaction, secret/dependency/container scans;
- backup/restore, outbox recovery, and audit-correlation exercises.

New scripts are named only when their implementation lands; the roadmap defines evidence, not false commands.

## 14. Risk, rollout, and rollback

Identity, tenancy/RLS/access grants, public projections, files, audit/outbox/idempotency, provider callbacks, payments, AI/egress, and confidential-data handling are high risk and require `agent/security.md` plus human review before release.

Default authoritative-slice rollout:

1. expand the database schema without breaking the deployed version;
2. deploy backward-compatible API/worker adapters;
3. backfill in bounded, resumable batches and verify counts/invariants;
4. enable the network composition in test/preview, then staging;
5. run contract comparison and authoritative E2E without dual production authority;
6. enable a limited production cohort through a server-owned flag;
7. observe, reconcile, and close the rollback window;
8. contract old schema or remove compatibility code in a separate reviewed change.

Rollback returns to the previous backward-compatible server version or disables the authoritative write surface. It must never redirect production reads/writes to localStorage, fixtures, QA switchers, or demo repositories. Immutable evidence and audit history are never discarded during rollback.

## 15. Progress reporting

The delivery report is outcome-based and updated at least once per delivery cycle:

- milestone status, owner, dependency, target range, and acceptance link;
- accepted decisions and named external blockers;
- authoritative journeys and principal negative scenarios passing in CI;
- migration/backfill/recovery evidence and audit completeness;
- open security/privacy/legal/accessibility/performance findings by severity;
- SLO/error-budget, provider, queue/DLQ, and operational readiness evidence;
- rollout cohort, rollback state, and reconciliation exceptions;
- product funnel measures only after real pilot data exists.

Do not report page counts or prototype coverage as authoritative delivery progress.

## 16. Explicitly deferred work

- AI matching, embeddings, pgvector, RAG, model adapters, and external model egress.
- Microservices, multi-region active/active, sharding, or event sourcing without measured need.
- Escrow/custody, automated tax, payroll, or solver-team payment splitting.
- Prize, grant, scouting, procurement-integration, and other non-MVP challenge models.
- Contract/payment implementation before their owner decisions and Phase-5 gate.
- Moving the root web into `apps/web` solely for cosmetic symmetry.
- Turning later prototype screens into production features before their roadmap phase.
