# Phase 5 — Client Management (Core Delivery Review)

> **Status:** IN REVIEW — Phase 5 first delivery (Client core CRUD + list/search) for `3d16c99f`+changes.
> **Performed against:** local `main` working tree atop `3d16c99f` (owner-approved `PHASE5_PLAN.md`).
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `tsc --noEmit` 0 errors · full jest 223/223 pass (41/42 suites; 1 = pre-existing `openid-client` ESM blocker) · prettier clean · `prisma validate` valid.

---

## Scope delivered (per owner's scoping decision)

`Plan.txt` §317-352 Phase 5 (Client Management) lists 16 scope items. Per the owner-selected scope, this first delivery covers:

1. **Client core entity** — a single tenant-scoped `Client` table with a `clientType` discriminator
   (`INDIVIDUAL | ORGANIZATION`), validated core CRUD (create/update/archive/get), and the
   **first paginated list endpoint with search + filtering** in the codebase.
2. **Permissions** — single `CanManageClients` key (owner-approved single-key model) enforced
   in-app via `assertTenantPermission` and at rest via RLS `FORCE`.
3. **Transactional audit** — `client.created / client.updated / client.archived` events written
   atomically with each mutation under the established audit contract.
4. **`OrganizationSetting` read path** — added `GET .../settings/:key` and `GET .../settings`
   (previously write-only), unblocking reuse of the engine for deferred client catalog domains.

The remaining Phase 5 scope (contacts, addresses, identifiers/ID documents, relationships, tags,
notes, custom fields, consent records, retention status, portal access flags, client documents,
client communications, profile, timeline) and the frontend UI are **explicitly deferred** to
sequenced follow-ups.

## What was built

### New tenant-scoped table + RLS migration
- `ClientType` enum (`INDIVIDUAL`, `ORGANIZATION`) in `prisma/schema.prisma`.
- `Client` model: id, tenantId, clientType, name, legalName?, displayName (denormalized for
  case-insensitive search), status `HierarchyStatus ACTIVE/ARCHIVED` (soft-archive), source?,
  notes?, createdAt/updatedAt; `@@unique([id, tenantId])`, `@@index([tenantId, status])`,
  `@@index([tenantId, clientType])`.
- Hand-authored additive migration `prisma/migrations/20260902180000_client_management_core/migration.sql`:
  - **TEXT ids / TEXT tenant FK** (matches established convention, `ON DELETE RESTRICT`).
  - **FORCE RLS** + `Client_tenant_isolation` policy via `public.app_tenant_context_is_valid()`.
  - Idempotent seed of the `CanManageClients` permission row (mirrors Phase 4 pattern).

### Permissions + audit
- `PERMISSION_KEYS.CAN_MANAGE_CLIENTS` added to key constant, `PERMISSION_CATALOG`, and
  `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- `client.created/updated/archived` added to all four audit maps
  (`AUDIT_EVENT_TYPES/VERSIONS/CATEGORY/DEFAULT_OUTCOME`) + `METADATA_ALLOWLIST` entries
  (`client.created: ['clientType']`, `client.updated: []`, `client.archived: ['reason']`) so the
  allowlist-completeness guard test passes. Sensitive PII (name/legalName/source/notes) is never audited.

### `clients/` module (single-responsibility, mirrors `organization-config/`)
- `clients.module.ts` imports `AuthModule` (DI fix pattern), registers controller/providers.
- `clients.errors.ts` — non-enumerating `ClientAccessDeniedError` (single `403 FORBIDDEN` surface).
- `client.operations.ts` — shared `authorize` (asserts `CanManageClients`) + `run` (tenant context +
  atomic audit) + `read` (tenant context, no audit for get/list) helper.
- `client.service.ts` — `create / update / archive / get / list`; soft-archive; tenant binding
  derived from session (never from the body/query).
- `client.controller.ts` — `POST /clients`, `GET /clients`, `GET /clients/:id`,
  `PATCH /clients/:id`, `DELETE /clients/:id` all `@UseGuards(SessionGuard, CsrfGuard)`.
- `client.dto.ts` — create/update/list-query DTOs; list extends `PaginationDto` with `search`,
  `status`, `clientType` filters (capped at `@Max(100)`).
- `client.service.spec.ts` — create/authorize-denial/archive-reason/list-paging coverage.

### `OrganizationSetting` read path
- `settings.service.(get|list)` + `settings.controller` `GET :key` and `GET /` — guarded by
  `CanManageOrganizationConfig`, tenant-context derived from session.

## Security & isolation notes
- Every client mutation and read runs inside `prisma.withTenantContext(...)` with the actor's
  resolved membership — RLS applies (`app.tenant_*` session vars set).
- `tenantId` is **never taken from the request body/query**; it is derived from the authenticated
  session's active tenant, so a caller cannot target another tenant.
- Cross-tenant reads/updates are blocked in-app (find/update always filter `tenantId`) and at rest
  (RLS `FORCE`).
- The list endpoint cannot be enumerated without `CanManageClients` (authorization runs before
  the query).

## Gates
- `tsc --noEmit` = 0 errors.
- `prisma validate` valid.
- prettier clean (single-quote, trailing-comma).
- Full jest: **223/223 pass**, 41/42 suites; the single failing suite is the pre-existing
  `openid-client` ESM compile blocker (`oidc-provider.service.spec.ts`) — not introduced here.

## Caveats for the gate
1. **Migration is hand-authored, not DB-applied.** The `Client` migration is committed/pushed-flow
   but not applied to Neon from this sandbox (DB unreachable). Apply + drift-check via
   `prisma migrate deploy` / `prisma migrate diff` on a DB-reachable machine.
2. **List/search is the first list convention** — it establishes the query-DTO pattern; kept
   additive to `PaginationDto`.
3. **Deferred Phase 5 scope** (contacts/addresses/identifiers/tags/notes/documents/communications/
   consent/retention/portal flags/profile/timeline) and the **frontend UI** are sequenced follow-ups,
   not defects.

## References
- `docs/phase5/PHASE5_PLAN.md` (owner-approved scope)
- `docs/phase4/PHASE4_AUDIT_CONCLUSION.md` (settings-engine reuse direction)
- Plan.txt §317-352 (Phase 5), line 1297 (forced-phase rule)
- `docs/phase4/PHASE4_CORE_DELIVERY_REVIEW.md` (format precedent)