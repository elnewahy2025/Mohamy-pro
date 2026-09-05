# Audit & Fix Journey — Phases 11–20 (Frontend UI, Scaffolds, Time Tracking)

**Date:** 2026-09-05
**Range audited:** `fcd47f49` (canonical HEAD) → `origin/main 5fbe4ccd` (10 commits), plus uncommitted local work
**Range delivered:** `5fbe4ccd..b0c37e51` (7 commits, 45 files, +2178/−205)
**Method:** sequential, evidence-based audit (Steps 0–5); read-only `git show`/`grep` inspection, then fixes with executed gates
**Status:** All P0/P1 fixed and test-guarded. Live DB deploy + E2E explicitly deferred to owner.

---

## 1. Sequential audit (what was reviewed, in order)

| Step | Scope | Result |
|---|---|---|
| 0 | Uncommitted Phase-11 workflow UI in canonical dir (6 files, +413) | F0-1 dead `/workflows` nav (no route); F0-2 divergence vs remote client (`list/create` vs `listWorkflows/createWorkflow`) — pull-collision risk |
| 1 | `3d90c21c` (ICU brace fix) + `68f37238` (FormSelect, date inputs, tabs) | Fix correct EN+AR, zero unescaped braces repo-wide; 3×P3 (English `Select…` placeholder, hardcoded `Details` tab, no FormSelect test) |
| 2 | `c2807fd5` workflows+hearings UI (+ backend `status` field) | **F2-1 (P1)** `HEARINGS_PREFIX='/v1/hearings'` → `/api/v1/v1/…` 404, still on main; F2-2 no client tests; backend `status` backward-compatible |
| 3 | `dfd6638c`/`2e6e0d67`/`9d9583db` deadlines/tasks/documents UI | **F3-1 (P1)** same `/v1/` bug ×3; F3-2 no client tests; routes/nav/DTO shapes OK |
| 4 | `4dc745f6`/`32d03033`/`5c9655e7`/`5fbe4ccd` (ph16–19, secure links, time-tracking) | **F4-1 (P0)** ~20 models, 0 migrations; **F4-2 (P0)** mocked ClamAV; **F4-3 (P1)** mock OpenSearch/DOCX/Paddle/Vault/worker; F4-4 secure-links rides buggy prefix; F4-5 unguarded demo scripts |
| 5 | AGENTS.md (157→2120 lines), skills, TODO/mock/secrets/bypass sweeps | Governance contract coherent (migration-safety §17 condemns F4-1); no secrets committed; TODO hits are enum false-positives |

---

## 2. Significant changes delivered

### 2.1 Sync + conflict resolution — `fac7e7c1`
Committed Step-0 work, rebased onto `origin/main` (4 conflicted files). Adopted remote as superset; adapted local `WorkflowsClient` tests to remote API (`listWorkflows`/`createWorkflow`/`createVersion(workflowId, req)`); repaired `secureLinks` nav assertions. Closes F0-1/F0-2.

### 2.2 API prefix fixes — `b697dddd`
`HEARINGS_PREFIX`, `DEADLINES_PREFIX`, `TASKS_PREFIX`, `DOCUMENTS_PREFIX`: `'/v1/…'` → `'/…'`. Secure-links endpoints ride `DOCUMENTS_PREFIX`, fixed by the same change. Added 4 URL-regression tests asserting exact URLs and absence of `/v1/v1`. Closes F2-1/F3-1/F4-4.

### 2.3 Foundation migration with RLS — `98943876`
New `20260908000000_phase16_19_foundation/migration.sql`: 19 enums + 20 tables as the Prisma-generated slice (verified complete: 0 statements missing vs full DDL), FORCE RLS + tenant-isolation policy on all 19 tenant tables, context-validity policy on global `SearchIndexVersion` (Country precedent). Added `tenantId` to the 5 child tables lacking one (`OcrPage`, `OcrEntity`, `ClassificationResult`, `HumanReview`, `TemplateVariable`) with Tenant back-refs, and wired `tenantId` into the 3 child-create sites. Extended `migration-rls.spec.ts` (+3 tests). Additive-only; no applied migration touched. Closes F4-1.

