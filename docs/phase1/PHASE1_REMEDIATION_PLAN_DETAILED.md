# Detailed Phase 1 Remediation Plan

## 1. Purpose and governing decision

This plan addresses every Phase 1 item classified as **PARTIAL, INCOMPLETE, BLOCKED, UNVERIFIED, IMPLEMENTED/EVIDENCE-GATED, or CONFLICTING** in [`ENGINEERING_GOVERNANCE_REVERIFICATION.md`](ENGINEERING_GOVERNANCE_REVERIFICATION.md). It is governed by [`skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md), the authoritative Phase 1 closure rules in [`Plan.txt`](../../Plan.txt), and the frozen Phase 0 policies.

The plan is a **remediation plan only**. It does not declare any item implemented, tested, production-ready, or closed before the relevant code, dependency chain, runtime workflow, and evidence are actually verified. Phase 2 remains paused until the final closure gate in this document is passed.

> Every workstream must trace the requirement through design, implementation, integration, test, execution, and evidence. A missing stage is a closure blocker.

## 2. Status vocabulary

The following statuses are mandatory in implementation notes and acceptance documents:

| Status | Meaning |
|---|---|
| `PASS` | The requirement is implemented, connected, tested, executed, and supported by retained evidence. |
| `PARTIAL` | Some implementation exists, but the full requirement or dependency chain is incomplete. |
| `MISSING` | The required implementation or evidence does not exist. |
| `BLOCKED` | Verification or remediation cannot proceed until an external dependency, decision, environment, or user action is available. |
| `UNVERIFIED` | The code may exist, but the required command or runtime workflow has not produced evidence. |
| `CONFLICTING` | Code, documentation, configuration, or frozen requirements contradict one another. |

No status may be upgraded based on code inspection alone. Every upgrade requires a dated command result, runtime output, test result, or approved written decision.

## 3. Findings-to-workstream map

| Workstream | Findings addressed | Primary closure condition |
|---|---|---|
| A. Governance and documentation baseline | Stale API README, stale gap analysis, stale acceptance revision, CI job-count inconsistency, untracked plan, contradictory links or claims | All Phase 1 documents are current, canonical, internally consistent, and traceable to evidence. |
| B. Local runtime and migration reconciliation | Migration history, Docker services, PostgreSQL, Redis, health, OpenAPI, restore smoke | Windows runtime evidence proves the existing stack works without destructive container or database operations. |
| C. Database integrity and generated contracts | Partial schema integrity, generated client boundary, environment contract, API client boundary | Decisions are recorded and the database/API/client chain has executable checks. |
| D. Queue and outbox runtime proof | Worker, queue consumption, retry, leases, duplicate delivery, dead letters | A real PostgreSQL/Redis workflow proves delivery semantics end to end. |
| E. API e2e and critical workflow testing | Failed e2e startup, missing integration tests, missing security/contract/workflow coverage | CI and local e2e run against controlled infrastructure and prove critical Phase 1 workflows. |
| F. Observability baseline | Metrics, traces, propagation, retention, audit/security logging, alerting | Frozen observability requirements are implemented or formally revised before closure. |
| G. Storage and security baseline | Integrity, versioning, encryption, retention/legal hold, malware scanning, secrets, rate limiting, CSRF, security events | Required controls are implemented, tested, scanned, and runtime-verified or explicitly approved as later-phase scope. |
| H. CI and supply-chain execution | Hosted workflow, service containers, scan jobs, artifacts, DAST, SBOM | A real GitHub Actions run succeeds and all required artifacts are retained. |
| I. Architecture and deployment boundary | Explicit backend layers, Compose/API/worker runtime, PostgreSQL version decision | Architecture and runtime decisions are consistent, documented, and verified. |

## 4. Sequencing and phase gates

The work must be performed in the following order. A later workstream may not be represented as closed while an earlier gate is blocked unless the blocking dependency is explicitly recorded as `BLOCKED` and the user approves the documented exception.

| Gate | Required completion before advancing |
|---|---|
| Gate 0: Baseline | Cleanly identify local changes, preserve untracked work, reread authoritative documents, and record the exact starting commit. |
| Gate 1: Decisions | Resolve PostgreSQL 16 versus PostgreSQL 18, generated OpenAPI client scope, observability scope, and whether missing domain packages are Phase 1 or later scope. Record decisions in `docs/phase1`. |
| Gate 2: Repository correction | Apply code, migration, CI, configuration, and documentation changes required by approved decisions. Run `git diff --check` and review the complete dependency chain. |
| Gate 3: Local static verification | Frozen install, Prisma validation/generation, lint, architecture, license, dependency, secret, tests, coverage, and builds pass. |
| Gate 4: Local runtime verification | Windows PostgreSQL/Redis/MinIO, API, worker, health/OpenAPI, migration checker, queue/outbox, storage, and restore workflows produce retained output. |
| Gate 5: Hosted verification | GitHub Actions runs quality, e2e, dependency, license, secret, SAST, filesystem, container, SBOM, and DAST jobs with retained artifacts. |
| Gate 6: Closure review | Every requirement is `PASS` or has an explicitly approved, documented deferral; no critical item is `UNVERIFIED`, `BLOCKED`, `MISSING`, or `CONFLICTING`. |

## 5. Workstream A — Governance and documentation baseline

### A1. Correct canonical Phase 1 documentation

Replace the generic Nest starter content in `docs/phase1/API_README.md` with project-specific documentation. It must describe the API package, required environment variables without exposing secrets, local infrastructure ports, Prisma commands, API startup, worker startup, health endpoints, OpenAPI location, e2e prerequisites, coverage command, migration drift check, backup/restore commands, and known Phase 1 boundaries.

Rewrite `docs/phase1/GAP_ANALYSIS.md` so it describes the current Next.js frontend, real outbox worker, current CI workflow, actual e2e contract, and remaining gaps. Remove obsolete Hello World, placeholder CI, or Vite claims. Update `docs/phase1/ACCEPTANCE_REPORT.md` to reference the actual current commit only after the documentation commit is published. Correct the CI documentation job count to match the workflow exactly. Decide whether the untracked `docs/phase1/REMEDIATION_PLAN.md` should be committed, merged into this plan, or removed only with explicit approval; do not silently delete it.

### A2. Documentation verification

For every Phase 1 document, verify that links resolve to canonical paths under `docs/phase0`, `docs/phase1`, or repository-root shared documentation where allowed. Search for stale claims such as `Hello World`, `Vite`, `React Router`, old commit hashes, generic Nest starter text, `placeholder`, and `not yet implemented`. Inspect every result in context; do not blanket-replace terms that are intentionally present in audit history.

### A3. Acceptance evidence format

Add a dated evidence table to the acceptance report with command, working directory, exit code, result, test count, runtime target, and artifact path. Separate sandbox evidence, Windows evidence, and GitHub Actions evidence. Every unavailable command must be recorded as `NOT EXECUTED` or `BLOCKED`, not inferred from a similar command.

**Exit evidence:** updated API README, gap analysis, acceptance report, CI document, link check, stale-claim search output, final diff review, and a published documentation commit.

## 6. Workstream B — Local runtime and migration reconciliation

### B1. Non-destructive Windows baseline

When the user is at the Windows machine, begin at the actual repository root. Before pulling or changing anything, run `git status --short --branch` and preserve all local changes. Do not reset, restore, stash, overwrite, remove containers, remove volumes, drop tables, or edit `_prisma_migrations` manually.

Use the absolute pnpm path if necessary and verify `11.22.0`. Synchronize only with `git pull --ff-only origin main` after the local-change decision is safe. Then run the required repository synchronization commands in Rule #2: `pnpm install --frozen-lockfile`, Prisma Client generation, and Prisma migration deployment.

### B2. Migration history evidence

Run the migration status and read-only checker with the isolated Compose database. Capture:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
$pnpmCmd = "$env:APPDATA\npm\pnpm.cmd"
& $pnpmCmd --version
& $pnpmCmd install --frozen-lockfile
& $pnpmCmd --filter api exec prisma validate
& $pnpmCmd --filter api exec prisma generate
& $pnpmCmd --filter api exec prisma migrate status
& $pnpmCmd db:check
```

If an unexpected applied migration such as the previously observed locally generated baseline appears, first export the complete `_prisma_migrations` rows and take a fresh backup. Compare migration names and checksums with repository files. Use only a documented, non-destructive Prisma reconciliation command after the evidence is reviewed. Never delete migration rows or database objects as a shortcut.

Create a clean disposable PostgreSQL 16 or 18 test database according to the approved version decision. Run `prisma migrate deploy`, `prisma migrate status`, `db:check`, and a schema inspection. Retain the logs and database version. The clean deployment and existing-database validation are separate evidence items.

### B3. Runtime infrastructure and health

Verify that only the Mohamy services use the isolated ports and that unrelated containers remain untouched. Capture `docker ps`, Compose service status, health checks, image versions, ports, volumes, and logs. Start the API and worker as separate processes. Execute:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health/live
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
(Invoke-WebRequest http://localhost:3000/api/docs-json).StatusCode
```

The readiness evidence must show `postgres`, `redis`, `queue`, and `objectStorage` as `up`. Retain the correlation ID from liveness and verify the OpenAPI document includes the current versioned health paths. If any dependency is degraded, record the actual status and fix the dependency rather than weakening the health check.

**Exit evidence:** migration table output, migration status, drift checker result, clean-database deployment log, Compose status, API/worker logs, readiness JSON, OpenAPI status, and an unchanged unrelated-container inventory.

## 7. Workstream C — Database integrity and generated contracts

### C1. Database integrity review

Inspect the Prisma schema and migrations against the governance database checklist: primary keys, foreign keys, unique constraints, check constraints, required columns, indexes, cascades, soft-delete behavior, transaction boundaries, race conditions, duplicate handling, referential integrity, migration consistency, rollback safety, and ownership boundaries.

Do not invent domain relations that Phase 1 does not require. For every missing domain constraint, classify it as either Phase 1-required, explicitly deferred to Identity/Multi-Tenancy or a later domain phase, or ambiguous and requiring approval. Record the decision in `docs/phase1`.

### C2. Generated API contract boundary

Resolve the frozen requirement for a generated OpenAPI client. The preferred implementation is to generate a typed client from the committed OpenAPI document, expose it through a shared contracts/client package, and make the frontend use the client for the implemented health/status workflows. The dependency chain must be reviewed from controller decorators through OpenAPI generation, client generation, frontend hook/state, and tests.

If the generated client is intentionally deferred, do not call the shared contract layer complete. Record the exact deferral, reason, affected routes, responsible phase, and acceptance impact in a formal decision document under `docs/phase1`.

### C3. Environment and secrets contract

Separate local/test defaults from production configuration. Keep local Compose credentials only in local/test contexts, redact them in reports, and ensure production mode fails closed when real secret values are absent. Do not allow `NODE_ENV` omission to select a production-sensitive behavior silently. Add tests for required production variables, invalid URLs, CORS origin parsing, and secret redaction. Resolve the secrets-manager requirement as implemented Phase 1 functionality or an approved later-phase decision; do not assume local `.env.example` is sufficient for production.

**Exit evidence:** schema review matrix, approved scope decisions, generated client artifacts and consumer tests or approved deferral, environment validation tests, and redacted configuration review.

## 8. Workstream D — Queue and outbox runtime proof

### D1. Worker and queue topology decision

Confirm whether Phase 1 requires one queue with a dedicated worker or separate queues for each workload. The frozen requirement must be referenced explicitly. If separate queues are required, add named queues and worker processes without silently changing job semantics. If one queue is accepted for the foundation, document the decision and its scaling limitations.

### D2. Real delivery workflow

Against live PostgreSQL and Redis, create a test outbox message through the real service path. Run the dispatcher and worker as separate processes. Capture the full state sequence:

`PENDING → PROCESSING → PROCESSED`

Then execute failure cases:

- Handler failure moves the row to `FAILED` with a future `availableAt`.
- A retry is claimed after the backoff window.
- Maximum attempts move the row to `DEAD_LETTER`.
- An expired lease is reclaimed or dead-lettered according to attempt count.
- A duplicate BullMQ job does not double-process a message after the lease changes.
- An unknown event type fails closed and never becomes `PROCESSED`.
- Queue submission failure returns the row to a retryable state.
- Worker shutdown closes Redis and BullMQ cleanly.

Verify database state directly after each transition, inspect worker logs, and retain correlation/job/outbox IDs. Tests may use isolated test doubles only inside unit tests; the acceptance workflow must use real PostgreSQL and Redis.

### D3. Idempotency integration

Connect the idempotency registry to the appropriate HTTP request lifecycle only if that capability is within the approved Phase 1 scope. If it is required, implement the interceptor/guard, request-key validation, tenant/user scope, conflict replay, expiry, and persistence transaction. Test first request, same-key replay, same-key different-payload rejection, concurrent requests, expiry, and unauthorized scope. If it is a persistence skeleton by design, document it as a deferred foundation component and do not describe it as request idempotency.

**Exit evidence:** real worker logs, SQL state snapshots, retry/dead-letter records, duplicate-delivery test output, shutdown log, and idempotency integration test or approved deferral.

## 9. Workstream E — API e2e and critical workflow testing

### E1. Make e2e startup deterministic without production mocks

The current e2e suite correctly targets the current API contract but requires external infrastructure and `DATABASE_URL`. Add a controlled e2e environment bootstrap that supplies test-only configuration and waits for real PostgreSQL, Redis, and MinIO. Preferred options are CI service containers with explicit health waits or Testcontainers if approved by the repository architecture. Do not make the application silently default to fake infrastructure and do not add a production bypass.

The e2e harness must start the real `AppModule`, apply the same prefix/versioning/validation/security configuration as production, and shut down cleanly even when startup fails. The test must fail with a clear infrastructure diagnostic when a dependency is unavailable.

### E2. Contract coverage

Retain and extend the current liveness, readiness, correlation ID, and OpenAPI tests. Add invalid input and standardized error response tests. Verify that OpenAPI paths match actual controller routes and that the generated client, if implemented, consumes the same contract.

### E3. Critical Phase 1 workflows

Phase 1 critical workflows are the foundation workflows, not later Identity or Case Management features. Add real tests for:

| Workflow | Required cases |
|---|---|
| Startup and health | Happy path, dependency degradation, controlled error response, correlation ID. |
| Migrations | Clean deployment, existing baseline status, drift detection, failed deployment handling. |
| Queue/outbox | Success, handler failure, retry, duplicate, lease recovery, dead letter, shutdown. |
| Object storage | Bucket readiness, upload, integrity metadata, signed download, delete, failure handling. |
| Configuration/security | Missing required environment, invalid values, CORS boundary, redaction, validation rejection. |
| Frontend/API contract | English and Arabic route behavior, RTL/LTR, API status rendering, API error rendering. |
| Backup/restore | Backup creation, disposable restore, table/data verification, cleanup, primary database unchanged. |

For every workflow, include happy path, validation failure, authentication/authorization behavior where an endpoint is protected, persistence verification, controlled errors, and frontend behavior. Do not claim authorization coverage until protected endpoints actually exist and are tested.

### E4. Coverage policy

Keep the current executed baseline visible, then set thresholds from an approved policy rather than an arbitrary number. Increase thresholds only when meaningful production paths are covered. Coverage must not be improved by excluding affected source files or writing superficial tests.

**Exit evidence:** successful local e2e output, CI e2e output, test count, coverage report, workflow matrix, and retained logs.

## 10. Workstream F — Observability baseline

### F1. Metrics

Implement Prometheus metrics required by the frozen policy: HTTP request duration and status, database query duration and errors, queue length/depth, outbox state counts, worker job duration/status, and application error rate. Define metric names, labels, cardinality limits, and endpoint exposure. Do not include secrets, document contents, client financial details, or high-cardinality IDs in labels.

Add unit tests for metric registration and integration tests proving metrics change after representative HTTP, database, queue, and error events. Add a scrape check in CI or a local runtime acceptance command.

### F2. OpenTelemetry tracing

Add OpenTelemetry instrumentation for inbound HTTP requests, database calls, Redis/BullMQ operations where supported, outbox dispatcher, and worker handler execution. Propagate the correlation ID and trace context into logs and job payload metadata without exposing confidential content. Verify that trace context survives API-to-outbox-to-worker boundaries.

Add tests or a local collector-based runtime check proving spans are emitted and linked. If a collector is not run in CI, retain a documented limitation and do not claim end-to-end tracing.

### F3. Retention, audit, security logs, and alerting

Resolve the frozen policy requirements for Loki operational logs, Prometheus retention, seven-year audit/security records, and alerting. Implement only the Phase 1 foundation boundary approved by the project owner; if full retention infrastructure is later-phase scope, formalize that decision rather than treating Pino logs as equivalent. Define redaction and privacy tests for every emitted log path.

**Exit evidence:** metrics endpoint output, metric tests, trace/collector output, propagation test, retention/security decision, redaction test, and alert rule or approved deferral.

## 11. Workstream G — Object storage and security baseline

### G1. Storage integrity and metadata

Extend the storage metadata contract and database model only after an approved migration design. Calculate SHA-256 during upload, persist the digest and content metadata, and verify integrity on download or background validation. Add versioning behavior and object identity semantics. Test upload tampering, duplicate object handling, failed multipart or interrupted upload behavior, and signed URL scope.

### G2. Versioning, encryption, retention, legal hold, and malware scanning

Resolve each frozen storage control explicitly:

| Control | Remediation |
|---|---|
| Versioning | Enable and verify bucket/object version behavior; define delete semantics. |
| Encryption at rest | Configure the approved MinIO/production equivalent and prove configuration, not merely documentation. |
| Retention/legal hold | Add metadata and enforcement path with authorization and audit records. |
| Malware scanning | Define synchronous/asynchronous scan status, quarantine behavior, failure handling, and user-visible state. |
| Private access | Preserve private buckets and bounded signed URLs; test unauthorized access. |

Do not substitute a flag, mock scan result, or documentation-only claim for a real control. If malware scanning is explicitly later-phase, record it as a blocker or approved deferral.

### G3. Application security controls

Add or formally scope rate limiting, CSRF protection where applicable, security-event logging, production secret-manager integration, and strict CORS policy. Add tests for negative security cases. Never weaken validation, authorization, or CORS to make tests pass. Review the full chain from request middleware through controllers, services, storage, database, and frontend behavior.

### G4. Security scan execution

Run dependency audit, license policy, Gitleaks, Semgrep, Trivy filesystem/container scans, SBOM generation, and OWASP ZAP in an actual GitHub Actions run. Review every finding rather than relying only on exit codes. Retain reports and record tool versions, configuration, ignored findings, and any approved exceptions.

**Exit evidence:** storage migration and tests, runtime object workflow, negative security tests, secret scan, SAST, dependency, container, SBOM, DAST artifacts, and reviewed exception register.

## 12. Workstream H — CI and supply-chain execution

### H1. Workflow correctness

Keep the current service-container workflow, but validate it in GitHub Actions. Confirm that PostgreSQL, Redis, and MinIO health checks complete before migrations and e2e. Confirm that `DATABASE_URL`, Redis, MinIO, and CORS values are test-only and cannot be used as production configuration. Pin or approve action versions according to the project’s supply-chain policy.

### H2. Job and artifact matrix

The documentation must match the real workflow. Record the actual number of jobs and required dependencies. At minimum, retain:

- quality, migration, coverage, API e2e, and frontend artifacts;
- dependency-review output on pull requests;
- dependency audit and license output;
- Gitleaks and Semgrep output;
- Trivy filesystem and image SARIF;
- source and image SBOMs;
- container build output and scan result;
- OWASP ZAP report and API logs.

A workflow definition is not evidence that a job passed. The closure report must link the actual run ID and artifact locations.

### H3. Hosted-run failure protocol

If a hosted job fails, record the exact job, command, exit code, logs, and root cause. Fix the root cause in code or workflow and rerun. Do not mark failures as allowed, add broad `continue-on-error`, lower scan severity, or remove a service to obtain a green check. Any exception must use the explicit `WORKAROUND` format required by the governance skill and receive approval.

**Exit evidence:** successful run URL/ID, complete job matrix, artifact list, scan reports, and reviewed failures/exceptions.

## 13. Workstream I — Architecture, deployment, and version decisions

### I1. Explicit backend boundaries

Decide whether the Phase 1 closure definition requires physical Presentation/API/Application/Domain/Infrastructure directories now or only a documented foundation boundary. If required, refactor without changing behavior: controllers and transport concerns remain in Presentation/API, orchestration in Application, business rules in Domain, and Prisma/Redis/BullMQ/S3 in Infrastructure. Add architecture-fitness rules that enforce the allowed import directions and test the full dependency chain.

### I2. API and worker runtime packaging

The API Dockerfile exists, but local Compose does not run API and worker services. Decide whether Phase 1 requires an executable full-stack Compose profile. If yes, add separate API and worker services that use the isolated host infrastructure, health checks, non-root users, safe environment injection, graceful shutdown, and no impact on unrelated containers. Build and run the images locally and in CI. If manual API/worker startup is the approved Phase 1 boundary, document it as such and keep the runtime acceptance commands explicit.

### I3. PostgreSQL version decision

Resolve the PostgreSQL 16 Compose image versus frozen PostgreSQL 18 requirement before changing migrations or acceptance. Record the decision, compatibility test, image update, and migration evidence. Do not silently upgrade or downgrade a stateful service while local data exists.

### I4. Workspace scope decision

Resolve whether `integrations/*` and `ai/*` are Phase 1 deliverables. If not, remove misleading workspace patterns or document them as reserved future package boundaries. If they are required, create complete packages with real contracts and tests; do not add empty stubs.

**Exit evidence:** approved architecture decisions, updated workspace/configuration, architecture test output, container runtime output, version compatibility evidence, and updated documentation.

## 14. Workstream J — Final acceptance and closure

### J1. Requirement matrix

Create a final matrix with columns: Requirement, Source, Implementation files/functions, Database/migration, API, Frontend/client, Tests, Command, Exit code, Runtime artifact, Status, and Reviewer decision. Every row must be `PASS` or have a formally approved deferral with owner, target phase, rationale, risk, and acceptance impact.

### J2. Final security and placeholder search

Search the complete repository, excluding generated dependency/build trees only when the exclusion is documented, for:

`TODO`, `FIXME`, `XXX`, `HACK`, `mock`, `stub`, `fake`, `dummy`, `placeholder`, `temporary`, `NotImplemented`, `password`, `secret`, `api_key`, `token`, `jwt`, `private_key`, `credential`, `bypass`, `disable_auth`, `skip_auth`, `allow_all`, `verify=False`, `ssl=False`, and `debug=True`.

Inspect every meaningful result. Test mocks must be isolated to tests. Local credentials must be redacted in reports and proven inaccessible to production configuration. Any unexplained security bypass is a blocker.

### J3. Complete runtime sequence

On the Windows machine with the user’s existing unrelated containers preserved:

1. Record `git status --short --branch` and current container inventory.
2. Synchronize safely and run frozen install, Prisma generate, and migration deploy.
3. Run migration status and drift checker.
4. Start API and worker.
5. Verify liveness, readiness, correlation ID, OpenAPI, and logs.
6. Run queue/outbox success and failure workflows.
7. Run storage upload/download/delete and integrity workflows.
8. Run frontend English/Arabic critical routes and API error behavior.
9. Run backup and corrected restore smoke test.
10. Stop only Mohamy processes/services that were started for the test; leave unrelated containers and volumes unchanged.
11. Capture exit codes, logs, response bodies, database state, and artifact paths.

### J4. Closure decision

Phase 1 may be declared closed only when all of the following are true:

- the final repository diff is reviewed and no accidental files, generated artifacts, secrets, placeholders, or stale claims remain;
- frozen install, lint, type/build, unit, integration, e2e, coverage, architecture, license, dependency, and security checks pass with actual executed output;
- Windows migration, API, worker, Redis, MinIO, health, OpenAPI, and restore workflows pass;
- CI has a successful hosted run with the required artifacts;
- observability requirements are implemented or formally revised with explicit approval;
- all database, API, backend, frontend, authorization, configuration, deployment, logging, audit, and test dependency chains are reviewed;
- no critical requirement remains `UNVERIFIED`, `BLOCKED`, `MISSING`, `PARTIAL`, or `CONFLICTING` without an approved deferral;
- the acceptance report is current and links canonical documents and actual evidence;
- the user explicitly approves the Phase 1 closure decision.

## 15. Non-destructive operating constraints

These constraints apply to every workstream:

- Always run Git commands from the actual repository root.
- Before pulling, run `git status --short` and preserve local changes.
- Use pnpm 11.22.0 only; do not substitute npm, npx, yarn, or ad hoc package-manager commands.
- Never reset, restore, stash, delete, overwrite, or recreate local work without explicit approval.
- Never remove or recreate unrelated Docker containers, images, networks, or volumes.
- Never reset the user’s database, drop production-like tables, delete migration metadata, or manually edit `_prisma_migrations` as a shortcut.
- Use disposable databases for restore and integration validation.
- Keep local/test credentials isolated and never treat them as production secrets.
- Do not add mocks, fake integrations, hardcoded privileged users, disabled validation, disabled authorization, unrestricted CORS, or scan suppression to obtain green tests.
- Report every workaround with the required `WORKAROUND` structure, including limitations and production status.
- Save all phase-specific Markdown under `docs/phase1` and use canonical phase-directory links.

## 16. Deliverables and evidence files

The remediation should produce or update the following canonical files:

| Deliverable | Purpose |
|---|---|
| `docs/phase1/API_README.md` | Project-specific API, worker, migration, runtime, test, and restore instructions. |
| `docs/phase1/GAP_ANALYSIS.md` | Current, non-stale list of remaining gaps and approved deferrals. |
| `docs/phase1/ACCEPTANCE_REPORT.md` | Final requirement matrix, commands, outputs, runtime evidence, and closure decision. |
| `docs/phase1/MIGRATION_BASELINE_RECONCILIATION.md` | Migration evidence and non-destructive reconciliation record. |
| `docs/phase1/OUTBOX_DELIVERY_DESIGN.md` | Outbox state machine, job contract, retry, lease, and dead-letter design. |
| `docs/phase1/CI_PIPELINE_EXPANSION.md` | Exact CI job matrix and actual hosted-run evidence. |
| `docs/phase1/ENGINEERING_GOVERNANCE_REVERIFICATION.md` | Fresh verification baseline and current blockers. |
| `docs/phase1/PHASE1_REMEDIATION_PLAN_DETAILED.md` | This plan and sequencing authority. |
| `docs/phase1/PHASE1_EVIDENCE/` | Dated command logs, runtime JSON, SQL state snapshots, scan reports, and hosted CI artifact index. |

Sensitive values must never be stored in evidence artifacts. Redact passwords, tokens, private keys, signed URLs, and confidential payloads.

## 17. Final plan outcome

The expected result is not merely a green local unit-test run. The expected result is a Phase 1 foundation whose implementation, dependency chains, runtime behavior, security controls, documentation, and evidence agree with one another. Until that state is demonstrated, the only valid status is **Phase 1 not closed; Phase 2 paused**.

## References

1. [`Engineering Governance and Verification skill`](../../skills/engineering-governance/SKILL.md)
2. [`Latest Phase 1 engineering-governance re-verification`](ENGINEERING_GOVERNANCE_REVERIFICATION.md)
3. [`Authoritative Phase 1 plan and closure criteria`](../../Plan.txt)
4. [`Phase 1 expert audit`](AUDIT_REPORT.md)
5. [`Phase 1 acceptance report`](ACCEPTANCE_REPORT.md)
6. [`Phase 1 migration reconciliation`](MIGRATION_BASELINE_RECONCILIATION.md)
7. [`Phase 1 outbox delivery design`](OUTBOX_DELIVERY_DESIGN.md)
8. [`Phase 1 CI expansion`](CI_PIPELINE_EXPANSION.md)
9. [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
10. [`Phase 0 testing policy`](../phase0/TESTING.md)
11. [`Phase 0 security policy`](../phase0/SECURITY.md)
12. [`Phase 1 restore smoke script`](../../infrastructure/backup/restore-smoke.ps1)
