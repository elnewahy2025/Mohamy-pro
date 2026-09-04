# Phase 19 Implementation Plan — Document Templates

**Project:** Mohamy Pro
**Phase:** 19 — Document Templates
**Source of truth:** `Plan.txt` — Revision 2
**Implementation status:** Planning
**Target environment:** Windows 11 + PowerShell + Visual Studio Code + Docker

---

## 1. Purpose

Phase 19 introduces a production-grade document-template engine for generating customizable legal documents while preserving tenant isolation, authorization, version history, document security, and auditability.

The authoritative `Plan.txt` defines the Phase 19 objective as:

> Build a template engine for producing customizable legal documents.

The explicitly required scope is:

- Template
- Variables
- Case / Client data
- Validation
- Document Generation
- DOCX
- PDF
- Versioning
- Tenant templates
- Approval

The required outputs are:

- Template builder
- Generation jobs
- Template version history

The explicit closure requirement is:

- Templates are associated with the tenant and have clear permissions.

Source alignment: `Plan.txt`, Phase 19. fileciteturn3file0L763-L786

---

## 2. Governing Project Rules

The implementation MUST preserve the global rules in `Plan.txt`:

1. Every phase must be independently complete.
2. Every phase must be suitable for real production deployment before it is considered complete.
3. Tenant isolation is enforced by the server, never by the frontend.
4. Backend authorization is authoritative.
5. External integrations use adapters/interfaces rather than direct domain dependencies.
6. Legal documents must not be exposed through public URLs.
7. Production schema changes require migrations.
8. Commercially critical features require automated tests.
9. Paths touching tenant boundaries, security, money, or legal records require audit coverage.
10. The UI must support English and Arabic, including complete RTL/LTR behavior, i18n, accessibility, and responsive layouts.
11. The standard API prefix remains `/api/v1`.
12. Redis is not a source of truth.
13. Concurrency must be handled with transactions, unique constraints, idempotency, queue deduplication, and optimistic locking where appropriate.
14. No phase is complete without appropriate tests, observability, documentation, and rollback/mitigation planning.

These are not optional Phase 19 enhancements; they are constraints inherited from the project source of truth. fileciteturn3file0L16-L31 fileciteturn3file0L87-L99

---

## 3. Phase 19 Architectural Position

Phase 19 depends conceptually on the already-defined platform capabilities from earlier phases:

- Phase 2 — Identity + Multi-Tenancy
- Phase 3 — Security + Audit Foundation
- Phase 4 — Organization Configuration
- Phase 5 — Client Management
- Phase 8 — Case Management
- Phase 15 — Document Management
- Phase 16 — Document Security
- Phase 17 — OCR Pipeline
- Phase 18 — Search

Phase 19 should **reuse** these capabilities rather than introduce parallel implementations.

In particular:

- `Case` remains the canonical legal record.
- Tenant context is derived from authenticated membership.
- Existing RBAC + ABAC + resource-level authorization remains authoritative.
- Existing document storage/security infrastructure remains the mechanism for storing generated legal files.
- Existing queue/outbox infrastructure should be reused for asynchronous generation.
- Generated documents remain governed legal documents, not temporary public files.

The source of truth explicitly establishes `Case` as the canonical legal record and tenant context as derived from authenticated membership. fileciteturn3file0L37-L59

---

# 4. Recommended Technology Stack

The following concrete implementation choices fill technology gaps while remaining compatible with the architecture defined by `Plan.txt`.

| Capability | Recommended implementation |
|---|---|
| Backend | Existing NestJS application |
| Database | Existing PostgreSQL |
| ORM | Existing Prisma |
| Queue | Existing BullMQ + Redis |
| Durable job/event trigger | Existing transactional outbox |
| Object storage | Existing MinIO/S3 abstraction from Phase 15/16 |
| DOCX generation | `docxtemplater` + `PizZip` |
| DOCX template authoring | Microsoft Word-compatible `.docx` templates using content controls / placeholders supported by the chosen template convention |
| DOCX → PDF | LibreOffice headless in an isolated worker/container |
| PDF validation/metadata inspection | Existing PDF tooling where already present; otherwise a small infrastructure adapter |
| Template schema validation | Zod or the project's existing validation library |
| API validation | Existing NestJS DTO/class-validator pipeline, aligned with project conventions |
| Authentication | Existing Keycloak/OIDC/session architecture |
| Authorization | Existing RBAC + ABAC + resource authorization |
| Audit | Existing audit subsystem |
| Search | Existing Phase 18 search abstraction, where template discovery is required |
| Hashing | SHA-256 using the platform's existing cryptographic utility |
| Localization | Existing English/Arabic i18n system |

### Technology boundary

The domain/application layers MUST NOT depend directly on `docxtemplater`, LibreOffice, or a specific storage provider.

Use interfaces such as:

- `TemplateRenderer`
- `DocumentConversionProvider`
- `TemplateStorage`
- `TemplateVariableResolver`

Infrastructure adapters implement these interfaces.

This follows the project rule that external integrations pass through adapters/interfaces and that phases must not introduce direct provider dependencies into domain logic. fileciteturn3file0L22-L30

---

# 5. Core Domain Model

## 5.1 Template

Represents the logical template owned by a tenant.

Recommended fields:

```text
Template
- id: UUID
- tenantId: UUID
- organizationId: UUID? 
- name: string
- code: string
- description: string?
- documentTypeId: UUID?
- status: DRAFT | PENDING_APPROVAL | APPROVED | ARCHIVED
- outputFormats: DOCX | PDF | BOTH
- currentVersionId: UUID?
- createdBy: UUID
- updatedBy: UUID
- createdAt
- updatedAt
- archivedAt: timestamp?
```

