# Decisions — ADRs & P0 decision log

The authoritative record of decisions made in **Phase 0**. Two parts:

- **Part A — Architecture Decision Records (ADRs):** technical decisions, **accepted by engineering**. They implement the canonical model ([20](20_CANONICAL_MODEL.md)) and the audit's resolutions ([30](30_CONSISTENCY_AUDIT.md)).
- **Part B — P0 decision log (DEC):** product/business/legal decisions from [95 §2](95_RISKS_AND_OPEN_QUESTIONS.md). Each has an **engineering-ratified default** so build isn't blocked, but is **`pending-owner-sign-off`** until the named owner accepts.

Status values: `accepted` · `accepted (eng) / pending-owner-sign-off` · `proposed` · `superseded`. Template for new entries: [95 §10](95_RISKS_AND_OPEN_QUESTIONS.md).

---

## Part A — Architecture Decision Records

| ADR  | Title                                                                          | Status                                  | Maps to            |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------- | ------------------ |
| 0001 | Adopt the canonical model as law                                               | accepted                                | D1–D3, D6–D9       |
| 0002 | Hybrid Next.js runtime                                                         | accepted                                | D10                |
| 0003 | Modular monolith + async workers                                               | accepted                                | 40 §1–2            |
| 0004 | PostgreSQL authoritative; app-scoped + RLS tenancy                             | accepted                                | 50 §2              |
| 0005 | Cross-tenant collaboration via `access_grant`                                  | accepted                                | D15                |
| 0006 | COI as a first-class record                                                    | accepted                                | D8                 |
| 0007 | Command contract: idempotency, optimistic concurrency, receipts, typed errors  | accepted                                | 20 §9, 60 §3–4     |
| 0008 | Transactional outbox + append-only immutable audit                             | accepted                                | 40 §5, §7          |
| 0009 | Private object storage: pre-signed upload, quarantine+scan, signed reads       | accepted                                | 40 §6              |
| 0010 | Identity via managed OIDC; separate KYB/verification                           | accepted                                | 40 §4              |
| 0011 | Non-custodial payment orchestration (pilot)                                    | accepted (eng) / pending-owner-sign-off | D-06, DEC-2026-008 |
| 0012 | AI posture: assistive-only, deferred, egress-gated                             | accepted                                | D14                |
| 0013 | TypeScript/Node; one language across web/api/worker                            | accepted                                | 40 §3              |
| 0014 | Fastify 5 transport over injected application ports                            | accepted                                | 40 §3, 60          |
| 0015 | Platform-role standing authority is narrower than `access_grant` collaboration | accepted                                | D15, DEC-2026-011  |

### ADR-0001 — Adopt the canonical model as law

**Context.** Source encoded one lifecycle three ways, three role models, four solver-type enums (30 §A).
**Decision.** [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) is binding for every schema column, API field, permission rule, event, and label: one 11-stage lifecycle; role namespaces `platform:*`/`org:*`/`team:*`; one `ApplicantType`; `TeamKind`/`ApplicantScope` renames; immutable versions.
**Consequences.** Rename collisions in code (`TeamType`), retire the duplicate `canTransition`, derive `ApplicantScope` from the authoritative detailed set (DEC-2026-010), and migrate all persisted team roles to `team:*`. Fitness tests enforce the vocabulary. Enables all later ADRs.

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

**Decision.** Every mutation: `Idempotency-Key`, `expected_version` (optimistic concurrency), returns the canonical API receipt; seven typed error codes → HTTP (60 §4), including the distinct `STEP_UP_REQUIRED`. Promotes and extends the shape already in `domain/solver.ts` without keeping a competing API error vocabulary.
**Consequences.** Safe retries; no duplicate submissions/decisions/payments; stale writes 409.

### ADR-0008 — Transactional outbox + append-only immutable audit

**Decision.** Aggregate change + `audit_event` + `outbox_event` committed in one tx; audit is INSERT+SELECT-only for the app role with WORM export; async side effects via outbox relay.
**Consequences.** Strong core consistency, eventual side effects (42 §4); audit independent of app admins; corrections are new events.

