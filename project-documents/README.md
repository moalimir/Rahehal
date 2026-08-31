# Rahhal / راه‌حل — Consolidated Blueprint (v3.0)

**This folder is the authoritative product & backend blueprint.** It reconciles the prototype's three lifecycle vocabularies, three role models, and four solver-type enums into one coherent, implementation-ready design, and specifies the production backend. Four v1 reference docs (15 / 85 / 90 / 95) are retained in this folder as supporting detail; where they disagree on terms/states/roles/entities, **the consolidated set (00–80) wins**.

Read in order:

| #   | Document                                                        | Purpose                                                                                                       |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 00  | [00_OVERVIEW](00_OVERVIEW.md)                                   | Executive summary, **canonical decisions (D1–D15)**, verdict                                                  |
| 10  | [10_PRODUCT_VISION](10_PRODUCT_VISION.md)                       | Vision, narrative, product model across all roles × stages                                                    |
| 15  | [15_PRODUCT_REQUIREMENTS](15_PRODUCT_REQUIREMENTS.md)           | _(ref)_ FR/NFR requirement catalog, success measures, MVP acceptance criteria                                 |
| 20  | [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md)                     | **Single source of truth** — glossary, actors, entities, one lifecycle, one role & permission model           |
| 25  | [25_DECISIONS](25_DECISIONS.md)                                 | **Decisions register** — ADRs + P0 decision log (owners, status)                                              |
| 27  | [27_PHASE1_OWNER_APPROVALS](27_PHASE1_OWNER_APPROVALS.md)       | **Production approval gate** — tenancy, IdP, residency, classification and provider inputs                    |
| 30  | [30_CONSISTENCY_AUDIT](30_CONSISTENCY_AUDIT.md)                 | Every contradiction (with `file:line`) + resolution + decision log                                            |
| 40  | [40_BACKEND_ARCHITECTURE](40_BACKEND_ARCHITECTURE.md)           | Modular monolith + workers, modules, runtime, tech choices                                                    |
| 42  | [42_FOUNDATION_HARDENING](42_FOUNDATION_HARDENING.md)           | **Robustness review** — cross-tenant access, consistency, concurrency, resilience, scaling, fitness functions |
| 45  | [45_AI_AND_MATCHING](45_AI_AND_MATCHING.md)                     | _(deferred)_ AI & matching, AI-ready stack additions, embeddings, guardrails                                  |
| 50  | [50_DATA_MODEL](50_DATA_MODEL.md)                               | PostgreSQL DDL, tenancy, projections, migration mapping                                                       |
| 60  | [60_API_CONTRACT](60_API_CONTRACT.md)                           | API conventions, command/idempotency/error envelope, MVP endpoints                                            |
| 70  | [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md)               | Unified authz decision model, permission matrix, threat model                                                 |
| 80  | [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md)                   | Phased roadmap, vertical slices, CI gates, definition of done                                                 |
| 82  | [82_PHASE0_COMPLETION](82_PHASE0_COMPLETION.md)                 | **Phase-0 status** — done / remaining executable tasks / exit gates                                           |
| 83  | [83_UI_UX_AUDIT_PLAN](83_UI_UX_AUDIT_PLAN.md)                   | Frontend UI/UX audit — sequencing, review rubric, tooling decisions, findings backlog                         |
| 85  | [85_DEVELOPMENT_GUIDE](85_DEVELOPMENT_GUIDE.md)                 | _(ref)_ Setup, commands, conventions, backend-safe gateway pattern, CI pipeline, DoD                          |
| 90  | [90_REQUIREMENTS_TRACEABILITY](90_REQUIREMENTS_TRACEABILITY.md) | _(ref)_ Requirement → current evidence → status → phase matrix                                                |
| 95  | [95_RISKS_AND_OPEN_QUESTIONS](95_RISKS_AND_OPEN_QUESTIONS.md)   | _(ref)_ Risk register (R-01…R-16), P0 decisions, open questions, decision-log template                        |

**Start here:** [00_OVERVIEW §4 — Canonical decisions](00_OVERVIEW.md#4-canonical-decisions-locked-for-this-blueprint), then treat [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md) as law for every schema column, API field, and permission rule.

## The one thing to know

The prototype is an advanced, well-tested frontend that models the **entire** lifecycle in the browser — with **no server authority**. Its real defect isn't missing screens; it's that the same concept is modeled three incompatible ways across `domain/`. This set fixes that first (one vocabulary), then specifies the backend that makes **one vertical slice** — _publish challenge → locked proposal → COI review → reasoned decision_ — actually real, secure, and auditable.
