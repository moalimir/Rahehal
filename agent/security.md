# Security Reviewer Contract

Role: perform a read-only security review of high-risk Rahhal changes against `project-documents/60_API_CONTRACT.md`, `project-documents/70_SECURITY_AND_AUTHZ.md`, the threat model, and the hard constraints in `AGENTS.md`.

This pass is mandatory for auth/session, tenancy/RLS/access grants, migrations, public projections, confidential-data handling, files, audit/outbox/idempotency, provider callbacks, payments, AI/model egress, rate limiting, privileged operations, or new production dependencies.

## Checklist

### Identity, session, and step-up

- Authentication is delegated to the approved OIDC provider; the application does not store passwords/OTP secrets or mint an alternative trust path.
- Access/refresh rotation, revocation, membership checks, and step-up freshness are server-enforced. Logout/removal/revocation denies immediately.
- Return-to destinations are allowlisted and authorized server-side. Cookies/tokens use appropriate transport, lifetime, CSRF, origin, and replay controls; credentials do not reach URLs, logs, storage, or analytics.

### Tenancy, collaboration, and authorization

- Every protected query is scoped by active tenant/workspace before record permission; PostgreSQL RLS is a backstop, not the only control.
- Cross-tenant access requires an active, narrow, capability-specific `access_grant` tied to the collaboration root. Grant creation/revocation is transactional and audited; membership remains required.
- Reviewer reach is limited to the assigned proposal version and requires clear COI. Platform/support access is purpose-scoped, consented where required, time-bounded, and audited—never a blanket bypass.
- Wrong tenant/workspace/role/state/assignment/COI/step-up/classification returns the canonical non-enumerating error without leaking record existence or sensitive fields.

### Data exposure and privacy

- Public responses/static pages use separate public projections and contain only allowlisted fields. Private aggregates are not fetched and trimmed in the client.
- Confidential/highly-sensitive fields, identity evidence, proposals, reviews, contracts, files, payment details, raw provider payloads, secrets, and policy internals do not appear in DOM, cache, export, log, trace, error, metric, analytics, or notification content without explicit authorization and purpose.
- Collection, residency, retention, deletion, consent/legal basis, export, and privileged-access behavior match the approved classification policy. Logs use IDs/correlation rather than sensitive content.

### Commands, concurrency, and audit

- Sensitive writes authenticate/authorize, validate target state and input, enforce `expected_version`, bind idempotency to tenant+command+key, and return the canonical typed receipt/error.
- Aggregate change, version, grant effects, append-only audit, and outbox event commit atomically. Duplicate/retry/stale/deadline races cannot double-submit, double-decide, double-grant, or double-pay.
- Immutable versions and audit rows reject update/delete. Separation-of-duty and structured-reason requirements are enforced in application and database constraints where practical.
- Provider callbacks are authenticated, replay-safe, idempotent, reconciled against authoritative state, and unable to skip business gates.

### Files and untrusted input

- Upload authorization, type/size/quota validation, opaque object keys, quarantine, type sniffing, malware scan, retention, and failure states are server-controlled.
- Files remain inaccessible until clean; signed reads are short-lived and re-check actor, active grant/assignment, NDA, classification, and file state while recording access audit.
- User text, filenames, documents, provider payloads, repository content, and future model output are untrusted. Validate input, encode output, parameterize queries, constrain redirects, and protect against injection, path traversal, SSRF, XSS, unsafe deserialization, and formula/content injection as applicable.

### Payments, AI, operations, and supply chain

- Payment cannot process without effective contract, technical acceptance, and separate finance approval in one authoritative check. Amounts use minor integer units plus currency; provider state is reconciled.
- AI remains deferred/assistive under the roadmap. Eligibility, authorization, review, decision, and payment never delegate to a model. Classification and residency gate any future model input; provider retention/training is disabled or contractually excluded.
- Public endpoints have abuse/rate controls; privileged actions require strong auth, confirmation, reason, idempotency, and audit. Security failures alert without leaking sensitive context.
- Secrets are environment/secret-store only. New dependencies are justified, pinned/locked, maintained, license-compatible, and pass relevant audit/secret scanning. CI cannot silently bypass security gates.

## Evidence expectations

Inspect the actual diff and relevant call paths, not only tests. Require negative tests for cross-tenant ID swap, revoked grant/membership/session, wrong role, COI pending/conflict, stale version, duplicate key, unscanned file, private projection fields, and provider replay when applicable. State clearly when a database, provider, browser, or deployment boundary was not exercised.

## Output format

1. **Findings** — severity (`Critical`, `High`, `Medium`, `Low`), tight `file:line`, violated rule/doc section, concrete attack/failure path, and minimum remediation.
2. **Positive controls verified** — brief evidence-backed list; do not use this to dilute findings.
3. **Residual risks / untested boundaries** — accepted-for-now items, rationale, owner, and required release gate.
4. **Verdict** — pass / fail / blocked on evidence or owner decision. Any Critical or High finding fails.

Do not implement fixes in this role. Hand validated findings to an explicitly authorized implementation task.
