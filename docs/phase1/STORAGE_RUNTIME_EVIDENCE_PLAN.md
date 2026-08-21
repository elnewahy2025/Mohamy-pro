# Phase 1 Storage Runtime Evidence Plan

**Status:** Windows isolated runtime gate closed with explicit deployment-boundary scope; no unqualified production-encryption claim made

## Evidence Boundary

The application storage adapter is implemented with SHA-256 integrity metadata, versioning configuration, server-side-encryption request configuration, retention/legal-hold checks, and a ClamAV fail-closed boundary. Repository tests and Windows migration/schema evidence do not, by themselves, prove that a MinIO deployment has enforced versioning, object lock, encryption at rest, or malware scanning.

The official MinIO documentation states that SSE-S3 and SSE-KMS depend on an external key-management system, and that the static-key configuration is intended for testing or evaluation rather than production [1] [2]. The current local Compose MinIO service has no configured KMS/KES boundary. Therefore, a local bucket upload against that service must not be recorded as production-grade encryption evidence.

> The correct closure evidence must use an isolated storage deployment with an explicitly documented key-management configuration, object-lock-enabled bucket, versioning, and ClamAV service. A static development key may validate a test harness but cannot close the production-encryption requirement.

## Required Runtime Evidence

| Control | Required evidence | Current status |
|---|---|---|
| Versioning | Isolated bucket upload returns non-empty version IDs and bucket versioning reports enabled | PASS; recorded in `STORAGE_WINDOWS_VERIFICATION.md` |
| Object lock | Bucket was created with object lock; future retention and legal-hold calls succeed; deletion is rejected while protected | PASS; legal-hold deletion rejection recorded |
| Encryption | Upload response and object metadata show the configured server-side encryption mode, with KMS/key-manager boundary recorded | PASS in isolated AIStor/KMS runtime; local Compose remains insufficient |
| Integrity | Stored `sha256` and `sizeBytes` equal the uploaded bytes | PASS; runtime SHA-256 and size evidence recorded |
| Malware scanning | Clean ClamAV scan completes before storage; unavailable ClamAV fails closed when scanning is enabled | PASS; clean and fail-closed results recorded |
| Cleanup | Verification objects and isolated bucket/container are removed without touching the primary development bucket or unrelated projects | PASS; runner cleanup returned exit code 0 and unrelated containers were preserved |

## Terminal Boundary for the Windows Run

Before changing environment variables, migrations, or isolated verification resources, stop the Mohamy API and worker terminals with **Ctrl+C**. Keep PostgreSQL, Redis, MinIO, and any isolated ClamAV/KMS verification containers running. Do not stop, remove, recreate, or delete volumes for Health-ERP or Vision-ERP.

The API and worker may be restarted only after the storage verification environment and database migration state are unchanged. The verification must use a uniquely named isolated bucket and uniquely identified test objects; it must not reuse or mutate the primary development bucket.

## Decision

The provider-level Windows results are captured in [`STORAGE_WINDOWS_VERIFICATION.md`](STORAGE_WINDOWS_VERIFICATION.md). Storage security is **verified for the isolated Windows runtime with explicit deployment scope**. The workstation-only single-host object-storage/key-management plane is not promoted to an unqualified production deployment claim, and no static development key or unit-test-only result is used as production evidence.

## References

1. [MinIO Server-Side Encryption of Objects](https://minio.community/community/minio-object-store/administration/server-side-encryption.html)
2. [MinIO AIStor: Enable Server-Side Encryption](https://docs.min.io/aistor/installation/kubernetes/server-side-encryption/)
