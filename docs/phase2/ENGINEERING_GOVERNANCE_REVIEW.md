# Phase 2 Engineering Governance Review

**Date:** 2026-08-29

**Scope:** Source tree under `backend/api` (plus `apps/web`, `packages`, `infrastructure` for
cross-layer checks). Applied `skills/engineering-governance/SKILL.md`.

**Method:** Rules 1–30 (evidence over assumption; nothing claimed without executing it; only the
verified is asserted; critical-workflow/cross-layer/dependency-chain review; security scans; git
diff review; severity classification; completion report).

**Repository revision:** `00c2e1e1` on `elnewahy2025/Mohamy-pro` `main` at time of review;
**updated 2026-08-30** to reflect the closed auth turn, the applied idempotency migration, and the
audit-foundation + tenant-switch slice (see §6).

---

## 1. Baseline verification evidence (commands executed this session)

| Check | Command | CWD | Result | Exit | Detail |
|---|---|---|---|---|---|
| Build | `pnpm run build` | `backend/api` | PASS | 0 | `nest build` |
| Lint | `pnpm exec eslint "src/**/*.ts"` | `backend/api` | PASS | 0 | 108 problems, all `no-unsafe-*` **warnings** (0 errors), confined to `*.spec.ts` mocks |
| Unit tests | `pnpm exec jest --runInBand` | `backend/api` | PASS | 0 | 24 suites, **113 tests**, 0 failures (incl. new `auth.controller.spec.ts`) |
| Prisma schema | `pnpm exec prisma validate` | `backend/api` | PASS | 0 | `The schema at prisma/schema.prisma is valid` |
| Architecture | `pnpm run architecture:check` | repo root | PASS | 0 | `Architecture-fitness checks passed` |
| License | `pnpm run license:check` | repo root | PASS | 0 | `License policy passed across 16 license categories` |

**Recorded but not executed (network-blocked from this sandbox):**
- ~~`node scripts/check-migrations.mjs`~~ **now executed** — see Finding F3 below. Egress to Neon was
  restored mid-session; `prisma migrate status` confirmed 7 migrations applied and only
  `20260828000000_idempotency_full_scope` pending. Note: a fresh **local** PostgreSQL run was
  attempted for migration verification but the sandbox cannot start postgres (`shmget: Function not
  implemented`); migration verification was instead performed against the live Neon engine inside a
  rolled-back transaction (see Finding F4).

---

## 2. Requirements traceability (Phase 2 auth workstream)

| Requirement | Source | Implementation | Tests | Evidence | Status |
|---|---|---|---|---|---|
| OIDC Authorization-Code + PKCE S256 | Phase 2 plan / AUTHENTICATION_ARCHITECTURE_DECISION | `auth/oidc/oidc-provider.service.ts` | `oidc-provider.service.spec.ts` | suite 113 pass; live Keycloak discovery; code exchange verified vs real realm | PASS |
| Server-side session store + HttpOnly cookie | Phase 2 plan | `session/*` | `session.service.spec.ts`, `session-crypto.spec.ts`, `session.guard.spec.ts`, `csrf.guard.spec.ts` | suite 113 pass | PASS |
| CSRF guard (Origin + X-CSRF-Token) | AUTHENTICATION_ARCHITECTURE_DECISION | `session/csrf.guard.ts` | `csrf.guard.spec.ts` | suite 113 pass | PASS |
| Identity resolution / external link | Phase 2 plan | `identity.service.ts` | `identity.service.spec.ts` | suite 113 pass | PASS |
| Username surfaced to client | Post-fix follow-up | `identity.service.ts` (`getDisplayName`), `auth.service.ts` (`me`) | `identity.service.spec.ts` (+3) | web `AuthUser.username`; AppShell/AuthLoginPage render | PASS |
| Interactive browser grant | HOSTED_OIDC_RUNTIME_VERIFICATION | auth flow | — | **user-confirmed** on Windows PC (`735449ac`): native-fetch, envelope, idempotency-root causes fixed; logout 302 + F5 correct | **PASS** |

---

## 3. Security findings

### Secrets / credentials
- `.env` (real creds: Neon, Upstash, MinIO, Keycloak) is **gitignored** via nested
  `backend/api/.gitignore` (`.env`) and is **not tracked**. `git ls-files` shows only
  `.env.example` tracked.
- `.env.example` contains only local dev placeholders (`localhost`, `minioadmin`,
  empty tokens). No real secrets.
- No hardcoded high-entropy credentials found in any tracked source/`apps`/`packages`/
  `infrastructure` (grep for passwords, private keys, secrets).

### Disabled controls / mocks / placeholders
- No `verify=False`, `rejectUnauthorized`, `NODE_TLS_REJECT_UNAUTHORIZED`, debug bypass,
  permissive auth found in tracked source.
