Based strictly on the uploaded **Plan.txt**, Phase 16 is **Document Security**. The source gives the functional scope and closure criteria, but it does **not** define the concrete database schema, endpoint contracts, cryptographic algorithms, KMS API, malware-scanner interface, or exact authorization matrix. Those therefore need to be designed before implementation rather than assumed. 

## Phase 16 — Backend requirements

### 1. Core objective

Build a **secure document pipeline from upload through download**, with controlled access and a complete audit trail for downloads and sharing. 

Phase 16 must sit on top of Phase 15's Document Management model:

```text
Upload
  ↓
Validation
  ↓
Content inspection
  ↓
Malware scanning
  ↓
Encryption / secure storage
  ↓
Document becomes available
  ↓
Authorized access request
  ↓
Signed URL / controlled download
  ↓
Download logging
  ↓
Expiration / revocation
```

The phase must **not** introduce a second document-management domain. It should secure the existing `Document`, `DocumentVersion`, `StorageObject`, `DocumentAccess`, and `DocumentShare` concepts from Phase 15. Phase 15 explicitly establishes those entities and upload/download/version/share/access capabilities. 

---

# 2. Required backend capabilities

The Phase 16 scope explicitly requires:

| Capability            | Required |
| --------------------- | -------: |
| Upload validation     |        ✅ |
| File-type validation  |        ✅ |
| File-size validation  |        ✅ |
| Content validation    |        ✅ |
| Malware scanning      |        ✅ |
| Encryption in transit |        ✅ |
| Encryption at rest    |        ✅ |
| Key management        |        ✅ |
| Key rotation          |        ✅ |
| File hashing          |        ✅ |
| Signed URL generation |        ✅ |
| Signed URL TTL        |        ✅ |
| Signed URL revocation |        ✅ |
| Download logging      |        ✅ |
| Sharing audit         |        ✅ |
| Expiration            |        ✅ |

These are the explicit Phase 16 requirements in the source. 

---

# 3. Recommended domain boundaries

I would structure the backend around these concepts:

```text
Document
DocumentVersion
StorageObject
DocumentSecurityMetadata
DocumentScan
DocumentAccessGrant
DocumentDownload
DocumentShare
DocumentSecurityEvent
EncryptionKeyReference
SignedAccessGrant
```

However, **only the first four/five are directly justified by the Phase 15/16 specification**. The remaining names are implementation-design proposals, not source-defined requirements.

A clean architecture would be:

```text
DocumentSecurityModule
│
├── UploadSecurityService
├── FileValidationService
├── ContentValidationService
├── MalwareScanService
├── FileHashService
├── EncryptionService
├── KeyManagementService
├── SignedAccessService
├── DownloadSecurityService
├── DocumentExpirationService
└── DocumentSecurityAuditService
```

External scanners, KMS providers, and object storage should remain behind adapters because the overall platform specification requires external integrations to go through adapter/interfaces. 

---

# 4. Proposed database schema

The source does **not** provide exact Phase 16 schema definitions, so the following is a design specification to use for your implementation plan, not a claim that these columns are already mandated.

### `DocumentSecurityMetadata`

One security record per document version or storage object.

```text
id
tenantId
documentId
documentVersionId
storageObjectId

securityStatus
    PENDING
    VALIDATING
    SCANNING
    APPROVED
    QUARANTINED
    REJECTED
    EXPIRED
    REVOKED

mimeTypeDetected
fileExtensionDetected
fileSizeBytes

sha256
contentHashAlgorithm

encryptionStatus
encryptionAlgorithm
keyReference

createdAt
updatedAt
```

Important:

```text
UNIQUE(documentVersionId)
UNIQUE(storageObjectId)
INDEX(tenantId, securityStatus)
INDEX(tenantId, sha256)
```

The hash is specifically required by Phase 16. 

---

# 5. Malware scanning model

I recommend treating scanning as an explicit state machine:

```text
PENDING
   ↓
SCANNING
   ├── CLEAN → APPROVED
   ├── INFECTED → QUARANTINED
   └── ERROR → SCAN_FAILED
```

Potential entity:

### `DocumentScan`

```text
id
tenantId
documentId
documentVersionId

scannerProvider
scannerVersion

status
    PENDING
    RUNNING
    CLEAN
    INFECTED
    FAILED

startedAt
completedAt

signatureVersion
threatName
resultMetadata

createdAt
```

The actual scanner should **not** be hard-coded into the domain.

```ts
interface MalwareScanner {
  scan(input: ScanInput): Promise<ScanResult>;
}
```

For example:

