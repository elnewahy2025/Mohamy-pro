# G2 Denial Evaluation — Implementation Summary (awaiting approval)

**Scope:** G2 only. No G3–G10 changes. No commits/pushes.

## Real behavior before (verified by direct read)

`evaluateTenantPermission` (`permissions.service.ts:231-277` pre-fix) computed
`UNION(role.permissions)` plus the `CanSwitchTenant` default. It issued zero
`accessDenial` reads anywhere in `src` — an ACTIVE denial row changed nothing.
Proven by code read + repo-wide grep. There was additionally no direct-grant
store of any kind, so deny-overrides-direct-grant was untestable by construction.

## Minimum central change applied

1. **Evaluation** (`permissions.service.ts`): after role keys, union per-membership
   `DirectPermissionGrant` keys (new model, revocable), then a single
   `accessDenial.findFirst` with explicit `AND` (tenant, key, ACTIVE, subject
   null-or-actor, in-force window, key-level or exact-resource scope). Any match
   → `DENY (DENIED_BY_EXPLICIT_DENIAL)`, overriding all grants including the
   switch default path order (deny checked before grant acceptance). NULL
   semantics handled with explicit OR branches (no `in: [null, …]` trap);
   duplicate-OR-key predicate loss avoided via AND array.
2. **Input extension** (strictly required for scope test): optional
   `resource?: { type, id }` on `TenantPermissionInput`; all existing callers
   unaffected.
3. **Direct grants** (`DirectPermissionGrant` model + RLS migration
   `20260908000004_g2_denial_direct_grants`): tenant/membership keyed,
   creator-attributed, revocable. No new API for granting (out of G2 scope —
   rows are managed via Prisma/console until G4 role management lands; noted).
4. **Denial administration** (`denials/` module: service + guarded versioned
   controller): create (catalog-key validation, ACTIVE-membership subject check,
   window sanity), revoke (once-only), list — all gated by `CanManageRoles`,
   all audited (`denial.created/revoked` registered across all 5 audit maps).
   Escalation analysis: denials only remove access; tenant-scoped (cannot touch
   global roles); admin-gated + audited like existing role-grant powers.
5. **Audit**: `DENIAL_CREATED`, `DENIAL_REVOKED` in all maps + allowlist.

## Files changed

- `prisma/schema.prisma` (model + 3 back-refs), `prisma/migrations/20260908000004_g2_denial_direct_grants/`
- `permissions/permissions.service.ts`, `permissions/permissions.service.spec.ts` (+9 tests)
- `denials/` (service, controller, module, 2 specs), `app.module.ts` (wiring)
- `audit/audit-constants.ts`, `audit/audit-event.service.ts`
- `infrastructure/database/migration-rls.spec.ts` (+1 test)

## Before/after

| Case | Before | After |
|---|---|---|
| Role grant + denial | ALLOW (denial ignored) | DENY, audited |
| Direct grant + denial | N/A (no grants) / ALLOW | DENY |
| Multi-role + denial | ALLOW | DENY |
| No grant + denial | DENY (MISSING) | DENY (EXPLICIT) |
| Cross-tenant denial | N/A | no effect (tenant predicate + RLS) |
| Resource mismatch | N/A | ALLOW; match DENY |
| Revoked/expired denial | N/A | grant restored |

## Effective-permission logic (now)

`ALLOW iff ACTIVE membership AND (role grant OR direct grant OR switch-default) AND NO in-force scoped denial; DENY otherwise, non-enumerating 403, reason in audit only.`

## Tests (13 required items)

1 ✅ existing · 2–5 ✅ new engine tests · 6 ✅ tenant-predicate + RLS · 7 ✅ scope tests · 8 ✅ revoke/expire · 9–10 ✅ controller gate specs · 11 ✅ auth/membership/audit/infra suites 167/167 · 12 ✅ guard spec 18/18 · 13 ✅ relevant suites green.
Full: permissions/denials 23/23; migration-rls 11/11; auth/membership/audit/infra 167/167; **entire backend suite 80/80 suites, 405/405 tests**; tsc 0; prettier clean; nest build 0; prod boot clean + health ok.

## Security regression

Default-deny intact (deny checked before grant acceptance; MISSING_PERMISSION path unchanged); RBAC/ABAC/resource behavior unchanged (no caller passes `resource` yet — key-level enforcement only, recorded); tenant isolation preserved (explicit predicate + RLS + withTenantContext); no per-controller authz added (sweep verified single evaluation point).

## Remaining G2 limitations

- Direct grants have no management API (console/SQL until G4).
- Resource-scoped denial enforcement activates only for callers passing `resource` (none yet).
- Self-lockout by admin self-deny is possible; recovery requires another admin (documented, audited).

## Frontend verification (gate correction adopted 2026-09-05)

- Denial surfaces as the unchanged 403/FORBIDDEN `PermissionDeniedError`
  (generic message; reason stays server-side in audit). No client contract
  changed, so no frontend change is required — recorded, not omitted.
- Verified `ApiError → OperationResult` renders the error state with
  message/code/details and never success or data.
- Web gates on the current tree: vitest 74/74, tsc exit 0.

## Verdict: G2 PASS (implementation + independent re-audit)
