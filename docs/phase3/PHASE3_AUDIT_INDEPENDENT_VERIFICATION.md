# Phase 3 Independent Audit — Live Verification

> **Status:** AUTHORITATIVE — independent re-verification of the Phase 3 codebase on origin `main`.
> **Origin HEAD audited:** `08552c9e4a0b492c516cc1676e541e8d65e7eca0`
> **Date:** 2026-09-02
> **Method:** Every claim below was re-checked directly against the real code + a live full test-suite + tsc run on this exact HEAD. GitHub repo untouched (read-only audit of the local clone at the same HEAD).

---

## Executive verdict

**Phase 3 security + audit foundation is fundamentally REAL and verified.** With **one honest nuance** (pagination is available but not yet wired to any route — see §3) and the **pre-existing, documented `openid-client` ESM jest blocker**.

- 6/6 security-foundation claims **VERIFIED** in code.
- 4/4 audit-foundation claims **VERIFIED** in code.
- 1/1 CI pipeline claim **VERIFIED**.
- Test suite: **209/209 tests pass**, 38/39 suites (1 suite = documented `openid-client` ESM compile blocker, non-Phase-3).
- `tsc --noEmit`: **0 errors**.

---

## What was verified

### 1. Data classification  ✅ VERIFIED
- `enum DataClassification` defined in `backend/api/prisma/schema.prisma` with 6 levels: `PUBLIC, INTERNAL, CONFIDENTIAL, HIGHLY_CONFIDENTIAL, PRIVILEGED, RESTRICTED`.
- Applied as default on the data model: `StorageObject.classification DataClassification @default(CONFIDENTIAL)` (schema.prisma:107).
- `prisma validate` → schema valid.

### 2. Data-exfiltration bound (pagination)  ⚠️ AVAILABLE — NOT YET WIRED, NOT AN ACTIVE HOLE
- `backend/api/src/common/api/pagination.dto.ts` implements a real cap (rejects `limit > 100`, `limit < 1`, `page < 1`) with a green spec.
- **But it is used by NO controller route today.** A repo-wide search for `PaginationDto` returns only the DTO file itself.
- **Why this is not an active vulnerability:** there are currently **no general business-data list endpoints** (only `app`, `health`, `metrics`, `auth` controllers). No unbounded `findMany`-backed list endpoint exists to exploit.
- **Honest framing:** this is a forward-looking, ready-to-use mitigation that becomes mandatory when Phase 4 introduces domain list endpoints. It should be wired onto the first such endpoint (mirrors Phase-2 W7 deferral logic — mitigation exists, enforcement lands with the first real surface).

### 3. Malware scanning fail-closed  ✅ VERIFIED (real scanner + real wiring + now a REAL test)
- `ClamAvMalwareScanner` (`storage/clamav-malware-scanner.service.ts`) returns `'CLEAN' | 'INFECTED'`; throws if enabled-but-host-unavailable (fail-closed).
- `S3ObjectStorageService.putObject` throws on `INFECTED`; download path rejects any non-`CLEAN` object (fail-closed).
- The audit-blocker fix `08552c9e` replaced the prior **tautological** test with a **real injection-based test** that instantiates `S3ObjectStorageService` and asserts it throws on INFECTED / scanner error. Verified the spec passes.
- Regulation: default `MALWARE_SCAN_ENABLED=false` — fail-closed semantics mean infra must enable + provide ClamAV host in production. (This is the Phase-3 production-plane dependency noted in the gate.)

### 4. Secure defaults  ✅ VERIFIED
- `helmet()` applied, `main.ts:31`.
- CORS whitelist + `credentials: true`, `main.ts:32-36`.
- Rate limiting **fail-closed**: `RateLimitMiddleware` returns **503** when Redis is unavailable (`security/rate-limit.middleware.ts:81-84`); registered in both `main.ts` and `app.module.ts`.
- **Per-session double-submit CSRF** is real: `CsrfGuard` (`auth/session/csrf.guard.ts`) checks a per-session `X-CSRF-Token` (throws on missing/invalid, lines 24-36) AND verifies the `Origin` header for state-changing requests (lines 44-51). Wired via `@UseGuards(SessionGuard, CsrfGuard)` on state-changing routes (e.g. bootstrap controller `@Post`).

### 5. Audit + Outbox foundation  ✅ VERIFIED
- `METADATA_ALLOWLIST` const (path allowlist per event type) — `audit/audit-event.service.ts:36`, enforced at `:114`.
- `write(input, transaction?)` accepts an optional `Prisma.TransactionClient` — `:68`. This satisfies the Phase-4 AUDIT contract hook for transactional consistency.
- `AuditModule`, `OutboxModule`, and `RateLimitMiddleware` all registered in `app.module.ts` (lines 34, 39, 50).

### 6. CI pipeline  ✅ VERIFIED
- `.github/workflows/ci.yml` contains Gitleaks secret scan (:181), Semgrep SAST (:186), Trivy filesystem scan (:191) + SARIF upload (:201), and OWASP ZAP baseline scan (:329).

---

## Test + typecheck evidence (run head at 08552c9e)

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0 errors** |
| Full jest suite | **209 passed / 209**, 38 of 39 suites |
| Only non-passing suite | `oidc-provider.service.spec.ts` — **pre-existing, documented `openid-client` ESM compile blocker** (cannot import full `AppModule`), unrelated to Phase 3 |
| Added in Phase 3 (P2–P5) | Pagination cap spec + real ClamAV fail-closed spec — both green |

---

## Cross-tenant isolation (Phase-2 W7 deferral) — still honestly deferred

No general tenant-scoped business-data list endpoint exists yet. All `withTenantContext`/`activeTenantId` usage is confined to identity/membership/bootstrap services (tenant-switch, membership-admin, invitation, bootstrap, `me()` enrichment). Enforcement of the tenant boundary today rides on the RLS membership-slice isolation (the `Membership`-scoped data model), **not** on a per-request HTTP e2e. The HTTP cross-tenant e2e therefore remains correctly deferred until the first tenant-scoped business-data endpoint arrives in Phase 4.

---

## Blocker / gate status

1. **No Phase 3 code blockers remain.** The two audit blockers raised earlier (tautological malware spec; doc self-contradiction) were **fixed by the owner in `08552c9e`** and now pass.
2. **Production-plane caveat (unchanged, gate):** the security foundation is fail-**closed** by default. Any qualified *production* claim for the malware/rate-limit/DataClassification stack requires the Phase-1/3 **Linux production plane** (KMS, object-storage bucket + ClamAV host, Redis) to be live.
3. **Phase 4 must not start** until the Phase 3 completion gate is explicitly approved by the owner (per `PHASE3_COMPLETION_REVIEW.md`) — forced-phase rule.

---

## Files touched in this audit (local, not pushed)
- `docs/phase3/PHASE3_AUDIT_INDEPENDENT_VERIFICATION.md` (this file)
- No code changed. No GitHub pushes.