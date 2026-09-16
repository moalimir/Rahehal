# Decisions — ADRs & P0 decision log

### DEC-2026-019 — Private challenge-PDF audience

- **Status:** accepted by the owner in this task, 2026-09-16. The owner explicitly requested private PDF upload/scan/binding/download and selected invited solvers or solvers with a submitted proposal as the challenge-PDF audience.
- **Decision:** a public challenge does not make its PDFs public. In addition to the owning organization, only an actively invited solver workspace or a workspace with a submitted, non-withdrawn proposal can read the published version's attachments. Access remains tied to a live exact-version collaboration grant and current membership; NDA acknowledgement remains required when the published policy requires it. Drafting alone, knowing an ID, selecting an academic category or being logged in confers no file access.
- **Proposal PDFs:** the sending workspace and the receiving organization may read permitted files; the organization sees only attachments bound to its granted locked proposal version, never later draft attachments. Other organization roles retain their existing record permissions; owner authority does not cross tenant boundaries.
- **Implementation boundary:** the local private-volume adapter, API-signed transfers and ClamAV/qpdf integration are recorded in [88](88_PARTICIPATION_AND_PRIVATE_PDFS.md). Real local scanner/container acceptance now passes on arm64 with retained synthetic examples. This product decision is not production storage, retention, scanner operations, connected-browser certification or security-release approval.

The authoritative record of product and architecture decisions, beginning in **Phase 0**. The active MVP boundary is DEC-2026-018 (2026-09-16); earlier decisions remain binding except where explicitly superseded. Two parts:

- **Part A — Architecture Decision Records (ADRs):** technical decisions, **accepted by engineering**. They implement the canonical model ([20](20_CANONICAL_MODEL.md)) and the audit's resolutions ([30](30_CONSISTENCY_AUDIT.md)).
- **Part B — P0 decision log (DEC):** product/business/legal decisions from [95 §2](95_RISKS_AND_OPEN_QUESTIONS.md). Each has an **engineering-ratified default** so build isn't blocked, but is **`pending-owner-sign-off`** until the named owner accepts.

Status values: `accepted` · `accepted (eng) / pending-owner-sign-off` · `proposed` · `superseded`. Template for new entries: [95 §10](95_RISKS_AND_OPEN_QUESTIONS.md).

---

## Current owner decision

### DEC-2026-018 — Phase 3 baseline and lean organization–solver MVP

**M1 follow-up approval (2026-09-16):** retain every other organization role and its permissions/access control; grant the owner end-to-end authoring and direct publication in its own organization. Implement owner publication as an attributable alternative to the delegated four-gate path, not as synthetic approvals. Published evidence stays immutable. Verification and rollout are recorded in [86_M1_OWNER_PUBLICATION](86_M1_OWNER_PUBLICATION.md).

