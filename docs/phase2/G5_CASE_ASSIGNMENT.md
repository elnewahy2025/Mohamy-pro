# G5 Case Assignment — Implementation + Re-audit (awaiting approval)

**Scope:** G5 only (AUTHORIZATION_GAPS.md G5). No G6–G10 changes. No commits/pushes.

## Design (central, non-enumerating)

- New `CanAccessAssignedCases` key (tenant.admin matrix; assignable to custom
  roles via the G4 API — the future lawyer role path).
- `CaseOperations.authorizeCaseAccess`: `CanManageCases` → FULL; else
  `CanAccessAssignedCases` → ASSIGNED; auth failures never fall through.
  Existing `authorize` refactored onto the shared base (behavior identical).
- `CaseAssignment` model (soft-revoke, attribution, `@@unique([caseId,
  membershipId])`) + RLS migration; creator-attributed writes.
- Enforcement inside `case.service` only (controllers route-only):
  get/update/parties require assignment under ASSIGNED scope; list filters to
  assigned ids; create stays FULL-only. Denials use existing
  `CaseAccessDeniedError` ('Case not found or access denied').
- Assignment management (`CanManageCases`): assign (idempotent reactivate),
  unassign (self-removal refused), list (scope-aware); audited
  (`case.member.assigned/revoked` across all 5 maps).

## Frontend coverage (standing rule)

Every backend change surfaced on app pages: `CasesClient`
assign/unassign/list (+3 contract tests), new Assignments tab +
`case-assignment-section` (assign, list, per-row unassign), i18n en+ar parity.
Error path: 403s render as errors via `OperationResult`, never data.

## Gates

Case suites 18/18 (incl. new allow/deny matrix + access-scope unit tests) ·
permissions green · tsc ×2 exit 0 · prettier clean · nest/next builds 0
(`ƒ /[locale]/cases`) · prod boot clean.

## Independent re-audit

Assignment checks exist only in `case.service` via ops helpers; controllers
carry no authz logic; no branch/classification/workflow/break-glass drift;
footprint is exactly G5 files.

## Verdict: G5 PASS (implementation + independent re-audit)
