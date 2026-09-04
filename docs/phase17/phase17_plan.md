from pathlib import Path

content = """# Phase 17 — OCR Pipeline Implementation Plan

## 1. Phase Objective

Implement a queue-backed OCR and document-intelligence pipeline that extracts text and entities from legal documents while keeping machine-generated OCR output strictly separate from human-approved legal metadata.

The implementation must follow the authoritative Phase 17 requirements in `Plan.txt`:

- OCR
- Text extraction
- Classification
- Entity extraction
- Human review
- Approved metadata
- Queue-backed processing
- Clear separation between OCR output and human-approved data
- OCR must not be treated as final truth without human review where required

The global project rules also require tenant isolation and backend authorization, production schema changes through migrations, automated tests for commercially critical functionality, auditability for tenant/security/legal-record paths, and external integrations only through adapters/interfaces. 

## 2. Approved Free / Self-Hosted Technology Stack

### Primary OCR

**PaddleOCR**

Use PaddleOCR as the primary OCR engine.

Reasons:
- Free and open source
- Self-hostable
- Strong support for Arabic and English documents
- Suitable for scanned PDFs and document images
- Supports text detection and recognition
- Can be isolated behind an application-level OCR provider interface

Required architectural boundary:

```text
OcrProvider
    |
    +-- PaddleOcrAdapter

The domain/application layer must depend on OcrProvider, not directly on PaddleOCR.

PDF Text Extraction and Rendering

PyMuPDF (fitz)

Use PyMuPDF for:

Detecting whether a PDF contains usable native text
Extracting native PDF text where available
Rendering PDF pages to images when OCR is required
Reading PDF page metadata required by the pipeline

Recommended routing:

PDF
 |
 +-- usable native text --> PyMuPDF text extraction
 |
 +-- scanned / insufficient text --> PyMuPDF rendering --> OCR

Do not OCR every PDF blindly.

Image Preprocessing

OpenCV

Use OpenCV for deterministic preprocessing before OCR where needed:

grayscale conversion
denoising
thresholding
deskewing
resizing
orientation normalization
basic image cleanup

Preprocessing must be configurable and observable so that failed OCR jobs can be diagnosed.

Entity Extraction

spaCy

Use spaCy initially for structured entity extraction after text extraction/OCR.

Keep entity extraction separate from OCR:

OCR/Text Extraction
        |
        v
Extracted Text
        |
        v
Entity Extraction
        |
        v
Machine-Generated Entities

Entities produced by spaCy are machine-generated candidates and must not automatically become authoritative legal metadata.

Queue / Background Processing

Use the existing:

Redis
BullMQ
Existing worker infrastructure

OCR must not execute synchronously inside the upload HTTP request.

The API should enqueue processing and return a durable processing identifier/status.

Storage

Use the existing:

MinIO / S3-compatible object storage abstraction for source documents and derived artifacts
PostgreSQL for authoritative metadata, processing state, OCR records, review state, and audit information

Do not expose legal documents through public object-storage URLs.

Hashing

Use SHA-256 for deterministic file/content fingerprints where required by the document-security pipeline.

Application Layer

Use the existing project stack:

NestJS
Prisma
PostgreSQL
Redis
BullMQ
MinIO
Existing authentication/authorization/RLS architecture
Existing frontend stack for human review
Language Support

The OCR pipeline must support:

Arabic
English
Mixed Arabic/English documents
RTL/LTR document content

Language/model selection must be represented as explicit processing configuration rather than hard-coded assumptions.

3. Target Architecture
                    Document
                       |
                       v
              OCR Processing Job
                  BullMQ Queue
                       |
                       v
              Document Processing
                    Router
                       |
          +------------+------------+
          |                         |
          v                         v
   Native PDF Text            Scanned/Image
      PyMuPDF                     |
          |                       v
          |                   PyMuPDF
          |                  page render
          |                       |
          |                       v
          |                    OpenCV
          |                 preprocessing
          |                       |
          |                       v
          |                  PaddleOCR
          |                       |
          +-----------+-----------+
                      |
                      v
               Extracted Text
                      |
                      v
              Classification
                      |
                      v
             Entity Extraction
                  spaCy
                      |
                      v
            Machine-Generated Data
                      |
                      v
                Human Review
                      |
             +--------+--------+
             |                 |
             v                 v
          Approved         Rejected /
          Metadata         Corrected
             |
             v
     Authoritative Application Data
4. Critical Data-Model Separation

Do not write OCR output directly into Document.metadata or other authoritative legal fields.

Use separate persistence models.

Recommended conceptual model:

Document
   |
   +-- OcrProcessing
   |      |
   |      +-- OcrText
   |      +-- OcrPage
   |      +-- OcrEntity
   |      +-- ClassificationResult
   |
   +-- HumanReview
   |      |
   |      +-- ReviewDecision
   |      +-- ReviewCorrection
   |
   +-- ApprovedDocumentMetadata
OcrProcessing

Track:

document ID
tenant ID
document version ID
processing status
processing attempt
provider
provider/model version
language configuration
started timestamp
completed timestamp
failure information using safe error codes
correlation/job ID
content hash where applicable

Suggested statuses:

QUEUED
PROCESSING
SUCCEEDED
FAILED
CANCELLED
OcrPage

Track:

processing ID
document page number
extraction method
extracted text
confidence summary where available
processing metadata

Extraction method should distinguish at minimum:

NATIVE_TEXT
OCR
OcrEntity

Track:

processing ID
page/document location
entity type
extracted value
normalized value where applicable
confidence
source text/span
machine-generated status

Example entity categories can include:

PERSON
ORGANIZATION
COURT
CASE_NUMBER
DATE
ADDRESS
PHONE
EMAIL
LEGAL_REFERENCE

The exact legal entity taxonomy should be finalized against existing domain terminology before migration.

ClassificationResult

Track:

processing ID
predicted document type/category
confidence
model/provider version
machine-generated status

Classification is a suggestion unless explicitly approved.

HumanReview

Track:

processing ID
reviewer
review status
reviewed timestamp
review notes
corrections
approval decision

Suggested states:

NOT_REQUIRED
PENDING
IN_REVIEW
APPROVED
REJECTED
CORRECTION_REQUIRED
ApprovedDocumentMetadata

Only approved data enters this authoritative layer.

Every approved value should be attributable to:

reviewer/user
approval timestamp
source processing/version
tenant
document/document version
5. Processing Lifecycle
Step 1 — Document Eligibility

Before enqueueing:

verify the document exists
verify tenant ownership/context
verify document version
verify access permissions
verify document security state from Phase 16
reject documents that are not eligible for processing
Step 2 — Create Processing Record

Create a durable OcrProcessing record before enqueueing.

Use an idempotency strategy so repeated requests cannot create uncontrolled duplicate processing.

Step 3 — Enqueue Job

Create a BullMQ job containing stable identifiers only.

Do not place:

document bytes
access tokens
cookies
signed URLs
secrets

inside the job payload.

Step 4 — Retrieve Document Through Storage Abstraction

The worker obtains the object through the existing storage abstraction.

The OCR domain must not directly depend on MinIO SDK calls.

Step 5 — Determine Extraction Route

For PDFs:

inspect the PDF
attempt native text extraction
evaluate whether extracted text is sufficient
use OCR only when necessary

For images/scanned pages:

normalize input
preprocess with OpenCV
execute PaddleOCR
Step 6 — Persist Machine Output

Persist OCR/text/classification/entity results separately.

Never overwrite historical OCR results.

A new document version or processing run must produce a new processing record.

Step 7 — Human Review

Determine whether human review is required based on:

confidence thresholds
document type
entity type
business/legal rules
processing errors
tenant policy where applicable

Do not use confidence alone as proof of legal correctness.

Step 8 — Approval

A properly authorized reviewer may:

approve extracted data
correct extracted data
reject extracted data
request reprocessing

Only approved values may populate authoritative application metadata.

Step 9 — Audit

Audit:

processing initiation
processing completion/failure
review assignment where applicable
review decisions
corrections
approval
rejection
reprocessing
access to sensitive derived data where required
6. API Plan

All endpoints remain under /api/v1.

Recommended API surface:

POST   /documents/:documentId/ocr
GET    /documents/:documentId/ocr
GET    /documents/:documentId/ocr/:processingId
GET    /documents/:documentId/ocr/:processingId/pages
GET    /documents/:documentId/ocr/:processingId/entities
GET    /documents/:documentId/ocr/:processingId/classification

POST   /documents/:documentId/ocr/:processingId/review
PATCH  /documents/:documentId/ocr/:processingId/review
POST   /documents/:documentId/ocr/:processingId/approve
POST   /documents/:documentId/ocr/:processingId/reject
POST   /documents/:documentId/ocr/:processingId/reprocess

The exact routes must be reconciled with existing document-management conventions before implementation.

All endpoints must enforce:

authenticated session
active tenant context
resource-level authorization
document access permissions
tenant isolation
backend authorization as final authority
audit requirements
7. Provider Interfaces

Create explicit ports/interfaces.

OCR
OcrProvider

Responsibilities:

OCR images/pages
return structured text blocks
return confidence information
expose provider/model metadata
Text Extraction
DocumentTextExtractor

Implementations:

PyMuPdfTextExtractor
Classification
DocumentClassifier
Entity Extraction
EntityExtractor

Implementation:

SpacyEntityExtractor
Storage

Reuse the existing storage abstraction from Phase 16.

Do not introduce direct MinIO dependencies into business/domain services.

8. Queue Design

Use separate BullMQ job types where useful:

ocr.document.process
ocr.document.reprocess
ocr.document.review-required

Job requirements:

deterministic job identity
bounded retries
exponential/backoff strategy
dead-letter handling
correlation ID
tenant ID
document ID
document version ID
processing ID

Worker behavior must be idempotent.

A retry must not create duplicate authoritative records.

9. Failure Handling

Classify failures safely.

Examples:

OCR_INPUT_INVALID
OCR_UNSUPPORTED_FORMAT
OCR_PROVIDER_UNAVAILABLE
OCR_PROCESSING_FAILED
OCR_TEXT_EXTRACTION_FAILED
OCR_ENTITY_EXTRACTION_FAILED
OCR_CLASSIFICATION_FAILED
OCR_STORAGE_READ_FAILED
OCR_STORAGE_WRITE_FAILED
OCR_REVIEW_REQUIRED

Do not expose:

raw provider stack traces
filesystem paths
secrets
credentials
signed URLs
internal database errors

to API clients.

Persist safe diagnostic information for operators.

10. Security Requirements
Tenant Isolation

Every persisted OCR record must be tenant-scoped.

Every query must enforce tenant context.

Cross-tenant access must be impossible through:

API
worker
repository
direct resource lookup

Where PostgreSQL RLS applies, OCR tables must have appropriate policies.

Authorization

Do not rely on frontend controls.

The backend must authorize:

starting OCR
viewing OCR output
viewing entities
viewing classification
reviewing
correcting
approving
rejecting
reprocessing
Legal Truth Boundary

Machine output is not authoritative legal truth.

The following must remain clearly labeled as machine-generated:

OCR text
OCR entities
classification
confidence
model predictions

Human-approved values must be represented separately.

Data Exposure

Do not expose OCR data to users who cannot access the underlying document.

Do not create public URLs for source documents or derived legal artifacts.

11. Database / Migration Plan

Add migrations for the Phase 17 persistence model.

Likely tables:

OcrProcessing
OcrPage
OcrEntity
DocumentClassificationResult
OcrHumanReview
OcrReviewCorrection
ApprovedDocumentMetadata

Exact names must follow the project's existing Prisma naming conventions.

Required:

tenant foreign keys
document/document-version foreign keys
indexes for tenant/document lookup
uniqueness constraints for idempotency
status checks/enums
timestamps
reviewer foreign keys
appropriate RLS policies
migration-only production schema changes

Never modify the database manually as the final implementation.

12. Idempotency and Concurrency

Protect against:

duplicate OCR requests
duplicate queue jobs
concurrent processing
repeated review submissions
repeated approvals
repeated reprocessing

Use:

database unique constraints
transactions
BullMQ job IDs/deduplication
optimistic/concurrency checks where appropriate

Redis is coordination infrastructure, not the source of truth.

PostgreSQL remains authoritative.

13. Observability

Every OCR job should emit structured logs containing safe fields such as:

event
tenantId
documentId
documentVersionId
processingId
jobId
correlationId
provider
operation
status
durationMs
errorCode

Metrics should include:

jobs queued
jobs completed
jobs failed
processing duration
OCR success rate
OCR retry count
review-required count
human approval rate
entity extraction failures
provider failures

Do not log document contents or sensitive extracted legal information by default.

14. Testing Strategy
Unit Tests

Test:

extraction routing
provider adapters
preprocessing decisions
classification mapping
entity normalization
confidence handling
status transitions
review transitions
authorization rules
idempotency logic
Integration Tests

Test:

PostgreSQL persistence
RLS
BullMQ job persistence/processing
MinIO/storage abstraction
OCR adapter integration
document-version isolation
End-to-End Tests

At minimum:

Upload/identify eligible document
Enqueue OCR
Worker processes document
OCR output is persisted
Classification is persisted
Entities are persisted
Review is required
Authorized reviewer sees results
Reviewer corrects an entity
Reviewer approves metadata
Approved metadata is persisted separately
Unauthorized user cannot view OCR output
Cross-tenant user cannot access OCR output
Duplicate OCR request is idempotent
Reprocessing creates a new processing record without destroying history
Failed processing is safely retryable
Arabic / English Test Corpus

Include representative test fixtures for:

Arabic-only document
English-only document
Arabic/English mixed document
scanned PDF
native-text PDF
image document
low-quality scan
rotated document
multi-page document
legal document with names, dates, case numbers, and court references

Test fixtures must contain synthetic/non-sensitive data.

15. Human Review UI

The review interface should display:

original document/page
extracted text
detected entities
confidence
classification
source page/location
machine-generated indicator
editable correction fields
approve/reject actions
review status
reviewer identity
review timestamp

The UI must support:

Arabic
English
RTL
LTR
accessibility
responsive layouts

Frontend must not be responsible for authorization decisions.

16. Documentation / ADRs

Create:

docs/phase17/PHASE17_OCR_IMPLEMENTATION_PLAN.md
docs/phase17/ADR-17-001-OCR-PADDLEOCR.md
docs/phase17/ADR-17-002-PDF-PYMUPDF.md
docs/phase17/ADR-17-003-ENTITY-EXTRACTION-SPACY.md
docs/phase17/ADR-17-004-OCR-HUMAN-REVIEW-BOUNDARY.md
docs/phase17/ADR-17-005-OCR-QUEUE-AND-IDEMPOTENCY.md

Document:

technology decisions
provider boundaries
data model
security model
review model
failure behavior
operational requirements
17. Implementation Order
Step 1 — Repository and Existing Architecture Audit

Inspect:

Phase 15 document model
Phase 16 document security/storage abstractions
existing BullMQ workers
Redis configuration
MinIO/storage adapter
tenant context
RLS policies
authorization guards/policies
audit infrastructure
frontend document views

Do not duplicate existing infrastructure.

Step 2 — Architecture Contracts

Implement interfaces:

OcrProvider
DocumentTextExtractor
DocumentClassifier
EntityExtractor
Step 3 — Database

Add Prisma models and migration for OCR/review persistence.

Apply RLS and authorization-safe repository patterns.

Step 4 — PDF/Text Pipeline

Implement PyMuPDF extraction and OCR routing.

Step 5 — OCR Adapter

Implement PaddleOCR adapter.

Step 6 — Image Preprocessing

Implement OpenCV preprocessing only where required.

Step 7 — Entity Extraction

Implement spaCy adapter.

Step 8 — Queue Worker

Implement BullMQ processing with:

retries
idempotency
safe failures
correlation IDs
Step 9 — Classification

Implement document classification abstraction and persistence.

Step 10 — Human Review

Implement review API, authorization, persistence, and UI.

Step 11 — Approved Metadata Boundary

Implement explicit promotion from machine-generated data to approved metadata.

Step 12 — Audit and Observability

Add logs, metrics, audit events, and operational diagnostics.

Step 13 — Automated Verification

Run:

unit tests
integration tests
RLS tests
authorization tests
queue tests
end-to-end OCR workflow
Arabic/English fixtures
Step 14 — Documentation

Complete Phase 17 documentation and update the master project status.

18. Phase 17 Completion Criteria

Phase 17 is complete only when all of the following are true:

OCR is implemented with PaddleOCR.
Native PDF text extraction uses PyMuPDF where appropriate.
Image preprocessing uses OpenCV where needed.
Entity extraction uses the spaCy adapter.
Processing is queue-backed through the existing BullMQ/Redis infrastructure.
OCR output is stored separately from human-approved metadata.
Historical OCR processing results are not silently overwritten.
Human review is implemented where required.
Only authorized users can access OCR results.
Tenant isolation is enforced server-side.
Cross-tenant OCR access is blocked.
Database migrations are complete.
RLS policies are verified where applicable.
Audit events are emitted for security/legal-record actions.
No public legal-document URLs are introduced.
Provider dependencies are isolated behind interfaces/adapters.
Arabic, English, and mixed-language test cases pass.
Failure/retry/idempotency behavior is verified.
API and worker observability is implemented.
Documentation is complete.
No critical automated test remains failing.
19. Explicit Non-Goals

Do not:

use an LLM as the OCR engine
treat OCR output as authoritative legal truth
write OCR output directly into canonical legal records
make frontend authorization decisions
expose documents through public URLs
couple domain services directly to PaddleOCR, MinIO, or spaCy
store secrets in queue payloads
use Redis as the authoritative persistence layer
silently overwrite historical OCR results
skip tenant/RLS verification
claim Phase 17 production readiness merely because OCR works on one document
20. Final Technology Decision

The Phase 17 implementation stack is therefore locked to:

Capability	Technology
OCR	PaddleOCR
PDF text extraction	PyMuPDF (fitz)
PDF rendering	PyMuPDF
Image preprocessing	OpenCV
Entity extraction	spaCy
Queue	BullMQ
Queue broker	Redis
Database	PostgreSQL
ORM	Prisma
Object storage	Existing MinIO/S3 abstraction
API/backend	Existing NestJS
Frontend review	Existing application UI
Hashing	SHA-256
Authorization	Existing backend authorization + tenant/RLS model

All provider integrations must remain replaceable through interfaces/adapters.

21. Source Alignment

The authoritative Plan.txt defines Phase 17 as the OCR Pipeline phase covering OCR, text extraction, classification, entity extraction, human review, and approved metadata, with queue-backed processing and explicit separation between OCR output and human-approved data. It also states that OCR must not be treated as final truth without human review where required.

This implementation plan expands those requirements into an implementation architecture and fixes the concrete free/self-hosted technology choices described above.
"""