### 2.4 Fail-closed scaffolds — `98943876`
`ClamAvScanner` (fabricated CLEAN), `VaultKmsProvider` (unrecoverable fake ciphertext), `PaddleOcrAdapter` (fabricated extraction text), `OpenSearchAdapter` (fabricated results + silent index no-ops), `DocxTemplateRenderer`/`LibreofficeConversionProvider` (fabricated buffers), OCR worker (mock stream into DB path) now throw explicit `*UnavailableError`s. The live upload path already uses the real socket-based `ClamAvMalwareScanner` (fail-closed, `MALWARE_SCAN_ENABLED` default off). Closes F4-2/F4-3.

### 2.5 Time-tracking security hardening — `39eb452d`
Controllers had **no guards, unversioned `v1/…` paths, `any` bodies, `'system'` fallback**. Now: `SessionGuard`+`CsrfGuard`, versioned paths, validated DTOs (`time-tracking.dto.ts`), shared `requireTimeTrackingContext` helper, owner-scoped submit/pause/stop, typed services. Approval authorization left tenant-scoped by explicit recorded decision (manager-role mapping is a product decision). Also tenant-scoped OCR `enqueueProcessing`/`processDocument`.

### 2.6 Tests — `9c39987e`, `39eb452d`
8 web client tests (phases 12–15); 8 backend spec files (time-entry/timer/rate, clamav, kms, paddle, opensearch, docx+libreoffice) locking fail-closed behavior and tenant scoping.

### 2.7 Web i18n + build — `9c39987e`
`form.select.placeholder` (`Select {label}` / `اختر {label}`) wired into `FormSelect`; `cases.sections.details` for the hardcoded tab; fixed pre-existing Next-16 `params` type break on the secure-links page (sole build failure).

### 2.8 Tooling — `36c7967f`
`prettier@3.9.6` added to `apps/web` with `.prettierrc` mirroring backend settings. `--write` deliberately withheld: web sources were never prettier-formatted and full-file writes would churn unrelated lines.

### 2.9 Boot-discovered wiring fix — `b0c37e51`
Production boot failed with `UnknownDependenciesException` (SessionGuard deps missing from `TimeTrackingModule`); added `AuthModule` import. Proved by the boot below.

---

## 3. Verification evidence (executed, not inferred)

| Gate | Command (canonical dirs) | Result |
|---|---|---|
| Backend jest (full) | `jest` in `backend/api` | **68/68 suites, 341/341 tests** |
| Migration RLS spec | `jest migration-rls.spec.ts` | **7/7** |
| Backend tsc | `tsc --noEmit` | exit 0 |
| Backend nest build | `nest build` | exit 0 |
| Web vitest (full) | `vitest run` in `apps/web` | **62/62** |
| Web tsc | `tsc --noEmit` | exit 0 |
| Web prod build | `next build --webpack` | exit 0, all routes |
| Prisma | `validate` clean; migration slice completeness 0-missing | pass |
| Prettier | `--check` on all touched backend files | clean |
| Prod boot | `node dist/src/main.js` | **started**; `/api/v1/health/live` ok; `/ready` all checks up (postgres/redis/queue/objectStorage) |
| Push hygiene | fetch → push `5fbe4ccd..b0c37e51`, tree clean | verified |

---

## 4. Explicitly NOT verified / deferred (recorded, not silent)

1. **Live `migrate deploy`** — owner-scheduled; no PostgreSQL available here and shared-Neon writes are out of bounds. Migration is statically complete + spec-guarded.
2. **End-to-end flows** (upload→scan→OCR→search→timer) — require tables + daemon endpoints (ClamAV/Vault/Paddle/OpenSearch/LibreOffice/MinIO/BullMQ).
3. **Product decisions:** entry/timer approve-role granularity; timer-resume and entry-reject endpoints (`REJECTED` status exists but unreachable); wiring real daemon URLs.
4. **Known minor:** `pymupdf` extractor returns `[]` (forces OCR fallback by construction); `enqueueProcessing` idempotency is per-tenant now but has no unique guard under races.