- **Status:** accepted 2026-09-16 (Product owner, initial direction and explicit follow-up agreement). This includes owner publication, Phase 4 deferral, organization selection followed by explicit solver acceptance without routine platform approval, shared agreement summary, required exit paths, and the readiness boundaries below. Only the remaining detailed policies in [26_LEAN_MVP_SCOPE](26_LEAN_MVP_SCOPE.md) section 5 remain open.
- **Decision:** use `3f80192a7ceba488bcfa4c2e0d60680f34c5f8b3` as the code baseline and prioritize independent organization–solver collaboration. The organization owner must have full challenge-management authority in their own organization, including routine publication without a distinct publisher actor or technical/legal/finance/platform approval chain. Preserve proposal, clarification/revision, direct-offer and notification flows; add only a small final selection/match flow. Defer the former Phase 4 formal reviewer, rubric, COI/scoring and review-administration programme in full. Contracts, pilots, payments, impact and AI remain outside this MVP.
- **Supersedes:** DEC-2026-003's mandatory reviewer-led MVP; mandatory platform triage and separate-actor publication gates for the target MVP in [20](20_CANONICAL_MODEL.md), [70](70_SECURITY_AND_AUTHZ.md), and AGENTS.md constraint 8; the Phase-4-completion requirement in [80](80_DELIVERY_ROADMAP.md). ADR-0015's publication queue is retained historical implementation, not a required routine MVP handoff. DEC-2026-012 does not block normal owner publication. DEC-2026-004's reviewer launch requirement is deferred; organization provisioning and DEC-2026-016's human/team and conditional-verification rules remain.
- **Retains:** canonical entities and role namespaces; server authorization and tenant scoping; no cross-tenant owner bypass; immutable exact versions; public/private separation; idempotency, concurrency, atomic audit/outbox; Persian/RTL and accessibility. COI remains mandatory if formal reviewer access is later enabled. Payment separation-of-duty rules remain binding if payment is later enabled.
- **Follow-up decision — minimum completeness:** the organization selects an exact submitted proposal/offer-response and records a reason and shared scope/terms summary; an authorized actor in the selected solver workspace explicitly accepts or declines. Only acceptance confirms the match, and no routine platform co-signature is required. Proposal rejection, no-award, challenge cancellation and solver withdrawal must have defined durable outcomes and next actions. Preserve history and require fresh acceptance for changed terms. Exact role delegation, timing, cardinality, expiry and state/schema mapping remain implementation policy work, not permission to omit these paths.
- **Follow-up decision — boundaries:** organizations and solvers settle outside Rahhal; payment gateways, paid posting/subscriptions, escrow, wallets and platform-confirmed settlement are deferred. Require reliable draft saving/recovery, clear loading/empty/error states, retry-safe actions, truthful navigation and accessible Persian/mobile UX. Clarification/revision is sufficient; real-time chat is not required. Before external-user validation, use a real reviewed auth/contact provider and one real outbound notification channel, alongside existing release gates. Private file upload is conditional on whether useful proposals need real files; if required, implement authorized private storage with quarantine/scan and signed reads rather than metadata placeholders. Channel/provider and file-necessity choices remain open; local synthetic acceptance does not require those production integrations.
- **Implementation boundary:** this is a product-policy change, not evidence that the baseline already supports self-publication or final matching. M1 must change authorization, lifecycle guards, database constraints, API and frontend coherently; M2 implements the accepted bilateral authority after specifying the remaining detailed policies. No forged approval records, frontend-only bypass, fabricated review evidence, or silent enum changes are authorized.
- **Recovery:** Phase 4 is preserved at the remote `phase-4-archive` tag (`6093c0c`). Use fresh per-device Phase 3 databases through `0021`; Git changes do not downgrade deployed schemas. Do not resume the archived branch or delete its evidence as part of ordinary MVP work.
- **Delivery and acceptance:** [26](26_LEAN_MVP_SCOPE.md) defines M0–M4 and the required flows. The external-pilot hardening gate is unchanged. This decision accepts scope, not production readiness or unexecuted tests.

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

**Context.** ADR-0005/DEC-2026-011 make `access_grant` the sole cross-tenant reach mechanism for _collaboration_ between two tenants (e.g. org ↔ solver-team) — bilateral, resource-scoped, negotiated. Phase 2 ([80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md)) needs `platform:ops` to screen rough briefs and `platform:ops`/`platform:finance`/`platform:legal` to record their publication gate on an org's challenge; those roles hold no membership in the org's workspace, and provisioning a per-challenge `access_grant` for every platform actor on every org's challenge does not fit `access_grant`'s bilateral, negotiated shape — it would simulate a "grant" the org never actually offers or accepts. ADR-0005 already recognizes one non-grant, non-membership reach category for the same reason: reviewer access, "a narrow per-assignment, COI-gated grant" resolved from assignment state, not an `access_grant` row.
**Decision.** Platform-role standing authority is a second instance of that same category: a fixed, named, narrow set of platform-owned actions that a `platform:*` role may perform against any org's workspace, resolved directly from an _active_ platform membership (`WorkspaceAuthorityUnitOfWorkPort.runAuthorizedPlatformRole`) rather than from an `access_grant` row. It carries the same liveness guarantee as every other membership check, and by the same mechanism: like `runAuthorizedWorkspace`, it revalidates the session and the platform membership _inside_ the same unit of work that performs the write, so revoking a session or suspending the membership denies immediately rather than racing an in-flight command. Resolving platform access through a bare lookup outside that unit of work is forbidden, and every allow/deny is audited. The implemented named actions are: list the active role's bounded triage/gate queue; read the matching purpose- or gate-scoped brief; allow `platform:ops` to advance a visible `triage` item to organization-owned `formulation`; and record the role's own publication gate. The full organization `ChallengeResource` is never a platform read surface, and each brief allowlist omits contact/invite/file identifiers and other actors' user ids. This does not weaken `access_grant` for actual org↔solver collaboration, and it is not a wildcard cross-tenant bypass.
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