### Constraints

- `tenantId` is mandatory.
- `code` must be unique within the tenant.
- A template must never be globally addressable without tenant authorization.
- Archived templates cannot silently become active.
- The current version must belong to the same tenant/template.

---

## 5.2 TemplateVersion

The immutable version of a template.

Recommended fields:

```text
TemplateVersion
- id: UUID
- templateId: UUID
- tenantId: UUID
- versionNumber: integer
- status: DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | RETIRED
- sourceObjectId: UUID
- sourceSha256: string
- variableSchema: JSONB
- templateMetadata: JSONB
- createdBy: UUID
- approvedBy: UUID?
- approvedAt: timestamp?
- rejectionReason: string?
- createdAt
- retiredAt: timestamp?
```

### Immutability

Once a version is approved, its source content and variable contract MUST NOT be destructively modified.

A change creates a new version.

This is essential because generated legal documents must remain reproducible from the exact template version used at generation time.

---

## 5.3 TemplateVariable

Variables should be explicit rather than arbitrary free-form database expressions.

Recommended logical representation:

```text
TemplateVariable
- id: UUID
- templateVersionId: UUID
- key: string
- label: string
- dataType: STRING | NUMBER | DATE | DATETIME | BOOLEAN | CURRENCY | TEXT | ENUM
- required: boolean
- sourceType: MANUAL | CASE | CLIENT | PARTY | ORGANIZATION | USER | COMPUTED
- sourcePath: string?
- validationSchema: JSONB?
- defaultValue: JSONB?
- sensitivity: PUBLIC | INTERNAL | CONFIDENTIAL | SENSITIVE | RESTRICTED
```

The exact classification values MUST be aligned with the project's existing `DATA_CLASSIFICATION.md`; do not invent a conflicting classification taxonomy.

---

## 5.4 TemplateApproval

Approval should be a first-class workflow record rather than a boolean on the template.

Recommended model:

```text
TemplateApproval
- id: UUID
- tenantId: UUID
- templateVersionId: UUID
- requestedBy: UUID
- reviewerId: UUID?
- state: PENDING | APPROVED | REJECTED | CANCELLED
- decisionReason: string?
- requestedAt
- decidedAt
```

This provides an auditable approval history.

---

## 5.5 DocumentGenerationJob

Represents a request to generate a legal document.

Recommended fields:

```text
DocumentGenerationJob
- id: UUID
- tenantId: UUID
- templateId: UUID
- templateVersionId: UUID
- caseId: UUID?
- clientId: UUID?
- requestedBy: UUID
- idempotencyKey: string
- status: QUEUED | PROCESSING | SUCCEEDED | FAILED | CANCELLED
- requestedFormats: JSONB
- inputSnapshot: JSONB
- resultDocumentIds: JSONB
- errorCode: string?
- errorMessageSafe: string?
- attempts: integer
- createdAt
- startedAt: timestamp?
- completedAt: timestamp?
```

### Important

`inputSnapshot` should contain the exact resolved values used for generation when policy permits retaining them. Sensitive values must follow the project's classification and retention rules. Never log the complete snapshot by default.

---

# 6. Database Design

## 6.1 Tables

Minimum recommended relational tables:

1. `templates`
2. `template_versions`
3. `template_approvals`
4. `document_generation_jobs`
5. Optional `template_variable_definitions` if variables are normalized instead of embedded in `variableSchema`.

Use existing `Document`, `DocumentVersion`, `StorageObject`, tenant, user, case, client, organization, and audit tables wherever possible.

## 6.2 PostgreSQL requirements

Every tenant-owned table must include a tenant boundary suitable for the project's RLS strategy.

Required:

- foreign keys
- unique constraints
- check constraints
- indexes
- migrations
- RLS policies where required by the existing tenant model

The project's continuous database rules explicitly require PostgreSQL constraints/indexes/migrations and server-side tenant enforcement. fileciteturn2file4L226-L240

## 6.3 Recommended indexes

```text
templates:
- (tenant_id, code) UNIQUE
- (tenant_id, status)
- (tenant_id, updated_at)

 template_versions:
- (tenant_id, template_id, version_number) UNIQUE
- (tenant_id, template_id, status)

 template_approvals:
- (tenant_id, template_version_id, state)
- (tenant_id, requested_by)

 document_generation_jobs:
- (tenant_id, status, created_at)
- (tenant_id, template_id, created_at)
- UNIQUE (tenant_id, idempotency_key)
```

Use the project's actual naming conventions if they differ.

---

# 7. Tenant Isolation and RLS

Tenant isolation is a hard security boundary.

Every template operation must establish the tenant from authenticated membership/session context.

The API must reject:

- arbitrary `tenantId` supplied as a trust field;
- cross-tenant template IDs;
- cross-tenant case/client references;
- cross-tenant generation jobs;
- cross-tenant output document references.

RLS should provide database-level defense-in-depth where appropriate.

Required security tests:

```text
Tenant A user → Tenant A template       = ALLOW when authorized
Tenant A user → Tenant B template       = DENY
Tenant A job → Tenant B case            = DENY
Tenant A generation → Tenant B client   = DENY
Tenant A output → Tenant B document    = DENY
```

A frontend tenant selector is never a security boundary.

---

# 8. Authorization Model

Use the existing authorization engine.

Recommended permissions:

```text
template.read
 template.create
 template.update
 template.submit_for_approval
 template.approve
 template.reject
 template.archive
 template.generate
 template.download
 template.manage_variables
 template.manage_tenant_templates
 template.reprocess_generation
```

Exact permission names should be reconciled with the project's existing authorization matrix rather than creating duplicate permission semantics.

## Resource-level authorization

Authorization should evaluate at least:

- tenant
- organization/branch/department where applicable
- template ownership/scope
- template status
- template version
- referenced case/client
- generated document
- requested action

## Approval separation

Where policy requires separation of duties:

- the user who creates/submits a template should not automatically be allowed to approve it;
- approval must be checked by backend policy;
- approval/rejection must be audited.

---

# 9. Template Lifecycle

Recommended lifecycle:

```text
DRAFT
  ↓
PENDING_APPROVAL
  ↓
APPROVED
  ↓
RETIRED / ARCHIVED
```

Rejected versions may return to `DRAFT` only through an explicit authorized transition, or a new version may be created according to policy.

## Allowed transitions

```text
DRAFT → PENDING_APPROVAL
PENDING_APPROVAL → APPROVED
PENDING_APPROVAL → REJECTED
REJECTED → DRAFT
APPROVED → RETIRED
```

No direct uncontrolled status mutation should be permitted.

Every transition should produce an audit event.

---

# 10. Template Authoring Model

The template builder should provide two compatible authoring paths:

### A. Upload an existing DOCX template

Users with the appropriate permission upload a DOCX containing supported placeholders.

### B. In-application template builder

The UI allows authorized users to:

- create template metadata;
- define variables;
- insert supported variable placeholders;
- select allowed data sources;
- define required/optional variables;
- preview resolved data;
- validate the template;
- submit the version for approval.

The exact visual editing technology is not prescribed by `Plan.txt`; therefore this plan deliberately treats the builder UI as an application-level editor rather than mandating a particular commercial editor.

---

# 11. Variable System

Variables are the central safety boundary between templates and legal/business data.

## 11.1 Never expose arbitrary database queries

A template must NOT be able to execute:

- SQL
- Prisma queries
- arbitrary JavaScript
- arbitrary HTTP requests
- shell commands
- arbitrary filesystem access

Instead, variables resolve through a controlled registry.

Example:

```text
case.caseNumber
case.title
case.openDate
client.displayName
client.email
organization.name
assignedLawyer.displayName
court.name
```

## 11.2 Variable registry

Recommended interface:

```ts
interface TemplateVariableResolver {
  resolve(
    variable: TemplateVariableDefinition,
    context: TemplateResolutionContext,
  ): Promise<ResolvedTemplateValue>;
}
```

The resolver must apply authorization before retrieving source data.

## 11.3 Data-source authorization

A user being allowed to generate a document does not automatically mean the user may read every field available to the template engine.

Example:

```text
CanGenerateTemplate = true
CanReadRestrictedClientField = false
→ restricted field MUST NOT resolve
```

The template engine must never become an authorization bypass around Cases, Clients, Parties, or Documents.

---

# 12. Validation

Validation occurs at multiple stages.

## 12.1 Upload validation

Validate:

- file extension
- MIME type
- actual file signature where applicable
- maximum file size
- malformed archive/package conditions
- template structure
- placeholder syntax
- unsupported constructs

Use the existing Phase 16 document-security pipeline rather than duplicating upload security.

## 12.2 Template validation

Before approval:

- all placeholders parse successfully;
- all variables exist in the registry;
- variable data types are compatible;
- required variables have valid sources;
- unsupported functions/expressions are rejected;
- referenced entities are authorized/supported;
- template version is internally consistent.

## 12.3 Generation validation

Before rendering:

- template version is approved;
- requested user is authorized;
- case/client references belong to the same tenant;
- required variables resolve;
- values pass variable validation;
- requested output formats are supported;
- idempotency key is valid.

After rendering:

- output exists;
- file is non-empty;
- expected format is valid;
- generated artifact is stored through the document/storage abstraction;
- checksum is recorded;
- generated document is associated with the correct tenant and source metadata.

---

# 13. DOCX Generation

## 13.1 Rendering adapter

Define:

```ts
interface TemplateRenderer {
  validateTemplate(input: TemplateSource): Promise<TemplateValidationResult>;

  renderDocx(input: TemplateRenderInput): Promise<RenderedDocument>;
}
```

Infrastructure implementation:

```text
DocxTemplateRenderer
  └── docxtemplater
      └── PizZip
```

The application layer knows only the interface.

## 13.2 Placeholder convention

Use a deterministic syntax, for example:

```text
{{case.caseNumber}}
{{case.title}}
{{client.displayName}}
{{court.name}}
{{organization.name}}
```

The exact syntax should be frozen in the Phase 19 ADR and validator.

Do not support arbitrary template code in v1.

## 13.3 Missing values

Missing required values must fail generation with a structured validation error.

Optional values should follow an explicit empty-value policy rather than silently producing misleading legal text.

---

# 14. PDF Generation

DOCX is the primary editable output. PDF is the controlled final-output format.

Recommended implementation:

```text
DOCX renderer
    ↓
Generated DOCX
    ↓
Isolated LibreOffice headless conversion worker
    ↓
Generated PDF
```

## Security requirements

LibreOffice must run in an isolated worker/container with:

- no public network exposure;
- restricted filesystem access;
- non-root execution where practical;
- controlled temporary directories;
- resource/time limits;
- input/output paths isolated from the application host;
- no access to unrelated tenant data.

The application must never expose the LibreOffice service directly to clients.

## Conversion abstraction

