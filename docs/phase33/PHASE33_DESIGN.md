# Phase 33 (Operations + Backup + DR) — Design

Last feature phase. Honest boundary: snapshot execution belongs to the
platform (Neon PITR / pgBackRest / object-storage replication) — the app
records governance (policies, drills with operator-attested evidence) and
exposes real operational status. Nothing fabricates a backup or a passing
drill: drills start PLANNED and only reach PASSED/FAILED with named checks.

## Backend `backend/api/src/ops/`

- `ops.errors.ts` — access-denied / not-found / invalid-state.
- `ops.dto.ts` — `SetBackupPolicyDto` (rpoHours/rtoHours 1–720 ints,
  scheduleCron 5-field, retentionDays 1–3650, enabled?);
  `StartDrillDto` (name ≤160, targetRef ≤500, e.g. restore branch/point);
  `FinishDrillDto` (passed bool, checks 1–20 × {name ≤120, passed bool,
  evidence ≤1000}, note?); `DRILL_CHECK` nested validation.
- `policy.service.ts` — upsert-per-tenant + get.
- `drill.service.ts` — start (PLANNED + startedBy), finish (terminal
  PASSED/FAILED with checks recorded verbatim + finishedBy/at; PLANNED-only),
  list (`take:100`), latest.
- `status.service.ts` — aggregates REAL signals only: `health.getReadiness()`
  (postgres/redis/queue/storage), outbox counts by status (tenant-scoped:
  tenantId = ctx OR null global rows? Global outbox rows have null tenantId —
  count tenant's own + report global pool separately, labeled), latest drill,
  policy presence. No invented numbers.
- `ops.operations.ts` — `authorize()` on new `CanManageOperations`
  (fail-closed); `run()` audited; `read()` under tenant context.
- `ops.controller.ts` — `GET /v1/ops/status`, `PUT/GET /v1/ops/backup-policy`,
  `POST/GET /v1/ops/drills`, `POST /v1/ops/drills/:id/finish`.
  SessionGuard+CsrfGuard.
- Permission `CanManageOperations` (definition + TENANT_ADMIN matrix).
- Audit `BACKUP_POLICY_SET`, `RESTORE_DRILL_STARTED/FINISHED` at all 5 sites.
- Migration `20260908000015_phase33_ops_foundation`: `BackupPolicy`
  (`@@unique([tenantId])`), `RestoreDrill`, `DrillStatus` enum, FORCE RLS +
  policies, slice-verified.

## Frontend `apps/web` (`/operations` rebuilt, `operations` namespace)

- Static feature-list page becomes the ops console: `operations-page.tsx`
  (status / policy / drills tabs) + `status-section` (live readiness, outbox,
  drill, policy), `policy-section`, `drills-section` (start/finish with
  checks); `OpsClient` + tests. Existing `operations.items.*` keys retired
  (only consumer was the static page — verified before removal).
- `messages.test.ts` untouched unless nav changes (nav already has
  `operations`).

## Verification

backend tsc + full jest + nest build + prisma validate; web tsc + vitest +
next build --webpack; independent re-audit; commit/push only on approval.
