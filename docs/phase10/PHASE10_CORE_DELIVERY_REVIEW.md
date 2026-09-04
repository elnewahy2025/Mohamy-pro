# Phase 10: Case Timeline Delivery Review

## What was delivered
- `CaseTimelineEventType` enum and `CaseTimelineEvent` schema with tenant isolation RLS.
- Authored Prisma migration `20260904160000_case_timeline_foundation`.
- `case-timeline` module exposing endpoints to fetch and add explicit timeline events (`GET` and `POST` `/cases/:caseId/timeline`).
- Injected audit event tracking for timeline events and added `timeline.event.recorded` to the `audit-constants.ts` and `metadata allowlist`.
- Added `CAN_VIEW_CASE_TIMELINE` permission and granted it to built-in admin roles (via `20260907010000_phase10_15_permission_seal` + `PermissionsService.reconcileBuiltInRoles` startup wiring).
- Hooked `CaseService` methods (`createCase`, `updateCase` for status changes, and `addParty`) to automatically emit `CaseTimelineEvent`s.
- Remediation: `recordEvent` now rejects appending to a case outside the active tenant (R3); controller uses `SessionGuard` + `CsrfGuard` (R5).

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes (verified 2026-09-04: EXIT 0).
- [x] Prettier format rules adhered to.
- [x] NestJS unit tests pass for the module (`case-timeline.service.spec.ts`) and audit allowlist.
- [~] A live `prisma migrate deploy` against a fresh database is **not** run in this environment (no PostgreSQL available); migrations are validated statically (`prisma validate`) and by `migration-rls.spec.ts`.
- [x] **Verified gates (2026-09-04, `backend/api`):** `tsc --noEmit` EXIT 0 · `nest build` EXIT 0 · `prettier --check` clean · `prisma validate` valid · full `jest` **60/60 suites / 322/322 tests** EXIT 0 (incl. `case-timeline.service.spec.ts` + formerly-failing `oidc-provider` suite).

## Next Steps
The backend foundation for the append-only Case Timeline is complete. The Frontend can now begin visualizing the case history.
