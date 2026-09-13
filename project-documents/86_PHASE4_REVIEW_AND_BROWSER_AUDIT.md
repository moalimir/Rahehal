# Phase 4 implementation review and connected browser audit

Date: 2026-09-13. Scope: the Phase-4 implementation pulled from GitHub through `2bc0371`, its local remediation, and practical browser → API → PostgreSQL verification. This records the local verification checkpoint before the owner's subsequent commit/push request; publishing it in a review PR does not imply deployment, independent security assurance, policy acceptance or Phase-4 certification.

## 1. Outcome and authority

D1-D9's core connected journey passes the corrected real-browser matrix: **14/14 tests across seven viewports**, with isolated organization, Operations, two reviewer and solver sessions. Native tests pass **668/668 across 91 files** and PostgreSQL tests pass **152/152 across 15 files**. The counts are repository-wide, not 668 or 152 Phase-4-only tests.

Phase 4 is **not certified**. D10 integration/notifications and D11 certification remain incomplete. A High callback-outage logging finding prevents security release. Initial login return paths, route-classification truthfulness, due reminders and broader browser-negative coverage remain open. DEC-2026-023's freshness/case-lifetime changes are implemented local proposals and require explicit Product + Security acceptance.

Earlier-phase A3/C1 regressions pass 7/7, but B7 fails on aborted workspace navigation (one failed, three skipped), adding an unresolved release regression.

Requirements used: AGENTS.md constraints 2-8, 10-11; doc 20 review/decision invariants; accepted DEC-2026-018 through 022; doc 60 typed commands/receipts/projections; doc 70 scope-first access, COI, freshness and separation of duty; doc 80 D1-D11. The earlier D1-D10-complete and DEC-2026-023-accepted descriptions were not supported by the recorded evidence and were corrected.

## 2. Remaining actionable findings

### P1 / High — callback outage logs sensitive authorization parameters

Location: `next.config.ts:43` (external `/auth/browser/:path*` rewrite).

With the API temporarily unavailable during a real OIDC callback, Next's proxy error path logged the full upstream URL, including authorization code/state query parameters, and returned a plain internal-server-error page. This violates AGENTS.md constraint 11 and doc 70's callback/log confidentiality requirement. Authorization-code expiry and one-time exchange do not justify storing credentials in logs.

Minimum remediation: a network-only, sanitized callback transport/error boundary that preserves redirect/cookie/no-store behavior, never logs the original URL or raw error containing it, and returns a useful recovery state. Add an actual API-unavailable callback regression asserting both browser recovery and absence of sensitive values in logs. Do not weaken freshness, exchange or replay checks. Raw callback traces are intentionally not included in this report. Owner: Backend + Security. Verdict: release fails until fixed and independently reviewed.

### P2 / Medium — protected deep link is lost after initial OIDC login

Locations: `components/runtime-provider.tsx:137`; `apps/api/src/app.ts:1237`; `components/portal/network-organization-login.tsx:63`.

The protected-page link supplies `returnTo`, but the login command sends only `expected_version: 0`, and the initial callback redirects to `/app`. An Operations actor entering `/app/ops/reviews` lands at `/app/ops/publication`; reviewer/organization deep links similarly lose their target. The corrected role login is usable, but “login and continue” does not resume the requested page. The acceptance harness explicitly navigates to the queue after login; it does not prove resume behavior.

Minimum remediation: typed, narrowly allowlisted initial-login resume state bound to the authorization flow, consumed only after successful authentication; normal target authorization must still run. Regress allowed Phase-4 targets, unknown paths, external/protocol-relative URLs and wrong-workspace denials. Owner: Frontend + Backend.

### P2 / Medium — route-classification ledger contradicts running Phase-4 routes

Locations: `lib/routing/route-classification.ts:68`; `tests/route-classification.test.ts:40`.

