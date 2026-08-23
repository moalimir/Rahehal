# Requirements traceability

This matrix maps the reconstructed requirements to current evidence and the phase that makes each requirement authoritative.

Status meanings:

- **Prototype:** a realistic frontend behavior or executable client-side rule exists.
- **Partial:** some contract exists, but key behavior or coverage is incomplete even for a prototype.
- **Missing:** no meaningful implementation was found.
- None of these labels means production-secure until the listed production gap is closed.

## Public, identity, and organization

| Requirement | Current evidence                                                                | Status    | Production gap                                                       | Phase |
| ----------- | ------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- | ----: |
| FR-PUB-001  | Challenge directory, filters, cards/details, public route fixtures              | Prototype | Real published search projection and content operations              |     2 |
| FR-PUB-002  | Challenge fields for deadline, budget, eligibility, confidentiality, IP, review | Prototype | Authoritative policy/version data and safe public projection         |     2 |
| FR-PUB-003  | Not-found and explicit unavailable legacy states; unknown-ID tests              | Prototype | API/object authorization and tombstone/removal policy                |     2 |
| FR-PUB-004  | Organization directory/profile UI and demo disclaimers                          | Partial   | Verification provenance, moderation, asset/trademark approval        |   2/6 |
| FR-PUB-005  | Trust/legal/accessibility/guide routes                                          | Partial   | Approved versioned policy CMS, effective dates, consent evidence     |   0/6 |
| FR-IAM-001  | Registration/login/OTP/recovery UI; local expiring session                      | Prototype | IdP, credential/OTP delivery, revocation, abuse controls             |     1 |
| FR-IAM-002  | Organization registration and verification/KYB experiences                      | Prototype | Provider/manual KYB, representative authority, risk policy           |     1 |
| FR-IAM-003  | Solver and workspace verification records/states                                | Prototype | Authoritative verification provider, review and appeals              |   1/3 |
| FR-IAM-004  | Individual/team workspace context, membership and context switch                | Prototype | Server tenancy/membership, session claim and query scoping           |   1/3 |
| FR-IAM-005  | Role/workspace permission helpers and negative tests                            | Prototype | Server deny-by-default policy on every query/command                 |     1 |
| FR-IAM-006  | `safeReturnTo` and query/hash-preserving routing tests                          | Prototype | Integrate with real auth/session and allowlisted destinations        |     1 |
| FR-IAM-007  | `twoFactorVerified` and sensitive-action concepts                               | Partial   | Real step-up challenge, policy, freshness and recovery               |     1 |
| FR-ORG-001  | Versioned challenge browser store, autosave hooks, conflict states              | Prototype | Transactional API, optimistic concurrency and recovery               |     2 |
| FR-ORG-002  | Typed `ChallengeRecord` and four-stage form                                     | Prototype | Approved schema, server validation, real attachments                 |     2 |
| FR-ORG-003  | Shared validation/readiness functions and tests                                 | Prototype | One generated/client-server contract and error mapping               |     2 |
| FR-ORG-004  | Publication gate concepts and approval UI                                       | Partial   | Independent version-specific approval records and separation of duty |     2 |
| FR-ORG-005  | Local publish mutation updates public catalogue; release test                   | Prototype | Atomic database version lock, outbox and public projection           |     2 |
| FR-ORG-006  | Expert discovery/invitation UI and shared local offer store                     | Prototype | Matching evidence, server offer aggregate, notification delivery     |   2/3 |
| FR-ORG-007  | Proposal inbox/compare/review/clarification experiences                         | Prototype | Real proposal queries, eligibility and authorized transitions        |   3/4 |
| FR-ORG-008  | Decision UI, sensitive confirmations and receipts                               | Prototype | Authorized decision transaction, versions, reason and case creation  |     4 |

## Solver, team, review, and execution