```ts
interface DocumentConversionProvider {
  convertDocxToPdf(input: ConversionInput): Promise<ConvertedDocument>;
}
```

This keeps PDF conversion replaceable later.

---

# 15. Generated Document Storage

Generated DOCX/PDF files are legal documents and must use the existing secure document infrastructure.

Do not:

- store them in a public web directory;
- return public object-storage URLs;
- bypass document access control;
- expose MinIO credentials;
- create an independent insecure storage path.

The project source explicitly prohibits public URLs for legal documents and requires controlled document storage/access. fileciteturn3file0L22-L30 fileciteturn3file0L649-L681

Recommended metadata recorded on the generated document:

```text
source = TEMPLATE_GENERATION
sourceTemplateId
sourceTemplateVersionId
sourceGenerationJobId
sourceCaseId
sourceClientId
sha256
createdBy
createdAt
```

---

# 16. Reproducibility

Every generated document must be traceable to:

1. template ID;
2. exact template version;
3. exact variable definitions;
4. generation job;
5. generating user;
6. relevant case/client context;
7. generated output checksum.

This enables later investigation of:

- why a document contained a particular value;
- which template was used;
- which version was approved;
- who generated it;
- whether the output was modified afterward.

A future template update must never silently change the meaning of an already-generated document.

---

# 17. Generation Job Architecture

Generation should be asynchronous for production reliability.

Recommended flow:

```text
POST /api/v1/templates/:templateId/generate
                │
                ▼
       Authorization check
                │
                ▼
       Validate template version
                │
                ▼
       Validate Case/Client scope
                │
                ▼
       Create GenerationJob + Outbox event
                │
                ▼
        BullMQ generation queue
                │
                ▼
       Template Generation Worker
          │             │
          │             ├── Resolve variables
          │             ├── Render DOCX
          │             └── Convert PDF if requested
          ▼
     Secure Document Storage
                │
                ▼
      Update GenerationJob
                │
                ▼
             Audit
```

## Why the outbox is required

The generation request and the durable event must not be allowed to diverge.

Recommended pattern:

```text
DB transaction
 ├── create generation job
 └── create outbox event
          ↓
outbox dispatcher
          ↓
BullMQ
```

This follows the platform's existing transactional-outbox and queue standards. fileciteturn3file0L50-L52

---

# 18. Idempotency

Generation requests must support an idempotency key.

Example:

```http
Idempotency-Key: <UUID>
```

Behavior:

- same tenant + same idempotency key + same logical request → return existing job/result;
- same key with materially different request → reject;
- cross-tenant reuse → never expose another tenant's job/result.

This prevents duplicate legal-document generation when clients retry due to network failures.

---

# 19. Queue and Worker Requirements

Recommended queue:

```text
legal-document-generation
```

Optional separate queue:

```text
legal-document-conversion
```

Worker requirements:

- idempotent;
- retryable;
- tenant-aware;
- bounded concurrency;
- timeout protection;
- structured errors;
- dead-letter/failure handling according to existing queue conventions;
- correlation IDs;
- no sensitive document content in logs.

## Retry policy

Use bounded exponential backoff.

Do not endlessly retry deterministic template validation failures.

Classify errors as:

```text
RETRYABLE
NON_RETRYABLE
SECURITY_FAILURE
VALIDATION_FAILURE
PROVIDER_FAILURE
INTERNAL_FAILURE
```

---

# 20. API Design

All APIs remain under `/api/v1`.

## Template APIs

```http
POST   /api/v1/templates
GET    /api/v1/templates
GET    /api/v1/templates/:templateId
PATCH  /api/v1/templates/:templateId
POST   /api/v1/templates/:templateId/archive
```

## Version APIs

```http
POST   /api/v1/templates/:templateId/versions
GET    /api/v1/templates/:templateId/versions
GET    /api/v1/templates/:templateId/versions/:versionId
POST   /api/v1/templates/:templateId/versions/:versionId/validate
POST   /api/v1/templates/:templateId/versions/:versionId/submit
```

## Approval APIs

```http
POST   /api/v1/templates/:templateId/versions/:versionId/approve
POST   /api/v1/templates/:templateId/versions/:versionId/reject
GET    /api/v1/templates/:templateId/versions/:versionId/approvals
```

## Variable APIs

```http
GET    /api/v1/template-variables/catalog
GET    /api/v1/templates/:templateId/versions/:versionId/variables
PUT    /api/v1/templates/:templateId/versions/:versionId/variables
```

## Generation APIs

```http
POST   /api/v1/templates/:templateId/generate
GET    /api/v1/document-generation-jobs/:jobId
POST   /api/v1/document-generation-jobs/:jobId/cancel
```

Exact route names may be adjusted to match existing API conventions, but the contract must be documented in OpenAPI.

---

# 21. Generation Request Contract

Recommended request:

```json
{
  "templateVersionId": "uuid",
  "caseId": "uuid",
  "clientId": "uuid",
  "formats": ["DOCX", "PDF"],
  "variables": {
    "customVariable": "value"
  }
}
```

Rules:

- `tenantId` is NOT accepted as a trusted security field;
- template version must belong to the authenticated tenant;
- case/client references must belong to the same tenant and be authorized;
- caller-supplied variables are restricted to explicitly declared manual variables;
- system variables are resolved server-side;
- raw database paths are rejected.

---

# 22. Error Model

Use the project's standard API error envelope.

Recommended Phase 19 codes:

