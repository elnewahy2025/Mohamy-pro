# Audit Remediation Plan — Phases 10–15 (Backend)

**Document status:** DRAFT for owner review. No code changes made yet.
**Audit date:** 2026-09-03
**Audited commits:** `58ffd6bd` (Phases 10–14), `daf87fe6` (Phase 15). Base: Phase 9 delivery `8fd82d9b`.

**Governing rules (apply to every fix):**
- AGENTS.md additive-only migrations, RLS `FORCE` + `<Table>_tenant_isolation` via `public.app_tenant_context_is_valid()` on every tenant-scoped table.
- `tsc --noEmit` = 0, prettier clean, full jest pass as QA gates (the known `oidc-provider` ESM suite is a pre-existing unrelated failure).
- single-responsibility-file-architecture.
- Fixes are applied as **new additive migrations and new code**, never by editing already-applied migrations after the fact — except where the migration chain has not been deployed anywhere (see P0-1 decision below).
- Ask the owner on ambiguity. Record-not-silent for any deferral.

---

## Executive summary

Phases 10–15 (Case Timeline, Workflows, Hearings, Deadlines, Tasks, Documents) built correct scaffolding — permissions, audit registration (all 88 events across all 4 maps + allowlist), module wiring, service-layer tenant scoping — but are **not production-ready** and would not deploy as-is. The blockers, in order:

1. **P0-1** — Migration chain cannot apply (duplicate tables/FKs + destructive DDL in `20260905100000_workflow_engine_foundation`).
2. **P0-2** — No RLS on any of the 16 new tables (DB-layer tenant isolation absent).
3. **P0-3** — Cross-tenant attach on create in hearings/deadlines/tasks/documents.
4. **P1-1** — Audit metadata/allowlist mismatches make several endpoints **always fail** (transaction rollback).
5. **P1-2** — Missing `CsrfGuard` on all Phase 10–15 controllers.
6. **P1-3** — `CanViewCaseTimeline` not sealed via migration for existing tenants.
7. **P1-4** — Workflow "engine" is definition-storage only; `createVersion` transitions un-buildable; no execution path.
8. Build: generated Prisma client absent → `tsc`/`nest build` broken until `prisma generate` runs.

---

## Remediation workstreams (ordered)

### R0 — Prisma client generation / build gate (prerequisite for all verification)
- Add `prisma:generate` / `postinstall` wiring; run `prisma generate`; confirm `tsc --noEmit` = 0 and `nest build` resolves all new models.
- **Blocked by nothing; enables all subsequent verification.** (Not a code defect; a build-instrumentation gap.)

### R1 — Fix the migration chain (P0-1) — **decision required from owner**
- **Claim:** `20260905100000_workflow_engine_foundation/migration.sql` re-creates `Country/Jurisdiction/Court/CourtLocation` (already in `20260904150000_phase9_legal_config`) and `CaseParty_*` FKs/indexes (already in `20260904120000_case_management_foundation`), and includes destructive `DROP COLUMN`/`DROP TYPE`/`DROP INDEX` on Phase 5–8 tables.
- **Impact:** Applied in order, this migration fails with `relation "...already exists"` / `constraint "...already exists"`.
- **Decision needed:** Has this migration chain been applied to **any** environment (dev/prod) yet?
  - **If NOT applied anywhere:** the safe fix is to **repair the migration files in place** (remove duplicate table/constraint definitions and destructive rollup), because no environment depends on the current hashes. This is the clean, additive-correct end state. (Owner to confirm this is acceptable given migrations would otherwise be immutable.)
  - **If already applied:** do NOT edit in place. Add a corrective additive migration that drops the RLS-less duplicate copies / leaves a no-op marker and documents the rollup. More complex — owner guidance needed.
- **Verification:** fresh-DB `prisma migrate deploy` must complete for the entire chain with no `already exists` errors.

