# Risks and open questions

## 1. Risk register

| ID   | Severity | Risk and evidence                                                                                                                        | Consequence                                                                                | Recommended treatment                                                                                                          |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| R-01 | Critical | Browser storage and frontend guards are the current authority for sessions, permissions, COI, proposals, approvals, payments, and audit. | Confidentiality breach, unauthorized action, mutable evidence, financial/legal failure     | Production-block all real data; implement Phase 1 server authority and adversarial access tests.                               |
| R-02 | Critical | The prototype models the entire lifecycle, but no production backend capability exists.                                                  | Progress can be mistaken for production readiness; integration work is underestimated.     | Measure authoritative vertical slices, not pages; approve the MVP boundary and roadmap exit gates.                             |
| R-03 | Critical | Legal/privacy/payment/identity/IP/dispute rules are demo content without qualified approval.                                             | Unenforceable terms, privacy violations, incorrect payments/tax, disputes                  | Run legal, privacy, finance, and security workstreams before pilot; record approvals and effective versions.                   |
| R-04 | High     | Product naming is inconsistent: Rahhal suggests `رحّال`, while UI text uses `راه‌حل`.                                                    | Brand confusion, wrong domain/marks, inconsistent contracts and communications             | Decide canonical Persian/English name, transliteration, trademark/domain, and update package/UI/docs/assets.                   |
| R-05 | High     | Recognizable organization names/logos are included, including a `real` asset directory, while data is described as demo.                 | Trademark/endorsement claims and public reputational risk                                  | Obtain permission or replace with clearly fictional assets; maintain provenance/licenses.                                      |
| R-06 | High     | Checked-in offline bundle passes structural checks but fails the current login-to-workspace smoke flow.                                  | Distributed demo behaves differently from source; stale artifact can mislead stakeholders. | Regenerate from current source, fix/test, attach artifact digest to releases; decide if offline is demo/read-only.             |
| R-07 | High     | Five performance budgets fail and most routes load about 1.31 MB JS plus 503 KB CSS.                                                     | Slow Persian-market mobile experience, poor Core Web Vitals, maintenance cost              | Restore byte gates, define p75 user-centric targets, split role code and feature CSS, test constrained devices/networks.       |
| R-08 | High     | Playwright Chromium and visual Golden Master are absent; browser assertions did not run.                                                 | RTL, collision, focus, overflow, font, contrast, and responsive defects remain unproven.   | Pin/install browser in CI, review baseline, run behavior/visual/accessibility gates on every release.                          |
| R-09 | High     | No CI/CD, environment contract, deployment definitions, migration/rollback process, or source revision metadata in this snapshot.        | Non-reproducible releases, configuration drift, untraceable incidents                      | Complete Phase 0 CI/release engineering and restore/use Git history in the authoritative repository.                           |
| R-10 | High     | Plain clean install omitted Sharp/libvips on audited macOS ARM64.                                                                        | New developers/CI cannot build without manual recovery.                                    | Reproduce across supported platforms, pin runtime/npm, make optional dependency handling deterministic.                        |
| R-11 | High     | No observability, analytics governance, SLOs, alerting, incident response, backup/restore, or DR evidence.                               | Failures/data loss go undetected; no operational readiness                                 | Build telemetry and recovery in Phase 1; exercise restore/reconciliation before pilot.                                         |
| R-12 | Medium   | Several components/data modules exceed 1,000 lines; CSS is 30,531 lines with 82 `!important` declarations.                               | Slow changes, hidden coupling, visual regressions, payload growth                          | Refactor by domain boundary while adding API adapters; enforce source/payload architecture checks.                             |
| R-13 | Medium   | Four React Compiler lint diagnostics are disabled after the Next upgrade.                                                                | Latent hook/purity/state issues and harder future upgrades                                 | Re-enable one rule at a time, fix behavior with targeted regression/browser tests, document exceptions.                        |
| R-14 | Medium   | Static route generation includes hundreds of fixture/entity paths and compatibility routes.                                              | Large builds, accidental fixture exposure, unclear canonical navigation                    | Separate demo data from production routes, generate only valid published/authorized static projections, monitor route budgets. |
| R-15 | Medium   | Persian date/currency/time and Iran-specific mobile validation are embedded, while launch geography is unapproved.                       | Incorrect internationalization, compliance, currency, and deadline behavior                | Approve market/currency/calendar/time-zone scope; centralize locale and money/time contracts.                                  |
| R-16 | Medium   | The snapshot has no root license, contribution guide, security policy, or ownership file.                                                | Unclear rights, vulnerability channel, review responsibility, and onboarding               | Add approved license/proprietary notice, `SECURITY.md`, contribution/release guide, and CODEOWNERS equivalent.                 |

