# API Contract — conventions, command envelope, and MVP endpoints

The production API is the **only** authority. The executable initial contract is defined once in [`packages/contracts/src/openapi.ts`](../packages/contracts/src/openapi.ts), served by the development API at `GET /api/v1/openapi.json`, and exported as `packages/contracts/dist/openapi.json` during the package build. It promotes the canonical command-result invariants in [20 §9](20_CANONICAL_MODEL.md) and the state machines in `domain/state-machines.ts`; generated clients remain a later consumer of this source contract.

---

## 1. Conventions

- **Base**: `/api/v1`. Version in the path; breaking changes bump the version.
- **Transport**: JSON over HTTPS; UTF-8; Persian text unescaped. All times ISO-8601 UTC; server echoes `server_time`.
- **Auth**: `Authorization: Bearer <access_token>` (OIDC). Active workspace via `X-Workspace-Id` header (validated against membership — never trusted blindly).
- **Resource style**: reads are REST resources (`GET /challenges/{id}`); incomplete-draft autosave uses `PATCH`; workflow transitions are explicit commands (`POST …:action`) because authoritative state changes are not generic CRUD.
- **IDs** are opaque prefixed strings (50 §1). Never expose tenant secrets in URLs or IDs.
- **Pagination**: cursor-based — `?limit=&cursor=`; responses return `{ items, next_cursor }`. No offset pagination on large sets.
- **Filtering**: explicit query params only; server ignores unknown params (no mass-assignment via query).

## 2. Every response envelope

```jsonc
// success
{
  "ok": true,
  "data": {
    /* resource or command result */
  },
  "meta": {
    "server_time": "2026-08-20T12:00:00Z",
    "correlation_id": "cor_9f…",
    "entity_version": 7, // for optimistic concurrency on the returned aggregate
  },
}
```

## 3. Command envelope (writes)