The classifier still treats `/app/reviewer` and `/app/ops` families as later-phase unavailable, and its test explicitly expects the working assignment/publication queues to be unavailable. This does not disable the separately wired connected screens today, but makes the route-truthfulness gate incapable of detecting accidental demo/unavailable regressions for the delivered review journey. Organization rubric/evaluation routes likewise lack explicit live milestone entries.

Minimum remediation: enumerate only implemented authoritative routes with their owning milestones, keep legacy fixture and future contract/payment routes unavailable, and assert each delivered Phase-4 route independently. Measure both runtime budgets when changing the shared registry. Owner: Frontend; D10 integration.

### P2 / Medium — due-reminder delivery is not implemented

Locations: `packages/domain/src/notification.ts:83`; `apps/worker/src/notification-projector.ts:37`; doc 80 D10.

Decision selection/rejection events project to solver notifications, but there is no review-due reminder schedule or corresponding delivered reminder flow. Showing due/overdue metadata in the Operations queue is not reminder delivery. This is an implementation gap, not a failed scheduler test.

Minimum remediation: settle recipients/timing and implement durable scheduled, deduplicated reminder events plus assignment/membership revocation checks, or obtain an explicit owner deferral. Do not fabricate notifications in the browser. Owner: Product + Backend; D10.

### P2 / Medium — decided reviews still offer invalidation controls

Location: `components/internal/connected-review-assignments.tsx:1019`.

The Operations queue renders an invalidation control for a locked assignment even after its challenge has a decision. D8 correctly rejects post-decision invalidation server-side; the visible action nevertheless promises an unavailable operation. No immutable decision evidence was changed in the check.

Minimum remediation: expose an authorized action/readiness projection and disable or omit invalidation after decision, explaining why. Keep backend denial and evidence immutability tests. Owner: Frontend + Backend; D10.

### P2 / Medium — earlier publication journey aborts during workspace navigation

Locations: `components/internal/workspace-resolver.tsx:71` and `:202`; failing acceptance `playwright/b7.pw.ts:128`.

The final B7 regression reached the governed approval flow, then initial publisher login/workspace selection failed with `net::ERR_ABORTED` while waiting for the workspace home. A3/C1 passed 7/7 separately; B7 did not pass (one failed, three skipped). The publisher has two active synthetic workspace memberships; those were preserved rather than deleted to force automatic selection.

Candidate cause: the resolver's destination effect calls `window.location.replace` when context changes, while the chooser's successful switch callback independently calls it too. The sole-workspace branch also has its own redirect. Duplicate redirect ownership can abort an in-flight navigation. The browser failure and duplicate paths are observed; the precise causal race is not yet independently isolated. This must not be presented as a proven backend publication failure or ignored as a green test.

Minimum next action: isolate the redirect race with a regression for sole/multiple-workspace selection, make one resolver path own navigation, then rerun B7's four cases without broad retries or sleeps. Three setup/navigation attempts were stopped under AGENTS.md's retry rule. Owner: Frontend; integration/release regression.

## 3. Remediations implemented and verified