```text
TEMPLATE_NOT_FOUND
TEMPLATE_ACCESS_DENIED
TEMPLATE_VERSION_NOT_FOUND
TEMPLATE_VERSION_NOT_APPROVED
TEMPLATE_VERSION_IMMUTABLE
TEMPLATE_INVALID
TEMPLATE_VARIABLE_UNKNOWN
TEMPLATE_VARIABLE_INVALID
TEMPLATE_VARIABLE_UNAUTHORIZED
TEMPLATE_REQUIRED_VALUE_MISSING
TEMPLATE_APPROVAL_REQUIRED
TEMPLATE_APPROVAL_ACCESS_DENIED
TEMPLATE_GENERATION_NOT_ALLOWED
TEMPLATE_GENERATION_INVALID_REQUEST
TEMPLATE_GENERATION_DUPLICATE
TEMPLATE_GENERATION_FAILED
TEMPLATE_CONVERSION_FAILED
TEMPLATE_OUTPUT_STORAGE_FAILED
TEMPLATE_CROSS_TENANT_REFERENCE
TEMPLATE_PROVIDER_UNAVAILABLE
TEMPLATE_INTERNAL_ERROR
```

Do not expose internal stack traces, filesystem paths, object-storage credentials, or provider internals.

---

# 23. Template Builder UI

The builder should contain at least:

### Template metadata

- name
- code
- description
- document type
- tenant scope
- output formats
- status

### Variable panel

- available variables
- variable type
- source
- required/optional
- validation rules
- sensitivity indicator

### Editor

- template content editing/upload;
- placeholder insertion;
- validation feedback;
- preview.

### Approval panel

- current version;
- version status;
- approval history;
- reviewer decision;
- rejection reason.

### Generation panel

- choose approved template version;
- choose authorized Case/Client;
- provide allowed manual variables;
- choose DOCX/PDF;
- submit generation;
- monitor job status;
- open resulting document through secure document access.

Frontend authorization is UX only. The backend remains authoritative.

---

# 24. Preview Safety

Preview must not bypass authorization.

A preview using Case/Client data must perform the same source-data authorization checks as real generation.

Two preview modes are recommended:

1. **Structure preview:** placeholder/sample values only.
2. **Authorized data preview:** actual Case/Client data, subject to normal permissions.

Never allow an unauthorized user to preview restricted data merely because the user has access to the template.

---

# 25. Audit Requirements

At minimum audit:

```text
TEMPLATE_CREATED
TEMPLATE_UPDATED
TEMPLATE_ARCHIVED
TEMPLATE_VERSION_CREATED
TEMPLATE_VERSION_VALIDATED
TEMPLATE_VERSION_SUBMITTED
TEMPLATE_APPROVAL_REQUESTED
TEMPLATE_APPROVED
TEMPLATE_REJECTED
TEMPLATE_RETIRED
TEMPLATE_GENERATION_REQUESTED
TEMPLATE_GENERATION_STARTED
TEMPLATE_GENERATION_SUCCEEDED
TEMPLATE_GENERATION_FAILED
TEMPLATE_DOCUMENT_CREATED
```

Audit records should contain safe metadata such as:

- tenant ID;
- actor ID;
- action;
- resource ID;
- template/version IDs;
- generation job ID;
- correlation ID;
- timestamp;
- outcome;
- reason/error code where appropriate.

Do not place complete legal document contents or full sensitive variable snapshots into ordinary audit logs.

---

# 26. Security Threat Model

Phase 19 must explicitly test at least:

## Tenant escape

Attempt to generate using:

- another tenant's template;
- another tenant's version;
- another tenant's Case;
- another tenant's Client;
- another tenant's generated document.

Expected result: denial.

## Authorization bypass

Attempt generation with:

- missing permission;
- archived template;
- unapproved version;
- unauthorized Case;
- unauthorized Client;
- unauthorized restricted variable.

Expected result: denial.

## Template injection

Reject arbitrary executable expressions and dangerous template features.

## Path traversal

Template storage and temporary generation paths must never be controllable through unsanitized user input.

## Malicious DOCX

Uploaded template files must pass the existing document-security pipeline, including malware/content validation established in earlier phases.

## Resource exhaustion

Protect against:

- extremely large templates;
- excessive variable counts;
- deeply nested template structures;
- huge generated outputs;
- conversion loops;
- excessive concurrent jobs.

## Information disclosure

Error messages and logs must not disclose:

- another tenant's identifiers;
- restricted field values;
- object-storage credentials;
- internal paths;
- full legal-document content.

---

# 27. Versioning Rules

Template versions are immutable once approved.

Generation must always store the exact `templateVersionId`.

Never implement:

```text
Generate(templateId) → silently use mutable latest content
```

Instead:

```text
Generate(templateId, approvedVersionId)
```

If the API allows omission of a version, the backend may resolve the current approved version at request time, but the resulting job must immediately persist that exact version ID.

This guarantees reproducibility.

---

# 28. Approval Rules

A template version must satisfy:

```text
VALID
+ AUTHORIZED
+ REQUIRED_METADATA_PRESENT
+ VARIABLE_SCHEMA_VALID
+ APPROVAL_POLICY_SATISFIED
= APPROVED
```

Only approved versions should be usable for normal legal-document generation unless a separate explicitly authorized draft-preview policy exists.

Approval decisions must be immutable audit events.

---

# 29. Integration With Existing Document Management

Phase 19 should create generated documents through the Phase 15/16 document subsystem.

Do not create a parallel `GeneratedFile` storage system unless an actual missing requirement is demonstrated.

The integration should preserve:

- Document
- DocumentVersion
- StorageObject
- DocumentAccess
- secure download
- audit
- hashing
- lifecycle/archival behavior