```text
DocumentSecurity
       ↓
MalwareScanner interface
       ↓
ClamAV / commercial scanner / future provider
```

This follows the platform's explicit rule that external integrations pass through adapters/interfaces. 

---

# 6. Encryption requirements

Phase 16 explicitly requires:

* encryption in transit
* encryption at rest
* key management
* key rotation. 

Therefore the implementation plan should separate:

```text
Transport encryption
        +
Storage encryption
        +
Key management
```

Do **not** put encryption keys directly into `Document`.

Instead:

```text
DocumentVersion
      │
      └── StorageObject
              │
              └── keyReference
                       │
                       ▼
                     KMS
```

The database should contain a **non-secret key reference**, not raw encryption keys.

Suggested fields:

```text
encryptionAlgorithm
keyReference
keyVersion
encryptedDataKey   // only if envelope encryption is selected
encryptionContext
```

The exact KMS technology is **not specified in Plan.txt**, so this should be an explicit architecture decision/ADR before implementation.

---

# 7. Hashing

Every uploaded document version should receive a cryptographic content hash.

Recommended conceptual contract:

```ts
interface FileHashService {
  calculate(stream): Promise<{
    algorithm: "SHA-256";
    digest: string;
  }>;
}
```

The hash should be calculated from the actual file content rather than trusting:

```text
filename
extension
client-provided MIME type
client-provided hash
```

The client's claimed metadata can be input, but the backend must independently validate it.

---

# 8. Upload validation

The upload pipeline should validate at least:

### A. File size

```text
configured maximum
tenant-specific maximum where applicable
document-type maximum where applicable
```

### B. Declared MIME type

Never trust:

```http
Content-Type: application/pdf
```

by itself.

### C. Detected file type

Inspect the actual file signature/content.

### D. Extension

Treat extension as metadata, not proof of file type.

### E. Content validation

The source explicitly distinguishes:

```text
File type validation
Size validation
Content validation
```

so they should be separate security checks rather than one generic validator. 

---

# 9. Secure upload state machine

I strongly recommend defining this before writing the implementation:

```text
UPLOAD_REQUESTED
       ↓
UPLOADING
       ↓
UPLOADED
       ↓
VALIDATING
       ↓
SCANNING
       ↓
 ┌───────────────┐
 │               │
CLEAN          INFECTED
 │               │
 ↓               ↓
APPROVED      QUARANTINED
 │
 ↓
AVAILABLE
```

Failures should be terminal or retryable according to the failure class:

```text
VALIDATION_FAILED → REJECTED
MALWARE_DETECTED  → QUARANTINED
SCANNER_ERROR     → RETRY / SCAN_FAILED
STORAGE_ERROR     → RETRY
```

**Never make an unscanned document downloadable merely because upload succeeded.**

That specific state-machine behavior is an implementation recommendation derived from the security objective; the source itself only requires the secure pipeline and malware scanning.

---

# 10. Signed URL design

Phase 16 explicitly requires:

* signed URL generation
* TTL
* revocation. 

The backend should therefore expose a controlled access mechanism rather than exposing storage directly.

Conceptually:

```http
POST /api/v1/documents/:documentId/access
```

Backend:

```text
Authenticate
    ↓
Resolve tenant from membership
    ↓
Authorize document access
    ↓
Check security status
    ↓
Check expiration
    ↓
Check revocation
    ↓
Generate short-lived signed access
    ↓
Audit
```

The signed URL itself should **not become the authorization source**.

Authorization happens **before issuance**.

---

# 11. Signed-access persistence

Because revocation is explicitly required, I would not rely solely on stateless URLs.

Suggested:

### `SignedAccessGrant`

```text
id
tenantId

documentId
documentVersionId
storageObjectId

issuedToUserId

purpose
DOWNLOAD
PREVIEW
SHARE

issuedAt
expiresAt
revokedAt

accessTokenId
```

Indexes:

```text
INDEX(tenantId, documentId)
INDEX(tenantId, expiresAt)
INDEX(accessTokenId)
```

This gives the backend a mechanism to invalidate an issued access grant.

Again, this exact entity is a proposed implementation design—the source requires the behavior, not this schema.

---

# 12. Download auditing

Every successful and security-relevant download attempt should generate an auditable event.

The source explicitly requires **download logging** and an audit trail for downloads/sharing. 

At minimum:

```text
DocumentDownload

id
tenantId

documentId
documentVersionId
storageObjectId

userId
membershipId
sessionId
accessGrantId

requestedAt
completedAt

result
    SUCCESS
    DENIED
    EXPIRED
    REVOKED
    QUARANTINED
    NOT_FOUND

ip
userAgent
correlationId
```

