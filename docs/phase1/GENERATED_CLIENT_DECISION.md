# Phase 1 Generated API Client Decision

**Status:** Accepted for Phase 1

## Decision

A generated API client is **not created in Phase 1**. The API publishes an OpenAPI document at `/api/docs-json`, and that document is the authoritative contract for the current foundation surface. Phase 1 contains only service information, health, readiness, metrics, and documentation operations; it does not yet contain a business-domain endpoint consumed by the frontend or another package.

Generating and committing a client against this foundation-only surface would create an artifact with no business value and would establish no stable identity, tenant, authorization, error-model, or domain-operation contract. The correct production decision is to keep the OpenAPI contract published and introduce the generated client when the first stable business endpoint is added.

## Acceptance Gate

The Phase 2 identity and multi-tenancy closure review must revisit this decision after the first business endpoint is implemented. That review must select and record the generator, versioning strategy, generated-artifact ownership, CI regeneration check, runtime consumer test, and compatibility policy. The generated client must be produced from the committed OpenAPI contract, not from an undocumented hand-written approximation.

The client gate is satisfied only when a real consumer compiles against the generated artifact and exercises at least one authenticated, versioned business operation in a test environment. A client that contains only foundation probes does not satisfy the gate.

## Evidence

| Contract or decision point | Evidence | Result |
|---|---|---|
| OpenAPI publication | `backend/api/src/main.ts` configures Swagger JSON at `api/docs-json` | Contract is published |
| Current API scope | Phase 1 OpenAPI and controller surface | Foundation/read-only operations only |
| Generated artifact | Repository workspace review | No generated client is committed in Phase 1 |
| Consumer requirement | This decision | Deferred until the first stable business endpoint |
| Ownership | Phase 2 closure gate | Must be assigned and verified before client introduction |
