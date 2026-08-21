# Phase 1 Storage Security Baseline

**Governing requirements:** [`docs/phase0/STACK.md`](../phase0/STACK.md) and [`docs/phase0/THREAT_MODEL.md`](../phase0/THREAT_MODEL.md).

## Implemented Controls

| Control | Implementation | Verification status |
|---|---|---|
| SHA-256 integrity | `S3ObjectStorageService` hashes buffer and streaming bodies before recording `StorageObject.sha256`; byte count is recorded as `sizeBytes`. | Repository unit test passed for buffer and stream bodies. Real object upload verification remains pending because the foundation has no document upload endpoint. |
| Versioning | `S3_VERSIONING_ENABLED` is validated and the adapter enables S3 bucket versioning at startup. | Configuration and startup code are connected; Windows MinIO startup after the new migration must be captured. |
| Encryption at rest | `S3_ENCRYPTION_MODE` supports `AES256` and `aws:kms`; the adapter sends the corresponding server-side encryption fields on every object write. Production rejects `NONE`. | Environment validation tests passed; production S3/KMS runtime evidence remains pending. |
| Retention and legal hold | `StorageObject.retentionUntil` and `legalHold` are persisted. Deletion is rejected while a legal hold is active or retention has not expired. S3 Object Lock is required for production when these controls are enabled. | Repository build/tests passed; object-lock behavior requires a real object-lock-enabled bucket and isolated Windows verification. |
| Malware scanning | `ClamAvMalwareScanner` uses ClamAV `INSTREAM`; when enabled, a source path is required and the scan completes before the permanent S3 write. Infected or unavailable scans fail closed. | Code is connected and build/lint verified; real ClamAV clean/infected/unavailable cases are not yet executed. |
| Metadata persistence | Migration `20260821160000_storage_security_metadata` creates the `StorageObject` table and bounded indexes for malware state and retention/legal hold. | Prisma schema validation/client generation passed; Windows migration deployment and the 14-column `StorageObject` schema query passed. See [`STORAGE_WINDOWS_VERIFICATION.md`](STORAGE_WINDOWS_VERIFICATION.md). |

## Production Configuration

Production must set `S3_VERSIONING_ENABLED=true`, `S3_OBJECT_LOCK_ENABLED=true`, `S3_ENCRYPTION_MODE=AES256` or `aws:kms`, and `MALWARE_SCAN_ENABLED=true`. When using `aws:kms`, `S3_KMS_KEY_ID` is required. When malware scanning is enabled, `CLAMAV_HOST` is required and the ClamAV daemon must be reachable from the API process. The adapter does not silently upgrade an existing bucket to object lock; the bucket must be provisioned correctly before deployment.

Local development intentionally uses `S3_VERSIONING_ENABLED=true`, `S3_OBJECT_LOCK_ENABLED=false`, `S3_ENCRYPTION_MODE=NONE`, and `MALWARE_SCAN_ENABLED=false` because the existing development MinIO bucket was not created with object lock and no ClamAV service is included in the current local Compose file. These defaults are not production settings.

## Security Boundary

Storage remains behind the `OBJECT_STORAGE` abstraction. The storage adapter never exposes public URLs; it returns signed download URLs only after storage metadata exists and, when scanning is enabled, the object is in the `CLEAN` state. The metadata table is not an audit table and does not replace later download/share audit requirements.

## Verification Boundary

The current repository evidence proves Prisma schema validity, API build, ESLint, 7 unit suites, and 19 tests. Windows migration/schema evidence is now recorded, but it does not yet prove a real object upload, version ID returned by MinIO, object-lock retention response, server-side encryption response, or ClamAV scan response. Those tests must use an isolated storage bucket and must not touch unrelated Health-ERP/Vision-ERP resources or the user’s primary production database.
