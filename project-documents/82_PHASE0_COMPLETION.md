# Phase 0 — Baseline & Decisions: completion report

Tracks the Phase-0 deliverables and exit gates from [80 §3](80_DELIVERY_ROADMAP.md). Legend:
**✅ Done / verified** · **🟡 In progress — needs a fix or a decision** · **⬚ Owner action** (a business/legal sign-off).

Installed and verified locally on 2026-08-23 (macOS arm64, Node 24.16.0 / npm 11.13.0 — within the pinned `engines` floor; CI runs the pinned Node 22 from `.nvmrc`).

## 1. Verified locally (2026-08-23)

| Check                                                              | Result                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --include=optional`                                        | ✅ 644 packages installed / 750 dependency nodes audited, **0 vulnerabilities**, `@img/sharp-libvips-darwin-arm64` present — **R-10 fixed** |
| `npm run typecheck`                                                | ✅ pass                                                                                                                                     |
| `npm run lint`                                                     | ✅ pass (`--max-warnings=0`)                                                                                                                |
| `npm run format:check`                                             | ✅ pass                                                                                                                                     |
| `npm test`                                                         | ✅ **45 files, 307 tests** pass across web, API, worker, and shared packages                                                                |
| `npm run build`                                                    | ✅ **506 HTML outputs** (505 route indexes + `404.html`), offline bundle regenerated, **no manual retry**                                   |
| `verify:routes` / `verify:links` / `test:smoke` / `verify:offline` | ✅ all pass                                                                                                                                 |
| `test:standalone-interactive`                                      | ✅ **now passes** — was a harness bug (T-C), fixed in `scripts/smoke-standalone-interactive.mjs`; the offline bundle renders correctly      |
| `test:browser` (Playwright, real Chromium)                         | ✅ **66 passed across 7 viewports; 4 intentional non-mobile skips; 0 failures**                                                             |
| `check:budgets`                                                    | ✅ **8/8 pass** under the DEC-2026-009 rebaseline and user-centric targets                                                                  |

## 2. Deliverable status

| #   | Phase-0 deliverable                                  | Status                          | Notes                                                                          |
| --- | ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Resolve P0 decisions with named owners               | ✅ (defaults) / ⬚ (sign-off)    | [25_DECISIONS.md](25_DECISIONS.md) Part B                                      |
| 2   | Adopt and converge the canonical model               | ✅                              | ADR-0001; X-02/X-03/X-04 executable, including challenge-store v9 migration    |
| 3   | Open ADRs (ADR-0001…0014)                            | ✅                              | [25_DECISIONS.md](25_DECISIONS.md) Part A                                      |
| 4   | Pin Node/npm runtime                                 | ✅                              | `.nvmrc`, `.node-version`, `engines`, `packageManager`                         |
| 5   | Deterministic optional-dep (Sharp/libvips) install   | ✅ **verified**                 | libvips present, build clean                                                   |
| 6   | Environment contract                                 | ✅                              | `.env.example`                                                                 |
| 7   | `SECURITY.md`, `LICENSE`, `CONTRIBUTING.md`          | ✅                              | CODEOWNERS/PR-template omitted (lean agentic workflow)                         |
| 8   | CI running every release gate                        | ✅ defined / 🟡 first Linux run | `.github/workflows/ci.yml`                                                     |
| 9   | Contribution / handoff guide                         | ✅                              | `CONTRIBUTING.md`                                                              |
| 10  | Offline bundle regenerates + standalone smoke passes | ✅ **verified**                 | smoke fixed (T-C); regenerated `index.html` committed and verified             |
| 11  | Restore/rebaseline perf budgets                      | ✅                              | rebaselined per DEC-2026-009; payload reduction moves to the hardening gate    |
| 12  | Browser behavior + visual baseline                   | ✅ behavior / 🟡 visual         | behavior green in real Chromium; visual Golden Master needs human review (T-E) |
| 13  | Reproducible green frontend                          | ✅ **verified**                 | see §1                                                                         |
| 14  | Local Docker web/API/worker integration              | ✅ **verified**                 | Compose health + smoke; Docker-served browser behavior 66/66 pass              |

## 3. Remaining tasks

Debugged this session: **T-A, T-B, T-C, T-D, and the behavior half of T-E are done.** What's left:

| Task                               | Owner                   | Status / acceptance criterion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~T-A: reproducible install~~      | Platform                | ✅ **Done** (macOS arm64; confirm on CI Linux at first run)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ~~T-B: green baseline~~            | Platform                | ✅ **Done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ~~T-C: offline standalone smoke~~  | Frontend                | ✅ **Done** — harness race + jsdom-27 parser noise fixed in `scripts/smoke-standalone-interactive.mjs`; app renders correctly                                                                                                                                                                                                                                                                                                                                                                                   |
| ~~T-D: Performance budgets (8/8)~~ | Frontend + Architecture | ✅ **Done** — DEC-2026-009 rebaselines byte ceilings with ~2% headroom, adds p75 web-vital targets, and moves payload reduction to the hardening gate                                                                                                                                                                                                                                                                                                                                                           |
| **T-E: Visual Golden Master**      | Frontend + Design       | Behavior ✅ done. Remaining: review 18 visual scenarios × 7 viewports and commit the Golden Master to `playwright/golden/` (needs human sign-off; `npm run test:visual:update`). Moved out of `ci.yml` into the manually-triggered `.github/workflows/visual.yml` — it cannot pass without a baseline, so running it on every push was pure CI cost (~8 min) for zero signal. Run it on demand via the Actions tab when doing the review; fold it back into `ci.yml` as a required job once the baseline lands. |
| **T-F: Owner sign-offs**           | per DEC                 | Complete [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md), including DEC-2026-005/010/011 and the concrete IdP/region/provider evidence; other phase-specific DEC approvals remain tracked in 25                                                                                                                                                                                                                                                                                                       |
| **T-G: Replace placeholders**      | Owner                   | Real security contact in `SECURITY.md`; legal-confirmed `LICENSE`/brand                                                                                                                                                                                                                                                                                                                                                                                                                                         |

> `ci.yml` no longer has any `continue-on-error` job — every job that runs automatically is required. Visual regression only runs when manually dispatched.

## 4. Exit-gate status ([80 §3](80_DELIVERY_ROADMAP.md))

| Exit gate                                                            | Status                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A clean clone passes every release command with no manual workaround | ✅ all required gates green locally; confirm the first run on CI Linux |
| No checked-in/generated artifact is stale                            | ✅ offline bundle regenerated, committed, and verified                 |
| Performance + browser + visual gates green or signed-with-expiry     | 🟡 performance + behavior ✅; visual Golden Master (T-E) remains       |
| MVP scope, data classes, roles, launch boundary have named owners    | ✅ decided / ⬚ pending T-F sign-offs                                   |

## 5. Verdict

The **decisions half is complete** and the **repository baseline is verified working on this machine**: install (R-10 fixed), typecheck/lint/format/tests, production build (506 pages), all static gates, the offline standalone smoke (T-C bug fixed), and the **real-browser behavior suite (66 passed, 4 intentional non-mobile skips, 0 failures)** are green. The localhost-only Docker web/API/worker stack is also healthy: container smoke passes, the API returns typed `NOT_FOUND`, and the same browser suite passes against the Nginx-served export. The first full clean multi-stage container build still needs a network-capable Linux CI run because this Mac's always-on WireGuard path intermittently times out registry TLS.

**The remaining work is human review and external confirmation:** the visual Golden Master (**T-E**), owner sign-offs / placeholder replacements (**T-F/T-G**), and the first Linux CI run. None blocks starting Phase 1.

## 6. Phase-1 execution addendum (2026-08-28)

A1a–A1c remain in verification pending the first clean registry-backed container rebuild and human security review. A2 is implemented and in verification: migration `0004` stores only OIDC authorization-attempt digests and validated identity fields; the PostgreSQL runtime uses pinned `openid-client` against a digest-pinned synthetic Dex provider; exact redirect/state/nonce/S256-PKCE, signature/issuer/audience, verified contact, one-time transaction consumption, opaque digest-only credentials, revocation, and expiry have automated evidence. Live local browser acceptance returned start `200` → exchange `200` → `/me` `200` → revoke `200` → reuse `403`.

The reproducible application-image rebuild was not proven on this network: Docker Desktop timed out resolving the pinned Node base from Docker Hub while WireGuard was active. The live acceptance used an explicitly tagged temporary local overlay image built from the prior API runtime plus current compiled artifacts; it proves runtime behavior, not clean-image reproducibility. Rerun `npm run docker:build && npm run docker:up && npm run docker:smoke` when Docker Desktop has registry access. A3 (web network composition and callback UI) is next and remains unimplemented.
