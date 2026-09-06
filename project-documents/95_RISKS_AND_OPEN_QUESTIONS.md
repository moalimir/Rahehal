# Risks and open questions

> **▶ Recommended answers added (2026-08-23; launch-actor answer amended 2026-09-01).** Every open question in §3–§9 now carries a **▶ Recommendation** — the best option for _this_ project (governed open-innovation, Persian-first, controlled Iran pilot, cross-tenant collaboration), consistent with the canonical model and decisions in [00_OVERVIEW](00_OVERVIEW.md) §4. These are engineering-ratified defaults ready to build against; items tagged _(needs … sign-off)_ still require the named business/legal/finance owner to formally accept before pilot. The §2 P0 table's "Proposed default" column already reflects these.

## 1. Risk register

| ID   | Severity | Risk and evidence                                                                                                                        | Consequence                                                                                | Recommended treatment                                                                                                           |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Critical | Browser storage and frontend guards are the current authority for sessions, permissions, COI, proposals, approvals, payments, and audit. | Confidentiality breach, unauthorized action, mutable evidence, financial/legal failure     | Production-block all real data; implement Phase 1 server authority and adversarial access tests.                                |
| R-02 | Critical | The prototype models the entire lifecycle, but no production backend capability exists.                                                  | Progress can be mistaken for production readiness; integration work is underestimated.     | Measure authoritative vertical slices, not pages; approve the MVP boundary and roadmap exit gates.                              |
| R-03 | Critical | Legal/privacy/payment/identity/IP/dispute rules are demo content without qualified approval.                                             | Unenforceable terms, privacy violations, incorrect payments/tax, disputes                  | Run legal, privacy, finance, and security workstreams before pilot; record approvals and effective versions.                    |
| R-04 | High     | Product naming is inconsistent: Rahhal suggests `رحّال`, while UI text uses `راه‌حل`.                                                    | Brand confusion, wrong domain/marks, inconsistent contracts and communications             | Decide canonical Persian/English name, transliteration, trademark/domain, and update package/UI/docs/assets.                    |
| R-05 | High     | Recognizable organization names/logos are included, including a `real` asset directory, while data is described as demo.                 | Trademark/endorsement claims and public reputational risk                                  | Obtain permission or replace with clearly fictional assets; maintain provenance/licenses.                                       |
| R-06 | High     | Checked-in offline bundle passes structural checks but fails the current login-to-workspace smoke flow.                                  | Distributed demo behaves differently from source; stale artifact can mislead stakeholders. | Regenerate from current source, fix/test, attach artifact digest to releases; decide if offline is demo/read-only.              |
| R-07 | High     | Byte gates pass, but most catch-all routes still reference about 1.32 MB demo / 1.35 MB connected initial JS plus roughly 500 KB CSS.    | Slow Persian-market mobile experience, poor Core Web Vitals, maintenance cost              | Keep DEC-2026-014 route/shared gates, collect p75 evidence, split role code and feature CSS, test constrained devices/networks. |
| R-08 | High     | Playwright Chromium and visual Golden Master are absent; browser assertions did not run.                                                 | RTL, collision, focus, overflow, font, contrast, and responsive defects remain unproven.   | Pin/install browser in CI, review baseline, run behavior/visual/accessibility gates on every release.                           |
| R-09 | High     | No CI/CD, environment contract, deployment definitions, migration/rollback process, or source revision metadata in this snapshot.        | Non-reproducible releases, configuration drift, untraceable incidents                      | Complete Phase 0 CI/release engineering and restore/use Git history in the authoritative repository.                            |
| R-10 | High     | Plain clean install omitted Sharp/libvips on audited macOS ARM64.                                                                        | New developers/CI cannot build without manual recovery.                                    | Reproduce across supported platforms, pin runtime/npm, make optional dependency handling deterministic.                         |
| R-11 | High     | No observability, analytics governance, SLOs, alerting, incident response, backup/restore, or DR evidence.                               | Failures/data loss go undetected; no operational readiness                                 | Build telemetry and recovery at the pre-pilot hardening gate; exercise restore/reconciliation before pilot.                     |
| R-12 | Medium   | Several components/data modules exceed 1,000 lines; CSS is 30,531 lines with 82 `!important` declarations.                               | Slow changes, hidden coupling, visual regressions, payload growth                          | Refactor by domain boundary while adding API adapters; enforce source/payload architecture checks.                              |
| R-13 | Medium   | Four React Compiler lint diagnostics are disabled after the Next upgrade.                                                                | Latent hook/purity/state issues and harder future upgrades                                 | Re-enable one rule at a time, fix behavior with targeted regression/browser tests, document exceptions.                         |
| R-14 | Medium   | Static route generation includes hundreds of fixture/entity paths and compatibility routes.                                              | Large builds, accidental fixture exposure, unclear canonical navigation                    | Separate demo data from production routes, generate only valid published/authorized static projections, monitor route budgets.  |
| R-15 | Medium   | Persian date/currency/time and Iran-specific mobile validation are embedded, while launch geography is unapproved.                       | Incorrect internationalization, compliance, currency, and deadline behavior                | Approve market/currency/calendar/time-zone scope; centralize locale and money/time contracts.                                   |
| R-16 | Medium   | The snapshot has no root license, contribution guide, security policy, or ownership file.                                                | Unclear rights, vulnerability channel, review responsibility, and onboarding               | Add approved license/proprietary notice, `SECURITY.md`, contribution/release guide, and CODEOWNERS equivalent.                  |

