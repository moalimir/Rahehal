# Product requirements — FR/NFR catalog

> **Retained as the requirements catalog.** Sections 1–6 (product statement, problem, actors, goals, non-goals) are superseded by [10_PRODUCT_VISION](10_PRODUCT_VISION.md); this doc is kept for the **FR/NFR requirement catalog (§7–8), success measures (§9), and MVP acceptance criteria (§10)**, which the traceability matrix ([90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md)) references by requirement ID. On any terminology/state/role conflict, [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) is authoritative.

**Status:** Draft reconstructed from implementation  
**Approval state:** Not approved by product, legal, security, finance, or operations  
**Product names found:** `Rahhal`, `Rahhal Solver`, and Persian `راه‌حل`  
**Target market inferred from the implementation:** Persian-speaking organizations and solvers, initially Iran

## 1. Product statement

Rahhal enables an organization to turn a real operational problem into a controlled open-innovation case, discover or invite qualified solvers, evaluate versioned proposals through conflict-controlled review, execute a contracted pilot, accept deliverables, release payments, and preserve evidence of decisions and impact.

The product's central promise is **continuity and trust across the entire case**, rather than a simple challenge directory. Every sensitive action should have an owner, prerequisites, version, reason, receipt, next action, and audit record.

## 2. Problem and opportunity

### Organization problem

Organizations often lack a consistent way to frame measurable challenges, control disclosure, find capable external teams, compare proposals fairly, document decisions, contract safely, and connect pilot evidence to payment and impact.

### Solver problem

Experts and teams need credible opportunities, clear eligibility and evaluation rules, protection for background intellectual property, workspace and team controls, transparent status, actionable feedback, and reliable contracting/payment.

### Governance problem

Reviewers and platform operators need conflict-of-interest gates, scoped data access, versioned rubrics, reason codes, service-level queues, dispute evidence, and immutable action history.

## 3. Actors and jobs to be done

| Actor                     | Primary job                                                           | Critical trust requirement                                                   |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Guest                     | Discover credible challenges and understand the process               | No confidential data leakage or misleading claims                            |
| Organization owner/member | Create, approve, publish, evaluate, contract, and operate a challenge | Tenant isolation, role permissions, versioned approvals, auditable decisions |
| Individual solver         | Find eligible opportunities and submit a defensible proposal          | Identity, IP protection, private workspace, transparent status and payment   |
| Team owner/admin/member   | Collaborate under explicit roles and submit as a team                 | Ownership integrity, membership lifecycle, workspace-scoped records          |
| Reviewer                  | Evaluate assigned proposals independently                             | Conflict declaration before protected content, rubric/version integrity      |
| Operations user           | Run verification, quality, disputes, payments, and platform controls  | Least privilege, reason codes, separation of duties, immutable audit         |
| Finance/legal approver    | Approve contractual and financial gates                               | Effective contract, technical acceptance, financial approval, reconciliation |

## 4. Goals

### Product goals

- Create one continuous case from problem intake through measured impact.
- Make challenge and proposal readiness explicit before submission or publication.
- Support individual and team solver workspaces without cross-workspace data leakage.
- Make eligibility explainable and separate it from proposal quality.
- Enforce reviewer conflict-of-interest and assignment scope.
- Separate technical acceptance from financial approval.
- Preserve versions, reasons, receipts, and audit evidence for sensitive actions.
- Provide a high-quality Persian/RTL, responsive, keyboard-accessible experience.

### Proposed business goals

- Reduce time from organizational intake to an approved, published challenge.
- Increase the percentage of published challenges receiving eligible proposals.
- Improve proposal-to-pilot and pilot-to-accepted-outcome conversion.
- Reduce manual operational handling and dispute resolution time.
- Establish trustworthy repeat participation by organizations and solvers.

## 5. Non-goals for the first production release

- An autonomous AI decision maker. Matching may assist; humans own eligibility exceptions, review, and selection.
- A general-purpose project-management or social network product.
- Unrestricted public file sharing or public access to confidential case material.
- A full escrow, banking, payroll, or tax platform unless separately licensed and designed.
- Automated legal advice or a guarantee that template IP/contract clauses are appropriate.
- A multi-country launch before currency, identity, tax, privacy, and legal requirements are explicitly designed.

## 6. Release scope

### MVP vertical slice

The first production release should prove this complete path:

1. An authenticated organization creates a draft challenge.
2. Required internal owners approve the publishable version.
3. Operations verifies quality and publication permissions.
4. Eligible solvers discover the challenge and submit a locked proposal version.
5. Assigned reviewers declare conflict status before protected content, score a versioned rubric, and submit.
6. The organization records a reasoned decision and all parties receive durable status and audit evidence.

Contract, pilot, deliverable, and payment can follow as the second production slice. The current UI may continue to demonstrate later stages, but it should label non-production actions clearly.

## 7. Functional requirements

### 7.1 Public discovery and trust

