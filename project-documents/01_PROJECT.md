# Rahhal historical frontend reference

> Archived snapshot. This file preserves frontend background from before the
> workspace/backend foundation landed. Use `README.md` for current repository
> commands and `project-documents/README.md` for authoritative product and backend
> contracts. Route registries, domain types, tests, and generator scripts remain
> executable truth whenever this historical account differs from code.

## 1. Product scope

Rahhal models the complete open-innovation lifecycle:

1. public discovery and organization profiles;
2. account registration and role-specific onboarding;
3. organization challenge intake, editing, preview, and publication;
4. solver discovery, individual/team workspaces, invitations, and proposals;
5. reviewer conflict declaration, scoring, comparison, and submission;
6. decision, contract, intellectual property, and data-room workflows;
7. pilot milestones, deliverables, acceptance, finance, and payment;
8. operations, disputes, audit receipts, reporting, and impact.

The implemented product is a production-oriented frontend prototype with typed
mock services and versioned browser storage. It is not a complete production
system because it has no authoritative backend.

### Roles

| Role         | Main namespace                                            | Critical contract                                                 |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Public/guest | `/`, `/challenges`, `/organizations`, `/guides`, `/legal` | Never expose confidential data                                    |
| Onboarding   | `/auth/*`, `/onboarding/*`                                | Validation, safe `returnTo`, resume, and receipts                 |
| Organization | `/app/org/*`                                              | Publication, decision, acceptance, and access gates               |
| Solver       | `/app/solver/*`                                           | Workspace isolation, eligibility, proposal versions, and evidence |
| Reviewer     | `/app/reviewer/*`                                         | Conflict declaration before protected review material             |
| Operations   | `/app/ops/*`                                              | SLA, reason codes, disputes, payments, and audit trail            |

## 2. Runtime and delivery model

The application uses Next.js App Router with static export. Server components are
used only while generating routes; product interactions run in the browser.
Runtime API routes, Server Actions, remote images, and build-time network requests
are intentionally absent.

The build produces two delivery forms:

- `out/`: a normal multi-page static export served over HTTP;
- `index.html`: an offline single-file application containing compiled React,
  required chunks, CSS, fonts, and assets, with hash-based navigation.

The offline exporter is `scripts/build-offline-bundle.mjs`. The build currently
forces Webpack because that exporter consumes Webpack chunk metadata. Changing to
Turbopack requires first updating and validating the exporter.

### Backend integration boundary

The frontend currently simulates identity, OTP, signatures, payments,
notifications, document metadata, audit receipts, and workflow mutations. A real
backend should replace the mock service/repository boundary while preserving the
UI-facing success, offline, conflict, validation, permission, and error states.

Production services must own:

- authentication, sessions, OTP, account recovery, and workspace membership;
- authorization and deny-by-default action/record access;
- entity persistence, migrations, concurrency, and idempotency;
- document upload, malware scanning, signed access, and retention;
- reviewer conflict-of-interest enforcement;
- challenge publication and proposal version locking;
- contracts, signatures, payment approval, reconciliation, and refunds;
- immutable audit records, notifications, and correlation identifiers.

Frontend permissions improve UX but must never be treated as an authorization
boundary. Browser local storage is not a production database.

## 3. Architecture

### Main layers

1. Route registries describe public and internal paths, roles, canonical aliases,
   page identities, static parameters, and unavailable legacy destinations.
2. Catch-all Next.js routes resolve registry entries and generate static pages.
3. Public and internal components render role-specific experiences.
4. Domain modules define typed entities, permissions, gates, state transitions,
   formatting, and invariants.
5. Local repositories and services provide versioned demo persistence and async
   success/offline/conflict/error behavior.
6. Tests exercise domain rules, components, cross-role projections, navigation,
   static artifacts, and offline behavior.

### Key locations

