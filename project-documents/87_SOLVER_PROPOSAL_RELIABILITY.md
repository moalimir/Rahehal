# Solver and proposal reliability — local acceptance

Date: 2026-09-16. Scope: the owner's **slice 2 — Solver and proposal reliability**, within lean M3/M4, not roadmap M2 selection/matching. Requirements: DEC-2026-018, [26 §5.1](26_LEAN_MVP_SCOPE.md#51-minimum-ux-completeness), FR-SOL-004–008. Existing M1 changes and database examples are preserved.

## Outcome

- Submission and resubmission save the visible content first and use the acknowledged server version, never the previous saved version. Server readiness, declarations, challenge-policy eligibility, team permissions and server-time deadlines remain authoritative.
- Partial drafts can save without native required-field validation blocking the command. Six initial regression tests failed against the old editor, demonstrating stale submission, save/refresh data loss, partial-save blocking and deferred-input presence.
- A save never reloads over newer typing. A failed save, a conflict, or a successful write followed by an unavailable read leaves the editor's text intact. Successful-save acknowledgement and unsaved changes are distinguished.
- Ambiguous saves replay their original payload and idempotency key before newer edits are saved. Ambiguous submissions replay the exact submission without another draft write; editing is frozen until the result is known. Synchronous busy protection prevents duplicate commands. No blind overwrite of a concurrent server version is allowed.
- The optional technology and execution-planning inputs (location, lead, availability, payment model) are removed from drafting, without deleting existing values. Required budget estimate, timing, IP and declarations remain. Payment or agreement execution is not implemented or implied.
- Draft records expose a resume action. History appears only for saved content/locked versions, not an empty newly-created draft. Clarification responses, organization feedback, revision scope and Tehran-time deadlines are visible in the record.
- Failed team invitation requests retain the entered recipient, scope and message. The form clears only after acknowledgement. Successful team/editor notices dismiss after six seconds; errors remain available.
- Missing proposal identifiers show an unavailable state instead of an endless loading screen. A workspace-change warning can be cancelled without losing text or changing server context. Confirmed switching discards the old editor instance; an old in-flight save cannot continue to submit under a newly active workspace.

## Verification

The running Docker network web, Fastify API and PostgreSQL were used, not demo persistence. No new dependency, API wire schema, domain permission, migration or production deployment was introduced.

- `npm test`: 604 tests in 82 files passed on the final source.
- `npm run test:postgres`: 142 tests in 13 files passed, including existing team-role/revocation, invitation, activation, tenant isolation, stale-version, idempotency, rollback, deadline and immutable proposal/revision coverage.
- Focused editor/record/gateway/polish suite: 44 tests passed after adding structured submission validation feedback.
- `npm run typecheck`, `npm run lint`: passed.
- `npm run build`: passed; the two pre-existing static-demo missing-export warnings described in [86](86_M1_OWNER_PUBLICATION.md) remain. The network build passes without those warnings.
- `npm run build:web:network`, `npm run check:budgets`, `npm run check:budgets:network`: passed without raising limits. Latest measured network common-route initial JavaScript: 1,398,989 / 1,399,000 bytes. This limit has effectively no headroom for future shared additions.
- `verify:boundaries`, `analyze:source:check`, `verify:routes`, `verify:links`, `test:smoke`, `verify:offline`, `test:standalone-interactive`: passed. Existing non-blocking reference-size warnings remain.
- `RAHHAL_CONNECTED_E2E=1 PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test playwright/solver-reliability.pw.ts --project=desktop-1280x800 --project=mobile-390x844 --workers=1`: **6 passed**. Real browser → cookie session → API → PostgreSQL; fresh synthetic accounts, invalid-then-Persian OTP, individual/team intent, personal/team submission, partial-save persistence, lost committed-save/submission responses, stale conflicts, unauthorized foreign record reads, invitation failure/recovery/acceptance, notice expiry, clarification and revision. Immutable original version and organization's exact revised content are asserted.

The first connected test attempt failed because its API fixture omitted the required same-origin header; correcting the fixture retained the CSRF gate. One Docker rebuild hit a registry TLS timeout; rebuilding with the already-used immutable Node 22 image digest succeeded. The in-app browser skill could not initialize due to the local native-module signature error; repository Chromium tests and the Playwright CLI were used instead. No signature/security bypass was made. Screenshots live under ignored `output/playwright/`.

