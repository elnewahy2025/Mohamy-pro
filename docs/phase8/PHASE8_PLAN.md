# Phase 8 Plan — Matter / Case Management (Core Delivery)

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off on this plan.

**Plan date:** 2026-09-03

**Governing phase rules (enforced):**
- `Plan.txt` line 1262 — Phase 8 is `Matter / Case Management`. Forced-phase rule applies.
- `Plan.txt` §401-431 — Phase 8 objective/scope.
- AGENTS.md: additive migrations only; tenant isolation enforced in both the application layer (`prisma.withTenantContext`) and database layer (RLS `FORCE`); tsc 0, prettier clean, full jest pass as QA gates; ask owner on ambiguity.
- single-responsibility-file-architecture skill: each responsibility in its own focused file.
- Bounded, gate-approvable core delivery with sequenced, recorded-not-silent deferrals.

## Objective

Implement the **Matter / Case Management** foundation from `Plan.txt` as a bounded, gate-approvable core delivery:

1. A tenant-scoped **`Case`** entity representing the canonical legal record. It will carry core fields (numbers, dates, status, priority, practice area, type) and link to the `Client` entity (Phase 5).
2. The physical **`CaseParty`** table to fulfill the `CasePartyContract` defined in Phase 7, securely linking parties to cases with roles.
3. **Acceptance Gate Wiring**: Case creation MUST invoke the Phase 6 `ConflictGateService` (`assertClearForCase`) to ensure no blocked parties bypass conflict checks.

**Deliberately deferred (sequenced, recorded not silent):**
- `Court` and `Jurisdiction` (Explicitly defined as Phase 9 in `Plan.txt`).
- Extended catalog promotion for `PracticeArea`, `CaseType`, `Status` (deferred to `OrganizationSetting` config UI, will use string enums or raw text for now).
- `Hearings`, `Tasks`, `Deadlines`, `Documents`, `TimeEntries`, `Invoices` (Explicitly sequenced as Phases 10-21).
- Frontend UI (backend-first).

## Delivery workstreams

### W1 — Schema + additive migration (`20260904120000_case_management_foundation`)
- New enums: `CaseStatus` (e.g., `OPEN`, `CLOSED`, `ON_HOLD`), `CasePriority` (e.g., `LOW`, `NORMAL`, `HIGH`, `URGENT`).
- `model Case`: `id`, `tenantId`, `caseNumber` (unique per tenant), `internalNumber` (optional), `clientId` (tenant-checked FK), `practiceArea`, `caseType`, `status CaseStatus @default(OPEN)`, `priority CasePriority @default(NORMAL)`, `openDate`, `closeDate`, timestamps.
  - `@@unique([tenantId, caseNumber])`, `@@index([tenantId, status])`.
- `model CaseParty`: The physical realization of the Phase 7 contract. `id`, `tenantId`, `caseId`, `partyId`, `roleId`, `status`, timestamps.
  - `@@unique([tenantId, caseId, partyId, roleId])`.
- Additive migration: CREATE tables, `FORCE RLS` + `_tenant_isolation`, seed `CanManageCases` permission.

### W2 — Permissions + audit
- `PERMISSION_KEYS.CAN_MANAGE_CASES = 'CanManageCases'`; add to `PERMISSION_CATALOG` and `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- New audit events: `case.created`, `case.updated`, `case.status_changed`, `case.party.linked`, `case.party.unlinked`. Add to `METADATA_ALLOWLIST`.

### W3 — `cases/` module
- `cases.module.ts`: Imports `AuthModule` and `ConflictChecksModule` (for the gate).
- `case.operations.ts`: Shared RLS auth & execution helpers.
- `case.service.ts`: CRUD for cases. **Creation logic must run `ConflictGateService.assertClearForCase` first.**
- `case-party.service.ts`: Implements `CasePartyLinker` from Phase 7.
- `case.controller.ts`: REST endpoints (`POST /cases`, `GET /cases`, `GET /cases/:id`, `PATCH /cases/:id`, `POST /cases/:id/parties`, `DELETE /cases/:id/parties/:partyId`).

### W4 — Acceptance Gate & Contract Enforcement
- Connect Phase 7's `PartyService` or `CasePartyService` to the Case logic.
- Unit-test `case.service.ts` to explicitly prove that `ConflictGateService.assertClearForCase` block decisions result in an explicit API rejection (`ConflictGateRejectionError`) and prevent the case from being created.

### W5 — QA Gates
- `tsc --noEmit` = 0; `prisma validate` clean; prettier clean; full jest pass.

### W6 — Docs
- Author `PHASE8_CORE_DELIVERY_REVIEW.md` and record explicit deferrals.

## Closing conditions
1. A user with `CanManageCases` can create a Matter/Case.
2. Case creation is physically blocked by the application layer if `assertClearForCase` yields `cleared: false` (Phase 6 integration).
3. The `CaseParty` table fulfills the exact interface of `CasePartyContract` (Phase 7 integration).
4. Full tenant isolation via RLS.

## Open Questions for Owner
1. **Case Number generation**: For this initial phase, should `caseNumber` be provided by the client (user input), or should we build an auto-incrementing sequence generator within the tenant boundary? (Recommendation: user-provided for now, with auto-generation deferred to a configuration phase).
2. **Conflict Check Gate**: Currently, `assertClearForCase` expects `prospectiveParties: { name: string }[]`. When creating a case, the user might provide just `clientId` and `partyIds`. Should `CaseService` fetch the names of these parties to pass to the conflict gate before creating the case? (Recommendation: Yes, fetch names from `partyId`s to feed the gate).