## 2. P0 product decisions

These questions block architecture or MVP delivery.

| Decision                              | Why it matters                                                       | Suggested owner                   | Blocking phase | Proposed default for planning                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------- | --------------------------------- | -------------: | -------------------------------------------------------------------------------------------------------------------- |
| Canonical product name and brand      | Affects package, domains, marks, UI, contracts, communication        | Founder/product + legal           |              0 | Use `راه‌حل` in Persian and choose an unambiguous approved Latin name.                                               |
| Launch country/market                 | Controls identity, privacy, currency, tax, contract, payment, locale | Product + legal/finance           |              0 | Controlled Iran pilot only, subject to qualified review.                                                             |
| MVP journey                           | Determines which current screens become real first                   | Product                           |              0 | Publish challenge → proposal → COI/review → decision.                                                                |
| Launch actors                         | Changes identity, permissions, operations and support                | Product + operations              |              0 | Invite-only organizations, solvers, reviewers, and internal ops.                                                     |
| Tenant/workspace model                | Foundation for every authorization and data query                    | Architecture + security           |              1 | User can join multiple workspaces; every protected record has one owning tenant/workspace and explicit participants. |
| Identity provider and assurance       | Determines auth/session/MFA/recovery/KYB integration                 | Security + engineering            |              1 | Managed standards-based IdP plus separate verification/KYB workflows.                                                |
| Data residency and classifications    | Controls hosting, files, backups, support and audit                  | Legal/privacy + security          |              1 | Classify public/internal/confidential/highly sensitive; keep pilot data in approved region.                          |
| Offline artifact role                 | Static export and auth/data architecture differ sharply              | Product + architecture + security |              0 | Demo/read-only artifact; no authoritative offline production mutation.                                               |
| Contract and signature responsibility | Determines legal workflow/provider and effective state               | Legal + product                   |            0/5 | Provider-backed signatures; platform records status, versions, evidence and audit.                                   |
| Payment/custody model                 | Determines licensing, ledger, risk and integration scope             | Finance + legal + product         |            0/5 | Platform orchestrates invoicing/status without holding funds unless separately approved.                             |

## 3. Product questions

- What is the primary buyer and economic customer: innovation office, operations/business unit, procurement, HR/R&D, or another party?
- What is the north-star outcome: published qualified challenges, successful pilots, accepted outcomes, paid solver value, or verified impact?
- Is the product a marketplace, managed innovation service, SaaS workflow, or a combination? Which steps require Rahhal staff?
- Which challenge collaboration models are supported at launch: public call, invitation, scouting, research, prize, paid discovery, PoC, pilot, procurement?
- What makes a challenge ready, who can override readiness, and who is accountable for a poor/unsafe brief?
- Can an organization cancel, extend, pause, edit, or anonymize a published challenge? What happens to existing proposals?
- What feedback is guaranteed to non-selected solvers, under what SLA, and what information is restricted?
- Is no-award always permitted? What commitment, prize, or compensation applies to shortlisted work?
- What is the appeals boundary: process/COI only, or technical/selection outcome as well?
- Are public organization profiles self-managed, verified, editorial, or derived from activity?
- Which later-stage screens remain labeled demo during MVP, and how is that label impossible to misunderstand?

## 4. Identity, tenancy, and authorization questions

- Can one email/user represent multiple organizations, teams, and reviewer roles?
- Is an individual solver workspace permanent and unique per user?
- Is a solver company an organization tenant, a team type, or a distinct legal/account model?
- Who may create a team, invite members, accept requests, submit proposals, sign contracts, and view payments?
- What happens to drafts, proposals, messages, contracts, and payments when membership is removed or ownership transfers?
- Can organization members access all organization cases, or only assigned business units/cases?
- Are reviewer identities hidden from organizations, solvers, other reviewers, operations, or only some of them?
- What conflict relationships and lookback periods are required? Can operations override a declared conflict?
- Which actions require MFA freshness or dual approval?
- What identity/KYB/KYC evidence is collected, who reviews it, how long is it retained, and how are false matches appealed?