- No `TODO`/`FIXME`/`HACK`/`XXX`/`WORKAROUND` in tracked source.
- No production mocks/stubs/placeholders/dummy data in tracked source (spec-only mocks are
  isolated to test files, as allowed by the skill).

---

## 4. Cross-layer review findings (auth/session dependency chain)

Dependency chain traced: `login → OIDC interaction cookie → callback → exchangeCode → resolveUser →
createSession → session cookie → /me, /csrf, /logout`. Guards wired in
`auth.controller.ts` / `auth.module.ts`; global prefix `api` + URI version `1` → `/api/v1/...`.

### Finding F1 — `POST /auth/logout` was not CSRF-guarded — **RESOLVED**
- **Severity:** P3 (nuisance/logout CSRF; low impact, no data exfiltration). **Fixed.**
- **Evidence (before):** `auth.controller.ts` `@Post('logout')` had no `@UseGuards`; `CsrfGuard` was
  applied only on `GET /auth/csrf`. No global guard in `main.ts`.
- **Fix:** added `@UseGuards(SessionGuard, CsrfGuard)` to `logout` (matches `/csrf`), plus a new
  `auth.controller.spec.ts` asserting the guards are attached to `logout`, `me`, `csrf`.
- **Verified:** suite grew 109 → **113**; all pass; spec lints clean (0 errors).

### Finding F2 — Cross-origin credentialed session flow — **RESOLVED (end-to-end)**
- **Severity:** was P3 (latent), now closed. **Fixed (server + frontend).**
- **Evidence (before):** `main.ts:32-37` `enableCors({ origin: [...], credentials: false })`. Session cookie is
  `HttpOnly` + `SameSite=Lax` (`session-cookie.service.ts`). API origin `localhost:3000`, frontend
  `localhost:5173` (same-site but **cross-origin**).
- **Fix:** (1) `main.ts` sets `credentials: true` (Nest reflects the allowed origin with the credentials
  headers) and (2) a frontend API client was added: `apps/web/src/lib/api.ts` issues `/auth/{me,csrf,
  login,logout}` with `credentials:'include'` and sends `X-CSRF-Token` on `POST /auth/logout`.
  See **F5**. Build (backend exit 0), web typecheck (tsc 5.9.3 exit 0) + vitest (6/6), full suite (113/113).
- **Verification:** cross-origin browser round-trip now **user-confirmed** on the user's Windows PC
  (auth turn below) — logout returns 302 and page refresh (F5) reports the correct session state.

### Finding F5 — `apps/web` had NO API client — **RESOLVED (client added)**
- **Severity:** was P3 (feature gap); now closed.
- **Evidence (before):** repository-wide grep (excl. `node_modules`/lock) for `fetch(`, `credentials`,
  `/auth/*` literal URLs, `localhost:3000`/`localhost:5173`, `axios`/`baseURL` returned **zero hits**;
  `apps/web/src` were static, translation-key placeholder pages.
- **Fix (this session):** added a credentialed client and minimal auth UI:
  - `apps/web/src/lib/api.ts` — typed `ApiClient` (`me`, `csrfToken`, `loginUrl`, `logout`) with
    `credentials:'include'` and `X-CSRF-Token` on `POST /auth/logout`; base from
    `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3000`).
  - `apps/web/src/auth/auth-provider.tsx` — `AuthProvider` + `useAuth()` (user/isLoading/login/logout).
  - `apps/web/src/app/[locale]/auth/login/page.tsx` + `auth-login-page.tsx` — the post-logout/callback
    target; renders sign-in/sign-out based on session; wired into `AppShell` (topbar) and `Providers`.
  - `apps/web/.gitignore` (Next `.next`/`out`) + `messages/{en,ar}.json` auth strings (structural parity).
- **Verified:** web `tsc --noEmit` (5.9.3, node) **exit 0**; `vitest run` **6/6 pass** (new `api.test.ts`
  asserts `credentials:'include'`, `X-CSRF-Token`, manual redirect, 401→null, login URL).
  Note: `next build` (Turbopack) and `tsc` via TS7-tsgo both fail for **environment** reasons
  (pnpm-symlink `Invalid symlink`; Go-tsc missing embedded `lib.d.ts`) independent of these changes.
- **Verification:** live cross-origin browser round-trip still needs a human on the user's PC.

### Finding F3 — `db:check` evidence — **RESOLVED**
- **Severity:** P3 → closed.
- **Evidence:** egress to Neon was restored; `node scripts/check-migrations.mjs` (with `DATABASE_URL`
  set) and `prisma migrate status` both ran against Neon. They confirmed 7 migrations applied and
  only `20260828000000_idempotency_full_scope` pending — which surfaced **Finding F4**.

