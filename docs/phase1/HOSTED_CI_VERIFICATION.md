# Hosted GitHub Actions Verification

**Status:** Passed for the hosted CI workflow at the recorded revision

**Run:** [CI Pipeline run 32507250236](https://github.com/elnewahy2025/Mohamy-pro/actions/runs/32507250236)

**Commit tested:** [`85333579d63b1f62869ff74d9570beaff7efe5e3`](https://github.com/elnewahy2025/Mohamy-pro/commit/85333579d63b1f62869ff74d9570beaff7efe5e3)

**Execution date:** 2026-08-21

## Job Results

| Job | Result | Evidence |
|---|---|---|
| Quality, integration, and e2e | `success` | Architecture check, Prisma validation and generation, migration deployment, migration checker, API lint, API coverage tests, API e2e tests, API build, frontend tests, and frontend build completed successfully. |
| Static security and supply chain | `success` | Dependency audit, license policy, Gitleaks, Semgrep SAST, Trivy filesystem scan, SARIF upload, and source SBOM completed successfully. |
| Container build and scan | `success` | API image build, Trivy image scan, image SARIF upload, and image SBOM completed successfully. |
| Dynamic API security baseline | `success` | MinIO startup, database preparation, API startup, OWASP ZAP baseline scan, report upload, and cleanup completed successfully. |
| Dependency and license policy | `skipped` | This job is intentionally restricted to pull-request events and was not applicable to this push event. |

## Retained Artifacts

The GitHub API reported the following artifacts as not expired at evidence-capture time:

| Artifact | Size | Expiry |
|---|---:|---|
| `zap-report-85333579d63b1f62869ff74d9570beaff7efe5e3` | 21,951 bytes | 2026-09-04 17:20:08 UTC |
| `api-coverage-85333579d63b1f62869ff74d9570beaff7efe5e3` | 157,008 bytes | 2026-09-04 17:17:31 UTC |
| `api-image-sbom-85333579d63b1f62869ff74d9570beaff7efe5e3.cdx.json` | 420,443 bytes | 2026-11-19 17:15:56 UTC |
| `sbom-85333579d63b1f62869ff74d9570beaff7efe5e3.cdx.json` | 11,249 bytes | 2026-11-19 17:15:56 UTC |
| `gitleaks-results.sarif` | 6,772 bytes | 2026-11-19 17:15:56 UTC |

The quality and security reports are therefore retained in GitHub Actions rather than existing only in transient runner storage.

## CI Corrections Required to Reach This Run

The successful run follows these verified corrections:

1. The e2e harness now configures correlation middleware and OpenAPI JSON publication exactly as the production bootstrap does.
2. MinIO is started explicitly with a pinned release and its documented `server /data` command in the quality and DAST jobs.
3. The pnpm workspace deploy uses the pnpm 11-compatible `--legacy` deployment mode, and the container API entrypoint is `dist/src/main.js`.
4. Hosted action references use existing tags, and pnpm is initialized before Node’s pnpm cache setup.
5. ZAP writes reports to a runner-writable directory and warning-only findings are retained in the report without failing the job when no FAIL findings exist.

## Acceptance Boundary

This run closes the hosted CI workflow gate for the tested revision. It does not prove hosted Prometheus retention enforcement, collector-received OpenTelemetry spans, external MinIO object-lock/versioning semantics, ClamAV runtime scanning, or the remaining outbox recovery and idempotency lifecycle gates. Those controls remain independently tracked in the Phase 1 acceptance report and gap analysis.
