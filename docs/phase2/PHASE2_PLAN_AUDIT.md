# Phase 2 Plan Audit — Identity and Multi-Tenancy

**Audit date:** 2026-08-22

**Repository revision audited:** `ca27d82853d428f2da3067f14c5f5388add6ae4d` (`main`, clean and synchronized with `origin/main` in the audited clone)

**Audit scope:** Phase 0 decisions, Phase 1 acceptance and deployment-boundary documents, the Phase 2 entry and implementation-plan documents, current Prisma schema, backend bootstrap and tests, frontend shell/providers, shared contracts, package dependencies, environment validation, idempotency service, migrations, and repository placeholder/security scan.

## Audit conclusion

The Phase 2 plan is directionally correct and preserves the approved Option B boundary, but the first version was **not sufficiently precise to begin implementation without risking omissions**. The audit found several P1 and P2 planning gaps. These are plan defects, not evidence that Phase 2 application code is already implemented.

The plan has been corrected in the same audit cycle to make the following mandatory before feature coding: authentication-provider and token-transport decisions, account lifecycle ownership, exact tenant-switch semantics, the HTTP response-contract migration, the idempotency lifecycle, RLS policy decisions, the minimum Phase 2 audit-event store, real OIDC integration evidence, and explicit abuse/data-lifecycle requirements.

> **Audited authorization:** Phase 2 remains authorized to begin only after the corrected plan is accepted as the implementation baseline. No Phase 2 application code was started by this audit.

## Evidence-based strengths

