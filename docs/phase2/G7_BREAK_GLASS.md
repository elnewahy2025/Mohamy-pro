# G7 Break-Glass — Implementation + Re-audit (awaiting approval)

**Scope:** G7 only (AUTHORIZATION_GAPS.md G7). No G8–G10 changes. No commits/pushes.

## Mechanism (enforceable, audited, controlled)

- `BreakGlassActivation` model (case-scoped only, reason mandatory, 24h max
  window, overlap refused, attribution) + RLS migration.
- Bypass integrated in the central seam: missing assignment + in-force grant
  → allow **plus mandatory `breakglass.used` audit on every bypass**
  (membership-attributed). No grant → deny, no audit (nothing happened).
- Administration (`CanManageRoles`-gated): activate / revoke-once / list-live.
- Layered precedence (verified by test): engine resource-denials deny at
  authorize time, before break-glass is ever consulted — break-glass overrides
  missing assignment, never an explicit denial.
- Self-lockout impossible by construction (grants only add access; revoke is
  admin-gated and audited).

## Frontend coverage (standing rule + gate)

New **Break-glass tab** on the cases page (activate with reason/expiry,
list live grants, per-grant revoke) + `BreakGlassClient` + 3 contract tests
+ en/ar keys. 403s render as errors, never data.

## Gates

Break-glass specs 4/4 · resource-access incl. bypass-audit tests green ·
permissions 23/23 · cases 18/18 · RLS spec green · tsc ×2 exit 0 · prettier
clean · nest/next builds 0 (`ƒ /[locale]/cases`) · prod boot clean.

## Independent re-audit

Bypass logic exists only in the central seam; no controller carries
break-glass logic; zero G8–G10 drift; footprint exactly G7 files.

## Verdict: G7 PASS (implementation + independent re-audit)