## Inspectable examples

Existing challenge seeds remain. These new records were retained through authorized commands; no database reset or deletion was performed.

| Example                        | Proposal                               | Workspace                              |
| ------------------------------ | -------------------------------------- | -------------------------------------- |
| Personal, desktop              | `prp_b931894847ac40a2bc1a159d2317315b` | `wsp_8395427ae27247449c12c8d50308be24` |
| Team, desktop                  | `prp_9d18aedd11ca45c38e795ee59f437803` | `wsp_8100a61ae07a4960b5b4f3a46ffb88bc` |
| Revised with feedback, desktop | `prp_0e230bc3bdc84bb7b5390901aba632a9` | `wsp_f57b21ecd9874698985632496dfd353a` |
| Personal, mobile               | `prp_b1ae0035ad104444a70d0ccb6bcbb270` | `wsp_5fbd087aa3954da79d06e719cd53bcbc` |
| Team, mobile                   | `prp_ee7714d2617a40e6992e1699c8d3ea05` | `wsp_0503a4cf141947efb75d4b6cedb05167` |
| Revised with feedback, mobile  | `prp_6164560b05494b6da08d567ea5d5bcd9` | `wsp_2a1f0079b44b4226a5484c41015876fb` |

For organization inspection, sign in as the existing local `owner-alpha@synthetic.invalid` via organization login, then open `/app/org/proposals/record/?id=<proposal-id>`. The seeded local Dex password is `rahhal-local-owner`.

For personal/team desktop inspection, use the solver login with `solver-owner-1789577458840-desktop-1280x800@synthetic.invalid`, local development code `12345`, select the corresponding workspace, then `/app/solver/proposals/record/preview/?id=<proposal-id>`. The invited member is `solver-member-1789577458840-desktop-1280x800@synthetic.invalid`. These are synthetic identities, not real contact delivery. Mobile equivalents use `solver-owner-1789577417477-mobile-390x844@synthetic.invalid` and `solver-member-1789577417477-mobile-390x844@synthetic.invalid`.

## Security review and limits

Read-only review followed `agent/security.md` over the changed editor, gateway and team paths and their existing API authorization/versioning. The changes add no authority: server access checks precede scoped reads and replay; expected versions and immutable evidence remain enforced; the browser sends typed commands and never falls back to fixtures. Proposal data and retry payloads remain in component memory only. No credentials, proposal content or token data were added to logs or persistent browser storage. Local test output contains only synthetic identity/record references.

Local verdict: no blocking finding in the changed authority/data paths, subject to human release review. This is not a claim of zero defects, production readiness, or complete MVP acceptance.

- Unsaved text survives request failures **while the editor remains open**, not browser crashes or deliberate discard. Saved data survives reload. Reload/close and link navigation warn about unsaved work; accepting a warning or switching workspace discards the in-memory draft. Conflicts require comparing the server record in a separate window; there is no automatic merge or silent overwrite.
- Real identity/contact delivery, outbound notifications, and the private-file decision/storage remain external-use gates. Development OTP is synthetic only. No PDF upload claim is made.
- Broad page-by-page visual redesign, advanced history diffs, final matching/selection/withdrawal and complete lean M3/M4 acceptance remain separate work. Existing Phase 3 clarification/revision transitions are retained, not made mandatory for the future match.

## Files and rollback

Application files: `components/solver/connected-proposal-editor.tsx`, `components/solver/connected-proposal-detail.tsx`, `components/solver/connected-teams.tsx`, `lib/workspace/gateways.ts`.

Tests: `tests/connected-proposal-editor.test.tsx` (new), `tests/connected-proposal-record.test.tsx`, `tests/proposal-retry-gateway.test.ts` (new), `playwright/solver-reliability.pw.ts` (new).

Documentation: this report, `26_LEAN_MVP_SCOPE.md`, `80_DELIVERY_ROADMAP.md`, `82_PHASE0_COMPLETION.md`, `90_REQUIREMENTS_TRACEABILITY.md`. Generated artifact: `index.html` rebuilt by the standard demo build; it is not authoritative runtime code.

Rollback is web-only: revert this slice's specific frontend/gateway changes and rebuild the web service. No migration down or data deletion is required. Do not reset the dirty worktree or undo M1. Server-created immutable proposal versions, submissions and examples remain valid under either client. Reverting restores the old editor defects and is not recommended as normal operation.
