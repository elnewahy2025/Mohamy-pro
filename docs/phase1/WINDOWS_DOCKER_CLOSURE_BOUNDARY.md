# Windows Docker-Only Phase 1 Closure Boundary

**Decision status:** Approved infrastructure boundary; Phase 1 remains open until all Windows-provable gates and the final decision review are complete.

## User-approved constraint

Mohamy Pro will remain on the user’s Windows 11 workstation with Docker Desktop. No paid AWS or other cloud service, Linux host, Kubernetes host, or additional persistent machine will be introduced for this phase. Existing PostgreSQL, Redis, primary MinIO, Health-ERP, and Vision-ERP containers must remain untouched except for adding isolated containers where explicitly approved.

## What Windows Docker can prove

The Windows environment can provide real runtime evidence for the API, worker, PostgreSQL, Redis, primary MinIO S3 compatibility, rate limiting, outbox dispatch, Prometheus scraping, collector receipt, ClamAV connectivity, SHA-256 integrity, versioning behavior, and application retention/legal-hold enforcement. Such evidence is valid and must be recorded with exact commands, outputs, versions, and cleanup results.

## What Windows Docker cannot be promoted to prove

A single-host Windows Docker stack cannot be represented as a highly available production deployment of the object-storage/key-management plane. The official MinIO KMS container documentation describes the single-node container procedure for local development and evaluation and directs production deployments to Linux or Kubernetes [1]. The official AIStor container documentation states that the free tier is limited to one compute resource and that an active license is required for AIStor Server [2].

This boundary does not invalidate application-level evidence. It prevents only an inaccurate claim that a workstation-only single-host stack provides production-grade availability, independent host separation, or disaster recovery.

## Closure policy

Phase 1 will not use the phrase **fully production-ready without qualification**. The final decision must use one of these exact outcomes:

| Outcome | Meaning |
|---|---|
| `Phase 1 implementation and Windows runtime gates closed; deployment production boundary open` | Every control that can be evidenced on Windows is complete, but the supported production deployment target is not available under the approved constraint. |
| `Phase 1 fully production-ready` | This outcome is prohibited under Windows Docker only because the supported production deployment boundary has not been evidenced. |
| `Phase 1 not accepted` | Used if any Windows-provable implementation or runtime gate remains incomplete, failed, or undocumented. |

The user’s requirement of “no partial gaps” is satisfied by closing every provable Windows gate and explicitly rejecting an unsupported production claim; it is not satisfied by relabeling an evaluation-only deployment as production.

## Required Windows-only evidence before the final decision

The remaining Windows-provable work includes a clean outbox advanced-recovery run with exit code 0, isolated ClamAV clean and fail-closed evidence, isolated MinIO versioning/Object Lock/encryption behavior that the local service actually supports, final alert/retention configuration review, final documentation-link review, and a consolidated acceptance decision. The AIStor/KMS license file at `C:\Users\ahmed\Desktop\minio.license` remains outside Git and must never be displayed or copied into the repository.

## References

1. [MinIO KMS container installation and production boundary](https://docs.min.io/kms/installation/container/)
2. [MinIO AIStor container installation and free-tier boundary](https://docs.min.io/aistor/installation/container/install/)
3. [MinIO AIStor pricing](https://www.min.io/pricing)
4. [ClamAV official Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html)
5. [Phase 1 acceptance report](ACCEPTANCE_REPORT.md)
6. [Phase 1 gap analysis](GAP_ANALYSIS.md)
