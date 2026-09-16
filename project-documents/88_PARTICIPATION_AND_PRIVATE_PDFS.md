# Participation policy and private PDFs — working delivery record

Owner request: 2026-09-16, following the backend eligibility audit. Implements the
accepted separation of visibility, applicant category and invitation, followed by
slice 3 (real private PDFs). DEC-2026-018 and the file protocol in 60 §8 govern this work.

## Scope and acceptance

1. Preserve public/registered visibility and existing applicant-type enforcement.
   Explain that academic/company/lab team categories are self-declared, not proof
   of institutional verification. Private sourcing requires a live, exact-version
   invitation to the active workspace; hybrid remains open plus targeted outreach.
   Use the existing direct-offer and revocable access-grant boundary, not free-text
   invitee names as identities. Check invitation revocation on submission/revision.
2. Add private PDF upload authorization, quarantine, actual validation and malware
   scanning, immutable attachment binding, scan status and authorized download.
   No public object URLs or browser-authoritative clean flags. Bind reads to the
   current actor/workspace and existing record/version permissions. Both parties
   see only attachments on versions they can read, never the other party's drafts.
3. Exercise allowed and denied paths: wrong workspace/user, revoked membership or
   grant, stale versions, retries, unscanned/infected/invalid/oversized PDFs, and
   exact attachment/version binding. Keep synthetic local examples for inspection.

## Risks, verification and rollback

Files, cross-tenant sharing and grants are high risk: use `agent/security.md` and
require human security review before external release. Local identity remains a
development provider. Never use real personal files in synthetic acceptance.

Run focused domain/API/PostgreSQL/component tests first, then typecheck, lint,
contracts, complete tests/build and applicable browser/budget checks. Record actual
results below rather than treating this plan as completion evidence.

Preserve all pre-existing M1/slice-2 worktree changes and local data. Schema additions
must have paired migrations; do not roll back populated immutable evidence by
deleting it. Safe application rollback disables new writes and retains file data,
audit and version bindings; no database reset or volume deletion is authorized.

## Status

Code, isolated verification and live local scanner acceptance pass. The retained
arm64 Docker stack was upgraded in place through migration `0023`; its earlier
challenge/proposal examples remain. A clean attached PDF plus malformed and EICAR
rejected controls remain in the database for inspection. **This closes the local
Docker/PDF blocker, not connected-browser certification or production security
approval.**

## Implemented outcome

- Private sourcing now requires an active direct offer and exact published-version
  challenge-read grant to the submitting workspace. Cancellation denies submission;
  hybrid/public sourcing do not acquire an invitation prerequisite. Canonical
  applicant types, verification, NDA, deadline and other roles' permissions remain.
  Team kind remains self-declared, not verified academic affiliation.
- DEC-2026-019 records the owner's answer: challenge PDFs are private to the owner
  organization and invited/submitted solver workspaces, not all logged-in users.
  Submitted-proposal access derives from that proposal's active bilateral grant,
  accepted challenge version and non-withdrawn state. A draft alone confers none.
- Real byte upload is reserved against an editable exact record, signed for the
  current actor/workspace, written exclusively into a private volume and hashed.
  API and database both reject forged, unscanned and wrong-record attachment IDs.
  Version JSON is the immutable attachment binding; public projections stay free
  of private filenames, file IDs and storage keys.
- The server queues scanning, calls ClamAV INSTREAM and qpdf structural/encryption
  checks, and records clean/rejected/failed states with atomic audit/outbox/receipt.
  Scanner errors fail closed. Downloads reauthorize current session, membership,
  exact-version grant and required NDA even with an already-issued signed URL.
- Connected challenge editing/owner preview, solver proposal editing/detail,
  organization proposal detail and received invitations now expose the appropriate
  PDF panel. Failed upload retains the selected file; retries preserve command keys
  and bytes. Clean files must explicitly be attached and the parent draft saved.
  Create the challenge/proposal first; file reservations need an existing record.
- The PDF panel and challenge preview load in separate chunks. Existing byte ceilings
  were not raised. This is a bounded load-cost change, not a page-by-page UI redesign.

## Actual verification

Final command evidence for this working tree (overlapping suites are not additive):