| Issue / concrete failure                                                                                                  | Current fix location                                                                                | Regression evidence                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expired/missing decision proof returned generic access denial rather than the required recovery code                      | `apps/api/src/errors.ts:76`; `apps/api/src/postgres/decisions.ts:631`                               | Native decision tests and real PostgreSQL expired/wrong-context proof cases assert `STEP_UP_REQUIRED`                                                              |
| Step-up freshness/context/return and correlation were insufficiently constrained for reliable review evidence             | `apps/api/src/postgres/step-up.ts:117`; `apps/api/src/browser-session.ts:119`; migration 0029       | Exact actor/session version/workspace/action/challenge, five-minute single use, replay, denied callback, start/completion audit and immutable evidence checks      |
| A real stable Dex callback omitted `auth_time`, preventing the local decision flow from completing                        | `apps/api/src/postgres/oidc-authorization.ts:357`; `infra/local/dex/config.yaml:17`                 | Strict missing-`auth_time` denial; explicit local fallback acceptance; production/nonlocal setting refusal; real credential/popup browser walk                     |
| Unit-of-work access evidence could record success for a rolled-back denied query/command                                  | `apps/api/src/postgres/identity-workspace.ts:1347` and `:1443`                                      | Scope/role/record denials assert denied audit outcomes at the real transaction boundary                                                                            |
| Full-page reauthentication discarded the unsaved rationale/feedback                                                       | `components/challenge-flow/decision-panel.tsx:105`                                                  | Form preserved in memory through isolated popup; source/origin/challenge checks; no browser-storage persistence; seven-viewport browser tests                      |
| Older workspace loads could overwrite the current rubric/evaluation view                                                  | `components/challenge-flow/rubric-page.tsx:86`; `components/challenge-flow/evaluation-page.tsx:179` | Deferred old-response regressions switch workspace before resolution and assert current data wins                                                                  |
| Shortlist success message disappeared when a new challenge version remounted the panel                                    | `components/challenge-flow/evaluation-page.tsx:441`                                                 | UI toast regression plus real browser assertion after save/refetch                                                                                                 |
| Successful outcome disappeared when a later case read failed                                                              | `components/solver/connected-proposal-record.tsx:119`                                               | Component regression and real revoked-grant check preserve outcome/feedback while reporting unavailable case                                                       |
| A fixed one-year case grant silently expired an ongoing relationship                                                      | `apps/api/src/postgres/decisions.ts:814`; migration 0029                                            | Local proposed case-lifetime grant; direct revocation immediately gives indistinguishable 404; terminal evidence stays immutable; policy approval still required   |
| Reviewer/Operations protected routes offered solver-only OTP login                                                        | `components/route-fallbacks.tsx:82`; `components/portal/network-organization-login.tsx:18`          | Role-copy tests and anonymous protected route → actual OIDC identity → authorized reviewer/Operations queue                                                        |
| Seeded solver contact lacked the OTP identity/activation graph, so returning login could not reach its existing workspace | `apps/api/seeds/a1a-synthetic.sql:458` and `:473`                                                   | Foundation 11/11; deterministic rerun checks link + activation; real returning OTP login and explicit team workspace selection                                     |
| Connected legacy assignment detail pages rendered demo materials/scoring controlled by local COI                          | `components/internal/network-internal-boundary.tsx:90`                                              | Headed browser poisoned RV-204 COI then reproduced fixture materials; all five legacy detail routes now show explicit not-found; five no-demo-callback regressions |
| Dependency versions and generated runtime needed remediation/revalidation                                                 | Root/workspace manifests and lockfile                                                               | Next/analyzer/eslint-config-next 16.3.4, Fastify 5.12.3, Vitest 4.1.11; builds/gates pass and npm audit reports zero vulnerabilities                               |

### Local Dex qualification

Stable Dex v2.45.1's released authorization implementation does not supply the `auth_time` required by strict freshness validation. The local adapter is **opt-in**, only for non-production with explicitly permitted insecure HTTP and a loopback/`.localhost` issuer. It still validates the signed issuer/audience/nonce, JWT and PKCE exchange. Only this local fixture maps signed `iat` to the local freshness check. `iat` demonstrates issuance, not independently reauthenticated user presence. Production startup rejects the compatibility flag and strict missing-`auth_time` remains a denial. Sources: [released authorization code](https://raw.githubusercontent.com/dexidp/dex/v2.45.1/server/oauth2.go), [released example configuration](https://raw.githubusercontent.com/dexidp/dex/v2.45.1/config.yaml.dist), [Dex releases](https://github.com/dexidp/dex/releases).

Browser tests observed the login chooser and a fresh credential submission, and the popup resumed the exact decision. This is local development evidence only; it does not certify managed identity, `auth_time` assurance or MFA.

## 4. Real browser → backend → frontend evidence

The tests use real Chromium, Next network mode at localhost:3000, Fastify at localhost:3001, local Dex, the PostgreSQL 16 container exposed at localhost:5543, and the durable notification worker. Images were rebuilt before the accepted run. No business mutation in the core D1-D9 walk was substituted with a direct API call; API calls activate an already authorized workspace, while synthetic fixture creation establishes pre-Phase-4 eligibility/publication state.