| Area | Verified evidence | Audit result |
|---|---|---|
| Phase boundary | The final Phase 1 review states that implementation and Windows runtime gates are closed while the deployment production boundary remains open; Option B authorizes Phase 2 under that qualified boundary. [`FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md) | Preserved; no unqualified production claim is made. |
| Domain hierarchy | Phase 0 fixes `Tenant`, `Organization`, `Branch`, `Department`, `Team`, `Membership`, and `User`; tenant context must come from membership. [`DOMAIN_MODEL.md`](../phase0/DOMAIN_MODEL.md) [`MULTI_TENANCY.md`](../phase0/MULTI_TENANCY.md) | Correctly represented in the Phase 2 plan. |
| Authorization direction | Phase 0 requires RBAC, ABAC, resource-level authorization, branch/department restrictions, and explicit denials. [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md) [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md) | Correctly represented; simplified role-only authorization is prohibited. |
| Current implementation boundary | The current schema contains only `Health`, `StorageObject`, `OutboxMessage`, and `IdempotencyKey`; no Phase 2 identity or tenant models exist. [`schema.prisma`](../../backend/api/prisma/schema.prisma) | The plan correctly starts with additive schema design and migrations. |
| Current API boundary | The API bootstrap has correlation, metrics, rate limiting, Helmet, validation, versioning, and Swagger bearer documentation, but no real authentication guard, authorization guard, session, or tenant-context pipeline. [`main.ts`](../../backend/api/src/main.ts) [`app.module.ts`](../../backend/api/src/app.module.ts) | The plan correctly treats these as Phase 2 work rather than assuming they exist. |
| Current frontend boundary | The frontend has English/Arabic locale routing and React Query, but the shell has a hardcoded profile chip and no auth/session/tenant provider. [`layout.tsx`](../../apps/web/src/app/[locale]/layout.tsx) [`app-shell.tsx`](../../apps/web/src/components/app-shell.tsx) [`providers.tsx`](../../apps/web/src/components/providers.tsx) | The plan correctly identifies bilingual infrastructure as present but identity UX as new work. |
| Existing verification foundation | Current e2e coverage is limited to liveness, readiness, metrics, and OpenAPI; no auth, session, tenant isolation, or authorization workflow is covered. [`app.e2e-spec.ts`](../../backend/api/test/app.e2e-spec.ts) | The plan correctly requires substantial new test coverage. |

## Findings requiring correction

| ID | Severity | Finding and repository evidence | Required correction |
|---|---|---|---|
| `P2-AUTH-001` | P1 | The plan names Keycloak/OIDC but does not freeze the provider deployment contract, realm/client configuration, issuer/audience values, ownership of user lifecycle, or the real Windows-Docker verification topology. The current API package has no auth/session/OIDC dependency, and `main.ts` only advertises bearer auth in Swagger; it does not install authentication or authorization guards. [`STACK.md`](../phase0/STACK.md) [`package.json`](../../backend/api/package.json) [`main.ts`](../../backend/api/src/main.ts) | Add a pre-coding architecture decision that selects self-hosted Keycloak on Windows Docker or an explicitly approved external OIDC provider. Define issuer, audience, client type, redirect URLs, PKCE/state/nonce, JWKS caching, clock skew, logout/revocation, secret ownership, and a real provider integration test. No production mock may substitute for this evidence. |
| `P2-AUTH-002` | P1 | The Phase 0 execution plan includes password management, email verification, MFA architecture, sessions, device/session tracking, and tenant selection. The first Phase 2 plan did not assign explicit ownership or acceptance criteria for invitation, email verification, password reset/recovery, or the provider-versus-platform boundary for passwords and MFA. [`Plan.txt`](../../Plan.txt) | Add an account-lifecycle decision: specify whether Keycloak owns credentials, verification, recovery, and MFA; define invitation, disabled-user, suspended-membership, recovery, and session-revocation flows; and test each boundary without storing provider secrets in the core platform. |
| `P2-TENANT-001` | P1 | The plan says a client `tenantId` may be rejected, ignored, or treated as non-authoritative. That is an unresolved security behavior. A permissive ambiguity is unsafe for a tenant boundary. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md) | Make the rule deterministic: ordinary tenant-scoped endpoints reject client-supplied tenant identity as an authority; the dedicated membership-switch endpoint may accept a target tenant identifier only as a selector, then verifies active membership server-side, establishes the approved active context, and audits the switch. |
| `P2-TENANT-002` | P1 | The plan does not define the first-tenant/bootstrap path, Platform Admin bootstrap, tenant invitation, membership creation authority, or safe behavior when a user has zero or multiple active memberships. | Add tenant bootstrap, invitation, membership approval, first-admin, no-membership, multi-membership, suspension, expiry, and deletion/archival semantics with explicit authorization and audit requirements. |
| `P2-API-001` | P1 | Phase 0 mandates a standard success/error envelope. The current API returns plain service objects and the current exception filter returns `{statusCode,error,message,path,method,timestamp,correlationId}`, not the frozen `{success,data,meta}` and `{success:false,error,meta}` forms. [`API.md`](../phase0/API.md) [`app.controller.ts`](../../backend/api/src/app.controller.ts) [`http-exception.filter.ts`](../../backend/api/src/common/filters/http-exception.filter.ts) | Add a mandatory Phase 2 API-contract migration before identity endpoints: response interceptor/envelope, error-filter alignment, validation-error mapping, OpenAPI schemas, backward-compatibility decision for Phase 1 endpoints, and contract tests. |
| `P2-IDEMP-001` | P1 | Phase 0 requires an `Idempotency-Key` on every state-changing request. The current service stores optional `userId`/`tenantId` but uses the key as a global primary key, has no request fingerprint, and returns an existing record on any unique collision without checking actor, tenant, route, method, or payload. [`API.md`](../phase0/API.md) [`schema.prisma`](../../backend/api/prisma/schema.prisma) [`idempotency.service.ts`](../../backend/api/src/infrastructure/idempotency/idempotency.service.ts) | Make HTTP idempotency a hard prerequisite before the first Phase 2 mutation. Define scope, request hash, method/path binding, actor/tenant binding, replay response, conflicting reuse response, expiry, concurrent reservation, failed-operation behavior, cleanup, and database constraints. Add real integration/concurrency tests. |
| `P2-SEC-001` | P1 | The plan says PostgreSQL RLS is used “where appropriate” without identifying which Phase 2 tables require RLS, how request tenant context reaches `SET LOCAL`, how connection pooling is handled, or how privileged Platform Admin access is separated. [`MULTI_TENANCY.md`](../phase0/MULTI_TENANCY.md) [`THREAT_MODEL.md`](../phase0/THREAT_MODEL.md) | Produce a table-by-table RLS decision before migration. For every non-RLS table document the compensating repository/service control and tests. Prove default-deny behavior, transaction-local context, pool reset safety, privileged access, and cross-tenant negative cases. |
| `P2-AUDIT-001` | P1 | The plan requires append-only auth and membership audit events but leaves the persistence boundary between Phase 2 and Phase 3 unresolved. Logging is not an audit store, and the current schema has no `AuditEvent` model. [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md) [`schema.prisma`](../../backend/api/prisma/schema.prisma) [`FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md) | Define and implement the minimum Phase 2 append-only audit event store for login, logout, session revocation, membership changes, role/permission changes, tenant switching, denials, and privileged access. Define authorization, retention owner, redaction, immutability, indexing, and outbox linkage. Phase 3 may extend it but must not be required to make Phase 2 auth events non-repudiable. |
| `P2-SEC-002` | P1 | Current environment validation has no issuer, audience, JWKS, OIDC, session, cookie, MFA, or tenant-context variables. The current CORS configuration has `credentials: false`, while the Phase 2 plan leaves token transport unresolved. [`env.validation.ts`](../../backend/api/src/config/env.validation.ts) [`main.ts`](../../backend/api/src/main.ts) | Add an explicit token-transport and session-storage decision before coding. If cookies are used, add SameSite/secure/httpOnly/CSRF design and tests; if bearer-only, define browser storage avoidance, refresh handling, logout, revocation, and XSS threat controls. Add fail-closed production environment validation. |
| `P2-API-002` | P2 | The plan says generated-client work is a re-entry gate when the surface is stable, but Phase 0 freezes a generated TypeScript client and the Phase 2 frontend depends on the new contract. [`STACK.md`](../phase0/STACK.md) [`API_COMPATIBILITY.md`](../phase0/API_COMPATIBILITY.md) | Make client generation and consumption mandatory before Phase 2 frontend acceptance, with checked-in or reproducibly generated output, contract tests, and no hand-written duplicate auth/tenant DTOs. |
| `P2-SEC-003` | P2 | The threat model requires login rate limiting by IP and username and account lockout after five failed attempts. The plan only says to add stricter limits “where the authentication design requires them,” which is too vague. [`THREAT_MODEL.md`](../phase0/THREAT_MODEL.md) | Add deterministic acceptance criteria for IP/identifier throttling, lockout or step-up behavior, reset rules, enumeration-safe responses, and metrics/alerting. Preserve the Phase 1 global Redis-backed limiter. |
| `P2-DATA-001` | P2 | The plan mentions lifecycle states and timestamps but does not define soft deletion, cascade restrictions, uniqueness under disabled/deleted records, retention, data minimization, classification, residency, or personal-data export/deletion boundaries for identity records. [`DATABASE.md`](../phase0/DATABASE.md) [`DATA_CLASSIFICATION.md`](../phase0/DATA_CLASSIFICATION.md) [`DATA_RESIDENCY.md`](../phase0/DATA_RESIDENCY.md) | Add an identity-data lifecycle matrix covering active/suspended/disabled/deleted states, foreign-key/cascade behavior, uniqueness, retention, residency, data minimization, export, and legally permitted deletion. |
| `P2-TEST-001` | P2 | The plan requires valid OIDC login but its test matrix does not explicitly require a real provider/container integration or an approved signed-token test boundary. The current e2e suite has no auth or tenant tests, and the frontend has only a message-tree test. [`app.e2e-spec.ts`](../../backend/api/test/app.e2e-spec.ts) | Add an executable test topology: real Keycloak/OIDC integration for provider behavior, deterministic signed-token unit tests for pure validation, real PostgreSQL/Redis integration for membership and idempotency, API e2e tenant-escape tests, and frontend auth/tenant/RTL tests. State which tests may use isolated mocks and ensure no mock is production-wired. |

