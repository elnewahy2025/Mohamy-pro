# Phase 28 (Dashboard) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/dashboard/` (read-only aggregation, no new tables —
no migration required):

- `dashboard.service.ts` — `getSummary()` returning cases (total/open/byStatus),
  hearings (upcoming + next 10/30d), deadlines (overdue + next 10), tasks
  (open/overdue/assigned-to-me), billing (unpaid/overdue counts + exact
  per-currency totals via integer-scaled decimal addition, never float),
  activity (latest 10 timeline events), notifications (unread for actor).
  Every query tenant-scoped; case-derived queries filter by assigned caseIds
  under ASSIGNED scope; all lists capped.
- `dashboard.operations.ts` — gates on `authorizeCaseAccess(CAN_MANAGE_CASES)`
  (FULL/ASSIGNED, fail-closed); `read()` under `withTenantContext`, no audit
  write (reads are not audited codebase-wide).
- `dashboard.controller.ts` (`GET /v1/dashboard/summary`,
  SessionGuard+CsrfGuard) + `dashboard.module.ts`, wired into `app.module.ts`.
- No permission seed change: reuses `CanManageCases` as the manage key, so
  managers without case access get a non-enumerating 403 — consistent with
  every case-linked module.

Frontend `apps/web` (`/dashboard`, workspace nav after overview, en+ar
`dashboard` namespace):

- `DashboardClient.summary()` + client test (path/method/shape).
- `dashboard-page.tsx` (load-on-demand + `OperationResult`) with `kpi-section`,
  `upcoming-section`, `billing-section`, `activity-section`; useAuth only, no
  permission gating.
- `messages.test.ts` navigation assertions extended with `dashboard`.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **522/522** (incl. 3 new dashboard specs) |
| backend `nest build` | exit 0 |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **98/98** (incl. DashboardClient test) |
| web `next build --webpack` | exit 0 |

## Independent re-audit (2026-02-22) — all findings closed

An independent audit returned CHANGES REQUIRED (1×P0, 1×P1, 2×P2).
Every item was verified and remediated:

- **P0 dead nav route**: the `/dashboard` page had landed in a stray nested
  tree (`apps/web/apps/...`) from a workdir-relative path mistake, so the nav
  entry 404'd. Restored to `apps/web/src/app/[locale]/dashboard/page.tsx`,
  removed the stray tree, and confirmed `ƒ /[locale]/dashboard` in the
  production build output.
- **P1 assigned-scope leak**: `tasks.assignedToMe` counted assignment without
  intersecting the assigned-case filter. Now applies `...taskScope` like the
  other task counts (tenant-level unlinked tasks stay out of ASSIGNED scope —
  consistent, documented).
- **P2 capped count**: `hearings.upcoming` now comes from a dedicated
  `tx.hearing.count()` with the identical `where` as the `take:10` list
  (spec asserts same-where); `next` stays the capped list.
- **P2 dead error class**: `dashboard.errors.ts` (`DashboardAccessDeniedError`,
  never thrown — auth uses `ResourceAccessDeniedError`) deleted.

Post-remediation gates: backend **522/522**, web **98/98**, both builds exit 0.

## Traceability

- `docs/phase28/PHASE28_DESIGN.md`, `tasklist.md`, this review.
- Nothing committed or pushed — awaiting independent re-audit + your approval
  per standing order.
