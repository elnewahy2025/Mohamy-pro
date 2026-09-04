# Goal: Implement Phase 16 (Document Security) Backend

Based on the handover protocol, `INITIAL STATE ASSESSMENT`, and `./docs/phase16/backend_requirements.md`, this plan details the implementation of Phase 16. It ensures all new code and schema changes act as a security wrapper over the existing Phase 15 tables (`Document`, `DocumentVersion`, `DocumentShare`, `DocumentAccess`), enforcing tenant isolation, validation, scanning, and signed access.

## User Review Required
> [!IMPORTANT]
> The implementation will use the following specific free stack requested:
> 1. **Object Storage**: MinIO (via S3-compatible adapter)
> 2. **Malware Scanning**: ClamAV
> 3. **KMS**: HashiCorp Vault Community (using Vault Transit for crypto)
> 4. **Queue**: Redis + BullMQ
> 5. **Hashing**: SHA-256
> 
> These technologies will be implemented behind clean adapter interfaces (e.g. `MalwareScanner`, `KmsProvider`) to preserve the domain architecture.

## 1. Prisma Schema Changes (`backend/api/prisma/schema.prisma`)

We will add the following entities, strictly preserving existing Phase 15 tables and enforcing `tenantId` boundaries:

### [NEW] Enums
- `DocumentSecurityStatus`: `PENDING`, `VALIDATING`, `SCANNING`, `APPROVED`, `QUARANTINED`, `REJECTED`, `EXPIRED`, `REVOKED`
- `DocumentScanStatus`: `PENDING`, `RUNNING`, `CLEAN`, `INFECTED`, `FAILED`
- `DocumentAccessPurpose`: `DOWNLOAD`, `PREVIEW`, `SHARE`
- `DocumentDownloadResult`: `SUCCESS`, `DENIED`, `EXPIRED`, `REVOKED`, `QUARANTINED`, `NOT_FOUND`

### [NEW] Models
- `DocumentSecurityMetadata`: One-to-one with `DocumentVersion`. Stores `securityStatus`, `mimeTypeDetected`, `fileSizeBytes`, `sha256`, `encryptionStatus`, `keyReference`.
- `DocumentScan`: Tracks individual scan jobs against a `DocumentVersion`.
- `SignedAccessGrant`: Tracks issued access tokens, their TTL (`expiresAt`), and revocation status (`revokedAt`).
- `DocumentDownload`: Replaces/Extends `DocumentAccess` with detailed logging (`accessGrantId`, `result`, `ip`, `userAgent`).

*(Note: We will apply `@@index([tenantId])` and `FORCE ROW LEVEL SECURITY` to all these new tables exactly as was done for Phase 10-15.)*

## 2. Document Security Service Layer (`backend/api/src/documents/security/`)

We will introduce a `security` subdirectory within the `documents` module.

### Interfaces
- `malware-scanner.interface.ts`: `scan(input) => Promise<ScanResult>`
- `kms-provider.interface.ts`: `generateDataKey()`, `decryptDataKey()`
- `file-validator.interface.ts`: `validateType()`, `validateSize()`

### Services and Adapters
- `ClamAvScanner`: Implements `MalwareScanner` interface via ClamAV.
- `VaultKmsProvider`: Implements `KmsProvider` interface via HashiCorp Vault Transit engine.
- `BullMqSecurityQueue`: BullMQ implementation for background scanning and validation tasks.
- `DocumentSecurityService`: Orchestrates the state machine (`PENDING` -> `VALIDATING` -> `SCANNING` -> `APPROVED` / `QUARANTINED`).
- `SignedAccessService`: Generates and validates `SignedAccessGrant`s. Checks if the document is `APPROVED` before issuing a grant.
- `SecurityAuditService`: Logs `DocumentDownload` and audit events for shares and revocations.

## 3. Endpoints (`document.controller.ts` & `document-security.controller.ts`)

Instead of exposing validation to the public, the upload process will trigger it internally. We will add endpoints for signed access and downloads.

- `GET /v1/documents/:id/security` (Check status)
- `POST /v1/documents/:id/access` (Request signed URL/grant)
- `GET /v1/documents/:id/download/:grantId` (Execute download using the grant)
- `POST /v1/documents/:id/access/:grantId/revoke` (Revoke a grant)

## 4. Security Invariants (INV-01 to INV-12)

- **INV-01 / INV-02**: `SignedAccessService` will reject requests if `DocumentSecurityMetadata.status !== APPROVED`.
- **INV-03**: All queries will use `operations.ts` tenant-scoped execution.
- **INV-04 / INV-05**: Access requires a valid `SignedAccessGrant` which is authorized at issuance.
- **INV-06 / INV-07**: `SignedAccessService` will check `expiresAt` and `revokedAt`.

## 5. Verification Plan

- `npx prisma format` and `npx prisma migrate dev` (or `deploy` equivalent using the exact script logic established in previous phases).
- Ensure Prettier is clean on all touched TS files (`./node_modules/.bin/prettier --check`).
- Compilation (`nest build`) passes.
