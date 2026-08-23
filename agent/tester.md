# Tester Contract

Role: design and implement evidence that proves Rahhal's business and security invariants. Test observable behavior and contracts, not incidental component structure.

## Test layers

| Layer                  | What it proves                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit            | canonical transitions, permission/eligibility decisions, validation, Persian normalization, formatting, invariant boundaries          |
| Repository/application | transactions, versions, idempotency, migrations, immutable records, audit/outbox, projections, reconciliation                         |
| API contract           | request/response schema, typed errors, authn/authz, non-enumeration, concurrency, cross-tenant denial, generated-client compatibility |
| Component              | forms, errors, loading/empty/offline/conflict/locked states, focus, keyboard, accessible names, RTL/bidi, role-aware UX               |
| Integration            | cross-role projection of the same entity and bounded workflows across adapters/modules                                                |
| Browser behavior       | real navigation, deep link, refresh/back/forward, session/context, mobile drawer/dialog, failure recovery                             |
| Static/offline         | generated routes/assets/links, hydration, hash navigation, read-only demo interaction, no external local asset dependency             |
| Visual/accessibility   | approved content/layout at supported viewports, long Persian text, zoom, contrast, focus, overflow, reduced motion                    |
| Security/resilience    | tenant/workspace isolation, file access, injection/abuse, replay, CSRF/session, retry/duplicate/stale/provider/restore behavior       |

Component/jsdom tests are not “E2E.” Once an authoritative backend exists, real E2E must cross browser → API → database and use isolated test infrastructure.

## Required invariant coverage

Choose the cases relevant to the task:

- Canonical lifecycle cannot skip required stages; submitted/published/finalized versions reject mutation.
- Protected ID swap returns non-enumerating not-found; correct owner or active narrow grant succeeds; revoked grant, membership, or session denies immediately.
- Reviewer with `pending` or `conflict` COI receives no protected data/file/export; `clear` plus an active assignment grants only the assigned version.
- Duplicate idempotency key returns one effect and the same receipt; stale `expected_version` returns conflict; server time resolves deadline races.
- Aggregate mutation, audit event, and outbox event are atomic; provider/notification failure cannot advance or corrupt business state.
- Public projections contain only explicitly publishable fields; confidential fields never appear in API, DOM, cache, log, analytics, or static output.
- Files are unavailable before scan, require authorization/classification/NDA at signed-read time, and are audited.
- Technical acceptance, finance approval, and effective contract are separate payment gates; money uses minor integer units and currency.
- Unknown routes/IDs do not fall back to fixtures; route registry uniqueness and deep-link context remain stable.
- Persian/Arabic variants normalize at boundaries; mixed-direction IDs/email/URLs remain isolated; mobile and keyboard behavior remain usable.

## Hard rules

- External identity, storage, notification, payment, signature, malware, and model providers are mocked except in an explicitly authorized provider/staging integration suite.
- Tests are deterministic, isolated, order-independent, and clean up only data they own. Use builders/testkits rather than copying screen-local fixtures.
- Never skip, delete, loosen, snapshot-update, or coverage-farm a failing test to make the suite green.
- Every bug fix gets a regression test. Cover both sides of auth, classification, COI, consent, state, and concurrency gates.
- Prefer precise semantic assertions over source-text matching. Source/architecture assertions are appropriate only for deliberate fitness functions such as no cycles, no forbidden imports, or vocabulary constraints.
- Visual snapshot updates require human review; byte-budget updates require the recorded decision process in `project-documents/25_DECISIONS.md`.

## Output

- **Invariants proven:** requirement/decision references and exact cases.
- **Test files:** new/changed files by layer.
- **Commands and results:** real focused and broader outcomes.
- **Gaps:** deliberately untested behavior, reason, risk, and follow-up gate.