**Status update (2026-08-30), per [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md):** this register is the original 2026-08-20 audit snapshot and is not auto-updated as work lands — treat the items below as resolved/narrowed rather than open, and everything else in the table as still accurate. **R-10 (Sharp/libvips):** resolved. **R-06 (offline bundle smoke):** resolved. **R-08 (Playwright/visual):** behavior is covered; only the human visual Golden Master remains. **R-09 (no CI/CD or migrations):** narrowed — CI gates and checksummed reversible migrations through `0010` exist; the first Linux CI run and staging/production rollback definitions remain open. **R-01/R-02 (browser-authority, no backend):** narrowed through Phase 2 — the connected challenge slice is authoritative from draft through governed publication, live-call controls, platform approval work, and public detail. Proposal, review, decision, execution, and payment remain browser/mock authority until their roadmap phases land.

## 2. P0 product decisions

These questions block architecture or MVP delivery.

| Decision                              | Why it matters                                                       | Suggested owner                   | Blocking phase | Proposed default for planning                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------- | --------------------------------- | -------------: | -------------------------------------------------------------------------------------------------------------------- |
| Canonical product name and brand      | Affects package, domains, marks, UI, contracts, communication        | Founder/product + legal           |              0 | Use `راه‌حل` in Persian and choose an unambiguous approved Latin name.                                               |
| Launch country/market                 | Controls identity, privacy, currency, tax, contract, payment, locale | Product + legal/finance           |              0 | Controlled Iran pilot only, subject to qualified review.                                                             |
| MVP journey                           | Determines which current screens become real first                   | Product                           |              0 | Publish challenge → proposal → COI/review → decision.                                                                |
| Launch actors                         | Changes identity, permissions, operations and support                | Product + operations              |              0 | Self-service verified human solvers; organizations, reviewers, and internal ops remain controlled.                   |
| Tenant/workspace model                | Foundation for every authorization and data query                    | Architecture + security           |              1 | User can join multiple workspaces; every protected record has one owning tenant/workspace and explicit participants. |
| Identity provider and assurance       | Determines auth/session/MFA/recovery/KYB integration                 | Security + engineering            |              1 | Managed standards-based IdP plus separate verification/KYB workflows.                                                |
| Data residency and classifications    | Controls hosting, files, backups, support and audit                  | Legal/privacy + security          |              1 | Classify public/internal/confidential/highly sensitive; keep pilot data in approved region.                          |
| Offline artifact role                 | Static export and auth/data architecture differ sharply              | Product + architecture + security |              0 | Demo/read-only artifact; no authoritative offline production mutation.                                               |
| Contract and signature responsibility | Determines legal workflow/provider and effective state               | Legal + product                   |            0/5 | Provider-backed signatures; platform records status, versions, evidence and audit.                                   |
| Payment/custody model                 | Determines licensing, ledger, risk and integration scope             | Finance + legal + product         |            0/5 | Platform orchestrates invoicing/status without holding funds unless separately approved.                             |

## 3. Product questions

- What is the primary buyer and economic customer: innovation office, operations/business unit, procurement, HR/R&D, or another party?
  - **▶** The **problem-owning sponsor** — the innovation office or the operations/business-unit head who owns the problem's budget. Procurement is a contracting gate, not the buyer. Sell to the pain+budget owner.
