# Phase 23 Implementation Plan: Calendar Integrations

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` (المرحلة 23); existing Hearing/Deadline/Task date fields; OAuth/OIDC precedent (login only, unrelated); fail-closed adapter rule from Phases 16–19 journey.

## User Review Required
> [!IMPORTANT]
> OAuth tokens are credentials: they are NEVER stored until Vault Transit is live (Phase 16 wiring). Connections persist metadata + enablement only; token persistence and live provider calls are deferred and fail closed. Do you approve?

## Objective (Plan.txt)
Connect the internal calendar to external calendars. Deliverables: integration adapters, sync engine, calendar permissions. Closing: per-tenant enable/disable; clear conflict/duplicate policy.

## 1. Database Schema
### [MODIFY] `backend/api/prisma/schema.prisma`
- `CalendarConnection` (tenantId; provider GOOGLE|MICROSOFT; accountRef e.g. email; status ACTIVE|DISABLED|ERROR; `@@unique([tenantId, provider, accountRef])`) — per-tenant enable/disable switch
- `CalendarSyncCursor` (tenantId; connectionId; resource CALENDAR; syncToken?; lastSyncedAt?; attempts; nextRetryAt?)
- `CalendarEventMapping` (tenantId; connectionId; localType HEARING|DEADLINE|TASK; localId; externalId; etag?; direction PUSH|PULL; `@@unique([tenantId, connectionId, localType, localId])` — duplicate-proof)
- `CalendarSyncConflict` (tenantId; connectionId; localType; localId; externalId?; reason; resolution PENDING|LOCAL_WINS|REMOTE_WINS; resolvedAt?)
### Enums
`CalendarProvider`, `CalendarConnectionStatus`, `CalendarLocalType`, `SyncDirection`, `ConflictResolution`.
### Hard rules
- No OAuth token columns exist anywhere in this phase (deliberate; see above).
- Duplicate policy: mapping unique constraint is the enforcer; re-sync of a mapped event updates, never duplicates.
- Conflict policy: on etag/version mismatch record PENDING conflict and keep both sides; resolution is explicit, never silent overwrite.

## 2. Backend Module
### [NEW] `backend/api/src/calendar/`
- `calendar.errors.ts`, `calendar.dto.ts` (validated; no `any`), `calendar.operations.ts`
- `connection.service.ts` (CRUD + enable/disable + provider account validation in-tenant)
- `sync.service.ts` (push local→mapping, pull cursor advance with retry bookkeeping, conflict recorder)
- `calendar-provider.interface.ts` — contract only (`pushEvent`, `pullChanges`); zero implementations
- `calendar.controller.ts` (`@Controller({ path: 'calendar', version: '1' })`, guards everywhere), `calendar.module.ts`
### Permissions
- `CanManageCalendar` (tenant.admin; least privilege, recorded)
### Audit
- `calendar.connected`, `calendar.disabled`, `calendar.synced`, `calendar.conflict.recorded` (+ maps + allowlist)
- No timeline emission (avoids future double-emit when source modules gain it; recorded)

## 3. API Endpoints (all `/api/v1/calendar`)
- `POST /connections`, `GET /connections`, `POST /connections/:id/enable`, `POST /connections/:id/disable`
- `POST /sync/push` (localType+localId → mapping), `POST /sync/pull` (advance cursor), `GET /mappings?connectionId=`
- `GET /conflicts?connectionId=`, `POST /conflicts/:id/resolve`
- `GET /agenda?from=&to=` (unified internal view: hearings + deadlines + tasks by date, read-only)
- `POST /webhooks/:provider` (validates, records receipt as PENDING conflict/job note; processing deferred)

## 4. Frontend
- `CalendarClient` + tests; `/[locale]/calendar` route; matters-group nav; `calendar` i18n (en+ar)
- Sections: agenda (unified read view), connections manager, sync runner, mappings viewer, conflicts resolver

## 5. Migration + RLS
- Additive `20260908000003_phase23_calendar_foundation` + FORCE RLS ×4 + spec extension

## 6. Verification
- validate; slice-completeness; tsc ×2; nest/next builds; jest (mapping idempotency, conflict policy, enable/disable, provider absence); vitest; prettier
- Live (owner): connect → disable → push → duplicate push (no dup) → conflict → resolve → agenda shows items

## 7. Deferrals (recorded, not silent)
OAuth token exchange/storage (blocked on Vault), live Google/Microsoft calls, webhook signature verification against real secrets, push-notification fan-out (Phase 26), AI scheduling (Phase 32).