The Phase 15 source requirements already establish Document, DocumentVersion, Storage Object, access control, upload/download/preview, versioning, sharing, and secure non-public access. fileciteturn3file0L649-L681

---

# 30. Integration With Phase 18 Search

Template metadata can be searchable through the existing Phase 18 search abstraction if required by the platform UI.

Search must remain permission-aware.

At minimum searchable fields may include:

- template name;
- code;
- description;
- document type;
- status;
- version number.

Do not index raw restricted template data without classification and authorization rules.

Generated legal documents should enter the existing document search pipeline according to Phase 18's indexing rules rather than creating a second search system.

---

# 31. Integration With Phase 17 OCR

OCR is not a required component of template generation.

However, if generated documents subsequently enter the normal document pipeline, they may be processed by the existing OCR pipeline according to document policy.

Phase 19 must not duplicate OCR functionality.

---

# 32. Observability

Every generation job should have:

- correlation ID;
- tenant-safe job ID;
- template/version ID;
- actor ID;
- queue/job ID;
- duration;
- status;
- retry count;
- output formats;
- storage result.

Metrics:

```text
phase19_template_generation_requests_total
phase19_template_generation_success_total
phase19_template_generation_failure_total
phase19_template_generation_duration_ms
phase19_template_validation_failures_total
phase19_template_approval_total
phase19_template_queue_depth
phase19_template_queue_lag
phase19_docx_generation_duration_ms
phase19_pdf_conversion_duration_ms
phase19_output_storage_failures_total
```

Sensitive template content and resolved legal text must not be logged as normal telemetry.

The project-wide observability requirement includes logs, metrics, traces, and correlation IDs. fileciteturn2file4L226-L240

---

# 33. Performance and Limits

Recommended initial safeguards:

```text
Maximum template upload size: configurable, conservative default
Maximum variable definitions per version: configurable
Maximum manual variables per generation: configurable
Maximum generation runtime: configurable timeout
Maximum concurrent conversion jobs: configurable
Maximum generated output size: configurable
```

Do not hardcode operational limits permanently; expose them through safe platform configuration where appropriate.

PDF conversion should be isolated because it is CPU/memory intensive.

---

# 34. Concurrency and Race Conditions

Protect against:

### Double approval

Two reviewers cannot both produce conflicting final approvals.

### Concurrent version creation

Version numbers must remain unique per template.

### Duplicate generation

Idempotency keys prevent duplicate jobs.

### Template retirement during generation

A job already created against an approved version should retain its exact version reference. The worker must not silently switch to another version.

### Permission revocation

For sensitive operations, authorization should be checked when the job is created. If policy requires it, the worker may also perform a final authorization/resource-state check before producing output.

---

# 35. Transaction Boundaries

Template mutation:

```text
DB transaction
 ├── update template/version state
 ├── create audit event
 └── create outbox event where asynchronous work follows
```

Generation request:

```text
DB transaction
 ├── authorize/validate state
 ├── create generation job
 └── create outbox event
```

Generation completion:

```text
DB transaction
 ├── attach generated Document/DocumentVersion metadata
 ├── mark generation job succeeded
 └── write audit event
```

If storage succeeds but DB finalization fails, the system must have a recoverable reconciliation path rather than silently losing the generated artifact.

---

# 36. Failure Recovery

Required failure classes:

```text
TemplateValidationFailure
VariableResolutionFailure
AuthorizationFailure
StorageFailure
DocxRenderFailure
PdfConversionFailure
QueueFailure
DatabaseFailure
ProviderFailure
UnknownFailure
```

Recovery rules:

- deterministic validation failures: no automatic infinite retry;
- transient storage/queue/provider failures: bounded retry;
- worker crash: job must be recoverable;
- orphaned object: reconciliation process must detect it;
- failed job: safe error state and audit record;
- repeated failure: operational alert.

---

# 37. Data Retention

Template versions and approval history should follow the platform's document/legal retention rules.

Do not introduce an independent retention policy that conflicts with the later Audit + Compliance + Retention + Legal Hold phase.

Phase 19 should store the metadata necessary for future retention/legal-hold controls without claiming to implement the full Phase 30 retention system.

---

# 38. Internationalization

Templates must support:

- English;
- Arabic;
- RTL layout;
- LTR layout;
- Arabic dates/numbers where configured;
- Unicode text;
- mixed Arabic/English legal content.

The template engine must not corrupt Arabic characters during DOCX generation or PDF conversion.

PDF conversion must be tested with Arabic fonts and RTL paragraphs.

The source requires English as the primary operational language and full RTL Arabic support throughout the product. fileciteturn3file0L128-L136

---

# 39. Accessibility

The builder must support:

- keyboard navigation;
- semantic controls;
- visible focus states;
- accessible labels;
- accessible validation errors;
- screen-reader-compatible forms;
- responsive layouts.

The source explicitly requires accessibility including keyboard navigation, semantic markup, labels, and error handling. fileciteturn2file4L226-L240

---

# 40. Testing Strategy

## 40.1 Unit tests

Test:

- template state transitions;
- version numbering;
- variable validation;
- variable type validation;
- required-variable validation;
- authorization-scope construction;
- idempotency;
- error mapping;
- template parser/validator;
- generation orchestration.

## 40.2 Integration tests

Test:

- PostgreSQL schema;
- RLS policies;
- template/version relationships;
- approval transactions;
- outbox creation;
- BullMQ enqueueing;
- secure document creation;
- storage integration;
- DOCX rendering adapter;
- PDF conversion adapter.

## 40.3 Security tests

Mandatory scenarios:

