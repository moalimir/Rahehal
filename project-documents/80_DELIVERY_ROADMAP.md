# Delivery Roadmap

**Strategy: depth before breadth.** The prototype already demonstrates all eleven stages. Do not build more screens. Make **one thin vertical slice authoritative**, then widen. A stage is "done" only when its data, permissions, failure behavior, audit, and operations are server-enforced — not when a page renders. Aligned to [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md); supersedes the v1 roadmap with the resolved vocabulary.

---

## 1. Dependency chain

```
canonical model + release baseline + P0 decisions
  → identity · tenancy · authz · persistence · audit · files   (platform foundation)
  → challenge approval & publication                            (Slice 1a)
  → solver workspace & proposal submission                      (Slice 1b)
  → reviewer COI/scoring & organization decision                (Slice 1c = MVP)
  → contract · pilot · deliverable · payment · operations       (Slice 2)
  → impact · disputes · controlled launch · scale               (Slice 3)
```

Do not parallelize competing definitions of identity, tenancy, entity states, or authorization — those are shared foundations. Everything else can overlap after Phase 0.

## 2. Phases

| Phase | Outcome | Exit class | Indicative effort |
| --- | --- | --- | --- |
| **0. Baseline & decisions** | Reproducible green frontend; canonical model + ⚠ decisions signed; ADRs; CI | Ready to build | 1–2 wks |
| **1. Platform foundation** | Real identity, tenancy, authz, Postgres, audit, files, API + observability skeleton | Safe foundation | 4–6 wks |
| **2. Authoritative challenge** (Slice 1a) | Versioned draft → approvals → atomic publish → public projection | Published challenge is real | 3–5 wks |
| **3. Authoritative proposal** (Slice 1b) | Real solver/team context, server eligibility, immutable submission/version | Locked proposal is real | 3–5 wks |
| **4. Review & decision** (Slice 1c) | Assignment, server COI, rubric/scoring, reasoned decision, full correlation | **MVP slice complete** | 3–5 wks |
| **5. Execution & payment** (Slice 2) | Contract, pilot, deliverables, gated payment + reconciliation, disputes, ops | Full case lifecycle | 5–8 wks |
| **6. Controlled pilot** (Slice 3) | Security/legal/privacy/a11y/perf/DR sign-off; limited real users | Production pilot | 3–5 wks |

Ranges assume a small cross-functional team; provider procurement, legal review, and the ⚠ decisions can dominate the schedule.

## 3. Phase 0 — baseline & decisions

**Deliverables:** resolve the ⚠ P0 decisions (00 §4: brand, MVP boundary, launch posture, tenancy, identity/KYB, residency, offline scope, payment custody) with named owners; adopt [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md); pin Node/npm (`.nvmrc`) and make `npm ci` install Sharp/libvips reproducibly (T-04); regenerate `index.html` and pass the standalone login→workspace smoke (M-05); restore the 5 failing byte budgets or rebaseline with user-centric targets (T-01); install pinned Playwright Chromium, run the 70 behavior cases, commit a reviewed visual Golden Master; add CI running every release gate; add `.env.example`, `SECURITY.md`, license, ownership; open ADR-001…010 (30 §F).

**Exit gates:** a clean CI clone passes every release command with no manual workaround; no checked-in/generated artifact is stale; perf + browser + visual gates green or signed-with-expiry; MVP scope, data classes, roles, launch boundary have named owners.

## 4. Phase 1 — platform foundation

**Deliverables:** dev/test/preview/staging/prod environments (IaC); OIDC identity + verified contacts + MFA/step-up + session rotation/revocation + safe return-to; tenant/workspace/membership/role/invitation model with the unified deny-by-default authz engine (70 §2); Postgres schema/migrations for the foundation + cross-cutting tables (50 §3,§8) with constraints, indexes, RLS, backups, restore test; versioned OpenAPI + generated client; idempotency + optimistic concurrency + receipts + correlation IDs + transactional outbox + append-only audit; private object storage with pre-signed upload, validation, quarantine/scan, signed reads, retention, access audit; logs/metrics/traces/web-vitals/health checks/alert ownership; edge hardening (headers, rate limit, secrets, dependency scan). Move the first flow behind typed query/command adapters (40 §9); production config disables mock authority.

**Exit gates:** the five Phase-1 security gates in 70 §9 pass.

## 5. Phases 2–4 — the MVP vertical slice

Build the canonical lifecycle `draft → … → decided` end-to-end, aggregate by aggregate.

- **Phase 2 (challenge):** draft API with autosave + `expected_version` + conflict recovery; server validation for the four intake stages sharing one readiness rule; org ownership/member permissions + field classification; version-specific technical/legal/finance + ops-quality approvals (distinct actors, 70 §6); atomic publication of an immutable version + separate public projection + outbox; deadline scheduling + controlled close/pause/cancel; public search/filter/detail from projections (not fixtures); deterministic fixture strategy that never contaminates prod.
  **Exit:** an incomplete/unauthorized challenge cannot be published via direct API call; published fields exactly match the approved projection and confidential fields never appear in DOM/API; update/publish races produce safe `409`s; org + ops journeys pass E2E + audit.

