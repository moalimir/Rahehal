# Security Policy

Rahhal / راه‌حل handles confidential organizational challenges, solver IP,
identity evidence, contracts, and (later) payments. Security reports are taken
seriously and prioritized.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

- Email **security@rahhal.example** (⚠ placeholder — replace with the real monitored address).
- Include: affected area, reproduction steps, impact, and any PoC.
- Encrypt sensitive details if possible (PGP key to be published by the security owner).

We aim to acknowledge within **2 business days** (Asia/Tehran) and to agree a
remediation timeline based on severity. Please allow coordinated disclosure
before any public write-up.

## Scope

In scope: this repository, the API/worker workspaces, authorization, tenant &
cross-tenant access (`access_grant`), file handling, audit integrity, and payment
gates. Out of scope during the prototype phase: the mock/demo browser stores —
these are **known** to be non-authoritative (see R-01) and are being replaced by
server authority in Phase 1.

## Current security posture (must be understood before use)

This repository is a **prototype with an in-memory backend walking skeleton**.
The initial API proves scoped session/workspace/challenge behavior, but its demo
tokens, repositories, audit, and outbox are not durable or production authority;
the rest of the lifecycle is still simulated in the browser (R-01). Do not place
real credentials, identity documents, confidential briefs, proposals, contracts,
or payment data in it. Production security exists only after the managed OIDC,
PostgreSQL/RLS, durable audit/outbox, provider, and Phase-1 exit gates pass — see
[project-documents/70_SECURITY_AND_AUTHZ.md](project-documents/70_SECURITY_AND_AUTHZ.md).

## Handling & standards

- Server-side deny-by-default authorization; tenant + `access_grant` scoping (70 §2–3).
- OWASP-aligned controls, secrets never in the repo, dependency/security scanning in CI.
- Data classification (`public/internal/confidential/highly_sensitive`) gates access,
  files, and any future AI egress (DEC-2026-005, 45 §8).
- Append-only, independent audit (40 §5, 70 §7).

## Supported versions

Only the `main` branch is supported during the pilot build-out. Security fixes
are applied to `main`; there is no back-port channel yet.
