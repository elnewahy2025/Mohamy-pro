# Audit Remediation Disposition

**Status:** Reviewed against real code. Partial re-application, with explicit
rejections recorded against frozen decisions.

**Date:** 2026-09-02

## Context

An owner-supplied production-readiness remediation document (`Phases A–D`)
proposed a set of fixes. Two independent sources of ambiguity were resolved
before any code was written:

1. The remote `origin/main` had advanced 7 commits (authored by the repository
   owner) that partially applied the remediation. Those commits were force-deleted
   (owner-authorized) so `main` returned to the `243c6769 + W6` baseline.
2. Several claimed fixes were re-verified against the real code and found to be
   already implemented, already resolved, or in direct conflict with frozen
   Phase 1/2 decisions.

The remediation is therefore **not applied wholesale**. Each item is dispositioned
below with evidence.

Verified baseline at disposition time:
- `origin/main` = `405cb008` (W6 on `243c6769`), local and remote in sync.
- `ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md` mandates fail-closed rate limiting.
- `AUTHENTICATION_ARCHITECTURE_DECISION.md` requires membership gating of *tenant
  context*, not of *login itself*.
- Phase 2 requires **additive migrations only**.
- `common/config/env.validation.ts` in the audit report is actually
  `src/config/env.validation.ts` (audit `File` column was inaccurate).

## Dispositions

### Applied (clean, verified commits)

- **A-C2 — `DIRECT_DATABASE_URL` for non-pooled migrations.**
  Added `DIRECT_DATABASE_URL` to `backend/api/.env.example` and wired
  `prisma.config.ts` to prefer it for the migration datasource (falling back to
  `DATABASE_URL`). The audit's proposed schema-file `directUrl` is **invalid in
  Prisma 7** and was rejected (`prisma validate`). Runtime client continues to use
  `DATABASE_URL` via `@prisma/adapter-pg`. Additive; migration datasource only.
  Verified: `prisma validate` OK, `tsc --noEmit` 0 errors.

- **B-H3 — Data-retention cleanup jobs.**
  Extended `CleanupSchedulerService` with four daily jobs:
  - `purgeExpiredOutboxMessages` (via `withDeliveryScope`): `PROCESSED` rows older
    than `CLEANUP_OUTBOX_PROCESSED_DAYS` after `processedAt`; `DEAD_LETTER` rows
    older than `CLEANUP_OUTBOX_DEAD_LETTER_DAYS` after `deadLetteredAt`.
  - `purgeExpiredSessions`: revoked/expired `AppSession` past
    `CLEANUP_EXPIRED_SESSION_DAYS` after `absoluteExpiresAt`.
  - `purgeExpiredStorageObjects`: `deletedAt` past `CLEANUP_STORAGE_DAYS`,
    `legalHold = false`.
  - `purgeExpiredAuditEvents`: `retentionUntil` elapsed (uses the existing column).
  Retention values are env-configurable defaults (`7/30/30/30`, bounded 1–365) —
  **not** a runtime settings table. The owner plans a future in-app settings page
  and explicitly deferred building it now; these env vars are the seam the settings
  page will later write through.
  Verified: scheduler spec 6/6, config+env-validation spec 21/21, `tsc` 0, prettier
  clean.

### Already implemented — no action

- **A-C5 — OIDC end-session (provider) logout.** Already present:
  `oidc-provider.service.ts:184` `buildLogoutUrl` reads `end_session_endpoint`
  (throws `OidcConfigurationError` if unadvertised) and appends `id_token_hint`
  and `post_logout_redirect_uri`; `auth.service.ts:248` invokes it on logout.
  Audit's A-C5 was a false positive.
- **C3 — composite index.** Already present on the schema.
- **C4 — non-ACTIVE user rejection.** Already handled:
  `session.service.ts:143` throws `SessionNotAuthenticatedError` for non-ACTIVE.
- **H1 — Idempotency-Key handling.** Already present and correct.
- **H2 — Idempotency-Key echo.** Already implemented in the idempotency
  interceptor.

### Rejected — conflicts with frozen decisions / would be a regression

- **A-C1 — Fail-open rate limiter on Redis unavailability.** **Rejected, keep
  fail-closed.** The current middleware returns `503 SERVICE_UNAVAILABLE` on
  limiter failure *by design*. `ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`
  and `AUTHENTICATION_ARCHITECTURE_DECISION.md` mandate fail-closed abuse/rate
  controls. Fail-open would let a flood bypass the limiter whenever Redis blips —
  a security regression. Owner in-session instruction: reject, keep fail-closed.
- **A-C6 — Require ≥1 active membership to create a session.** **Rejected.** The
  frozen model (`AUTHENTICATION_ARCHITECTURE_DECISION.md`) gates **tenant context**
  when no active membership exists, but still allows **login**. Blocking session
  creation would prevent a user from ever logging in to be told they have no
  active tenant. Owner in-session instruction: reject.
- **B-H5 — Remove `@@unique([id, tenantId])` on Organization/Branch.** **Rejected.**
  These constraints back the composite FK `Branch.organization ->
  Organization([id, tenantId])`. Removing them is a non-additive schema change and
  violates the **additive-migrations-only** Phase 2 rule. Owner in-session
  instruction: do not remove.

## Outcomes

- Re-applied fixes committed as a single clean commit on top of `405cb008`
  (A-C2 + B-H3), each verified (tsc 0, specs green, lint clean).
- A-C5/C3/C4/H1/H2 confirmed present; no redundant changes.
- A-C1/A-C6/B-H5 explicitly rejected with recorded reasons against frozen decisions;
  no code written for them.
- The settings-page concept and dynamic tenant/branch metadata editing were
  discussed and **deferred** by the owner to avoid churn; the env-config seam
  (`CLEANUP_*_DAYS`, `DIRECT_DATABASE_URL`) remains for later runtime wiring.