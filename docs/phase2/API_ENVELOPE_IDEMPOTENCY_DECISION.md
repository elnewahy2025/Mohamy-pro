# Phase 2 API Envelope and HTTP Idempotency Decision

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22.

**Decision date:** 2026-08-22

**Depends on:** [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md), [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md), and [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)

## API version and envelope

Phase 2 business endpoints remain under `/api/v1`. Every new identity, membership, tenant-administration, authorization, invitation, session-management, and future legal-domain endpoint uses the frozen success and error envelopes.

Successful response:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "<correlation-id>",
    "timestamp": "<ISO-8601>",
    "pagination": null
  }
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The provided input is invalid.",
    "details": []
  },
  "meta": {
    "requestId": "<correlation-id>",
    "timestamp": "<ISO-8601>"
  }
}
```

Error codes are stable, uppercase, machine-readable identifiers. Public messages are safe for the caller and do not reveal whether another user, tenant, invitation, or resource exists. Detailed logs retain the correlation ID and a redacted diagnostic event only.

The Phase 2 implementation must add a global success-envelope interceptor for business endpoints and align the exception filter, validation mapping, OpenAPI schemas, and shared contracts. The current Phase 1 exception body is not silently treated as the Phase 2 contract; it must be migrated deliberately with contract tests.

## Operational endpoint compatibility

The following operational endpoints retain their dedicated Phase 1 contracts because probes, monitoring agents, and readiness tooling consume them directly:

| Endpoint | Contract |
|---|---|
| `/api/v1/health/live` | Direct liveness object with `status`, `timestamp`, and `uptimeSeconds`. |
| `/api/v1/health/ready` | Direct `ReadinessContract` with dependency checks. |
| `/api/metrics` | Prometheus text exposition, not JSON. |
| `/api/docs-json` | OpenAPI JSON document. |

This is an explicit operational-contract exception, not an accidental inconsistency. The exception is documented in OpenAPI and contract tests. If a future requirement mandates a single envelope for probes, it must be introduced as a versioned contract change under the API compatibility policy; Phase 2 does not silently alter the existing probe shape.

The service-information endpoint `/api/v1` is migrated to the standard business envelope only after its current consumers and e2e contract are updated in the same change. No required field is removed from an existing published contract without a version or explicit compatibility record.

## Request validation and correlation

All business endpoints use the global validation pipe with whitelist, non-whitelisted-field rejection, transformation rules, and endpoint DTO schemas. Each response envelope includes the correlation/request ID emitted by the existing middleware. OpenAPI describes the exact success and error schemas, status codes, pagination metadata, authorization requirements, and idempotency header.

Pagination metadata is present only for list responses; it contains validated `page`, `limit`, and `total` values. The API does not expose raw database errors, provider responses, stack traces, tokens, or unbounded diagnostic data.

## Idempotency scope

Every state-changing `POST`, `PUT`, and `PATCH` business request requires an `Idempotency-Key` header containing a UUIDv4. The server validates the header before controller execution. Authentication protocol endpoints that are not business mutations—OIDC login initiation and callback—are explicit exceptions because their state/nonce/PKCE protocol provides the replay boundary. Session logout and tenant switching are state changes and require the idempotency contract.

The idempotency identity is the tuple:

```text
idempotencyKey + authenticatedActorScope + tenantScope + HTTP method + normalized route
```

`authenticatedActorScope` is the authenticated User ID for user operations and the named service identity for explicitly authorized service operations. `tenantScope` is the server-derived active Tenant ID or `GLOBAL` for an explicitly global operation. No client-supplied tenant value participates in the scope before membership authorization.

Unauthenticated business mutations are not allowed in Phase 2. OIDC protocol exceptions use state, nonce, and PKCE instead of the business idempotency record.

## Request fingerprint and conflict behavior

The server computes a request fingerprint from the normalized method, route, authenticated actor scope, server-derived tenant scope, content type, and canonicalized JSON body. Sensitive values are hashed and are not stored in raw form. The fingerprint is stored with the idempotency record.

For the same scoped key:

| Situation | Required response |
|---|---|
| First request | Atomically reserve the key and execute the mutation in the same transaction boundary as its idempotency completion state and transactional outbox writes. |
| Same key, same fingerprint, completed | Return the stored status and response body without re-executing business logic. Mark the result as a replay in bounded metrics; do not duplicate outbox events. |
| Same key, different fingerprint, method, route, actor, or tenant | Return `409 IDEMPOTENCY_CONFLICT`; do not reveal the prior response body. |
| Same key currently in progress | Return `409 IDEMPOTENCY_IN_PROGRESS` with a safe retry hint; do not execute concurrently. |
| Handler returns a controlled validation or authorization error | Persist the terminal response for the 24-hour scope so a retry cannot change the result without a new key. |
| Transaction fails before mutation/outbox commit | Release the reservation or mark it retryable according to the failure class; no partially committed operation may be replayed as success. |
| Process crashes after the mutation transaction commits | The committed idempotency record is replayable, so the request is not re-executed. |
| Reservation lease expires without a committed transaction | A cleanup/recovery job may reclaim the reservation; reclamation is safe only because mutation and completion are atomic. |
| Expired record after 24 hours | The record is purged; a new request must use a new UUIDv4 key. |

A replay returns the original status and body but must not replay `Set-Cookie`, provider tokens, raw invitation tokens, or other one-time headers. Sensitive response material is not stored in the idempotency record.

## Database and concurrency requirements

The idempotency schema must be changed before the first Phase 2 mutation. It must include a non-sequential record ID, scoped actor and tenant fields, method, normalized route, request fingerprint, reservation state, response status, sanitized response body, response headers permitted for replay, created/updated/expiry timestamps, and a reservation lease/version.

The database must enforce uniqueness across the full idempotency scope, not only the raw key. The reservation operation must be atomic under concurrent requests. All state changes and their transactional outbox records must commit or roll back together with the idempotency completion state. `findValid` and replay logic must verify scope and fingerprint; a raw-key collision must never return another actor’s or tenant’s response.

Idempotency response data is retained for exactly 24 hours as required by the Phase 0 contract, subject to a documented purge schedule and bounded storage metrics. Purge is safe, repeatable, and does not affect the underlying business record.

## Required acceptance evidence

| Requirement | Required proof |
|---|---|
| Envelope | Every Phase 2 business endpoint returns the success/error envelope; operational exceptions retain their dedicated contracts. |
| Validation | Unknown fields, invalid formats, invalid pagination, and malformed UUIDv4 keys are rejected with stable error codes. |
| First request | One mutation creates exactly one business record and exactly one transactional outbox event. |
| Replay | Same scoped key and fingerprint returns the exact stored result without a second mutation or outbox event. |
| Conflict | Same key with a changed body, method, route, actor, or tenant returns `409 IDEMPOTENCY_CONFLICT` without response leakage. |
| Concurrency | Concurrent identical requests produce one committed operation and one replay; concurrent conflicting requests produce one winner and controlled conflicts. |
| Failure | Validation/authorization terminal failures are stable; transaction failures do not leave an unsafe reservation; crash recovery is proven with real PostgreSQL. |
| Expiry | 24-hour expiry and purge are tested; expired keys cannot replay old response data. |
| Scope isolation | A user or tenant cannot retrieve or replay another actor’s idempotency record. |
| Contract | OpenAPI, shared contracts, generated client, and Supertest contract tests agree on envelopes, headers, statuses, and error codes. |

## References

1. [`Phase 0 API contract`](../phase0/API.md)
2. [`Phase 0 API compatibility policy`](../phase0/API_COMPATIBILITY.md)
3. [`Current exception filter`](../../backend/api/src/common/filters/http-exception.filter.ts)
4. [`Current idempotency service`](../../backend/api/src/infrastructure/idempotency/idempotency.service.ts)
5. [`Current Prisma schema`](../../backend/api/prisma/schema.prisma)
6. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
7. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