### ADR-0009 — Private object storage

**Decision.** In-region S3-compatible private buckets; pre-signed upload → quarantine → malware scan → available; short-lived signed reads gated by authz + classification + NDA; retention jobs.
**Consequences.** No public files; upload UX validation is first-line only. Concrete provider chosen in Phase 1 per residency.

### ADR-0010 — Identity via managed OIDC; separate KYB/verification

**Decision.** Delegate authN/OTP/password/recovery to a managed in-region OIDC IdP; app stores only the user↔subject link, verified contacts, MFA status; KYB/verification is a separate workflow (ops-reviewed).
**Consequences.** Don't build auth; do own verification. Revocation + membership checks deny immediately. A2 proves the provider-neutral authorization-code + PKCE boundary with pinned `openid-client` and a synthetic local Dex provider; this is development evidence, not selection or approval of the production IdP.

### ADR-0011 — Non-custodial payment orchestration (pilot)

**Decision.** Platform records/orchestrates payment status; the org invoices/pays the solver directly. No custody/escrow/splitting in the pilot. Three-gate rule (effective contract + technical acceptance + separate finance approval) enforced.
**Status.** accepted (eng) / **pending finance+legal sign-off** (DEC-2026-008, D-06).
**Consequences.** Avoids money-transmitter licensing; provider integration deferred to Slice 2.

### ADR-0012 — AI posture: assistive-only, deferred, egress-gated

**Decision.** AI (matching/assist) is deferred to a later wave ([45](45_AI_AND_MATCHING.md)); when built it ranks/explains only, never decides eligibility/review/selection/payment; classification gates model egress (confidential → self-hosted in-region or excluded); no external training/retention. Phase 1 defines a provider-neutral outbox envelope only and does not emit AI events or provision AI infrastructure.
**Consequences.** Foundation stays lean. Enabling AI later requires its own approved RFC, data-classification review, schema migration, and deployment.

### ADR-0013 — TypeScript/Node stack

**Decision.** TypeScript/Node for API + worker; reuse browser-free primitives from `packages/domain`. The shared package owns the canonical challenge lifecycle, while root `domain/state-machines.ts` retains the remaining prototype sub-entity oracles until their authoritative slices move them behind shared server-safe boundaries. One language spans web/api/worker. ADR-0014 selects Fastify 5 for transport. Optional Python inference worker behind the queue only if self-hosted models are needed later.
**Consequences.** Maximum type-sharing with the existing prototype; low context-switching.

### ADR-0014 — Fastify 5 transport over injected application ports

**Decision.** Use Fastify 5 for the initial Node API transport. Route modules validate the versioned JSON contract and depend on injected session, workspace, and challenge application ports; Fastify, demo repositories, and provider adapters remain outside `packages/domain` and `packages/contracts`.
**Consequences.** The API is testable through in-process HTTP injection, starts quickly, and does not couple domain policy to a framework. The initial in-memory composition is explicitly demo-only and refuses production mode. A1c adds an explicit PostgreSQL composition with no fallback; A2 adds local provider-neutral OIDC while still refusing production. The managed IdP decision and browser network composition remain release requirements.

### ADR-0015 — Platform-role standing authority is narrower than `access_grant` collaboration

