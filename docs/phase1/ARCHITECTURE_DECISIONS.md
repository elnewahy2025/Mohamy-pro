# Phase 1 Architecture Decisions

**Status:** Accepted for Phase 1

## PostgreSQL Version

Mohamy Pro standardizes on **PostgreSQL 16** for Phase 1. The repository Compose definition uses `postgres:16-alpine`, and the Windows runtime verification used PostgreSQL 16.15. The migration set, Prisma configuration, backup/restore smoke path, and documented runtime evidence are therefore aligned to PostgreSQL 16.

The project will not change the major PostgreSQL version during Phase 1 closure. A future upgrade requires a separate compatibility exercise covering disposable migration deployment, schema/index comparison, backup restore, API readiness, worker startup, and hosted CI. Until that evidence exists, PostgreSQL 16 is the production baseline.

## API and Worker Orchestration

The API and worker run as **separate production processes** built from the same backend package and module graph. `dist/src/main.js` owns the HTTP API, health/readiness endpoints, OpenAPI publication, metrics endpoint, and graceful API shutdown. `dist/src/worker.js` owns queue and outbox consumption, the worker metrics endpoint, and graceful worker shutdown.

This separation prevents background processing from being coupled to HTTP process availability while preserving one shared implementation of configuration, database access, Redis access, queue telemetry, outbox semantics, and logging. Production deployment must run both processes and must monitor both readiness boundaries independently.

## Reserved Workspace Scope

The workspace reserves `integrations/*` and `ai/*` for future phases. There are currently no packages in those scopes and no Phase 1 runtime dependency on them. The scopes are intentionally reserved rather than represented by empty placeholder packages; no package, build target, or import is claimed until a concrete feature has an owner, contract, tests, and deployment boundary.

Future additions to either scope must be registered in the workspace configuration, documented in the corresponding phase directory, included in the affected CI and build gates, and verified against the API/worker dependency direction. No future package may silently create a second configuration, storage, identity, or tenant boundary.

## Decision Summary

| Decision | Phase 1 baseline | Required evidence before change |
|---|---|---|
| PostgreSQL major version | PostgreSQL 16 | Disposable migration, schema, backup/restore, runtime, and CI compatibility evidence |
| API/worker process model | Separate processes from one backend package | Independent startup, readiness/metrics, shutdown, and queue-consumption evidence |
| `integrations/*` scope | Reserved; no packages yet | Concrete integration contract, owner, tests, and deployment boundary |
| `ai/*` scope | Reserved; no packages yet | Concrete AI contract, owner, tests, security review, and deployment boundary |
