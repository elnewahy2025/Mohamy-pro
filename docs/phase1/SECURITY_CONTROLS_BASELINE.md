# Phase 1 Security Controls Baseline

**Status:** Implementation baseline pending Windows runtime verification of the rate-limit responses

**Governing requirements:** [`docs/phase0/SECURITY.md`](../phase0/SECURITY.md) and [`docs/phase0/STACK.md`](../phase0/STACK.md).

## Rate Limiting

The API uses a Redis-backed, atomic fixed-window limiter applied globally after correlation-ID and metrics middleware. The limiter executes an `INCR` plus first-write `EXPIRE` Lua script so concurrent requests cannot bypass the counter through a read/modify/write race. The client key contains a SHA-256 digest of the normalized remote address rather than the raw address. No client identifier is emitted in logs or metric labels.

The default policy is **300 requests per 60 seconds per client address**. Successful requests receive `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Requests at or above the configured maximum receive HTTP 429 and `Retry-After`. If Redis is unavailable, the limiter fails closed with HTTP 503 and records the bounded `rate_limit` application-error category. Production environment validation rejects `RATE_LIMIT_ENABLED=false`.

The implementation and focused tests are in `backend/api/src/security/rate-limit.middleware.ts` and `backend/api/src/security/rate-limit.middleware.spec.ts`. Configuration defaults and production validation are covered by `backend/api/src/config/env.validation.ts` and `backend/api/src/config/env.validation.spec.ts`.

## CSRF Applicability

The current Phase 1 API is read-only and has no cookie/session authentication. CORS is restricted to configured origins and is non-credentialed. The complete applicability decision and re-entry gate are recorded in [`docs/phase1/CSRF_DECISION.md`](./CSRF_DECISION.md). Any future state-changing cookie-authenticated endpoint must pass that gate before release.

## Supporting Controls

Security headers are enabled through Helmet. Correlation IDs are generated or propagated at the request boundary. Metrics use bounded label values and do not contain secrets, document contents, raw client addresses, or high-cardinality identifiers. Redis failure behavior is explicit rather than silently allowing unprotected traffic.

## Verification Status

| Control | Implementation evidence | Automated evidence | Windows runtime evidence | Closure status |
|---|---|---|---|---|
| Atomic Redis rate limit | Rate-limit middleware and Lua script | Focused allow, 429, outage, default, and production-config tests | Required after synchronization | Pending runtime gate |
| Privacy-safe client key | SHA-256 normalized address key | Focused middleware test exercises the key path without exposing the address | Required as part of response test | Pending runtime gate |
| CSRF scope | [`docs/phase1/CSRF_DECISION.md`](./CSRF_DECISION.md) | Route-surface scan and configuration review | No mutation endpoint exists to exercise | Accepted as not applicable in Phase 1 |
| CORS policy | `backend/api/src/main.ts` and environment validation | Build and unit tests | Required in API startup verification | Pending refreshed runtime evidence |
| Security headers | Helmet in API bootstrap | Existing API startup checks | Previously observed on readiness response | Accepted subject to final consolidated evidence |
