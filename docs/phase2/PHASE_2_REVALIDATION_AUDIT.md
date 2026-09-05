# PHASE_2_REVALIDATION_AUDIT.md — Phase 2 Re-validation (Evidence-Based)

**Date:** 2026-09-05 · **Tree:** `3436eb5f` + uncommitted Ph21–23 (audited as-is) · **Method:** read-only inspection, no code changed.

## Evidence matrix ( frankly abridged to audited claims; full detail in sibling docs)

| Requirement | Expected Behavior | Implementation | Evidence | Tests | Status | Severity |
|---|---|---|---|---|---|---|
| Identity (User vs Membership distinct) | Separate User + Membership carrying status/roles | `User` + `Membership{status,activeFrom,activeUntil}` models; session derives context from membership | `schema.prisma` User/Membership; `session.service.ts:76-100` | `session.service.spec.ts:140-180` | PASS | — |
| Tenant boundary from membership, never browser input | `activeTenantId` server-derived | Session create/validate read `appSession` row only; switch verifies membership + audits | `session.service.ts:76-100,121-172`; `tenant-switch.service.ts:50-142` | `tenant-switch.service.spec.ts:116-263` | PASS | — |
| Named policies, no raw role checks | `assertTenantPermission` everywhere | All canonical controllers → operations → `assertTenantPermission` | `permissions.service.ts:71-93`; per-module `*.operations.ts` | `permissions.service.spec.ts:82-161` | PASS | — |
| Explicit denials enforced | `AccessDenial` evaluated with precedence | Model exists; **zero evaluation code**; formula is roles-only | `schema.prisma:764-786`; `permissions.service.ts:231-277` (no denial lookup) | none | FAIL | HIGH |
| Direct permissions | Granted/revoked per member | No model queried, no API | `permissions.service.ts` (no UserPermission path) | none | MISSING | MEDIUM |
| Role model/scope/lifecycle | Full lifecycle incl. removal/deactivation | 3 keys; no removal/deactivation; no role-management API | `role.constants.ts:1-3`; no `*role*` controller (only legal party-roles) | none | PARTIAL | HIGH |
| Matrix roles (Manager/Lawyer/Paralegal/Client) | Exist per AUTHORIZATION_MATRIX §2 | Do not exist; `tenant.manager` added 2026-09 but never created/assigned/reconciled | `role.constants.ts`; `bootstrap.service.ts:142-177`; `permissions.service.ts:114-169` | none | FAIL | HIGH |
| Break-glass override | Approved + audited emergency access | Docs-only, zero code hits | `AUTHORIZATION_MATRIX.md:51` vs `rg break.?glass src` → 0 | none | MISSING | MEDIUM |
| Branch/department restrictions | Server-side enforcement | Data fields only; deferred in writing (`PHASE2_COMPLETION_PLAN.md:41`) | 22 `branchId|departmentId` hits, 0 in authz paths | none | MISSING | MEDIUM |
| Case-assignment rule | Assigned-cases-only for lawyers | No model, no join, tenant+permission only | `case.service.ts:99-171`; no CaseAssignment model | none | MISSING | HIGH |
| ABAC (classification/workflow state) | Attribute-driven decisions | Fields stored, never evaluated | `document.operations.ts:36-55` (permission only) | none | MISSING | MEDIUM |
| RLS tenant isolation | FORCE RLS on tenant tables | 85 tables FORCE; 8 scoped-out roots verified legitimate | RLS foundation migration; `migration-rls.spec.ts` | `tenant-context.spec.ts` | PASS | — |
| Backend enforcement, all routes | Every mutation guarded | 6 mounted scaffold controllers wholly unguarded (see §CRITICAL) | controllers listed below | none | FAIL | CRITICAL |
| Audit auth/membership/denial/switch events | Append-only, allowlisted | Implemented + completeness-guarded | `audit-constants.ts`, `audit-event.service.ts:36+` | `audit-event.service.spec.ts` | PASS | — |
| MFA for sensitive flows | Step-up on admin/cross-tenant ops | Central `mfa-assurance.service.ts:26-41` + call sites (invite/admin/bootstrap) | call sites listed in RBAC audit | partial | PARTIAL | MEDIUM |
| Test genuineness | Tests prove properties | Engine + switch + isolation specs assert real denies; many module specs mock `authorize` success | specs cited per finding | — | PARTIAL | MEDIUM |

## CRITICAL: unguarded mounted controllers (all verified `@UseGuards`-free)

| Controller | Exposure |
|---|---|
| `templates/template.controller.ts:4` (`v1/templates` CRUD) | `req:any` tenantId, `'system'` fallback, comment claims `CanManageTemplates` (key doesn't exist) |
| `templates/template-generation.controller.ts:13` (generate dispatch) | same pattern, direct Prisma |
| `search/search.controller.ts:14` (`v1/search`) | dead `UseGuards` import, `req.tenantId` "tenant middleware" that doesn't exist |
| `search/admin-search.controller.ts:5` (`v1/admin/search/reindex`) | privileged job creation, no auth at all, no tenantId set |
| `documents/ocr/ocr.controller.ts:5` | stubs say "check authorization here", none present |
| `documents/security/document-security.controller.ts:15` | dead `UseGuards` import + "Assuming global guards" comment; guards are NOT global |

Mitigating (not exonerating): `tenantId: undefined` fails Prisma required-field writes; reads fall to RLS-deny when deployed. The routes are reachable without authentication and their comments assert protection that does not exist.

## Final gate (brief §23): NOT PASSED
Explicit denials, matrix roles, unguarded routes, and assignment ABAC are unverified-or-failed. See `AUTHORIZATION_GAPS.md` for the ID-severity list and `PHASE_2_REVALIDATION_SUMMARY.md` for the verdict.
