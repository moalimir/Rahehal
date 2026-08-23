# Development and continuation guide

## 1. Prerequisites

- Use the lockfile; do not develop against floating dependency versions.
- The repository recommends Node `20.9+`, but does not pin an exact runtime. Phase 0 should select and pin an LTS runtime for developers and CI.
- npm is the current package manager because `package-lock.json` is authoritative.
- Install Chromium only when running browser/visual tests.

### Clean setup

```bash
npm ci --include=optional
npm run dev
```

Open `http://localhost:3000`.

On the audited macOS ARM64 machine, plain `npm ci` omitted `@img/sharp-libvips-darwin-arm64` even though it exists in the lockfile. The production build then failed while importing WebP assets. This local recovery installed the lockfile's optional platform dependencies without changing the lockfile:

```bash
npm install --include=optional --package-lock=false
```

Treat that as a setup defect to fix, not a permanent undocumented ritual. Verify supported macOS and Linux environments in CI.

## 2. Common commands

### Source checks

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

Focused suites:

```bash
npm run test:e2e
npm run test:challenge
npm run test:organization
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
type CommandContext = {
  idempotencyKey: string;
  expectedVersion?: number;
  reason?: string;
};

interface ChallengeGateway {
  get(id: string): Promise<ChallengeView>;
  saveDraft(id: string, input: ChallengeDraftInput, context: CommandContext): Promise<Receipt>;
  submit(id: string, context: CommandContext): Promise<Receipt>;
  publish(id: string, context: CommandContext): Promise<Receipt>;
}
```

The actual contract should be generated from or verified against the API schema. Components should consume a feature hook/application adapter, not choose between local and network storage themselves. Production builds should have no automatic fallback from a failed API to mutable local demo data.

## 7. Testing strategy

| Layer                  | What to prove                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Domain unit            | State transitions, gates, formatting, eligibility, permission, validation                   |
| Repository/application | Transactions, versions, idempotency, migrations, audit/outbox, projections                  |
| API contract           | Schema, authn/authz, status/error model, cross-tenant denial, concurrency                   |
| Component              | Forms, errors, focus, keyboard, accessible names, role states, receipts                     |
| Integration            | Cross-role projection of the same entity and complete bounded flows                         |
| Browser E2E            | Real navigation/session/API, deep link, refresh, back/forward, mobile drawer, failures      |
| Visual                 | Approved content/layout at seven viewports, RTL, long text, empty/error/permission states   |
| Security               | Horizontal/vertical access, object/file access, injection, abuse/rate, replay, CSRF/session |
| Resilience             | Retry, duplicate, stale write, provider outage, queue backlog, restore/reconciliation       |

Avoid calling component tests “E2E” when they do not run a real browser and backend. Keep fast integration coverage, but label evidence precisely.

## 8. Proposed CI pipeline

### Pull request jobs

1. **Install/metadata:** clean lockfile install on the pinned runtime; dependency/license/security scan.
2. **Source:** typecheck, lint, format, Vitest, source cycles/architecture.
3. **Build:** production export, route/link crawl, HTTP smoke, offline generation/verification/interaction, payload budgets.
4. **Browser:** Playwright behavior on representative mobile/tablet/desktop projects; all projects on protected branches.
5. **Visual/accessibility:** immutable screenshots, axe/browser checks, artifact upload for review.
6. **Backend when added:** migrations, unit/integration/contract/security tests with ephemeral database/object/queue dependencies.

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