### R2 — Add RLS to all 16 new tables (P0-2)
- New additive migration `20260907..._phase10_15_rls_isolation`:
  - `ENABLE ROW LEVEL SECURITY` + `FORCE` on: Workflow, WorkflowVersion, WorkflowState, WorkflowTransition, Hearing, Deadline, DeadlineRule, Task, Document, DocumentVersion, DocumentTag, DocumentMetadata, DocumentShare, DocumentAccess.
  - `<Table>_tenant_isolation` policy using `public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)` with both USING and WITH CHECK.
  - For child tables without their own `tenantId` (`TaskChecklist`, `TaskDependency`, `DocumentVersion`/`DocumentTag`/`DocumentMetadata`/`DocumentShare`/`DocumentAccess`): add a `tenantId` column (or a policy that resolves the parent's tenantId via subquery). **Prefer adding `tenantId` NOT NULL** for consistency with the rest of the schema, unless the owner prefers subquery policies.
- **Verification:** `\d+ <table>` shows RLS enabled+forced + policy; out-of-tenant raw-SQL query returns zero rows.

### R3 — Cross-tenant attach guards on create (P0-3)
- Add `requireXInTenant` ownership checks (mirror `case.operations.ts:130-141` / `case.service.ts:53-59`) inside the create transaction for:
  - `hearing.service.ts` — `caseId`, `courtId`, `courtLocationId`, `assignedLawyerId` (Membership), `nextHearingId`.
  - `deadline.service.ts` — `caseId`, `ruleId`, `assignedUserId`.
  - `task.service.ts` — `caseId`, `parentTaskId`, `assignedUserId`.
  - `document.service.ts` — `caseId`, `clientId`.
- Reject with the module's access-denied/not-found error on any mismatch; always inside the same transaction.
- **Verification:** attempt cross-tenant create via foreign UUID → rejected; same-tenant → succeeds.

### R4 — Fix audit metadata/allowlist mismatches (P1-1)
- Reconcile every controller-emitted metadata key against `METADATA_ALLOWLIST`:
  - `task.completed`: controller emits `status` → allow `status`.
  - `hearing.outcome.recorded`: emits `status` → allow; `hearing.deleted`: emits `hearingId` → allow.
  - Document status/archive: register a proper `document.status.changed` event in all 4 maps + allowlist (`documentId`,`status`,`previousStatus`) or pass only allowlisted keys.
- Stop the FAILED-path audit write from appending an `error` key absent from any allowlist (drop that write to match `case.operations.ts`, or allowlist `error`).
- Strengthen the completeness-guard test to assert controller-emitted keys are a subset of each event's allowlist (catches this class permanently).
- **Verification:** `recordOutcome`, `completeTask`, `archiveDocument` etc. no longer throw and the DB write commits.

### R5 — Restore `CsrfGuard` on all Phase 10–15 controllers (P1-2)
- Add `CsrfGuard` (from `../auth/session/csrf.guard`) to `@UseGuards(SessionGuard, CsrfGuard)` on: case-timeline, hearing, deadline, task, document, workflow controllers. Ensure `AuthModule` imported where missing.
- **Verification:** controller guard unit tests assert both guards; CSRF-token-less mutation rejected.

### R6 — Seal permissions for existing tenants (P1-3)
- Additive migration seeding `CanViewCaseTimeline` (and confirm the other Phase 10–15 permission rows) into `Permission` and grant to existing built-in admin roles, matching the Phase 8/9 migration seed pattern; or verify/wire `reconcileBuiltInRoles` into a startup/deploy path.
- **Verification:** pre-existing tenant admin can access the timeline feature.

### R7 — Workflows: define scope honestly + fix transition linking (P1-4)
- Fix `createVersion` to build transitions against the server-created state IDs (link by `name` or a two-step create) and validate the state graph (single initial, reachable final, endpoints within the same version+tenant).
- **Scope decision for owner:** Phase 11's full "workflow engine" (execution, case→workflow wiring, `Case.currentStateId` consumption, per-transition audit, conditions/actions) is **not implemented**. Decide: (a) implement the execution engine now, or (b) accept definition-storage-only as a bounded Phase 11 core and defer execution to a later phase (documented, not silent). Recommend (b) to keep this remediation shippable, with the `WORKFLOW_TRANSITION_EXECUTED` event either implemented or removed from the delivery claims.

### R8 — Documents: decide storage scope (P2)
- Current Phase 15 is **metadata-only** (no object-storage upload/download, no `StorageModule` wiring, no mime/size validation, `storageObjectId` is an unvalidated string with no FK).
- **Scope decision for owner:** (a) wire `StorageModule` + multipart upload + authz'd download + real validation; or (b) accept metadata-CRUD-only as the Phase 15 core and clearly record download/upload as deferred (not silent). Storage is security-sensitive — recommend (a) before considering documents production-ready.

### R9 — Tests (P2)
- Add `*.spec.ts` for each new module (case-timeline, workflow, hearing, deadline, task, document): tenant scoping, cross-tenant rejection, status transitions, audit-metadata-key coverage, controller guards, and an RLS-presence migration assertion.

### R10 — Docs + deferral recording (closing)
- Update each `PHASE{10..15}_CORE_DELIVERY_REVIEW.md` to reflect actual delivered scope (strip false "tsc passes" claims until verified, remove "RLS delivered" claims for the 16 tables until R2 lands, correct any overstatement).
- Record all deferrals explicitly.

---

## Requirements traceability matrix (summary)

| Requirement (Plan.txt) | Phase | Implementation | Audit status | Remediation |
|---|---|---|---|---|
| Case Timeline unified append-only log | 10 | case-timeline module | PARTIAL | R4, R5, R6, R9 (append fixed; removeParty event missing) |
| Workflow Engine | 11 | workflows module | PARTIAL (storage only) | R1/R7 (scope + transition link) |
| Hearing Management + Internal Calendar | 12 | hearings module | PARTIAL | R3, R4, R5, R9 (calendar/attendees deferred) |
| Legal Deadline Engine | 13 | deadlines module | PARTIAL (CRUD only) | R3, R4, R5, R9 (engine math deferred) |
| Task Management | 14 | tasks module | PARTIAL | R3, R4, R5, R9 |
| Document Management | 15 | documents module | PARTIAL (metadata only) | R0/R2/R3/R4/R5/R8/R9 |
| DB-level tenant isolation (all) | 10–15 | migrations | **MISSING** | R2 |
| Additive migrations only | 10 | workflow migration | **FAIL** | R1 |
| Cross-tenant attach prevention | 12–15 | services | **MISSING** | R3 |
| CSRF on state changes | 10–15 | controllers | **MISSING** | R5 |
| Build/typecheck green | 10–15 | — | **BLOCKED** (no prisma client) | R0 |

---

## Open decisions for owner (needed before I start fixing)

1. **R1:** Has the migration chain been applied to any environment? If never applied, OK to repair the workflow migration in place (recommended)? Otherwise I'll write a corrective additive migration.
2. **R2:** For child tables without `tenantId`, prefer adding a `tenantId NOT NULL` column (recommended) vs subquery-based RLS policies?
3. **R7:** Accept definition-storage-only Phase 11 core and defer the execution engine (recommended), or implement execution now?
4. **R8:** Wire real object storage for documents now (recommended), or accept metadata-only for this pass?
5. Scope of fixes: proceed through all R0–R10, or stop after R0–R6 (the deploy blockers) for a first review?

## Suggested execution order
R0 → R1 → R2 → R3 → R4 → R5 → R6 → (R7/R8 pending scope answers) → R9 → R10. Each step lands with its QA gates green before moving on.

---

## Verification command set (will run per workstream)
- `node .../typescript/lib/tsc.js --noEmit` (0 errors)
- `prisma validate`
- `prisma migrate diff` (no drift)
- prettier on changed TS
- jest (targeted specs + keep `oidc-provider` ESM as known pre-existing failure)
- fresh-DB `prisma migrate deploy` for R1/R2

## Audit notes
- No files were modified during the audit. Working tree clean at `daf87fe6`.
- The `PHASE{10..15}_CORE_DELIVERY_REVIEW.md` docs' "tsc passes" and "RLS/aligned migrations" claims are **not currently reproducible** (no generated client; no RLS on new tables; migration chain broken).
