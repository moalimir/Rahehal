# Consistency Audit — contradictions, duplications, misleading behavior, and resolutions

Every finding below was observed directly in source on 2026-08-20 and carries `file:line` evidence. Each has a **resolution** that is already encoded in [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md). Severity: **C**ritical (blocks a coherent backend), **H**igh (will cause defects/rework), **M**edium (maintenance/clarity).

---

## A. Contradictions & duplicated concepts

| ID | Sev | Finding | Evidence | Resolution (canonical) |
| --- | --- | --- | --- | --- |
| X-01 | **C** | **Three lifecycle vocabularies** for one challenge/case concept. `ChallengeState` (9), `CaseState` (10), `ChallengeStatus` (6) — with mismatched names (`approvals` vs `quality-review`, `evaluating` vs `evaluation`) and missing stages (`decided` absent from `CaseState`; `impact` absent from `ChallengeState`). | `state-machines.ts:52`, `product.ts:15`, `challenge.ts:1` | One 11-stage lifecycle; three vocabularies mapped onto it. `ChallengeStatus` reframed as intake-editor sub-status. (20 §4.1) |
| X-02 | **C** | **Two `canTransition` functions** with different signatures and semantics — one generic table-driven, one adjacency-map. Callers may pick either. | `state-machines.ts:37`, `product.ts:119` | Keep the generic table-driven one over the reconciled table; retire `caseTransitions`. |
| X-03 | **C** | **`TeamType` defined twice with opposite meanings.** One means "who may apply (person/team/both)", the other means "kind of team (expert-team/lab/…)". A single import site could bind the wrong one. | `challenge.ts:45` vs `solver.ts:20` | Rename to `ApplicantScope` and `TeamKind` respectively. (D7) |
| X-04 | **H** | **Four solver/applicant taxonomies.** `SolverType`=individual/team/company/university; `TeamType`(solver)=expert-team/lab/academic-group/company; `ApplicantType`=individual/expert-team/lab/academic-group/company; plus free-text `teamType` on challenge. `university` has no home in the other enums; `team` vs `expert-team` diverge. | `challenge.ts:44`, `solver.ts:20`, `eligibility.ts:3` | One `ApplicantType` (5 values); explicit mapping table. (20 §5) |
| X-05 | **H** | **Three permission engines** with different subjects and shapes: `canPerform(InternalRole, ActionName)`, `decideTeamPermission(TeamAction, {TeamRole, policy})`, and reviewer `canAccessReviewMaterials(coiState)`. No shared contract; org & platform authz essentially unmodeled. | `product.ts:50`, `solver/permissions.ts:31`, `reviews/access.ts:17` | One server-side deny-by-default engine; the three client functions become the **test oracle**. (D5, doc 70) |
| X-06 | **H** | **Role taxonomy mismatch.** `Actor` (12) conflates party-type and team-role; `InternalRole` (4) is coarse; `TeamRole` (5) is fine-grained. `team-manager` appears in `Actor`/transitions but is not a `TeamRole` value — an undefined role in the permission engine. | `state-machines.ts:12`, `product.ts:1`, `solver.ts:19`; `team-manager` at `state-machines.ts:146,821` | Three orthogonal namespaces; `team-manager` resolved to explicit `team:owner`/`team:admin`. (D4, 20 §3) |
| X-07 | **H** | **COI is a separate flag from review state**, stored only in `localStorage`, so the `ReviewState` machine's `coi-clear` precondition can be satisfied without a first-class record; ops "can override / escalate" (per PRD FR-REV-003) has nowhere to write. | `reviews/access.ts:1-19`, `state-machines.ts:632-642` | First-class `COI_DECLARATION` row; server-gated. (D8, 20 §4.3) |
| X-08 | **M** | **Embedded case sub-states are a lossy subset** of the canonical machines: `CaseRecord.payments.state` omits `reconciled` & `refunded`; `.deliverables.state` omits the `planned/running` framing. | `solver.ts:413-419` vs `state-machines.ts:870,810` | Declared UI projections; server uses full machines. (D9) |
| X-09 | **M** | **`ContractState` & `MembershipState` duplicated** across `solver.ts` and `state-machines.ts` (values happen to match today, but two definitions will drift). | `solver.ts:360,47` and `state-machines.ts:685,544` | Single canonical definition; the other imports it (the file already imports several types this way — extend the pattern). |
| X-10 | **M** | **Two `PermissionContext` types**, same name, different fields (`{role,membershipActive,caseMember,twoFactorVerified,conflictDeclared}` vs `{role,policy,assigned,isSelf}`). | `product.ts:27` vs `solver/permissions.ts:20` | Unified authorization input in doc 70 §2. |
| X-11 | **M** | **Currency enums diverge.** `ChallengeRecord.currency` = IRR/USD/EUR; money formatting is hard-coded to Toman (`formatToman`), and IRR≠Toman (÷10). | `challenge.ts:79`, `product.ts:123` | Canonical money type stores **minor units + ISO currency**; display layer converts IRR↔Toman explicitly. (doc 50 §7) |

