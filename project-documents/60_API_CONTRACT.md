# API Contract — conventions, command envelope, and MVP endpoints

The API is the **only** authority. It reuses the command-result contract already defined in `domain/solver.ts` (20 §9) and the state machines in `domain/state-machines.ts`. Publish a versioned OpenAPI schema and generate the typed web client from it. Names/states from [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md).

---

## 1. Conventions

- **Base**: `/api/v1`. Version in the path; breaking changes bump the version.
- **Transport**: JSON over HTTPS; UTF-8; Persian text unescaped. All times ISO-8601 UTC; server echoes `server_time`.
- **Auth**: `Authorization: Bearer <access_token>` (OIDC). Active workspace via `X-Workspace-Id` header (validated against membership — never trusted blindly).
- **Resource style**: reads are REST resources (`GET /challenges/{id}`); **mutations are explicit commands** (`POST …:action`) because the domain is workflow/transition-driven, not CRUD.
- **IDs** are opaque prefixed strings (50 §1). Never expose tenant secrets in URLs or IDs.
- **Pagination**: cursor-based — `?limit=&cursor=`; responses return `{ items, next_cursor }`. No offset pagination on large sets.
- **Filtering**: explicit query params only; server ignores unknown params (no mass-assignment via query).

## 2. Every response envelope

```jsonc
// success
{
  "ok": true,
  "data": { /* resource or command result */ },
  "meta": {
    "server_time": "2026-08-20T12:00:00Z",
    "correlation_id": "cor_9f…",
    "entity_version": 7            // for optimistic concurrency on the returned aggregate
  }
}
```

## 3. Command envelope (writes)

Mirrors `MutationReceipt` (`solver.ts:497`). Every mutation:

```http
POST /api/v1/challenges/chl_123:publish
Authorization: Bearer …
X-Workspace-Id: wsp_org_9
Idempotency-Key: 5f2c…              // required on all writes
Content-Type: application/json

{ "expected_version": 6, "reason": "...", "step_up_token": "…" }   // reason/step_up when required
```

Success returns the canonical receipt:

```jsonc
{
  "ok": true,
  "data": {
    "entity_id": "chl_123",
    "receipt_id": "rcp_88…",
    "audit_event_id": "aud_41…",
    "timestamp": "2026-08-20T12:00:00Z",
    "idempotent": false,           // true when the key replayed a prior result
    "next_actions": ["evaluating"] // allowed next transitions (from the state machine)
  },
  "meta": { "entity_version": 7, "correlation_id": "cor_9f…" }
}
```

- **Idempotency**: `Idempotency-Key` is stored per `(tenant, command, key)` (50 §8) with the cached response; a retry within TTL returns the *same* receipt with `idempotent:true`. Prevents duplicate submissions, decisions, invitations, signatures, payments (NFR-REL-001).
- **Optimistic concurrency**: `expected_version` must equal the aggregate's current `version`, else `409 CONFLICT` (see §4). Retry never silently overwrites.
- **Step-up**: sensitive commands (`sensitiveActions`, `product.ts:42`: decide, accept-deliverable, approve-payment, manage-access, resolve-dispute) require a fresh `step_up_token`; absence → `403` with `code:"STEP_UP_REQUIRED"`.
- **Reason**: `manual-review` transitions and all ops interventions require a structured `reason`.

## 4. Error contract

Maps the six `MutationFailure` codes (`solver.ts:508`) to HTTP + a stable envelope. Errors are **non-enumerating** for protected records (a hidden record and a denied record both return `404` to non-members).

```jsonc
{ "ok": false, "error": { "code": "CONFLICT", "message": "…", "current_version": 7, "recovery": "refetch_and_retry" } }
```

| `code` | HTTP | When | Recovery hint |
| --- | --- | --- | --- |
| `VALIDATION` | 422 | Field/schema/readiness failure | Field-level errors in `error.fields` |
| `NO_ACCESS` | 403 (or 404 for protected) | AuthZ deny; step-up missing | Non-enumerating for protected records |
| `NOT_FOUND` | 404 | Unknown/removed/cross-tenant ID | Never falls back to a sample (invariant 20 §7.5) |
| `INVALID_STATE` | 409 | Transition not allowed from current state | Show current state + allowed transitions |
| `CONFLICT` | 409 | Stale `expected_version` / duplicate unique | Return `current_version`; refetch & merge |
| `STORAGE` | 503 | Transient persistence/provider failure | Safe to retry with same idempotency key |

Rate-limited requests return `429` with `Retry-After`. All errors carry `correlation_id`.

## 5. MVP slice endpoints

### 5.1 Identity & context

```
POST /auth/session:exchange        # OIDC code → app session (thin; IdP owns credentials/OTP)
POST /auth/session:refresh
POST /auth/session:revoke
GET  /me                           # user + memberships + available workspaces
POST /me/context:switch            # set active workspace (validated vs membership)
```

### 5.2 Challenge (organization)

