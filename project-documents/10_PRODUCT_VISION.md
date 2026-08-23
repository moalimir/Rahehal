# Product Vision & Narrative

**Uses the canonical terms and lifecycle from [20_CANONICAL_MODEL](20_CANONICAL_MODEL.md).** Nothing here invents an actor, state, or entity that isn't defined there.

---

## 1. Vision

**Rahhal / راه‌حل turns an organization's real operational problem into one continuous, trustworthy, auditable case — from the first framing of the problem to the measured impact of the solution.**

Most "innovation platforms" are directories: they list challenges, collect submissions, and stop. The value evaporates at the exact moments that decide whether innovation actually happens — comparing proposals fairly, protecting a solver's background IP, declaring a reviewer's conflict, tying a payment to a real acceptance, and proving afterward that the outcome was worth it.

Rahhal's bet is the opposite: **the case is the product.** A single spine of record follows the work through eleven stages, and at every sensitive step there is an **owner, a prerequisite, a version, a reason, a receipt, a next action, and an audit record.** That continuity is what earns the trust of a risk-averse organization, a skeptical expert, and an operations team that has to stand behind every decision.

### One-line positioning

> For organizations that need outside expertise on problems they can't fully specify, Rahhal is the *governed* open-innovation workspace where a problem becomes a published challenge, competing proposals are reviewed without conflict or leakage, and the winning work is contracted, piloted, paid, and measured — all on one auditable record.

## 2. Why now / why this is hard (the moat)

The lifecycle crosses four trust boundaries that generic tools (a form builder, a project tracker, a marketplace) each get wrong:

1. **Disclosure control** — an organization must reveal enough to attract good solutions but not leak confidential operations. Rahhal separates **public projection** from **private aggregate** at the data layer, and binds NDA + classification to field/document access.
2. **Fair evaluation** — comparing proposals demands versioned rubrics, conflict-of-interest gates, and immutable reviews. Rahhal makes COI a first-class, server-enforced record *before* any protected content is seen.
3. **IP & contracting** — background/foreground/sideground IP, license vs transfer, joint ownership. Rahhal carries IP terms as versioned schedules from challenge → proposal declaration → contract, so what was promised is what is signed.
4. **Money tied to acceptance** — payment only after an *effective contract*, a *technical acceptance*, and a *separate financial approval*, with idempotent provider handling and reconciliation.

Any one of these is a feature. **Doing all four on one correlated record, in Persian/RTL, with immutable audit** is the defensible product.

## 3. Who it serves (canonical parties → value)

| Party | The job they hire Rahhal for | The moment of trust Rahhal must nail |
| --- | --- | --- |
| **Organization** | "Turn a messy operational problem into vetted external solutions I can defend to my board." | Publishing a locked, approved brief; recording a *reasoned* decision that survives audit. |
| **Individual / Team solver** | "Find opportunities I'm actually eligible for, and compete without losing my IP." | Eligibility that explains itself; a submitted version that is provably immutable; payment that arrives. |
| **Reviewer** | "Evaluate independently and be protected from conflict." | Declaring COI *before* seeing protected material; a submitted score that can't be silently altered. |
| **Operations** | "Keep the pipeline moving and defensible." | Queues with SLA/reason/next-action; separation of duties; being able to invalidate a review *only* through an audited path. |
| **Finance / Legal** | "Never approve money or terms out of order." | Three independent gates; effective versions; provider-backed signature. |

## 4. The product model — every role across every stage

This is the matrix the UI, API, and permissions all derive from. Rows are canonical lifecycle stages; cells name the *primary* action each party takes. (Authoritative permission matrix: [70_SECURITY_AND_AUTHZ](70_SECURITY_AND_AUTHZ.md) §4.)