### Finding F4 — committed migration was destructive (DROP TABLE) — **REWRITTEN additive**
- **Severity:** P1 (policy violation: destructive migration in a chain that must be additive).
- **Evidence:** `prisma migrate status` showed `20260828000000_idempotency_full_scope` **pending
  (never applied)** on Neon. Its SQL did `DROP INDEX ...; DROP TABLE IF EXISTS "IdempotencyKey";`
  and recreated it — conflicting with `docs/phase0/MIGRATION_POLICY.md` ("No destructive migration
  without approval") and the Phase 2 "additive migration only" constraint.
- **Fix:** rewrote the migration to evolve the 0-row, FK-free, ephemeral cache **in place**: guarded
  enum creation, `ADD COLUMN IF NOT EXISTS`, relax/add `NOT NULL`, and re-point the primary key
  `key → id`. **No table and no column is dropped.** Legacy orphan columns (`userId`, `tenantId`,
  `requestPath`) are retained (non-destructive) and documented for a later, separately-approved
  cleanup. The PK re-point is the single documented, data-safe, **approved** non-additive step
  (required because the app now queries by `id`).
- **Verified:** executed against the live Neon engine inside a **rolled-back transaction**
  (DB unchanged) on PostgreSQL 16 — parses and applies cleanly; result has `id` PK,
  `IdempotencyKey_scope_unique`, and the `IdempotencyState` enum.
- **Status:** **APPLIED to Neon 2026-08-30** after explicit user approval. `prisma migrate deploy`
  → exit 0 ("All migrations have been successfully applied"); `prisma migrate status` → "Database
  schema is up to date!"; `prisma validate` → valid. Post-deploy introspection confirmed: PK on
  `id`, `rowCount = 0` (the 0-row guarantee held — no data lost), all new columns present, the
  `IdempotencyState` enum created (`state = USER-DEFINED`), and the legacy orphan columns
  (`userId`, `tenantId`, `requestPath`) retained, non-destructive. See also **F4 note** and §5.

---

## 5. IMPLEMENTATION STATUS (per skill §28)

```
Requirements:     PASS (auth workstream implemented; traceability above)
Implementation:   VERIFIED (build + inspection)
Tests:            PASS — 119/119, 25 suites (was 113); lint 0 errors, 108 warnings (spec-only)
Runtime verification: PASS — auth turn user-confirmed on the user's Windows PC (735449ac):
                     interactive login/callback/me/logout all correct, incl. cross-origin
                     (logout 302 + F5-correct session); discovery + code exchange vs live Keycloak
Security:         PASS for the reviewed code (no hardcoded creds/disabled controls);
                     F1 resolved; F2 resolved (server + frontend client); F5 resolved
Production readiness: auth flow USERS-CONFIRMED working; idempotency migration APPLIED to Neon.
Known limitations: legacy orphan columns (userId, tenantId, requestPath) retained by the
                  additive migration; cleaned up only by a later separately-approved migration
Workarounds:      none introduced; the OIDC fix (7e0f0774), migration rewrite, and the
                  auth-turn fixes (5223014b, 0a358bbf, 735449ac) are permanent fixes
Blocking issues:  none — auth turn closed; migration applied; remaining items are optional
                  cleanup (stale origin/debug-local branch) or new feature work
```

### Audit-foundation + tenant-switch slice (2026-08-30)

- **Requirements:** `AUDIT_EVENT_FOUNDATION_DECISION` + `TENANT_MEMBERSHIP_SWITCHING_DECISION`
  (both frozen 2026-08-22). No silent simplification (governance Rule 4).
- **Implementation:** additive migration `20260830000000_audit_event_foundation`
  (`AuditEvent`, `AuditCategory`, `AuditOutcome`, indexes, FKs, two RLS policies, append-only
  trigger, `app_audit_global_scope_is_valid()`); `AuditEventService` (transaction-aware, allowlist
  + fail-closed metadata, retention derivation), `AuditOutboxHandler` (idempotent confirmation),
  and `POST /api/v1/session/tenant-switch` (Session+CSRF guarded, server-side active-membership
  verification, atomic session+audit write, non-enumerating `403 FORBIDDEN` denial). Actor-scope
  idempotency resolution corrected to read `request.auth`.
- **Static + tests:** `prisma validate` PASS; `nest build` exit 0; eslint 0 errors; full
  `jest --runInBand` **29 suites / 136 tests** (baseline 119); web `vitest` 7/7; web `tsc
  --noEmit` (stable JS compiler) exit 0.
- **Runtime (live Neon):** `prisma migrate deploy` applied the audit migration; `migrate status`
  "up to date" (8 migrations); `check-migrations.mjs` 8/8. Pre/post introspection proved
  additivity (audit objects absent → present, 0 rows, none pre-existing altered). Functional
  fail-closed check into a rolled-back transaction: global-scope INSERT ok, `UPDATE`/`DELETE`
  rejected by the trigger, row survived, rolled back to 0 rows. Rollback check into a rolled-back
  transaction: compensating reverse-DDL dropped only the new audit objects and restored cleanly.
  Existing `phase2-rls-runtime-check` all ten security gates **PASS**; only the verifier's own
  disposable database/role teardown reported `FAIL` (open connection / Neon permission),
  independent of the additive audit migration.
- **Full evidence:** [`AUDIT_TENANT_SWITCH_IMPLEMENTATION.md`](AUDIT_TENANT_SWITCH_IMPLEMENTATION.md).
  This closes the audit-foundation + tenant-switch slice; the full Phase 2 completion gate remains
  open (legacy-table boundaries, membership/invitation endpoints, RBAC matrix, abuse controls,
  full API contract, bilingual frontend), and a browser/Keycloak round-trip of the new endpoint
  is a separate user-PC step.

### Mandatory final questions (skill §29)
1. Inspected actual implementation — **yes**.
2. Verified every important claim — **yes** (evidence table above).
3. Executed tests claimed — **yes** (113/113, exit 0).
4. Inspected dependency chain — **yes** (auth/session traced).
5. Inspected DB/API/backend/frontend/auth/tests — **yes** (migrations/schema, controllers,
   guards, frontend proxy, specs).
6. Tested critical workflows — **partial**: login/callback/me runnable only via reproduction
   script + live Keycloak; browser round-trip pending.
7. Inspected final git diff — **yes** (clean tree; commits scoped to focused file sets).
8. Scanned TODO/FIXME/mocks — **yes** (none in tracked source).
9. Hardcoded credentials — **yes** (none; `.env` gitignored/untracked).
10. Disabled security controls — **yes** (none found).
11. Missing requirements — **none** beyond planned phase scope.
12. Unverified assumptions — **recorded** (interactive grant; cross-origin; applying rewritten
    migration to Neon).
13. Workarounds documented — **none** introduced; the OIDC fix and migration rewrite are permanent
    fixes.
14. Requirement simplification — **none**.
15. Every critical criterion has evidence — **partial**; see pending items above.

---

## 6. Conclusion

The reviewed codebase compiles, lints, and passes its full test suite with a clean working tree,
no hardcoded secrets, no disabled security controls, and no production mocks/TODOs. The Phase 2
auth/session workstream satisfies its build/lint/test/discovery requirements.

**Resolved this session:** F1 (logout CSRF guard + test), F2 (server `credentials:true` + frontend
client), F3 (`db:check`/`migrate status` evidence), F4 (the committed migration rewritten from
destructive `DROP TABLE` to a verified in-place, non-destructive form), and F5 (built the frontend
API client + auth UI that was previously missing).

**Auth turn closed (2026-08-30, user-confirmed on Windows PC):** three further root causes were
found and fixed after the initial review — `5223014b` (unbound native `fetch` → `Illegal
invocation` in `me()`), `0a358bbf` (client must unwrap the global `SuccessEnvelope` returned by
`/auth/*`), and `735449ac` (global `IdempotencyInterceptor` 422'd `POST /auth/logout`; auth
protocol routes now excluded, with `oidc-protocol-route.spec.ts`). Logout now returns 302 and F5
reports the correct session. A username field is surfaced to the client (`4c3be090`). Full suite
119/119 (was 113).

**Migration applied (2026-08-30):** `20260828000000_idempotency_full_scope` was applied to Neon
after explicit user approval and verified post-deploy (exit 0, "up to date", PK on `id`, 0 rows,
all new columns + `IdempotencyState` enum present, legacy orphan columns retained). The Phase 2
additive+pending migration gate is now closed. Remaining items are optional cleanup (stale
`origin/debug-local` branch) or new feature work.

**Audit-foundation + tenant-switch slice (2026-08-30):** implemented and verified per the slice
doc. The additive audit migration is deployed to Neon and verified (introspection, append-only
fail-closed, rollback). The `POST /api/v1/session/tenant-switch` endpoint is implemented with
server-side active-membership verification, atomic session+audit write, and non-enumerating
denial; idempotency actor-scope resolution now reads the authenticated session. Full backend suite
136/136, web 7/7, web type-check clean. The Phase 2 completion gate remains open for the remaining
workstreams documented in `PHASE2_IMPLEMENTATION_PLAN.md`; a browser/Keycloak round-trip of the new
endpoint is a separate user-PC step.
