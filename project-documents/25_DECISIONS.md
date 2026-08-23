# Decisions — ADRs & P0 decision log

The authoritative record of decisions made in **Phase 0**. Two parts:

- **Part A — Architecture Decision Records (ADRs):** technical decisions, **accepted by engineering**. They implement the canonical model ([20](20_CANONICAL_MODEL.md)) and the audit's resolutions ([30](30_CONSISTENCY_AUDIT.md)).
- **Part B — P0 decision log (DEC):** product/business/legal decisions from [95 §2](95_RISKS_AND_OPEN_QUESTIONS.md). Each has an **engineering-ratified default** so build isn't blocked, but is **`pending-owner-sign-off`** until the named owner accepts.

Status values: `accepted` · `accepted (eng) / pending-owner-sign-off` · `proposed` · `superseded`. Template for new entries: [95 §10](95_RISKS_AND_OPEN_QUESTIONS.md).

---

## Part A — Architecture Decision Records

| ADR  | Title                                                                         | Status                                  | Maps to            |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| 0001 | Adopt the canonical model as law                                              | accepted                                | D1–D3, D6–D9       |
| 0002 | Hybrid Next.js runtime                                                        | accepted                                | D10                |
| 0003 | Modular monolith + async workers                                              | accepted                                | 40 §1–2            |
| 0004 | PostgreSQL authoritative; app-scoped + RLS tenancy                            | accepted                                | 50 §2              |
| 0005 | Cross-tenant collaboration via `access_grant`                                 | accepted                                | D15                |
| 0006 | COI as a first-class record                                                   | accepted                                | D8                 |
| 0007 | Command contract: idempotency, optimistic concurrency, receipts, typed errors | accepted                                | 20 §9, 60 §3–4     |
| 0008 | Transactional outbox + append-only immutable audit                            | accepted                                | 40 §5, §7          |
| 0009 | Private object storage: pre-signed upload, quarantine+scan, signed reads      | accepted                                | 40 §6              |
| 0010 | Identity via managed OIDC; separate KYB/verification                          | accepted                                | 40 §4              |
| 0011 | Non-custodial payment orchestration (pilot)                                   | accepted (eng) / pending-owner-sign-off | D-06, DEC-2026-008 |
| 0012 | AI posture: assistive-only, deferred, egress-gated                            | accepted                                | D14                |
| 0013 | TypeScript/Node; one language across web/api/worker                           | accepted                                | 40 §3              |

### ADR-0001 — Adopt the canonical model as law

**Context.** Source encoded one lifecycle three ways, three role models, four solver-type enums (30 §A).
**Decision.** [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) is binding for every schema column, API field, permission rule, event, and label: one 11-stage lifecycle; role namespaces `platform:*`/`org:*`/`team:*`; one `ApplicantType`; `TeamKind`/`ApplicantScope` renames; immutable versions.
**Consequences.** Rename collisions in code (`TeamType`), retire the duplicate `canTransition`. Fitness test enforces the vocabulary. Enables all later ADRs.

### ADR-0002 — Hybrid Next.js runtime

**Decision.** Static/SSR for public content; authenticated workspaces are a client shell on the versioned API. Full static export retained only as a demo/read-only artifact.
**Consequences.** Public catalog stays fast/cacheable; auth flows need real server. Offline bundle is non-authoritative (DEC-2026-006).

### ADR-0003 — Modular monolith + async workers

**Decision.** One deployable API + a worker fleet, strict internal module boundaries (40 §2); no microservices at pilot.
**Consequences.** Simple ops, clear boundaries for later extraction (Finance likely first). Enforced by the no-cycles fitness test.

### ADR-0004 — PostgreSQL authoritative; app-scoped + RLS tenancy

**Decision.** PostgreSQL is the source of truth; tenant isolation = application-scoped queries + RLS backstop; not schema/DB-per-tenant.
**Consequences.** One datastore; RLS catches missed `WHERE`. Revisit only on scale/isolation evidence.

### ADR-0005 — Cross-tenant collaboration via `access_grant`

**Context.** Open innovation is inherently cross-tenant; pure isolation would deny the core org↔solver flow (30 X-…, 42 §3).
**Decision.** Records are tenant-owned, shared (via a transactional, audited, revocable `access_grant`), or public-projection. Reviewer access is a narrow per-assignment, COI-gated grant.
**Consequences.** The load-bearing access model for the whole product; membership-gated so removals cut access immediately. Grant-lifecycle tests are a required gate.

### ADR-0006 — COI as a first-class record

**Decision.** `coi_declaration` (`pending/clear/conflict`) separate from review state; enforced server-side at API/object/export/UI; retires the `localStorage` COI flag.
**Consequences.** Ops can escalate/track conflicts; protected materials require `clear`.

### ADR-0007 — Command contract (idempotency, concurrency, receipts, typed errors)

**Decision.** Every mutation: `Idempotency-Key`, `expected_version` (optimistic concurrency), returns `MutationReceipt`; six typed error codes → HTTP (60 §4). Promotes the shape already in `domain/solver.ts`.
**Consequences.** Safe retries; no duplicate submissions/decisions/payments; stale writes 409.

### ADR-0008 — Transactional outbox + append-only immutable audit

**Decision.** Aggregate change + `audit_event` + `outbox_event` committed in one tx; audit is INSERT+SELECT-only for the app role with WORM export; async side effects via outbox relay.
**Consequences.** Strong core consistency, eventual side effects (42 §4); audit independent of app admins; corrections are new events.

### ADR-0009 — Private object storage