Be careful with `NOT_FOUND`: externally, unauthorized resources should not reveal whether the document exists.

---

# 13. Sharing audit

Phase 15 already introduces `DocumentShare`; Phase 16 must secure its behavior.

At minimum audit:

```text
SHARE_CREATED
SHARE_ACCESSED
SHARE_REVOKED
SHARE_EXPIRED
SHARE_DENIED
```

And record:

```text
tenantId
documentId
documentVersionId
actorUserId
target
action
timestamp
correlationId
reason / metadata
```

Sensitive document operations fall under the platform-wide audit requirement. 

---

# 14. Expiration

Expiration needs to exist at multiple levels:

```text
Document expiration
      +
Share expiration
      +
Signed-access expiration
```

These should not be conflated.

For example:

```text
Document = ACTIVE
Share = EXPIRED
Signed URL = EXPIRED
```

The document can remain valid while an individual share/access grant has expired.

---

# 15. Authorization model

Phase 16 inherits the global authorization model:

```text
RBAC
+
ABAC
+
resource-level authorization
+
explicit denials
```

This is explicitly established in the platform design. 

Therefore:

```text
CanReadDocument
CanDownloadDocument
CanPreviewDocument
CanShareDocument
CanRevokeDocumentShare
CanManageDocumentSecurity
```

would be sensible permission candidates, **but these exact permission names are not specified in Plan.txt** and should be confirmed against the project's existing Phase 2/3 authorization implementation.

Most importantly:

```text
tenantId supplied by browser
        ≠
trusted tenant context
```

Tenant context must come from authenticated membership, and authorization must remain server-side. 

---

# 16. RLS / tenant isolation

Phase 16 must inherit the platform's database isolation requirements.

The general specification requires:

* PostgreSQL
* foreign keys
* unique constraints
* check constraints
* indexes
* migrations
* server-side tenant isolation. 

For Phase 16, every tenant-owned security table should therefore have:

```text
tenantId
```

and tenant isolation must be enforced at the backend/database boundary where applicable.

This is especially important because a document security bug could otherwise become a **cross-tenant document disclosure**.

---

# 17. API surface to plan

The exact API isn't specified in the source, so these should be treated as proposed endpoints:

```text
POST   /api/v1/documents/:id/security/validate
GET    /api/v1/documents/:id/security
POST   /api/v1/documents/:id/access
POST   /api/v1/documents/:id/download
POST   /api/v1/documents/:id/shares
DELETE /api/v1/documents/:id/shares/:shareId
POST   /api/v1/documents/:id/access/:grantId/revoke
```

However, I'd strongly consider **not exposing a public "security validate" endpoint** to ordinary users. Validation/scanning should generally be an internal workflow.

A better public surface may be:

```text
Upload → existing Phase 15 upload endpoint
       ↓
Security pipeline internally
       ↓
GET document security status
       ↓
Authorized download/access endpoint
```

---

# 18. Queue requirements

Because malware scanning and potentially content validation can be expensive, the implementation should integrate with the Phase 1 queue foundation.

The platform explicitly establishes queue standards, transactional outbox, idempotency, and background processing as foundational concerns. 

Suggested jobs:

```text
document.security.validate
document.security.scan
document.security.finalize
document.security.expire
document.security.cleanup
```

Every job should be:

```text
idempotent
tenant-aware
traceable
retry-safe
audited where security-sensitive
```

---

# 19. Idempotency and concurrency

Phase 16 should inherit the global concurrency requirements:

```text
transactions
unique constraints
idempotency keys
queue deduplication
optimistic locking where needed
```

These are explicitly listed as cross-phase requirements. 

Important cases:

```text
same upload retried
same malware scan job retried
same download request retried
same share request retried
same revoke request retried
```

A retry must not create duplicate security records or inconsistent document states.

---

# 20. Observability

Phase 16 should emit:

### Logs

```text
document_upload_security_started
document_validation_failed
document_scan_started
document_scan_clean
document_scan_infected
document_quarantined
document_access_denied
document_signed_access_created
document_signed_access_revoked
document_download_success
document_download_denied
document_share_created
document_share_revoked
document_access_expired
```

The platform requires logs, metrics, traces and correlation IDs throughout the system. 

Do **not** log:

```text
document contents
encryption keys
raw access tokens
signed URLs
passwords/secrets
```

---

# 21. Security invariants

I would make these explicit acceptance invariants in the Phase 16 plan:

### INV-01

A document cannot become downloadable before required security validation completes.

### INV-02

A malware-positive document cannot become normally accessible.

### INV-03