| Requirement | Current evidence                                                              | Status    | Production gap                                                      | Phase |
| ----------- | ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- | ----: |
| FR-SOL-001  | Personal/team profiles, settings, verification, privacy and evidence fixtures | Prototype | Durable profile/evidence APIs, moderation and verification          |     3 |
| FR-SOL-002  | Structured eligibility rules, reasons/actions and readiness                   | Prototype | Versioned server rules, overrides, deadlines and audit              |     3 |
| FR-SOL-003  | Workspace-scoped saved store, filters and context-aware URLs                  | Prototype | Server persistence/sync and real search state                       |     3 |
| FR-SOL-004  | Canonical workspace ownership checks and draft repository                     | Prototype | Tenant-scoped database rows and API authorization                   |     3 |
| FR-SOL-005  | Six-step proposal wizard, validation, declarations and metadata upload        | Prototype | Server schema, secure evidence and draft collaboration              |     3 |
| FR-SOL-006  | Proposal versions/history/diff and immutable-state intent                     | Prototype | Transactional lock, exact content hashes and revision commands      |     3 |
| FR-SOL-007  | Team create/invite/request/roles/transfer/remove/archive commands             | Prototype | Server membership lifecycle, concurrency and notifications          |     3 |
| FR-SOL-008  | Explicit role-policy decision module and tests                                | Prototype | Central policy service/middleware and exhaustive access tests       |   1/3 |
| FR-SOL-009  | Shared direct-offer store and transition guard                                | Prototype | Authoritative aggregate, expiry scheduler and two-party permissions |     3 |
| FR-SOL-010  | Dedicated response workflow and tests prevent premature acceptance            | Prototype | Legal state definition and server command separation                |     3 |
| FR-REV-001  | Assignment-scoped routes, fixtures, queue and lifecycle state machine         | Prototype | Assignment database, workload policy and exact versions             |     4 |
| FR-REV-002  | Browser COI gate blocks materials/scoring                                     | Prototype | Server/object/export gate before any protected response             |     4 |
| FR-REV-003  | COI operations concepts and permission states                                 | Partial   | Authoritative COI record, escalation and non-leaking enforcement    |     4 |
| FR-REV-004  | Rubric/scoring experience and required-rationale intent                       | Prototype | Server rubric schema/version and score validation                   |     4 |
| FR-REV-005  | Final review/lock/receipt/audit concepts                                      | Prototype | Immutable review transaction and durable audit                      |     4 |
| FR-REV-006  | State-machine invalidation/reopen intent                                      | Partial   | Separation-of-duty operations command and evidence                  |     4 |
| FR-REV-007  | Comparison and blind-review policy content                                    | Partial   | Field-level anonymity and timed aggregation policy                  |     4 |
| FR-EXE-001  | Solver case continuity links proposal, contract, pilot and payments           | Prototype | Authoritative case-creation transaction and relationships           |     5 |
| FR-EXE-002  | Contract states, versions, approval/sign UI and commands                      | Prototype | Legal document/e-sign service and effective-state authority         |     5 |
| FR-EXE-003  | Pilot milestones, tasks, KPIs and evidence UI                                 | Prototype | Durable scheduling, evidence and change control                     |     5 |
| FR-EXE-004  | Deliverable submit/accept/revise/reject states                                | Prototype | Server acceptance protocol, evidence and authorized commands        |     5 |
| FR-EXE-005  | Mock payment requires technical, finance and contract gates                   | Prototype | Server payment policy, ledger and separation of duty                |     5 |
| FR-EXE-006  | State-machine retry/idempotency intent                                        | Partial   | Provider integration, callback security, ledger and reconciliation  |     5 |
| FR-EXE-007  | Case close/payment completion/feedback commands                               | Prototype | Durable closure rules, one-time feedback and audit                  |     5 |
| FR-EXE-008  | Impact/ROI/baseline UI and fixtures                                           | Prototype | Approved measurement schema, data sources and validation            |     5 |

## Operations and non-functional requirements

| Requirement  | Current evidence                                                                      | Status                | Production gap                                                          | Phase |
| ------------ | ------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- | ----: |
| FR-OPS-001   | Ops queues show SLA/priority/reason/next-action concepts                              | Prototype             | Real work queue, assignment, escalation and SLO data                    |   2–5 |
| FR-OPS-002   | Separate routes/experiences for verification, publication, review, disputes, payments | Partial               | Distinct privileged roles and separation-of-duty policy                 |   1/5 |
| FR-OPS-003   | Confirm dialogs, reasoned action concepts, idempotent mock receipts                   | Prototype             | Server step-up, policy, idempotency and immutable audit                 |   1/5 |
| FR-OPS-004   | Support-consent concepts in route content                                             | Partial               | Time-bound privileged access, approval and session recording            |     5 |
| FR-OPS-005   | Client audit events and route history                                                 | Prototype             | Append-only independently controlled audit store/search/export          |     1 |
| FR-OPS-006   | Notification fixtures/preferences and state-machine side effects                      | Partial               | Delivery providers, template versions, retries and dead-letter queue    | 1/3–5 |
| NFR-SEC-001  | Documentation warns browser state is not authority                                    | Missing in production | Real service authority and removal of production mocks                  |   1–5 |
| NFR-SEC-002  | Safe redirects, input/upload validation, role rules, tests                            | Partial               | Full web/API security controls, threat model and penetration test       |   1/6 |
| NFR-PRV-001  | Privacy/legal pages and visibility concepts                                           | Partial               | Data map, legal basis, consent, residency, retention and rights process |   0/6 |
| NFR-REL-001  | Client idempotency and version/conflict concepts                                      | Prototype             | Database uniqueness, expected versions, outbox and replay tests         |   1–5 |
| NFR-REL-002  | No backup/DR implementation                                                           | Missing               | Backup, restore, DR, reconciliation and measured RTO/RPO                |   1/6 |
| NFR-AUD-001  | Action/transition audit codes, receipts and correlation concepts                      | Prototype             | Durable append-only audit with actor/tenant/entity/outcome              |     1 |
| NFR-A11Y-001 | Axe tests, dialog manager, semantic/focus/target-size contracts                       | Partial               | Browser/manual WCAG 2.2 AA audit and remediation                        |   0/6 |
| NFR-I18N-001 | `lang=fa`, RTL, Estedad, Persian formatting and bidi usage                            | Prototype             | Locale policy, real currency/date/time edge cases and content QA        |   2–6 |
| NFR-PERF-001 | Byte budgets and analyzers exist                                                      | Partial/failing       | Restore budgets, add web-vital targets and role code/CSS splitting      |   0/6 |
| NFR-OBS-001  | No runtime telemetry stack                                                            | Missing               | Logs, metrics, traces, web vitals, alerts and analytics governance      |     1 |
| NFR-DEL-001  | Rich local scripts and tests                                                          | Partial               | Required CI/CD, environments, visual baseline and rollback              |   0/1 |
| NFR-COMP-001 | Policy content explicitly defers qualified review                                     | Missing approval      | Legal/privacy/finance/security review and operating procedures          |   0/6 |

## Coverage interpretation

The matrix demonstrates that the product concept is not missing breadth. Most functional requirements have a prototype representation. The delivery risk is depth: the same client-side evidence cannot prove identity, authorization, confidentiality, immutability, transactionality, financial correctness, or operational recovery.

Phase acceptance tests should reference these requirement IDs. A requirement can move to **production-complete** only when implementation, automated evidence, operational procedure, and required owner approval all exist.
