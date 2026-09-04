# Phase 8 Core Delivery Review: Matter / Case Management

> **Status:** DELIVERED — Phase 8 backend core delivery, the Matter / Case Management foundation
> called out in `PHASE8_PLAN.md` and `Plan.txt` §401-431. This review closes the delivery-document
> follow-up (the plan's W6 workstream called for this review, and it was not yet authored).
> **Delivery Date:** 2026-09-04 (frontend-follow-up session; core code + migration verified present)
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).

## What Was Delivered

The **Matter / Case Management** foundational core is delivered, closing the Phase 8 scope boundary.

1. **Case Primitives (Schema & Migration)**:
   - `Case`, `CaseParty`, and `CaseTimelineEvent` schemas added with strict `tenantId` boundaries.
   - `20260904120000_case_management_foundation` additive migration creates the `Case` + `CaseParty`
     tables with `FORCE ROW LEVEL SECURITY` and `_tenant_isolation`, and idempotently seeds the
     `CanManageCases` permission.
   - `20260904160000_case_timeline_foundation` additive migration creates the append-only
     `CaseTimelineEvent` projection.
   - `CaseStatus` (`OPEN`/`ON_HOLD`/`CLOSED`) and `CasePriority` (`LOW`/`NORMAL`/`HIGH`/`URGENT`)
     enums; `CaseParty` with `@@unique([tenantId, caseId, partyId, roleId])` and tenant-checked FKs
     (`caseId` Cascade, `partyId`/`roleId` Restrict).

2. **Permissions & Audit**:
   - `CanManageCases` permission key added and wired to the `tenant.admin` role.
   - `CanViewCaseTimeline` permission key added (read-only timeline projection access).
   - Audit events `case.created`, `case.updated`, `case.party.added`, `case.party.removed`
     registered across the audit maps with `METADATA_ALLOWLIST` entries
     (`case.created`: caseNumber/partyCount; `case.party.added`: partyId/roleId; etc.), so the
     completeness-guard test passes without exposing sensitive identifiers.

3. **Cases Module**:
   - `cases/case.module.ts` imports `AuthModule` + `ConflictChecksModule`; registered as `CaseModule`
     in `app.module.ts` alongside `CaseTimelineModule`.
   - `case.operations.ts` shared RLS/`authorize`/`run`/`read`/`requireCaseInTenant` helpers with
     `CAN_MANAGE_CASES` scoping.
   - `case.service.ts` CRUD (create, get with nested party/role details, list, update) plus
     `addParty`/`removeParty` inline linking; `case.controller.ts` exposes all six REST routes.
   - `case.errors.ts` defines `CaseAccessDeniedError` and the net-new `CaseGateRejectionError`
     (HTTP 400) carrying the conflict-gate `blocks` array.

4. **Acceptance Gate Wiring (Phase 6 integration)**:
   - `CaseService` resolves the tenant-scoped `Party` rows from `partyIds` and calls
     `ConflictGateService.assertClearForCase` before creation; a `cleared: false` verdict raises
     `CaseGateRejectionError` carrying `verdict.blocks`, physically preventing case creation when a
     prospective party is blocked.
   - `addParty` runs the same gate before linking a party to a case.

5. **CaseParty Linking Contract fulfilment**:
   - The physical `CaseParty` table realizes the Phase 7 `CasePartyLinker`/`CasePartyLink` contract;
     linking/unlinking is implemented in `CaseService` (`addParty`/`removeParty`) against the
     tenant scoping + audit semantics the contract documents.

6. **QA Gates**:
   - `tsc --noEmit` exit 0 (verified in the frontend-follow-up session against the full monorepo).
   - `prisma validate` clean; additive migrations hand-authored to codebase conventions with
     `prisma migrate diff` flagged for owner verification on a DB-reachable machine.
   - `case.service.spec.ts` proves `cleared: false` gates case creation.

## Explicit Deferrals (Recorded, Not Silent)

As agreed in the Phase 8 plan:

1. **Court / Jurisdiction** — deferred to Phase 9.
2. **Extended catalog promotion** (`PracticeArea`, `CaseType`, `Status`) — string enums / raw text
   for now; `OrganizationSetting` config UI deferred.
3. **Hearings, Tasks, Deadlines, Documents, TimeEntries, Invoices** — sequenced as Phases 10-21.
4. **Frontend UI** — closed by `PHASE8_FRONTEND_UI_DELIVERY_REVIEW.md` (this follow-up session).

## Next Steps

Phase 8 is sealed for owner review. Once approved, the project can proceed to
**Phase 9 (Courts / Jurisdiction)** per the forced-phase rule.

## Owner Approval

- [ ] **Approved** — Phase 8 (Matter / Case Management) core delivery is accepted. Phase 9 may begin
      after the forced-phase gate is satisfied.

## References

- `PHASE8_PLAN.md` (plan; W1-W6 workstreams)
- `Plan.txt` §401-431 (Phase 8 objective/scope), line 1262 (phase order), line 1297 (forced-phase rule)
- `backend/api/src/cases/` (module implementation + `case.service.spec.ts`)
- `backend/api/prisma/migrations/20260904120000_case_management_foundation/` and
  `20260904160000_case_timeline_foundation/`
- `PHASE7_CORE_DELIVERY_REVIEW.md` (the `CasePartyLinker` contract this phase realizes)
- `docs/phase8/PHASE8_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up)
