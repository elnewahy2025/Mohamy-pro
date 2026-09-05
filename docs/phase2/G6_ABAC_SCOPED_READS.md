# G6 ABAC Expansion — Implementation + Re-audit (awaiting approval)

**Scope:** G6 only (AUTHORIZATION_GAPS.md G6, assignment-driven slice).
Branch/department/classification/workflow-state remain deferred with blockers
below. No G7–G10 changes. No commits/pushes.

## Architecture (central, not scattered)

- New seam `permissions/resource-access.service.ts` (global module):
  `requireAssignedCase` / `assignedCaseIds`, non-enumerating
  `ResourceAccessDeniedError` (403/FORBIDDEN, generic message).
- Shared gate `permissions/authorize-case-access.ts`: manage-key → FULL,
  else `CanAccessAssignedCases` → ASSIGNED; auth failures never fall through.
- `case.operations` delegates to the seam (G5 error contracts preserved).
- Filter maps legacy `*AccessDeniedError` names → 403/FORBIDDEN generic
  (previously 500 + "Internal server error" + error logs).

## Enforcement (reads scoped, writes FULL-only)

Hearings, deadlines, tasks, documents lists + timeline list: ASSIGNED scope
constrains to assigned caseIds (or requires assignment when a caseId is
given). Writes, rules reference data, and single-case detail remain FULL-only.
No schema change; no migration; no new permission keys (reused G5 key).

## Honestly deferred (with precise blockers)

- Branch/department: no resource-side branch/department attribute exists on
  any domain model; unenforceable without cross-domain schema redesign.
- Classification/sharing: no reader role exists to scope down to; exposing
  the fields without a subject distinction would be theater.
- Workflow-state: no authz rule defined anywhere; inventing transition guards
  would be inventing requirements.

## Frontend coverage (standing rule + gate)

No UI change: scoping is server-side on existing list endpoints, so every
affected page (hearings, deadlines, tasks, documents, cases timeline)
filters automatically. Verified: no incompatible client calls (optional
params only), error path unchanged (403 renders as error), web gates 81/81,
tsc 0.

## Gates

Module suites 42/42 (incl. new scope tests per module) · tsc 0 · prettier
clean · nest build 0 · prod boot clean + health ok.

## Independent re-audit

Assignment queries flow only through the central service (sweep verified);
controllers carry no authz logic beyond the shared gate; footprint exactly
the seam + 5 modules + filter + specs. No G7–G10 drift.

## Verdict: G6 PASS (implementation + independent re-audit)