| Location                        | Responsibility                                              |
| ------------------------------- | ----------------------------------------------------------- |
| `app/[...slug]/page.tsx`        | Static parameters and route resolution                      |
| `app/page.tsx`                  | Landing and offline route bootstrap                         |
| `components/portal-page.tsx`    | Public, auth, onboarding, and policy experiences            |
| `components/internal/`          | Shared shell and role-specific internal pages               |
| `components/challenge-flow/`    | Challenge list/intake/edit/preview/receipt/detail           |
| `data/public-product-routes.ts` | Public/auth/onboarding route contracts                      |
| `data/internal-routes.ts`       | Canonical internal route contracts and aliases              |
| `data/challenge-flow-routes.ts` | Organization challenge-flow resolver                        |
| `data/flow-coverage.ts`         | Product-flow coverage catalogue                             |
| `domain/product.ts`             | Permissions, gates, transitions, and formatters             |
| `domain/challenge.ts`           | Typed challenge record                                      |
| `domain/state-machines.ts`      | Workflow transition contracts                               |
| `lib/challenges/`               | Challenge repository, autosave, validation, readiness       |
| `lib/services/`                 | Mock async service boundary for a future API client         |
| `scripts/`                      | Export, manifest, route/link, smoke, and offline tooling    |
| `tests/`                        | Unit, component, integration, accessibility, and flow tests |

### Architecture rules

- Route definitions are data-driven; a route must not silently fall back to an
  unrelated sample entity.
- Canonical entities are projected into organization, solver, reviewer, and
  operations views rather than duplicated as independent identities.
- State is derived from enums and transitions, not badge text or regex.
- Sensitive actions require an explicit gate, confirmation, mutation, and
  versioned receipt.
- Legacy routes resolve to an equivalent canonical route or an explicit
  unavailable/not-found state.
- Public landing styles and internal application styles remain isolated.
- IDs, codes, email addresses, and mixed-direction text use bidi isolation.

## 4. Route model

The code registries are authoritative. Do not maintain a hand-written route row
for every generated entity; use `npm run qa:manifest` when a snapshot is needed.

### Public and onboarding families

```text
/
/challenges
/challenges/:slug-or-id
/organizations
/organizations/:slug
/for-organizations
/for-solvers
/how-it-works
/how-it-works/impact
/trust
/trust-security
/guides
/guides/confidentiality
/guides/intellectual-property
/guides/review-rules
/guides/payments-disputes
/legal/privacy
/legal/terms
/accessibility
/auth/login
/auth/register
/auth/otp
/auth/recovery
/auth/verify-contact
/onboarding/organization/*
/onboarding/solver/*
```

Organization onboarding covers contact, company, representative, verification,
workspace, team invitation, first challenge, and completion. Solver onboarding
covers contact, type, expertise, portfolio, identity, preferences,
recommendations, and completion.

### Organization challenge flow

```text
/app/org/challenges
/app/org/challenges/new
/app/org/challenges/:id
/app/org/challenges/:id/edit?step=1..4
/app/org/challenges/:id/preview
/app/org/challenges/:id/submitted
```

The four editing stages cover the problem, current state and success criteria,
collaboration/budget, and publication/legal information. Preview and editing use
the same validation contract. Submission changes the record to review state and
creates a receipt.

Related organization routes cover dashboard, experts, invitations, proposals,
comparison, review, decision, contract, pilot, deliverables, documents,
conversations, finance, impact, history, reports, team, access, profile, settings,
and notifications.

### Solver routes

Solver routes cover dashboard, opportunities and details, saved opportunities,
direct invitations and responses, proposals and their edit/preview/version flows,
teams and memberships, pilots, messages, payments, profile, verification, and
settings. Workspace context (`space`) must be preserved through navigation,
filtering, refresh, and the offline hash router.

### Reviewer routes

Reviewer routes cover assignment queue, assignment details, conflict declaration,
materials, scoring, comparison, and final submission. Record-specific steps belong
to the active assignment context rather than global navigation.

### Operations and shared routes

Operations routes cover dashboard, queue, verification, publication, review
monitoring, disputes, payments, violations, and settings. Shared destinations
include search, tasks, calendar, messages, notifications, documents, help, account,
security, and sessions; they must retain the active session role.

## 5. Domain and state contracts

### Core identities