- What is the north-star outcome: published qualified challenges, successful pilots, accepted outcomes, paid solver value, or verified impact?
  - **▶** **Cases that reach an accepted outcome with reconciled payment and recorded impact** ([10_PRODUCT_VISION](10_PRODUCT_VISION.md) §7). Everything upstream is a leading indicator, not the north star.
- Is the product a marketplace, managed innovation service, SaaS workflow, or a combination? Which steps require Rahhal staff?
  - **▶** A **governed SaaS workflow with a managed-service layer during the pilot**. Rahhal ops own verification/KYB, the publication-quality gate, reviewer assignment, dispute handling, and payment-exception review; everything else is automated. Productize the managed steps as volume proves patterns.
- Which challenge collaboration models are supported at launch: public call, invitation, scouting, research, prize, paid discovery, PoC, pilot, procurement?
  - **▶** Launch with **public call, invitation (direct offer), and PoC/pilot** — they exercise the full lifecycle already modeled. Defer prize, scouting, research grants, paid discovery, and procurement integration (extra legal/financial complexity, no new lifecycle learning).
- What makes a challenge ready, who can override readiness, and who is accountable for a poor/unsafe brief?
  - **▶** Ready = the shared readiness contract (problem, measurable success criteria, scope, IP terms, budget model, visibility, deadline) passes validation **and** the technical/legal/finance approvals **and** the ops quality gate. Only **`org:publisher` + `platform:ops`** may override (recorded, reasoned). _(The `+` is not yet resolved — joint co-signature or each role overriding in its own lane? See [DEC-2026-012](25_DECISIONS.md). It blocks only that future exception path, not routine publication, completed Phase 2, or Phase 3.)_ The **org owns brief quality; ops owns the publication-quality gate** — accountability follows the approval that let it through.
- Can an organization cancel, extend, pause, edit, or anonymize a published challenge? What happens to existing proposals?
  - **▶** Yes — all are **explicit, audited, reasoned transitions**: extend (notifies solvers); pause (hidden from discovery, proposals preserved); cancel (closes; in-flight proposals closed with notice + any promised compensation); post-publish edits only via a **new challenge version** (material changes notify + let solvers reconfirm/withdraw); anonymize = swap org identity in the public projection only. Never silently change terms under a submitted proposal.
- What feedback is guaranteed to non-selected solvers, under what SLA, and what information is restricted?
  - **▶** A **structured outcome + at least category-level reasons** to every eligible solver who submitted, within **10 business days** of the decision. Restricted: reviewer identities, other proposals' content, raw scores/dissent.
- Is no-award always permitted? What commitment, prize, or compensation applies to shortlisted work?
  - **▶** **No-award is always permitted** (recorded rationale). Compensation is **per-challenge, declared up front in the brief** (default: none for open call; optional honorarium for invited/shortlisted PoC work). _(needs product/legal to confirm honorarium policy.)_
- What is the appeals boundary: process/COI only, or technical/selection outcome as well?
  - **▶** **Process and COI/integrity only.** Selection/technical merit is not appealable. Ops may invalidate a review or re-run a step, never overturn the org's merit decision.
- Are public organization profiles self-managed, verified, editorial, or derived from activity?
  - **▶** **Self-managed content + platform-verified facts + activity-derived signals**, each clearly labeled (verified vs user-supplied vs demo). No editorial.
- Which later-stage screens remain labeled demo during MVP, and how is that label impossible to misunderstand?
  - **▶** Contract/pilot/deliverable/payment/impact stay **demo** until Slice 2, enforced by a **persistent non-dismissible banner + disabled real actions + distinct visual treatment + a production build flag that hides them by default** ([40](40_BACKEND_ARCHITECTURE.md) §9).

## 4. Identity, tenancy, and authorization questions

- Can one email/user represent multiple organizations, teams, and reviewer roles?
  - **▶** **Yes** — one user identity, multiple memberships across `org:*`, `team:*`, and `platform:reviewer`; active context is chosen by workspace switch (canonical D4). Experts are often employees _and_ solvers; separate accounts would break identity and audit. _(Confirms open decision D-02.)_
- Is an individual solver workspace permanent and unique per user?
  - **▶** **Yes — exactly one permanent individual workspace per user**, created on first solver activation (matches `PersonalWorkspace`).
