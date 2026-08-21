# Phase 2 Integration-Test Topology and Evidence Plan

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22.

**Decision date:** 2026-08-22

**Purpose:** Define the real integration environments, test boundaries, runtime commands, evidence artifacts, and no-mock rules required before Phase 2 implementation can be authorized.

## Evidence status convention

This document is a test topology and command plan. No command in this document is claimed as executed until a retained evidence record contains the command, working directory, result, exit code, relevant output, and test count where applicable. Planned commands are not evidence.

## Test environment matrix

| Layer | Dependencies | Real or isolated test boundary | Required evidence |
|---|---|---|---|
| Pure unit | None or isolated deterministic fixtures | Pure policy, DTO, parser, token-claim, and state-transition tests only. No production module may be replaced by a fake. | Jest/Vitest output, test count, coverage, and reviewed assertions. |
| Database integration | Real PostgreSQL 16, Prisma migrations | Disposable database with every repository migration, constraints, RLS policies, triggers, and transaction behavior. | Fresh migration and schema/RLS evidence; no reset or migration-table edits. |
| Queue/cache integration | Real Redis 7 and BullMQ | Real rate limits, session state, idempotency reservation, outbox retry/duplicate/lease/dead-letter, and worker context. | Redis/PostgreSQL state, queue state, cleanup counts, and worker logs. |
| OIDC integration | Real Keycloak container with a dedicated test realm and client | Authorization Code + PKCE, discovery, JWKS, token exchange, logout/revocation, MFA, provider outage, and token rotation. | Redacted discovery/config evidence, real browser/API flow, provider logs, and API session state. |
| API e2e | Real API process plus PostgreSQL, Redis, Keycloak, and required storage | Authentication, membership, tenant switching, API envelopes, CSRF, idempotency, authorization, denials, audit, outbox, and tenant isolation. | Supertest/Playwright output and persisted database/queue/audit evidence. |
| Frontend browser | Real Next.js process plus real API and Keycloak | English/Arabic login, logout, session expiry, tenant selection, invitation, denial, error handling, LTR/RTL, and accessibility. | Playwright browser evidence, screenshots only when needed, network/API assertions, and no frontend-only security claims. |
| Windows runtime | Docker Desktop on Windows 11 | Same real API/worker and infrastructure topology used for local verification; no paid service and no Linux/Kubernetes host required for this gate. | Windows command transcript, container image digests, health, startup, workflow, and clean shutdown evidence. |
| Hosted CI | GitHub Actions with pinned dependencies/services | Reproducible quality, migration, API e2e, frontend browser, dependency, secret, SAST, container, SBOM, and DAST jobs. | Run ID, retained coverage/SARIF/SBOM/ZAP/browser artifacts, and job results. |

## Keycloak test topology

The OIDC integration environment uses a separate Keycloak container and a dedicated test realm. It must not use the `master` realm for application users. The local image reference must be pinned to an immutable digest before the runtime gate is executed; the floating `latest` tag is prohibited.

The test realm contains:

- One public or confidential application client matching the accepted server-mediated Authorization Code + PKCE architecture.
- Test users for active, disabled, MFA-enabled, MFA-disabled, and provider-revoked states.
- A test client configuration with exact redirect and post-logout URIs.
- Provider configuration for issuer, audience, S256 PKCE enforcement, short access-token lifetime, refresh rotation, and MFA assurance.
- No production credentials, tenant data, or committed realm secrets.

The application Tenant is not modeled as one Keycloak realm per legal tenant. A single dedicated test realm represents the identity-provider boundary; application Tenant and Membership records prove legal-operations isolation.

For local development-only verification, Keycloak may use its documented development startup mode with persistent local data, but that mode is never a production claim. The future supported production deployment gate requires a supported database, TLS, secure bootstrap, bounded resources, and operational evidence.[1]

## Required workflow suites

The API and browser suites must cover each critical workflow in five dimensions: valid success, validation failure, unauthenticated failure, authenticated-but-unauthorized failure, cross-tenant/object-ownership failure, persistence, and controlled error handling.

| Workflow | Required test cases |
|---|---|
| Login | Authorization Code + PKCE success; wrong issuer/audience/signature/expiry/nonce; provider outage; disabled provider user; no secret leakage. |
| Session | Cookie creation, refresh rotation, logout, logout-all, idle expiry, absolute expiry, provider revocation, session theft/invalid cookie, CSRF. |
| User and invitation | Invitation success, wrong identity, expiry, replay, revocation, unauthorized inviter, zero-membership, profile minimization. |
| Tenant context | Active membership, suspended/expired membership, tenant switch success, target enumeration resistance, session context update, audit. |
| Authorization | Every frozen role and permission, explicit denials, branch/department scope, unassigned resource, Platform Admin MFA, Tenant Admin restrictions. |
| API contract | Success/error envelopes, validation codes, correlation IDs, OpenAPI, pagination, idempotency headers, replay/conflict/concurrency. |
| Tenant isolation | Tenant A cannot read/list/search/write/queue/cache/export/download Tenant B through IDs, filters, routes, jobs, or object keys. |
| Audit | Append-only writes, immutable fields, authorization, redaction, retention, legal hold, duplicate outbox delivery, query audit. |
| Abuse | IP and identifier limits, five-failure lockout/step-up, MFA throttling, invitation abuse, switch abuse, enumeration-resistant responses. |
| Bilingual frontend | English/Arabic messages, locale-preserving redirects, LTR/RTL layout, accessible forms, denied/loading/empty/error/session-expired states. |

