# DOCUMENTATION_TRACEABILITY_MATRIX.md — Requirement → Doc → Code → Tests

Requirement | Source document | Phase in | Implementation | Tests | Later use | Status
---|---|---|---|---|---|---|
Tenant boundary from membership | AUTHORIZATION.md:21 (plan), MULTI_TENANCY.md | 2 | session/switch/RLS | genuine suites | every phase via ops pattern | ✅ |
Named policies, no raw role checks | AUTHORIZATION.md:17-19 | 2 | assertTenantPermission + per-module keys | engine spec | Ph3–23 canonical modules | ✅ (except 6 scaffolds) |
RBAC roles (6 matrix roles) | AUTHORIZATION_MATRIX.md:6-12 | 2 | only 3 keys; 4 matrix roles absent | none | manager key added but uninstantiated | ❌ DRIFT |
Explicit denials | AUTHORIZATION.md:10, MATRIX §5 | 2 | model only, unevaluated | none | nothing consumes | ❌ DRIFT |
Break-glass | MATRIX §5, DATA_CLASSIFICATION | 2 | absent | none | — | ❌ DRIFT (docs-only) |
Branch/department restrictions | AUTHORIZATION.md:8-9 | 2 | fields only; deferred in COMPLETION_PLAN:41 | none | never consumed | ⚠️ recorded deferral |
Case assignment | MATRIX §3/§5 | 2/8 | no model/join | none | — | ❌ DRIFT |
Frontend never the boundary | plan:28,89 | 2 | UI gating presentational; backend enforces | — | consistent | ✅ |
OIDC/Keycloak direction | plan:25,73 | 2 | adapter + runtime verifications | hosted verification docs | login flows | ✅ |
Idempotency contract | plan:42,87 | 1/2 | interceptor + keys + billing unique key | contract suites | payments | ✅ |
RLS per-table decisions | plan audit table; RLS_TENANT_CONTEXT_IMPLEMENTATION | 2 | 85 FORCE + 8 scoped-out (verified legitimate) | RLS spec + runtime docs | all phases | ✅ |
Append-only audit | plan:29,95 | 2/3 | events + allowlist + completeness | audit specs | Ph10–23 events | ✅ |
Abuse/rate limits | plan:100 | 2 | middleware + abuse service + caps | specs | auth/invite/switch | ✅ |
Outbox/idempotency | plan:30,93 | 1/2 | worker + idempotent handlers | real-PG suites | domain events | ✅ |
`tenant.manager` least-privilege | (journey decision 2026-09) | 20–23 | keys + matrices only; no instantiation path | none | approve/publish gates reference it | ⚠️ half-landed |
Scaffold `v1/*` security comments | inline comments | 16–19 | comments claim guards/permissions that don't exist | none | — | ❌ DRIFT (comments lie) |
Phase 21–23 permission matrices | implementation plans | 21–23 | keys + matrices implemented | state specs (no perm-deny) | gates reference | ⚠️ (tests gap) |

Required Phase-0 docs check (§3 of brief): PROJECT_REFERENCE ✅, ARCHITECTURE ✅, DOMAIN_MODEL ✅, DATABASE ✅, API ✅, SECURITY ✅, AUTHORIZATION ✅ (thin), AUTHORIZATION_MATRIX ✅ (drifts noted), MULTI_TENANCY ✅, PHASE_DEPENDENCIES ✅, THREAT_MODEL ✅, TESTING ✅, OBSERVABILITY ✅, MIGRATION_POLICY ✅, DEPLOYMENT ✅, ROADMAP ✅ — all found; none contradictory on facts, but MATRIX §2/§5 describe a system that was never built.