```text
same tenant + authorized          → allowed
same tenant + unauthorized        → denied
cross tenant                      → denied
unauthorized case                 → denied
unauthorized client               → denied
restricted variable               → denied
unapproved template               → denied
archived template                 → denied
replayed idempotency key          → safe/idempotent
malicious template                → rejected
path traversal                    → rejected
oversized input                   → rejected
```

## 40.4 E2E tests

At minimum:

### Happy path

```text
Create template
→ create version
→ define variables
→ validate
→ submit
→ approve
→ generate DOCX
→ generate PDF
→ secure document available
→ audit records exist
```

### Rejection path

```text
Create version
→ validation failure
→ cannot approve
→ cannot normal-generate
```

### Tenant isolation

```text
Tenant A template
→ Tenant B request
→ HTTP authorization denial
→ no output
→ no leaked metadata
```

### Version reproducibility

```text
Approve V1
→ generate document
→ create V2
→ generate document
→ V1 output remains attributable to V1
```

---

# 41. OpenAPI Documentation

Document all public Phase 19 endpoints.

For every endpoint document:

- authentication requirement;
- permissions;
- request schema;
- response schema;
- validation errors;
- authorization errors;
- idempotency behavior;
- asynchronous job semantics.

This is required by the project's definition of a complete phase. fileciteturn3file0L87-L99

---

# 42. Documentation Deliverables

Create/update:

```text
PHASE19_DOCUMENT_TEMPLATES.md
ADR-19-001-TEMPLATE-MODEL.md
ADR-19-002-TEMPLATE-VERSIONING.md
ADR-19-003-TEMPLATE-AUTHORIZATION.md
ADR-19-004-TEMPLATE-VARIABLE-SYSTEM.md
ADR-19-005-DOCX-RENDERING.md
ADR-19-006-PDF-CONVERSION.md
ADR-19-007-GENERATION-JOBS.md
ADR-19-008-TEMPLATE-APPROVAL.md
```

Also update relevant global documentation:

- `ARCHITECTURE.md`
- `DATABASE.md`
- `API.md`
- `AUTHORIZATION.md`
- `AUTHORIZATION_MATRIX.md`
- `MULTI_TENANCY.md`
- `DATA_CLASSIFICATION.md` where necessary
- `OBSERVABILITY.md`
- `TESTING.md`
- `PHASE_DEPENDENCIES.md`

Only update classifications or global policy where Phase 19 exposes an actual requirement; do not duplicate or redefine existing policy.

---

# 43. Suggested Repository Structure

Adapt names to the existing repository structure, but preserve layer boundaries.

```text
backend/api/src/
  modules/
    templates/
      presentation/
        template.controller.ts
        template-generation.controller.ts
        template-approval.controller.ts
      application/
        commands/
        queries/
        services/
      domain/
        entities/
        value-objects/
        policies/
        ports/
      infrastructure/
        persistence/
        rendering/
        conversion/
        storage/
        queue/

workers/
  template-generation/
  document-conversion/

packages/
  contracts/
  authorization/
  i18n/
```

The exact path must follow the repository's existing conventions.

---

# 44. Implementation Sequence

## Step 1 — Architecture audit

Inspect existing implementations for:

- tenant context;
- RLS;
- authorization;
- document model;
- storage abstraction;
- document security;
- audit;
- outbox;
- BullMQ;
- API conventions;
- i18n;
- observability.

Do not begin by creating duplicate infrastructure.

## Step 2 — Freeze contracts

Freeze:

- Template model;
- TemplateVersion model;
- variable schema;
- lifecycle;
- permissions;
- approval semantics;
- generation request contract;
- error contract.

## Step 3 — Database migration

Implement schema and RLS/constraints/indexes.

Run migration and migration verification.

## Step 4 — Domain/application layer

Implement:

- lifecycle rules;
- versioning;
- variable registry;
- approval policies;
- generation orchestration.

## Step 5 — Authorization integration

Connect to the existing policy engine.

Add security tests before exposing endpoints.

## Step 6 — DOCX adapter

Implement `TemplateRenderer` using `docxtemplater`/`PizZip`.

Add validation and rendering tests.

## Step 7 — PDF conversion worker

Build isolated LibreOffice conversion worker.

Add Arabic/English conversion tests.

## Step 8 — Generation jobs

Connect:

```text
Outbox → BullMQ → Generation Worker → Secure Document Storage
```

## Step 9 — API

Implement `/api/v1` endpoints and OpenAPI documentation.

## Step 10 — Template builder UI

Implement metadata, variables, validation, approval, preview, and generation screens.

## Step 11 — Audit and observability

Add events, metrics, traces, and operational alerts.

## Step 12 — Security verification

Execute cross-tenant, authorization, injection, resource exhaustion, and malicious-file tests.

## Step 13 — E2E and recovery

Run full generation lifecycle and failure/retry/recovery tests.

## Step 14 — Documentation and closure evidence

Update all required documents and produce a Phase 19 evidence report.

---

# 45. Completion Gate

Phase 19 is **NOT COMPLETE** until all of the following are true.

## Functional

- [ ] Template CRUD works.
- [ ] Template variables work.
- [ ] Case data can be resolved safely.
- [ ] Client data can be resolved safely.
- [ ] Template validation works.
- [ ] DOCX generation works.
- [ ] PDF generation works.
- [ ] Template versions are persisted.
- [ ] Version history is visible.
- [ ] Tenant templates work.
- [ ] Approval workflow works.
- [ ] Generation jobs work.
- [ ] Generated documents enter the secure document subsystem.

