# Phase 5 Plan — Client Management (Core Delivery)

**Plan status:** DRAFT for owner review. Execution authorized only after the Phase 4
completion gate (sealed at `1d0b4fd2` `[x] Approved`) and owner sign-off on this plan.

**Plan date:** 2026-09-02

**Repository revision at reconciliation:** `main` === `origin/main` === `1d0b4fd2` (clean tree).

**Governing phase rules (enforced):**
- `Plan.txt` line 1259 — Phase 5 is `Client Management`. Forced-phase rule: Phase 5 must not
  begin before Phase 4 closure is fully approved. Phase 4 gate is sealed (`1d0b4fd2`).
- `Plan.txt` lines 317-352 — Phase 5 objective/scope/outputs/closing conditions.
- AGENTS.md: additive migrations only; tenant isolation must be enforced in **both** the
  application layer (`prisma.withTenantContext`) and the database layer (RLS `FORCE`);
  tsc 0, prettier clean, full jest pass as gates; ask owner on ambiguity.
- single-responsibility-file-architecture skill: each responsibility in its own focused file.
- Owner-scoped first-delivery precedent from Phase 4 (settings engine was the bounded core,
  with catalog domains deferred). Phase 5 follows the same pattern.

## Objective

Implement the **core Client Management** foundation from `Plan.txt` (§317-352) as the first,
bounded, gate-approvable delivery:

1. A tenant-scoped `Client` entity supporting both **individuals** and **organizations** via a
   `clientType` discriminator — with full create / update / archive / get, and the **first
   paginated list endpoint with search + filtering** in the codebase.
2. Client operations guarded by a single `CanManageClients` permission key (owner-approved
   single-key model), enforced in-app via `assertTenantPermission` and at rest via RLS.
3. Transactional audit events (`client.created / client.updated / client.archived`) written
   atomically with each mutation, under the established audit contract.
4. Add a **read path for the `OrganizationSetting` engine** (currently write-only `PUT`), so
   deferred client catalog domains (client status, client source) can reuse it later.

**Deliberately deferred (sequenced follow-ups, recorded not silent):** contacts, addresses,
identifiers/ID documents, relationships, tags, notes, custom fields, consent records, data
retention status, portal access flags, client documents (`StorageObject` join), client
communications, client profile page, client timeline. These are Phase 5 scope in `Plan.txt`
but are not part of this first delivery.

## Reconciliation (evidence-based snapshot at `1d0b4fd2`)

### Reused primitives (verified present)

| Primitive | Location |
|---|---|
| TEXT id / tenant scoping / `@@unique([id, tenantId])` / `@@index([tenantId, status])` | `backend/api/prisma/schema.prisma` (Tenant 259, Organization 288, Branch 304, Team 350, OrganizationSetting 416) |
| Soft-archive `HierarchyStatus` enum (`ACTIVE`/`ARCHIVED`) | `schema.prisma:24-26` |
| RLS `FORCE ..._tenant_isolation` policy + `app_tenant_context_is_valid()` helper | `migrations/20260822200000_rls_tenant_context_foundation/migration.sql:15-27`; enforced on every tenant table |
| `withTenantContext` (sets `app.tenant_*` session vars) | `src/infrastructure/database/prisma.service.ts:61-71,143-154` |
| Permission recipe (constant + catalog + role grant + migration seed + `reconcileBuiltInRoles`) | `src/permissions/permission.constants.ts:6-88`; `permissions.service.ts:100-215`; seed `migrations/20260902120000_organization_settings_engine/migration.sql:56-64` |
| `assertTenantPermission` → `{ membershipId }` | `src/permissions/permissions.service.ts:57-79` |
| Audit 4-maps + `METADATA_ALLOWLIST` + completeness guard test | `src/audit/audit-constants.ts`; `audit-event.service.ts:36-73`; `audit-event.service.spec.ts:12-18` |
| Shared `HierarchyOperations` (authorize + run + tenant context + atomic audit) | `src/organization-config/hierarchy/hierarchy.operations.ts` |
| Single-responsibility module layout (service/controller/dto/errors/spec, `AuthModule` DI fix) | `src/organization-config/`; module imports `AuthModule` at `organization-config.module.ts:14,17` |
| `PaginationDto` (page/limit, `@Max(100)`) + `Paginated` envelope shape | `src/common/api/pagination.dto.ts`; `success-envelope.interceptor.ts:39-48` |

### Genuinely new (this delivery)

| Item | Gap |
|---|---|
| `Client` Prisma model + additive RLS migration | no client model exists |
| `ClientType` enum (INDIVIDUAL / ORGANIZATION) | new enum for the discriminator |
| `CanManageClients` permission (constant/catalog/role/seed) | new key + migration seed |
| `client.created/updated/archived` audit events (4 maps + allowlist) | new event types |
| `clients/` module (service/controller/dto/errors/spec) mirroring `organization-config/` | new module |
| First list endpoint with `search`/`status`/`clientType` filters + paging | no list/search/filter endpoint exists anywhere |
| `OrganizationSetting` read endpoints (GET :key, GET list) | engine is currently write-only (`settings.controller.ts` PUT only) |

## Delivery workstreams

