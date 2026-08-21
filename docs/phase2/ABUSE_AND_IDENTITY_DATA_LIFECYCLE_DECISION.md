# Phase 2 Abuse Controls and Identity-Data Lifecycle Decision

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22.

**Decision date:** 2026-08-22

**Depends on:** [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md), [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md), [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md), and [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)

## Abuse-control baseline

The Phase 1 Redis-backed global rate limiter remains mandatory. Phase 2 adds endpoint-specific controls for authentication and identity abuse. All limits use Redis atomic operations, fail closed when the limiter is unavailable, use bounded keys, and avoid storing raw credentials or full email addresses.

| Operation | Limit and behavior | Failure behavior |
|---|---|---|
| Login initiation | 10 attempts per source IP in 15 minutes and 5 attempts per normalized account identifier in 15 minutes. | Controlled `AUTH_RATE_LIMITED`; no account-existence disclosure. |
| Failed authentication | Five failed provider/application authentication outcomes for one normalized identifier in 15 minutes trigger a 15-minute application step-up/lockout boundary. | Existing sessions remain subject to normal session policy; new login is denied with an enumeration-safe response. |
| MFA step-up | Five failed challenges per session/user/IP combination in 15 minutes, then session step-up is invalidated and a new provider authentication is required. | Controlled `MFA_RATE_LIMITED`; no raw challenge detail. |
| Invitation acceptance | 10 attempts per invitation fingerprint and source IP in one hour. | Invitation is temporarily blocked; token is not revealed. |
| Tenant switching | 20 switches per user/session in 10 minutes, with stricter limits for denied targets. | Controlled `TENANT_SWITCH_RATE_LIMITED`; no target-membership enumeration. |
| Session refresh | Bounded by session and provider token expiry; repeated refresh failures revoke the session and trigger a fresh login. | No infinite retry or token leakage. |
| Password/recovery operations | Delegated to Keycloak; application callbacks and initiation routes retain IP and identifier controls. | Provider-safe, enumeration-resistant errors. |
| Invitation creation and membership administration | Named policy, tenant scope, MFA for sensitive administration, and per-actor/tenant limits. | Controlled denial with audit event. |
| Audit queries and exports | Pagination ceilings, per-user/tenant throttles, and bounded filters. | Controlled limit response; no unrestricted bulk extraction. |

The exact numbers are configuration values with production upper bounds and are tested in the Windows runtime. Changing them requires an architecture/configuration review because the threat model requires IP and username controls and lockout after five failed attempts.

## Enumeration resistance

Unauthenticated login, recovery, invitation, and membership endpoints use the same public response class and equivalent timing behavior for unknown, disabled, suspended, and valid identifiers. Logs and audit events may distinguish the internal cause, but public responses do not reveal whether an email, provider subject, tenant, invitation, or membership exists.

The API does not accept a raw email as a tenant selector or identity-linking authority. Emails are normalized for controlled lookup, stored only where the account lifecycle permits, and never emitted as unbounded metric labels. External identity linking requires the authenticated provider subject and an explicit verified-link workflow; matching email addresses alone never links accounts.

## Identity-data classification and minimization

Identity and session data are classified by field, not as one undifferentiated object:

| Data | Classification and handling |
|---|---|
| Provider subject and session identifiers | Restricted security metadata; store only the minimum mapping/hash needed for authentication, never log or expose raw values. |
| Email address and verified status | Internal identity data; expose only to authorized self/profile or administration views; exclude from logs, metrics, and error responses. |
| Name, locale, timezone, avatar reference | Internal profile data; store only fields required by the product and provider mapping. |
| Membership role/scope and tenant relation | Confidential authorization data; tenant-scoped, RLS-protected, audited, and never trusted from the browser. |
| MFA/credential/recovery material | Keycloak-owned secret data; never stored by Mohamy Pro. |
| Invitation token | Restricted secret; store only a hash, short-lived, single-use, and never log or return it after issuance. |
| Audit/security event metadata | Confidential/security data; allowlisted, redacted, append-only, and retained according to the audit decision. |
| Session cookie and refresh token | Restricted secret; cookie is opaque/HttpOnly, refresh token is encrypted server-side, neither is logged or returned in API data. |

Identity APIs return allowlisted DTOs. They never serialize Prisma records or provider claims directly. Sensitive and legal-domain content is not included in identity logs, metrics, traces, or audit metadata.

## Residency boundary

The current Windows-Docker environment is a local development/verification deployment with no approved production region. It must not be represented as KSA, EU, or US residency evidence.

For Phase 2 implementation, each deployment has one explicit `RESIDENCY_REGION` and all tenants in that deployment share it. A User may have memberships only in tenants served by the same deployment/residency region. Cross-region memberships, cross-region identity replication, and cross-region session storage are rejected until a separate multi-region identity architecture is approved.