- Must an individual or team workspace be verified before it can be created or used?
  - **▶** **No.** Signup verifies the human's contact; workspace verification is a separate status-driven process. A new individual or team workspace may start at `not_started` and may profile, collaborate, browse/save, and draft. The exact challenge version's `verification_required` rule decides whether it may submit, and the server rechecks that rule in the submission transaction. This product boundary is accepted in [DEC-2026-016](25_DECISIONS.md); evidence, retention, reviewer, and appeals operations still require their stated legal/provider controls.
- Is a solver company an organization tenant, a team type, or a distinct legal/account model?
  - **▶** A **`team` workspace of `TeamKind = company`** (a solver-side collaboration), _not_ an org tenant. Org tenants publish challenges; a company that also wants to publish gets a separate org tenant. _(Answers D-03.)_
- Who may create a team, invite members, accept requests, submit proposals, sign contracts, and view payments?
  - **▶** Per the canonical `decideTeamPermission` matrix ([70](70_SECURITY_AND_AUTHZ.md) §4): any solver creates a team (→ `team:owner`); invite/accept = owner/admin (proposal-manager if policy); submit = owner (admin/PM if policy); sign contract = owner/admin; view payments = owner (admin/PM if policy). Adopt verbatim — already implemented and tested.
- What happens to drafts, proposals, messages, contracts, and payments when membership is removed or ownership transfers?
  - **▶** Removal cuts access immediately (grants are membership-gated, [42](42_FOUNDATION_HARDENING.md) §3); in-progress **drafts reassign to the team**, not the person; submitted versions + audit are immutable and stay. Ownership transfer moves the owner role atomically to the named successor; nothing is deleted. Owner/last-manager cannot be removed without transfer (`canRemoveMembership`).
- Can organization members access all organization cases, or only assigned business units/cases?
  - **▶** **Least privilege — members access only cases/challenges they created or are assigned to**; `org:owner` sees all. Add business-unit scoping later only if needed.
- Are reviewer identities hidden from organizations, solvers, other reviewers, operations, or only some of them?
  - **▶** **Hidden from solvers and other reviewers by default; visible to ops; pseudonymous to the org during scoring, revealed post-decision per policy.** _(Answers D-04; product to confirm org-visibility timing.)_
- What may a challenge-owning organization learn about the solver behind a submitted proposal, and when?
  - **▶ Recommended: the workspace label and kind during evaluation, the legal identity only at selection.** This mirrors the reviewer answer directly above — pseudonymous during scoring, revealed when a decision creates a counterparty — and for the same reason: a name changes how a proposal reads before it has been judged on its content. The C4 inbox and record resources today carry `owner_workspace_kind` and nothing else, which is **narrower** than [84](84_PHASE3_CONNECTED_MVP_AUDIT.md) §5.4 requires ("solver/workspace label permitted by policy"). Implementing that label needs a policy field that does not exist: `SolverWorkspaceProfileResource` has no visibility setting, so there is nothing for "permitted by policy" to read. _Owner decision needed on the field and its default before the label can be shown; the current omission is safe but incomplete._
- How does an organization address a direct offer to a solver it has not worked with before?
  - **▶ Recommended: by verified contact, resolved server-side, never by browsing.** `CreateDirectOfferBody` accepts only `recipient_workspace_id`, so the connected form asks a human to type `wsp_a84c7752…` — an identifier nobody can know without being told it out of band, which makes the feature unusable as built. Accepting a `recipient_email` instead needs one rule decided first: **what happens when the email has no workspace yet.** Creating a pending offer that a person claims on activation is the useful answer and the riskier one — it lets an organization assert that an address belongs to someone before that someone has agreed. Refusing unknown addresses is safe and leaves the invite-a-newcomer case unsolved. Either way the org must not be able to search or enumerate solver workspaces (constraint 3). _Owner decision needed; this is why C6 offers are only reachable through hand-copied identifiers today._
- Who may change which team members are assigned to a proposal?
  - **▶ Recommended: the roles that already hold `edit-proposal` unconditionally — owner, admin, and proposal-manager per policy.** `decideTeamPermission` lets a contributor edit a proposal only when `assigned` is true, so assignment is already load-bearing authorization; but `proposal.assigned_membership_ids` is only ever set to its creator and no command changes it. A team therefore cannot put a second person on a proposal, which is most of what a team workspace is for. Adding it means a new canonical `teamActions` entry (`manage-proposal-assignment`) plus a versioned command, so it is a model change under constraint 1 rather than an implementation detail. _Owner decision needed on the action name and its role list._

