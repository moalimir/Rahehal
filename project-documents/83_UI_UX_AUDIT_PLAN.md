# UI/UX Audit & Consolidation Plan

**Added 2026-08-29; restored 2026-08-31.** Owns the frontend-wide UI/UX audit: sequencing, the review rubric, tooling decisions, and how findings turn into work. This is a cross-cutting quality pass, not a new delivery phase — it does not reorder or block the Phase 1–6 milestones in [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md).

As [README §"The one thing to know"](README.md) already states: the prototype's real defect isn't missing screens — it's that the same concepts are modeled inconsistently across the app. This plan applies that same insight to the UI layer: fix the shared foundation once, then walk every page group against one consistent rubric.

## 1. Purpose and scope

Audit and consolidate every user-visible page in the frontend (root `app/`, `components/`, `data/`, `lib/` — the Next.js app; **not** `apps/web`, which does not exist in this repo). Scope is ~65–70 distinct page templates behind 512 generated routes (see §3.1). Each page group gets: an audit report against the §6 rubric, owner approval of what to fix, the fix itself, and verification — before moving to the next group.

## 2. Non-goals

- **No new backend capability or business logic.** Findings that imply a missing feature (not just a missing/broken UI treatment of an existing one) are _reported_, not built — see §7. This keeps the audit aligned with the roadmap's depth-before-breadth strategy instead of working against it.
- **No third-party design/UI skill installed.** `taste-skill` (an individual's GitHub repo, installed via a script that downloads and runs code) was evaluated and declined — no vetted equivalent exists in the skill/plugin marketplace either. The rubric in §6 is authored from this repo's own conventions instead.
- **No new dependency added preemptively.** Framer Motion is not added up front; it's a candidate only if a specific page's interaction genuinely can't be done with CSS (existing `prefers-reduced-motion` handling in `app/internal.css`, `app/solver-workspace.css`, `app/challenge-flow.css`, `app/globals.css` already covers the current motion surface).
- **Does not gate or replace the visual Golden Master baseline** (`T-E` in [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md)). It should land _before_ that baseline is finally committed, so the baseline doesn't freeze in known-inconsistent states — but the two are tracked separately.

## 3. Baseline findings (2026-08-29)

### 3.1 Inventory

The app is not organized as files-per-page; every route resolves at runtime from data registries (`data/internal-routes.ts`, `data/public-product-routes.ts`, `data/routes.ts`, `data/challenge-flow-routes.ts`, `data/legacy-redirects.ts`), dispatched from `app/[...slug]/page.tsx`. `data/internal-routes.ts` alone declares 158 `InternalRoute` entries (77 org / 56 solver / 23 ops / 17 reviewer) over a 49-member `InternalExperience` template union. Including the challenge-flow, public, auth, and onboarding templates, the effective template count is **~65–70**, generating **512 unique static routes / 513 HTML files** (many are the same template repeated per fixture ID).

### 3.2 Real vs. prototype

`next.config.ts` branches on `RAHHAL_WEB_RUNTIME` (`demo` default vs. `network`) and, in demo mode, physically compiles connected-only modules out of the bundle via a `NormalModuleReplacementPlugin`. The connected runtime now covers Phase 1/2 identity and workspace context, challenge draft/read/save and readiness, attributed approval gates, publication, live-call controls, the platform approval queue/brief, and the public challenge catalogue/detail. The remaining solver, reviewer, ops, organization, public, auth, and onboarding experiences still read hardcoded fixtures (`data/mock.ts`, `data/solver-fixtures.ts`, `data/organization-profiles.ts`) or localStorage-backed repositories (`lib/solver/repository/*`, `lib/challenges/storage.ts`). Audit passes on prototype-only pages need to run once in demo mode; connected Phase 1/2 surfaces require network/error/authorization coverage as well.

### 3.3 Design-system fragmentation

Two independently named CSS custom-property systems load on every page: `app/design-system.css` (`--color-brand-*`, `--color-action-*`, `--space-*`, `--text-*` — used by public/portal/challenge-flow pages) and `app/internal.css` (`--app-blue/ink/muted/line/canvas`, overridden per role — used by solver/org/reviewer/ops workspace pages), with different font-fallback chains (`Estedad, Tahoma, Arial, sans-serif` vs. `Estedad, Tahoma, sans-serif`). `tailwind.config.ts` matches neither: it hardcodes `fontFamily.sans` to `["Tahoma","Arial","sans-serif"]` (no Estedad) and only maps 3 color families. Most styling (30,712 lines across 7 CSS files) happens outside Tailwind entirely. `docs/PROJECT.md` §7's own token table lists `--app-green/amber/red` status tokens that need to be located or reconciled against what `app/internal.css` actually declares. No shared component-primitives folder exists (`components/a11y/dialog-manager.tsx`'s own comment notes it's temporary, "while they migrate to the shared primitive" — that primitive doesn't exist yet).

### 3.4 Accessibility and visual-regression coverage

`axe-core` runs in exactly one file (`tests/accessibility-release.test.tsx`), against 4 of 512 routes, in jsdom, with `color-contrast` explicitly disabled. `playwright/behavior.pw.ts` (via `playwright/coverage-matrix.ts`) real-browser-checks 7 representative routes (lang/dir/visible-main + 3 interaction tests) across 7 viewports; `playwright/b7.pw.ts` separately proves the authoritative Phase 2 journey against Docker. `playwright/visual.pw.ts` covers 18 scenarios × 7 viewports, but `playwright/golden/` has never had a baseline committed (confirmed in `docs/PROJECT.md` §8 "Known QA limits"). None of this is a missing-tool problem — the tooling exists; it is still wired to a small fraction of the total surface.

