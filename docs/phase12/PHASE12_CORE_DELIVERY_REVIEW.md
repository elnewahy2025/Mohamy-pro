# Phase 12 — Hearing Management + Internal Calendar (Core Delivery Review)

## Objective
Implement the backend foundation for Hearing Management from `Plan.txt`, enabling the tracking of case hearings, dates, outcomes, assigned lawyers, and continuations via a unified internal calendar structure.

## Deliverables
- **Data Model**: Implemented the `Hearing` model in `schema.prisma`, mapping relationships to `Case`, `Court`, `CourtLocation`, and `Membership` (assigned lawyer). Implemented a `nextHearingId` self-relation to support a linked list of consecutive hearings.
- **Operations & Logic**: Added `HearingOperations`, `HearingService`, and `HearingController` for secure creation, updates, outcome recording, and listing.
- **Access Control**: Added `CAN_MANAGE_HEARINGS` permission to `permission.constants.ts` and granted it to built-in admin roles (via `20260907010000_phase10_15_permission_seal` + `reconcileBuiltInRoles` startup wiring).
- **Audit Logging**: Recorded detailed system events to the timeline schema including `hearing.created`, `hearing.updated`, `hearing.deleted`, and `hearing.outcome.recorded`.
- **Remediation**: `createHearing` now verifies `caseId`, `courtId`/`courtLocationId` (global or same tenant), `assignedLawyerId`, and `nextHearingId` are visible within the tenant (R3); controller uses `SessionGuard` + `CsrfGuard` (R5); `Hearing` RLS added via `20260907000000_phase10_15_rls_isolation` (R2).

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes cleanly.
- [x] Code is properly formatted using the standard `prettier` rules.
- [x] NestJS unit tests pass for the module (`hearing.service.spec.ts`).
- [~] A live `prisma migrate deploy` against a fresh database is **not** run in this environment (no PostgreSQL available); migrations are validated statically (`prisma validate`) and by `migration-rls.spec.ts`.
- [x] **Verified gates (2026-09-04, `backend/api`):** `tsc --noEmit` EXIT 0 · `nest build` EXIT 0 · `prettier --check` clean · `prisma validate` valid · full `jest` **60/60 suites / 322/322 tests** EXIT 0 (incl. `hearing.service.spec.ts` + formerly-failing `oidc-provider` suite).

## Deferrals
- Internal calendar visualization UI and attendee/calendar aggregation are not implemented in this phase.

## Next Steps
The Hearing Management backend foundation is sealed. We are prepared to start integration of the Legal Deadline Engine (Phase 13) or begin visualizing the calendar features in the UI.
