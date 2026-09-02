# Phase 5 — Completion Review (Core Delivery)

**Status:** DRAFT pending owner approval. Records the Phase 5 completion gate for the **core
Client Management delivery** (`54882601`) — the owner-approved first delivery of `Plan.txt` §317-352.

**Date:** 2026-09-02
**Repository revision at review:** `main` at `54882601` (Phase 5 core Client delivery).
**Governing docs:** `PHASE5_PLAN.md`, `PHASE5_CORE_DELIVERY_REVIEW.md`, `Plan.txt` (forced-phase rule).

## Phase 5 (Client Management)

> **Phase 5 provides a tenant-scoped Client entity with core CRUD, the first paginated
> list/search/filter endpoint, and a read path for the organization-settings engine:**
> - A `Client` table stores individuals or organizations (`clientType` discriminator), uniquely
>   tenant-scoped, RLS-enforced, soft-archived via `ACTIVE/ARCHIVED`.
> - `create`/`update`/`archive`/`get` and a paginated `list` with `search`/`status`/`clientType`
>   filters operate only within the active tenant (tenant derived from the authenticated session).
> - All mutations are guarded by the `CanManageClients` policy, run inside `withTenantContext`,
>   and emit transactional audit events (`client.created/updated/archived`).
> - Denial is non-enumerating: one `403 FORBIDDEN` surface for unauthenticated / missing-tenant /
>   no-permission; the machine reason is retained only for audit/logs.
> - The `OrganizationSetting` engine gained a read path (`GET :key`, `GET list`) so deferred
>   catalog domains can reuse it without code changes.

## Completion gate decision

Phase 5 (core) is complete and the gate is eligible for approval **when**:
1. The core delivery (`54882601`) is committed and pushed.
2. The additive migration is applied to the live database and drift-checked.
3. Backend `tsc --noEmit` = 0 errors; `prisma validate` clean; full jest passes
   (223/223; the pre-existing `openid-client` ESM suite blocker excluded).
4. The owner approves this completion gate **before** the remaining Phase 5 follow-ups (contacts,
   addresses, identifiers, tags, notes, documents, communications, consent, retention, portal
   flags, profile, timeline) or the frontend UI are treated as gate-closing work, and **before**
   any Phase 6 (Conflict Check Foundation) work is authorized.

## Delivery checklist

| Item | Deliverable | State | Evidence location |
|---|---|---|---|
| 1 | `Client` model + `ClientType` enum | ✅ done | `schema.prisma` |
| 2 | Additive migration (table + RLS + permission seed) | ✅ delivered, **apply pending** | `migrations/20260902180000_client_management_core/migration.sql` |
| 3 | `CanManageClients` permission (constant/catalog/role) | ✅ done | `permission.constants.ts` |
| 4 | `client.created/updated/archived` audit events (4 maps + allowlist + guard) | ✅ done | `audit-constants.ts`, `audit-event.service.ts` |
| 5 | `clients/` module (CRUD + list/search, non-enumerating denial) | ✅ done | `src/clients/` |
| 6 | First paginated list endpoint with filters | ✅ done | `client.service.ts` `list`, `client.controller.ts` |
| 7 | `OrganizationSetting` read path | ✅ done | `settings.service.(get|list)`, `settings.controller` |
| 8 | Delivery review + specs + gates | ✅ done | `PHASE5_CORE_DELIVERY_REVIEW.md`; pass 223/223 |
| 9 | Completion review (this artifact) | ✅ this review | `docs/phase5` |

## Explicit deferrals (recorded, not silent)

- **Remaining Phase 5 scope** — contacts, addresses, identifiers/ID documents, relationships,
  tags, notes, custom fields, consent records, data retention status, portal access flags, client
  documents (`StorageObject` join), client communications, client profile page, client timeline.
  These are `Plan.txt` Phase 5 scope but **not** part of this core delivery.
- **Frontend client UI** — backend-first; the list page and client forms are sequenced follow-ups
  (mirrors Phase 4, which shipped backend before UI).
- **Organization Configuration redefinition** (the 18-domain configuribility plan) — **rejected /
  out of scope** by the owner. Current Phase 5 remains Client Management per `Plan.txt` §317-352.
- **Cross-tenant HTTP isolation e2e** — the deferred anchor. Now that the Client list endpoint is
  the first tenant-scoped business-data list, this deferral can be lifted in a follow-up that adds
  the HTTP e2e for the client list (tenant A ≠ tenant B).
- **Caching of config/catalog lookups** — deferred (not part of this delivery).

## Blocking issues

- **Migration not DB-applied.** The `Client` migration is committed but not applied to Neon from
  this sandbox (DB unreachable). Apply + drift-check (`prisma migrate deploy` / `migrate diff`) on
  a DB-reachable machine before claiming the gate closed. This is the sole remediation required.

## Owner approval

- [ ] **Approved** — Phase 5 (core Client Management) completion gate accepted; remaining
  Phase 5 follow-ups and Phase 6 are not treated as authorized until this box is ticked.

## References

- `PHASE5_PLAN.md`
- `PHASE5_CORE_DELIVERY_REVIEW.md`
- `docs/phase4/PHASE4_COMPLETION_REVIEW.md` (conventions)
- `docs/phase2/PHASE2_COMPLETION_PLAN.md` (§Completion gate decision conventions)
- `Plan.txt` §317-352 (Phase 5), line 1297 (forced-phase rule)