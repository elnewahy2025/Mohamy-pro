# AUTHORIZATION_GAPS.md — Verified gaps only

## G1 — Unguarded mounted scaffold controllers
- **Severity:** CRITICAL · **Phase:** 16–19
- **Requirement:** Every mutation behind SessionGuard + named permission (AUTHORIZATION.md:12).
- **Current:** `templates/template.controller.ts:4`, `template-generation.controller.ts:13`, `search/search.controller.ts:14`, `search/admin-search.controller.ts:5`, `documents/ocr/ocr.controller.ts:5`, `documents/security/document-security.controller.ts:15` — zero applied `@UseGuards`; `req:any` tenantId; `'system'` fallbacks; aspirational comments.
- **Expected:** canonical guard → operations.authorize → tenant-context chain (time-tracking fix of 2026-09 is the template).
- **Evidence:** decorator sweep (6/37 unguarded); RLS backstop only post-deploy.
- **Impact:** unauthenticated reachability of mutation/admin surfaces; tenant authority vacuous.
- **Recommendation:** apply the time-tracking repair pattern per controller; extend `controller-guards.spec.ts` to all 37.
- **Required tests:** guard-presence for all controllers; unauthenticated-403; cross-tenant deny per controller.

## G2 — Explicit denials never evaluated
- **Severity:** HIGH · **Phase:** 2
- **Requirement:** RBAC + ABAC + explicit denials via named policies (plan:67).
- **Current:** `AccessDenial` model + RLS exist; `evaluateTenantPermission` never queries it.
- **Expected:** deny-overrides-allow in evaluation + denial management API + tests.
- **Evidence:** `permissions.service.ts:231-277`; zero `AccessDenial` references in `src`.
- **Impact:** revocation-style blocks unenforceable; matrix §5 unimplementable.

## G3 — Matrix roles absent; manager key dead
- **Severity:** HIGH · **Phase:** 2 (+20–23)
- **Requirement:** MATRIX §2 roles exist and enforce stated scopes.
- **Current:** only 3 keys; Managing Partner/Lawyer/Paralegal/Client absent; `tenant.manager` never created/assigned/reconciled, yet approve/publish gates reference its keys.
- **Expected:** either implement the roles or formally supersede the matrix.
- **Evidence:** `role.constants.ts:1-3`; `bootstrap.service.ts:142-177`; reconcile `:114-169`.
- **Impact:** approve/publish gates pass only for admins today; manager path untested-unusable.

## G4 — No role-management API
- **Severity:** HIGH · **Phase:** 2
- **Requirement:** Role assignment/removal/management authorized (matrix + plan:101).
- **Current:** `CanManageRoles` key without route; assignment only via invitation/bootstrap paths.
- **Evidence:** no `*role*` controller; matrix itself records the gap.

## G5 — Case-assignment authorization absent
- **Severity:** HIGH · **Phase:** 2/8
- **Requirement:** assigned-cases-only + unassigned denial (MATRIX §3/§5).
- **Current:** no model, no join, tenant-wide access for permission holders.
- **Evidence:** `case.service.ts:99-171`; schema has no CaseAssignment.

## G6 — Branch/department/classification/workflow ABAC absent
- **Severity:** MEDIUM · **Phase:** 2 (+5/15/11)
- **Requirement:** AUTHORIZATION.md:8-9,15.
- **Current:** fields stored, never evaluated; recorded deferral (`PHASE2_COMPLETION_PLAN.md:41`).
- **Impact:** coarse tenant-wide access within a firm.

## G7 — Break-glass docs-only
- **Severity:** MEDIUM · **Phase:** 2
- **Requirement:** MATRIX §5 approved + audited override.
- **Current:** zero code. Either implement or remove from matrix + DATA_CLASSIFICATION.

## G8 — Fragile/absent permission-deny unit tests
- **Severity:** MEDIUM · **Cross-phase**
- **Requirement:** brief §13 genuineness.
- **Current:** P7/P8/P11/P21–23 service specs mock authorize-success; `controller-guards.spec` covers only Ph10–15.
- **Expected:** deny tests per module + guard assertions for all 37 controllers.

## G9 — Legal-config implicit auth plumbing
- **Severity:** LOW · **Phase:** 9
- **Requirement:** explicit per-route authorization.
- **Current:** class guards + REQUEST-scope injection, no `@Req()` forwarding — works but fragile.
- **Recommendation:** explicit passthrough like timeline/workflow controllers.

## G10 — Session survives membership suspension
- **Severity:** LOW · **Phase:** 2
- **Requirement:** least privilege at all times.
- **Current:** `session.service.ts` doesn't re-check membership; compensated per-operation (`resolveMembership`) — verified, hence LOW.