In an approved production deployment:

- PostgreSQL identity, membership, session, audit, and tenant records reside in the deployment’s approved region.
- Object storage, backups, workers, queues, and search for the tenant remain in that region.
- Keycloak realm data and provider session data are deployed in the same approved region or through a separately approved regional identity architecture.
- Cross-region transfer is prohibited unless an explicitly authorized Break Glass policy is evaluated, approved by Tenant Admin and Platform Admin, audited, and limited to the minimum data.
- External AI and integration processing follows the tenant’s approved region and data-classification policy; identity and privileged data are not sent to an external AI provider.

The local Windows setting may use a non-production development value such as `dev-local`; production startup rejects it. This is a development boundary, not a residency approval.

## Lifecycle and retention

Identity lifecycle is distinct from audit retention:

| Lifecycle event | Required data behavior |
|---|---|
| User invited | Store a hashed, single-use invitation with a 72-hour expiry; store only the minimum intended identity and membership data. |
| Invitation accepted/rejected/expired | Mark the invitation terminal, retain a redacted audit event, and remove or irreversibly invalidate the token hash according to the retention policy. |
| User suspended/disabled | Revoke sessions, deny new tenant context, retain the minimum identity and membership references needed for authorization/audit integrity. |
| User removed from a tenant | Remove active membership access; retain a historical membership state and audit event; do not delete legal-domain records owned by the tenant. |
| User requests profile deletion | Deactivate/anonymize nonessential profile data after authorization and legal review; retain immutable security/audit references required by the seven-year audit policy and legal holds. |
| User requests data export | Provide an authorized, tenant-scoped export of the user’s own permitted profile/membership data; never include secrets, other users’ data, provider tokens, audit data outside the allowed scope, or legal content without policy authorization. |
| Legal hold | Prevent deletion or anonymization of held records and audit events; record the hold owner, reason, scope, and release event. |
| Retention expiry | Purge only data whose retention and legal-hold checks permit deletion; purge is authorized, auditable, repeatable, and does not delete required referential audit identity. |

The Phase 2 `AuditEvent` and security-event retention default is seven years. Ordinary profile and session data is not automatically retained for seven years: it is minimized, revoked, anonymized, or purged when operational, legal, and referential requirements permit. No deletion operation uses a blanket cascade over audit or legal records.

## Abuse telemetry and response

Security metrics use bounded labels such as operation, result, reason, and provider outcome. They do not use email addresses, IP addresses, user IDs, tenant IDs, provider subjects, invitation fingerprints, or resource IDs as unbounded labels. Security events are written to the approved audit store; operational logs contain only redacted diagnostics and correlation IDs.

Potential credential stuffing, repeated tenant-switch denials, invitation abuse, MFA failures, and unusual export volume produce structured security events and bounded metrics. Alert routing and durable hosted retention remain under the Phase 1 deployment re-entry gate; Windows Docker verifies emission and fail-closed behavior but does not prove a supported production observability deployment.

## Required acceptance evidence

| Requirement | Required proof |
|---|---|
| Brute force | Real Redis-backed tests prove IP and normalized-identifier limits, five-failure lockout/step-up, expiry, reset, and fail-closed limiter behavior. |
| Enumeration | Unknown, disabled, suspended, valid, and cross-tenant identifiers produce controlled equivalent public responses. |
| MFA abuse | Failed step-up attempts are limited, invalidated, audited, and cannot be bypassed by a frontend flag. |
| Invitation abuse | Expired, reused, wrong-identity, revoked, cross-tenant, and high-volume acceptance attempts fail closed. |
| Switch abuse | Repeated denied and cross-tenant switches are limited, audited, and do not reveal membership existence. |
| Classification | Identity DTOs, logs, metrics, traces, audit metadata, and exports contain only allowlisted fields. |
| Lifecycle | Suspension, disablement, removal, profile minimization, export, deletion/anonymization, legal hold, and purge behavior match persisted state. |
| Residency | `RESIDENCY_REGION` is validated; cross-region membership/transfer is rejected in the single-region Phase 2 deployment model. |
| Retention | Seven-year audit/security retention, invitation expiry, session expiry, legal holds, and authorized purges are persisted and tested. |
| Runtime | Windows PostgreSQL/Redis tests execute the abuse controls against real services; no paid provider is required. |

## References

1. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
2. [`Phase 0 data classification`](../phase0/DATA_CLASSIFICATION.md)
3. [`Phase 0 data residency`](../phase0/DATA_RESIDENCY.md)
4. [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
5. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
6. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
7. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
8. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
9. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
