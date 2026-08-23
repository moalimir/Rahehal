# Rahhal Agent Role Contracts

These opt-in prompt contracts specialize the workflow defined by `AGENTS.md`. They do not replace or repeat the always-on project rules. Select the smallest role that matches the task; combining every role into one prompt adds noise and blurs responsibility.

| Task shape                                              | Start with                   | Follow with                                      |
| ------------------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| New feature, architecture, schema, or multi-file change | `planner.md`                 | `implementer.md` → `tester.md` → `reviewer.md`   |
| Small, already-bounded implementation                   | `implementer.md`             | focused verification → `reviewer.md` if material |
| Reproducible defect                                     | `debugger.md`                | regression verification → `reviewer.md`          |
| Test design or missing coverage                         | `tester.md`                  | `reviewer.md` if tests reveal product changes    |
| Pre-merge assessment                                    | `reviewer.md`                | author fixes blockers                            |
| High-risk surface                                       | primary role + `security.md` | mandatory human review                           |

High-risk surfaces are auth/session, tenancy/RLS/access grants, migrations, public projections, confidential data, files, audit/outbox/idempotency, provider callbacks, payments, AI/model egress, and new production dependencies.

## Default prompt forms

Use these as reusable prompts in Codex, Claude Code, or another coding agent:

```text
Follow agent/planner.md. Produce an approval-ready plan for: <task>. Do not implement.
```

```text
Follow agent/implementer.md. Implement this approved plan: <plan>. Preserve unrelated worktree changes.
```

```text
Follow agent/debugger.md. Diagnose and fix: <reproduction/error>. Do not change code until reproduced.
```

```text
Follow agent/tester.md. Add evidence for: <requirement/invariant>. Test behavior, not implementation details.
```

```text
Follow agent/reviewer.md. Review <diff/branch/commit> against <plan/requirement>. Do not edit files.
```

```text
Follow agent/security.md. Security-review <diff/branch/commit> against project-documents/60_API_CONTRACT.md and project-documents/70_SECURITY_AND_AUTHZ.md. Do not edit files.
```

## Standard loop

**plan → implement with tests → verify → review → security pass when triggered → human release decision**.

Compress the loop for a tiny, low-risk change. Strengthen it for high-risk work. A role contract never grants permission to commit, push, deploy, change external services, rotate secrets, accept owner decisions, or broaden scope; those actions still require explicit user authorization.

Keep these contracts vendor-neutral. `AGENTS.md` is discovered automatically by Codex. `CLAUDE.md` imports the same guide for Claude Code. Reference one role file explicitly when you want its output contract.