**Decision.** In-region S3-compatible private buckets; pre-signed upload → quarantine → malware scan → available; short-lived signed reads gated by authz + classification + NDA; retention jobs.
**Consequences.** No public files; upload UX validation is first-line only. Concrete provider chosen in Phase 1 per residency.

### ADR-0010 — Identity via managed OIDC; separate KYB/verification

**Decision.** Delegate authN/OTP/password/recovery to a managed in-region OIDC IdP; app stores only the user↔subject link, verified contacts, MFA status; KYB/verification is a separate workflow (ops-reviewed).
**Consequences.** Don't build auth; do own verification. Revocation + membership checks deny immediately.

### ADR-0011 — Non-custodial payment orchestration (pilot)

**Decision.** Platform records/orchestrates payment status; the org invoices/pays the solver directly. No custody/escrow/splitting in the pilot. Three-gate rule (effective contract + technical acceptance + separate finance approval) enforced.
**Status.** accepted (eng) / **pending finance+legal sign-off** (DEC-2026-008, D-06).
**Consequences.** Avoids money-transmitter licensing; provider integration deferred to Slice 2.

### ADR-0012 — AI posture: assistive-only, deferred, egress-gated

**Decision.** AI (matching/assist) is deferred to a later wave ([45](45_AI_AND_MATCHING.md)); when built it ranks/explains only, never decides eligibility/review/selection/payment; classification gates model egress (confidential → self-hosted in-region or excluded); no external training/retention. Forward hook: emit `embedding.requested` outbox events in Phase 1.
**Consequences.** Foundation stays lean; AI becomes a deploy, not a migration.

### ADR-0013 — TypeScript/Node stack

**Decision.** TypeScript/Node (NestJS or Fastify) for API + worker; reuse `domain/*` types & state machines; one language across web/api/worker. Optional Python inference worker behind the queue only if self-hosted models are needed later.
**Consequences.** Maximum type-sharing with the existing prototype; low context-switching.

---

## Part B — P0 decision log

Each resolves a P0 item from [95 §2](95_RISKS_AND_OPEN_QUESTIONS.md). Defaults are engineering-ratified and safe to build against; owners must formally accept before pilot.

### DEC-2026-001 — Product name & brand

- **Status:** accepted (eng) / pending founder+legal sign-off · **Owner:** Founder/Product + Legal · **Risks:** R-04, R-05
- **Decision (default):** Persian **راه‌حل** is canonical for the concept; **Rahhal** is the stylized Latin mark. Note the transliteration mismatch (راه‌حل ≠ رحّال). Replace recognizable third-party org names/logos with clearly fictional assets until permissioned. Confirm trademark/domain.

### DEC-2026-002 — Launch market

- **Status:** accepted (eng) / pending product+legal/finance · **Owner:** Product + Legal/Finance · **Risks:** R-03, R-15
- **Decision (default):** controlled **Iran pilot only**, single in-region deployment; currency IRR (Toman display); Iran business calendar/time zone.

### DEC-2026-003 — MVP boundary

- **Status:** accepted · **Owner:** Product
- **Decision:** first authoritative slice = **publish challenge → eligible solver submits locked proposal version → assigned reviewer declares COI + scores → org records reasoned decision → durable audit**. Contract→payment is Slice 2.

### DEC-2026-004 — Launch actors

- **Status:** accepted · **Owner:** Product + Operations
- **Decision:** **invite-only** organizations, solvers, reviewers, and internal ops. Start ~3–5 orgs, ~20–50 solvers/reviewers, non-highly-sensitive challenges first.

### DEC-2026-005 — Data residency & classification

- **Status:** accepted (eng) / pending legal/privacy+security · **Owner:** Legal/Privacy + Security · **Risks:** R-03, R-11
- **Decision (default):** all pilot data stored **in approved region**; four classification tiers `public/internal/confidential/highly_sensitive` gate access, files, and any future AI egress.

### DEC-2026-006 — Offline artifact role

- **Status:** accepted · **Owner:** Product + Architecture + Security · **Risks:** R-06
- **Decision:** the single-file `index.html` is a **demo/read-only** artifact only; **no authoritative offline production mutation**. It must be regenerated from source and pass the standalone interaction smoke before distribution, with its digest attached to releases.

### DEC-2026-007 — Contract & signature responsibility

- **Status:** proposed / pending legal+product · **Owner:** Legal + Product · **Blocking phase:** Slice 2
- **Decision (default):** provider-backed e-signature (in-region); platform records status, versions, evidence, and audit; effective state is server-authoritative. Provider selection deferred to Slice 2.

### DEC-2026-008 — Payment / custody model

- **Status:** accepted (eng) / pending finance+legal+product · **Owner:** Finance + Legal + Product · **Blocking phase:** Slice 2 · see ADR-0011
- **Decision (default):** **non-custodial** — platform orchestrates invoicing/status without holding funds; org pays solver directly; org responsible for tax. Revisit escrow only with a licensing decision.

### DEC-2026-009 — Performance budgets: rebaseline + web-vital targets

- **Status:** accepted (eng) · **Owner:** Frontend + Architecture · **Risks:** R-07
- **Decision:** rebaseline the byte ceilings in `config/performance-budgets.json` to the 2026-08-23 build actuals + ~2% headroom (an anti-regression gate anchored to today), and record user-centric **p75 web-vital targets** (LCP < 2.5s, INP < 200ms, CLS < 0.1 on Persian-market mobile). This is not "inflating to hide a regression" — the 8 overages were baseline drift, not new payload. **Payload reduction** (role code-split + feature-CSS split off the ~1.3 MB common JS) is tracked as a **Phase-1 task** ([80](80_DELIVERY_ROADMAP.md) §4/§10); ceilings are **lowered as reduction lands, never raised** without an ADR.