## No-mock rule

Real PostgreSQL, Redis, BullMQ, Keycloak, API, worker, and browser flows are required for integration and end-to-end acceptance. Isolated deterministic fixtures may test pure functions such as claim validation or policy evaluation, but no mock identity provider, fake tenant repository, stub authorization guard, or hardcoded user permission may be wired into production modules or used as the only evidence for a critical workflow.

The first OIDC integration test must use a real Keycloak container. The first mutation/outbox trace test must originate from a real API request. The first tenant-isolation test must execute against real PostgreSQL and the real repository/service chain.

## Windows-Docker evidence sequence

The following sequence is the planned order. API and worker terminals are stated explicitly before every application command.

### Infrastructure preflight

**API is stopped. Worker is stopped. Docker Desktop is running.** Start only the approved Mohamy infrastructure and the dedicated Phase 2 Keycloak test container through the reviewed Windows scripts/configuration. Do not stop or recreate Health-ERP, Vision-ERP, or the isolated Phase 1 security containers.

Evidence must capture:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
git status --short
docker version
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

The Keycloak image digest, container name, realm/client configuration source, and health endpoint result must be recorded without secrets.

### Repository baseline

**API is stopped. Worker is stopped. Required infrastructure is healthy.** Run from the actual repository root:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api run build
pnpm --filter api exec jest --runInBand
pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'
pnpm --filter @mohamy/web test
pnpm --filter @mohamy/web run build
```

The baseline must be recorded before any Phase 2 migration or application-code change. Commands that were not executed must be marked `NOT EXECUTED` in the evidence record.

### API and worker runtime

**API is stopped. Worker is stopped. Required infrastructure and Keycloak are healthy.** Terminal 1 runs:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm --filter api start:prod
```

**API is running. Worker is stopped.** Terminal 2 runs:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm --filter api start:worker
```

**API is running. Worker is running.** Terminal 3 performs one readiness request and the authenticated browser/API workflow. Repeated health calls are avoided because the Phase 1 rate limiter is intentionally active.

**API is running. Worker is running.** After the workflow, stop the worker with Ctrl+C first and the API with Ctrl+C second. The evidence records clean return to PowerShell or the exact error transcript.

### Disposable database and integration execution

**API is stopped. Worker is stopped. Infrastructure remains running.** Create a disposable PostgreSQL database using an environment-provided password outside repository documentation, apply all migrations, run the migration checker, run the real integration suite, and drop only the disposable database after evidence capture. No `migrate reset`, volume deletion, manual `_prisma_migrations` edits, or unrelated database changes are allowed.

The final implementation must add explicit scripts for the Phase 2 integration topology before this gate is executed. A command name is not evidence until the script exists and has been run.

## Hosted CI changes required for Phase 2

The CI quality job must add the real Keycloak service/container, provider configuration through protected test-only environment, API/browser authentication tests, and retained OIDC/browser evidence. It must preserve the existing PostgreSQL, Redis, MinIO, migration, coverage, lint, build, security, container, SBOM, and DAST jobs. Dependency review, secret scanning, SAST, license, and image scanning remain mandatory.

The hosted workflow must not print Keycloak bootstrap credentials, tokens, realm exports containing secrets, or test user passwords. Test credentials are generated or provided through protected CI secrets and are excluded from artifacts.

## Evidence record format

Every Phase 2 verification record contains:

| Field | Required content |
|---|---|
| Environment | OS, Docker/Node/pnpm versions, image digests, ports, and database/Redis/Keycloak topology. |
| Preconditions | API/worker state and running unrelated/required containers. |
| Command | Exact command from the actual repository root. |
| Result | PASS, PARTIAL, FAIL, NOT EXECUTED, or BLOCKED. |
| Exit code | Exact process exit code. |
| Output | Relevant redacted output, test count, and persisted-state observations. |
| Security | Secret/placeholder/bypass scan result and log/trace redaction observations. |
| Cleanup | Test rows, queues, sessions, databases, containers, and files cleaned without touching unrelated resources. |
| Limitations | Windows-only, provider-test, hosted-CI, retention, or production-deployment boundaries. |

## References

1. [Keycloak — Running Keycloak in a container](https://www.keycloak.org/server/containers)
2. [Keycloak — Docker getting started](https://www.keycloak.org/getting-started/getting-started-docker)
3. [Keycloak — OpenID Connect layers](https://www.keycloak.org/securing-apps/oidc-layers)
4. [`Phase 0 testing policy`](../phase0/TESTING.md)
5. [`Phase 0 deployment policy`](../phase0/DEPLOYMENT.md)
6. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
7. [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
8. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
9. [`Phase 2 plan audit`](PHASE2_PLAN_AUDIT.md)
10. [`Phase 1 Windows restart script`](../phase1/WINDOWS_RESTART_SCRIPT.md)