| Story / browser action                                                | Backend/evidence assertion                                                                  | Observed browser result                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Organization authors rubric and opens evaluation                      | Exact published challenge/rubric and eligible locked-version roster                         | Frozen proposal/rubric references; no fixture fallback                      |
| Operations assigns two distinct reviewers                             | Exact proposal/rubric assignments and pending COI                                           | Own queues reflect server assignments                                       |
| Reviewer declares clear COI, opens materials, saves draft and submits | Assigned active membership, clear declaration, immutable exact score submission             | Materials absent before clear; own score/rationale visible afterward        |
| Operations locks both reviews                                         | Reasoned separate attribution, two valid locked reviews                                     | Organization completeness and aggregate result release                      |
| Organization shortlists, completes popup OIDC and selects             | Exact decision/review links, one case, selected outcome, audit/outbox chain, consumed proof | Form preserved; success toast; organization and solver display same case ID |
| Empty-roster no-award                                                 | Decided challenge, no-award, no case, consumed proof/audit                                  | Explicit completed decision                                                 |
| Nonempty reviewed no-award (headed manual)                            | Two exact review links, one rejected outcome, zero cases                                    | Solver sees rejection feedback and no case                                  |
| Reviewer reports categorized conflict; Operations replaces            | Original conflict/cancelled evidence retained, new independent coi-gate assignment          | No protected materials; conflict queue clears on replacement                |
| Operations invalidates and replaces locked review                     | Old invalidated evidence retained; new pending assignment                                   | Organization readiness blocks decision pending replacement                  |
| Operations cancels unfinished assignment                              | Required reason; cancelled state; COI declaration retained                                  | Empty-reason validation, then reflected cancellation                        |
| Selected solver grant revoked (local synthetic fixture)               | Exact case query returns 404 `NOT_FOUND` without data                                       | Selection/feedback survive; case becomes unavailable immediately            |
| Rejection notification read and followed                              | One `proposal.rejected` notification for that user/event; `read_at` persisted               | Preview-record deep link shows the same authorized rejection feedback       |
| Invalid/foreign/cancelled assignment and unknown challenge IDs        | Non-enumerating typed 404 responses                                                         | Explicit unavailable/not-found; no known fixture substitute                 |
| Legacy RV-204 local COI poisoned                                      | No authoritative API mutation                                                               | All five legacy detail pages now explicitly unavailable                     |

The automated projects are 360×800, 390×844, 480×900, 768×1024, 1024×768, 1280×800 and 1440×900. Actor contexts inherit each project's viewport, Persian locale and Tehran timezone. A manual 390px solver check found `lang=fa`, `dir=rtl` and no horizontal document overflow. This is not a full WCAG or Golden Master sign-off.

### Route inventory actually exercised

| Surface                                                                  | Connected route / behavior                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Organization identity                                                    | `/auth/organization/login`; actual local OIDC                                                                                         |
| Organization rubric                                                      | `/app/org/challenges/record/rubric/?id=…`; server-backed version authoring                                                            |
| Evaluation, comparison, shortlist, decision and inline case              | `/app/org/challenges/record/evaluation/?id=…`; server-backed exact ID                                                                 |
| Operations review/conflict/lock/replacement                              | `/app/ops/reviews`; server-backed queue                                                                                               |
| Reviewer COI/materials/scoring                                           | `/app/reviewer/assignments`; server-backed exact-assignment cards                                                                     |
| Solver identity/workspace                                                | `/auth/login` → local OTP; `/app` plus explicit authorized workspace selection                                                        |
| Solver outcome/case                                                      | `/app/solver/proposals/record/?id=…` and `/record/preview/?id=…`; server-backed own outcome and authorized inline case                |
| Solver notifications                                                     | `/app/solver/notifications`; worker-projected selection/rejection; read/deep-link verified manually                                   |
| Legacy reviewer fixture details                                          | `/app/reviewer/assignments/RV-204/{conflict,materials,score,compare,submit}`; explicitly not-found in network mode                    |
| Future organization case/decision/contracts and solver payments families | Not certified as standalone authoritative routes; inline decision/case reads above do not make later-phase route families implemented |