- **Phase 3 (proposal):** solver profile/verification/privacy/evidence APIs; team create/invite/request/role-policy/transfer/remove/archive + active-context switch (port `decideTeamPermission`); server `evaluateEligibility` with reasons/actions/overrides/deadlines/rule-versions; saved opportunities + direct-offer aggregate; workspace-scoped draft + evidence upload; submission transaction checking challenge/rule/deadline/sender/declarations/version/evidence then locking the version; clarification/revision with explicit base + diff; outbox notifications.
  **Exit:** no cross-workspace read/write via param/ID change; owner/admin/manager/contributor/viewer enforced by API tests; duplicate submit → one version + one receipt; deadline races decided by server time; submitted content immutable with complete revision history.

- **Phase 4 (review & decision):** reviewer identity/eligibility/assignment/workload/scoped-access; **first-class COI** declaration + ops escalation before any protected response; versioned rubric + criterion validation + rationale + draft + locked final review; comparison/org projections honoring anonymity + policy timing; review reopen/invalidate with separation of duty + reason + evidence; org shortlist + no-award/selection + reasoned decision citing exact versions + case creation; full correlation challenge_version → proposal_version → assignment/review → decision; intake-to-decision funnel metrics.
  **Exit:** the four Phase-4 gates in 70 §9; MVP journey + key negative paths pass browser E2E, a11y, security, audit.

## 6. Phase 5 — execution, payment & operations (Slice 2)

Contract/IP versioning + provider signature + effective state; case comms/documents scoped by participation + classification; pilot plan + milestones/tasks/KPIs + evidence + change control; deliverable submit/accept/revise/reject with acceptance protocol; payment schedule + finance approval + provider integration + callback validation + ledger + retry + duplicate protection + reconciliation + hold/refund/receipt (three-gate invariant); dispute/evidence + SLA/escalation + support consent + privileged access; case closure + reconciled payments + one-time feedback + impact evidence + case-study consent; ops dashboards from real queue/event state.
**Exit:** the Phase-5 gates in 70 §9; finance/legal/privacy/ops approve procedures + recovery playbooks.

## 7. Phase 6 — controlled production pilot (Slice 3)

External pen-test + remediation; privacy impact assessment + data map + retention/deletion + subject-request process + incident plan; qualified review of terms/IP/contracts/marks/payments/tax/disputes; WCAG 2.2 AA audit with real assistive tech; load/resilience/queue-retry/backup/restore/DR/reconciliation exercises; measured web-vital + API SLOs + error budgets + on-call; onboarding/support runbook + feature flags + rollback + data-correction + comms plan; instrumented success measures.
**Exit:** no unresolved critical/high security/privacy/legal/a11y/data-loss/financial finding; recovery objectives tested; pilot participants/workflows/data-classes/provider-limits contractually clear; go/no-go signed by product, eng, security, legal/privacy, ops, finance.

## 8. Recommended first backlog (ten bounded items)

1. **Baseline:** pin Node/npm; make `npm ci` install Sharp/libvips on macOS + CI Linux.
2. **Release:** regenerate offline bundle; fix the login/workspace standalone smoke; document offline as demo-only.
3. **Canonical:** land [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) as shared `packages/domain` types; rename `TeamType`→`ApplicantScope`/`TeamKind`; unify `ApplicantType`; delete the duplicate `canTransition`.
4. **Performance:** locate the 57–237-byte regressions; plan role code + CSS split off the 1.31 MB common JS.
5. **Browser:** install pinned Chromium; run behavior tests; review 18 visual scenarios × 7 viewports; commit approved snapshots.
6. **Decisions:** product/legal/security workshop closing the ⚠ P0 questions.
7. **Contracts:** first OpenAPI schemas + permission matrix for session, org/workspace, challenge draft/version/approval/publish (60, 70).
8. **Data:** migrations/constraints for tenant, user, org, workspace, membership, challenge/version, approval, audit, idempotency, outbox (50).
9. **Adapter:** typed frontend query/command interfaces; move the org challenge flow behind them with no behavior change.
10. **Foundation slice:** real login/session + server-authorized org challenge save/read in a test environment.

## 9. Parallelizable streams (after Phase 0)

Design/a11y cleanup + role code/CSS split · identity/tenancy + DB/outbox foundation · API/domain workshops for challenge/proposal/review · file security + notification provider evaluation · legal/privacy/payment discovery · test fixtures → testkits + contract tests + threat modeling + pilot ops design.

## 10. Progress reporting (outcomes, not pages)

Per phase report: approved decisions + remaining blockers; vertical-slice scenarios passing in CI; server-authorized aggregates/commands now authoritative; migrations + recovery evidence + audit completeness; security/a11y/perf defects by severity; operational readiness + provider dependencies; funnel/user metrics once real pilots begin.

## 11. Definition of Done (per requirement)

A requirement is **production-complete** only when *all four* exist: (1) implementation with server authority, (2) automated evidence (unit/contract/E2E/a11y/security as relevant, green in CI), (3) documented operational procedure, (4) sign-off from the required owner (product/security/legal/privacy/finance/ops as relevant). "Prototype" and "partial" ([90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md)) never count as done.
