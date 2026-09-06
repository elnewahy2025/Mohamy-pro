# G9 Legal-Config Plumbing — Implementation + Re-audit (awaiting approval)

**Scope:** G9 only (AUTHORIZATION_GAPS.md G9). No G10 changes. No commits/pushes.

## Change (explicit request passthrough)

- `LegalConfigOperations`: dropped `REQUEST`-scope injection; `assertPermission`,
  `run`, and `auditChange` now take `request` explicitly, matching every other
  module's operations. `LegalConfigService` likewise dropped request scope;
  all 8 methods take `request` first and forward it.
- `LegalConfigController`: all 8 handlers declare `@Req() request` and forward
  it. HTTP contract (routes, payloads, envelopes) byte-identical.
- Behavior preserved: same keys, same hybrid scoping, same audit events;
  correlation/IP hashing now reads the call's request instead of ambient injection.

## Frontend verification (gate)

HTTP contract unchanged, so no UI change exists to make — verified, not
omitted: legal-config page calls identical endpoints; web gates 84/84, tsc 0.

## Gates

Legal-config suites 9/9 (incl. forwarding assertion proving explicit
passthrough) · tsc 0 · prettier clean · nest build 0 · prod boot clean.

## Independent re-audit

Changed files are exactly the 4 legal-config files; zero `this.request` /
`Scope.REQUEST` / `@Inject(REQUEST)` remains in the module; no G10 drift.

## Verdict: G9 PASS (implementation + independent re-audit)