- **FR-PUB-001:** Guests can browse and filter public challenges without authentication.
- **FR-PUB-002:** Challenge details show owner disclosure level, deadline/time zone, budget model, participation conditions, evaluation process, confidentiality, and IP summary.
- **FR-PUB-003:** Unknown, closed, removed, or invitation-only records resolve to explicit safe states and never to another sample record.
- **FR-PUB-004:** Public organization profiles distinguish verified facts, user-supplied content, and demo/marketing content.
- **FR-PUB-005:** Public trust, legal, accessibility, confidentiality, IP, review, payment, and dispute policies are versioned and linkable.

### 7.2 Identity, onboarding, and tenancy

- **FR-IAM-001:** Users register, verify contact methods, authenticate, recover access, and maintain revocable sessions.
- **FR-IAM-002:** Organization accounts pass KYB and representative-authority checks appropriate to risk.
- **FR-IAM-003:** Solver identity and organization/team verification are separate, status-driven processes.
- **FR-IAM-004:** A user can belong to multiple workspaces and deliberately switch active context.
- **FR-IAM-005:** Server-side authorization denies by default using actor, tenant, workspace, role, membership, record, and action.
- **FR-IAM-006:** Safe post-login return destinations remain inside the same application and authorized role context.
- **FR-IAM-007:** Sensitive actions support configurable strong-auth/step-up requirements.

### 7.3 Organization challenge lifecycle

- **FR-ORG-001:** An organization creates and resumes a challenge draft with autosave and conflict recovery.
- **FR-ORG-002:** A challenge records problem context, baseline/current state, desired outcome, measurable success criteria, scope, constraints, support, previous attempts, output type, collaboration model, solver types, schedule, budget, visibility, confidentiality, IP terms, contacts, and attachments.
- **FR-ORG-003:** Draft, preview, and submission use one validation/readiness contract.
- **FR-ORG-004:** Technical, financial, legal, data/privacy, and publication gates are independently attributable and version-specific.
- **FR-ORG-005:** Publication locks the approved version, creates an audit event, and updates public/solver projections atomically.
- **FR-ORG-006:** Organization members can discover solvers, view explainable matching evidence, invite a solver workspace, and track the shared offer entity.
- **FR-ORG-007:** Organization users can screen eligibility, request clarification, shortlist, compare like-for-like proposals, and start review.
- **FR-ORG-008:** Final decisions require authorized actors, structured reason, selected proposal version, and a durable receipt.

### 7.4 Solver and team lifecycle

- **FR-SOL-001:** A solver maintains a professional profile, expertise, availability, evidence, visibility, and verification status.
- **FR-SOL-002:** Eligibility evaluation explains allowed applicant type, readiness, expertise, geography, verification, NDA/document gates, state, and deadline.
- **FR-SOL-003:** A solver can save opportunities and preserve filters/context across navigation and refresh.
- **FR-SOL-004:** Individual and team proposal drafts are isolated by owner workspace.
- **FR-SOL-005:** Proposal creation covers problem understanding, value, maturity, technologies, technical approach, data, metrics, IP, plan, risks, team, budget, timing, declarations, and evidence.
- **FR-SOL-006:** Submitted proposal versions are immutable; later revisions create new versions with an explicit base and difference history.
- **FR-SOL-007:** Teams support ownership, policy, invitations, membership requests, role changes, removal, archive, leave, and ownership transfer.
- **FR-SOL-008:** Team actions respect owner/admin/proposal-manager/contributor/viewer policy and assignment scope.
- **FR-SOL-009:** Direct offers have shared identity and explicit pending, accepted, declined, expired, or cancelled transitions.
- **FR-SOL-010:** Accepting interest or an offer never silently becomes contractual acceptance.

### 7.5 Review and decision

- **FR-REV-001:** Review assignments are explicit records connected to reviewer, proposal version, rubric version, due date, and status.
- **FR-REV-002:** A reviewer must declare clear/conflict status before protected materials, comparison, or scoring.
- **FR-REV-003:** Conflict declarations and access decisions are enforced server-side and visible to operations without exposing protected proposal content.
- **FR-REV-004:** Scoring requires valid criterion values and criterion-level rationale.
- **FR-REV-005:** Final review submission locks the review version and records actor, time, rubric version, receipt, and audit event.
- **FR-REV-006:** Reopening or invalidating a review requires authorized operations action and reason.
- **FR-REV-007:** Organizations can compare results without revealing restricted reviewer identity or another reviewer's vote before policy allows it.

### 7.6 Contract, pilot, deliverables, and payment

- **FR-EXE-001:** The selected proposal creates a case with versioned contract and IP schedules.
- **FR-EXE-002:** Contract negotiation, approval, signature, rejection, supersession, and effective state are explicit.
- **FR-EXE-003:** Pilot plans connect milestones, owners, dates, KPIs, dependencies, tasks, and evidence.
- **FR-EXE-004:** Deliverables move through submitted, accepted, revision requested, or rejected states with technical evidence.
- **FR-EXE-005:** Payment processing requires effective contract, technical acceptance, and separate financial approval.
- **FR-EXE-006:** Payment initiation, provider callbacks, retries, duplicate detection, settlement, reconciliation, hold, failure, refund, and dispute are idempotent.
- **FR-EXE-007:** Case closure requires resolved deliverables and reconciled payments; structured feedback is collected once per authorized party.
- **FR-EXE-008:** Impact records preserve baseline, target, actual, unit, source, calculation, evidence, validation, and scale/repeat/stop decision.