Static verification of 521 unique paths is not a claim that all 521 routes received a feature-level browser walk.

## 5. Commands actually run

| Command                                                                                                               | Actual result                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:seed`; focused API foundation Vitest                                                                      | Pass; 11/11 foundation tests                                                                                                                  |
| `npm run test:postgres`                                                                                               | Pass; 15 files, 152 tests, migration up/down/up compatibility included                                                                        |
| `npm run typecheck`; `npm run lint`                                                                                   | Pass                                                                                                                                          |
| `npm test`                                                                                                            | Final runtime-code run: 91 files, 668 tests pass                                                                                              |
| Focused network-internal-boundary Vitest                                                                              | 5/5 pass                                                                                                                                      |
| `docker compose build api database-setup web`; `docker compose up -d`                                                 | Pass; rebuilt connected services healthy                                                                                                      |
| `npm run docker:smoke`                                                                                                | Pass; PostgreSQL persistence across API restart                                                                                               |
| `npm run build`                                                                                                       | Pass; services plus Next demo export, 522 pages; generated `index.html` inspected                                                             |
| `npm run verify:routes`; `npm run verify:links`                                                                       | Pass; 521 unique paths / 522 HTML documents                                                                                                   |
| `npm run test:smoke`                                                                                                  | Pass; 20 representative routes                                                                                                                |
| `npm run verify:offline`; `npm run test:standalone-interactive`                                                       | Pass                                                                                                                                          |
| `npm run check:budgets`                                                                                               | Pass; shared initial JS 1,355,746/1,356,000 bytes; only 254 bytes headroom                                                                    |
| `npm run build:web:network`; `npm run check:budgets:network`                                                          | Pass; general role initial JS 1,398,834/1,399,000 bytes; only 166 bytes headroom                                                              |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:browser` against built demo `out` | 66 pass, 4 expected mobile-menu skips                                                                                                         |
| Connected Phase-4 desktop command                                                                                     | 2/2 pass after corrected independent-solver fixture                                                                                           |
| Connected Phase-4 all-project command below                                                                           | 14/14 pass, 2.1 minutes                                                                                                                       |
| `npm run verify:boundaries`; `npm run analyze:source:check`                                                           | Pass; five workspaces/105 boundary files; 285 modules/971 edges/zero cycles; existing CSS trend warning                                       |
| `npm audit --audit-level=high`                                                                                        | Pass; zero vulnerabilities                                                                                                                    |
| `npm run format:check`                                                                                                | Pass; final repository check completed after the audit evidence update                                                                        |
| Maintained-source `git diff --check -- . ':!index.html'`                                                              | Pass; generated vendor-string whitespace remains the separate exception above                                                                 |
| `git diff --check`                                                                                                    | Generated `index.html` line 53 has upstream minified-string trailing whitespace; do not strip it blindly or claim the whole diff check passed |

```bash
RAHHAL_CONNECTED_E2E=1 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  node --env-file-if-exists=.env node_modules/playwright/cli.js \
  test playwright/phase4.pw.ts --workers=1 \
  --output=output/playwright/phase4-final
```

Earlier runs were **not** accepted: one seven-viewport run was 12/14 (reusing an OTP contact hit the intentional three-start limit; a concurrently run persistence smoke interrupted an OIDC callback). An attempted alias fixture violated the existing one-identity-link-per-user/issuer constraint and failed setup. The final fixture creates independent activated synthetic humans with explicit team membership, preserving both the uniqueness constraint and abuse limit. A corrected desktop proof preceded the successful 14/14 confirmation. No test gate, schema guard, rate limit or visual baseline was weakened to obtain the pass.