```
POST /challenges                              # create draft            → chl_*
GET  /challenges/{id}                          # private aggregate (member-scoped)
PATCH/challenges/{id}                          # autosave draft (expected_version)
POST /challenges/{id}:request-triage           # draft → triage        (pre: brief-valid)
POST /challenges/{id}:advance-formulation      # triage → formulation
POST /challenges/{id}/approvals:record         # per-gate approval (business/technical/finance/legal/quality)
POST /challenges/{id}:publish                  # approvals → published  (pre: 3 approvals + quality; atomic version lock + projection + outbox)
POST /challenges/{id}:close                    # controlled close/pause/cancel
GET  /challenges/{id}/versions                 # immutable history
```

### 5.3 Public discovery (unauthenticated, projection-backed)

```
GET  /public/challenges?category=&q=&cursor=   # from challenge_public_projection only
GET  /public/challenges/{id}                    # published fields only; confidential never present
GET  /public/organizations/{id}                 # verified vs user-supplied vs demo clearly typed
```

### 5.4 Solver, eligibility & proposal

```
GET  /opportunities?…&cursor=                  # searchable published challenges for active workspace
POST /opportunities/{challengeId}:save
GET  /challenges/{id}/eligibility              # server evaluateEligibility → {status, reasons[], actions[]}
POST /proposals                                # create draft for (challenge, active workspace)
PATCH/proposals/{id}                           # autosave draft
POST /proposals/{id}:submit                    # draft → submitted (pre: form-valid, sender-authorized, terms-accepted; locks version, receipt)
POST /proposals/{id}:submit-clarification      # clarification_requested → clarification_submitted
POST /proposals/{id}:start-revision            # revision_requested → revision_draft
POST /proposals/{id}:resubmit                  # revision_draft → resubmitted (new locked version, explicit base)
POST /proposals/{id}:withdraw
GET  /proposals/{id}/versions                  # immutable history + diffs (changedFields)
```

### 5.5 Review, COI & decision

```
GET  /assignments?state=&cursor=               # reviewer's assignments (scoped)
POST /assignments/{id}/coi:declare             # {coi_status: clear|conflict, relationships} → coi_declaration
POST /assignments/{id}:accept                  # coi-gate → accepted (pre: coi_status == clear)
GET  /assignments/{id}/materials               # 403 unless coi clear + assignment active (server/object/export gate)
POST /assignments/{id}/review:save-draft       # accepted → draft
POST /assignments/{id}/review:submit           # draft → submitted (scores+rationale valid; freeze; receipt)
POST /assignments/{id}:invalidate              # ops only; locked → invalidated (reason, separation of duty)
POST /challenges/{id}/decision:record          # evaluating → decided (authorized actor, step-up, cites proposal+review+rubric versions; creates case on 'selected')
```

## 6. Read projections & anonymity

- Organization review views honor reviewer anonymity and policy timing (FR-REV-007): reviewer identity and other reviewers' scores are withheld until policy allows; enforced in the *projection query*, not the client.
- Public projections are separate resources (`/public/*`) served from `challenge_public_projection`; the private aggregate is never used to render public pages (prevents confidential-field leakage — Phase-2 exit gate).
- Field-level access (e.g. confidential proposal fields to a reviewer) is evaluated independently from page access (70 §3).

## 7. Events emitted (outbox → consumers)

Event names reuse the state machines' `audit` codes verbatim, so audit and integration share one vocabulary:

| Command | Event(s) | Consumers |
| --- | --- | --- |
| `challenges:publish` | `challenge.published` | search index, notification (eligible solvers), projection builder |
| `proposals:submit` | `proposal.submitted` | notification (org), audit |
| `assignments/review:submit` | `review.submitted` | notification (org), decision-readiness check |
| `challenges/decision:record` | `challenge.decision.recorded`, `direct-offer.selected`/case-created | notification (all parties), case module |
| `payment` transitions | `payment.processing`…`payment.reconciled` | ledger, reconciliation, notification |

Consumers are idempotent; delivery is at-least-once. A delivery failure never changes business state (FR-OPS-006).

## 8. File upload sub-protocol

```
POST /files:request-upload      # {entity, mime, size, classification} → {upload_url, object_key, file_id}
PUT  <upload_url>               # client → private quarantine bucket
POST /files/{id}:complete       # server enqueues scan; file stays unavailable
GET  /files/{id}:download-url   # short-lived signed GET; 403 unless authorized + clean + NDA/classification ok
```

Uploaded content is inaccessible until all validation/scanning gates pass (Phase-1 exit gate).

## 9. Contract test obligations

Each endpoint ships with contract tests asserting: happy path; each `MutationFailure` code; cross-tenant/ID-swap → `404`; wrong-role → `403`; stale `expected_version` → `409`; duplicate `Idempotency-Key` → same receipt; expired session/removed membership → immediate deny. The prototype's client engines (`canPerform`, `decideTeamPermission`, `evaluateEligibility`, transition tables) are the **oracles** these tests compare against (30 §E).