| Entity              | Example              | Important relationship                          |
| ------------------- | -------------------- | ----------------------------------------------- |
| User                | `USR-*`              | Member of one or more workspaces                |
| Session             | `rahhal.session.v1`  | Active role and workspace                       |
| Workspace           | `WS-*`               | Individual, team, or organization context       |
| Organization        | `ORG-*`              | Publishes challenges                            |
| Team / Membership   | `TEAM-*` / `TM-*`    | Users, roles, ownership, permissions            |
| Challenge           | `CH-*`               | Organization-owned opportunity                  |
| Direct offer        | `OFF-*`              | Organization to solver/team invitation          |
| Proposal / Version  | `PR-*` / `PR-*/v*`   | Challenge plus owner workspace                  |
| Review assignment   | `RV-*`               | Proposal plus reviewer and COI state            |
| Decision / Contract | `DEC-*` / `CTR-*/v*` | Selected proposal and legal version             |
| Pilot / Deliverable | `PIL-*` / `DLV-*`    | Execution and technical acceptance              |
| Payment             | `PAY-*`              | Contract, deliverable, approval, reconciliation |
| Audit / Receipt     | `AUD-*` / `RC-*`     | Actor, command, entity, version, result         |

An ID represents exactly one identity across every role. Lists and details are
projections of shared registry/repository records.

### State machines

- Challenge: `draft → under_review → ready → published → evaluating → decided →
contracted → piloting → closed`.
- Proposal: `draft → submitted → locked → eligible → clarification/reviewing →
selected|rejected`, with revision and resubmission branches.
- Direct offer: `pending → accepted|declined|expired|cancelled`.
- Team membership: `requested|invited → active|rejected|expired`, then optionally
  `active → removed`.
- Review: `assigned → coi_pending → accepted|declined → in_progress → submitted →
locked`, with invalidation support.
- Contract: `draft → negotiation → approval → signature → effective`, with rejected
  and superseded branches.
- Pilot: `planned → active → completed|paused|cancelled`.
- Deliverable: `draft → submitted → accepted|revision_requested|rejected`.
- Payment: `triggered → approval → processing → paid → reconciled`, with hold,
  failure, refund, and retry handling.

Transitions include actor, preconditions, side effects, notifications, audit data,
and retry policy. Technical acceptance and financial approval remain separate.

### Persistence rules

Demo stores are versioned and should define migration, corruption recovery, TTL or
reset behavior, and cross-tab signaling. Passwords, OTP values, and sensitive
registration PII must not be persisted in registration drafts. File prototypes
store metadata only, not actual binary uploads.

## 6. Product and permission principles

- Eligibility and quality score are distinct concepts.
- AI matching is explainable assistance; final eligibility and decisions remain
  human-controlled.
- Deny by default when membership, record access, role, conflict declaration, or
  strong-auth prerequisites are missing.
- Unknown IDs produce a not-found state and never fall back to another record.
- Submitted versions are immutable and carry actor/version/audit information.
- Team owner and appointed manager are different roles. Ownership changes only
  through ownership transfer; an appointed manager may be demoted.
- Payment cannot process before an effective contract, technical acceptance, and
  financial approval.
- Permission-denied states must not reveal whether protected data exists.

## 7. Design system

The product is Persian-first and RTL. It uses local Estedad WOFF2 files in weights
400, 500, 600, 700, and 800, followed by Tahoma and sans-serif fallbacks. Font
synthesis is disabled.

### Token namespaces and who owns them

There is no single token scale yet; there are five, each owned by exactly one
stylesheet. That is the vocabulary — knowing which file declares a name is what
stops the same concept being defined twice with different values. Every token
below is declared in **one** place, and `app/layout.tsx` fixes the load order.