- What conflict relationships and lookback periods are required? Can operations override a declared conflict?
  - **▶** COI covers employment/affiliation, financial interest, close personal relationship, prior collaboration, and advisory role — **24-month lookback** (default). Ops **cannot** turn a `conflict` into access; it may only reassign or, with dual approval + reason, confirm-and-exclude. A `clear` declaration can be challenged by ops. _(needs legal/product to confirm lookback.)_
- Which actions require MFA freshness or dual approval?
  - **▶** **Step-up (fresh MFA):** decide, accept-deliverable, approve-payment, manage-access, resolve-dispute, publish, contract-sign (canonical `sensitiveActions`). **Dual approval:** publication (approver ≠ author), payment (finance ≠ technical acceptor ≠ contract owner), review invalidation (ops ≠ reviewer/decider). ([70](70_SECURITY_AND_AUTHZ.md) §6.)
- What identity/KYB/KYC evidence is collected, who reviews it, how long is it retained, and how are false matches appealed?
  - **▶** **Orgs: KYB** (registration doc, representative-authority letter, signatory ID); **individual solvers: light KYC** (national ID + mobile verification), escalated only for contract/payment; **reviewers: identity + declared affiliations.** Reviewed by the `platform:ops` verification role; evidence stored encrypted in-region, retained legal-minimum (contracted ~7y; non-contracted purged post-pilot); appeals via ops re-submission. _(needs legal sign-off on retention.)_

## 5. Confidentiality, privacy, and data questions

- Define field/document classifications and which actor can change classification.
  - **▶** Four canonical tiers — `public / internal / confidential / highly_sensitive`. Defaults: public-projection fields = public; brief internals = confidential; identity docs/contracts/payment = highly_sensitive; proposal content = confidential. **Only the owning org/workspace admin may raise classification; lowering requires ops + reason (audited)** — downgrade is the dangerous direction.
- Does accepting an NDA grant automatic access, or only satisfy one prerequisite for an explicit grant?
  - **▶** **Only satisfies one prerequisite** for an explicit `access_grant` (canonical D-05). NDA ≠ authorization.
- How are NDA scope, document/version, jurisdiction, duration, revocation, and user identity bound together?
  - **▶** Via the `nda_acceptance` record (already in the model): `{workspace, entityId, version, jurisdiction, actorUserId, acceptedAt, expiresAt, state}`; grants reference the specific accepted NDA version; revocation flips state and revokes dependent grants.
- Are downloaded files watermarked? Are views/downloads exportable to the organization, and under what notice/consent?
  - **▶** **Confidential/highly_sensitive downloads are watermarked** (viewer identity + timestamp); every signed read is access-audited; an org sees an access log of **its own** materials; cross-party disclosure requires notice.
- Which proposal fields can an organization disclose to reviewers, advisors, affiliates, or procurement?
  - **▶** **Reviewers see the evaluated technical/approach fields (COI-gated) only**, not solver contact/identity/confidential business terms unless policy opens them. Advisors/affiliates/procurement get **no default access** — any wider sharing needs an explicit audited grant + solver notice.
- Can solver teams see one another's contributions and evidence after a member leaves?
  - **▶** **Contributions stay with the team workspace** (attributed in version history); a departed member loses access but cannot take the work. Work belongs to the workspace, not the individual.
- What personal data is necessary for public profiles, verification, contracts, payments, analytics, and support?
  - **▶** Minimize per purpose — public profile = self-chosen display fields; verification = ID docs (highly_sensitive, never public); contracts/payments = legal identity + payout details (highly_sensitive); analytics = pseudonymous events, no PII in properties; support = time-boxed consented access.
- What are retention and deletion rules for rejected proposals, expired invitations, review drafts, identity evidence, audit, backups, and disputes?
  - **▶** Rejected proposals 12 months → archive/anonymize; expired invitations 90 days; review drafts purged on submit; identity evidence legal-minimum (contracted ~7y, non-contracted purged post-pilot); **audit ~7y, never purged by deletion jobs**; backups 35-day rolling; disputes = resolution + appeal + legal retention. _(needs legal sign-off.)_