### 7.7 Operations and governance

- **FR-OPS-001:** Operations queues expose SLA, priority, owner, blocker, reason code, next action, and safe case context.
- **FR-OPS-002:** Verification, publication, review intervention, disputes, violations, and payment roles can be separated.
- **FR-OPS-003:** Sensitive operational actions require confirmation, structured reason, strong auth when configured, idempotency, and audit.
- **FR-OPS-004:** Support access is consented, time-bounded, least-privileged, and audited.
- **FR-OPS-005:** Audit records are append-only, queryable by entity/correlation/actor, exportable under policy, and protected from application-user mutation.
- **FR-OPS-006:** Notification delivery supports templates, preferences, retry/dead-letter handling, and delivery status without changing business state on delivery failure.

## 8. Non-functional requirements

- **NFR-SEC-001:** Production secrets, sessions, authorization, files, audit, and financial rules never rely on browser storage or frontend guards.
- **NFR-SEC-002:** Apply OWASP-aligned input validation, output encoding, CSRF/session protection, rate limiting, abuse controls, secure headers, dependency scanning, and tenant isolation tests.
- **NFR-PRV-001:** Classify data, minimize collection, define purpose/consent, residency, retention, deletion, access/export, breach, and privileged-access policies before launch.
- **NFR-REL-001:** Mutations use idempotency and optimistic concurrency; retry never creates duplicate decisions, submissions, invitations, signatures, or payments.
- **NFR-REL-002:** Backup, restore, disaster recovery, and reconciliation exercises have measured recovery objectives.
- **NFR-AUD-001:** Business-critical mutations generate correlated audit events with actor, tenant, entity, action, version, outcome, time, and reason.
- **NFR-A11Y-001:** Meet WCAG 2.2 AA for supported flows, including keyboard, focus, dialog behavior, semantics, error association, target size, contrast, zoom, and reduced motion.
- **NFR-I18N-001:** Persian and RTL are first class; codes, email, amounts, and mixed-direction content use bidi isolation. Dates, numbers, currency, and Tehran time are explicit.
- **NFR-PERF-001:** Establish user-centric LCP, INP, CLS, payload, and offline-size budgets per device/network. Demo and connected builds enforce representative-route initial JavaScript, shared JavaScript, largest-asset, CSS, and offline-size limits; total emitted JavaScript is a visible trend rather than a release gate because unloaded code-split routes do not affect one visit.
- **NFR-OBS-001:** Provide structured logs, metrics, traces, audit correlation, error monitoring, synthetic journeys, alert ownership, and privacy-safe analytics.
- **NFR-DEL-001:** Every merge passes type, lint, unit/integration, build, route/link, accessibility, browser behavior, migration, security, and relevant visual gates in CI.
- **NFR-COMP-001:** Contracts, IP, identity, tax, payment, disputes, privacy, and use of organization marks receive qualified local review.

## 9. Proposed success measures

Exact targets require baseline research. The first production pilot should instrument:

| Funnel          | Measure                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Organization    | Intake completion, time to readiness, approval time, publish success, abandoned drafts                               |
| Marketplace     | Eligible solvers per challenge, invite response, qualified proposals, time to first proposal                         |
| Review          | COI clearance time, completion before SLA, scoring completeness, reopen/invalidation rate                            |
| Decision        | Time from proposal close to reasoned decision, no-award rate, dispute rate                                           |
| Execution       | Contract cycle time, pilot start, milestone acceptance, rework, payment/reconciliation time                          |
| Product quality | Task success, accessibility defects, error rate, p75 LCP/INP/CLS, support contacts                                   |
| Trust           | Unauthorized-access attempts blocked, audit completeness, security incidents, verification false positives/negatives |

## 10. MVP acceptance criteria

- All MVP actors use real identity, sessions, workspaces, and server-side authorization.
- Organization, challenge, proposal, proposal version, assignment, review, decision, and audit data persist in a transactional database.
- Public projections expose only explicitly publishable fields.
- File evidence uses private object storage, allowlisted types, size limits, signed access, retention, and access audit. Malware scanning + quarantine is not an MVP gate — it is required before the pre-pilot hardening gate passes ([80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md) §9 G3).
- The complete MVP journey succeeds in browser E2E tests for authorized users and fails safely for cross-tenant, wrong-role, expired-session, conflict, duplicate, stale-version, offline, and service-error scenarios.
- All release gates in the development guide pass in CI.
- Legal, privacy, security, accessibility, operations, and product owners sign off the pilot boundary.

## 11. Assumptions

- All current people, organizations, amounts, IDs, scores, dates, policies, and case outcomes are fixtures unless independently approved.
- Existing state machines express useful product intent but require domain-owner validation.
- Static/offline delivery can remain a demo/disaster-read-only option; authenticated production work requires online authoritative services.
- The first launch is controlled rather than open self-service.

Unresolved decisions are maintained in [95_RISKS_AND_OPEN_QUESTIONS.md](95_RISKS_AND_OPEN_QUESTIONS.md).
