# Finding 4 — CI Pipeline Expansion

## Scope

The Phase 1 CI workflow previously validated only PostgreSQL, local API tests, and frontend build commands. Finding 4 required the pipeline to reflect the frozen Phase 0 order: lint, type/build validation, unit tests, integration and e2e tests, architecture fitness, security scanning, dependency and license policy, secret scanning, container scanning, SBOM generation, and dynamic API security testing.

## Implemented workflow

The workflow in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) now contains four explicit jobs.

| Job | Implemented controls |
|---|---|
| `quality` | PostgreSQL 16, Redis 7, and MinIO services; frozen pnpm install; architecture check; Prisma validation/generation/deployment; migration drift check; API lint; API coverage threshold; real API e2e contract tests; API/frontend builds and frontend tests; coverage artifact. |
| `dependency-review` | Pull-request dependency review with high-severity failure and GPL/AGPL license denial policy. |
| `security` | `pnpm audit`, repository license policy, Gitleaks, Semgrep SAST, Trivy filesystem scan, SARIF upload, and CycloneDX source SBOM. |
| `container` | Production API image build from `backend/api/Dockerfile`, Trivy HIGH/CRITICAL image scan, SARIF upload, and CycloneDX image SBOM. |
| `dast` | Isolated PostgreSQL/Redis/MinIO services, API startup, liveness wait, and OWASP ZAP baseline scan against the documented API surface. |

The API test configuration now enforces a measured baseline of 25% statements, 25% branches, 20% functions, and 25% lines. The current suite exceeds every threshold: 29.05% statements, 27.98% branches, 23.17% functions, and 27.8% lines. This is an initial regression floor, not a claim that all future security-sensitive domain coverage is complete.

The stale e2e starter test was replaced with three real contract assertions: versioned liveness, dependency-complete readiness, and the OpenAPI JSON document path. The test runs against all three CI services and checks correlation ID propagation without embedding local-only Docker assumptions.

## Deterministic local checks

The following commands passed in the repository environment:

```text
pnpm install --frozen-lockfile
pnpm architecture:check
pnpm license:check
python3 scripts/validate-ci.py
pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts"
pnpm --filter api run test:cov
pnpm test
pnpm build
git diff --check
```

The workflow structure validator confirms that all required jobs, infrastructure services, migration checks, coverage/e2e commands, security tools, and SBOM controls are present. The local environment cannot execute GitHub-hosted runners, Docker service containers, OWASP ZAP, or the remote GitHub security-event uploads. Therefore, one external evidence gate remains: a successful GitHub Actions run on the published workflow.

## Boundary

This correction does not claim that the full authentication, authorization, tenant-isolation, document-access, search-access, billing, webhook, or high-risk security test matrix is complete. Those domain flows do not exist in the Phase 1 foundation and must be added with their corresponding product modules. The CI now provides the execution and enforcement surface for those tests when they are introduced.

Finding 1 remains open pending Windows migration validation. Finding 2 remains implemented at repository level pending Windows PostgreSQL/Redis worker evidence. Finding 3 is complete at repository level. Phase 2 remains paused.

## References

1. [`Frozen testing requirements`](../phase0/TESTING.md)
2. [`Frozen security requirements`](../phase0/SECURITY.md)
3. [`Frozen stack and CI requirements`](../phase0/STACK.md)
4. [`Phase 1 audit report`](AUDIT_REPORT.md)
5. [`Phase 1 acceptance report`](ACCEPTANCE_REPORT.md)