| Stage | Organization | Solver / Team | Reviewer | Operations | Finance / Legal |
| --- | --- | --- | --- | --- | --- |
| **draft** | Author brief (autosave, resumable) | — | — | — | — |
| **triage** | Request screening | — | — | Screen brief quality/fit | — |
| **formulation** | Sharpen problem, success criteria, scope, IP terms | — | — | Advise on readiness | — |
| **approvals** | Route to approvers | — | — | Publication quality gate | Technical/legal/finance sign-off (each versioned) |
| **published** | Lock version; optionally send direct offers | Discover, check eligibility, save opportunity | — | Monitor abuse/spam | — |
| **evaluating** | Screen eligibility, request clarification, shortlist, assign reviewers | Submit locked proposal version; respond to clarification | Accept assignment → **declare COI** → score rubric → submit | Manage reviewer workload; escalate conflicts | — |
| **decided** | Record reasoned decision / no-award; notify | Receive decision + feedback | (review locked) | Audit decision correlation | — |
| **contracting** | Negotiate contract & IP schedule | Negotiate; sign | — | — | Approve legal + finance gates; provider signature |
| **pilot** | Run plan; accept/revise/reject deliverables | Execute milestones; submit deliverables | — | Dispute handling | Trigger payment on technical acceptance |
| **impact** | Record baseline/target/actual + validation | Provide evidence | — | Verify measurement integrity | Reconcile payments |
| **closed** | Collect feedback; seal evidence; consent to case study | One-time structured feedback | — | Retention/close-out | Final reconciliation |

## 5. Signature product principles

1. **Continuity over screens.** Progress is measured in *authoritative aggregates*, not pages. A stage is "real" only when its data, permissions, failure behavior, audit, and operations are server-enforced.
2. **Readiness is explicit.** A challenge and a proposal each have a shared, testable readiness contract *before* publication/submission — the same rule for draft, preview, and submit.
3. **Eligibility ≠ quality.** Whether you *may* apply (type, verification, deadline, NDA) is separated from how *good* the proposal is. Eligibility explains itself with reasons and next actions.
4. **Nothing sensitive without an owner, reason, version, and receipt.** Enforced by the command contract (`MutationReceipt`), not convention.
5. **Immutable by default.** Submitted proposals, submitted reviews, published challenge versions, and audit events are append-only. Change means a new version.
6. **Fail safe, fail legible.** Unknown/closed/removed records resolve to explicit safe states (loading/empty/partial/error/offline/permission/locked/conflict/closed) — never to a look-alike sample. This prototype's negative-state vocabulary is a genuine differentiator; keep it.
7. **Persian/RTL is first-class**, not a translation layer — bidi isolation for codes/emails/amounts; explicit Tehran time, Jalali dates where appropriate, and unambiguous currency.

## 6. Non-goals (first production release)

- Not an autonomous AI decision-maker. Matching may *assist*; humans own eligibility exceptions, review, and selection.
- Not a general PM tool or social network.
- Not unrestricted public file sharing; no public access to confidential case material.
- Not a bank/escrow/payroll/tax platform unless separately licensed (D-06).
- Not automated legal advice; template IP/contract clauses need qualified local review.
- Not a multi-country launch before currency, identity, tax, privacy, and legal are designed per market.

## 7. North-star & guardrail metrics

**North star (proposed, needs baseline):** *number of cases that reach an accepted outcome with reconciled payment and recorded impact* — the only metric that captures the full promise. Everything upstream (published challenges, eligible proposals, completed reviews) is a leading indicator.

**Funnel metrics** (denominators to be approved — `15_PRODUCT_REQUIREMENTS` §9): intake→readiness→publish; eligible solvers/challenge→qualified proposals; COI clearance & review completion before SLA; proposal-close→reasoned decision; contract cycle→pilot start→acceptance→payment/reconciliation.

**Guardrails (equally weighted, to prevent gaming volume):** unauthorized-access attempts blocked, audit completeness, verification false-positive/negative rate, solver-trust (repeat participation, feedback-to-non-selected SLA met), p75 LCP/INP/CLS on Persian-market mobile.

## 8. The strategic sequence

The prototype already *shows* all eleven stages. The vision is realized not by adding stages but by making **one thin vertical slice authoritative**, then widening:

> **Slice 1 (MVP):** publish challenge → eligible proposal (locked version) → COI + rubric review → reasoned decision → durable audit.
> **Slice 2:** contract → pilot → deliverable acceptance → gated payment → reconciliation.
> **Slice 3:** impact measurement, disputes, case-study consent, and scale.

Depth first, breadth second — see [80_DELIVERY_ROADMAP](80_DELIVERY_ROADMAP.md).
