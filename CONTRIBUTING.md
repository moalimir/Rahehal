# Contributing

Proprietary project (see [LICENSE](LICENSE)). Developed with **agentic coding** —
this is the short contract for humans and agents. Full handbook:
[project-documents/85_DEVELOPMENT_GUIDE.md](project-documents/85_DEVELOPMENT_GUIDE.md).

## Setup

- Node is pinned in [`.nvmrc`](.nvmrc) (Node 22 LTS): `nvm use`.
- Install with optional platform deps (fixes the Sharp/libvips omission, R-10):

  ```bash
  npm ci --include=optional
  ```

  `.npmrc` already sets `include=optional`; if a build fails importing Sharp/WebP, re-run that.

## Source of truth (respect this order)

1. Decisions — [25_DECISIONS.md](project-documents/25_DECISIONS.md)
2. **Canonical model** — [20_CANONICAL_MODEL.md](project-documents/20_CANONICAL_MODEL.md) (law: names, states, roles, taxonomy)
3. Domain types & contracts → 4. Route registries → 5. Tests → 6. Components → 7. Fixtures (examples only)

Never infer business state from labels, CSS classes, route names, or sample IDs.

## Before you push

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run verify:boundaries
```

Touching API/contracts? also run `npm run test:contracts`, `npm run test:api`, and
`npm run test:worker`. Touching UI? also `npm run build`, and for visuals
`npx playwright install chromium && npm run test:browser`.
Don't update visual snapshots just to make CI green. Conventional Commit messages; branch from `main`.

## Security

Never commit secrets. Report vulnerabilities per [SECURITY.md](SECURITY.md).
