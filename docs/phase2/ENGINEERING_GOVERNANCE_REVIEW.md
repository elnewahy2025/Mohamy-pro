# Phase 2 Engineering Governance Review

**Date:** 2026-08-29

**Scope:** Source tree under `backend/api` (plus `apps/web`, `packages`, `infrastructure` for
cross-layer checks). Applied `skills/engineering-governance/SKILL.md`.

**Method:** Rules 1–30 (evidence over assumption; nothing claimed without executing it; only the
verified is asserted; critical-workflow/cross-layer/dependency-chain review; security scans; git
diff review; severity classification; completion report).

**Repository revision:** `2e6578cd` on `elnewahy2025/Mohamy-pro` `main`. Working tree clean.

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
| Interactive browser grant | HOSTED_OIDC_RUNTIME_VERIFICATION | auth flow | — | **pending** (needs human browser on user PC) | UNVERIFIED |

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
- **Verification:** cross-origin browser round-trip still needs a human on the user's PC to fully close.

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
- **Status:** migration is **still pending** (not applied to Neon) per instruction — see §5.

---

## 5. IMPLEMENTATION STATUS (per skill §28)

```
Requirements:     PASS (auth workstream implemented; traceability above)
Implementation:   VERIFIED (build + inspection)
Tests:            PASS — 113/113, 24 suites; lint 0 errors, 108 warnings (spec-only)
Runtime verification: PARTIAL — discovery + code exchange verified vs live Keycloak;
                     interactive browser grant still UNVERIFIED (needs human on user PC)
Security:         PASS for the reviewed code (no hardcoded creds/disabled controls);
                     F1 resolved; F2 resolved (server + frontend client); F5 resolved
Production readiness: NOT DECLARED — pending: interactive browser grant (incl. cross-origin) on a
                     real server+browser, and the rewritten migration still pending on Neon
Unverified items: interactive browser login/callback/me on a real server+browser;
                  applying the rewritten idempotency migration to Neon (approved but not applied)
Known limitations: legacy orphan columns (userId, tenantId, requestPath) retained by the
                  additive migration; cleaned up only by a later separately-approved migration
Workarounds:      none introduced; the OIDC fix (7e0f0774) and migration rewrite are permanent fixes
Blocking issues:  none hard-blocking code correctness; production gate blocked by pending
                  browser grant + F2 + applying the rewritten pending migration
```

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

**Remaining before production-ready:** the **interactive browser grant** (human round-trip, including
the cross-origin `/auth/me` + `/auth/csrf` + `POST /auth/logout` through the new frontend client), and
**applying the rewritten idempotency migration to Neon** (currently pending; intentionally not applied
this session per instruction, and already verified to apply cleanly on PostgreSQL 16 inside a
rolled-back transaction).