- **Status:** superseded for the active MVP by DEC-2026-018 (2026-09-16) · **Owner:** Product
- **Historical decision:** first authoritative slice = **publish challenge → eligible solver submits locked proposal version → assigned reviewer declares COI + scores → org records reasoned decision → durable audit**. The formal review prerequisite is now deferred; contract→payment remains later scope.

### DEC-2026-004 — Launch actors

- **Status:** accepted; amended 2026-09-01 · **Owner:** Product + Operations
- **Decision:** human solver activation is self-service through the approved contact-verification provider; an activated human always receives one individual solver workspace and may create team workspaces under DEC-2026-016. Organizations, reviewers, and internal operations remain invite/provisioning-controlled. Start ~3–5 organizations and ~20–50 solvers/reviewers with non-highly-sensitive challenges. The local connected MVP may use a development-only OTP provider adapter, but external self-service does not open until provider replay/expiry/resend/rate-limit/abuse gates pass.

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

### DEC-2026-012 — Publication override: joint co-signature or own-lane

**Scope amendment (2026-09-16):** DEC-2026-018 makes owner-controlled publication the normal target MVP path. This unresolved override proposal belongs to the deferred governed-publication model; it does not block M1 or impose a platform co-signature on routine owner publication. The original Phase 2 code still enforces its existing policy until M1 is implemented.

- **Status:** proposed / **pending owner decision** · **Owner:** Product + Security · **Blocking milestone:** future publication-override exception path; does not block the completed MVP Phase 2
- **Context:** [95 §2](95_RISKS_AND_OPEN_QUESTIONS.md) answers "who can override readiness" with "Only **`org:publisher` + `platform:ops`** may override (recorded, reasoned)". That `+` is ambiguous, and nothing in the codebase resolves it because the override is not implemented. Until 2026-08-29 the ambiguity was hidden inside a single `challenge:publish` row in [70 §4](70_SECURITY_AND_AUTHZ.md) that conflated routine publication with the override; that row is now split, which exposes the question rather than answering it.
- **The question:** does an override require **both** roles to co-sign one publication, or may **each** role override within its own lane — the organization overriding brief readiness it owns, `platform:ops` overriding the publication-quality gate it owns?
- **Engineering lean (not a decision):** own-lane, because the same `95` answer continues "the **org owns brief quality; ops owns the publication-quality gate** — accountability follows the approval that let it through", which reads as each role answering for its own domain. Joint co-signature is the stricter reading and the safer default if the owner prefers to optimise for abuse resistance over operational throughput.
- **Consequences either way:** the override needs step-up, a structured reason, its own audit action distinct from `challenge.published`, and — if joint — a two-party command with its own concurrency and expiry semantics. Decide before scheduling that exception path; do not infer an answer while building routine publication or Phase 3.
- **Not affected:** routine `challenge:publish` stays `org:publisher`-only with no separate reason (B4, implemented). This decision governs only the override path.

### DEC-2026-013 — One bounded JavaScript-ceiling raise for B7's connected UI