| Command                                                                         | Result                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                      | 616 tests / 85 files passed                                                                                                                                     |
| `npm run test:postgres`                                                         | 151 tests / 15 files passed, including migration up/down/compatibility and negative file authorization                                                          |
| `npm run test:api`                                                              | 108 passed                                                                                                                                                      |
| `npm run test:contracts`                                                        | 16 passed; all seven file paths and bounded private schemas checked                                                                                             |
| `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check` | Passed                                                                                                                                                          |
| `npm run build`                                                                 | Passed; existing demo alias warnings for `personaForWorkspace` / `networkWorkspaceRoleLabel` remain                                                             |
| `npm run build:web:network`                                                     | Passed                                                                                                                                                          |
| `npm run check:budgets`, `npm run check:budgets:network`                        | Passed without ceiling changes; total emitted JS remains an informational warning                                                                               |
| `npm run verify:routes`, `npm run verify:links`, `npm run verify:offline`       | Passed (519 unique routes, 520 HTML files)                                                                                                                      |
| `npm run test:smoke`, `npm run test:standalone-interactive`                     | Passed; these are existing static/offline checks, not connected PDF acceptance                                                                                  |
| `npm run verify:boundaries`, `npm run analyze:source:check`                     | Passed; no source cycles                                                                                                                                        |
| `npm run docker:config`                                                         | Passed; independent local file-signing secret initialized without printing/replacing other secrets                                                              |
| `npm run docker:smoke:pdf`                                                      | Passed against live ClamAV 1.4.6/qpdf: valid upload/download/binding, pre-scan, anonymous/wrong-workspace denial, malformed/EICAR rejection and oversize denial |
| `npm audit --audit-level=high`                                                  | Exit 0; three existing moderate findings in Fastify/Vitest remain; no automatic dependency upgrades                                                             |

Earlier failures were corrected: migration fixtures expected the old last migration;
wrong-workspace HTTP tests now assert canonical non-enumerating 404; component tests
needed jsdom; initial JS exceeded budget until splitting the preview/PDF panel.

New regression evidence includes invitation cancellation and exact workspace,
unscanned/invalid/oversized/forged file denial, scanner error/rejection, immutable
bytes and identity, idempotent upload, signed-token actor/action/workspace/expiry,
two-party submitted access, invited-only challenge access, membership/grant
revocation and refusal to roll back populated file evidence. The scanner TCP tests
verify protocol framing and fail-closed replies. The live smoke complements those
injected tests with a rendered PDF and real daemon/parser verdicts.

## Closed blocker and retained live evidence

The original `clamav/clamav:1.4.6` Alpine tag did not publish a `linux/arm64/v8`
manifest. The local wrapper now pins the official multi-architecture
`1.4.6-debian13-slim` index digest. Docker Desktop's internal proxy was slow enough
to cause intermittent metadata TLS timeouts; using the active `desktop-linux`
builder completed and cached the layers without changing proxy/security settings.

The existing `rahhal-phase3-clean` volumes were preserved. ClamAV reports healthy,
updated its signature database, the API image contains qpdf, and the guarded setup
advanced the existing database to `0023_private_pdfs`.

Repeatable acceptance command: `npm run docker:smoke:pdf`. Retained evidence from
the successful 2026-09-16 run:

- challenge `chl_7b2f84bc39cd4cac95c93f465d5d1907`, version 2;
- clean and attached `fil_5c5bb40714204344ae3e1505cf4520a0` using
  `output/pdf/rahhal-private-pdf-example.pdf` (2,413 bytes);
- qpdf-rejected malformed control `fil_2b9f258399084abca9c1812bef2fb92e`;
- ClamAV-rejected EICAR control `fil_5d69e5d5367342d2b350ce2de965d46a`.

The live command also proves exact downloaded bytes, no anonymous or wrong-workspace
signed read, no pre-scan download and schema-level oversize denial. Remaining acceptance is the
actual cookie-authenticated desktop/mobile UI upload/download flow, encrypted-PDF
live control, unavailable-scanner recovery and stale/revoked-grant browser behavior.

Standard proposal creation/submission still uses the existing public/registered
challenge reachability path. This change enforces **private sourcing** there; it does
not claim a complete new ordinary-proposal journey for `invite_only`/`nda` visibility.
Those existing restricted calls continue using their dedicated direct-offer flow.
Do not conflate stricter eligibility with newly implemented confidential discovery.

## Security review / release focus