| Namespace                                                                                                   | Declared in                    | Scope               | Used by                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------- | --------------------------------------- |
| `--color-brand-*`, `--color-action-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, layout, `--z-*` | `design-system.css` `:root`    | global              | public, portal, route fallbacks         |
| `--color-navy-*`, `--color-primary-*`, `--color-text-*`, `--color-surface-subtle`                           | `globals.css` `:root`          | global              | landing and marketing pages             |
| `--app-*`                                                                                                   | `internal.css` `.app-shell`    | scoped to the shell | org, solver, reviewer, ops workspaces   |
| `--challenge-*`                                                                                             | `challenge-flow.css` `:root`   | global              | the challenge authoring/governance flow |
| `--rh-*`                                                                                                    | `solver-workspace.css` `:root` | global              | solver workspace                        |

`--color-surface`, `--color-border`, `--radius-card` and `--radius-panel` were
once declared in both `design-system.css` and `globals.css`. Because `globals`
loads second it won, so `design-system`'s stated border colour and card radius
were dead text — anyone reading that file got a value the page never used. They
are now declared once, in `design-system.css`, at the values that were already
rendering.

`tailwind.config.ts` aliases these custom properties rather than restating hex
values, so it cannot drift from them. Tailwind is here for its preflight reset;
the interface uses effectively no utility classes.

### Internal workspace tokens

| Purpose        | Token          | Value/meaning   |
| -------------- | -------------- | --------------- |
| Primary text   | `--app-ink`    | `#14243b`       |
| Secondary text | `--app-muted`  | `#65748a`       |
| Canvas         | `--app-canvas` | `#f4f7fa`       |
| Border         | `--app-line`   | `#dce4ed`       |
| Primary action | `--app-blue`   | Role-aware blue |
| Success        | `--app-green`  | `#07866f`       |
| Warning        | `--app-amber`  | `#ad6504`       |
| Danger         | `--app-red`    | `#c1384f`       |

`.app-shell--solver`, `--reviewer` and `--ops` re-point `--app-blue`/`--app-navy`
per role; `.app-dialog` re-points a few for contrast on its overlay. Those are
the only legitimate redefinitions — they change a role's accent, not the meaning
of a token.

Shared patterns include panels, metric cards, status badges, case headers and
navigation, gate checklists, confirmation dialogs, receipt panels, and notices for
loading, empty, offline, permission, conflict, error, and closed states.

### Accessibility and responsive rules

- Use one H1, semantic landmarks, labels, hints, field errors, skip links, and
  visible focus indicators.
- Dialogs and mobile drawers require focus trap, Escape handling, scroll lock, and
  focus return.
- Interactive targets should be at least 44 by 44 pixels.
- Status must never be communicated by color alone.
- Tables use their own scrolling container; the document must not hide layout
  failures with global horizontal clipping.
- Layouts compress around 1024px, convert sidebar to drawer around 768px, and use
  single-column cards/actions on narrow mobile screens.
- Respect `prefers-reduced-motion`.
- Validate real color contrast and collision in a browser; JSDOM cannot prove them.

Introducing a third-party component system such as shadcn is not a no-risk
refactor. It may help new dialogs, menus, tabs, or form controls, but a wholesale
migration would alter markup and styling and requires visual review.

## 8. Testing and release gates