## B. Misleading prototype behavior (reads as "done", is not)

| ID | Sev | Behavior that misleads | Evidence | Why it is misleading |
| --- | --- | --- | --- | --- |
| M-01 | **C** | Sessions, permissions, COI, approvals, payments, and audit are **authoritative in the browser**. The UI enforces deny-by-default, publication gates, and payment prerequisites — all bypassable via devtools/localStorage. | `auth/session.ts`, `reviews/access.ts`, `payments/store.ts`, `solver/repository/*` | A demo that *looks* secure. Any user is the authority. This is R-01. |
| M-02 | **H** | **Idempotency, receipts, and audit "work"** — but against a mutable `localStorage` map (`SolverState.idempotency`, `auditEvents`). | `solver.ts:457,494`; `solver/repository/receipts.ts` | Correct *shape*, zero *durability/immutability*. Convincing but not real. |
| M-03 | **H** | **506 static pages** including per-fixture entity routes and 70 legacy-compat routes suggest a huge live product. | `out/` (506 html), `data/legacy-redirects.ts` | Most are fixture/compat pages, not authorized live records. "Pages shipped" ≠ product depth. |
| M-04 | **H** | **Eligibility "evaluates"** against structured rules — but rules exist for only 4 hard-coded challenge IDs and read profile completeness from `localStorage`. | `eligibility.ts:23-70` | Looks like a matching engine; is a fixture lookup. |
| M-05 | **M** | **Offline `index.html`** (4.98 MB) presents the full app; the checked-in bundle **fails** the current login→workspace smoke and predates the source. | 95 R-06 (offline interaction smoke = Fail), `package.json` build | Distributed demo behaves differently from source; can mislead stakeholders. |
| M-06 | **M** | **Recognizable org names/logos** (a `real` asset directory) sit alongside "demo" data with disclaimer text. | 95 R-05 | Disclaimers don't grant trademark/endorsement rights. |
| M-07 | **M** | **Payment states show money moving** with receipts; there is no provider, ledger, or reconciliation. | `payments/store.ts`, `state-machines.ts:870` | The most dangerous "looks real": financial correctness is simulated. |

## C. Missing decisions (block the backend)

These are unresolved *business* choices without which the schema/authz cannot be finalized. Full list with owners in the v1 doc `95_RISKS_AND_OPEN_QUESTIONS.md §2`; the blocking few:

| ID | Decision needed | Blocks |
| --- | --- | --- |
| D-01 | Brand: راه‌حل vs Rahhal (رحّال) transliteration mismatch | package name, domains, marks, contracts |
| D-02 | Tenant/workspace model: can one user represent many orgs/teams/reviewer roles? | every authz rule & query scope |
| D-03 | Is a solver *company* an org tenant, a `TeamKind`, or a distinct account model? | tenancy schema |
| D-04 | Reviewer identity visibility (to org / solver / other reviewers / ops) | projection & anonymity rules |
| D-05 | NDA semantics: does acceptance auto-grant access, or only satisfy one prerequisite? | access-control on protected fields/files |
| D-06 | Does the platform ever custody funds / escrow / split team payments? | payment licensing, ledger design |
| D-07 | Data residency & classification tiers | hosting, storage, backup, audit |
| D-08 | Static-export vs hybrid runtime for authenticated workspaces | whole deployment architecture |

