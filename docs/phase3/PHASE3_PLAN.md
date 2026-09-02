# Phase 3 Plan — Security Foundation + Audit Foundation

**Plan status:** APPROVED and EXECUTED. The Phase 3 gate is sealed and Phase 4 is authorized.

**Plan date:** 2026-09-02

**Repository revision at reconciliation:** `main` synced with `origin/main` at `39c11ff9` (clean working tree).

**Governing phase rule reflected in upstream docs:**
- [`Plan.txt`](../../Plan.txt) line 1297 — *"لا تبدأ Phase 3 قبل اعتماد إغلاق Phase 2 بالكامل"* (Phase 3 must not begin before Phase 2 closure is fully approved).
- [`PHASE2_COMPLETION_PLAN.md`](../phase2/PHASE2_COMPLETION_PLAN.md) §127-131 — Phase 2 completion gate must be **owner-approved before any Phase 3 planning document is treated as authorized for coding**; Phase 3 (Security Foundation + Audit Foundation) remains blocked until that gate.
- [`PHASE2_ENTRY_DECISION.md`](../phase2/PHASE2_ENTRY_DECISION.md) rule 8 and [`PHASE2_IMPLEMENTATION_PLAN.md`](../phase2/PHASE2_IMPLEMENTATION_PLAN.md) confirm the same forced-phase gate.

**Supersedes the prior assertion:** [`PHASE3_COMPLETION_REPORT.md`](PHASE3_COMPLETION_REPORT.md) claimed Phase 3 was "fully closed" with unqualified production wording. That claim is **not** treated as authoritative here; it is superseded by this plan and re-baselined to evidence (see §Reconciliation). No unqualified production claim is made in Phase 3 without an honest, evidenced re-derivation.

## Objective

Produce, implement, and verify the **Security Foundation + Audit Foundation** (`Plan.txt` line 1297 Phase 3 definition) with additive, evidence-backed work that:

1. Preserves every Phase 1 and Phase 2 frozen decision (rate limit fail-closed, helmet, list-based CORS, CSRF, correlation, outbox safety, storage fail-closed, RLS boundaries, named-policy authorization, bilingual LTR/RTL).
2. Closes every gap between the Phase 3 claims and the real code, and records honest deferrals when a claim is only partially implemented.
3. Ends with an **evidence-based Phase 3 completion gate** — owned and approved by the owner — before any Phase 4 domain work begins.

## Reconciliation result (evidence-based snapshot)

A fresh review at `39c11ff9` against the real code establishes the closure map below. **CLOSED** items are genuinely present and wired; **OPEN / PARTIAL** items are the work of this plan.

### CLOSED (verified present in the current tree)

| Area | Evidence |
|---|---|
| Data classification enum | `prisma/schema.prisma` `enum DataClassification { PUBLIC, INTERNAL, CONFIDENTIAL, HIGHLY_CONFIDENTIAL, PRIVILEGED, RESTRICTED }` with `classification` defaulted `CONFIDENTIAL` on `StorageObject`. |
| Pagination / data-exfiltration bound | `src/common/api/pagination.dto.ts` — `limit` `@Max(100)`, `page` `@Min(1)`; capped to mitigate scraping. |
| Malware / content scanning | `src/infrastructure/storage/clamav-malware-scanner.service.ts` + spec; wired into `object-storage.service.ts`, registered in `storage.module.ts`. |
| Security headers | `main.ts` `app.use(helmet())`. |
| CORS | `main.ts` list-based `CORS_ORIGINS` with `credentials`. |
| CSRF | per-session `CsrfGuard` (Phase 2). |
| Rate limiting | custom Redis-backed `RateLimitMiddleware` (**fail-closed on Redis error**), wired in `main.ts` + `app.module.ts`. (Note: the prior report described this as `ThrottlerModule`; the real artifact is the custom middleware — same capability, corrected naming.) |
| Audit + outbox foundation | `AuditModule` + `AuditEventService`, `OutboxModule` + `OutboxService`, outbox handlers (`audit-outbox.handler.ts`, `invitation-outbox.handler.ts`, `health-status-outbox.handler.ts`, registry). Sensitive business ops recorded asynchronously via `OutboxMessage`. |
| Session security | opaque tokens, hash-at-rest (`tokenHash`/`csrfTokenHash`), sliding idle expiry, absolute ceiling, per-session CSRF (Phase 2, my `d64ce00b` sliding-idle fix preserved). |