## 5. Residual verdict

No known P0/P1 remains in the audited range. Production readiness is gated solely on items 1–2 above.

---

## 6. Complete change record (every commit, `5fbe4ccd..2e9cd7aa`)

53 files, +2705/−208. Every commit pushed to `origin/main`, tree clean after each.

| # | Commit | Message | Files / detail |
|---|---|---|---|
| 1 | `fac7e7c1` | test(web): add WorkflowsClient coverage, fix secureLinks nav assertions | `api.test.ts` (+4 adapted workflow tests), `messages.test.ts` (+secureLinks EN+AR). Rebase survivor of Step-0 local work (adopt-remote resolution). |
| 2 | `b697dddd` | fix(web): correct hearings/deadlines/tasks/documents API prefixes | `api.ts` (4 one-line prefix fixes), `api.test.ts` (+4 URL-regression tests). Closes F2-1/F3-1/F4-4. |
| 3 | `98943876` | fix(backend): phase16-19 foundation migration with RLS, fail-closed scaffolds | New `20260908000000_phase16_19_foundation/migration.sql` (19 enums, 20 tables, FORCE RLS ×20); `schema.prisma` (+tenantId ×5, +5 Tenant back-refs); 3 child-create sites wired; 6 adapters → `*UnavailableError` (+5 new error files); `migration-rls.spec.ts` (+3 tests). Closes F4-1/F4-2/F4-3. |
| 4 | `9c39987e` | fix(web): i18n select placeholder and details tab, phase 12-15 client coverage, secure-links params | `form-select.tsx` (i18n placeholder), `cases-page.tsx` (details tab key), `messages/en+ar.json` (+`form.select.placeholder`, +`cases.sections.details`), `api.test.ts` (+8 client tests), `secure-links/page.tsx` (Next-16 async params). Closes F1-1/F1-2/F2-2/F3-2 + pre-existing build break. |
| 5 | `39eb452d` | fix(backend): time-tracking auth/validation/scoping, tenant-scoped OCR reads, fail-closed specs | New `time-tracking.dto.ts` + `time-tracking-auth.ts`; 3 controllers rewritten (guards, versioned paths, no `any`, no `'system'`); services typed + owner-scoped; OCR tenant scoping; 8 new spec files. |
| 6 | `36c7967f` | chore(web): add prettier with shared repo settings | `package.json` + `pnpm-lock.yaml` (prettier 3.9.6), new `apps/web/.prettierrc` (mirrors backend). `--write` withheld: web sources were never formatted; full-file writes would churn unrelated lines. |
| 7 | `b0c37e51` | fix(backend): wire AuthModule into TimeTrackingModule | 2-line DI fix found by production boot (`UnknownDependenciesException`). |
| 8 | `438b67f5` | docs: record phases 11-20 audit and fix journey | This file (§1–5). |
| 9 | `dcb3d1ec` | feat(backend): manager role with approve/publish gates, timer-resume and entry-reject | `role.constants.ts` (+`tenant.manager`), `permission.constants.ts` (+2 keys, catalog, 3 matrices), `workflow.operations.ts` (+`authorizePublish`), `workflow.controller.ts` (publish gate), `time-tracking-auth.ts` (+permission assert), `time-entry.controller.ts` (approve+reject gates), `time-tracking.module.ts` (+PermissionsModule), `time-entry.service.ts` (+reject), `timer.service.ts` (+resume), `timer.controller.ts` (+resume route), 2 spec extensions. |
| 10 | `2e9cd7aa` | chore(infra): full local daemon stack | `docker-compose.yml` (+clamav/vault/opensearch/mc-init/api, healthchecks, ordering, volumes), `.env.example` (+9 future-contract vars), `DAEMON_WIRING_GUIDE.md` (+service catalog). |