## D. Architectural risks (technical)

| ID | Sev | Risk | Evidence | Treatment |
| --- | --- | --- | --- | --- |
| T-01 | **H** | **Monolithic payload**: catch-all statically imports every role experience → ~1.31 MB JS + ~503 KB CSS on most routes; 5 byte budgets fail. | 95 R-07; `app/[...slug]/page.tsx` | Route/role code-split; feature-CSS split out of 12k-line `globals.css`. |
| T-02 | **H** | **God modules**: `internal-routes.ts` 1,807 · `routes.ts` 1,647 · solver `commands.ts` 1,303 · `organization-workspace.tsx` ~1,542 lines. | `wc -l` (verified 2026-08-20) | Split by domain boundary behind typed query/command adapters. |
| T-03 | **M** | **React Compiler lint rules disabled** after Next 16 upgrade (latent hook/purity issues). | 95 R-13 | Re-enable one at a time with regression tests. |
| T-04 | **M** | **Non-deterministic install**: clean `npm ci` omitted Sharp/libvips on macOS ARM64; no pinned runtime. | 95 R-10 | Pin Node/npm; make optional deps deterministic in CI. |
| T-05 | **M** | **No CI/CD, env contract, or migration/rollback**; snapshot has no `.git`. | 95 R-09 | Phase 0 CI with all release gates. |
| T-06 | **M** | **Route generation includes fixtures**: static paths per demo entity risk accidental exposure and unbounded builds. | 95 R-14 | Generate only publishable/authorized projections. |

## E. What is genuinely strong (keep, don't rebuild)

Not everything is a problem — these are assets to preserve and build *on*:

1. **`domain/state-machines.ts`** — full transition tables with actor/preconditions/side-effects/notification/audit-code/retry. This is a near-complete server workflow spec. **Keep as canonical** (20 §4.2).
2. **`domain/solver.ts` + `lib/solver/repository/`** — a v3 aggregate with migrations, idempotency map, typed `MutationResult`, receipts, audit events, workspace isolation, cross-tab events. **This is the backend command-layer template** (20 §9).
3. **`decideTeamPermission`** — a real deny-by-default, policy-driven RBAC with human-readable reasons. **Keep as the authz test oracle** (70 §5).
4. **Negative-state vocabulary** — loading/empty/partial/error/offline/permission/locked/conflict/closed/success, plus non-enumerating not-found. **Rare and valuable; carry into API error contract.**
5. **Zero import cycles**, strict TS, and a large green test suite — a healthy base to refactor from.

## F. Decision log (ADR stubs to open)

Open one ADR per row; template in `95_RISKS_AND_OPEN_QUESTIONS.md` §10. Marked ✅ where this blueprint already sets a consistency default (still needs owner sign-off).

| ADR | Title | Default set here |
| --- | --- | --- |
| ADR-001 | Canonical lifecycle & vocabulary | ✅ 20 §4 |
| ADR-002 | Role namespaces & authz subject | ✅ 20 §3, 70 §2 |
| ADR-003 | `ApplicantType`/`TeamKind`/`ApplicantScope` taxonomy | ✅ 20 §5 |
| ADR-004 | COI as first-class record | ✅ 20 §4.3 |
| ADR-005 | Runtime model (hybrid Next + API) | ✅ D10 (needs owner) |
| ADR-006 | Postgres tenancy strategy (RLS vs app-scoped) | ✅ 50 §2 (needs owner) |
| ADR-007 | Object storage, scanning, retention | proposed 40 §6 |
| ADR-008 | Audit immutability & correlation | proposed 40 §5 |
| ADR-009 | Payment/ledger custody boundary | ⚠ D-06 open |
| ADR-010 | Identity provider & session architecture | proposed 40 §4 |
