# Phase 8 Plan — Matter / Case Management (Core Delivery)

**Plan status:** DRAFT for owner review (audit-reviewed 2026-09-03; see Audit Notes). Execution authorized only after owner sign-off on this plan.

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
- Connect Phase 7's `PartyService` / `CasePartyService` to the Case logic.
- **Gate call semantics (verified against `conflict-gate.service.ts`):**
  `ConflictGateService.assertClearForCase(tx, tenantId, prospectiveParties)` **returns
  `GateVerdict { cleared, blocks, reasons }` and does NOT throw** (read-only, non-enumerating).
  `CaseService` creation MUST:
  1. fetch tenant-scoped party names from the provided `partyIds` (see Open Question #2),
  2. call `await gate.assertClearForCase(tx, ctx.tenantId, prospectiveParties)`,
  3. if `verdict.cleared === false`, throw a new **Phase 8 module error** (e.g.
     `CaseConflictGateRejectedError`) carrying `verdict.blocks`, and return an explicit
     API rejection that prevents case creation.
  - Note: there is NO shared `ConflictGateRejectionError` in the codebase; the rejection error
    is a net-new Phase 8 class, mirroring `PartyAccessDeniedError`.
- Unit-test `case.service.ts` to explicitly prove that a `cleared: false` verdict raises the
  gate-rejection error and prevents the case from being created.

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

> Audit record (2026-09-03): recommended resolutions recorded below. Build proceeds on these
> unless the owner overrides.

1. **Case Number generation** (recommended: **user-provided for now**): the client supplies
   `caseNumber` on create; auto-incrementing per-tenant sequence generation is deferred to the
   configuration phase. Uniqueness enforced via `@@unique([tenantId, caseNumber])`.
2. **Conflict Check Gate** (recommended: **fetch names, feed the gate**): `CaseService` MUST
   resolve the tenant-scoped `Party` rows from the provided `partyIds`, pass
   `prospectiveParties: { name: party.displayName }[]` to `assertClearForCase`, and reject
   creation on `cleared: false`. Not doing so would make the acceptance gate a no-op.

## Audit Notes (2026-09-03)

- **`assertClearForCase` contract verified** — returns `GateVerdict`, does not throw; corrected
  W4's reference to a non-existent shared `ConflictGateRejectionError`.
- **Gate-error class is net-new** — Phase 8 must define `CaseConflictGateRejectedError` (mirrors
  `PartyAccessDeniedError`).
- **Permission/event collisions checked** — `CanManageCases` and all `case.*` audit events are
  absent today (safe to add); `case.party.linked`/`unlinked` are distinct from Phase 7's
  `party.relationship.created`.
- **Suggested W1 refinement (CaseParty constraints)** — mirror prior tables: add
  `@@unique([id, tenantId])` composite PK guard, tenant-checked FKs (`caseId`/`partyId`/`roleId`
  each guarded within the tenant), and `onDelete` semantics consistent with `PartyRelationship`
  (Restrict) vs `PartyRoleAssignment`-style (n/a). Verify the `caseId` FK cannot cross tenants
  (RLS covers reads; FKs keep referential integrity).
- **Terminology** — the Phase 7 interface is `CasePartyLinker`/`CasePartyLink`, not
  `CasePartyContract`; implementer should implement `CasePartyLinker` (W3 `case-party.service.ts`)
  to satisfy Closing condition 3.
- No schema, migration, or code landed in this audit — this is a documentation/decision record
  only.