- How do access, correction, export, deletion, consent withdrawal, and breach notification work?
  - **▶** **Data-subject-request endpoints** (access/export/correction/erasure) via ops with identity verification; erasure honors legal holds (audit/contract/dispute retained, PII redacted where lawful); consent withdrawal disables non-essential processing; a defined breach-severity + notification-timeline process. Scaffold in Phase 1, formalize by the Phase-6 privacy gate.
- Are AI/matching features allowed to use confidential text or external model providers? What training/retention restrictions apply?
  - **▶** **Deferred feature.** When built ([45](45_AI_AND_MATCHING.md) §8 + D14): classification gates egress — confidential/highly_sensitive → self-hosted in-region models only or excluded; **no training/retention by external providers**; public/internal may use managed models.

## 6. Legal, IP, finance, and dispute questions

- Which background, foreground, sideground, data, model, code, publication, license, and derivative-work options are legally supported?
  - **▶** Launch with the three the model already encodes — **solver-license, contract-transfer, joint-ownership** — plus explicit **background-IP protection** (solver retains pre-existing IP) and per-challenge publication/confidentiality terms. Defer complex data/model-ownership matrices to legal review. _(needs legal sign-off.)_
- At what point are displayed IP terms binding, and how are proposal declarations incorporated into the final contract?
  - **▶** IP terms are **not binding until the contract is effective**; the challenge's IP terms + the solver's proposal IP declarations are carried as **versioned schedules into the contract** (challenge → proposal declaration → contract). Submission ≠ transfer.
- What happens if challenge terms change after a solver begins or submits?
  - **▶** **Material changes create a new challenge version and never apply retroactively** to already-submitted proposals; affected solvers are notified and may withdraw or reconfirm; non-material fixes are annotated.
- Who owns co-created work before signature or before payment?
  - **▶** **Before signature, each party retains its own contributions (no transfer); before payment, per the effective contract's IP schedule** (transfer/license may be conditioned on payment). Default: no org rights to solver foreground IP until the contract is effective. _(needs legal.)_
- Are reviewers contractors, volunteers, employees, or organization appointees? What confidentiality and liability terms apply?
  - **▶** **Independent contractors engaged by the platform** (or org-appointed for org-run panels) under a reviewer agreement with confidentiality + COI + limited-liability terms; paid per review/honorarium. _(needs legal.)_
- What evidence constitutes a valid technical acceptance or rejection?
  - **▶** Acceptance = deliverable meets the pilot's **pre-agreed KPIs/acceptance criteria with attached evidence**, signed off by the authorized org acceptor (≠ finance approver); rejection = recorded reason + criteria not met.
- Who can approve finance, and must that actor differ from technical acceptance or contract owner?
  - **▶** **`platform:finance` (or the org finance approver) approves payment and must be distinct from the technical acceptor and the contract owner** (canonical [70](70_SECURITY_AND_AUTHZ.md) §6).
- What currencies/payment methods are supported? Who invoices whom? Who withholds/pays tax?
  - **▶** Pilot = **IRR (Toman display), domestic rails**; the **organization invoices and pays the solver, the platform records/orchestrates status only** (no custody); **tax withholding is the paying org's responsibility** (platform records, does not compute). _(needs finance/legal.)_
- Does Rahhal ever custody funds, operate escrow, split team payments, or only report external payments?
  - **▶** **Report/orchestrate only in the pilot — no custody, no escrow, no team-payment splitting** (D-06). Revisit escrow only with a licensing decision; team splitting stays the team's internal matter.
- What is the dispute sequence, evidence standard, deadline, decision authority, appeal, refund, and record-retention policy?
  - **▶** Raise → ops triage → bounded evidence exchange → ops decision → single appeal (senior ops/legal) → close; **evidence standard = documented acceptance criteria + audit trail**; since the platform never custodies funds, refunds are a **recommendation to the paying org**, not a platform refund; full dispute record retained ~7y. _(needs legal.)_

## 7. Technical questions

- Will authenticated workspaces remain Next static export, use hybrid server rendering, or become a separate SPA/API deployment?
  - **▶** **Hybrid Next.js** (canonical D10) — static/SSR for public content, authenticated workspaces as a client shell on the versioned API; full static export kept only as a demo/read-only artifact. ([40](40_BACKEND_ARCHITECTURE.md) §3.)
