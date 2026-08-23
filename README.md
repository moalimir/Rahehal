# Rahhal / راه‌حل

Rahhal is a Persian-first, RTL open-innovation product spanning challenge
discovery, proposal, review, contract, pilot, delivery, payment, and impact.

The repository currently contains the advanced static/offline web prototype and
the first executable API, worker, domain, contract, and testkit workspaces. The
new services use explicit in-memory development adapters: they prove transport,
authorization, concurrency, idempotency, audit/outbox, and contract boundaries,
but they are not production persistence or identity authority.

## Technology

- Next.js 16.3.1 with App Router and static export
- React 19 and strict TypeScript
- npm workspaces with Fastify 5 API and Node worker applications
- Shared domain primitives, OpenAPI 3.1 contracts, and deterministic test builders
- Tailwind CSS 3 plus project CSS and local Estedad fonts
- Vitest, Testing Library, JSDOM, ESLint, and Prettier
- Playwright browser journeys; the reviewed visual Golden Master is still pending
- Local assets with no runtime CDN requirement

Use the repository pins: Node.js 22 (`.nvmrc`) and npm 11.13.0. The looser
`engines` values are compatibility floors, not the reproducible development target.

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

Run the explicit development-only API and worker compositions in separate shells:

```bash
RAHHAL_API_MODE=demo npm run dev:api
RAHHAL_WORKER_MODE=demo npm run dev:worker
```

Neither service falls back to its demo adapter in production mode.

Build and serve the static export:

```bash
npm run build
npm start
```

`npm run build` builds the web/offline artifacts and every workspace. `npm start`
runs the pinned local `serve` package, which starts a small HTTP server for the already-generated
web export; it does not start the API.

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
npm run verify:boundaries
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
npm run test:flows
npm run test:challenge
npm run test:organization
npm run test:contracts
npm run test:api
npm run test:worker
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
apps/api/                    Fastify transport and injected application ports
apps/worker/                 Validated, retrying/dead-letter outbox worker skeleton
components/                  Public, shared, and role-specific UI
data/                        Route contracts, fixtures, and registries
domain/                      Entities, permissions, gates, and state machines
lib/                         Local repositories, services, validation, and storage
packages/contracts/          Typed envelopes, JSON schemas, and OpenAPI 3.1
packages/domain/             Browser-free canonical domain primitives
packages/testkit/            Deterministic cross-workspace test builders
public/                      Fonts and local image assets
scripts/                     Build, export, smoke, and verification tooling
tests/                       Unit, component, integration, and flow tests
out/                         Generated static export
index.html                   Generated single-file offline application
```

## Documentation

- This file contains setup, commands, runtime boundaries, and the repository map.
- [`project-documents/README.md`](project-documents/README.md) is the authoritative
  documentation portal; accepted decisions and the canonical model take precedence.
- [`docs/PROJECT.md`](docs/PROJECT.md) is retained as historical frontend background,
  not as a competing source of product or backend truth.
- `public/fonts/README.md` documents the bundled font files.

## Production warning

Local storage, frontend guards, in-memory API repositories, demo tokens, mock
receipts, and mock state transitions are not production security boundaries. A
production release still requires managed OIDC, PostgreSQL transactions and RLS,
durable audit/outbox storage, private scanned object storage, provider integrations,
and the Phase-1 security/operational gates.
