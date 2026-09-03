# Phase 9 Core Delivery Review: Legal Configuration (Country / Jurisdiction / Court / Court Location)

**Delivery Date:** 2026-09-03
**Delivery Hash:** `fcb366cc` (implementation), `47e48a59` (plan + walkthrough), `04b0f51c` (isolation & governance fixes)

## What Was Delivered

The **Legal Configuration** foundational core has been delivered, establishing the dictionary and
configuration tables for internationalized legal operations. This delivery decouples countries,
jurisdictions, and courts from hardcoded lists so the platform can support multiple legal systems
while letting tenants maintain their own custom courts and branches.

1. **Hybrid Tenancy Primitives (Schema & Migration):**
   - `Country`, `Jurisdiction`, `Court`, and `CourtLocation` schemas added.
   - `20260904150000_phase9_legal_config` additive migration created.
   - **Hybrid tenancy model:** `tenantId` is nullable — `NULL` denotes a global dictionary entry
     (system-wide), while a concrete `tenantId` scopes the row to that tenant.
   - Tenant isolation enforced at the database: `FORCE ROW LEVEL SECURITY` + hybrid policies on
     `Country` / `Jurisdiction` / `Court` / `CourtLocation` (global rows `tenantId IS NULL` or
     own-tenant rows are visible; tenant-scoped writes must match the active `app.tenant_id`).
   - Permission seeds added for `CanManageLegalConfig` and `CanManageGlobalLegalConfig`.

2. **Permissions & Audit:**
   - `CanManageLegalConfig` (Tenant Admin) governs tenant-specific legal configuration
     (tenants adding their own jurisdiction / court / court-location rows).
   - `CanManageGlobalLegalConfig` (Platform Admin) governs global reference data writes
     (e.g. the shared `Country` dictionary), preventing any individual tenant from mutating
     system-wide rows.
   - `country.*`, `jurisdiction.*`, `court.*`, `court.location.*` events registered across the
     audit constants maps and the `METADATA_ALLOWLIST`; the completeness guard passes via
     `jest audit`.

3. **Legal Config API (`legal-config` module):**
   - Separation of concerns enforced with `LegalConfigOperations` handling shared RLS context,
     `assertPermission` capability checks, and audit writes.
   - `legal-config.service.ts` implements `list*` / `create*` logic and enforces
     `hybridReadWhere(ctx)` for reads and RLS-bounded writes.
   - `legal-config.controller.ts` exposes REST endpoints (`/legal-config/countries`,
     `/legal-config/jurisdictions`, `/legal-config/courts`, `/legal-config/court-locations`),
     protected by `SessionGuard` + `CsrfGuard`.

4. **Cross-Tenant Integrity (Governance Fix):**
   - `LegalConfigOperations.requireParentVisible()` validates that a referenced parent
     (country / jurisdiction / court) is either global or owned by the active tenant before a
     tenant-specific child (jurisdiction / court / court-location) is attached. This prevents a
     tenant from attaching their configuration to another tenant's private record.

5. **QA Gates:**
   - `tsc --noEmit` exited with code 0.
   - `prisma validate` passed cleanly; the migration's structural DDL matches Prisma's generated
     output (RLS additions are additive and independent of structure).
   - `jest` passed for the `legal-config` module (9/9 tests) and the full suite is 51/52 suites /
     263 tests with zero failures.
     *(Note: one pre-existing ESM configuration error for the older `auth/oidc/` module is
     tracked separately and is unrelated to Phase 9.)*
   - Changed files are Prettier-clean.

## Explicit Deferrals (Recorded, Not Silent)

As bounded in the Phase 9 plan, the following are deferred:

1. **Update / Archive / Delete lifecycle:** The current delivery is create + list (`*_UPDATED` and
   `*_ARCHIVED` audit events are registered for forward compatibility). Full
   update / archive / delete endpoints are deferred to a follow-up.
2. **Status-based filtering / pagination on read endpoints:** Not yet exposed; deferred.
3. **Frontend UI:** Deferred. Backend-first API delivery mirroring previous phases.
4. **Global seeding of the country/jurisdiction/court dictionaries:** The schema and policies
   support global rows, but a scripted seed of reference data is deferred.

## Next Steps

Phase 9 is sealed and ready for owner review. Once approved, the project can proceed to
**Phase 10**: the legal-config reference data can be consumed by later phases (e.g. matter /
case filings referencing courts and jurisdictions) and by the frontend configuration UI.

## Owner Approval

- [ ] **Approved** — Phase 9 (Legal Configuration) core delivery is accepted. Phase 10 may begin
  after the forced-phase gate is satisfied.

## Follow-up (Recorded, Not Silent)

- [x] Stray artifacts removed (`phase9.sql`, `prisma/phase9.sql`, `user-phase6.patch`).
- [x] RLS `FORCE` + hybrid-tenancy policies added to the migration (was a plain table-only migration).
- [x] `CanManageGlobalLegalConfig` (Platform Admin) added so global `Country` writes are not an
      ordinary tenant-admin capability.
- [x] Cross-tenant parent-attach checks added via `requireParentVisible`.
- [x] Prisma client regenerated so the repo compiles as-pulled.
