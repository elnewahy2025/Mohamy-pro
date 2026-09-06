# Phase 27 (Reporting) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/reporting/` (single-responsibility files):

- `reporting-contracts.ts` — DTOs + `REPORT_DATA_SOURCES` allowlist (9 sources),
  `REPORT_COLUMNS` allowlist per source, `REPORT_FREQUENCIES`, validation for
  `HH:MM` run time, scheduling math (`computeNextRunAt`).
- `definition.service.ts` — create/list scoped to tenant; column allowlist enforced.
- `run.service.ts` — execute a definition against the live Prisma client with
  tenant scoping + case assignment scoping applied per source; group/sort/paginate;
  records a `ReportRun` row per execution; fails closed with
  `ReportRunFailedError` / `ReportDataSourceUnavailableError` (no fabricated rows).
- `schedule.service.ts` — create/list; `runDueSchedules()` picks up due enabled
  schedules, executes with a `(tenant, schedule)` user context, stamps
  `lastRunAt`/`nextRunAt`.
- `reporting.controller.ts` + `reporting.module.ts` — versioned `/v1/reports`
  routes under `SessionGuard`+`CsrfGuard`, `operations.authorize()` per endpoint,
  wired into `app.module.ts`.
- Permissions seeded in migration + `src/permissions/permissions.ts`:
  `Reports.Read`, `Reports.Export`, `Reports.Manage`.

Migration `20260908000010_phase27_reporting_foundation` (additive, verified
statement-complete against Prisma): `ReportDefinition`, `ReportSchedule`,
`ReportRun` tables, 3 new enums, FORCE RLS + tenant-isolation policy each.

Frontend `apps/web` (`/reports`, workspace nav, en+ar `reports` namespace):

- `ReportsClient` (definitions CRUD-lite/run/schedules/runs) + 4 client tests.
- `reports-page.tsx` orchestrator with `definitions / run / schedules` tabs;
  `definitions-section.tsx`, `run-section.tsx` (renders result table),
  `schedules-section.tsx`; all `FormField`/`OperationResult`/`Button` + zod +
  useAuth, no permission gating (backend authoritative).
- `messages.test.ts` navigation assertions extended with `reports`.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **512/512** (incl. 8 new reporting specs + RLS block) |
| backend `nest build` | exit 0 |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **97/97** (incl. 4 new ReportsClient tests) |
| web `next build --webpack` | exit 0 |

## Independent re-audit (2026-02-22) — all findings closed

An independent audit returned CHANGES REQUIRED with 4×P0 + 3×P1 + 1×P2.
Every item was verified against the actual files and remediated:

- **P0 allowlist gap**: `EXPORT_COLUMNS` covered only 4 sources while the
  enum/runner support 9. Added vetted allowlists for
  INVOICE/PAYMENT/HEARING/DEADLINE/DOCUMENT (FK scalars and money/status/date
  columns only; `providerRef`/`idempotencyKey`/notes/evidence excluded).
  Safe for transfer: its DTO enum (`TransferEntity`) admits only the original
  4 types, so the new keys are inert there.
- **P0 groupBy/sortBy/filter keys**: validated against the allowlist at
  creation (`definition.service.ts`) and re-validated at execution
  (`run.service.ts`) — stored definitions can never smuggle a column.
- **P0 unbounded lists**: `take: 100` on definition/schedule/run listings.
- **P0 scheduler double-fire**: `sweepDueSchedules` now atomically claims each
  schedule (`updateMany` on `nextRunAt <= now` → +1h lease) before executing;
  losers skip. A crashed run leaves the +1h lease, so no hot loop.
- **P1 ignored filters**: `definition.filters` keys validated at create and
  applied as equality clauses (`AND`) at run; type mismatches fail closed via
  Prisma validation (run fails, never fabricated).
- **P1 scheduler scope**: accepted by design — schedules are tenant-level
  artifacts requiring `CanManageReports`; the worker runs under tenant context
  + RLS and audits every run with `triggeredBy: 'scheduler'`. Documented here
  rather than weakened.
- **P1 dead `format` param**: removed from `ReportsClient.runDefinition`.
- **P2 admin-only `CanManageReports`**: intentional — consistent with
  `CanManageExports`/`CanManageImports`/`CanManageNotifications`, likewise
  admin-only.

Post-remediation gates: backend **519/519**, web **97/97**, both builds exit 0
(7 new remediation specs included).

## Traceability

- `docs/phase27/PHASE27_TASKLIST.md`, `PHASE27_DESIGN.md`,
  `PHASE27_DELIVERY_REVIEW.md` (this file) — knowledge anchored.
- Every run row records `triggeredBy`, status, rowCount/error; schedules stamp
  last/next run; definition lists stay tenant-scoped.
- Nothing committed or pushed — awaiting your approval per standing order.
