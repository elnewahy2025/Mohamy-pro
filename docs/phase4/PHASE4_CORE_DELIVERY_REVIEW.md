# Phase 4 — Organization Configuration (Core Delivery)

> **Status:** IN REVIEW — first Phase 4 delivery (core settings engine + hierarchy CRUD).
> **Performed against:** local `main` at `f3b48b4e` (Phase 3 gate approved). **Not committed / not pushed** (owner instruction).
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `tsc --noEmit` 0 errors · full jest 218/218 pass (40/41 suites; 1 = pre-existing `openid-client` ESM blocker) · prettier clean.

---

## Scope delivered (per owner's scoping decision)

The Plan.txt Phase 4 (Organization Configuration + Platform Administration) lists ~18 domains. Per the owner-selected scope, this delivery covers:

1. **Core settings engine** — a tenant-scoped, code-free-extensible key/value configuration store.
2. **Foundation hierarchy CRUD** — `Organization`, `Branch`, `Department`, `Team` (models already existed in schema with RLS; this delivery adds the guarded CRUD APIs).

The remaining Phase 4 domains (Practice Areas, Case Types, Case Statuses, Party Roles, Court Types, Document Types, Task Types, Fee Types, Currencies, Numbering, Notification Preferences, Branding/Localization, feature flags, subscription, usage metering, Platform Administration) are **explicitly deferred** to follow-up deliveries. The settings engine is the substrate they will populate without further schema churn for simple catalog/lookup entries.

---

## What was built

### New tenant-scoped table + RLS migration
- `OrganizationSetting` model (`prisma/schema.prisma`) with `@@unique([tenantId, key])`, versioned, JSON `value`, `updatedByMembershipId`, status.
- Hand-authored additive migration `prisma/migrations/20260902120000_organization_settings_engine/migration.sql` following the codebase conventions:
  - **TEXT ids / TEXT tenant FK** (matches the established `Tenant/Organization/Branch/...` convention, NOT native uuid).
  - `ON DELETE RESTRICT ON UPDATE CASCADE` FK to `Tenant`, constraint name `OrganizationSetting_tenantId_fkey`.
  - **FORCE RLS** + `OrganizationSetting_tenant_isolation` policy using `public.app_tenant_context_is_valid()` — identical to the org-hierarchy tables.
  - Idempotent seed of the `CanManageOrganizationConfig` permission row (matches `rbac_permission_catalog` / `tenant_switch_policy` pattern).

### New permission + role wiring
- `PERMISSION_KEYS.CAN_MANAGE_ORGANIZATION_CONFIG` added to `permission.constants.ts` (constant + catalog description).
- Granted to `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]` so the tenant admin role can administer config. Runtime backfill handled by the existing `reconcileBuiltInRoles` + `ensurePermissionId`.

### Audit contract compliance (PHASE4_AUDIT_CONTRACT.md)
Every domain mutation **must**: (1) declare a constant event type, (2) register it in `METADATA_ALLOWLIST`, (3) emit transactionally via `AuditEventService.write(..., transaction)`.

Implemented in `audit-constants.ts` + `audit-event.service.ts`:
- New event types (each with version/category/default-outcome + allowlist entry):
  - `organization.setting.set` (allowlist: `key`, `version`)
  - `organization.created`/`updated`/`archived` (created/archived allow `slug`/`reason`)
  - `branch.*`, `department.*`, `team.*` (same shape)
- All writes pass the active `Prisma.TransactionClient` so the outbox/audit row is atomically committed with the domain change (fail-closed if a metadata key is unregistered).

### Services + controllers (single-responsibility per file)
`src/organization-config/`:
- `settings/settings.service.ts` + `settings.controller.ts` + `settings.dto.ts` + `settings.service.spec.ts`
- `hierarchy/hierarchy.operations.ts` — shared, cohesive helper owning the guard→permission→tenant-transaction→audit mechanics (avoids 4× duplication).
- `hierarchy/organization.{service,controller,dto}` + `.spec.ts`
- `hierarchy/branch.{service,controller,dto}`
- `hierarchy/department.{service,controller,dto}`
- `hierarchy/team.{service,controller,dto}`
- `organization-config.errors.ts` (non-enumerating `FORBIDDEN` denial)
- `organization-config.module.ts` (wired into `app.module.ts`; relies on global `Database/Audit/Permissions` modules)

### Tenant isolation + authorization per operation
- Every method resolves `request.auth`, requires `activeTenantId`, asserts `CanManageOrganizationConfig` via `PermissionsService.assertTenantPermission` (membership-ACTIVE + role↔permission graph), then runs inside `prisma.withTenantContext(...)` so RLS bounds all reads/writes to the active tenant.
- Controllers decorated with `@UseGuards(SessionGuard, CsrfGuard)` (session auth + per-session CSRF + Origin check).
- Parent-of-child checks (branch under org, department under branch) are done **inside the same transaction** to keep them atomic and deny cross-tenant references.

---

## Verification (evidence)

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0 errors** |
| `prisma validate` | schema valid |
| Full jest | **218 passed / 218**, 40 of 41 suites |
| Only failing suite | `oidc-provider.service.spec.ts` — pre-existing documented `openid-client` ESM compile blocker |
| New specs | settings (6) + organization (3) = 9 tests, 2 suites, all green |
| Prettier | clean on all new files |
| Audit allowlist guard test | new event types all have allowlist entries (forces completeness) |

---

## Caveats / honest notes

1. **Migration is hand-authored, not DB-verified.** The configured Neon DB was unreachable (network), so `prisma migrate dev` could not generate/apply it. The SQL follows the exact existing conventions (TEXT ids, FK naming, RLS policy shape). **Must be applied + validated against the real DB before the gate is claimed** — apply via `prisma migrate deploy` or owner's migration tooling once connectivity returns.
2. **Settings `value` is stored as-is (JSON).** It is persist-safe, but semantic validation of structured catalog entries is deferred to the phase that promotes each entry to first-class logic. The audit allowlist guards what reaches the audit trail; it does not validate the stored value's shape.
3. **Feature flags are NOT a substitute for authorization** (Plan.txt closing condition). The settings engine stores flags, but nothing here bypasses `PermissionsService`. This is preserved by design.
4. **No read/list endpoints yet.** This delivery is mutation-focused (create/update/archive). List/read of settings and hierarchy is a natural follow-up and will use the Phase 3 `PaginationDto` (currently available but unwired) on the first tenant-scoped list endpoint.
5. **Deferred to follow-up Phase 4 deliveries:** all remaining catalog domains + branding/localization + feature-flag semantics + subscription/usage + platform admin UI. (Per the agreed first-delivery scope.)
6. **Not committed/pushed** — per instruction. The full change set is unstaged in the working tree.

---

## Files changed/added (uncommitted)
- Modified: `prisma/schema.prisma`, `src/app.module.ts`, `src/audit/audit-constants.ts`, `src/audit/audit-event.service.ts`, `src/permissions/permission.constants.ts`
- New: `prisma/migrations/20260902120000_organization_settings_engine/migration.sql`, `src/organization-config/**` (module, settings, hierarchy, errors, specs)