Every write requires a versioned command body and `Idempotency-Key`; protected workspace writes also require `X-Workspace-Id`. The example below is a workflow mutation whose success data is the canonical receipt:

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
    "idempotent": false, // true when the key replayed a prior result
    "next_actions": ["evaluating"], // allowed next transitions (from the state machine)
  },
  "meta": {
    "server_time": "2026-08-20T12:00:00Z",
    "entity_version": 7,
    "correlation_id": "cor_9f…",
  },
}
```

OIDC authorization start returns the provider URL plus one-time browser-held state and PKCE verifier; the server retains only their digests and exact redirect binding. Session exchange and refresh are the command response-shape specialization: their successful `data` is `{ tokens, receipt }`, because the write must return the rotated credentials and its canonical mutation receipt together. Session revoke, workspace context switch, challenge create, and challenge save return the receipt directly. Every aggregate mutation response still carries versioned meta.

- **Idempotency**: `Idempotency-Key` is stored per `(tenant, command, key)` (50 §8) with the cached response and a canonical request fingerprint. The fingerprint binds the actor, active workspace, target, and normalized command body; an exact retry within TTL returns the _same_ receipt with `idempotent:true`, while reuse for a different command context/body returns `409 CONFLICT` and never discloses the first receipt. Session exchange/rotation use an equivalent credential-scoped fingerprint before a tenant context exists. This prevents duplicate submissions, decisions, invitations, signatures, and payments without turning a shared key into a cross-workspace read channel (NFR-REL-001).
- **Optimistic concurrency**: `expected_version` must equal the aggregate's current `version`, else `409 CONFLICT` (see §4). Retry never silently overwrites.
- **Step-up**: sensitive commands (`sensitiveActions`, `product.ts:42`: decide, accept-deliverable, approve-payment, manage-access, resolve-dispute) require a fresh `step_up_token`; absence → `403` with `code:"STEP_UP_REQUIRED"`.
- **Reason**: `manual-review` transitions and all ops interventions require a structured `reason`.
- **Unit of work**: the demo composition revalidates session/membership inside a shared in-memory critical section. In PostgreSQL mode, nested identity/workspace/aggregate work shares one `PostgresUnitOfWork`: session and membership are revalidated under locks, then the challenge or proposal aggregate pointer, immutable version, durable receipt, mutation audit, outbox event, and tenant-scoped cached result commit or roll back together. Deferred operation denials (`NO_ACCESS`/`NOT_FOUND`) are recorded outside the rolled-back business transaction so the decision evidence remains durable without duplicating successful mutation audit.

## 4. Error contract

Maps the canonical error codes to HTTP plus a stable envelope. Errors are **non-enumerating** for protected records (a hidden record and a denied record both return `404` to non-members).

```jsonc
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "…",
    "current_version": 7,
    "recovery": "refetch_and_retry",
  },
  "meta": {
    "server_time": "2026-08-20T12:00:00Z",
    "correlation_id": "cor_9f…",
    "entity_version": 7,
  },
}
```

| `code`                 | HTTP                       | When                                        | Recovery hint                                    |
| ---------------------- | -------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `VALIDATION`           | 422                        | Field/schema/readiness failure              | Field-level errors in `error.fields`             |
| `NO_ACCESS`            | 403 (or 404 for protected) | AuthN/AuthZ deny                            | Non-enumerating for protected records            |
| `NOT_FOUND`            | 404                        | Unknown/removed/cross-tenant ID             | Never falls back to a sample (invariant 20 §7.5) |
| `INVALID_STATE`        | 409                        | Transition not allowed from current state   | Show current state + allowed transitions         |
| `CONFLICT`             | 409                        | Stale `expected_version` / duplicate unique | Return `current_version`; refetch & merge        |
| `STORAGE`              | 503                        | Transient persistence/provider failure      | Safe to retry with same idempotency key          |
| `STEP_UP_REQUIRED`     | 403                        | Authenticated action needs fresh step-up    | Start the approved IdP step-up flow              |
| `VERIFICATION_EXPIRED` | 409                        | Contact-verification attempt expired        | Start contact verification again                 |
| `VERIFICATION_LOCKED`  | 409                        | Verification attempt exhausted              | Start contact verification again                 |
| `RATE_LIMITED`         | 429                        | Start/resend frequency exceeded             | Retry after the response's `Retry-After` delay   |
| `ACTIVATION_REQUIRED`  | 409                        | Verified contact has no solver activation   | Activate the individual solver identity          |

Rate-limited requests return `429` with `Retry-After`. All errors carry `correlation_id`.

## 5. MVP slice endpoints

The OpenAPI now has exactly **79 paths / 86 operations**: the completed Phase-1/2 surface, C1 solver facts/eligibility, C2 team lifecycle, C3 proposal draft create/read/save, C4 proposal submission plus organization inbox/detail reads, C5 bilateral eligibility/clarification/revision commands, C6 saved opportunities/direct offers, and C7 solver contact verification/activation. Every implemented write carries `expected_version` and `Idempotency-Key`; every protected solver/team/profile/proposal route and protected challenge write additionally requires `X-Workspace-Id`. B3's challenge create/save fields (`verification_required`, `document_gate_required`, `allowed_applicant_types`, `nda_required`, and `proposal_deadline`) become the immutable rule snapshot C1/C4 read for the exact published version. Entries labelled future below are not part of the current contract. PostgreSQL mode validates signed issuer/audience/nonce, exact state/redirect, S256 PKCE, the existing `(issuer, subject)` link, and a verified matching contact before issuing digest-only app credentials. C7 adds an independent provider assertion route for self-service solvers; contact verification remains distinct from workspace verification. RLS, the managed production IdP, and managed step-up remain later gates.

### 5.1 Identity & context

```
POST /auth/oidc:start              # exact redirect → provider authorization URL + one-time PKCE values
POST /auth/session:exchange        # OIDC code → app session (thin; IdP owns credentials/OTP)
POST /auth/contact-verification:start
POST /auth/contact-verifications/{attemptId}:resend
POST /auth/contact-verifications/{attemptId}:verify
POST /auth/contact-session:exchange # verified contact → returning solver session
POST /auth/session:refresh
POST /auth/session:revoke
POST /solver/activation            # verified contact → one human + permanent individual workspace
GET  /solver/activation            # authenticated activation/start-intent record
GET  /me                           # user + memberships + available workspaces
POST /me/context:switch            # set active workspace (validated vs membership)
```

C7 contact start/resend/verify operations are provider-neutral and return only masked destination metadata plus typed pending/verified state. Expired and exhausted attempts return `VERIFICATION_EXPIRED`/`VERIFICATION_LOCKED`; bounded start/resend sends return `RATE_LIMITED` with `Retry-After`; unknown attempts, wrong codes, malformed/replayed assertions, and consumed assertions share non-enumerating denial behavior. Verification returns a short-lived one-time provider assertion, never an app password or stored OTP secret.

`POST /solver/activation` consumes that assertion and atomically creates the app identity, solver tenant, permanent individual workspace/membership, blank C1 profile, `not_started` workspace verification, session, receipt, audit, outbox, and idempotency result. Its `start_intent` is only `individual|team`; team intent returns `create_team`, after which the client uses C2's separate team-create command. `POST /auth/contact-session:exchange` consumes a fresh assertion for a previously activated human and returns a session with no active workspace so existing context selection remains authoritative. Exact idempotent replay returns the original receipt/session result; another use of a consumed assertion is denied.

### 5.2 Challenge (organization)

```
POST /challenges                              # create draft            → chl_*
GET  /challenges?stage=&cursor=               # bounded active org-workspace projection, immutable created-time cursor
GET  /challenges/{id}                          # full private aggregate (owning org workspace only)
PATCH /challenges/{id}                         # autosave draft (expected_version)
POST /challenges/{id}:request-triage           # draft → triage        (pre: rough-brief-valid)
POST /challenges/{id}:advance-formulation      # triage → formulation  (org owner/member or purpose-scoped platform:ops)
POST /challenges/{id}:request-approvals        # formulation → approvals (pre: formulation-complete; locks the version)
POST /challenges/{id}/approvals:record         # per-gate approval (technical/legal/finance/quality)
POST /challenges/{id}:publish                  # approvals → published  (pre: 3 approvals + quality; atomic version lock + projection + outbox)
POST /challenges/{id}:extend-deadline          # delivered (B6): forward-only, reason required, server time decides
POST /challenges/{id}:pause                    # delivered (B6): hidden from discovery, record preserved
POST /challenges/{id}:resume                   # delivered (B6)
POST /challenges/{id}:close                    # delivered (B6): terminal
POST /challenges/{id}:cancel                   # delivered (B6): terminal
POST /challenges/{id}:amend                    # future exception path: requires new version + re-approval + proposal policy
GET  /challenges/{id}/versions                 # future: immutable history
```

### 5.3 Platform publication work (standing authority, purpose-scoped)

```
GET /platform/challenge-approvals                       # active platform role's pending triage/gate work, bounded to 50 rows
GET /platform/challenges/{id}/approval-brief            # triage/approvals purpose allowlist; target org workspace in X-Workspace-Id
```

The queue derives work from the active `platform:ops`/`platform:finance`/`platform:legal` role. Ops receives rough briefs at `triage` plus its quality gate at `approvals`; finance and legal receive only their approval gate. Approval items exclude versions whose gate is occupied or on which the current actor already recorded another gate. The brief is not a stripped `ChallengeResource`: each purpose/gate has a closed content allowlist and omits contact data, invitees, attachment ids, tenant/creator ids, and other approvers' user ids. `platform:ops` may issue `:advance-formulation` only for a visible triage item; after the transition, the purpose-scoped brief becomes inaccessible. Unknown, wrong-stage, wrong-purpose, and unreachable records return the same typed `NOT_FOUND`.

A rejected gate remains immutable on its exact version. A subsequent authorized `PATCH` creates a fresh challenge version in `formulation`; that new version has no inherited approvals and must pass full readiness before requesting approvals again.

### 5.4 Public discovery (unauthenticated, projection-backed)

```
GET  /public/challenges?category=&cursor=      # delivered (B5): from challenge_public_projection only; keyset cursor, server-fixed page size
GET  /public/challenges/{id}                   # delivered (B5): allowlisted projection fields only; non-enumerating NOT_FOUND
GET  /public/challenges?q=                     # deferred: free-text search lands with the discovery UI
GET  /public/organizations/{id}                # deferred: verified vs user-supplied vs demo clearly typed
```

### 5.5 Solver, team, eligibility & proposal

```
GET   /solver/profile                                      # delivered C1: active personal/team workspace facts + derived readiness
PATCH /solver/profile                                      # delivered C1/C2: owner/admin, or proposal manager when team policy permits
GET   /solver/verification                                 # delivered C1: workspace status, never inferred from verified contact
POST  /solver/verification:start                           # delivered C1: not_started → draft; solver cannot self-approve
GET   /challenges/{id}/eligibility                         # delivered C1: exact published rule + live state/deadline
POST  /challenges/{id}/eligibility-gates/{gate}:accept     # delivered C1: exact-version NDA/synthetic document acknowledgement
POST  /solver/teams                                        # delivered C2: separate team workspace + owner + profile + not_started verification
GET   /solver/team                                         # delivered C2: active team policy and retained membership roster
PATCH /solver/team/policy                                  # delivered C2: reasoned role/join policy update
GET   /solver/team/invitations                             # delivered C2: manager-scoped invitation list
POST  /solver/team/invitations                             # delivered C2: issue recipient-bound non-owner invitation
POST  /solver/team/invitations/{invitationId}:revoke       # delivered C2
GET   /solver/team-invitations                             # delivered C2: authenticated human's incoming invitations
POST  /solver/team-invitations/{invitationId}:respond      # delivered C2: authenticated recipient only
POST  /solver/teams/{workspaceId}/membership-requests      # delivered C2: request-capable teams only
GET   /solver/team/membership-requests                     # delivered C2: owner/admin review queue
POST  /solver/team/membership-requests/{requestId}:decide  # delivered C2: exact requester + assigned non-owner role
GET   /solver/team-membership-requests                     # delivered C2: authenticated human's own requests
POST  /solver/team-membership-requests/{requestId}:withdraw # delivered C2
POST  /solver/team/members/{membershipId}:change-role      # delivered C2: non-owner roles only
POST  /solver/team/members/{membershipId}:suspend          # delivered C2: immediate authority cut
POST  /solver/team/members/{membershipId}:restore          # delivered C2
POST  /solver/team/members/{membershipId}:remove           # delivered C2: retained membership evidence
POST  /solver/team:transfer-ownership                      # delivered C2: atomic owner swap
POST  /solver/team:leave                                   # delivered C2: owner must transfer first
POST  /solver/team:archive                                 # delivered C2: terminal authority cut
GET  /opportunities?…&cursor=                  # future: searchable published challenges for active workspace
GET  /solver/saved-opportunities               # delivered C6: active solver workspace's exact-version bookmarks
POST /challenges/{challengeId}:save             # delivered C6: expected-zero bookmark command
POST /challenges/{challengeId}:unsave           # delivered C6: expected-version removal command
GET  /solver/direct-offers                      # delivered C6: active-grant recipient list
GET  /solver/direct-offers/{id}                 # delivered C6: recipient aggregate + private response draft
POST /solver/direct-offers/{id}:view            # delivered C6: received → viewed
POST /solver/direct-offers/{id}:start-response  # delivered C6: viewed → response_draft
PATCH /solver/direct-offers/{id}/response       # delivered C6: versioned private response draft
POST /solver/direct-offers/{id}/response:submit # delivered C6: validate/lock before server deadline
POST /solver/direct-offers/{id}:decline         # delivered C6: reasoned close + grant revocation
GET  /organization/direct-offers                # delivered C6: sender list; no unsubmitted response body
POST /organization/direct-offers                # delivered C6: exact-version send + bilateral grants
GET  /organization/direct-offers/{id}           # delivered C6: sender-owned record/submitted response
POST /organization/direct-offers/{id}:cancel    # delivered C6: reasoned close + grant revocation
POST /organization/direct-offers/{id}:start-negotiation # delivered C6: submitted response → negotiating
POST /proposals                                # delivered C3: create draft for reachable call + active solver workspace
GET  /proposals/{id}                           # delivered C3: private editable draft in exact owner scope
PATCH /proposals/{id}                          # delivered C3: append unlocked exact-base draft version
POST /proposals/{id}:submit                    # delivered C4: exact-rule/live-state gate; appends locked version + grant + receipt
GET  /organization/proposals                   # delivered C4: bounded active-grant inbox for owned challenges
GET  /organization/proposals/{id}              # delivered C4: exact granted locked version and confidential projection
POST /organization/proposals/{id}:start-eligibility-review # delivered C5: submitted → eligibility_review
POST /organization/proposals/{id}:decide-eligibility       # delivered C5: eligibility_review → eligible|ineligible
POST /organization/proposals/{id}:request-clarification    # delivered C5: eligible → clarification_requested
POST /proposals/{id}:submit-clarification      # delivered C5: clarification_requested → clarification_submitted
POST /organization/proposals/{id}:resolve-clarification    # delivered C5: clarification_submitted → reviewing
POST /organization/proposals/{id}:request-revision         # delivered C5: reviewing → revision_requested
POST /proposals/{id}:start-revision            # delivered C5: revision_requested → revision_draft
POST /proposals/{id}:resubmit                  # delivered C5: revision_draft → resubmitted (new locked version, exact base/diff)
POST /proposals/{id}:withdraw
GET  /proposals/{id}/versions                  # immutable history + diffs (changedFields)
```

C1 eligibility returns `eligible`, `needs_action`, or `ineligible` with stable `reasons[]`, `next_actions[]`, `evaluated_against_version_id`, and server evaluation time. An unknown, unpublished, NDA-only/out-of-reach challenge, or cross-workspace protected scope returns the same non-enumerating `NOT_FOUND`. `verification_required=false` permits an otherwise eligible `not_started` workspace; when the exact rule says `true`, the result includes `verification_required` and `verify_workspace`. `document_acknowledgement` is an acknowledgement fact only and cannot be presented as upload/review evidence.

C2 mutations use the active team for manager-side operations; invitation response and own-request operations instead bind the authenticated human to the stored recipient/requester before returning any record. Team creation is an expected-zero command from an active solver context and creates no credential. Invitation creation expects the current team version; invitation revoke/respond expect the invitation version; member commands expect the target membership version; policy, transfer, and archive expect the team version. Policy, rejection/revocation, member/owner changes, leave, and archive carry a structured reason in audit metadata. Reasons and contact addresses are excluded from outbox payloads. A removed/suspended member or archived team fails the next authority resolution immediately. C8, not C2, turns the allowlisted lifecycle events into user-facing notifications, and C9 connects the existing team UI.

C3 draft creation requires a registered-reachable public projection whose private challenge aggregate is still published/open/unexpired at server time. It intentionally does not require verification, eligibility gates, or a final eligibility result; C4 re-evaluates those facts atomically at submission. Individual drafts store no assignment. A team creator's active membership is auto-assigned, while subsequent GET/PATCH uses canonical `edit-proposal` policy and contributor assignment. Queries predicate on the active solver `(tenant_id, workspace_id)` before the proposal ID, so foreign IDs and unassigned private drafts return non-enumerating `NOT_FOUND`. PATCH requires the current `expected_version`, appends one unlocked version with `base_version_id=current_version_id`, computed `changed_fields`/`content_hash`, and advances the aggregate pointer/version atomically. `attachment_ids` are opaque metadata references only; no file endpoint, lookup, storage, scan, or ownership claim is part of C3.

C4 submit first revalidates current session/workspace/membership and record-scoped C2 `submit-proposal` authority, including assignment, before idempotent replay. It then locks the proposal, current challenge/rule, profile, verification, and exact-version gate facts and uses the database transaction timestamp for every live deadline and evidence decision. The submitted terms must equal the challenge aggregate's exact current published version. An otherwise eligible unverified workspace succeeds when that rule says `verification_required=false`; unmet required facts return stable eligibility reasons/actions in the typed error. Conflict, IP, and accuracy declarations remain unconditional, while NDA readiness follows the exact rule. Success returns one replayable mutation receipt after atomically appending a new exact-base locked version, setting `submitted` plus tracking/time, creating one version-bound organization `read` grant, and recording metadata-only audit/outbox/idempotency evidence.

Organization inbox/detail routes require an active organization membership and query from an active, unexpired version-bound grant whose grantee is the active workspace and whose proposal challenge belongs to that organization. Revoked or expired grants cannot be reactivated, and proposal-grant rows remain append-only lifecycle evidence. The inbox SQL and response omit proposal content and are bounded to 100 rows; detail reveals only the submitted aggregate summary, the exact locked version named by the grant, and its controlled clarification/revision evidence. Draft history, solver tenant/workspace IDs, grant IDs, submitting-user IDs, and audit internals are not response fields. Unknown, expired, revoked, foreign-workspace, and wrong-challenge IDs all return non-enumerating `NOT_FOUND`.

C5 exposes the missing canonical bridge from C4 submission through organization eligibility review before clarification. Organization commands start from the active version-bound C4 grant; solver commands start from the exact owning workspace and current C2 edit/submit authority. Each command requires `expected_version`, is idempotent, advances only its named state, and commits its receipt/audit/outbox evidence atomically. A clarification response is separate immutable evidence, not a proposal-content version. Starting revision appends an unlocked exact-base version; subsequent PATCH remains available in `revision_draft`; resubmission requires the active request before its server deadline, accepts the current published challenge terms, appends a locked version, stores the diff against the requested locked base, marks the request resubmitted, revokes the superseded grant, and creates the replacement exact-version grant. C8 will project these events into notifications; C9 owns connected UI.

C6 saved-opportunity commands are scoped to the active individual/team workspace and bind the exact current public projection. Direct-offer send starts from the sending organization's own open challenge and one registered solver workspace, then creates the offer and exact offer/challenge grants atomically. Recipient reads and commands start from the active collaborate grant and the C2 team decision; the sender reads only its own aggregate and cannot see a response draft before submission. View, response start/save/submit, decline, cancel, negotiation start, and lazy deadline expiry follow the canonical state table. The server clock closes `received`, `viewed`, or `response_draft` at the response deadline even if editing began earlier. Decline/cancel/expiry close both grants; replay, stale version, wrong workspace/role, and foreign ID paths fail without widening access. Selection remains a later decision/case transaction. C8 owns user-facing notification projections and C9 owns connected UI.

### 5.6 Review, COI & decision

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

- Organization review views honor reviewer anonymity and policy timing (FR-REV-007): reviewer identity and other reviewers' scores are withheld until policy allows; enforced in the _projection query_, not the client.
- Public projections are separate resources (`/public/*`) served from `challenge_public_projection`; the private aggregate is never used to render public pages (prevents confidential-field leakage — Phase-2 exit gate). B5 enforces this through a distinct `PublicChallengePort` whose PostgreSQL adapter selects an explicit column list from the projection table and joins nothing else; a native test renames `challenge`/`challenge_version`/`challenge_approval` out of reach and proves both public reads still succeed. The audience (`anonymous` vs `registered`) is derived server-side from session presence, never from a client parameter, and a stale credential degrades to `anonymous` rather than failing the request. List cursors bind immutable `published_at` plus `challenge_id`; category equality trims and case-folds consistently. Server time excludes expired calls from the list while detail reports the derived expired state.
- Field-level access (e.g. confidential proposal fields to a reviewer) is evaluated independently from page access (70 §3).

## 7. Events emitted (outbox → consumers)

The executable schema-v1 worker allowlist is exact and intentionally small. It is derived from `challengeOutboxEventTypes`, `solverOutboxEventTypes`, `teamOutboxEventTypes`, `proposalOutboxEventTypes`, and `opportunityOutboxEventTypes`, plus the four session events, so an event an adapter emits but the domain omits is dead-lettered as `UNSUPPORTED_EVENT_TYPE` rather than silently dropped. C2 adds `team.created`, policy/invitation/request decisions, member role/state/leave changes, ownership transfer, and archive. C3 adds `proposal.draft.created` and `proposal.draft.updated`; C4 adds `proposal.submitted`; C5 adds the canonical eligibility-started/eligible/ineligible, clarification-requested/submitted, review-started, revision-requested/draft-created, and resubmitted events. C6 adds saved/unsaved plus offer sent/viewed/response/negotiation/close/expiry events. Proposal and opportunity events carry stable entity/version and evidence IDs, never proposal/response content, clarification text, revision scope, attachment IDs, titles, contact details, or filenames. No generic lifecycle, notification-fabrication, or AI event is accepted. The `challenge.draft.*`, `proposal.draft.*`, and response-draft codes are walking-skeleton application audit codes covering effects that have no canonical transition-table row; lifecycle codes reuse the canonical domain names.

For the target lifecycle commands below, event names reuse the state machines' `audit` codes verbatim so audit and integration share one vocabulary:

| Command                      | Event(s)                                                            | Consumers                                                         |
| ---------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `challenges:publish`         | `challenge.published`                                               | search index, notification (eligible solvers), projection builder |
| `proposals:submit`           | `proposal.submitted`                                                | notification (org), audit                                         |
| `assignments/review:submit`  | `review.submitted`                                                  | notification (org), decision-readiness check                      |
| `challenges/decision:record` | `challenge.decision.recorded`, `direct-offer.selected`/case-created | notification (all parties), case module                           |
| `payment` transitions        | `payment.processing`…`payment.reconciled`                           | ledger, reconciliation, notification                              |

Consumers are idempotent; delivery is at-least-once. Every downstream handler receives `event_id` unchanged as its provider idempotency key, because an application ledger cannot atomically cover a remote side effect. Records are runtime-validated against the envelope, supported schema version, and an explicit event-type allowlist; malformed/unsupported records are dead-lettered, while handler failures retry per record with a bounded attempt count so one poison event cannot starve the batch. A delivery failure never changes business state (FR-OPS-006). The current in-memory worker proves these semantics only; a production source still needs durable claims/visibility timeouts, retry scheduling, and an operated dead-letter queue.

## 8. File upload sub-protocol

```
POST /files:request-upload      # {entity, mime, size, classification} → {upload_url, object_key, file_id}
PUT  <upload_url>               # client → private quarantine bucket
POST /files/{id}:complete       # server enqueues scan; file stays unavailable
GET  /files/{id}:download-url   # short-lived signed GET; 403 unless authorized + clean + NDA/classification ok
```

Uploaded content is inaccessible until all validation/scanning gates pass (pre-pilot hardening gate).

## 9. Contract test obligations

Each endpoint ships with contract tests asserting: happy path; each `MutationFailure` code; cross-tenant/ID-swap → `404`; wrong-role → `403`; stale `expected_version` → `409`; duplicate `Idempotency-Key` → same receipt; expired session/removed membership → immediate deny. The prototype's client engines (`canPerform`, `decideTeamPermission`, `evaluateEligibility`, transition tables) are the **oracles** these tests compare against (30 §E).