### W1 — Schema: `Client` model + additive migration
- New `ClientType` enum (`INDIVIDUAL`, `ORGANIZATION`).
- `model Client`: `id`, `tenantId`, `clientType`, `name` (individual) / `legalName` (org),
  `displayName` (denormalized searchable), `status HierarchyStatus @default(ACTIVE)`,
  `source`/`status` as TEXT (deferring catalog promotion), `notes` TEXT deferred to follow-up,
  `createdAt`/`updatedAt`; `tenant` relation `onDelete: Restrict`.
- `@@unique([id, tenantId])`, `@@index([tenantId, status])`, `@@index([tenantId, clientType])`.
- Additive migration: `CREATE TABLE Client`, `FORCE RLS` + `Client_tenant_isolation` policy
  (identical to org-hierarchy tables), and idempotent `CanManageClients` permission seed.

### W2 — Permissions + audit wiring
- `PERMISSION_KEYS.CAN_MANAGE_CLIENTS = 'CanManageClients'`; add to `PERMISSION_CATALOG` and
  `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- New audit event types `client.created`, `client.updated`, `client.archived` across all four
  maps; `METADATA_ALLOWLIST` entries (`client.created: ['clientType']`; `.updated: []`;
  `.archived: ['reason']`) so the completeness guard test passes. Never audit sensitive PII.

### W3 — `clients/` module (mirror `organization-config/`)
- `clients.module.ts` imports `AuthModule` (DI), registers controllers/providers.
  `clients.errors.ts` non-enumerating `FORBIDDEN` (`ClientAccessDeniedError`).
- `client.operations.ts` shared `authorize` + `run` helper (tenant context + atomic audit),
  mirroring `hierarchy.operations.ts`.
- `client.service.ts` (`create/update/archive/get/list`) + `client.service.spec.ts`.
- `client.controller.ts` (POST /clients, GET /clients/:id, PATCH /clients/:id,
  DELETE /clients/:id archive, GET /clients) all `@UseGuards(SessionGuard, CsrfGuard)`;
  `client.dto.ts` (create/update/list-query DTOs extending `PaginationDto`).

### W4 — First list/search/filter endpoint
- `GET /clients` returns `Paginated<ClientResult>` honoring `PaginationDto` + optional
  `search` (case-insensitive on `displayName`), `status`, `clientType`.
- Establishes the first list convention (query-param DTO extending `PaginationDto`); bounded
  by the existing `@Max(100)` exfiltration cap.

### W5 — `OrganizationSetting` read path (enable catalog reuse)
- Add `GET /organization-config/settings/:key` and `GET /organization-config/settings`
  (paginated) to `settings.controller.ts`/`settings.service.ts`, guarded by
  `CanManageOrganizationConfig`, RLS-tenant-scoped. Unblocks deferred client catalogs.

### W6 — Gates
- `tsc --noEmit` = 0; `prisma validate` clean; prettier clean; full jest pass (manual
  constructor composition; coverage thresholds met). Add settings read-path specs + client specs.

### W7 — Docs
- Update `PHASE4_AUDIT_CONCLUSION.md` note re: reused engine; author this plan's completion
  review at delivery; record explicit deferrals.

## Closing conditions (mirror Plan.txt §350-352, bounded to this delivery)

1. A user with `CanManageClients` can create an individual or organization client and manage
   its core profile (create/update/archive/get).
2. Clients are only reachable within the correct permissions: `403 FORBIDDEN` for
   unauthenticated / missing-tenant / no-permission; RLS `FORCE` prevents cross-tenant reads.
3. The client list is paginated + searchable/filterable within the active tenant.
4. The Phase 5 gate is owner-approved before any Phase 6 (Conflict Check Foundation) work.

## Explicit deferrals (recorded, not silent)

- Contacts, addresses, identifiers/ID documents, relationships, tags, notes, custom fields,
  consent records, data retention status, portal access flags, client documents, client
  communications, client profile page, client timeline → sequenced follow-up deliveries.
- Cross-tenant HTTP isolation e2e → still gated on the first tenant-scoped business-data
  list endpoint; the client list endpoint (W4) becomes that first endpoint, so this deferral
  now has a concrete anchor.
- Frontend client UI → backend-first; UI lives in a follow-up within Phase 5 (mirrors Phase 4,
  which shipped backend before UI).
- The `OrganizationSetting` write path is unchanged; only read endpoints are added.

## Risks / notes

- **List/search query shape is net-new** (no existing convention). W4 establishes it; the DTO
  must stay additive to `PaginationDto` and validated with `class-validator`.
- **Soft delete** via `status: ARCHIVED` (no hard delete), consistent with `HierarchyStatus`.
- DB reachability for the migration apply / drift check is the owner's responsibility (as in
  Phase 4); the migration itself is hand-authored to codebase conventions and flagged for
  `prisma migrate diff` verification.

## References

- `Plan.txt` §317-352 (Phase 5), line 1259 (phase order), line 1297 (forced-phase rule)
- `docs/phase4/PHASE4_COMPLETION_REVIEW.md` (sealed Phase 4 gate `1d0b4fd2`)
- `docs/phase4/PHASE4_AUDIT_CONCLUSION.md` (engine-reuse direction)
- `docs/phase3/PHASE3_PLAN.md` (plan format + governance)
- `docs/phase2/PHASE2_COMPLETION_PLAN.md` (§Completion gate decision conventions)
- single-responsibility-file-architecture skill