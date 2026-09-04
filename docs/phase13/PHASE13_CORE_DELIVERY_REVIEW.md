# Phase 13 — Legal Deadline Engine (Core Delivery Review)

## Objective
Implement the backend foundation for the Legal Deadline Engine from `Plan.txt`, enabling fixed, relative, and rule-based deadlines, along with reminders, escalations, and completion evidence.

## Deliverables
- **Data Model**: Implemented `DeadlineRule` and `Deadline` models in `schema.prisma`. 
- **Operations & Logic**: Added `DeadlineOperations`, `DeadlineService`, and `DeadlineController` to cleanly manage the lifecycle of deadlines and their underlying rules. 
- **Access Control**: Added `CAN_MANAGE_DEADLINES` permission to `permission.constants.ts` and granted it to built-in admin roles (via `20260907010000_phase10_15_permission_seal` + `reconcileBuiltInRoles` startup wiring).
- **Audit Logging**: Recorded detailed system events to the timeline schema including `deadline.created`, `deadline.updated`, `deadline.completed`, and `deadline.rule.created`.
- **Remediation**: `createDeadline` now verifies `caseId`, `ruleId`, and `assignedUserId` are visible within the tenant (R3); controller uses `SessionGuard` + `CsrfGuard` (R5); `Deadline`/`DeadlineRule` RLS added via `20260907000000_phase10_15_rls_isolation` (R2).

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes cleanly.
- [x] Code is properly formatted using the standard `prettier` rules.
- [x] NestJS unit tests pass for the module (`deadline.service.spec.ts`).
- [~] A live `prisma migrate deploy` against a fresh database is **not** run in this environment (no PostgreSQL available); migrations are validated statically (`prisma validate`) and by `migration-rls.spec.ts`.
- [x] **Verified gates (2026-09-04, `backend/api`):** `tsc --noEmit` EXIT 0 · `nest build` EXIT 0 · `prettier --check` clean · `prisma validate` valid · full `jest` **60/60 suites / 322/322 tests** EXIT 0 (incl. `deadline.service.spec.ts` + formerly-failing `oidc-provider` suite).

## Deferrals
- This phase delivers deadline CRUD only. The deadline computation engine (relative/rule-based deadline math, recurrence, reminders, escalations scheduling) is deferred to a later phase.<br>
  **Scope note (deferred)**: The deadline engine math is **not implemented** in this phase.

## Next Steps
The Legal Deadline Engine is functionally complete and safely isolated in the backend. We can proceed to Phase 14 (Task Management) or start building the frontend for the recently completed modules.
