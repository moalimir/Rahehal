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
cross-tenant access (`access_grant` and the narrow ADR-0015 platform authority),
file handling, audit integrity, and payment gates. The mock/demo browser stores
remain non-authoritative and are out of scope as production controls.

## Current security posture (must be understood before use)

This repository is a **local MVP prototype, not a production system**. PostgreSQL
mode now provides a server-authoritative challenge path through lifecycle gates,
version-specific approvals, and eligibility-rule snapshots; demo mode and the
remaining browser-only flows are still non-authoritative. The local Dex identity,
application-only tenant scoping, and demo worker are development evidence, not
production controls. Do not place real credentials, identity documents,
confidential briefs, proposals, contracts, or payment data in it. Production use
requires the managed OIDC, RLS, durable audit/outbox, private-file, recovery, and
pre-pilot hardening gates — see
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
