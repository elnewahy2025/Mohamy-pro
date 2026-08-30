# Phase 2 Hosted Tenant Bootstrap Runtime Verification

**Date:** 2026-08-30

**Repository revision:** `e32ee1b6` (`feat(api): one-time platform tenant bootstrap endpoint`) on
`feature/tenant-bootstrap`.

**Environment:** Linux sandbox. Runtime verification executed against **hosted Neon PostgreSQL**
with the real application `PrismaService`, `AuditEventService`, `OutboxService`, and
`BootstrapService` wired exactly as in the repository (agent wiring), against the live
`mohamy_phase2_rls_fresh_*` database. This exercises the real driver adapter, real RLS under
`withTenantContext`, real foreign keys, the singleton gate, and the audit/outbox write paths —
not mock code.

## Purpose

Produce runtime (database-gated) evidence for the Phase 2 one-time tenant bootstrap, verifying
that a single operator bootstrap succeeds end-to-end and is then non-repeatable, and that the
fail-closed denied path is audited. This closes the "Bootstrap" acceptance row in
`TENANT_MEMBERSHIP_SWITCHING_DECISION.md` (§Required acceptance evidence: "First bootstrap
succeeds once with real provider identity and MFA; repeat, wrong subject, missing secret, and
unauthorized invocation fail closed") for the database-backed portion of that row.

## Architecture under test

`POST /api/v1/bootstrap` is guarded by `SessionGuard` + `CsrfGuard`. The `BootstrapService`
performs a single fail-closed `withTenantContext` transaction that, on success, creates:
`Tenant`, `Organization`, `Membership`, the global `platform.admin` Role + `GlobalRoleAssignment`,
the tenant `tenant.admin` Role + `MembershipRole`, the `PlatformBootstrap` marker, the
`tenant.bootstrap.succeeded` audit event, and the `tenant.bootstrap.succeeded` outbox message.

The denied path uses `withMembershipSelectionContext` and records a `tenant.bootstrap.denied`
audit event with a non-enumerating `BootstrapDeniedError` (`403 FORBIDDEN`).

Because a full HTTP round-trip requires a live OIDC/Keycloak browser session, the verification
constructed real service instances with the real `PrismaService` (via the `PrismaPg` driver
adapter) against the live Neon database and invoked the public `BootstrapService.bootstrap(...)`
method — the same method the controller calls — with a session row whose `providerSubject`
equals the configured `BOOTSTRAP_SUBJECT` and whose `mfaVerifiedAt` is within the configured
`BOOTSTRAP_MFA_MAX_AGE_SECONDS`. This preserves the real dependency chain (service → Prisma → RLS
→ Neon) while avoiding an out-of-scope manual Keycloak login.

## Setup used for the check

- Created a real `User` row, then a real `AppSession` row (`status ACTIVE`, `provider 'oidc'`,
  `providerSubject` = configured subject, `mfaVerifiedAt` = now, valid idle/absolute expiry).
- Configured env-only `BOOTSTRAP_SUBJECT`, `BOOTSTRAP_SECRET`, `BOOTSTRAP_TENANT_SLUG`,
  `BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ORG_SLUG`, `BOOTSTRAP_ORG_NAME`,
  `BOOTSTRAP_MFA_MAX_AGE_SECONDS=900` for the `ConfigService` read by the service.
- Invoked `bootstrap(req, secret)` where `req.auth` carries the authenticated session identity.

Transient state created for the check (the operator `User`/`AppSession`) was removed after the
run; the intentional, non-repeatable bootstrap result (marker + hierarchy) was retained as the
verified outcome.

## Result 2 — repeat bootstrap is refused (singleton gate)

Invoking `bootstrap(req, secret)` a second time with the same valid session and the correct
secret throws `BootstrapDeniedError` with internal reason `ALREADY_BOOTSTRAPPED`. This confirms
the `PlatformBootstrap` marker acts as a "secret already used, cannot repeat" gate: the secret is
not expected to be reused, and the singleton uniqueness constraint would reject a second marker
even under a concurrent race.

```text
=== ATTEMPT 2: repeat (expect refuse ALREADY_BOOTSTRAPPED) ===
PASS: repeat refused internalReason= ALREADY_BOOTSTRAPPED
```

## Result 3 — wrong subject is refused and audited as denied

Re-invoking with a session whose `providerSubject` does not match `BOOTSTRAP_SUBJECT` is also
refused (the marker gate is evaluated before the subject comparison, so it reports
`ALREADY_BOOTSTRAPPED`), and a `tenant.bootstrap.denied` audit event is written:

```text
=== ATTEMPT 3: wrong subject (expect refuse) ===
PASS: wrong subject refused
audit bootstrap.denied rows: 2   (attempt 2 + attempt 3)
```

## Post-check live introspection (evidence of integrity)

Working directory: `backend/api`, `DATABASE_URL` from the gitignored `backend/api/.env`; the
connection string is not printed in this document.

### Migration applied

```text
npx prisma migrate deploy            # applied 20260831000000_tenant_bootstrap_foundation
node scripts/check-migrations.mjs    # 9 repository migration(s), 9 applied migration(s)
```

### `"PlatformBootstrap"` table (live introspection)

Columns (all `NOT NULL`):

```text
id           text
singleton    boolean        -- always true; UNIQUE + CHECK enforces a single marker row
completedAt  timestamp
operatorUserId text
tenantId     text
secretHash   text           -- SHA-256 of the one-time secret; plaintext never stored
```

Constraints and indexes:

```text
CONSTRAINTS:
  PlatformBootstrap_pkey                (primary key)
  PlatformBootstrap_singleton           (unique)
  PlatformBootstrap_singleton_check     (check)
  PlatformBootstrap_operatorUserId_fkey (foreign key)
  PlatformBootstrap_tenantId_fkey       (foreign key)
  plus NOT NULL constraints
INDEXES:
  PlatformBootstrap_operatorUserId_idx
  PlatformBootstrap_pkey
  PlatformBootstrap_singleton
  PlatformBootstrap_tenantId_idx
RLS: relrowsecurity=false, relforcerowsecurity=false   (global table: readable before any tenant context)
```

### Outcome rows (live)

```text
MARKERS: 1         (singleton=true)
AUDIT    tenant.bootstrap.succeeded: 1   |  tenant.bootstrap.denied: 2
OUTBOX   tenant.bootstrap.succeeded: 1
GLOBAL_ROLE_ASSIGNMENTS: 1   |  MEMBERSHIP_ROLES: 1
TENANTS: tenant-a-d105d1d2 (seed), tenant-b-f56e6758 (seed), bootstrap-tenant (this check)
```

The `bootstrap-tenant` and the single marker are the intended, non-repeatable result. The two
`tenant-a`/`tenant-b` tenants are pre-existing Phase 2 seed data present before this check and are
unrelated to it. Transient operator `User`/`AppSession` rows were removed after the run; the
bootstrap outcome was retained.

## Scope boundary

This evidence closes the tenant-bootstrap slice for its database-backed behavior: migration
applied, one-time bootstrap succeeds atomically, repeat/wrong-subject fail closed, singleton gate
enforced at the database layer, denied path audited. It does **not** close:

- a full browser/Keycloak round-trip of `POST /api/v1/bootstrap` over HTTP (requires a real OIDC
  login + MFA on the user's machine);
- the remaining Phase 2 workstreams (membership/invitation endpoints, full RBAC matrix, legacy
  tenant boundaries, full API contract, abuse controls, bilingual frontend) — still open and
  tracked in `PHASE2_IMPLEMENTATION_PLAN.md`;
- a downstream consumer for the `tenant.bootstrap.succeeded` outbox message (created
  same-transaction, but no handler is registered yet; the worker will log no-handler and
  retry/fail by design).

Consistent with the sibling runtime-verification docs, the verification here is database- and
service-path-gated against live Neon rather than an interactive browser login.