### Source checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:flows
npm run format:check
```

### Generated-output checks

Run these after `npm run build`:

```bash
npm run verify:routes
npm run verify:links
npm run test:smoke
npm run verify:offline
npm run test:standalone-interactive
```

The release suite should cover public-to-solver proposal, organization challenge
publication, team ownership and proposals, cross-role direct offers, reviewer COI
and scoring, decision through payment, refresh/back/deep links, unauthorized
access, all standard UI states, keyboard interaction, RTL, overflow, and browser
visual regression.

### Historical QA summary

These are results reported by each historical release, not a claim that the current
checkout was rebuilt during this documentation consolidation.

| Release          | Automated tests |  Static output | Other reported gates                                    |
| ---------------- | --------------: | -------------: | ------------------------------------------------------- |
| 1.4              |              86 |              — | TypeScript, lint, build, links, offline, RTL shell pass |
| 1.5              |              88 | 410 HTML files | 248 routes and standalone pass                          |
| 1.6              |              93 |      411 pages | 23 E2E tests, links, offline, smoke pass                |
| 1.7              |              95 |      411 pages | 23 E2E tests and route/offline checks pass              |
| 1.8              |             100 |      417 pages | 23 E2E tests and 248 routes pass                        |
| 1.9              |             104 |      417 pages | 23 E2E tests and offline checks pass                    |
| 2.0              |             106 |      417 pages | Auth/team regressions and offline checks pass           |
| 2.1              |             110 |      417 pages | 248 routes and 416 HTML files pass                      |
| 2.2              |             112 |      417 pages | Route/link/standalone checks pass                       |
| 2.3              |             116 |      417 pages | Route/link/standalone checks pass                       |
| 2.4              |             120 |      420 pages | Offer response and organization-profile checks pass     |
| 2.5              |             124 |      422 pages | Four organization flows and 23 E2E tests pass           |
| 2.7              |             141 |      466 pages | 464 routes, 465 HTML files, standalone pass             |
| 2.8 release gate |             137 |      466 pages | 42 critical tests, axe, route/link/offline pass         |
| 2.9              |             181 |      506 pages | 504 routes, 505 HTML files, 23 E2E and offline pass     |

Some older documents used “version 16–25” labels for the same release sequence.
Artifact counts can change with route fixtures; scripts and current output are
authoritative, not this historical table.

On 2026-08-19, after migrating to Next.js 16.3.1, typecheck, lint, and all 181
Vitest tests passed and npm reported zero vulnerabilities. The full production
build was delegated to the repository owner and is not recorded as verified after
that migration.

### Frontend optimization baseline

The source and existing generated artifacts measured on 2026-08-19 establish the
following non-regression budgets:

| Metric                |             Baseline |
| --------------------- | -------------------: |
| Source modules        |                  132 |
| Internal import edges |                  423 |
| Import cycles         |                    0 |
| Source CSS            |        613,852 bytes |
| Standalone HTML       |      5,056,799 bytes |
| Standalone CSS        | 2,463,632 characters |
| Standalone JavaScript | 2,211,664 characters |
| Static JavaScript     |      1,773,747 bytes |
| Static CSS            |        503,436 bytes |

The exact limits live in `config/performance-budgets.json`. Source architecture,
build-asset, bundle, and budget commands are documented in `README.md`; generated
reports are written to `reports/generated/`.

### Known QA limits

- Playwright visual and behavior infrastructure now covers seven fixed viewports,
  but its immutable Golden Master must still be generated and reviewed in the
  repository owner's browser environment.
- DOM/CSS/JSDOM tests do not prove pixel parity, browser color contrast, CLS, LCP,
  or INP.
- Visual approval should use Playwright or an equivalent browser pipeline at
  representative desktop, tablet, and mobile widths.

## 9. Consolidated audit record

Historical audits found duplicated entity IDs, conflicting proposal relationships,
missing runtime permissions, bypassable reviewer COI, unsynchronized publication
and offers, non-mutating success receipts, unenforced payment gates, unsafe unknown
ID fallbacks, fragmented persistence, wrong redirects, lost hash-router queries,
fixed reviewer navigation, inconsistent shared-role shells, accessibility gaps,
overflow masking, incomplete identity assets, unsafe uploads, and an oversized
offline bundle.

Later release reports marked normalized P0/P1 findings fixed through canonical
registries and repositories, route guards, assignment-scoped COI, versioned stores,
real mock mutations and receipts, payment state gates, not-found handling,
query-aware routing, shared dialogs, asset cleanup, and regression tests.

Two risks remain outside the frontend-only scope:

1. browser-rendered visual regression, performance, and contrast need a real layout
   engine;
2. production security, durable audit, authorization, and payment correctness need
   a real backend.

Historical “fixed” status is test evidence, not a substitute for rerunning current
release gates after changes.

## 10. Consolidated changelog

### 1.3–1.5: shell, identity, and asset stabilization

- Unified role shells, route aliases, logo/organization registries, tokens, bidi
  handling, and overflow behavior.
- Corrected RTL sidebar layout and moved images to local assets or neutral Persian
  monograms.
- Removed duplicated solver identity/support blocks and stabilized settings.

### 1.6: complete individual/team workflow

- Connected registration, login, discovery, saving, proposal submission, team
  collaboration, verification, pilot, delivery, messaging, and payment.
- Added field-specific validation and prevented initial false success states.

### 1.7: authenticated navigation and role-aware team building

- Routed authenticated users to internal details and reworked received offers and
  proposal queues.
- Separated individual team creation from filling an existing team workspace.

### 1.8: multi-step solution and membership requests

- Added six proposal-composition pages, drafts, evidence, readiness, and receipts.
- Added membership requests with resumes, role selection, and reasoned rejection.

### 1.9–2.0: ownership, filters, IP, and authentication polish

- Distinguished immutable team ownership from appointed manager permissions.
- Added expertise, university, collaboration, sorting, and view filters.
- Reworked IP guidance, join requests, OTP, and recovery behavior.

### 2.1–2.3: discovery, settings, RTL, and proposal review

- Added accessible grid/list challenge views with URL persistence and a complete
  proposal preview/history experience.
- Stabilized first-render settings, list alignment, auth steppers, resume viewing,
  RTL process numbering, technical hints, and final-submit confirmation.

### 2.4: direct-offer responses and organization profiles

- Changed offer acceptance into a separate technical/financial/scheduling response
  workflow with validation, drafts, and receipts.
- Added complete responsive organization profiles and non-exclusivity guidance.

### 2.5: organization parity

- Added an actionable organization dashboard, expert discovery/invitations,
  proposal comparison/review, contracts, pilots, payments, reports, team/access,
  profile, settings, and notifications.

### 2.7: resume dialog and proposal version comparison

- Reused one accessible team-resume dialog and added PDF sample download.
- Added proposal timeline, base-version selection, structured differences, and
  read-only history; stabilized offline settings navigation.

### 2.8: canonical solver domain

- Introduced canonical users, workspaces, teams, memberships, invitations,
  proposals, offers, cases, verification, and a versioned repository.
- Added migrations, idempotency, receipts, cross-tab sync, workspace isolation,
  complete team/proposal lifecycles, data room, contract, pilot, delivery, payment,
  closure, and feedback.
- Removed fixed sample IDs, hard-coded match percentages, premature acceptance,
  confidential DOM leakage, and accessibility issues.

### 2.9: targeted solver corrections

- Corrected dashboard RTL alignment, semantic workspace context, metric links,
  44px controls, wizard arrow direction, and toast placement.
- Connected invitation resumes to canonical verification data.
- Built proposal history from real version content with workspace isolation.

### 2026-08-19 dependency maintenance

- Upgraded Next.js and `eslint-config-next` to 16.3.1, PostCSS to 8.5.26, and
  JSDOM to 27.4.0.
- Removed the deprecated `whatwg-encoding` dependency and migrated ESLint to the
  native Next.js 16 flat configuration.
- Temporarily kept new React Compiler behavioral diagnostics disabled so dependency
  remediation did not become an unrelated behavioral refactor.
- Replaced the incompatible Node preload build invocation with `next build
--webpack`; the owner will validate the production build.

## 11. Assumptions and deferred work

- Names, organizations, IDs, amounts, SLAs, KPIs, and cases are demo data.
- IP, tax, payment, dispute, and contract rules require qualified Iranian legal and
  financial review.
- Future-stage routes may exist in static output for QA while actions remain gated.
- Example uploads/PDFs remain demonstrations until secure storage is connected.
- Production integration should preserve the typed service contract rather than
  embedding API details in components.

## 12. Documentation and generated artifacts policy

The repository maintains two primary project documents: `README.md` and this file.
Font-specific information remains in `public/fonts/README.md`.

Do not add version-specific QA, delivery, audit, route-manifest, or changelog
Markdown files. Update the relevant section here and keep executable evidence in
tests or generated machine-readable reports.

Temporary evidence is written under the ignored `reports/generated/` directory and
can be produced with:

```bash
npm run qa:report
npm run qa:manifest
npm run qa:size
```

Generated reports are disposable output and do not replace route registries,
domain code, or automated tests as the source of truth.
