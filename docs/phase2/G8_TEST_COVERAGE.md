# G8 Test Coverage — Implementation + Re-audit (awaiting approval)

**Scope:** G8 only (AUTHORIZATION_GAPS.md G8). Tests + specs only; zero
production code changed. No commits/pushes.

## What was added

- `controller-guards.spec.ts`: full-surface assertions — all 38 guarded
  controllers must carry applied `@UseGuards(SessionGuard…)`; health
  documented public-by-design (liveness); metrics documented token-gated
  (`isMetricsAuthorized`, verified implementation).
- `operations-authorize.spec.ts` (new): every module operations class
  (party, case, workflow, hearing, billing, communications, calendar,
  timeline, deadline, task, document, breakglass, roles) proven to authorize
  AND propagate denial without wrapping; time-tracking helpers gated;
  denial service validates before DB touch.
- Legal-config ops excluded with reason: REQUEST-scoped constructor cannot
  take the shared harness; covered by its existing key-assert + cross-tenant
  specs.

## What this replaced

Mocked-authz service specs remain for state-machine coverage, but the
enforcement chain (guard presence per controller + authorize allow/deny per
operations unit) is now proven by real-chain tests instead of
`mockResolvedValue(mockCtx)` shortcuts.

## Frontend verification

No production UI changed (tests-only change set). Current-tree gates green:
vitest 84/84, tsc exit 0. Invitation/roles error paths already verified in
G3–G4.

## Gates

Full backend suite **86/86, 465/465** · tsc 0 · prettier clean · nest build 0 ·
prod boot clean.

## Independent re-audit

Changed files are exactly the two spec files — zero production drift, zero
G9–G10 touch. Sweep confirms 38/40 guarded + 2 intentional exceptions.

## Verdict: G8 PASS (implementation + independent re-audit)