path = Path("/mnt/data/plan17.md")
path.write_text(content, encoding="utf-8")
print(f"Created {path} ({len(content.splitlines())} lines)")

Data analysis isn't available right now. Do you want to continue without it? 

Branched from Branch · Branch · Phase 16 Requirements

continue
Analysis errored
from pathlib import Path

content = """# Phase 17 — OCR Pipeline Implementation Plan

## 1. Phase Objective

Implement a queue-backed OCR and document-intelligence pipeline that extracts text and entities from legal documents while keeping machine-generated OCR output strictly separate from human-approved legal metadata.

The authoritative Phase 17 requirements are:
- OCR
- text extraction
- classification
- entity extraction
- human review
- approved metadata
- queue-backed processing
- strict separation between OCR output and human-approved data
- OCR must not be treated as final truth without human review where required.

## 2. Approved Free / Self-Hosted Technology Stack

| Capability | Technology |
|---|---|
| OCR | PaddleOCR |
| PDF text extraction | PyMuPDF (`fitz`) |
| PDF rendering | PyMuPDF |
| Image preprocessing | OpenCV |
| Entity extraction | spaCy |
| Queue | BullMQ |
| Queue broker | Redis |
| Database | PostgreSQL |
| ORM | Prisma |
| Object storage | Existing MinIO/S3 abstraction |
| Backend | Existing NestJS |
| Human review UI | Existing application UI |
| Hashing | SHA-256 |

### PaddleOCR

Use PaddleOCR as the primary OCR engine. It is free/self-hostable and supports Arabic and English.

Architectural boundary:

```text
OcrProvider
    |
    +-- PaddleOcrAdapter

The application/domain layer must depend on OcrProvider, never directly on PaddleOCR.

PyMuPDF

Use PyMuPDF for:

native PDF text extraction
determining whether OCR is necessary
rendering scanned PDF pages to images
reading PDF page information

Routing:

PDF
 |
 +-- usable native text --> PyMuPDF extraction
 |
 +-- scanned/insufficient --> PyMuPDF render --> OCR
OpenCV

Use OpenCV for:

grayscale conversion
denoising
thresholding
deskewing
resizing
orientation normalization
basic image cleanup
spaCy

Use spaCy initially for structured entity extraction after OCR/text extraction.

Extracted Text
      |
      v
EntityExtractor
      |
      v
SpacyEntityExtractor
      |
      v
Machine-Generated Entities

These are candidates, not authoritative legal facts.

BullMQ + Redis

Use the existing Redis/BullMQ infrastructure. OCR must run asynchronously in workers, not inside the upload HTTP request.

PostgreSQL + Prisma

PostgreSQL is the source of truth for OCR processing state, extracted results, review state, and approved metadata. Prisma migrations are mandatory for schema changes.

MinIO / S3 abstraction

Reuse the existing object-storage abstraction. Do not introduce direct MinIO SDK dependencies into business services.

3. Target Architecture
                    Document
                       |
                       v
              OCR Processing Job
                  BullMQ Queue
                       |
                       v
              Document Processing
                    Router
                       |
          +------------+------------+
          |                         |
          v                         v
   Native PDF Text            Scanned/Image
      PyMuPDF                     |
          |                       v
          |                   PyMuPDF
          |                  page render
          |                       |
          |                       v
          |                    OpenCV
          |                 preprocessing
          |                       |
          |                       v
          |                  PaddleOCR
          |                       |
          +-----------+-----------+
                      |
                      v
               Extracted Text
                      |
                      v
              Classification
                      |
                      v
             Entity Extraction
                  spaCy
                      |
                      v
            Machine-Generated Data
                      |
                      v
                Human Review
                      |
             +--------+--------+
             |                 |
             v                 v
          Approved         Rejected /
          Metadata         Corrected
4. Data Model

Do not write OCR output directly into canonical Document metadata.

Recommended conceptual models:

Document
   |
   +-- OcrProcessing
   |      |
   |      +-- OcrPage
   |      +-- OcrEntity
   |      +-- ClassificationResult
   |
   +-- HumanReview
   |      |
   |      +-- ReviewCorrection
   |
   +-- ApprovedDocumentMetadata
OcrProcessing

Recommended fields:

id
tenantId
documentId
documentVersionId
status
attempt
provider
providerVersion
modelVersion
languageConfig
startedAt
completedAt
failureCode
correlationId
jobId
timestamps

Statuses:

QUEUED
PROCESSING
SUCCEEDED
FAILED
CANCELLED
OcrPage

Recommended fields:

id
ocrProcessingId
pageNumber
extractionMethod
text
confidence
page-level metadata
timestamps

Extraction methods:

NATIVE_TEXT
OCR
OcrEntity

Recommended fields:

id
ocrProcessingId
pageId
entityType
value
normalizedValue
confidence
sourceStart
sourceEnd
machine-generated metadata
timestamps

Initial entity categories may include:

PERSON
ORGANIZATION
COURT
CASE_NUMBER
DATE
ADDRESS
PHONE
EMAIL
LEGAL_REFERENCE

Finalize the taxonomy against existing legal-domain terminology before migration.

ClassificationResult

Recommended fields:

id
ocrProcessingId
predicted category
confidence
model/provider version
timestamps

Classification is a machine suggestion unless explicitly approved.

HumanReview

Recommended fields:

id
ocrProcessingId
reviewerId
status
decision
notes
reviewedAt
timestamps

Statuses:

NOT_REQUIRED
PENDING
IN_REVIEW
APPROVED
REJECTED
CORRECTION_REQUIRED
ApprovedDocumentMetadata

Only approved data may enter this authoritative layer.

Every approved value must be attributable to:

reviewer
approval timestamp
source OCR processing/version
tenant
document/document version
5. Processing Lifecycle
Step 1 — Eligibility

Before enqueueing:

verify document existence
verify tenant context
verify document version
verify authorization
verify Phase 16 document security state
reject documents that are not eligible
Step 2 — Durable Processing Record

Create OcrProcessing before enqueueing.

Use idempotency so repeated requests do not create uncontrolled duplicate processing.

Step 3 — Queue

Create a BullMQ job containing identifiers only:

tenantId
documentId
documentVersionId
ocrProcessingId
correlationId

Never place document bytes, access tokens, signed URLs, cookies, or secrets in the job payload.

Step 4 — Storage Retrieval

Worker obtains the document through the storage abstraction.

Step 5 — Extraction Routing

For PDFs:

inspect PDF
attempt native text extraction
determine whether extracted text is sufficient
OCR only when necessary

For images/scanned pages:

normalize
preprocess with OpenCV
execute PaddleOCR
Step 6 — Machine Output

Persist OCR text, pages, classification, and entities separately.

Never overwrite historical OCR processing results.

Step 7 — Human Review

Review may be required based on:

confidence thresholds
document type
entity type
legal/business rules
processing errors
tenant policy where applicable

Confidence is not proof of legal correctness.

Step 8 — Approval

Authorized reviewers may:

approve
correct
reject
request reprocessing

Only approved values may populate authoritative metadata.

Step 9 — Audit

Audit processing initiation/completion/failure, review decisions, corrections, approvals, rejections, and reprocessing.

6. API Plan

Proposed API surface:

POST   /api/v1/documents/:documentId/ocr
GET    /api/v1/documents/:documentId/ocr
GET    /api/v1/documents/:documentId/ocr/:processingId
GET    /api/v1/documents/:documentId/ocr/:processingId/pages
GET    /api/v1/documents/:documentId/ocr/:processingId/entities
GET    /api/v1/documents/:documentId/ocr/:processingId/classification

POST   /api/v1/documents/:documentId/ocr/:processingId/review
PATCH  /api/v1/documents/:documentId/ocr/:processingId/review
POST   /api/v1/documents/:documentId/ocr/:processingId/approve
POST   /api/v1/documents/:documentId/ocr/:processingId/reject
POST   /api/v1/documents/:documentId/ocr/:processingId/reprocess

Reconcile exact route names with existing Phase 15 conventions before implementation.

Every endpoint must enforce:

authenticated session
active tenant context
resource-level authorization
document access permission
tenant isolation
server-side authorization
audit requirements
7. Provider Interfaces

Implement explicit ports:

OcrProvider
DocumentTextExtractor
DocumentClassifier
EntityExtractor

Implementations:

PaddleOcrAdapter
PyMuPdfTextExtractor
SpacyEntityExtractor

Keep classification behind DocumentClassifier, even if the first implementation is simple/rule-based.

8. Queue Design

Suggested job names:

ocr.document.process
ocr.document.reprocess

Requirements:

deterministic job identity
bounded retries
backoff
dead-letter handling
correlation ID
tenant ID
document ID
document version ID
processing ID
idempotent worker behavior
9. Failure Handling

Use safe, stable error codes:

OCR_INPUT_INVALID
OCR_UNSUPPORTED_FORMAT
OCR_PROVIDER_UNAVAILABLE
OCR_PROCESSING_FAILED
OCR_TEXT_EXTRACTION_FAILED
OCR_ENTITY_EXTRACTION_FAILED
OCR_CLASSIFICATION_FAILED
OCR_STORAGE_READ_FAILED
OCR_STORAGE_WRITE_FAILED
OCR_REVIEW_REQUIRED

Do not expose stack traces, filesystem paths, secrets, signed URLs, or internal database errors to clients.

10. Security
Tenant Isolation

Every OCR record is tenant-scoped.

Every repository/query must enforce tenant context.

Verify cross-tenant access through API and worker paths.

Apply PostgreSQL RLS where required by the existing architecture.

Authorization

Authorize:

starting OCR
viewing OCR output
viewing entities
viewing classification
reviewing
correcting
approving
rejecting
reprocessing
Legal Truth Boundary

Machine-generated:

OCR text
entities
classification
confidence
predictions

must remain distinguishable from approved legal metadata.

Data Exposure

Users cannot access OCR output unless they can access the underlying document.

Do not create public document or OCR URLs.

11. Database / Migration Plan

Add Prisma migrations for the OCR/review persistence model.

Likely tables:

OcrProcessing
OcrPage
OcrEntity
DocumentClassificationResult
OcrHumanReview
OcrReviewCorrection
ApprovedDocumentMetadata

Required:

tenant foreign keys
document/document-version foreign keys
indexes
uniqueness constraints
status enums/checks
timestamps
reviewer foreign keys
RLS policies where applicable

Production schema changes must go through migrations.

12. Idempotency and Concurrency

Protect against:

duplicate OCR requests
duplicate queue jobs
concurrent processing
repeated review submissions
repeated approvals
repeated reprocessing

Use:

unique constraints
transactions
BullMQ job IDs/deduplication
concurrency checks where appropriate

PostgreSQL remains authoritative; Redis is coordination infrastructure.

13. Observability

Structured logs should include safe identifiers:

event
tenantId
documentId
documentVersionId
processingId
jobId
correlationId
provider
operation
status
durationMs
errorCode

Metrics:

jobs queued
jobs completed
jobs failed
processing duration
OCR success rate
retry count
review-required count
approval rate
entity extraction failures
provider failures

Never log document contents or sensitive extracted legal information by default.

14. Testing Strategy
Unit

Test:

PDF routing
provider adapters
preprocessing
classification
entity normalization
confidence handling
status transitions
review transitions
authorization
idempotency
Integration

Test:

PostgreSQL persistence
RLS
BullMQ
storage abstraction
OCR adapter
document-version isolation
E2E

Verify:

eligible document is submitted
OCR is queued
worker processes it
OCR output persists
classification persists
entities persist
review is required when applicable
authorized reviewer can review
reviewer can correct
reviewer can approve
approved metadata is stored separately
unauthorized access is denied
cross-tenant access is denied
duplicate submission is idempotent
reprocessing preserves historical results
failed processing can retry safely
Test Corpus

Use synthetic fixtures for:

Arabic document
English document
mixed Arabic/English document
scanned PDF
native-text PDF
image
low-quality scan
rotated document
multi-page document
legal document containing names, dates, case numbers, and court references

No real confidential legal documents should be committed as fixtures.

15. Human Review UI

Display:

original document/page
extracted text
detected entities
confidence
classification
source location
machine-generated indicator
editable correction fields
approve/reject controls
reviewer identity
review timestamp

Support Arabic, English, RTL, LTR, accessibility, and responsive layouts.

Frontend controls are not authorization.

16. Implementation Order
Step 1 — Audit Existing Architecture

Inspect:

Phase 15 document model
Phase 16 security/storage abstraction
BullMQ workers
Redis
MinIO/storage adapter
tenant context
RLS
authorization
audit infrastructure
frontend document views

Do not duplicate existing infrastructure.

Step 2 — Define Contracts

Implement:

OcrProvider
DocumentTextExtractor
DocumentClassifier
EntityExtractor
Step 3 — Database

Add Prisma models, migration, indexes, constraints, and RLS.

Step 4 — PDF/Text Pipeline

Implement PyMuPDF extraction and OCR routing.

Step 5 — OCR

Implement PaddleOCR adapter with Arabic/English support.

Step 6 — Preprocessing

Implement OpenCV preprocessing where required.

Step 7 — Entities

Implement spaCy adapter and persistence.

Step 8 — Classification

Implement classifier abstraction and persistence.

Step 9 — Worker

Implement BullMQ processing, retries, idempotency, and safe failures.

Step 10 — Review

Implement review API, authorization, persistence, and UI.

Step 11 — Approved Metadata

Implement explicit promotion from machine output to authoritative metadata.

Step 12 — Audit/Observability

Implement audit events, logs, metrics, and diagnostics.

Step 13 — Verification

Run unit, integration, RLS, authorization, queue, E2E, and Arabic/English tests.

Step 14 — Documentation

Complete ADRs, API documentation, operational documentation, and phase status.

17. ADRs

Create:

docs/phase17/ADR-17-001-OCR-PADDLEOCR.md
docs/phase17/ADR-17-002-PDF-PYMUPDF.md
docs/phase17/ADR-17-003-ENTITY-EXTRACTION-SPACY.md
docs/phase17/ADR-17-004-OCR-HUMAN-REVIEW-BOUNDARY.md
docs/phase17/ADR-17-005-OCR-QUEUE-IDEMPOTENCY.md

Each ADR must record:

decision
alternatives considered
security implications
operational implications
replacement strategy
18. Completion Gate

Phase 17 is CLOSED only when:

[ ] PaddleOCR implemented
[ ] PyMuPDF extraction implemented
[ ] OpenCV preprocessing implemented where required
[ ] spaCy entity extraction implemented
[ ] BullMQ/Redis processing implemented
[ ] OCR output separated from approved metadata
[ ] Human review implemented where required
[ ] Tenant isolation verified
[ ] Authorization verified
[ ] RLS verified
[ ] Database migrations complete
[ ] Audit implemented
[ ] Observability implemented
[ ] Arabic tests pass
[ ] English tests pass
[ ] Mixed-language tests pass
[ ] Native-text PDF tests pass
[ ] Scanned PDF tests pass
[ ] Retry/idempotency tests pass
[ ] Reprocessing preserves history
[ ] API documentation complete
[ ] Operational documentation complete
[ ] No critical automated test failures
19. Explicit Non-Goals

Do not:

use an LLM as the OCR engine
treat OCR output as authoritative legal truth
write machine OCR directly into canonical legal records
rely on frontend authorization
expose public legal-document URLs
couple business/domain services directly to PaddleOCR, MinIO, or spaCy
place secrets or document bytes in queue payloads
use Redis as the source of truth
silently overwrite historical OCR processing
skip tenant/RLS verification
claim production readiness because OCR works on a single sample
20. Final Locked Stack

Free/self-hosted Phase 17 baseline:

OCR                 = PaddleOCR
PDF extraction      = PyMuPDF
PDF rendering       = PyMuPDF
Image preprocessing = OpenCV
Entity extraction   = spaCy
Queue               = BullMQ
Broker              = Redis
Database            = PostgreSQL
ORM                 = Prisma
Object storage      = Existing MinIO/S3 abstraction
Backend             = Existing NestJS
Hashing             = SHA-256
Review              = Existing application UI

All external providers must remain behind replaceable interfaces/adapters.

21. Source Alignment

Phase 17 expands the authoritative requirements in Plan.txt into an implementation-ready architecture while preserving the project's existing security, authorization, tenant-isolation, migration, queue, audit, and adapter rules.

The concrete free/self-hosted choices are intentionally explicit so implementation agents do not invent technology choices during coding.
"""

path = Path("/mnt/data/plan17.md")
path.write_text(content, encoding="utf-8")
print(f"Created: {path}")