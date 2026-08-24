# Gemini Review Prompt: Phase 2 PostgreSQL Audit RLS Boundary

You are providing a bounded second opinion for the Mohamy Pro repository. You do not have direct access to the GitHub repository, the Windows workstation, Docker Desktop, the database, environment files, credentials, tokens, cookies, request bodies, raw logs, or protected local files. Review only the facts and repository paths included below. Do not ask for secrets or raw database values.

## Objective

Identify the permanent, production-safe correction for the Phase 2 audit RLS boundary failure. The correction must preserve tenant isolation, fail closed, use least privilege, preserve existing database data, and keep Phase 3 out of scope.

## Repository and branch context

The repository is `elnewahy2025/Mohamy-pro` on branch `phase2/legacy-tenant-boundaries`. The latest published runtime-verifier diagnostic commit is `383bcadc`. The implementation is Phase 2 only.

Relevant repository paths are:

- `backend/api/prisma/schema.prisma`
- `backend/api/prisma/migrations/20260822200000_rls_tenant_context_foundation/migration.sql`
- `backend/api/prisma/migrations/20260822210000_legacy_tenant_boundaries/migration.sql`
- `backend/api/prisma/migrations/20260823160000_phase2_audit_event_foundation/migration.sql`
- `backend/api/src/infrastructure/database/prisma.service.ts`
- `backend/api/src/infrastructure/audit/audit.service.ts`
- `backend/api/src/infrastructure/outbox/audit-outbox.handler.ts`
- `backend/api/src/infrastructure/outbox/outbox.worker.ts`
- `backend/api/scripts/phase2-reliability-runtime-check.mjs`
- `docs/phase2/AUDIT_OUTBOX_CONCURRENCY_IMPLEMENTATION_PLAN.md`
- `docs/phase2/MEMBERSHIP_TENANT_SWITCH_IMPLEMENTATION_PLAN.md`

## Existing security design

The audit migration creates `AuditEvent` with tenant and actor scope, enables and forces row-level security, and defines tenant-scoped insert/select policies. The relevant predicates are based on server-bound transaction settings, including `app.tenant_id`, `app.user_id`, `app.membership_id`, and `app.operation_id`. The tenant predicate is `public.app_tenant_context_is_valid()` and requires valid UUID-shaped settings. Global audit insertion and dispatcher/retention reads use separately named contexts.

The audit migration also creates an append-only trigger, revokes public update/delete, and permits retention deletion only through a named purge context for rows past retention and not under legal hold. No RLS policy should be weakened to make the test pass.

The tracked development compose baseline declares a PostgreSQL service using database `mohamy_pro`, host port `55432`, and a development role named `mohamy`; protected Windows environment files are not available for review and must not be requested.

## Safe Windows runtime evidence

The runtime verifier was executed once against the existing Windows database and current API/worker processes. Only these bounded markers are available:

```text
audit_rls_role_diagnostic=superuser=true|bypassrls=true|enabled=true|forced=true
audit_outbox_source_status=PASS|http=200|server_derived_context=true
audit_outbox_delivery_status=PASS|status=PROCESSED|attempts=1
audit_outbox_duplicate_status=PASS|job_states=completed,completed|attempts_unchanged=true|audit_count=1
audit_rls_diagnostic=same_tenant_visible|cross_tenant_visible
phase2_reliability_cleanup_status=PASS|audit_residue=0|outbox_residue=0|active_fixture_tenants=0|active_fixture_memberships=0|active_fixture_contexts=0
phase2_reliability_runtime_result=FAIL|stage=audit_rls_boundary|error_class=Error
```

The static gates passed before this runtime attempt: frozen pnpm install, Prisma generation, migration deploy with the additive audit migration applied, API Jest suite (`23` suites, `112` tests), API build, verifier syntax, formatting, and diff checks.

The runtime result proves that audit creation, outbox delivery, duplicate suppression, and cleanup worked, but the RLS assertion failed because a row from tenant one was visible under tenant two context. The role diagnostic proves that the live connection role is both a PostgreSQL superuser and `BYPASSRLS`, while `AuditEvent` reports RLS enabled and forced. PostgreSQL superusers can bypass RLS; therefore the current runtime does not prove that the policies themselves are wrong.

## Required review questions

1. Is the root cause correctly identified as the live application connection role bypassing RLS, rather than a tenant-context binding defect? Explain how the evidence distinguishes these cases.

2. What is the safest permanent architecture for an existing development database: a dedicated application LOGIN role with `NOSUPERUSER NOBYPASSRLS`, a separate migration/admin role, explicit grants, and preserved table ownership; or another design? Describe the exact role/privilege separation without asking for credentials or changing protected environment files.

3. Would creating a new application role require an additive migration, a deployment/configuration change, or both? Explain how to avoid putting passwords or DATABASE_URL values into migrations or source control.

4. What PostgreSQL ownership and privilege traps must be addressed so that `FORCE ROW LEVEL SECURITY` is meaningful for the application role while migrations and controlled maintenance still work? Include table ownership, sequence/default privileges, function execution privileges, and worker/dispatcher access.

5. Should the runtime verifier assert the application role’s `superuser=false` and `bypassrls=false` before tenant-isolation assertions? If so, define safe bounded markers and explain why this is a prerequisite rather than a workaround.

6. How should the verifier distinguish a legitimate maintenance/admin role from the application and worker runtime roles without exposing role names, credentials, or database values? Include a safe negative test that proves cross-tenant visibility is denied under the application role.

7. What exact code, migration, deployment, and documentation changes would you recommend? Do not provide a minimal stub, placeholder, destructive reset, database recreation, RLS weakening, or a verifier-only workaround.

8. What must remain open in Phase 2 after this correction, including audit append-only/retention/legal-hold runtime evidence, outbox retry/lease/dead-letter evidence, concurrency evidence, authorization/MFA, onboarding, generated client, frontend RTL/LTR, and Linux KMS/object-storage/TLS deployment boundaries?

## Hard constraints

- Phase 2 only; do not start Phase 3.
- No database reset, truncate, delete of existing data, volume deletion, container recreation, or migration-history rewriting.
- No weakening or removal of RLS, append-only triggers, retention controls, legal holds, or tenant-boundary checks.
- No changes to protected Windows environment files, DATABASE_URL values, passwords, tokens, cookies, debug logs, or unrelated containers.
- Use pnpm `11.22.0` only for repository commands.
- Preserve modified tracked files and untracked protected files.
- Do not claim Phase 2 completion or production readiness based on static tests or a partial runtime result.
- Any proposed runtime evidence must use bounded marker lines only and must verify cleanup.

## Expected response format

Return a technical review with four sections: root-cause determination, permanent least-privilege design, exact implementation and verification plan, and residual Phase 2 gaps. Clearly label recommendations that require user approval or a protected environment/configuration change. Do not ask for any secret, raw token, raw database URL, raw provider response, or raw log.
