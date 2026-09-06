# G10 Session Hardening — Implementation + Re-audit (awaiting approval)

**Scope:** G10 only (AUTHORIZATION_GAPS.md G10). No other changes. No commits/pushes.

## Change (piggybacked, bounded staleness)

`validateSession` re-validates the active membership on the existing throttled
sliding-refresh tick (5-minute `LAST_USED_THROTTLE_MS`, zero new hot-path
queries): missing / non-ACTIVE / out-of-window membership clears
`activeTenantId` + `activeMembershipId` (with `contextVersion` bump) while the
session stays valid for identity-only flows. Tenant-gated calls then fail
closed and the user can switch to a remaining membership. Per-operation engine
checks remain untouched as defense in depth.

## Frontend verification (gate)

Null tenant context is already safe: layout falls back to brand-only title,
tenant-switch is form-driven. No UI change required (verified outcome). Web
gates 84/84, tsc 0.

## Gates

Session suite 28/28 (4 new: suspend-clear, window-lapse clear, active kept,
identity-only skip) · tsc 0 · prettier clean · nest build 0 · prod boot clean.

## Independent re-audit

Changed files are exactly the session service + spec; no G1–G9 behavior
altered; no other session semantics touched.

## Verdict: G10 PASS (implementation + independent re-audit)