Earlier-phase regressions were run with `RAHHAL_CONNECTED_E2E=1 PLAYWRIGHT_SKIP_WEBSERVER=1 node --env-file-if-exists=.env node_modules/playwright/cli.js test playwright/c1.pw.ts playwright/connected.pw.ts --project=desktop-1280x800 --workers=1 --output=output/playwright/connected-foundation-final`: **7/7 pass**. Separately, `test playwright/b7.pw.ts --project=desktop-1280x800 --workers=1 --output=output/playwright/b7-regression-final` has **one failure, three skipped**, with the aborted navigation described in section 2. Preliminary combined attempts stopped on obsolete sole-workspace chooser expectations and multiple-workspace navigation assumptions; neither is acceptance evidence. Further B7 reruns stopped after the third setup/navigation failure. No membership was deleted and no navigation failure was suppressed.

## 6. Files changed and tests

Exact maintained-file inventory for this combined remediation; it is a broad multi-finding worktree, not a single eight-file increment:

```text
.env.example
AGENTS.md
apps/api/package.json
apps/api/seeds/a1a-synthetic.sql
apps/api/src/app.ts
apps/api/src/browser-session.ts
apps/api/src/errors.ts
apps/api/src/postgres-composition.ts
apps/api/src/postgres/decisions.ts
apps/api/src/postgres/identity-workspace.ts
apps/api/src/postgres/oidc-authorization.ts
apps/api/src/postgres/step-up.ts
apps/api/src/step-up-port.ts
apps/api/migrations/0029_d8_d9_review_remediation.up.sql
apps/api/migrations/0029_d8_d9_review_remediation.down.sql
apps/api/test/browser-session.test.ts
apps/api/test/decisions.test.ts
apps/api/test/postgres-challenges.test.ts
apps/api/test/postgres-evaluations.test.ts
apps/api/test/postgres-foundation.test.ts
apps/api/test/postgres-identity-workspace.test.ts
apps/api/test/postgres-oidc.test.ts
apps/api/test/postgres-proposals.test.ts
apps/api/test/postgres-reviews.test.ts
apps/api/test/postgres-rubrics.test.ts
apps/api/test/support/fake-oidc-provider.ts
apps/worker/package.json
components/challenge-flow/decision-panel.tsx
components/challenge-flow/evaluation-page.tsx
components/challenge-flow/rubric-page.tsx
components/internal/network-internal-boundary.tsx
components/portal/network-organization-login.tsx
components/route-fallbacks.tsx
components/solver/connected-proposal-record.tsx
compose.yaml
infra/local/dex/config.yaml
lib/runtime/network-disabled.ts
next.config.ts
package-lock.json
package.json
packages/contracts/package.json
packages/domain/package.json
packages/testkit/package.json
playwright/b7.pw.ts
playwright/c1.pw.ts
playwright/connected.pw.ts
playwright/phase4.pw.ts
project-documents/20_CANONICAL_MODEL.md
project-documents/25_DECISIONS.md
project-documents/50_DATA_MODEL.md
project-documents/60_API_CONTRACT.md
project-documents/70_SECURITY_AND_AUTHZ.md
project-documents/80_DELIVERY_ROADMAP.md
project-documents/82_PHASE0_COMPLETION.md
project-documents/85_DEVELOPMENT_GUIDE.md
project-documents/86_PHASE4_REVIEW_AND_BROWSER_AUDIT.md
project-documents/90_REQUIREMENTS_TRACEABILITY.md
project-documents/README.md
tests/challenge-evaluation-ui.test.tsx
tests/challenge-rubric-ui.test.tsx
tests/connected-proposal-record.test.tsx
tests/network-internal-boundary.test.tsx
tests/network-organization-auth.test.tsx
```

Generated artifact: `index.html`. No OpenAPI operations were added in this remediation; same-origin browser transport remains separately typed, and the canonical `STEP_UP_REQUIRED` code already belongs to the shared contract. Final Next declarations did not add a retained diff.