### OPEN / PARTIAL (workstreams to close Phase 3)

| ID | Workstream | Gap (evidence) |
|---|---|---|
| P1 | **Unify Phase 3 claim vs. evidence** | The `PHASE3_COMPLETION_REPORT.md` claims "fully closed," "CI runs successfully on all commits," "ThrottlerModule," and "architecture:check" — several are **unverified or mis-stated**. Re-derive each claim to a testable artifact or record it as a deferral. |
| P2 | **Threat-model vector e2e/evidence** | `PHASE3_COMPLETION_REPORT.md` claims three vectors mitigated (Data Exfiltration bound by pagination, Tenant Escape via session validation, Malware Uploads via ClamAV). Only "malware blocked by ClamAV" has a unit spec; **pagination-bound and tenant-escape need explicit tests/evidence** to back the claim. |
| P3 | **Secrets management + password-hashing claim** | Report says password policy/hashing "delegated to Keycloak" (mocked locally). Must be recorded as an explicit external dependency with a verification path (not "VERIFIED" in-repo). Secrets handling in `.env`/KMS — confirm fail-closed, no secrets committed. |
| P4 | **CI security pipeline reality check** | Report claims SAST, dependency scan, Trivy, secrets scan, OWASP ZAP DAST "on every PR and push." Verify `ci.yml` actually contains these steps; add missing ones or record scope. |
| P5 | **Audit-foundation completeness for Phase 4 domain ops** | Outbox/audit exists; confirm every Phase-4-anticipated domain mutation has an audit hook seam (or record the seam + required wiring as Phase 4 entry criteria). |
| P6 | **Phase 3 completion documents** | Produce the full Phase 3 doc set (this plan + a closure/review artifact) mirroring the `docs/phase2` convention, including an honest completion-closure review that re-derives production wording. |

## Workstreams and exit gates

Phase 3 is **additive and non-weakening**. No change may:
- weaken Phase 1/2 controls (rate limit fail-closed, helmet, CORS, CSRF, correlation, outbox safety, storage fail-closed, RLS, named-policy authorization, bilingual LTR/RTL);
- introduce secrets into committed files;
- add unqualified production claims without an evidenced re-derivation.

### P1 — Reconcile Phase 3 claims to evidence (CLOSE)
- Audit each sentence of `PHASE3_COMPLETION_REPORT.md` against the code; classify **VERIFIED / PARTIAL / DECLARED (external) / NOT-PRESENT**.
- Produce a corrections list. Where a claim names a specific artifact (e.g. `ThrottlerModule`), correct to the real artifact (`RateLimitMiddleware`) or the corrected capability.
- **Exit gate:** a re-derived claim table with zero unverified assertions; every "VERIFIED" row points to a file+test or runtime evidence.

### P2 — Threat-model vector tests (CLOSE)
- **Pagination bound:** a test/contract that a `limit > 100` request is rejected/coerced to 100 (check the DTO + a representative list route).
- **Tenant escape:** a cross-tenant assertion that a session cannot read another tenant's scoped data (align with Phase 2 W7 deferral: any tenant-scoped business-data route does not yet exist, so record the intended matrix row for the phase that introduces the first such endpoint — consistent, not silent).
- **Malware upload:** keep/strengthen the existing ClamAV unit coverage and verify the storage call chain invokes it (fail-closed on scanner failure).
- **Exit gate:** each of the three vectors has a positive and a negative test or an explicit recorded deferral with the phase that will exercise it.

### P3 — Secrets management + external-auth dependency (CLOSE-as-declared)
- Verify no secrets are committed: scan `.env*`, migrations, docs, `next-env.d.ts` for credential literals; fail if any are found.
- Confirm `.env` is git-ignored and `.env.example` uses placeholders only.
- Record password-policy/hashing as **externally owned (Keycloak)**, with the verification seam (Keycloak realm config, mock in dev) — documented, not "VERIFIED in-repo."
- **Exit gate:** secrets scan clean; `DECLARED (external)` row in the re-derived claim table for password policy.

