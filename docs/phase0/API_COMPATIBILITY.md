# API Compatibility Policy

## 1. Stable Contract
The `/api/v1` namespace is a stable contract. Once an endpoint is released to production under `v1`, its request and response schema must not break silently.

## 2. Breaking Changes
A change is considered breaking if it:
- Removes an existing field from a response.
- Changes the data type of an existing field.
- Adds a new **required** parameter to a request.
- Changes the authentication or authorization requirements.

If a breaking change is unavoidable, it must be introduced under a new version namespace (e.g., `/api/v2`).

## 3. Deprecation and Sunset Policy
If an endpoint or field is deprecated:
1. The API must return a `Deprecation: true` HTTP header.
2. The OpenAPI documentation must clearly mark the element as `@deprecated`.
3. **Sunset Period**: The deprecated endpoint must remain fully functional for exactly **6 months** from the date of deprecation.
4. After 6 months, the endpoint will be removed and return a `410 Gone` or `404 Not Found` status.

## 4. Contract Testing
All public API endpoints must be covered by automated contract tests (e.g., using Pact or Supertest against OpenAPI schemas) running in the CI pipeline. A PR that breaks a contract test without a version bump will fail the build.
