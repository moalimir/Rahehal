# Rahhal Solver

Rahhal is a Persian, RTL, static-exportable frontend prototype for managing an
open-innovation workflow from challenge discovery through proposal, review,
contract, pilot, delivery, payment, and impact tracking.

This repository is a frontend application. Authentication, OTP, signatures,
payments, notifications, persistence, and audit services are simulated locally.
A production deployment still needs a backend, database, server-side permission
enforcement, object storage, and integrations.

## Technology

- Next.js 16.3.1 with App Router and static export
- React 19 and strict TypeScript
- Tailwind CSS 3 plus project CSS and local Estedad fonts
- Vitest, Testing Library, JSDOM, ESLint, and Prettier
- Playwright browser journeys and immutable visual snapshots
- Local assets with no runtime CDN requirement

Recommended runtime: Node.js 20.9 or newer.

## Install and run

Install exactly the versions recorded in `package-lock.json`:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

Build and serve the static export:

```bash
npm run build
npm start
```

`npm start` runs `npx serve out`, which starts a small local HTTP server for the
already-generated `out/` directory. It does not compile the application.

You can use Python instead:

```bash
python3 -m http.server 4173 --directory out
```

Then open `http://localhost:4173`.

The build also regenerates `index.html`, a single-file offline bundle. It can be
opened directly without an HTTP server and uses hash-based navigation.

## Quality checks

Run lightweight source checks:

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

After `npm run build`, validate the generated artifacts:

```bash
npm run verify:routes
npm run verify:links
npm run test:smoke
npm run verify:offline
npm run test:standalone-interactive
```

Useful focused suites:

```bash
npm run test:e2e
npm run test:challenge
npm run test:organization
```

Install the pinned Chromium build once, establish the visual Golden Master, and
run browser behavior and visual regression checks:

```bash
npx playwright install chromium
npm run test:visual:update
npm run test:browser
npm run test:visual
```

Do not update visual snapshots to hide an unexplained difference. The configured
matrix covers seven viewports from 360×800 through 1440×900 and representative
public, authentication, solver, organization, reviewer, and operations routes.

Architecture and performance analysis uses the existing build artifacts unless
the command explicitly invokes a build:

```bash
npm run analyze:source
npm run analyze:source:check
npm run analyze:build
npm run check:budgets
npm run analyze:bundle
```

`analyze:bundle` performs a production build with the bundle analyzer enabled.
Generated JSON reports are written under `reports/generated/` and remain ignored.

Dependency health:

```bash
npm audit
```

The dependency maintenance performed on 2026-08-19 removed the deprecated
`whatwg-encoding` chain, upgraded Next.js and its lint configuration, and reported
zero npm vulnerabilities. The production build after that migration is intentionally
left for the repository owner to run.

## Primary routes

- `/challenges/` — public challenge discovery
- `/organizations/` — organization directory
- `/auth/login/` — authentication prototype
- `/app/org/dashboard/` — organization workspace
- `/app/org/challenges/new/` — challenge intake
- `/app/solver/dashboard/` — individual or team solver workspace
- `/app/solver/proposals/new/` — proposal builder
- `/app/reviewer/assignments/` — reviewer workspace
- `/app/ops/queue/` — operations queue

Routes are data-driven. The authoritative registries are
`data/public-product-routes.ts`, `data/internal-routes.ts`, and
`data/challenge-flow-routes.ts`; generated route reports are not source files.

## Repository map

```text
app/                         Next.js routes, layouts, and styles
components/                  Public, shared, and role-specific UI
data/                        Route contracts, fixtures, and registries
domain/                      Entities, permissions, gates, and state machines
lib/                         Local repositories, services, validation, and storage
public/                      Fonts and local image assets
scripts/                     Build, export, smoke, and verification tooling
tests/                       Unit, component, integration, and flow tests
out/                         Generated static export
index.html                   Generated single-file offline application
```

## Documentation

- This file contains setup, commands, runtime boundaries, and the repository map.
- [`docs/PROJECT.md`](docs/PROJECT.md) contains architecture, routes, domain/state,
  design rules, testing strategy, known limitations, and consolidated history.
- `public/fonts/README.md` documents the bundled font files.

## Production warning

Local storage, frontend guards, mock receipts, and mock state transitions are not
security boundaries. Production authorization and workflow invariants must be
validated by the backend, including reviewer conflict rules, publication gates,
payment gates, audit records, and idempotency.
