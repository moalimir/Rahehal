# Rahhal / راه‌حل

Rahhal is a Persian-first, RTL open-innovation product spanning challenge
discovery, proposal, review, contract, pilot, delivery, payment, and impact.

The repository currently contains the advanced static/offline web prototype,
the first executable API/worker/domain/contract/testkit workspaces, the A1a
PostgreSQL schema foundation, A1b's PostgreSQL session/workspace boundary, and
A1c's authoritative challenge-draft adapter, and A2's provider-neutral OIDC
authorization-code + PKCE boundary. Local Compose runs PostgreSQL, the API, and a
synthetic Dex identity provider; the static web and worker remain demo-only boundaries.

## Technology

- Next.js 16.3.1 with App Router and static export
- React 19 and strict TypeScript
- npm workspaces with Fastify 5 API and Node worker applications
- PostgreSQL 16 with checksummed reversible SQL migrations and synthetic seeds
- `openid-client` 6.8.7 with a digest-pinned Dex 2.45.1 local test provider
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

For the database-backed API, first migrate and seed local PostgreSQL, export the A2 identity settings
documented in `.env.example`, then run:

```bash
RAHHAL_API_MODE=postgres npm run dev:api
```

API mode is mandatory and has no implicit fallback. PostgreSQL mode requires the A2 issuer, exact
redirect allowlist, independent OIDC-flow secret, and session-credential secret. It validates OIDC
issuer, audience, signature, nonce, state, PKCE, and verified contact before issuing an opaque,
digest-only application session. The local Dex composition refuses production; selecting and
operating the managed production IdP remains a pre-pilot gate.

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

### Local Docker stack (macOS or Linux)

Docker Desktop packages the current boundaries into Linux containers: an Nginx-served static web
export, the compiled Fastify API, and the compiled worker. Start Docker Desktop, then run:

```bash
npm run docker:env:init
npm run docker:config
npm run docker:build
npm run docker:up
npm run docker:smoke
```

Open `http://localhost:3000`; the OpenAPI document is at
`http://localhost:3001/api/v1/openapi.json`; PostgreSQL is host-local on port `5433`.
Dex is loopback-only at `http://dex.localhost:5556/dex`. Its sole synthetic login is
`owner-alpha@synthetic.invalid` / `rahhal-local-owner`; never reuse either outside this stack.
Follow logs or stop the stack with:

```bash
npm run docker:logs
npm run docker:down
```

`docker:env:init` creates an ignored mode-0600 `.env` with independent random OIDC-flow and
session-credential secrets and refuses to overwrite an existing file. `RAHHAL_WEB_PORT`,
`RAHHAL_API_PORT`, and `RAHHAL_POSTGRES_PORT` override localhost ports.
`RAHHAL_POSTGRES_PASSWORD` changes the synthetic local-only database credential. `docker:build`
refreshes application images; `docker:up` starts them, runs a guarded one-shot migration/seed job,
and pulls pinned PostgreSQL when absent. The
application images run without root, use read-only filesystems, drop Linux capabilities, and expose
health checks where an HTTP boundary exists.

For database-only work:

```bash
npm run db:up
npm run db:migrate:up
npm run db:seed
npm run test:postgres
npm run db:migrate:down
npm run db:reset
npm run db:down
```

The migration, seed, reset, and PostgreSQL-test commands load the repository's ignored `.env` when
present, so they use the same `DATABASE_URL`/Compose port. `test:postgres` creates and drops its own
ephemeral database and refuses non-loopback hosts. `db:migrate:down` reverts only the latest
migration. `db:reset` is the explicit full local reset (all migrations down, then up, then seed) and
refuses non-loopback databases. Synthetic seeds are deterministic and safe to rerun; they must never
be used as real identities, credentials, or production data.

> **Restricted-network note:** the first build must reach `docker.io`/`registry-1.docker.io` for the
> pinned base images and the npm registry for dependencies. An active WireGuard tunnel does not prove
> that Docker Desktop's Linux VM can use the same route as macOS. If host requests work while image
> pulls time out, configure Docker Desktop's proxy or a trusted registry mirror for that network.
> Keep TLS verification enabled and do not add an insecure registry. This does not block native
> development (`npm run dev`) or the non-container release gates.

This is a portable **local integration baseline**, not production deployment. PostgreSQL has the A1a
tables, A1b identity transaction boundary, and A2 one-time authorization-attempt ledger. A1c adds scoped challenge create/read/save, immutable
versions, durable receipts, and atomic audit/outbox/idempotency evidence. The API container selects
PostgreSQL explicitly and the Docker smoke recreates an API process before reading its newly created
challenge. A2 adds real local OIDC login and revocable app sessions; the worker and web remain
demo-only, while managed production identity, MFA/step-up, durable outbox claiming, RLS, and private
object storage remain later roadmap increments. The same Dockerfile will later be built for the selected server
architecture and promoted through real environments.

## Quality checks

Run lightweight source checks:

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
npm run verify:boundaries
npm run verify:vocabulary
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
npm run build:web:network
npm run check:budgets:network
npm run analyze:bundle
```

`analyze:bundle` performs a production build with the bundle analyzer enabled.
`check:budgets` measures the demo export; the network check requires the connected
build immediately before it. Both enforce initial JavaScript per representative
route plus shared/largest-asset limits. Total emitted JavaScript is reported as a
trend, because code-split routes should not fail merely for existing as separate
chunks.
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
apps/api/migrations/         Checksummed PostgreSQL up/down migrations
apps/api/seeds/              Deterministic synthetic local data
apps/worker/                 Validated, retrying/dead-letter outbox worker skeleton
components/                  Public, shared, and role-specific UI
data/                        Route contracts, fixtures, and registries
domain/                      Entities, permissions, gates, and state machines
lib/                         Local repositories, services, validation, and storage
packages/contracts/          Typed envelopes, JSON schemas, and OpenAPI 3.1
packages/domain/             Browser-free canonical domain primitives
packages/testkit/            Deterministic cross-workspace test builders
docker/                      Container runtime configuration
public/                      Fonts and local image assets
scripts/                     Build, export, smoke, and verification tooling
tests/                       Unit, component, integration, and flow tests
compose.yaml                 Local PostgreSQL/web/API/worker integration stack
Dockerfile                   Multi-stage Linux image build for all runtimes
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
and the pre-pilot hardening gates.
