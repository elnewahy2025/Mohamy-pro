# Phase 2 Generated API Client Retention Decision

**Decision status:** This document records the explicit, reviewed re-entry decision required by Phase 1 [`GENERATED_CLIENT_DECISION.md`](../phase1/GENERATED_CLIENT_DECISION.md) on Phase 2 closure. It was selected by the project owner for workstream W6 of [`PHASE2_COMPLETION_PLAN.md`](PHASE2_COMPLETION_PLAN.md) as the *record-an-explicit-retention-decision* path (line 81).

**Decision date:** 2026-09-02

**Depends on:** [`../phase1/GENERATED_CLIENT_DECISION.md`](../phase1/GENERATED_CLIENT_DECISION.md), [`../phase1/FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md), [`PHASE2_PLAN_AUDIT.md`](PHASE2_PLAN_AUDIT.md) (P2-API-002), and [`PHASE2_COMPLETION_PLAN.md`](PHASE2_COMPLETION_PLAN.md) W6.

## Decision

Phase 2 does **not** introduce a code-generated client. The existing hand-rolled client (`apps/web/src/lib/api.ts`, class `ApiClient`) is retained for Phase 2, extended to cover every authenticated, versioned business operation added in Phase 2, and a concrete regeneration trigger is recorded. This is an **explicit, reviewed retention** — not a silent omission. The Phase 1 gate line "the generated client must be produced from the committed OpenAPI contract, not from an undocumented hand-written approximation" is satisfied *in spirit and by the Phase 2 plan's own alternative*: the plan explicitly allows recording a reviewed decision when a hand-rolled client is retained, and this document records that decision plus the criteria that will force generation.

## Why the client is retained (rationale)

1. **Contract source is runtime-only.** The backend publishes the OpenAPI document at `api/docs-json` only when `NODE_ENV !== 'production'` (`backend/api/src/main.ts`); there is no committed, revisioned `openapi.json` in the repository. A generated client produced from a downloaded ad-hoc snapshot would itself be an "undocumented hand-written approximation" of the committed contract, or would require first committing and CI-regenerating a fixed contract snapshot — a new contract-lifecycle surface with no owner yet assigned.
2. **The business surface is small and stable.** Phase 2 adds exactly four business controllers whose DTOs and results are small, explicitly type-safe, and already frozen by `backend/api/test/openapi.e2e-spec.ts`. Reifying them into a code generator now adds toolchain and ownership cost with negligible typing benefit.
3. **Enumeration and error-model fidelity requires hand control.** The client must surface the frozen error envelope (`code`, `details`, `requestId`) and the `Idempotency-Key`/CSRF requirements. These are behavioral contracts a generic generator does not model by default.
4. **No hand-written duplicate auth/tenant DTOs.** Per P2-API-002, the concern is "no hand-written duplicate auth/tenant DTOs." The retained client defines request/response interfaces once, in one file, from the committed OpenAPI-gated backend DTOs, and is covered by unit tests that pin the wire shapes. It does not duplicate the auth/tenant DTOs outside the client module.

## Recorded generator selection and strategy (satisfies the Phase 2 gate fields)

The Phase 1 gate requires the closure review to select and record, at minimum: the generator, versioning strategy, generated-artifact ownership, CI regeneration check, runtime consumer test, and compatibility policy. Because generation is deferred, each field below is **recorded as the agreed policy to adopt when generation begins**, so the decision is not deferred silently.

| Gate field (from GENERATED_CLIENT_DECISION.md) | Recorded Phase 2 policy |
|---|---|
| Generator | `openapi-typescript` (TypeScript types from the committed OpenAPI document). Selection locked-in for the future generation trigger; not installed in Phase 2. |
| Versioning strategy | Generate against the committed, reviewable `openapi.json` snapshot, not against a runtime download. The snapshot is versioned alongside the API major version (`v1`), satisfying the "produced from the committed OpenAPI contract" requirement. |
| Generated-artifact ownership | The `@mohamy/contracts` package owns the generated types; `apps/web` consumes them; the backend owns the source OpenAPI document. |
| CI regeneration check | A CI job regenerates the client from the committed `openapi.json` and fails if the diff is non-empty (the artifact is reproducible and current). |
| Runtime consumer test | A consumer test compiles against the generated artifact and exercises at least one authenticated, versioned business operation (bootstrap / invitation / membership-admin / tenant-switch) over the real HTTP stack. |
| Compatibility policy | Compatible within an API major version; a breaking contract change bumps the OpenAPI major version and regenerates the client before the change is consumed. |

## Regeneration trigger (concrete, not open-ended)

A code-generated client becomes **mandatory** before the next business operation is consumed by the frontend when **any** of these holds:

- A committed, revisioned `openapi.json` (or equivalent) is checked into the contract-publishing path, **and** one of the following:
  - the business DTO/result surface grows beyond the four Phase 2 controllers in a way that makes hand-typed maintenance error-prone; or
  - more than one frontend/consumer package needs the client (the hand-rolled client is a web-only single consumer); or
  - a new API **major** version introduces a second wire contract to keep in sync.

If none of the trigger conditions holds, the retained client may be kept, but **only** with an updated reviewed decision documenting the same fields above (no silent re-retention).

## Evidence

| Contract or decision point | Evidence | Result |
|---|---|---|
| OpenAPI publication | `backend/api/src/main.ts` enables `SwaggerModule` JSON at `api/docs-json` when non-production | Published (runtime-only; no committed snapshot) |
| OpenAPI fidelity gate | `backend/api/test/openapi.e2e-spec.ts` asserts DTO + route schemas for bootstrap / tenant-switch / invitation / membership-admin | PASS (W2) |
| Client retained and extended | `apps/web/src/lib/api.ts` (hand-rolled `ApiClient`) covers all four business controllers + auth | Extended in W6 |
| Client typed from backend contract | Client interfaces (`BootstrapResult`, `TenantSwitchResult`, `InvitationCreateResult`, `MembershipAdminResult`, request DTOs) match the frozen backend DTO/result types | Verified against `backend/api/src/**/dto.ts` + service result types |
| Runtime consumer test | `apps/web/src/lib/api.test.ts` exercises each new mutation endpoint (CSRF, Idempotency-Key, envelope, error mapping) over a mocked fetch | 10 tests green (W6) |
| No hand-written duplicate DTOs | Types live only in `apps/web/src/lib/api.ts`; no duplicate DTO definition file | Verified |
| Frontend type-health | `tsc --noEmit` clean for `apps/web` (classic TypeScript 5.9.3) | 0 errors |
| Decision recorded (this gate) | This document | Recorded, not silent |

## Note on the Phase 2 toolchain

The web workspace resolves `"typescript": "latest"` to the native TypeScript-Go preview build (`typescript@7.0.2`), whose bundled `lib.*.d.ts` is unavailable in this container (the `tsc` shim spawns a broken `tsgo`). This is a pre-existing environment limitation unrelated to W6. Type verification for W6 was therefore executed with the installed classic TypeScript 5.9.3 JavaScript compiler. Pinning the web toolchain away from `latest` is out of scope for W6 and should be a separate reviewed change if it blocks future verification.