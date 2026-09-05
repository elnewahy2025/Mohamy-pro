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