The read-only checklist from `agent/security.md` was applied to file routes, scoped
queries, storage/signatures, scanner, migration guards, public projection and
audit/outbox integration. Positive controls have tests above. **Local infrastructure
acceptance passes; human review is still required**, and this is not a security
certification.

Remaining release gates: production identity/contact delivery, RLS and infrastructure
hardening already tracked elsewhere; scanner image provenance/pinning and signature
monitoring; parser resource isolation and encrypted-at-rest storage/backup/restore;
redaction of signed query strings in reverse-proxy logs; operational quotas and
retention/orphan cleanup; existing moderate dependency advisories. Clean is a scanner
verdict, not a guarantee that every PDF is harmless. Local reservations permanently
count toward the 100-file/100-MiB quota until a separately reviewed retention policy
exists. No public object bucket or external provider has been deployed.

## Files changed by this slice

Pre-existing M1/slice-2 changes are preserved. The task-owned additions/edits are:

- Runtime/setup: `.env.example`, `Dockerfile`, `compose.yaml`, `infra/local/clamav/Dockerfile`, `README.md`, `package.json`, `scripts/create-local-env.mjs`, `scripts/init-private-files.mjs`, `scripts/smoke-private-pdf.mjs`.
- API: `apps/api/src/app.ts`, `ports.ts`, `postgres-composition.ts`, `in-memory-solver-workspaces.ts`, `private-file-routes.ts`, `private-pdf-storage.ts`; `apps/api/src/postgres/challenge-participation.ts`, `private-files.ts`, `challenges.ts`, `proposals.ts`, `solver-workspaces.ts`.
- Database: `apps/api/migrations/0023_private_pdfs.up.sql`, `0023_private_pdfs.down.sql`.
- Worker: `apps/worker/src/consumer.ts`.
- Domain: `packages/domain/src/index.ts`, `proposal.ts`, `private-file.ts`; `packages/domain/test/domain.test.ts`.
- Contracts: `packages/contracts/src/index.ts`, `private-files.ts`, `schemas.ts`, `openapi.ts`; `packages/contracts/test/contracts.test.ts`.
- UI: `components/private-pdf-attachments.tsx`, `private-pdf-attachments-panel.tsx`; `components/challenge-flow/challenge-flow-app.tsx`, `edit-steps.tsx`, `preview-page.tsx`; `components/solver/connected-opportunities.tsx`, `connected-teams.tsx`, `connected-proposal-editor.tsx`, `connected-proposal-detail.tsx`, `connected-organization-proposals.tsx`.
- Gateways: `lib/challenges/adapters/network.ts`, `lib/workspace/private-files.ts`.
- API/database tests: `apps/api/test/postgres-participation.test.ts`, `postgres-private-files.test.ts`, `private-pdf-storage.test.ts`, `postgres-foundation.test.ts`, `postgres-challenges.test.ts`, `postgres-proposals.test.ts`, `postgres-owner-publication.test.ts`.
- UI/gateway tests: `tests/private-pdf-attachments.test.tsx`, `tests/private-file-gateway.test.ts`.
- Docs: `project-documents/20_CANONICAL_MODEL.md`, `25_DECISIONS.md`, `26_LEAN_MVP_SCOPE.md`, `50_DATA_MODEL.md`, `60_API_CONTRACT.md`, `70_SECURITY_AND_AUTHZ.md`, `80_DELIVERY_ROADMAP.md`, `82_PHASE0_COMPLETION.md`, `88_PARTICIPATION_AND_PRIVATE_PDFS.md`, `90_REQUIREMENTS_TRACEABILITY.md`.
- Generated separately: `index.html` regenerated by the offline build; package dist/OpenAPI build output regenerated (ignored build artifacts). The rendered synthetic example is retained at `output/pdf/rahhal-private-pdf-example.pdf`. Local `.env` received one independent secret and remains untracked/undisclosed.

## Migration and safe reversal

Migration `0023` is additive after `0022`, with guard triggers on newly inserted
versions. Existing data is retained; invalid old metadata must be removed/re-uploaded
before saving another version. New file functionality requires the migration before
startup. It is now applied to the retained local database without resetting volumes.
The down migration succeeds only while `file_object` is empty; once evidence
exists, disable file writes/traffic and retain the schema, private volume, immutable
version bindings, audit and outbox. Do not reset the database or delete Docker volumes.
No push or deployment is implied by this record.
