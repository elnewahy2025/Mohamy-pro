# Phase 1 HTTP Idempotency Decision

**Status:** Accepted Phase 1 boundary; HTTP lifecycle implementation is not applicable to the current route surface

## Current Implementation

`IdempotencyService` provides a real PostgreSQL persistence helper with valid-record lookup, expiry deletion, unique-conflict handling, registration, and expired-record purge. The `IdempotencyKey` model and migration remain part of the foundation so a future business endpoint can adopt the contract without changing the storage boundary.

## Applicability Decision

The Phase 1 HTTP surface contains only read-only `GET` routes for service information, liveness, readiness, metrics, and OpenAPI. There is no `POST`, `PUT`, `PATCH`, or `DELETE` business endpoint that accepts a state-changing request or has a response that should be replayed. The current API also has no authenticated user or tenant context against which an idempotency scope could be enforced.

An HTTP interceptor added now would be an unconnected production path with no real mutation consumer and no meaningful replay or conflict contract. It would not satisfy the project’s evidence rule. Phase 1 therefore does not claim HTTP idempotency lifecycle completion, and it does not install a speculative interceptor on the read-only foundation API.

> The persistence helper is implemented; the connected HTTP idempotency lifecycle begins when the first state-changing business endpoint is introduced.

## Re-entry Gate

Before any future state-changing endpoint is accepted, its owning phase must define and test the complete lifecycle: idempotency-key format and length limits, user/tenant/request-path scope, first-response persistence, replay of an identical request, conflict rejection for a different request, expiry behavior, concurrent registration, database uniqueness, and safe cleanup. The acceptance gate must include a real consumer endpoint and negative/positive integration tests; a helper-only unit test does not close this requirement.

The Phase 2 identity and multi-tenancy closure review must explicitly decide whether the identity endpoints are the first consumer and must assign an owner for the interceptor or endpoint-level integration.

## Evidence

| Observation | Evidence | Result |
|---|---|---|
| Persistence helper | `backend/api/src/infrastructure/idempotency/idempotency.service.ts` | Implemented and connected to Prisma |
| Current route methods | `backend/api/src/app.controller.ts`, health, metrics, and OpenAPI controllers | Read-only foundation surface; no state-changing business endpoint |
| HTTP interceptor | Repository source review | Not present; no speculative production path added |
| Future consumer | This decision | Required before Phase 2 closure if a mutation endpoint exists |