## 5. Confidentiality, privacy, and data questions

- Define field/document classifications and which actor can change classification.
- Does accepting an NDA grant automatic access, or only satisfy one prerequisite for an explicit grant?
- How are NDA scope, document/version, jurisdiction, duration, revocation, and user identity bound together?
- Are downloaded files watermarked? Are views/downloads exportable to the organization, and under what notice/consent?
- Which proposal fields can an organization disclose to reviewers, advisors, affiliates, or procurement?
- Can solver teams see one another's contributions and evidence after a member leaves?
- What personal data is necessary for public profiles, verification, contracts, payments, analytics, and support?
- What are retention and deletion rules for rejected proposals, expired invitations, review drafts, identity evidence, audit, backups, and disputes?
- How do access, correction, export, deletion, consent withdrawal, and breach notification work?
- Are AI/matching features allowed to use confidential text or external model providers? What training/retention restrictions apply?

## 6. Legal, IP, finance, and dispute questions

- Which background, foreground, sideground, data, model, code, publication, license, and derivative-work options are legally supported?
- At what point are displayed IP terms binding, and how are proposal declarations incorporated into the final contract?
- What happens if challenge terms change after a solver begins or submits?
- Who owns co-created work before signature or before payment?
- Are reviewers contractors, volunteers, employees, or organization appointees? What confidentiality and liability terms apply?
- What evidence constitutes a valid technical acceptance or rejection?
- Who can approve finance, and must that actor differ from technical acceptance or contract owner?
- What currencies/payment methods are supported? Who invoices whom? Who withholds/pays tax?
- Does Rahhal ever custody funds, operate escrow, split team payments, or only report external payments?
- What is the dispute sequence, evidence standard, deadline, decision authority, appeal, refund, and record-retention policy?

## 7. Technical questions

- Will authenticated workspaces remain Next static export, use hybrid server rendering, or become a separate SPA/API deployment?
- Which backend language/framework and managed infrastructure match team skills and hosting constraints?
- Is PostgreSQL the authoritative store, and will tenant isolation use application policies, database row security, separate schemas/databases, or layered controls?
- Which object storage and malware-scanning services meet residency and availability needs?
- What is the exact idempotency lifetime and uniqueness scope for each command/provider callback?
- What audit store is independent enough from application administrators, and who can query/export it?
- What search technology is needed for Persian normalization, filters, permissions, and ranking?
- How are matching explanations produced, versioned, monitored for bias/error, and overridden?
- Which notification providers and fallback channels are reliable in the launch market?
- Which e-signature/payment/verification providers are legally and operationally available?
- What RTO, RPO, SLO, load, concurrency, route count, payload, and web-vital targets are required?
- Are static routes generated per fixture/entity or only per publishable production entity? What invalidates/rebuilds them?

## 8. Operations and launch questions

- Who owns verification, publication quality, reviewer assignment, disputes, payment exceptions, support, incidents, and data corrections?
- What are queue priority rules and SLAs, business hours, holidays, time zones, escalation, and notification cadence?
- What privileged support access can be granted, by whom, for how long, with what user consent and recording?
- How are suspicious accounts, plagiarism, spam, harassment, bribery, collusion, sanctions, and fraud handled?
- How are business-data corrections performed without destroying audit history?
- What can be feature-flagged or rolled back without corrupting workflow state?
- What manual fallbacks exist during identity, storage, messaging, signature, or payment provider outage?
- What pilot participant count and data sensitivity can support operate safely?

## 9. Measurement questions

- What are the approved funnel definitions and denominators for ready, published, eligible, qualified, reviewed, selected, contracted, accepted, paid, and impactful?
- Which time metrics use business time versus elapsed time, and which time zone/calendar is authoritative?
- How are duplicate/test/demo entities excluded from reporting?
- Which event/property data is allowed for product analytics, and what consent/minimization applies?
- What guardrails prevent optimizing proposal volume at the expense of quality, fairness, privacy, or solver trust?

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
