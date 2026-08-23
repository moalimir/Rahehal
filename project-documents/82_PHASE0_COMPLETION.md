# Phase 0 — Baseline & Decisions: completion report

Tracks the Phase-0 deliverables and exit gates from [80 §3](80_DELIVERY_ROADMAP.md). Legend:
**✅ Done / verified** · **🟡 In progress — needs a fix or a decision** · **⬚ Owner action** (a business/legal sign-off).

Installed and verified locally on 2026-08-23 (macOS arm64, Node 24.16.0 / npm 11.13.0 — within the pinned `engines` floor; CI runs the pinned Node 22 from `.nvmrc`).

## 1. Verified locally (2026-08-23)

| Check                                                              | Result                                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --include=optional`                                        | ✅ 523 packages, **0 vulnerabilities**, `@img/sharp-libvips-darwin-arm64` present — **R-10 fixed**                                     |
| `npm run typecheck`                                                | ✅ pass                                                                                                                                |
| `npm run lint`                                                     | ✅ pass (`--max-warnings=0`)                                                                                                           |
| `npm run format:check`                                             | ✅ pass                                                                                                                                |
| `npm test`                                                         | ✅ **35 files, 191 tests** pass                                                                                                        |
| `npm run build`                                                    | ✅ **506 static pages**, offline bundle regenerated, **no manual retry**                                                               |
| `verify:routes` / `verify:links` / `test:smoke` / `verify:offline` | ✅ all pass                                                                                                                            |
| `test:standalone-interactive`                                      | ✅ **now passes** — was a harness bug (T-C), fixed in `scripts/smoke-standalone-interactive.mjs`; the offline bundle renders correctly |
| `test:browser` (Playwright, real Chromium)                         | ✅ **40 behavior tests × 7 viewports, 0 failures**                                                                                     |
| `check:budgets`                                                    | ❌ **8/8 exceeded** by small margins (T-D — a rebaseline decision, not a regression)                                                   |

## 2. Deliverable status

| #   | Phase-0 deliverable                                  | Status                          | Notes                                                                           |
| --- | ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Resolve P0 decisions with named owners               | ✅ (defaults) / ⬚ (sign-off)    | [25_DECISIONS.md](25_DECISIONS.md) Part B                                       |
| 2   | Adopt the canonical model as law                     | ✅                              | ADR-0001                                                                        |
| 3   | Open ADRs (ADR-0001…0013)                            | ✅                              | [25_DECISIONS.md](25_DECISIONS.md) Part A                                       |
| 4   | Pin Node/npm runtime                                 | ✅                              | `.nvmrc`, `.node-version`, `engines`, `packageManager`                          |
| 5   | Deterministic optional-dep (Sharp/libvips) install   | ✅ **verified**                 | libvips present, build clean                                                    |
| 6   | Environment contract                                 | ✅                              | `.env.example`                                                                  |
| 7   | `SECURITY.md`, `LICENSE`, `CONTRIBUTING.md`          | ✅                              | CODEOWNERS/PR-template omitted (lean agentic workflow)                          |
| 8   | CI running every release gate                        | ✅ defined / 🟡 first Linux run | `.github/workflows/ci.yml`                                                      |
| 9   | Contribution / handoff guide                         | ✅                              | `CONTRIBUTING.md`                                                               |
| 10  | Offline bundle regenerates + standalone smoke passes | ✅ **verified**                 | smoke fixed (T-C); re-committing the regenerated `index.html` is coupled to T-D |
| 11  | Restore/rebaseline perf budgets                      | 🟡                              | 8/8 marginal → T-D decision                                                     |
| 12  | Browser behavior + visual baseline                   | ✅ behavior / 🟡 visual         | behavior green in real Chromium; visual Golden Master needs human review (T-E)  |
| 13  | Reproducible green frontend                          | ✅ **verified**                 | see §1                                                                          |

## 3. Remaining tasks

Debugged this session: **T-A, T-B, T-C, and the behavior half of T-E are done.** What's left:

| Task                               | Owner                   | Status / acceptance criterion                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~T-A: reproducible install~~      | Platform                | ✅ **Done** (macOS arm64; confirm on CI Linux at first run)                                                                                                                                                                                                                                                                                                                                                    |
| ~~T-B: green baseline~~            | Platform                | ✅ **Done**                                                                                                                                                                                                                                                                                                                                                                                                    |
| ~~T-C: offline standalone smoke~~  | Frontend                | ✅ **Done** — harness race + jsdom-27 parser noise fixed in `scripts/smoke-standalone-interactive.mjs`; app renders correctly                                                                                                                                                                                                                                                                                  |
| **T-D: Performance budgets (8/8)** | Frontend + Architecture | **Decision needed.** All overages are marginal drift (+57…+239 B on static/source; +~6 KB standalone from regenerating the stale bundle) — not a regression. Recommendation: rebaseline the byte ceilings to today's actuals **and** add user-centric p75 web-vital targets, **plus** a Phase-1 payload-reduction task (role code-split + CSS split). Record as a DEC. Alternatively keep red as visible debt. |
| **T-E: Visual Golden Master**      | Frontend + Design       | Behavior ✅ done. Remaining: review 18 visual scenarios × 7 viewports and commit the Golden Master to `playwright/golden/` (needs human sign-off; `npm run test:visual:update`).                                                                                                                                                                                                                               |
| **T-F: Owner sign-offs**           | per DEC                 | DEC-2026-001/002/005/007/008 → flip to `accepted` in [25_DECISIONS.md](25_DECISIONS.md)                                                                                                                                                                                                                                                                                                                        |
| **T-G: Replace placeholders**      | Owner                   | Real security contact in `SECURITY.md`; legal-confirmed `LICENSE`/brand                                                                                                                                                                                                                                                                                                                                        |

> When T-D is decided and the bundle re-committed, and the Golden Master lands (T-E), remove the corresponding `continue-on-error` steps in the CI `quality-gates` job so they become required.

## 4. Exit-gate status ([80 §3](80_DELIVERY_ROADMAP.md))

| Exit gate                                                            | Status                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A clean clone passes every release command with no manual workaround | 🟡 all gates green locally **except** `check:budgets` (T-D decision); confirm on CI Linux |
| No checked-in/generated artifact is stale                            | 🟡 offline bundle regenerates & passes; re-commit pending T-D                             |
| Performance + browser + visual gates green or signed-with-expiry     | 🟡 behavior ✅; budgets (T-D) + visual Golden Master (T-E) remain                         |
| MVP scope, data classes, roles, launch boundary have named owners    | ✅ decided / ⬚ pending T-F sign-offs                                                      |

## 5. Verdict

The **decisions half is complete** and the **repository baseline is verified working on this machine**: install (R-10 fixed), typecheck/lint/format/tests, production build (506 pages), all static gates, the offline standalone smoke (T-C bug fixed), and the **real-browser behavior suite (40 tests, 0 failures)** are green.

**One decision and two human-review items remain:** the performance-budget rebaseline (**T-D**), the visual Golden Master (**T-E**), and owner sign-offs / placeholder replacements (**T-F/T-G**). None blocks starting Phase 1.
