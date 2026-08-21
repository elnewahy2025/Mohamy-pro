# Phase 1 CSRF Applicability Decision

**Status:** Accepted for Phase 1

**Governing requirement:** [`docs/phase0/SECURITY.md`](../phase0/SECURITY.md) requires CSRF protection where applicable.

## Decision

CSRF protection is **not applicable to the Phase 1 HTTP surface**. The Phase 1 API exposes only read-only `GET` operations for service information, liveness, readiness, OpenAPI documentation, and protected metrics. A repository scan of `backend/api/src` found no `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, or catch-all mutation route decorators. Phase 1 also has no session or cookie-based authentication flow.

The API therefore does not accept browser-authenticated state-changing requests that could be forged through cross-site request submission. CORS is configured with an explicit origin allowlist and `credentials: false`, so the current API does not opt into credentialed browser requests.

> CSRF protection is required when a future state-changing endpoint authenticates through browser-managed cookies or sessions. It is not required for the current read-only, non-cookie Phase 1 surface.

## Re-entry Gate

Before any future phase introduces a state-changing route or cookie/session authentication, the implementation must include a CSRF design and verification gate. The gate must identify the token mechanism, enforcement boundary, trusted-origin policy, negative cross-site test, and operational failure behavior. The Phase 2 identity and multi-tenancy closure review must explicitly re-evaluate this document before accepting cookie-based authentication.

This decision is a **scope determination**, not an omission of a present security control. The current rate limiter, explicit CORS origin policy, security headers, and fail-closed Redis behavior remain active for the Phase 1 surface.

## Evidence

| Control or observation | Evidence | Result |
|---|---|---|
| Current HTTP methods | Controller and route decorator scan under `backend/api/src` | No state-changing route decorators found |
| Current authentication | Phase 1 module graph and route surface | No session or cookie authentication exists |
| Credentialed browser requests | `backend/api/src/main.ts` | `credentials: false` |
| CORS origin control | `backend/api/src/main.ts` and environment validation | Explicit configured origins; no wildcard credential policy |
| Future re-entry | This document and Phase 2 closure gate | Mandatory CSRF review before cookie/session mutations |
