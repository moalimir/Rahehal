# Development and continuation guide

## 1. Prerequisites

- Use the lockfile; do not develop against floating dependency versions.
- Node 22 LTS is pinned in `.nvmrc` and `.node-version`; CI reads the same pin.
- npm is the current package manager because `package-lock.json` is authoritative.
- Install Chromium only when running browser/visual tests.
- Docker Desktop (macOS) or Docker Engine with Compose v2 is required for the portable Linux integration stack.

### Clean setup

```bash
npm ci --include=optional
npm run dev
```

Open `http://localhost:3000`.

`.npmrc` already enables optional platform packages, so a clean install includes the pinned Sharp/libvips binary on supported macOS and Linux runners.

### Local Docker integration

Use native `npm run dev` for the fastest hot-reload loop. Use Docker whenever a change affects runtime packaging, environment behavior, service startup, or Linux portability:

```bash
npm run docker:config
npm run docker:build
npm run docker:up
npm run docker:smoke
```

The default local endpoints are web `http://localhost:3000` and API OpenAPI
`http://localhost:3001/api/v1/openapi.json`. Override host ports without editing Compose:

```bash
RAHHAL_WEB_PORT=3100 RAHHAL_API_PORT=3101 npm run docker:up
RAHHAL_WEB_PORT=3100 RAHHAL_API_PORT=3101 npm run docker:smoke
```

Inspect or stop the stack:

```bash
npm run docker:logs
npm run docker:down
```

`docker:build` refreshes changed targets. `docker:up` waits for PostgreSQL, runs the guarded one-shot migration/seed container, then starts the PostgreSQL-composed API and waits for HTTP health. `docker:smoke` creates a challenge with the synthetic session, restarts the API container, and reads the same record back. The images run as unprivileged users on read-only root filesystems with all Linux capabilities dropped; writable temporary space is bounded `tmpfs`. Published ports bind to `127.0.0.1`, not the LAN. Do not weaken those defaults to simulate a server.

The stack is intentionally incomplete: A1a supplies pinned PostgreSQL and the base schema; A1b supplies PostgreSQL session/workspace authorization and a transaction-scoped unit of work; A1c adds the authoritative challenge adapter and explicit PostgreSQL API composition. The OIDC exchange and credential issuer deliberately return `503` until A2, while the synthetic digest-only session enables local acceptance. The worker and browser remain demo authority, and no application event crosses from the API process to the worker yet. Add OIDC, the web network gateway, object storage, scanning, or telemetry only in the roadmap increment that supplies its negative tests, health behavior, and recovery procedure.

### Local PostgreSQL workflow

Start only the database, apply the full migration set, and load synthetic data:

```bash
npm run db:up
npm run db:migrate:up
npm run db:seed
```

The default host endpoint is `127.0.0.1:5433`; `.env.example` documents overrides. The checked-in
password and every seeded identity are local-only synthetic values. Migration commands accept
`DATABASE_URL`, never print it, serialize with a PostgreSQL advisory lock, verify SHA-256 checksums,
and run each change in a transaction.

Prove a clean down/up cycle and constraints in an isolated ephemeral database:

```bash
npm run test:postgres
```

The test refuses a non-loopback admin URL. It creates and drops only generated
`rahhal_a1a_test_*`, `rahhal_a1b_test_*`, and `rahhal_a1c_test_*` databases. The suite covers migration/seed constraints
plus session digest storage, rotation/revocation/replay, principal and membership revalidation,
transaction locks, immutable challenge versions, receipt/audit/outbox/idempotency atomicity,
concurrent create replay, scope denial, rollback, and API-runtime restart persistence. Stop PostgreSQL without deleting its named volume with
`npm run db:down`. `npm run db:migrate:down` reverts one migration; run it only against the database
whose rollback you intend to test.

### From Mac to the eventual server

- Docker Desktop executes Linux containers, so macOS is a valid development host; host paths and macOS-only behavior must not enter runtime code.
- The current Mac proves the native `linux/arm64` images. The deployment pipeline must also build/test the chosen server platform (usually `linux/amd64`) and publish immutable digests.
- Compose remains the default for a single-host pilot. Choose Kubernetes only from measured multi-host/high-availability requirements.
- External dev/preview/staging/production resources remain separate and owner-approved. A local Compose profile is never renamed and treated as staging.
- Build once, attach source revision/SBOM/scan evidence, and promote the exact image digest. The server does not run `npm install` or rebuild source.

## 2. Common commands

