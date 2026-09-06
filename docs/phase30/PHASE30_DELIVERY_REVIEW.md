# Phase 30 (Audit + Compliance + Retention + Legal Hold) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/compliance/` on top of the existing audit foundation:

- `audit-query.service.ts` — tenant-scoped audit search (filters, `take:100`,
  allowlisted select incl. metadata) + capped CSV export (`take:1000`,
  watermark, reuses transfer's pure `toCsv`).
- `retention.service.ts` — one policy per (tenant, targetType) via upsert
  (targetType allowlisted to `AUDIT_EVENT` in v1; years 1–30); `evaluate()`
  reports eligible vs held counts per policy.
- `hold.service.ts` — holds (tenant-wide or scoped to an allowlisted
  targetType + optional UUID targetId; targetId requires targetType), list
  (`take:100`), terminal release with reason/by/at; terminal updates via
  composite `id_tenantId`.
- `compliance.operations.ts` + `compliance.controller.ts`
  (`GET audit-events[/export]`, `POST/GET retention/policies`,
  `GET retention/evaluate`, `POST/GET holds`, `POST holds/:id/release`;
  SessionGuard+CsrfGuard) + module → `app.module.ts`.
- Permission `CanManageCompliance` (definition + TENANT_ADMIN matrix).
- Audit `hold.created/released`, `retention.policy.set`, `audit.exported` at
  all 5 registration sites (constants ×4 + `METADATA_ALLOWLIST`).
- Migration `20260908000012_phase30_compliance_foundation`: `RetentionPolicy`
  + `LegalHold` + `HoldStatus`, FORCE RLS + policies, slice-verified complete.
- Explicit non-goal: no destructive purge ships in v1, so holds cannot be
  violated by automation that does not exist; delete-path wiring deferred.

Frontend `apps/web` (`/compliance`, configuration nav, en+ar `compliance` ns):

- `ComplianceClient` + 3 client tests; `compliance-page.tsx` (audit /
  retention / holds tabs) with `audit-section` (search + CSV download),
  `retention-section`, `holds-section`; useAuth only.
- `messages.test.ts` navigation assertions extended with `compliance`.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **538/538** (incl. 6 compliance specs) |
| backend `nest build` | exit 0 |
| `prisma validate` | valid |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **104/104** (incl. 3 ComplianceClient tests) |
| web `next build --webpack` | exit 0 (`ƒ /[locale]/compliance` present) |

## Independent re-audit (2026-02-22) — CONDITIONAL APPROVE, all closed

No P0. All four findings remediated before push:

- **P1 user-ID leak in search**: `AUDIT_SELECT` carried `actorUserId`; dropped
  (export already excluded it; `actorMembershipId` retained for trail use).
- **P2 scoped holds unreachable**: `ComplianceClient.createHold` now accepts
  optional `targetType`/`targetId`, and the holds section exposes both fields.
- **P2 bare Error**: `retention.setPolicy` now throws
  `ComplianceInvalidStateError` (400, not 500).
- **P2 duplicate catalog entry**: pre-existing doubled `CAN_MANAGE_EXPORTS`
  definition removed (permission suites still green).

Post-remediation gates: backend **538/538**, web **104/104**, both builds exit 0.

## Traceability

- `docs/phase30/PHASE30_DESIGN.md`, `tasklist.md`, this review.
- Nothing committed or pushed — awaiting independent re-audit + your approval
  per standing order.
