# Phase 28 (Dashboard) — Design

Operational dashboard: one scoped aggregation endpoint feeding KPI cards,
upcoming work, AR snapshot, and recent activity. Read-only — no new tables,
no migration, no new permissions.

## Backend `backend/api/src/dashboard/`

- `dashboard.errors.ts` — `DashboardAccessDeniedError` (non-enumerating 403).
- `dashboard.service.ts` — `getSummary(tx, tenantId, scope, membershipId)`:
  - `cases`: total + open + byStatus (OPEN-like statuses counted client-side
    from groupBy; statuses are an allowlisted enum surface, values only).
  - `hearings`: count + next 10 within 30 days (`date` asc, select allowlisted
    scalars only).
  - `deadlines`: overdue count + next 10 by `dueDate` (allowlisted scalars).
  - `tasks`: open count, overdue count, assigned-to-me count.
  - `billing`: unpaid invoice count + totals grouped by `currency`
    (Decimal → string, never float), overdue count.
  - `activity`: latest 10 `CaseTimelineEvent` (id/caseId/eventType/occurredAt).
  - `notifications`: unread count for the actor membership.
- Case-derived queries (`cases`, `hearings`, `deadlines`, case-linked tasks /
  invoices, `activity`) filter by assigned caseIds when scope is ASSIGNED
  (via `ResourceAccessService.assignedCaseIds`); FULL scope skips the filter.
  Tenant scoping on every query. All lists capped (10 + counts).
- `dashboard.operations.ts` — `authorizeCaseAccess(request,
  CAN_MANAGE_CASES)` (FULL/ASSIGNED, fail-closed; managers without case access
  get 403 — consistent with every case-linked module) + `read()` under
  `withTenantContext`. No audit write (reads are not audited codebase-wide).
- `dashboard.controller.ts` — `GET /v1/reports`… no: `GET /v1/dashboard/summary`
  under `SessionGuard`+`CsrfGuard`.
- `dashboard.module.ts` — wired into `app.module.ts`.
- No permission seed change: reuses `CanManageCases` as the manage key.

## Frontend `apps/web` (`/dashboard`, workspace nav, `dashboard` namespace en+ar)

- `DashboardClient.summary()` + 4 client tests (path/method/shape).
- `dashboard-page.tsx` orchestrator; sections: `kpi-section`, `upcoming-section`
  (hearings/deadlines/tasks), `billing-section`, `activity-section`.
- `FormField`/`OperationResult`/`Button` + useAuth; no permission gating.
- `messages.test.ts` navigation assertions extended.

## Verification

backend `tsc` + full `jest`, web `tsc` + full `vitest` + `next build --webpack`;
independent re-audit before commit/push approval.