### Source checks

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
npm run verify:boundaries
```

Focused suites:

```bash
npm run test:flows
npm run test:challenge
npm run test:organization
npm run test:contracts
npm run test:api
npm run test:worker
npm run test:postgres
```

### Build and static checks

The project build creates both `out/` and the single-file `index.html`:

```bash
npm run build
npm run verify:routes
npm run verify:links
npm run test:smoke
npm run verify:offline
npm run test:standalone-interactive
npm run analyze:build
npm run check:budgets
```

Serve the generated export:

```bash
npm start
```

`npm start` does not build; it serves the existing `out/` directory.

### Browser and visual checks

```bash
npx playwright install chromium
npm run test:browser
```

The repository currently has no approved screenshots. Establish the first baseline only after human review of every scenario and viewport:

```bash
npm run test:visual:update
npm run test:visual
```

Never update snapshots solely to make CI green. Explain the expected visual change in the pull request and review RTL, overflow, focus, contrast, fonts, content, and responsive composition.

### Architecture and payload checks

```bash
npm run analyze:source
npm run analyze:source:check
npm run analyze:build
npm run analyze:bundle
npm run qa:size
```

Generated reports under `reports/generated/` are disposable evidence and are ignored.

### Container checks

```bash
npm run docker:config
npm run docker:build
npm run docker:up
npm run docker:smoke
npm run docker:down
```

Container/runtime changes require all five. Configuration validation alone is appropriate only for documentation or unrelated source changes.

## 3. Source-of-truth hierarchy

Until product governance is formalized:

1. Approved PRD/ADRs define intended behavior.
2. Domain types, transition/permission contracts, and API schemas define executable rules.
3. Route registries define generated navigation and static paths.
4. Tests prove supported scenarios.
5. Components render and invoke those contracts.
6. Fixtures and descriptive content are examples, never business authority.

Do not infer a business state from badge text, CSS class, route name, or a sample ID.

## 4. Working conventions

### Routes

- Add product routes to the appropriate registry, not as ad hoc conditionals scattered across components.
- Preserve uniqueness across root, public, internal, challenge-flow, and legacy inputs.
- A legacy redirect is allowed only for the same job-to-be-done. Otherwise use an explanatory unavailable state.
- Unknown IDs return not-found; never fall back to a known fixture.
- Preserve query context needed for solver workspace, filters, versions, and return paths.

### Domain and data

- Give every real entity a stable ID, tenant/workspace owner, state, version, created/updated time, and audit/correlation relationship where applicable.
- Put transition prerequisites and authorized actors in domain/application code, then enforce them again on the server.
- Submitted/published/finalized versions are immutable. Corrections create a new version or an authorized invalidation event.
- Keep eligibility separate from proposal quality and human selection.
- Keep technical acceptance separate from finance approval and provider payment state.
- Use fixtures through builders/factories; do not let screen-local copies become independent identities.

### Permissions and privacy

- Frontend permission checks improve UX only. Production commands and queries must be authorized on the server.
- Scope by tenant/workspace before fetching protected data.
- Do not render confidential data and then hide it with CSS.
- Permission-denied responses must not enumerate protected record existence.
- Require explicit assignment/COI state for reviewer material.
- Treat organization logos, identity evidence, proposals, contracts, messages, payment data, audit evidence, and support access according to approved classification and retention.

### Mutations

Each sensitive mutation should define:

- Typed command and validated input.
- Authorized actor/policy and required entity state.
- Expected version and idempotency key.
- Transactional state changes and immutable version behavior.
- Outbox events/notifications.
- Audit event and structured reason.
- Receipt/correlation ID and next state/action.
- Offline, timeout, duplicate, stale-version, partial-provider, and retry behavior.

Do not dispatch behavior from localized button labels. The current generic mock service does this for demonstration; production adapters must use typed command names.

### Persian/RTL interface

- Keep `<html lang="fa" dir="rtl">` and local font loading stable.
- Normalize Persian/Arabic character and digit variants at search/validation boundaries.
- Use `<bdi>` or explicit direction for IDs, URLs, email, codes, and mixed text.
- Display currency units, time zone, calendar, and deadlines explicitly.
- Test narrow widths; do not hide document overflow globally.
- Use one H1, landmarks, labels/hints/errors, visible focus, 44px targets, semantic status, and accessible dialog/drawer behavior.

## 5. Adding a frontend feature

1. Add or update a requirement ID and acceptance scenarios.
2. Identify the canonical entity, owner workspace/tenant, current state, and permissions.
3. Update domain types/state transitions before component-specific state.
4. Add the route contract and test uniqueness/deep linking where applicable.
5. Extend a repository/service interface; keep fixtures behind the adapter.
6. Implement loading, empty, offline, error, permission, conflict, locked, success, and closed states that apply.
7. Add unit tests for rules, integration tests for mutation/projection, component tests for behavior/accessibility, and browser tests for the user journey.
8. Review RTL, bidi, keyboard, responsive, and visual behavior.
9. Run the full release gates and update maintained docs/ADRs.

## 6. Introducing the backend safely

Use interfaces that allow the current UI to move from local repositories to HTTP without duplicating business behavior:

```ts
type ChallengeGateway = {
  queries: ChallengeQueries; // list/get private organization aggregates
  commands: ChallengeCommands; // create/save/delete/submit/publish
};