- **Status:** accepted (eng) / **pending owner sign-off before pilot** · **Owner:** Frontend + Product · **Engineering milestone:** B7 complete ([80](80_DELIVERY_ROADMAP.md) §5)
- **Context:** [DEC-2026-009](#dec-2026-009--performance-budget-rebaseline) set the byte ceilings to the 2026-08-23 actuals plus ~2% headroom and states that ceilings are "lowered as reduction lands, **never raised** without an ADR". B7 adds the first two connected UI surfaces for the governed journey — the governance page that records attributed publication gates and publishes a version (`components/challenge-flow/governance-page.tsx`, `lib/challenges/adapters/network-governance.ts`, **+4,674 bytes**) and the public challenge view rendered strictly from B5's projection (`components/public-challenge-record.tsx`, `lib/challenges/adapters/network-public-challenges.ts`, **+3,556 bytes**). Together **+8,556 bytes**, against a ceiling that had **no remaining headroom** (1,809,000).
- **Reduction attempted first, and reported honestly:** code-splitting the page with `next/dynamic` made the metric _worse_ (1,814,559) — the budget counts total emitted JavaScript, not common-bundle bytes, so splitting adds chunk overhead without removing anything. Replacing the page's hand-written gate/role table with an inversion of the domain's `gateApproverRoles` was byte-neutral (−0 net) but kept as a correctness win: it removes a second copy of a policy that would otherwise drift from the server's.
- **Decision (engineering default):** raise `maxJavaScriptBytes` from 1,809,000 to **1,814,000** — the measured actual rounded to the next thousand, +0.28%. Deliberately _not_ re-headroomed to +2%: the next regression should fail immediately rather than coast on slack this decision granted.
- **Amended 2026-08-30 (B6):** the ceiling fired again at **+234 bytes** — five `apiRoutes` string constants for the publication-lifecycle commands, which the browser never calls but cannot tree-shake out of the single exported `apiRoutes` object. Raised to **1,819,000**. That is the _third_ time `maxJavaScriptBytes` has forced a decision, and not once has it caught real bloat: it rejected a correct code-split, and it now bills the browser for server-only route names. The metric fix recommended below should be scheduled rather than deferred again — at this rate the next raise will be indistinguishable from the ratchet this decision exists to prevent.
- **Phase-2 closure (2026-08-30):** the demo build now aliases all connected-only challenge adapters and the platform approval queue to a fail-loud stub. The measured static JavaScript total is **1,816,534 bytes**, 2,466 bytes below the existing ceiling, without another raise. The owner sign-off remains a pilot-release governance item; it does not reopen the implemented B7/Phase-2 engineering gate.
- **Consequences:** the anti-regression property is preserved at the new anchor. This does not license further raises — the payload-reduction item in DEC-2026-009 §consequences (role code-split + feature-CSS split off the ~1.3 MB common JS) still stands as the hardening-gate ([80](80_DELIVERY_ROADMAP.md) §9) response, and this ceiling drops when it lands. If the owner rejects this raise, B7's governance surface must be code-split at the _route bundle_ level or the budget metric changed to measure common payload, both larger changes than B7 owns.
- **Superseded for future enforcement:** DEC-2026-014 replaces this total-emitted-JavaScript ceiling. The figures above remain the historical record of why that metric was revised.

### DEC-2026-014 — Runtime and route-specific JavaScript budgets

- **Status:** accepted 2026-09-01 (owner + eng) · **Owner:** Product + Frontend + Architecture · **Risks:** R-07, R-14
- **Context:** after Phase 2, the demo emitted 1,818,758 bytes of JavaScript against a 1,819,000-byte ceiling: 242 bytes of headroom. That total charged every independently code-split route and server-only constant to every visit, even when the browser never loaded them. It repeatedly forced ceiling raises without identifying user-visible regressions.
- **Decision:** enforce uncompressed build-byte ceilings on (1) the largest JavaScript asset, (2) JavaScript referenced by every representative route, and (3) initial JavaScript referenced by each representative route's script/preload tags. Maintain separate baselines for `demo` and `network`. Representative routes cover landing, public catalogue/detail, solver, organization, reviewer, and platform operations. Route/shared limits use about 2% baseline headroom; the existing 736,000-byte largest-asset ceiling remains. The complete emitted JavaScript size is still printed against an exact reference baseline, but growth is a warning/trend rather than a failing gate.
- **Consequences:** adding an unloaded route chunk no longer fails unrelated journeys; adding code to the catch-all/shared bundle or a measured journey still fails. `check:budgets` owns the demo export and retains offline/CSS gates; `build:web:network` followed by `check:budgets:network` owns the connected runtime and runs in CI. New materially distinct high-traffic journeys must join the representative route set. Hard ceilings still require an explicit decision to raise, and reduction remains the G5 hardening item. The p75 LCP/INP/CLS targets from DEC-2026-009 are unchanged and require real browser/RUM evidence before pilot.

### DEC-2026-015 — Authored CSS total becomes a trend, not a gate

- **Status:** accepted 2026-09-01 (owner + eng) · **Owner:** Product + Frontend + Architecture · **Risks:** R-07, R-14
- **Context:** DEC-2026-014 removed the total-emitted-JavaScript ceiling because a sum across independently loaded chunks charged every route to every visit. The CSS half kept the same shape: `source.maxCssBytes` summed the authored bytes of seven stylesheets in `app/`, which is not the payload of any page. After the Phase-2 organization work it stood at 625,973 bytes against a 626,000-byte ceiling — 27 bytes of headroom — and a three-line explanatory comment in a stylesheet was enough to fail a release. It had begun to select for shorter comments rather than smaller payloads.
- **Decision:** retire `source.maxCssBytes` as an enforced gate and keep the authored total as a printed trend against `source.cssReferenceBytes`, exactly as DEC-2026-014 treats total emitted JavaScript. The enforced CSS ceilings remain the per-build ones that measure a real page: `staticAssets.maxCssBytes` (510,864 / 513,000) and `staticAssets.maxLargestCssBytes` (215,953 / 219,000), plus the standalone character limits. Neither enforced ceiling is raised by this decision.
- **Superseded in part:** DEC-2026-017 keeps this decision's trend line and re-measures the two enforced ceilings named below on transfer size, because they had acquired the same defect this decision removed one level up.
- **Consequences:** ordinary styling and explanatory comments no longer fail a release, while growth that actually reaches a built stylesheet still does. The trend line keeps authored growth visible so silent drift is still noticed. This does not lower the priority of design-token consolidation: two competing custom-property systems still load on every page, and that work should reduce both the trend and the enforced ceilings rather than consume their headroom. Payload reduction remains the G5 hardening item, and the DEC-2026-009 p75 LCP/INP/CLS targets are unchanged.

### DEC-2026-017 — CSS budgets measure transfer size, and carry room to work

- **Status:** accepted 2026-09-07 (owner + eng) · **Owner:** Product + Frontend + Architecture · **Risks:** R-07, R-14
- **Context:** DEC-2026-015 left the per-build CSS ceilings enforced, on the reasoning that they measure a real page. They do, but they measure it in uncompressed bytes, and they were pinned to the build that set them. `staticAssets.maxCssBytes` moved 503,436 → 513,000 → 516,000 → 520,000 inside a fortnight, `maxLargestCssBytes` sat 636 bytes under a build it then failed, and `standalone.maxBytes` had 3,353 bytes of headroom. Stylesheets are served compressed and this build's CSS gzips to 17.6% of source, so an uncompressed ceiling charges every rule about six times what it costs a reader — headroom drained six times faster than bandwidth did, and the only remedy available to an author was to edit the ceiling. `standalone.maxCssCharacters` was worse: the offline inliner rewrites every `url()` as a data URL, so roughly four fifths of that count is base64 fonts and images, and a font swap and a styling regression were indistinguishable in it.
- **Decision:** enforce the CSS budgets on gzipped transfer size — `staticAssets.maxCssTransferBytes` (99,827 / 125,000) and `maxLargestCssTransferBytes` (39,429 / 50,000) — and size every enforced CSS ceiling to keep at least a fifth of itself in headroom against the build that sets it, rather than the ~1% that made them change detectors. `standalone.maxBytes` becomes 6,500,000 against 5,175,243 and `standalone.maxJavaScriptCharacters` 2,850,000 against 2,259,118 on the same rule — both had been pinned inside 0.1% — because that artifact has to open from a disk with no server, which is the constraint that genuinely holds. Retire `staticAssets.maxCssBytes`, `maxLargestCssBytes` and `standalone.maxCssCharacters` as gates and keep all three uncompressed totals as printed trends against a reference, exactly as DEC-2026-014 treats total emitted JavaScript. gzip, not brotli, is the enforced measure: every host does at least gzip, and this output compresses about 16% smaller under brotli, so the ceiling is conservative. The JavaScript budgets DEC-2026-014 set are untouched.
- **Consequences:** measured against the build that set it, the transfer ceiling absorbs about 150 KB of further authored CSS — more than twice what the C9 stage 5 and solver-workspace styling work added over six days — while an accidentally duplicated `globals.css` still fails it. A trend line that warns permanently is one nobody reads, so a reference moves when a change deliberately accepts the growth it reports, and says so; `source.cssReferenceBytes` is re-based to 693,485 here. This does not lower the priority of design-token consolidation — two competing custom-property systems still load on every page, and that work should reduce the trend and the ceilings rather than consume this headroom. `npm run css:prune --check` must report zero before either ceiling is raised again. Payload reduction remains the G5 hardening item and the DEC-2026-009 p75 LCP/INP/CLS targets are unchanged; those still require real browser/RUM evidence.

### DEC-2026-016 — Human activation, team onboarding, and conditional solver verification

- **Status:** accepted 2026-09-01 (Product) · **Owner:** Product · **Review:** Security · **Blocking milestone:** Phase 3 C1/C4/C7
- **Context:** the current signup UI asks whether the user is joining as an individual or team, but its authoritative behavior activates only the human's individual solver context; team creation already exists as a separate workspace command and initializes team verification as `not_started`. Treating the UI choice as a distinct “team account” would conflict with DEC-2026-011's one-human/many-workspaces boundary and ADR-0010's provider-owned credential boundary. Requiring every team to be verified before it can exist would also be stricter than the versioned challenge eligibility policy.
- **Decision:** signup first verifies a human contact through the approved identity provider and activates one app identity with exactly one permanent individual solver workspace. The initial individual/team choice is onboarding intent, not an account or credential type. If team intent is selected, a separate, resumable C2 command creates a team workspace, a canonical `TeamKind` profile, and `team:owner` membership; the team never receives a shared login. Contact verification does not imply solver-workspace verification. A new individual or team workspace may begin with verification state `not_started`; it may complete its profile, invite members, browse and save opportunities, and draft proposals while unverified. The exact published challenge version decides whether verified status is required, and C4 re-evaluates that rule server-side when submitting: an unverified workspace may submit when `verification_required=false` and must be denied with an actionable reason when it is `true`. University, supervisor, employer, and legal-affiliation details are separate profile/verification facts and never new `TeamKind` values.
- **Consequences:** connected login has one human credential flow followed by explicit workspace selection. Signup commits human activation before optional team creation so a team-step failure cannot roll back or duplicate the individual account; the incomplete team draft remains resumable. A successful team path opens the new team workspace. Dashboard and settings surfaces show the active workspace's verification status and link to a dedicated workflow, without labeling `not_started` as verified or blocking unrelated product use. The owner-supplied OTP API may implement the provider boundary or sit behind its adapter; if it instead makes Rahhal own OTP authentication, ADR-0010 must be amended before implementation.
