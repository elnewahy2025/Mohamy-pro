# Phase 30 (Audit + Compliance + Retention + Legal Hold) — Design

Builds on the existing audit foundation (events with `retentionUntil`, outbox,
categorized/versioned/allowlisted writes). Adds inspection, governance, and
holds. No destructive purge ships in v1 — fail-closed by absence (holds cannot
be violated by automation that does not exist; delete-path wiring deferred and
stated).

## Backend `backend/api/src/compliance/`

- `compliance.errors.ts` — access-denied / not-found / invalid-state.
- `compliance.dto.ts` — `AuditQueryDto` (optional eventType/outcome/targetType/
  targetId/from/to ISO strings), `CreateRetentionPolicyDto` (targetType ∈
  allowlist, retainYears 1–30, enabled?), `CreateHoldDto` (name, reason,
  optional targetType ∈ allowlist + targetId), `ReleaseHoldDto` (reason req).
- `audit-query.service.ts` — tenant-scoped search (`take:100`, date-bounded,
  allowlisted scalar select incl. metadata), capped CSV export (`take:1000`,
  watermark line, reuses transfer `toCsv` pure parser).
- `retention.service.ts` — policy upsert-per-(tenant,targetType) + list;
  `evaluate()` returns per-policy eligible counts for `AuditEvent`
  (`retentionUntil < now`) minus records covered by ACTIVE holds
  (tenant-wide hold or matching targetType/targetId).
- `hold.service.ts` — create ACTIVE (validates optional target exists when
  targetId given? No — target may be deleted already; record as stated scope
  without FK; targetType allowlisted, targetId UUID when present), list
  (`take:100`), release (ACTIVE → RELEASED + reason/by/at; terminal).
- `compliance.operations.ts` — `authorize()` on new `CanManageCompliance`
  (fail-closed); `run()` audited, `read()` under tenant context.
- `compliance.controller.ts` — `GET /v1/compliance/audit-events[ /export]`,
  `POST/GET /v1/compliance/retention/policies`,
  `GET /v1/compliance/retention/evaluate`,
  `POST/GET /v1/compliance/holds`, `POST /v1/compliance/holds/:id/release`.
  SessionGuard+CsrfGuard.
- Permission `CanManageCompliance` (definition + TENANT_ADMIN matrix).
- Audit events `HOLD_CREATED/RELEASED`, `RETENTION_POLICY_SET`,
  `AUDIT_EXPORTED` at all 5 registration sites.
- Migration `20260908000012_phase30_compliance_foundation`: `RetentionPolicy`
  (+ `@@unique([tenantId, targetType])`), `LegalHold` (+ `HoldStatus`), FORCE
  RLS + policies, slice-verified.

## Frontend `apps/web` (`/compliance`, configuration nav, `compliance` ns en+ar)

- `ComplianceClient` + tests; `compliance-page.tsx` (audit / retention / holds
  tabs); `audit-section` (search + export download), `retention-section`
  (policies + evaluate), `holds-section` (create/list/release).
- useAuth only; `messages.test.ts` extended.

## Verification

backend tsc + full jest + nest build + prisma validate; web tsc + vitest +
next build --webpack; independent re-audit; commit/push only on approval.