type OpportunityGateway = {
  queries: OpportunityQueries; // explicit public allowlisted projections only
};
```

Every operation resolves to a typed success/error envelope; unknown IDs return `NOT_FOUND`, never a fixture. The local browser composition is explicit in `lib/challenges/runtime.ts`, while public discovery receives only `OpportunityView` rather than trimming private `ChallengeRecord` aggregates in the component. The checked-in web composition selects those demo gateways unconditionally and is therefore demo-only; no production/network web composition exists yet. The future network implementation must be generated from or verified against the API schema, must fail closed in production, and must never fall back to mutable local demo data after an API error. Components consume a feature hook/application adapter, not choose between local and network storage themselves.

## 7. Testing strategy

| Layer                  | What to prove                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain unit            | State transitions, gates, formatting, eligibility, permission, validation                                                                              |
| Repository/application | Transactions, versions, idempotency, migrations, audit/outbox, projections                                                                             |
| API contract           | Schema, authn/authz, status/error model, cross-tenant denial, concurrency                                                                              |
| Component              | Forms, errors, focus, keyboard, accessible names, role states, receipts                                                                                |
| Integration            | Cross-role projection of the same entity and complete bounded flows                                                                                    |
| Browser E2E            | Real navigation/session/API, deep link, refresh, back/forward, mobile drawer, failures                                                                 |
| Visual                 | Approved content/layout at seven viewports, RTL, long text, empty/error/permission states                                                              |
| Security               | Horizontal/vertical access, object/file access, injection, abuse/rate, replay, CSRF/session                                                            |
| Resilience             | Retry, duplicate, stale write, provider outage, poison isolation, bounded dead-letter, crash-window idempotency, queue backlog, restore/reconciliation |

Avoid calling component tests “E2E” when they do not run a real browser and backend. Keep fast integration coverage, but label evidence precisely.

## 8. CI pipeline

### Pull request jobs

1. **Install/metadata:** clean lockfile install on the pinned runtime; dependency/license/security scan.
2. **Source:** typecheck, lint, format, Vitest, source cycles/architecture.
3. **Build:** production export, route/link crawl, HTTP smoke, offline generation/verification/interaction, payload budgets.
4. **Browser:** Playwright behavior on representative mobile/tablet/desktop projects; all projects on protected branches.
5. **Visual/accessibility:** immutable screenshots, axe/browser checks, artifact upload for review.
6. **Backend foundation:** shared-package builds, API/worker unit and contract tests, workspace-boundary enforcement, compiled service artifacts, and the ephemeral PostgreSQL migration/seed/constraint gate. Object/queue adapter integration gates become mandatory when those adapters land.
7. **Container foundation:** validate Compose, build the web/API/worker Linux images, scan them, and run the container smoke path. Multi-architecture publication becomes required when a registry/server target is selected.

### Release jobs

- Build once and promote the same signed artifacts.
- Apply backward-compatible migrations with explicit pre/post checks.
- Run staging synthetic journeys and authorization probes.
- Require approvals for production, migration, and provider configuration.
- Record release version, source revision, schema version, artifact digest, approvals, and rollback point.
- Run post-deploy health, synthetic, error, and queue checks; rollback or disable via feature flag when thresholds fail.

## 9. Definition of done

A change is done only when:

- Requirement and acceptance behavior are clear and linked.
- Domain/state/permission changes are approved by the right owner.
- Data classification and tenant/workspace ownership are explicit.
- Happy and meaningful negative paths are implemented.
- Server authorization exists for production behavior.
- Mutations are versioned/idempotent/audited where needed.
- No confidential data is exposed in unauthorized responses or DOM.
- Unit/integration/component/browser tests cover the risk.
- Accessibility, Persian/RTL, responsive, bidi, and long-content behavior are reviewed.
- Performance budgets remain green.
- Migration, rollback, metrics, logs, alerts, and operational ownership are defined.
- Documentation, API schema, ADR, and runbook changes are included.
- All required CI checks and reviewer approvals pass.

## 10. Pull request handoff template

```markdown
## Outcome

## Requirement / issue

## Domain and state changes

## Authorization and data classification

## API / migration / compatibility

## Tests and release gates

## Screenshots (RTL desktop/tablet/mobile and relevant states)

## Metrics, logging, alerts, and runbook

## Risks, rollout, and rollback
```