**Context.** ADR-0005/DEC-2026-011 make `access_grant` the sole cross-tenant reach mechanism for _collaboration_ between two tenants (e.g. org ↔ solver-team) — bilateral, resource-scoped, negotiated. B2 ([80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md)) needs `platform:ops`/`platform:finance`/`platform:legal` to record their publication gate on any org's challenge; those roles hold no membership in the org's workspace, and provisioning a per-challenge `access_grant` for every platform actor on every org's challenge does not fit `access_grant`'s bilateral, negotiated shape — it would simulate a "grant" the org never actually offers or accepts. ADR-0005 already recognizes one non-grant, non-membership reach category for the same reason: reviewer access, "a narrow per-assignment, COI-gated grant" resolved from assignment state, not an `access_grant` row.
**Decision.** Platform-role standing authority is a second instance of that same category: a fixed, named, narrow set of platform-owned actions (currently: recording one of the four B2 publication gates) that a `platform:*` role may perform against any org's workspace, resolved directly from an _active_ platform membership (`WorkspaceAuthorityUnitOfWorkPort.runAuthorizedPlatformRole`) rather than from an `access_grant` row. It carries the same liveness guarantee as every other membership check, and by the same mechanism: like `runAuthorizedWorkspace`, it revalidates the session and the platform membership _inside_ the same unit of work that performs the write, so revoking a session or suspending the membership denies immediately rather than racing an in-flight command. Resolving platform access through a bare lookup outside that unit of work is the one implementation shape this decision forbids — and every decision (allow and deny) is recorded through the same `audit_event` pipeline as every other authorization decision ([70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §2). It does not weaken `access_grant` for actual org↔solver collaboration, and it is not a general cross-tenant read/write escape hatch: each action a platform role reaches this way must be individually named in code (`gateApproverRoles`), never a wildcard.
**Consequences.** [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §2's "Reach" step gets a fourth case alongside same-tenant / `access_grant` / public-projection: standing platform authority for a specific named action. Future platform-wide oversight actions (e.g. a platform-level review or audit capability) may reuse this same pattern instead of provisioning per-org `access_grant` rows, but any such addition is itself a new, reviewed decision, not an automatic extension of this one, and must stay within the "fixed, narrow, named action" boundary.

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
- **Decision:** rebaseline the byte ceilings in `config/performance-budgets.json` to the 2026-08-23 build actuals + ~2% headroom (an anti-regression gate anchored to today), and record user-centric **p75 web-vital targets** (LCP < 2.5s, INP < 200ms, CLS < 0.1 on Persian-market mobile). This is not "inflating to hide a regression" — the 8 overages were baseline drift, not new payload. **Payload reduction** (role code-split + feature-CSS split off the ~1.3 MB common JS) is a hardening-gate perf item ([80](80_DELIVERY_ROADMAP.md) §9), not MVP-blocking; ceilings are **lowered as reduction lands, never raised** without an ADR.

### DEC-2026-010 — Applicant scope is a derived projection

- **Status:** accepted 2026-08-27 (owner, doc 27) · **Owner:** Product · **Blocking milestone:** Phase 2 (challenge authoring)
- **Decision (default):** `allowedApplicantTypes` is authoritative. `ApplicantScope` is derived as: empty set → `null`; individual only → `person`; team kinds only → `team`; individual plus at least one team kind → `both`. It is not independently authored and never expands the detailed allow-set.
- **Consequences:** browser-store v9 normalizes existing contradictions on read; web authoring computes the scope; the API returns `VALIDATION/derived_value` for contradictory compatibility input. Database writes compute/validate the projection. Reversing this decision requires a migration and eligibility review.

### DEC-2026-011 — Tenant/workspace identity boundary

- **Status:** accepted 2026-08-27 (owner, doc 27) · **Owner:** Product + Security · **Blocking milestones:** Phase 1 (first production migration)
- **Decision (default):** tenant kinds are `organization`, `solver`, and `platform`. Organization workspaces belong to an organization tenant; each individual or team solver workspace belongs to a solver tenant; platform workspaces belong to the platform tenant. One user identity may hold active memberships across multiple tenants/workspaces. A solver company remains a `team` workspace with `TeamKind=company`, not an organization tenant; a company that also publishes challenges receives a separate organization tenant. Cross-tenant collaboration is possible only through the explicit `access_grant` model.
- **Consequences:** every protected row has one owning tenant; context switching is explicit; membership removal cuts access immediately; team ownership transfer does not change tenant ownership. The first production migration must encode tenant kind and workspace-kind compatibility constraints after owner approval.
- **Amended by ADR-0015 (2026-08-28):** "cross-tenant collaboration is possible only through `access_grant`" governs bilateral, negotiated tenant-to-tenant collaboration. It does not extend to a platform role's standing, role-derived authority over a fixed, narrow, named action set across every org tenant (first instance: B2 publication-gate recording) — see ADR-0015.