## Current audit status

| Category | Status |
|---|---|
| Phase 0 alignment | `PASS WITH CORRECTIONS` |
| Phase 1 boundary alignment | `PASS` |
| Current implementation readiness | `FOUNDATION ONLY; PHASE 2 CODE MISSING` |
| Authentication design completeness | `P1 CORRECTIONS REQUIRED` |
| Tenant-context design completeness | `P1 CORRECTIONS REQUIRED` |
| API contract/idempotency readiness | `P1 CORRECTIONS REQUIRED` |
| Audit/RLS design completeness | `P1 CORRECTIONS REQUIRED` |
| Security/test traceability | `P2 CORRECTIONS REQUIRED` |
| Authorization to write Phase 2 code | `HOLD UNTIL CORRECTED PLAN IS ACCEPTED` |
| Unqualified production readiness | `NOT APPROVED` |

## Required re-audit exit criteria

The corrected plan must explicitly resolve every P1 finding, link each requirement to implementation files and tests, and identify the exact runtime evidence command. Before application code begins, the repository must have an accepted architecture decision for provider/token transport, an idempotency lifecycle design, a deterministic tenant-switch rule, an API-envelope migration decision, an RLS table matrix, an audit-event persistence decision, and an executable OIDC test topology.

## References

1. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
2. [`Phase 0 stack`](../phase0/STACK.md)
3. [`Phase 0 API contract`](../phase0/API.md)
4. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
5. [`Phase 0 authorization matrix`](../phase0/AUTHORIZATION_MATRIX.md)
6. [`Phase 0 data policy`](../phase0/DATABASE.md)
7. [`Phase 0 domain model`](../phase0/DOMAIN_MODEL.md)
8. [`Phase 0 multi-tenancy`](../phase0/MULTI_TENANCY.md)
9. [`Phase 1 final closure review`](../phase1/FINAL_CLOSURE_REVIEW.md)
10. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
11. [`Current Prisma schema`](../../backend/api/prisma/schema.prisma)
12. [`Current API bootstrap`](../../backend/api/src/main.ts)
13. [`Current API e2e harness`](../../backend/api/test/app.e2e-spec.ts)
14. [`Current frontend shell`](../../apps/web/src/components/app-shell.tsx)
15. [`Current idempotency service`](../../backend/api/src/infrastructure/idempotency/idempotency.service.ts)
