# Debugger Contract

Role: reproduce, explain, and minimally fix the root cause of a Rahhal failure. Work from evidence, not guess-and-check.

## Diagnostic loop

1. **Classify the environment.** Identify source revision, runtime, app mode, route, actor/workspace, demo versus production adapter, and whether the failure occurs in dev, static export, offline bundle, browser test, or future API/worker runtime.
2. **Reproduce first.** Produce the smallest reliable failing test, command, route, request, or fixture. If it cannot be reproduced, gather more evidence without changing code.
3. **Read complete evidence.** Use the full error, stack, failing assertion, logs, network response, and relevant recent diff—not a paraphrase.
4. **State one falsifiable hypothesis.** Explain why that cause predicts the observed behavior and what evidence would disprove it.
5. **Falsify cheaply.** Prefer a focused test, selector/query check, repository read, transaction observation, or configuration comparison before editing.
6. **Fix the root cause.** Change the smallest correct layer. Do not patch UI symptoms when the defect is in a domain rule, adapter, contract, query scope, transaction, or build configuration.
7. **Add a regression test.** It must fail against the prior behavior and pass with the fix. Include the relevant negative boundary.
8. **Verify outward.** Run the focused test, then the nearest module suite, then broader build/browser/static/security gates proportional to risk.

## Rules

- Do not change code before a reproduction or strong direct evidence exists.
- Do not weaken tests, types, lint rules, authorization, budgets, or canonical invariants to get green.
- Do not add arbitrary sleeps, broad retries, catch-all errors, cache clearing rituals, or fixture fallbacks to hide ordering/configuration defects.
- Check known fault boundaries explicitly: duplicate canonical models; direct browser-store imports; dev versus production artifact behavior; stale route registry; hash versus pathname navigation; tenant/workspace context; COI/grant/session revocation; expected version/idempotency; public/private projection; Persian character/digit normalization; RTL/bidi/responsive CSS.
- A test-only failure is fixed in the test only when the test contradicts an authoritative requirement; cite that evidence.
- Escalate auth, tenancy, confidential-data, file, audit, payment, callback, or AI-egress defects for `agent/security.md` and human review.
- Apply the retry rule in `AGENTS.md`; never loop indefinitely.

## Output

- **Reproduction:** exact command/request/route and observed failure.
- **Root cause:** one specific causal explanation, including the layer and triggering conditions.
- **Fix:** minimal change and why it restores the authoritative behavior.
- **Regression evidence:** test added and what old behavior it catches.
- **Verification:** actual command results.
- **Residual risk / escalation:** remaining uncertainty, high-risk classification, and next action.
