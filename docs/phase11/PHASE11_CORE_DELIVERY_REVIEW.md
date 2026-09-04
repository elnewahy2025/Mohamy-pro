# Phase 11 — Workflow Engine (Core Delivery Review)

## Objective
Deliver the dynamic Workflow Engine backend from `Plan.txt`, enabling the definition of workflow states, versions, and transition requirements for different case types.

## Deliverables
- **Data Model**: Implemented `Workflow`, `WorkflowVersion`, `WorkflowState`, and `WorkflowTransition` models in `schema.prisma`. Migrations initially contained duplicate/destructive statements and could not be applied; the broken `20260905100000_workflow_engine_foundation` migration was repaired in place (R1) to be additive and applyable (removed duplicate Country/Jurisdiction/Court/CourtLocation and CaseParty statements, a `DROP TYPE` of a type that never existed, and a destructive `DROP INDEX`). Tenant isolation RLS added to all four tables via `20260907000000_phase10_15_rls_isolation` (R2).
- **Operations & Logic**: Implemented `WorkflowOperations`, `WorkflowService`, and `WorkflowController` to allow fetching, creating, updating, and publishing workflows and their versions safely. `createVersion` now links transitions to server-created state IDs by name and validates that each version has exactly one initial state and that transition endpoints exist within the version (R7).
- **Access Control**: Added `CAN_MANAGE_WORKFLOWS` permission to the application catalog and granted it to built-in admin roles (via `20260907010000_phase10_15_permission_seal` + `PermissionsService.reconcileBuiltInRoles` startup wiring).
- **Audit Logging**: Recorded system changes using `workflow.created` and `workflow.version.published` events.
- **Scope note (deferred)**: This phase ships **workflow definition/storage only**. The execution engine (`Case.currentStateId` consumption, per-transition execution, `workflow.transition.executed`, condition/action evaluation) is **not implemented** and is deferred to a later phase (recorded, not silent).

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes cleanly.
- [x] Code is formatted via `prettier`.
- [x] NestJS unit tests pass for the module (`workflow.service.spec.ts`).
- [~] A live `prisma migrate deploy` against a fresh database is **not** run in this environment (no PostgreSQL available); migrations are validated statically (`prisma validate`) and by `migration-rls.spec.ts`.
- [x] **Verified gates (2026-09-04, `backend/api`):** `tsc --noEmit` EXIT 0 · `nest build` EXIT 0 · `prettier --check` clean · `prisma validate` valid · full `jest` **60/60 suites / 322/322 tests** EXIT 0 (incl. `workflow.service.spec.ts` + formerly-failing `oidc-provider` suite).

## Next Steps
The backend for workflow definitions is successfully isolated and completed. The frontend team can begin integration to visualize the dynamic workflow graph.
