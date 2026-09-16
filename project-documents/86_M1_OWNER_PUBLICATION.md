# M1 — Owner publication delivery record

Date: 2026-09-16. Scope: DEC-2026-018 and the owner's explicit request to retain delegated organization roles while enabling owner publication. This is local synthetic acceptance, not external-user release or completion of M2–M4.

## Behavior

- An active owner drafts, completes, previews and publishes in its own organization without other actors or platform approval. Required content and a future submission deadline remain mandatory.
- Complete unpublished versions can publish from draft, triage, formulation or approvals. Reworking an unpublished triage/approval record appends a new formulation version; earlier locked content and approvals remain evidence.
- The owner can extend deadlines, pause, resume, close and cancel using existing versioned, reasoned commands. Published content remains immutable.
- Delegated publishers retain the four-gate path. Members retain authoring; technical/legal/finance approvers retain only their existing gates. No cross-tenant authority or fabricated approval signatures are introduced.
- Public preview no longer presents private summary fallback, desired outcome, expected output or success criteria as public. Public API pages still read only the separate public projection. Confidential calls have no public projection.

## Migration and rollback

Migration `0022_m1_owner_publication` adds nullable owner attribution to `challenge` and extends the publication guard. Existing records are unchanged. The guard locks and validates active scoped owner membership, checks locked current-version evidence, eligibility snapshot and deadline, and prevents attribution/version replacement afterward. The existing delegated gate branch remains intact.

Apply the migration before running the updated API. Migration round-trip is supported before owner publication. Once an owner has published, the down migration deliberately refuses to erase its evidence. Keep the schema and roll forward; do not delete evidence, migration rows or the database volume. Existing seeded examples are retained.

## Verification

- `npm run typecheck` and `npm run lint`: pass.
- `npm test`: 80 files / 587 tests pass, including owner confirmation, full readiness, refusal recovery, role-specific actions and public-preview confidentiality.
- `npm run test:postgres`: 13 files / 142 tests pass. Covers owner publication from all four stages, immutable re-authoring, actual owner attribution, eligibility snapshot, audit/outbox, idempotent replay, concurrent publication, forced transaction rollback, confidential visibility, incomplete/expired content, role denial, session/membership revocation and guarded migration rollback. Existing fresh-install/down/up and delegated-gate tests remain passing.
- `npm run build`: pass. The existing static-demo alias warnings for `personaForWorkspace` and `networkWorkspaceRoleLabel` remain; network Docker build succeeds without them.
- `docker compose build api web worker`: pass using pinned Node 22.18.0. The earlier Docker Hub TLS failure cleared; no dependency or Dockerfile workaround was introduced.
- `docker compose up --detach --wait --no-build`: pass; existing local volume preserved and migration applied through the normal setup service.
- Connected Playwright: 7 desktop tests pass across `b7.pw.ts` and `connected.pw.ts`, covering owner confirmation/publication/pause/resume, the preserved multi-actor delegated path, anonymous public projection, persisted drafting, revoked session and non-enumerating unknown records.
- Final-code rerun: all 7 desktop cases pass (20.0 seconds), and the complete owner authoring/publication case passes at mobile 390×844 (9.9 seconds). This is scoped M1 browser acceptance, not every viewport or the deferred M2–M4 release bundle.
- The owner browser case additionally drives intake and all authoring steps through the UI, immediately saves the final fields into preview, then publishes with the same login. Its initial ambiguous radio selector timed out; waiting for the actual next-step heading fixes the test without sleeps or app changes. The full case passes in 5.7 seconds. Its retained example is `chl_f89567d267dd44258e32b616dd536a82`; the interrupted draft is also retained, not deleted.
- `npm run docker:smoke`: pass with persisted challenge after API restart.
- `npm run build:web:network` and `npm run check:budgets:network`: pass. The first budget run exceeded the existing common-route limit by 442 bytes; concise copy and removal of newly added optional preview markup resolved it without raising limits. Final common-route initial JavaScript is 1,398,939 / 1,399,000 bytes, so future shared changes need particular care.
- `verify:boundaries`, `verify:routes`, `verify:links`, `test:smoke`, `verify:offline`, `test:standalone-interactive`, `analyze:source:check`, and `check:budgets`: pass. Budget checks retain non-blocking reference-size warnings.

## Inspectable local example

The owner-published **نمونه انتشار مستقیم مالک — M1** remains in the local database. Initial verified record: `chl_6ec0659670f546bb964e83b193d22111`. Organization: `/app/org/challenges/record/governance/?id=chl_6ec0659670f546bb964e83b193d22111`; public: `/challenges/record/?id=chl_6ec0659670f546bb964e83b193d22111`. It is open after the pause/resume test. Existing seeds and delegated publication examples were not removed.

## Security review

Read-only review followed `agent/security.md` across the changed domain policy, API route predicates, PostgreSQL publication/patch paths, migration, network adapter and UI.

Positive controls: API authorization is inside the existing session/membership transaction before scoped record access and idempotent replay; owner authority does not bypass tenant scoping. The database validates current owner membership and locks it against concurrent revocation. Exact-version locking, eligibility, projection, receipt, audit and outbox share a transaction. Public content remains an explicit allowlist. Existing distinct-actor gate checks were not removed. The UI calls the existing typed command with the version previously read; it does not publish browser state or fall back to fixtures.

Human review is required before release because this changes authorization, immutable evidence and database guards. Managed authentication/contact delivery, private-file scanning/storage, RLS, independent audit operation and the existing external-user gates remain out of scope. No claim of production readiness is made.

Verdict: no blocking finding in the reviewed M1 authority/data paths; pass for local synthetic verification, subject to the independent human release-review gate. The React review kept actions in event handlers, used the existing versioned gateway, added busy/error recovery and accessible pressed states, and did not add client fetching waterfalls or dependencies.

## Changed surfaces

Domain/contracts: `packages/domain/src/challenge.ts`, `packages/contracts/src/openapi.ts`.

API/database: `apps/api/src/app.ts`, `apps/api/src/in-memory-challenges.ts`, `apps/api/src/postgres/challenges.ts`, migration `0022` up/down.

Connected UI: `components/challenge-flow/preview-page.tsx`, `governance-page.tsx`, `edit-page.tsx`, `connected-record-links.tsx`; transport comment in `lib/challenges/adapters/network.ts`.

Tests: `tests/organization-capabilities.test.ts`, `tests/domain.test.ts`, `packages/domain/test/domain.test.ts`, `tests/owner-publication-preview.test.tsx`, `apps/api/test/api.test.ts`, `apps/api/test/postgres-owner-publication.test.ts`, `postgres-challenges.test.ts`, `postgres-foundation.test.ts`, `postgres-proposals.test.ts`, `playwright/b7.pw.ts`.

Documentation: canonical model, decision log, lean MVP scope, data model, API contract, authorization policy, delivery roadmap, current status and this record. `index.html` is the regenerated offline artifact, not authoritative runtime code. README and the connected/seed-demo browser-login corrections predate this slice and are preserved.
