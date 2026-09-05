# G3 Role Model Consistency — Implementation + Re-audit (awaiting approval)

**Scope:** G3 only. No G4–G10 changes. No commits/pushes.

## Semantics verification (before changing anything)

Per-role implementability audit against the current permission architecture:
- `tenant.admin` / `platform.admin`: exist, wired, tested — untouched.
- `tenant.manager`: powers (view + approve time/workflows/invoices/payments) map
  exactly onto existing discrete keys — activatable without redesign.
- Managing Partner: matrix promises Read/Update cases, but only `CanManageCases`
  (create/delete included) exists. Granting it would exceed the documented scope.
  Blocked on read/update-split keys — deferred with rationale, not created.
- Lawyer / Paralegal: "assigned cases only" requires case-assignment (G5). A
  tenant-wide role under that name would misrepresent its scope — deferred.
- Client: requires the Phase 24 portal authentication surface — deferred.

## Change applied

- `reconcileBuiltInRoles` now ensures the `tenant.manager` row per ACTIVE
  tenant (`Tenant Manager`, TENANT scope) and grants its matrix. No member is
  ever auto-assigned: assignment stays an explicit admin action via
  invitation/grant paths (verified: zero `membershipRole.create` in the
  permissions service).
- `AUTHORIZATION_MATRIX.md` §2 reconciled: IMPLEMENTED vs DEFERRED-with-blocker
  per role. This closes the matrix-vs-code drift for roles.

## Frontend verification

- No hardcoded role lists in UI: invitation takes free-text role keys;
  backend rejects unknown keys and the error renders via `OperationResult`.
- Behavior consistent: manager-gated operations surfacing 403s display as
  errors, never success. No frontend change required (verified outcome).
- Web gates: vitest 74/74, tsc exit 0.

## Tests

- New: reconcile creates manager role + grants matrix; reuses existing row
  (no duplicates). Permissions suite 17/17. Backend tsc 0, prettier clean.

## Independent re-audit

- Role keys in code: exactly admin/manager/platform; no partner/lawyer/
  paralegal/client code paths. Matrix doc matches. No role-management API
  added (G4), no assignment/ABAC/break-glass changes (G5–G7), no test-scope
  creep beyond reconcile.

## Verdict: G3 PASS (implementation + independent re-audit)
