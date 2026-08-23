# Phase-1 owner approval packet

This packet is the release gate for production infrastructure and managed identity. Engineering defaults are intentionally explicit, but **no row is approved merely because code or documentation exists**. The named human owner must record approver identity, date, scope, and any conditions in the table below before provider resources or production credentials are created.

## Approval register

| Decision                         | Proposed default                                                                                                                                                                                                                                                 | Required owner                     | Status                   | Evidence to record                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Tenancy boundary                 | DEC-2026-011: `organization` / `solver` / `platform` tenants; one owning tenant per protected row; multi-tenant memberships; cross-tenant reach only by `access_grant`                                                                                           | Product + Security                 | `pending-owner-sign-off` | approver, date, accepted tenant diagram, exceptions                               |
| Applicant eligibility projection | DEC-2026-010: detailed `allowedApplicantTypes` authoritative; `ApplicantScope` derived                                                                                                                                                                           | Product                            | `pending-owner-sign-off` | approver, date, accepted rule/examples                                            |
| Identity provider                | Managed OIDC supporting authorization code + PKCE, issuer/audience validation, verified email/mobile claims, MFA/step-up, key rotation, revocation and an approved pilot-region deployment                                                                       | Security + Platform + Product      | `provider-unselected`    | provider/tenant, issuer, region, DPA/SLA, MFA and revocation evidence             |
| Residency                        | Iran-pilot data remains in one specifically named approved region; backups, logs, object storage, queues, IdP metadata and support access obey the same boundary unless an exception is approved                                                                 | Legal/Privacy + Security           | `pending-owner-sign-off` | country/region/provider, subprocessors, backup/DR locations, support-access terms |
| Classification                   | `public`, `internal`, `confidential`, `highly_sensitive`; public projections default public, operational metadata internal, proposals/brief internals confidential, identity/contract/payment evidence highly sensitive; lowering requires ops approval + reason | Legal/Privacy + Security + Product | `pending-owner-sign-off` | tier matrix, retention, encryption/key ownership, downgrade/egress rules          |

## Provider inputs required before P1-F2/P1-F3

The implementation must not guess these values:

1. Cloud/hosting provider and exact region for dev, test, preview, staging and production.
2. IaC tool/provider account structure, state backend and production break-glass owner.
3. Secret manager/KMS, key-residency boundary and credential-rotation owner.
4. Managed OIDC provider, issuer URL/tenant, approved redirect domains, client-registration model and MFA policy.
5. Environment domains, DNS owner, artifact/container registry and deployment approval path.
6. Approved data subprocessors, log/backup retention, RTO/RPO, and whether preview may use synthetic data only (recommended: yes).

## Approval rule

An approval changes a row to `accepted`, records the human approver and ISO date, and links the supporting legal/security/provider evidence. A chat instruction to “use the defaults” is sufficient only when the sender is the named accountable owner and explicitly identifies the decisions being accepted. Provider secrets, tokens and private keys never belong in this document or the repository.
