# Phase 2 Entry Decision — Qualified Deployment Boundary

**Decision date:** 2026-08-21

**Decision owner:** Ahmed, project owner

**Related repository:** [`elnewahy2025/Mohamy-pro`](https://github.com/elnewahy2025/Mohamy-pro)

## Approved Decision

The project owner explicitly approved **Option B**:

> Phase 2 may proceed for implementation while the Windows-Docker deployment production boundary remains open as a documented future gate.

This is a deliberate policy exception to the previous pause condition. It does **not** convert the Windows-Docker-only environment into a fully production-ready deployment, and it does **not** authorize an unqualified production-readiness claim.

## Phase Status After Approval

| Area | Status |
|---|---|
| Phase 0 implementation and policy | Accepted as the governing foundation |
| Phase 1 implementation | Closed with evidence |
| Phase 1 Windows runtime gates | Closed with evidence |
| Phase 1 deployment production boundary | Open; future Linux KMS/object-storage plane required for unqualified production deployment |
| Phase 2 Identity and Multi-Tenancy | Authorized for implementation after the owner-approved preflight decision set and corrected-plan re-audit; qualified Windows-Docker boundary remains in force |
| Unqualified production release | Not authorized by this decision |

## What This Approval Allows

Phase 2 may perform preflight, architecture decisions, plan correction, and then implement and verify Identity and Multi-Tenancy capabilities against the existing Windows-Docker development and verification environment after the mandatory plan-audit exit criteria are accepted. The work may include the identity model, memberships, workspace and tenant boundaries, authentication integration, authorization enforcement, tenant-scoped persistence, API contracts, frontend flows, audit/security event foundations assigned to Phase 2, and their tests and runtime evidence, subject to the authoritative Phase 2 plan.

Phase 2 work must preserve the Phase 1 controls. It must not disable validation, rate limiting, security headers, correlation, metrics authorization, OpenTelemetry instrumentation, outbox state safety, storage fail-closed behavior, migration checks, or bilingual English/Arabic LTR/RTL behavior to simplify implementation.

## Corrected-plan re-audit result

The fresh repository audit found P1 planning ambiguities in OIDC/provider configuration, token transport, account lifecycle ownership, tenant switching/bootstrap, API envelopes, HTTP idempotency, RLS decisions, and Phase 2 audit-event persistence. The owner-approved decisions are now recorded in [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md) and the findings/resolutions are recorded in [`PHASE2_PLAN_AUDIT.md`](PHASE2_PLAN_AUDIT.md).

The corrected-plan re-audit confirms that the planning ambiguities are resolved for implementation entry. Phase 2 application coding is authorized under the qualified Windows-Docker boundary. Every implementation requirement still requires its own design-to-runtime evidence chain; this authorization does not claim that any Phase 2 code or runtime workflow already exists.

## What This Approval Does Not Allow

This decision does not authorize any statement that the current Windows-Docker storage/KMS plane is production-grade. It does not authorize a production launch, regulated-data deployment, high-availability claim, disaster-recovery claim, or independent-host separation claim for the current workstation stack.

It also does not remove the project rule that each future phase must be fully implemented, tested, evidenced, documented, and approved before the next phase begins. Option B changes only the **entry condition for beginning Phase 2**; it does not weaken Phase 2’s completion gate or permit Phase 3 to begin with unresolved critical evidence.

## Mandatory Future Production Gate

Before an unqualified production deployment claim or production release is approved, the project must implement and verify a supported Linux KMS/object-storage plane, or another explicitly approved production-capable deployment architecture. Required evidence includes:

| Gate | Required proof |
|---|---|
| KMS/key-management boundary | Real key-management service, secure configuration, key identity, encryption response, and rotation/operational ownership. |
| Object-storage deployment | Supported production topology, object locking, versioning, encryption, malware scanning, backup, and restore behavior. |
| Availability and separation | Evidence appropriate to the approved topology for host separation, restart/recovery, and failure handling. |
| Retention and observability | Effective log/metric retention, durable trace backend, authorized metrics scrape, and alert routing. |
| Security and operations | Secret handling, access control, incident response, restore runbook, and rollback evidence. |
| Acceptance update | Updated [`docs/phase1/FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md) and [`docs/phase1/WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`](../phase1/WINDOWS_DOCKER_CLOSURE_BOUNDARY.md), followed by explicit approval. |

Until that gate is complete, the exact production wording remains:

> **Phase 1 implementation and Windows runtime gates closed; deployment production boundary open.**

## No-Conflict Rules

The following rules govern Phase 2 and prevent conflict with Phase 0 and Phase 1:

1. The Windows-Docker environment is the current development and verification environment, not an approved unqualified production deployment.
2. Phase 2 application coding begins only after the corrected-plan re-audit is published; this requirement is now satisfied by [`PHASE2_PLAN_AUDIT.md`](PHASE2_PLAN_AUDIT.md).
3. Every Phase 2 requirement must have a traceable design, implementation, integration path, test, runtime evidence, and documented acceptance result.
4. Identity, membership, tenant, and authorization code must be enforced at the backend and database boundaries; frontend-only checks are insufficient.
5. Tenant context must not be inferred from a client-controlled field without authenticated membership and authorization verification.
6. All Phase 1 security, observability, migration, outbox, storage, bilingual, and runtime controls remain mandatory regression gates.
7. No phase-specific Markdown may be stored outside its canonical `docs/phaseN` directory. This decision is stored under `docs/phase2`.
8. Phase 3 remains blocked until Phase 2 is fully production-ready under the project’s evidence rules.

## References

1. [`Phase 1 final closure review`](../phase1/FINAL_CLOSURE_REVIEW.md)
2. [`Phase 1 acceptance report`](../phase1/ACCEPTANCE_REPORT.md)
3. [`Phase 1 gap analysis`](../phase1/GAP_ANALYSIS.md)
4. [`Windows-Docker closure boundary`](../phase1/WINDOWS_DOCKER_CLOSURE_BOUNDARY.md)
5. [`Phase 1 observability closure decision`](../phase1/OBSERVABILITY_CLOSURE_DECISION.md)
6. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
