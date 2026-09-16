# Rahhal / راه‌حل — Consolidated Blueprint (v3.0)

**This folder is the authoritative product & backend blueprint.** It reconciles the prototype's three lifecycle vocabularies, three role models, and four solver-type enums into one coherent, implementation-ready design, and specifies the production backend. Four v1 reference docs (15 / 85 / 90 / 95) are retained in this folder as supporting detail; where they disagree on terms/states/roles/entities, **the consolidated set (00–80) wins**.

**Start with the active objective (2026-09-16):** [26_LEAN_MVP_SCOPE](26_LEAN_MVP_SCOPE.md), accepted under DEC-2026-018 in [25_DECISIONS](25_DECISIONS.md). MVP = Phase 3 baseline + owner publication + minimal final selection/match + connected organization/solver acceptance. The larger Phase 4 programme is deferred. Older broad lifecycle/reviewer descriptions are future design or dated evidence, not extra MVP requirements.

Read in order:

| #   | Document                                                          | Purpose                                                                                                       |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 00  | [00_OVERVIEW](00_OVERVIEW.md)                                     | Executive summary, **canonical decisions (D1–D15)**, verdict                                                  |
| 10  | [10_PRODUCT_VISION](10_PRODUCT_VISION.md)                         | Vision, narrative, product model across all roles × stages                                                    |
| 15  | [15_PRODUCT_REQUIREMENTS](15_PRODUCT_REQUIREMENTS.md)             | _(ref)_ FR/NFR requirement catalog, success measures, MVP acceptance criteria                                 |
| 20  | [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md)                       | **Single source of truth** — glossary, actors, entities, one lifecycle, one role & permission model           |
| 25  | [25_DECISIONS](25_DECISIONS.md)                                   | **Decisions register** — ADRs + P0 decision log (owners, status)                                              |
| 27  | [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md)         | **Production approval gate** — tenancy, IdP, residency, classification and provider inputs                    |
| 30  | [30_CONSISTENCY_AUDIT](30_CONSISTENCY_AUDIT.md)                   | Every contradiction (with `file:line`) + resolution + decision log                                            |
| 40  | [40_BACKEND_ARCHITECTURE](40_BACKEND_ARCHITECTURE.md)             | Modular monolith + workers, modules, runtime, tech choices                                                    |
| 42  | [42_FOUNDATION_HARDENING](42_FOUNDATION_HARDENING.md)             | **Robustness review** — cross-tenant access, consistency, concurrency, resilience, scaling, fitness functions |
| 45  | [45_AI_AND_MATCHING](45_AI_AND_MATCHING.md)                       | _(deferred)_ AI & matching, AI-ready stack additions, embeddings, guardrails                                  |
| 50  | [50_DATA_MODEL](50_DATA_MODEL.md)                                 | PostgreSQL DDL, tenancy, projections, migration mapping                                                       |
| 60  | [60_API_CONTRACT](60_API_CONTRACT.md)                             | API conventions, command/idempotency/error envelope, MVP endpoints                                            |
| 70  | [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md)                 | Unified authz decision model, permission matrix, threat model                                                 |
| 80  | [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md)                     | Phased roadmap, vertical slices, CI gates, definition of done                                                 |
| 82  | [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md)                   | **Phase-0 status** — done / remaining executable tasks / exit gates                                           |
| 84  | [84_PHASE3_CONNECTED_MVP_AUDIT](84_PHASE3_CONNECTED_MVP_AUDIT.md) | **Phase-3 connected MVP audit** — route inventory, frontend/backend synchronization, session and E2E gates    |
| 85  | [85_DEVELOPMENT_GUIDE](85_DEVELOPMENT_GUIDE.md)                   | _(ref)_ Setup, commands, conventions, backend-safe gateway pattern, CI pipeline, DoD                          |
| 90  | [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md)   | _(ref)_ Requirement → current evidence → status → phase matrix                                                |
| 95  | [95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md)     | _(ref)_ Risk register (R-01…R-16), P0 decisions, open questions, decision-log template                        |

**Start here:** [00_OVERVIEW §4 — Canonical decisions](00_OVERVIEW.md#4-canonical-decisions-locked-for-this-blueprint), then treat [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) as law for every schema column, API field, and permission rule.

## The one thing to know

The restored Phase 3 baseline has connected organization/solver flows and PostgreSQL authority. The active work closes the smaller _owner publication → proposal and clarification → final agreed match_ journey. The full browser prototype is broader than the implemented backend; neither demo screens nor deferred design are evidence of MVP completion. [26](26_LEAN_MVP_SCOPE.md) separates baseline capabilities, remaining work, and accepted bilateral matching and remaining detailed policies.