### 3.5 Existing informal style guide

`docs/PROJECT.md` §7 ("Design system") and §4 ("Route model") are the closest thing to a style guide today — font stack, a token table, a shared-pattern inventory (panels, metric cards, status badges, gate checklists, confirmation dialogs), and responsive/a11y rules (44×44 targets, 1024/768 breakpoints). No Figma, Framer, or Storybook reference exists anywhere in the tracked repo. This plan's Phase A/B output should fold into and correct `docs/PROJECT.md` §7 rather than create a second, competing style reference.

## 4. Tooling decisions

| Question                                        | Decision                                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taste-skill` (github.com/leonxlnx/taste-skill) | Declined                                                                                                                                                                                           | Installed via a script that downloads and runs code from an unvetted individual repo; no marketplace equivalent exists either (`SearchSkills`/`SearchPlugins` returned nothing for design/UI/a11y/taste/figma/framer). Revisit only if the owner installs it independently and shares the resulting `SKILL.md` for review. |
| Framer                                          | Framer Motion only, deferred                                                                                                                                                                       | Added as a dependency only if a specific page's interaction genuinely can't be done in CSS — not installed up front.                                                                                                                                                                                                       |
| What actually gets used                         | Playwright (already wired: `playwright/coverage-matrix.ts`, `playwright/behavior.pw.ts`, `playwright/visual.pw.ts`) + axe-core (already a dependency, currently underused) + a bespoke rubric (§6) | Closes the gap in §3.4 by extending existing infrastructure rather than adding new tools.                                                                                                                                                                                                                                  |

## 5. Phase A — design-token consolidation (do first)

Reconcile `app/design-system.css` and `app/internal.css` into one token vocabulary (or an explicit, documented mapping between them if a full merge is out of scope for one pass); fix `tailwind.config.ts` to reflect the real fonts/colors or stop implying Tailwind is the styling source of truth; resolve the `docs/PROJECT.md` §7 status-token discrepancy. This is a CSS/shared-imports change — per [AGENTS.md](../AGENTS.md)'s verification table it requires `npm run analyze:source:check` and `npm run check:budgets` in addition to the standard gates, since it touches every page's shared CSS payload.

**Gate:** one documented token vocabulary; `tailwind.config.ts` matches reality; `check:budgets` still passes.

## 6. Phase B — the review rubric

A single checklist authored from: AGENTS.md's code-review rules (RTL/bidi, keyboard, focus, dialog, error-association, contrast, target-size, zoom, reduced-motion, responsive), `NFR-A11Y-001`/`NFR-I18N-001`/`NFR-PERF-001` ([15_PRODUCT_REQUIREMENTS](15_PRODUCT_REQUIREMENTS.md)), and the Phase A token vocabulary. Every page-group audit in Phase C is graded against this same rubric — the point is consistency across ~65 templates, not rediscovering the same criteria each time. Lives as a section in `docs/PROJECT.md` §7 once written (not a new competing doc).

**Gate:** rubric reviewed and accepted before the first Phase C group starts.

## 7. Phase C — page-group passes

Order chosen so shared chrome and public-facing pages (lowest complexity, highest visibility) go first, and the one real API-backed flow is treated as its own case (checked against actual network/error/conflict states, not just visuals):

| ID  | Group                                                       | Templates (approx.)     | Status      |
| --- | ----------------------------------------------------------- | ----------------------- | ----------- |
| U1  | _(Phase A — token consolidation)_                           | —                       | not-started |
| U2  | _(Phase B — rubric)_                                        | —                       | not-started |
| U3  | Shared app-shell, nav, dialogs                              | ~11                     | not-started |
| U4  | Public marketing/trust                                      | ~16                     | not-started |
| U5  | Challenge discovery + organization directory                | ~85 (heavily templated) | not-started |
| U6  | Auth + onboarding                                           | ~28                     | not-started |
| U7  | Org workspace (challenge-flow = real API; rest = prototype) | ~106                    | not-started |
| U8  | Solver workspace                                            | ~90                     | not-started |
| U9  | Reviewer + Ops/admin workspace                              | ~42                     | not-started |
| U10 | Legacy redirect/unavailable shells                          | ~115                    | not-started |

**Per-group workflow:** audit report (rubric findings, cited `file:line`) → owner approves scope → fix → verify (focused tests + `npm test` + `npm run build` + the relevant `playwright/coverage-matrix.ts` routes, extended to cover the group being worked) → next group.

## 8. How findings become work

Two kinds of findings, handled differently:

- **Rubric violations against something that already exists** (wrong token, missing focus state, contrast failure, missing bidi isolation, broken link) — fixed directly within that group's pass, no separate approval needed beyond the group-level scope approval.
- **Gaps against an FR/NFR requirement that no page currently addresses at all** — logged in §9 below as a candidate, _not_ built during the audit. Requires an explicit, separate approval per candidate before any implementation, consistent with the roadmap's depth-before-breadth strategy (§2).

## 9. New-capability candidates (report-only backlog)

_(Empty at plan creation. Populated as Phase C groups surface FR/NFR gaps that imply missing functionality rather than a UI defect. Each entry: requirement ID, page/group, gap description, proposed next step — owner decides whether/when to schedule.)_

## 10. Status

| Item                          | Status        |
| ----------------------------- | ------------- |
| This plan                     | `ready`       |
| Phase A (token consolidation) | `not-started` |
| Phase B (rubric)              | `not-started` |
| Phase C (U3–U10)              | `not-started` |