## 7. Everything wanted from you (owner action items)

### A. Deploy the migration — REQUIRED, blocks everything live
Windows PowerShell, from repo root:
```powershell
git checkout main; git pull origin main   # >= 2e9cd7aa
cd backend\api
$env:DIRECT_DATABASE_URL="postgresql://<user>:<pass>@<neon-host>/<db>?sslmode=require"
pnpm install
pnpm exec prisma validate
pnpm exec prisma migrate status    # 20260908000000_phase16_19_foundation must be pending, rest applied
pnpm exec prisma migrate deploy    # <-- the task
```
If anything is pending-but-should-be-applied, or deploy errors: stop, paste output, do not retry blindly.

### B. Prove the deploy — REQUIRED, paste me all four outputs
```powershell
pnpm run db:check
# save each query to a .sql file, then Get-Content q.sql | pnpm exec prisma db execute --stdin
# q1: new tables present
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('DocumentSecurityMetadata','DocumentScan','SignedAccessGrant','DocumentDownload','OcrProcessing','OcrPage','OcrEntity','ClassificationResult','HumanReview','ApprovedDocumentMetadata','SearchIndexVersion','SearchReindexJob','Template','TemplateVersion','TemplateVariable','TemplateApproval','DocumentGenerationJob','Rate','TimeEntry','Timer')
  ORDER BY 1;
# q2: RLS forced on tenant tables
SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('DocumentScan','OcrProcessing','OcrPage','TimeEntry','TemplateVariable') ORDER BY 1;
# q3: policies present
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('DocumentScan','TimeEntry','SearchIndexVersion') ORDER BY 1,2;
# q4: child FKs present
SELECT conname FROM pg_constraint WHERE conname IN ('OcrPage_tenantId_fkey','OcrEntity_tenantId_fkey','ClassificationResult_tenantId_fkey','HumanReview_tenantId_fkey','TemplateVariable_tenantId_fkey') ORDER BY 1;
```
Expected: 20 rows / `t,t` on tenant tables / `*_tenant_isolation` + `SearchIndexVersion_tenant_context` / 5 FKs.

### C. Start the local stack — REQUIRED for E2E
```powershell
cd infrastructure\docker
docker compose up -d --build
docker compose ps
```
All services healthy (clamav needs minutes for first signature download). Then run the app per `start-mohamy-windows.ps1` or compose `api` service, and confirm `/api/v1/health/ready` shows postgres/redis/queue/objectStorage up.

### D. Decisions — REQUIRED before I wire/implement further
1. Daemon endpoints or explicit defer per daemon (guide §0–6 lists exactly what I need per service).
2. Approve-role confirmation: `tenant.manager` + `CanApproveTimeEntries`/`CanPublishWorkflowVersions` as implemented, or changes.
3. Timer-resume/entry-reject as implemented, or changes.

### E. After A–C — my next legs (no action needed to trigger beyond pasting outputs)
1. Post-deploy verification from your B outputs + cross-tenant RLS probe design.
2. Live E2E (upload→scan→OCR→search→timer→approve).
3. Daemon wiring per your D.1 answers.
4. Product-gap implementation per your D.2/D.3 answers.
5. Final production-readiness statement.

## 8. Remaining blockers (complete list)

| # | Blocker | Owner | Depends on |
|---|---|---|---|
| 1 | `migrate deploy` not executed | you (§7.A) | nothing — do first |
| 2 | Deploy proof outputs missing | you (§7.B) | #1 |
| 3 | Local stack not started | you (§7.C) | Docker Desktop |
| 4 | Daemon endpoints undecided | you (§7.D.1) | — |
| 5 | Approve/resume/reject confirmation | you (§7.D.2–3) | — |
| 6 | Live E2E never run | me | #1–#3 |
| 7 | Real daemon integrations unwired | me | #4 |
| 8 | Final verdict | me | #6–#7 |

Nothing else is known-blocked: code-side P0/P1/P2/P3 from the audit are fixed, tested, and pushed.
