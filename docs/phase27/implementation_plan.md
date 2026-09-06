# Phase 27 Implementation Plan: Reporting

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` (المرحلة 27); Phase 25 column allowlists + caps; G6 assignment seam; existing `@Cron` scheduler.

## User Review Required
> [!IMPORTANT]
> Reports expose only allowlisted columns (same fail-closed policy as exports), cap at 1000 rows, and respect assignment scoping. Outputs are JSON + CSV text; Excel/PDF arrive with their renderers. Do you approve?

## Objective (Plan.txt)
Configurable operational/legal reports. Closing: every report respects tenant + authorization.

## 1. Database Schema
- `ReportDefinition` (tenantId; name; dataSource CASE|CLIENT|PARTY|TASK|INVOICE|PAYMENT|HEARING|DEADLINE|DOCUMENT; columns Json string[]; filters Json?; groupBy?; sortBy?; sortDir ASC|DESC; createdBy)
- `ReportSchedule` (tenantId; definitionId; frequency DAILY|WEEKLY; runAt HH:MM; enabled; lastRunAt?; nextRunAt?; createdBy)
- `ReportRun` (tenantId; definitionId?; scheduleId?; status QUEUED|RUNNING|COMPLETED|FAILED; rowCount; error?; triggeredBy; timestamps)
### Enums
`ReportDataSource`, `ReportFrequency`, `ReportRunStatus`.
### Hard rules
- Columns validated against the Phase 25 allowlists (+ id/createdAt); anything else rejected.
- 1000-row cap, never silent truncation (error when exceeded).
- ASSIGNED scope: case-linked sources constrained to assigned cases; documents additionally require a case link (unlinked docs invisible to assigned scope).
- Scheduled runs execute as definition owner scope? No — runs execute with tenant boundary + assignment scope of... scheduler has no actor. Decision: scheduled runs execute FULL tenant scope but deliver only to members holding report perms? Simpler honest rule: scheduled runs store summary counts only (no row data), rows re-fetched on demand with the viewer's scope. Recorded.

## 2. Backend (`backend/api/src/reporting/`)
- `reporting.errors.ts`, `reporting.dto.ts`, `reporting.operations.ts`
- `definition.service.ts` (CRUD + column validation), `run.service.ts` (query builder per source + scope filter + grouping/sorting + CSV), `schedule.service.ts` (CRUD + next-run computation + hourly sweep executing due schedules)
- `reporting.controller.ts` (versioned, guarded), `reporting.module.ts`

## 3. Permissions + audit
- `CanManageReports` (tenant.admin); run/list use FULL/ASSIGNED split (manage key vs assigned key, shared gate helper).
- Audit: `report.created/updated`, `report.run.completed`.

## 4. Frontend
- `ReportsClient` + tests; `/[locale]/reports` route; workspace nav; `reports` i18n (en+ar); sections: definitions, run + results, schedules.

## 5. Migration + RLS
- Additive `20260908000010_phase27_reporting_foundation` + FORCE RLS ×3 + spec extension.

## 6. Verification
- validate; slice-completeness; tsc ×2; nest/next builds; jest (column rejection, cap, scope filtering, schedule computation, sweep); vitest; prettier.
- Live (owner): define → run → scoped results; assigned user sees subset; oversized rejected.

## 7. Deferrals
Excel/PDF renderers, dashboard widgets UI (Phase 28 consumes the feed), scheduled file delivery, cross-tenant benchmarks.