The changed PostgreSQL review suite covers exact evidence links, invalid step-up contexts/expiry, same-key replay and conflicting reuse, concurrent decision serialization, case-insert rollback, immutable decision/review/grant evidence, COI/material authorization, revoked authority and migration refusal. Native/UI tests cover typed recovery, workspace response races, popup state retention, persistent shortlist toast, outcome-vs-case error independence, role-aware login and prohibition of demo legacy detail rendering. Tests that depended on older assignment-only or mutable-version assumptions were advanced to the current immutable COI/version boundary. Earlier connected A3/B7/C1 harnesses were updated to accept Dex's visible connector choice and the resolver's actual sole/multiple-workspace behavior, without replacing their existing business/denial assertions. Those harnesses navigate explicitly after initial login; they do not certify the still-missing protected resume flow.

## 7. Risk, migration, rollback and remaining evidence

Migration 0029 adds correlation to step-up attempts without inventing legacy audit correlation: old rows may remain null, new inserts require it. Case grants retain immutable identities and terminal lifecycle evidence. Apply the schema before dependent API code. Up/down/up was exercised on synthetic empty state. The down migration refuses to remove correlated attempts or case-lifetime evidence after those exist. Never delete review/decision/case/audit data to make rollback pass; revert exposure to explicit unavailable behavior and use a forward corrective migration where required. Existing finite legacy case grants are not rewritten into fake historical lifetime evidence.

The local acceptance run retains immutable synthetic challenge/proposal/reviewer/solver fixtures. One exact synthetic case grant was explicitly revoked to test immediate denial and was not reactivated; no customer data was involved. A separate synthetic reviewer/membership was added locally to test independent replacement. Those diagnostic SQL fixture operations are not a shipped audited case-revocation product command and must not be confused with production operational tooling.

Required before Phase-4 certification:

- Fix the High sanitized callback/error transport finding and regress an actual outage without logging secrets.
- Close initial-login resume, live route classification and post-decision action UX; complete or explicitly defer D10 reminder policy/implementation.
- Extend browser coverage to multi-proposal winner/loser and early aggregate-withholding, notification replay/deep-link denial after membership revocation, and the broader session/workspace/concurrency negative matrix. PostgreSQL coverage is not a substitute for those browser checks.
- Regress the full connected Phase-3 browser journey on this combined tree. The default 66-test static run does not do that.
- Isolate and resolve the B7 workspace-navigation abort, then pass all four publication/regression cases; the separate A3/C1 7/7 pass does not satisfy that gate.
- Obtain explicit Product + Security acceptance of DEC-2026-023 and independently assured provider freshness/MFA before production use.
- Complete independent security review and human Persian/RTL, keyboard/focus, accessibility and Golden Master review. No visual snapshot was updated just to make a gate green.

Measured payload headroom is extremely small in both modes; any further shared import/registry/UI change needs budget evidence. Managed identity/contact delivery, RLS, private storage/scanning, independently operated audit and external delivery remain pre-pilot gates; contracts/pilots/payments/impact remain Phase 5. None is certified by this local journey.

Verdict: **core D1-D9 implementation flow passes locally; security release fails and full Phase-4 certification remains incomplete.**

## 8. Local evidence artifacts

Artifacts are ignored local files under `output/playwright/`, not immutable or independently signed certification. Useful non-authentication evidence includes `phase4-org-selected.png`, `phase4-solver-selected-mobile.png`, `phase4-solver-case-revoked.yml`, `phase4-org-invalidated-readiness.png`, `phase4-reviewer-conflict-result.yml`, `phase4-ops-conflict-replaced.yml`, `phase4-ops-invalidation-replaced.yml`, `phase4-ops-cancelled.yml`, `phase4-solver-rejected.yml`, `phase4-rejection-notification-deep-link.yml`, and `phase4-legacy-materials-fixed.yml`. Accepted matrix output is in `output/playwright/phase4-final/`.

Do not publish raw Dex/OIDC login snapshots, browser authentication traces or framework callback logs; they can contain credentials or sensitive protocol parameters.