A user cannot access another tenant's document.

### INV-04

A user cannot bypass document-level authorization by possessing a document ID.

### INV-05

A signed URL cannot bypass authorization at issuance.

### INV-06

Expired signed access cannot be used.

### INV-07

Revoked signed access cannot be used.

### INV-08

Historical document versions cannot silently be overwritten.

Phase 15 explicitly requires that historical versions not be silently overwritten. 

### INV-09

Every successful download is traceable.

### INV-10

Every sharing operation is auditable.

### INV-11

Encryption keys are never stored as ordinary plaintext document metadata.

### INV-12

A storage-provider URL is never treated as a public legal-document URL.

This follows the global prohibition on public URLs for legal documents. 

---

# 22. Required tests

The general phase-completion standard requires appropriate unit, integration and E2E testing, plus security coverage for critical phases. 

For Phase 16, I'd make the following mandatory:

### Upload

```text
valid PDF → accepted
invalid MIME → rejected
fake extension → rejected
oversized file → rejected
corrupted file → rejected
malware → quarantined
```

### Tenant isolation

```text
Tenant A document → Tenant A user = allowed
Tenant A document → Tenant B user = denied
```

### Authorization

```text
authorized user → download = allowed
unauthorized user → download = denied
authorized preview → allowed
unauthorized share → denied
```

### Signed access

```text
valid grant → works
expired grant → denied
revoked grant → denied
wrong document → denied
wrong tenant → denied
```

### Versioning

```text
v1 remains immutable
v2 creates separate storage/version metadata
```

### Audit

```text
download → audit event
share → audit event
revoke → audit event
denial → security event
```

### Cryptography

```text
hash reproducible
encrypted object cannot be treated as plaintext
key reference exists
key rotation doesn't invalidate required historical access
```

### Failure/retry

```text
scanner timeout → retry
duplicate scan job → idempotent
duplicate upload request → idempotent
storage failure → recoverable
```

---

# 23. Phase 16 closure gate

The source gives two explicit closure requirements:

> secure document pipeline

and

> controlled access mechanism + auditable downloads/sharing

with the final condition:

> no legal document is stored or served in an uncontrolled manner, and every download/share is traceable. 

I'd turn that into this implementation gate:

```text
PHASE 16 = CLOSED ONLY IF

[ ] Upload validation implemented
[ ] File-type validation implemented
[ ] Size validation implemented
[ ] Content validation implemented
[ ] Malware scanning implemented
[ ] Encryption in transit verified
[ ] Encryption at rest verified
[ ] Key management implemented
[ ] Key rotation strategy implemented/tested
[ ] Cryptographic hash implemented
[ ] Signed access implemented
[ ] TTL enforced
[ ] Revocation enforced
[ ] Download audit implemented
[ ] Sharing audit implemented
[ ] Expiration implemented
[ ] Tenant isolation verified
[ ] Resource authorization verified
[ ] Queue/retry/idempotency verified
[ ] Unit tests pass
[ ] Integration tests pass
[ ] E2E/security tests pass
[ ] OpenAPI updated
[ ] Migration applied
[ ] Logs/metrics/tracing implemented
[ ] Documentation updated
[ ] Rollback/mitigation plan documented
[ ] No public legal-document URLs
[ ] No uncontrolled document access
```

The last two are particularly important because they directly reflect the platform's global security rules and Phase 16 closure criteria. 

## What the Plan.txt does **not** specify

Before you draft the actual implementation plan, I would explicitly mark these as **architecture decisions still required**, rather than allowing an AI coding agent to invent them:

1. Exact Prisma/database models and column types.
2. Exact document security state enum.
3. Exact malware scanner/provider.
4. Exact KMS implementation.
5. Encryption algorithm and envelope-encryption design.
6. Key hierarchy and rotation procedure.
7. Exact signed-URL mechanism.
8. Signed URL maximum TTL.
9. Revocation mechanism.
10. Exact authorization permission names.
11. Exact API endpoints.
12. Whether scanning is synchronous or queue-based.
13. Quarantine storage architecture.
14. Document retention/expiration semantics before Phase 30.
15. Exact audit-event schema.
16. Exact RLS policies for the Phase 16 tables.

Those are **not defined in the supplied source**, so they should be resolved against the existing Phase 15 implementation and the project's Phase 2/3 security/authorization architecture before implementation.

One particularly important point given your project's existing backend work: **Phase 16 should be designed as a security layer around the Phase 15 document model, not as a new document system.** That distinction will prevent schema duplication and, more importantly, prevent authorization/RLS rules from diverging between ordinary document operations and security operations.