- Which backend language/framework and managed infrastructure match team skills and hosting constraints?
  - **▶** **TypeScript/Node (NestJS or Fastify)** on managed in-region PostgreSQL + S3-compatible storage; one modular-monolith API + worker. Reuses `domain/*` types/state machines; one language across web/api/worker.
- Is PostgreSQL the authoritative store, and will tenant isolation use application policies, database row security, separate schemas/databases, or layered controls?
  - **▶** **PostgreSQL authoritative; isolation = application-scoped queries + RLS for tenant-owned rows, plus the `access_grant` model for shared cross-tenant records** ([42](42_FOUNDATION_HARDENING.md) §3, [50](50_DATA_MODEL.md) §2). Not schema/DB-per-tenant at pilot.
- Which object storage and malware-scanning services meet residency and availability needs?
  - **▶** **In-region S3-compatible private buckets** + a scanning worker (ClamAV or a managed in-region scanner), quarantine-before-available ([40](40_BACKEND_ARCHITECTURE.md) §6). _(pick the concrete in-region provider at Phase 1 per residency.)_
- What is the exact idempotency lifetime and uniqueness scope for each command/provider callback?
  - **▶** Scope = `(tenant, command, key)` ([50](50_DATA_MODEL.md) §8); TTL — submits/decisions/invites **72h**, payments/signature callbacks **30 days**; provider callbacks additionally deduped indefinitely via a processed-provider-events table keyed by provider event id.
- What audit store is independent enough from application administrators, and who can query/export it?
  - **▶** **Append-only Postgres `audit_event` with INSERT+SELECT-only grants for the app role + periodic signed export to WORM object storage**; ops query read-only (audited); a separate compliance role exports. ([40](40_BACKEND_ARCHITECTURE.md) §5, [70](70_SECURITY_AND_AUTHZ.md) §7.)
- What search technology is needed for Persian normalization, filters, permissions, and ranking?
  - **▶** **PostgreSQL FTS with Persian normalization (`normalizePersian` at index + query) + structured filters + permission-scoped queries**; graduate to OpenSearch only on evidence ([42](42_FOUNDATION_HARDENING.md) §7).
- How are matching explanations produced, versioned, monitored for bias/error, and overridden?
  - **▶** **Deferred** ([45](45_AI_AND_MATCHING.md)). When built: explanations from feature breakdown + optional LLM rationale, versioned by `model_version` + `rule_version`, fairness/drift-monitored, always human-overridable, never authoritative.
- Which notification providers and fallback channels are reliable in the launch market?
  - **▶** **In-region SMS (primary) + email, with in-app always on**; retry → dead-letter. _(select the concrete Iran SMS gateway at Phase 1.)_
- Which e-signature/payment/verification providers are legally and operationally available?
  - **▶** **Deferred to Slice 2 with legal/finance selection of in-region providers**; until then contract/signature/payment remain demo. _(needs legal/finance.)_
- What RTO, RPO, SLO, load, concurrency, route count, payload, and web-vital targets are required?
  - **▶ (pilot):** **RTO 4h, RPO 15min; API p95 < 400ms read / < 800ms write; 99.5% availability; ~50 concurrent authoring users, deadline spike ~5–10 writes/s; p75 mobile LCP < 2.5s, INP < 200ms, CLS < 0.1; restore the failing byte budgets.** Validate with load tests ([42](42_FOUNDATION_HARDENING.md) §7). _(confirm with ops.)_
- Are static routes generated per fixture/entity or only per publishable production entity? What invalidates/rebuilds them?
  - **▶** **Only per publishable/authorized projection**, rebuilt/invalidated on publish/close via outbox → projection builder; **no per-fixture static routes in production** (fixes R-14).

## 8. Operations and launch questions

- Who owns verification, publication quality, reviewer assignment, disputes, payment exceptions, support, incidents, and data corrections?
  - **▶** **`platform:ops` with distinct sub-roles** (verification, publication-quality, reviewer-assignment, disputes, payment-exception), separated for duty; incidents → on-call engineer + ops lead; data corrections → ops with dual approval + audit (never destructive).
- What are queue priority rules and SLAs, business hours, holidays, time zones, escalation, and notification cadence?
  - **▶** **Business time Asia/Tehran, Iran working week (Sat–Wed) + Iranian holidays**; per-queue SLAs (e.g. verification 2 business days, publication 1, dispute triage 1); priority by deadline proximity + severity; escalate to ops lead on SLA breach.
