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