## Authorization

- [ ] Tenant is derived from authenticated membership.
- [ ] Cross-tenant access is denied.
- [ ] Unauthorized template access is denied.
- [ ] Unauthorized Case/Client data cannot be resolved.
- [ ] Approval requires the correct permission.
- [ ] Generation requires the correct permission.
- [ ] Generated documents retain document-level authorization.
- [ ] No frontend-only authorization exists.

## Versioning

- [ ] Approved versions are immutable.
- [ ] Every generation records the exact version ID.
- [ ] Version history is auditable.
- [ ] Template updates cannot rewrite historical versions.

## Security

- [ ] Malicious template upload is rejected by the secure document pipeline.
- [ ] Path traversal is prevented.
- [ ] Arbitrary code execution is impossible through template syntax.
- [ ] Resource limits exist.
- [ ] PDF conversion is isolated.
- [ ] No public legal-document URLs are used.
- [ ] Sensitive data is absent from ordinary logs.

## Reliability

- [ ] Generation uses durable queued jobs.
- [ ] Outbox and queue semantics are tested.
- [ ] Jobs are idempotent.
- [ ] Retry behavior is bounded.
- [ ] Failed jobs are recoverable.
- [ ] Orphaned outputs can be reconciled.

## Data integrity

- [ ] PostgreSQL constraints are present.
- [ ] Migrations are committed.
- [ ] RLS/tenant enforcement is tested.
- [ ] No destructive modification of approved template versions.

## Localization

- [ ] English templates work.
- [ ] Arabic templates work.
- [ ] RTL DOCX output works.
- [ ] RTL PDF output works.
- [ ] Mixed Arabic/English content works.

## Testing

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Security tests pass.
- [ ] E2E tests pass.
- [ ] No critical/high unresolved Phase 19 security defect remains.

## Documentation/operations

- [ ] OpenAPI is complete.
- [ ] ADRs are complete.
- [ ] Phase documentation is updated.
- [ ] Logs/metrics/traces exist.
- [ ] Operational alerts exist for repeated generation failures.
- [ ] Rollback/mitigation plan exists.

These closure criteria implement the project's general definition of a complete phase in addition to the explicit Phase 19 requirement that templates be tenant-associated and permission-controlled. fileciteturn3file0L87-L99 fileciteturn3file0L763-L786

---

# 46. Rollback / Mitigation Plan

If Phase 19 must be disabled after deployment:

1. Disable template-generation feature flag.
2. Stop new generation requests.
3. Allow/finish or safely cancel in-flight jobs according to job policy.
4. Preserve existing generated documents.
5. Preserve template/version/approval history.
6. Roll back application code if required.
7. Do not roll back a production migration destructively unless the migration policy explicitly supports it.
8. If schema rollback is unsafe, use a forward corrective migration.

Existing legal documents must remain accessible through the existing secure document system.

---

# 47. Explicit Non-Goals

Phase 19 does **not** attempt to implement:

- a full AI document-writing system;
- unrestricted natural-language generation;
- autonomous legal advice;
- arbitrary user code inside templates;
- full document collaboration/editor co-authoring;
- e-signature;
- client portal functionality;
- billing/finance integration beyond future-compatible metadata;
- complete retention/legal-hold implementation;
- external court filing;
- external document-management provider integration unless already required by an existing integration contract.

AI remains optional under the global project architecture and must not become an uncontrolled legal-record writer. fileciteturn3file0L22-L30

---

# 48. Final Locked Phase 19 Stack

```text
Backend
  NestJS

Database
  PostgreSQL
  Prisma

Authentication
  Existing Keycloak/OIDC/session architecture

Authorization
  Existing RBAC + ABAC + resource-level authorization

Tenant isolation
  Authenticated tenant context + PostgreSQL RLS where applicable

Template storage
  Existing secure MinIO/S3 document abstraction

DOCX rendering
  docxtemplater + PizZip

PDF conversion
  LibreOffice headless in isolated worker/container

Async generation
  BullMQ + Redis

Durable eventing
  Existing transactional outbox

Audit
  Existing audit subsystem

Search
  Existing Phase 18 SearchProvider/OpenSearch implementation where applicable

Observability
  Existing logs + metrics + traces + correlation IDs

Localization
  English + Arabic + full RTL/LTR
```

The concrete technologies above are implementation decisions for Phase 19; the authoritative `Plan.txt` itself defines the required capability, scope, outputs, and closure condition, but does not prescribe these particular libraries. The source therefore remains authoritative for requirements while this document supplies the implementation design.

---

# 49. Definition of Done

The final Phase 19 implementation is accepted only when:

```text
Template engine implemented
        AND
Variable system implemented
        AND
Case/Client data resolution is authorization-aware
        AND
Validation implemented
        AND
DOCX generation works
        AND
PDF generation works
        AND
Versioning is immutable/reproducible
        AND
Tenant ownership is enforced
        AND
Approval workflow works
        AND
Generation jobs are durable/idempotent
        AND
Generated documents use secure document infrastructure
        AND
Cross-tenant tests pass
        AND
Security tests pass
        AND
Unit/integration/E2E tests pass
        AND
OpenAPI/documentation complete
        AND
Observability operational
        AND
Rollback/mitigation documented
```

Only then should Phase 19 be considered closed.

---

## Source Reference

Primary source used for this plan:

`Plan.txt` — Revision 2, uploaded in the current conversation.

The source identifies Phase 19 as **Document Templates**, with the objective, required scope, outputs, and closure requirement used as the foundation of this implementation plan. fileciteturn3file0L763-L786