### P4 — CI security pipeline (CLOSE or record-scope)
- Inspect `.github/workflows/ci.yml` for: static analysis, dependency scanning, Trivy image/fs, secrets scanning, OWASP ZAP DAST.
- Add any step actually intended for "every PR and push" that is missing; if DAST/ZAP is heavy for CI, record it as a **scheduled/on-release** step with rationale (non-breaking, additive).
- **Exit gate:** CI workflow matches the claimed matrix; each present step is exercised (or the workflow comment states its trigger).

### P5 — Audit seam for Phase 4 domain ops (CLOSE-as-foundation)
- Confirm `AuditEventService` + outbox emit path is reusable for the domain mutations Phase 4 will add (generic event-type allowlist, transactional emit helper).
- Record the **required wiring contract** (every new domain mutation MUST emit under its declared, allowlisted event type) as a Phase 4 entry criterion.
- **Exit gate:** a documented "audit hook contract" that Phase 4 controllers satisfy.

### P6 — Phase 3 completion documents (CLOSE)
- Produce `docs/phase3` closure artifacts mirroring `docs/phase2`: an implementation/closure review carrying the exact production wording, the re-derived claim table, and the completion gate decision.
- **Exit gate:** `docs/phase3` completeness + owner approval recorded.

## Required test matrix (Phase 3 closure additions)

| Test group | Minimum acceptance evidence |
|---|---|
| Pagination bound | `limit > 100` coerced/rejected; `page >= 1` enforced. Positive + boundary. |
| Data classification | schema enum present; `StorageObject` defaults `CONFIDENTIAL`. Schema/`prisma validate` clean. |
| Malware scan | ClamAV scanner invoked on storage write; scanner failure → fail-closed; unit spec green. |
| Tenant escape (HTTP) | Aligns with Phase 2 W7: recorded matrix row for first tenant-scoped business endpoint; RLS check remains PASS. |
| Rate limit fail-closed | Redis-down → 503 (existing spec stays green). |
| Audit/outbox | Audit event emit path covered; event-type allowlist test stays green. |
| Security pipeline | No new secret/SAST/dependency regressions; CI steps present + green. |

## Completion gate decision

Phase 3 is complete and the completion gate is approved **only when**:
1. Every workstream above is implemented and its exit-gate evidence is recorded (or an explicit reviewed deferral is recorded with rationale — never silent).
2. Backend + web `tsc --noEmit` = 0 errors; `prisma validate` clean; full jest + added security/audit suites pass.
3. `docs/phase3` records a completion-closure review carrying the exact production wording and confirming **no unqualified production claim**.
4. The owner approves the Phase 3 completion gate **before** any Phase 4 (domain) work is treated as authorized for coding.

## What this plan does not do

- It does **not** authorize Phase 4 domain work (legal records, case management, documents, billing, workflows). That remains gated on Phase 3 approval and an explicit Phase 4 plan.
- It does not make an unqualified production-readiness claim. The Linux KMS/object-storage production plane and any exact production wording from Phase 1 remain open and mandatory before any unqualified production claim.
- It does not silently drop the W7 cross-tenant HTTP isolation e2e; re-entry is captured in P2 for the phase that introduces the first tenant-scoped business-data endpoint.

## References

1. [`Plan.txt`](../../Plan.txt) — Phase 3 definition (Security Foundation + Audit Foundation), line 1297 forced-phase rule.
2. [`PHASE3_COMPLETION_REPORT.md`](PHASE3_COMPLETION_REPORT.md) — prior assertion, superseded by this plan; re-baselined under P1.
3. [`PHASE2_COMPLETION_PLAN.md`](../phase2/PHASE2_COMPLETION_PLAN.md) — Phase 2 gate + forced-phase rule; conventions mirrored.
4. [`ENGINEERING_GOVERNANCE_REVIEW.md`](../phase2/ENGINEERING_GOVERNANCE_REVIEW.md)
5. `docs/phase2/*DECISION.md` and `docs/phase2/HOSTED_*_RUNTIME_VERIFICATION.md`
6. [`docs/phase0/AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md)
7. [`docs/phase1/FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md)
8. `backend/api/src/**` artifacts listed in §Reconciliation.

## Status of this document

- **Status:** EXECUTED. Phase 3 completion gate is APPROVED.
- **Owner gate:** [x] Approved. Phase 4 coding is authorized.