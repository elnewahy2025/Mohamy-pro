# Windows Storage Security Verification

**Verification date:** 2026-08-21

**Repository revision under test:** `9c7333b5` (storage startup-state evidence logging) with storage implementation from `2d58c310`.

## Migration Evidence

The Windows database at `localhost:55432`, database `mohamy_pro`, applied the new repository migration successfully:

```text
20260821160000_storage_security_metadata | 2026-08-21 15:28:00.927272+00 |
```

The query returned six migration-history rows, including the accepted legacy `20260820144702_init` row and the three prior repository migrations. The new storage migration has a non-null `finished_at` and no `rolled_back_at`.

## Storage Metadata Schema Evidence

The Windows query against `information_schema.columns` returned the 14 expected `StorageObject` columns:

| Column | PostgreSQL type |
|---|---|
| `id` | `text` |
| `key` | `text` |
| `versionId` | `text` |
| `sha256` | `character varying` |
| `sizeBytes` | `bigint` |
| `contentType` | `text` |
| `encryptionMode` | `text` |
| `malwareStatus` | `text` |
| `malwareScannedAt` | `timestamp without time zone` |
| `retentionUntil` | `timestamp without time zone` |
| `legalHold` | `boolean` |
| `metadata` | `jsonb` |
| `createdAt` | `timestamp without time zone` |
| `deletedAt` | `timestamp without time zone` |

## Status

The new storage migration and metadata schema are **PASS** on Windows. This evidence does not yet prove a real object upload, SHA-256 metadata row, MinIO version ID, S3 server-side encryption response, object-lock retention/legal-hold response, or ClamAV clean/infected/unavailable behavior. Those remain isolated storage-runtime gates. No migration metadata was edited manually and no unrelated container was touched.

## Isolated Storage Runtime Evidence

**Runtime revision:** `52161fed` storage runner with ClamAV response normalization from `63b85105`.

The isolated Windows security stack ran outside the primary Compose services with MinIO KMS, AIStor, and ClamAV on separate container names, network, ports, and persistent runtime data. The Mohamy API and worker were stopped while the verification runner created an application context against the real PostgreSQL, Redis, AIStor, KMS, and ClamAV services.

Clean-scan verification returned:

```text
clean_upload_status=PASS
versioning_status=PASS|versions=44f583ea-b7e6-43c6-8707-43eb5d8fb7a8,a1e8baad-b1b8-4f2a-9bf0-b8a6d146c068
sha256_status=PASS|sha256=ee88a4d3a830ed35b2af3abfb7678591abe562a7cb03c7db9fe566a357681440|size=70
encryption_status=PASS|server_side_encryption=aws:kms
object_lock_status=PASS|legal_hold_delete_rejected=true
storage_security_result=PASS|mode=clean
node_exit=0
```

Fail-closed verification used an unavailable ClamAV port without stopping the real ClamAV container and returned:

```text
clamav_fail_closed_status=PASS|metadata_records=0|object_written=false
storage_security_result=PASS|mode=fail-closed
node_exit=0
```

These results prove the Windows-Docker application-control and isolated runtime behavior: distinct object versions, SHA-256 and byte-count metadata, server-side `aws:kms` encryption observed through S3 `HeadObject`, Object Lock/legal-hold deletion enforcement, successful clean scanning, and fail-closed behavior with no metadata or object written on scanner unavailability.

The Windows-Docker-only deployment boundary remains governing: this is isolated workstation runtime evidence, not an unqualified production deployment claim for a workstation-only key-management plane.
