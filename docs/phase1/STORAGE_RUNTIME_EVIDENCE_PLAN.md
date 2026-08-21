# Phase 1 Storage Runtime Evidence Plan

**Status:** Open runtime gate; no production-encryption claim made

## Evidence Boundary

The application storage adapter is implemented with SHA-256 integrity metadata, versioning configuration, server-side-encryption request configuration, retention/legal-hold checks, and a ClamAV fail-closed boundary. Repository tests and Windows migration/schema evidence do not, by themselves, prove that a MinIO deployment has enforced versioning, object lock, encryption at rest, or malware scanning.

The official MinIO documentation states that SSE-S3 and SSE-KMS depend on an external key-management system, and that the static-key configuration is intended for testing or evaluation rather than production [1] [2]. The current local Compose MinIO service has no configured KMS/KES boundary. Therefore, a local bucket upload against that service must not be recorded as production-grade encryption evidence.

> The correct closure evidence must use an isolated storage deployment with an explicitly documented key-management configuration, object-lock-enabled bucket, versioning, and ClamAV service. A static development key may validate a test harness but cannot close the production-encryption requirement.

## Required Runtime Evidence

| Control | Required evidence | Current status |
|---|---|---|
| Versioning | Isolated bucket upload returns a non-empty version ID and bucket versioning reports `Enabled` | Open |
| Object lock | Bucket was created with object lock; future retention and legal-hold calls succeed; deletion is rejected while protected | Open |
| Encryption | Upload response and object metadata show the configured server-side encryption mode, with KMS/key-manager boundary recorded | Open; local Compose is insufficient |
| Integrity | Stored `sha256` and `sizeBytes` equal the uploaded bytes | Repository-tested; runtime adapter evidence open |
| Malware scanning | Clean ClamAV scan completes before storage; unavailable ClamAV fails closed when scanning is enabled | Open |
| Cleanup | Verification objects and isolated bucket/container are removed without touching the primary development bucket or unrelated projects | Open |

## Terminal Boundary for the Windows Run

Before changing environment variables, migrations, or isolated verification resources, stop the Mohamy API and worker terminals with **Ctrl+C**. Keep PostgreSQL, Redis, MinIO, and any isolated ClamAV/KMS verification containers running. Do not stop, remove, recreate, or delete volumes for Health-ERP or Vision-ERP.

The API and worker may be restarted only after the storage verification environment and database migration state are unchanged. The verification must use a uniquely named isolated bucket and uniquely identified test objects; it must not reuse or mutate the primary development bucket.

## Decision

Until these provider-level results are captured, the Phase 1 status remains **partially verified** for storage security. No workaround, static development key, or unit-test-only result will be promoted to production-readiness evidence.

## References

1. [MinIO Server-Side Encryption of Objects](https://minio.community/community/minio-object-store/administration/server-side-encryption.html)
2. [MinIO AIStor: Enable Server-Side Encryption](https://docs.min.io/aistor/installation/kubernetes/server-side-encryption/)