- What privileged support access can be granted, by whom, for how long, with what user consent and recording?
  - **▶** **Time-boxed (default 1h, max 24h), least-privilege, user-consented, session-recorded, fully audited** grants via `privileged_access_grant`, approved by the ops lead ([70](70_SECURITY_AND_AUTHZ.md) §6).
- How are suspicious accounts, plagiarism, spam, harassment, bribery, collusion, sanctions, and fraud handled?
  - **▶** An **ops trust-and-safety workflow**: signals → investigation → graduated actions (warn/suspend/remove/report); **sanctions screening at KYB/KYC onboarding**; reviewer–solver collusion/bribery = COI-integrity violation → review invalidation + removal; plagiarism/collusion detection AI-assisted later, human-adjudicated. Controlled organization/reviewer onboarding plus solver OTP replay, expiry, resend, rate-limit, and abuse protections reduce launch exposure. _(sanctions screening needs legal.)_
- How are business-data corrections performed without destroying audit history?
  - **▶** **Corrections are new versions / compensating events, never in-place edits**; the correction itself is audited with actor + reason (canonical invariant).
- What can be feature-flagged or rolled back without corrupting workflow state?
  - **▶** **UI features, non-authoritative reads, notification channels, and demo-stage screens** are flaggable; **in-flight state transitions and money movements are never silently rolled back** — use forward compensations; migrations use expand/contract ([42](42_FOUNDATION_HARDENING.md) §9).
- What manual fallbacks exist during identity, storage, messaging, signature, or payment provider outage?
  - **▶** Documented runbooks ([42](42_FOUNDATION_HARDENING.md) §6): identity out → existing sessions continue, pause onboarding; storage out → queue uploads, block dependent steps; messaging out → in-app + retry; signature/payment out → park in `signature`/`processing`, reconcile on recovery. No business-state corruption.
- What pilot participant count and data sensitivity can support operate safely?
  - **▶** **Start ~3–5 organizations, ~20–50 solvers/reviewers, non-highly-sensitive challenges first**; expand only after the security/privacy/DR gates pass. _(confirm with ops/product.)_

## 9. Measurement questions

- What are the approved funnel definitions and denominators for ready, published, eligible, qualified, reviewed, selected, contracted, accepted, paid, and impactful?
  - **▶** Adopt the [10](10_PRODUCT_VISION.md) §7 funnel with stage-over-stage denominators (readiness = ready/created; publish = published/ready; eligible = eligible-solvers/published; qualified = qualified/eligible; then reviewed/selected/contracted/accepted/paid/impactful each over the prior stage); exclude demo/test entities (below). _(product to ratify exact denominators.)_
- Which time metrics use business time versus elapsed time, and which time zone/calendar is authoritative?
  - **▶** **SLA/queue metrics use business time (Asia/Tehran, Iran week + holidays); cycle-time reports show both business and elapsed**; Jalali for display, UTC for storage.
- How are duplicate/test/demo entities excluded from reporting?
  - **▶** Tag every entity with an **origin flag (`production`/`demo`/`seed`/`test`) at creation; analytics filter to `production` only**; the demo-authority-off production build prevents demo entities in prod entirely (R-14).
- Which event/property data is allowed for product analytics, and what consent/minimization applies?
  - **▶** **Pseudonymous events only, no PII/confidential content in properties, in-region analytics, consent for non-essential analytics**, against a documented allowed-event schema (NFR-PRV-001).
- What guardrails prevent optimizing proposal volume at the expense of quality, fairness, privacy, or solver trust?
  - **▶** **Pair every growth metric with a guardrail** ([10](10_PRODUCT_VISION.md) §7): qualified-proposal-rate (not raw volume), non-selected-feedback SLA met, reviewer COI-integrity rate, unauthorized-access-blocked, verification false-pos/neg; review guardrails at every product review; never reward on volume alone.

## 10. Decision log template

Create one entry for every resolved blocking question:

```markdown
# DEC-YYYY-NNN: Decision title

- Status: proposed | accepted | superseded | rejected
- Date:
- Owner:
- Approvers:
- Related requirements/risks:

## Context

## Options considered

## Decision

## Consequences and trade-offs

## Security, privacy, legal, accessibility, and operations impact

## Migration / rollout / rollback

## Evidence and review date
```

Review accepted decisions when assumptions, providers, launch market, regulation, or incident evidence changes.
