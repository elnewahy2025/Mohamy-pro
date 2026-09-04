from pathlib import Path

plan = r"""# Phase 18 — Search Implementation Plan

## 1. Phase Objective

Implement a production-grade, permission-aware search subsystem across the legal platform.

The authoritative `Plan.txt` defines Phase 18 as:

- Clients
- Cases
- Parties
- Courts
- Documents
- Tasks
- Hearings
- Deadlines
- Invoices
- Communications
- Search index sensitivity model
- Permission-aware search
- Search abstraction

Required outputs:

- indexers/background jobs
- filters, sorting, and pagination
- search API

Mandatory closure conditions:

- No search result may be returned when the caller is not authorized to see it.
- Cross-tenant search is prohibited.

These requirements must be implemented as backend security guarantees, not frontend filtering.

## 2. Architectural Principles

Phase 18 must follow the project's global rules:

- Tenant isolation is enforced server-side.
- Backend authorization is the final authority.
- Search providers are accessed through an adapter/interface.
- `/api/v1` remains the API boundary.
- PostgreSQL remains the source of truth.
- Redis is not the source of truth.
- Schema changes use migrations.
- Commercially important behavior has automated tests.
- Tenant/security/legal-record search paths are auditable where applicable.
- Logs, metrics, traces, and correlation IDs are required.
- English and Arabic are supported.
- RTL/LTR must work throughout the search UI.
- Search must never become an authorization bypass.
- No public legal-document URLs may be introduced.

The existing project conventions for RBAC + ABAC + resource-level authorization + explicit denials remain authoritative.

## 3. Recommended Search Technology

### Primary Search Engine — OpenSearch

Use **OpenSearch** as the concrete search-engine implementation for Phase 18.

Reasons:

- Free and open source.
- Self-hostable.
- Docker-friendly for the current development environment.
- Supports full-text search, analyzers, filters, sorting, highlighting, aliases, and index management.
- Provides a strong path for Arabic and English text.
- Supports separate indexes and aliases for controlled reindexing.
- Can be replaced later through the search abstraction if required.

Development deployment:

```text
OpenSearch
    |
    +-- Docker

The domain/application layer must not depend directly on OpenSearch client APIs.

Search Abstraction

Create:

SearchProvider

with an implementation:

OpenSearchAdapter

Target architecture:

Application
    |
    v
SearchService
    |
    v
SearchProvider
    |
    v
OpenSearchAdapter
    |
    v
OpenSearch

This prevents provider-specific search logic from leaking into the legal domain.

4. Source of Truth vs Search Index

OpenSearch is a derived index, not the authoritative database.

PostgreSQL
    |
    | authoritative data
    v
Transactional Outbox
    |
    v
Indexing Worker
    |
    v
OpenSearch

Never treat the search index as the canonical legal record.

If OpenSearch is lost:

PostgreSQL
    |
    v
Rebuild / Reindex
    |
    v
OpenSearch

All indexing must therefore be replayable.

5. Searchable Domains

Phase 18 must support:

Client
Case
Party
Court
Document
Task
Hearing
Deadline
Invoice
Communication

Each entity requires an explicit search projection.

Do not simply serialize entire database rows into the search index.

Each projection must define:

searchable fields
filterable fields
sortable fields
display fields
sensitive fields
authorization dependencies
tenant scope
entity identifier
source version/update timestamp
6. Search Index Design

Prefer domain-specific indexes rather than one unrestricted index containing arbitrary application data.

Recommended logical indexes:

search-clients-v1
search-cases-v1
search-parties-v1
search-courts-v1
search-documents-v1
search-tasks-v1
search-hearings-v1
search-deadlines-v1
search-invoices-v1
search-communications-v1

Use aliases:

clients-current
cases-current
parties-current
...

This allows zero/minimal-downtime index migration:

old index
    |
    v
new index
    |
    v
validation
    |
    v
alias switch
7. Tenant Partitioning

Every indexed document must contain:

tenantId
entityId
entityType
sourceVersion
updatedAt

For additional defense in depth, authorization metadata should be indexed explicitly.

Example:

{
  "tenantId": "...",
  "entityId": "...",
  "entityType": "CASE",
  "organizationId": "...",
  "branchId": "...",
  "departmentId": "...",
  "visibility": "...",
  "updatedAt": "..."
}

The exact authorization dimensions must follow the existing authorization model.

Never rely on the frontend to add tenantId.

Never accept an arbitrary tenant ID from the user as the security boundary.

Tenant context must come from the authenticated session/membership.

8. Permission-Aware Search — Critical Design

Search authorization must be enforced before results are returned.

The preferred architecture is:

User Request
    |
    v
Authenticated Session
    |
    v
Tenant Context
    |
    v
Search Authorization Scope
    |
    v
Search Query Builder
    |
    v
OpenSearch
    |
    v
Security-filtered results

Do not implement:

OpenSearch -> all results -> filter in frontend

Do not implement:

OpenSearch -> all results -> backend authorization after result disclosure

Sensitive data must not be returned to the application merely to be filtered later if the architecture can enforce the restriction in the query.

9. Authorization Scope Builder

Create a dedicated component:

SearchAuthorizationScopeBuilder

It converts the authenticated context into a safe search scope.

Conceptually:

SearchAuthorizationContext
{
  tenantId
  userId
  membership
  roles
  permissions
  organizationScope
  branchScope
  departmentScope
  teamScope
  explicitDenials
}

The builder produces the allowed search constraints.

Example:

tenantId = authenticatedTenant
AND resource is searchable
AND caller has required permission
AND resource scope is allowed
AND explicit denial does not apply

The exact policy evaluation must reuse existing authorization infrastructure where possible.

Do not create a second incompatible RBAC implementation inside Search.

10. Search Sensitivity Model

Phase 18 explicitly requires a search-index sensitivity model.

Define a field-level classification.

Recommended baseline:

PUBLIC
INTERNAL
CONFIDENTIAL
SENSITIVE
RESTRICTED

The final classification values must align with the project's existing DATA_CLASSIFICATION.md.

Each indexed field should have an explicit sensitivity classification.

Example:

Case.title              -> INTERNAL
Case.caseNumber         -> INTERNAL
Client.name             -> INTERNAL
Client.phone            -> CONFIDENTIAL
Document.ocrText        -> SENSITIVE
Document.content        -> RESTRICTED
Invoice.amount          -> SENSITIVE
Communication.body      -> SENSITIVE

These are examples only. Existing project classification rules are authoritative.

11. Sensitive Search Fields

Do not make every database field searchable.

Create explicit field allowlists.

For example:

Client:
  name
  reference
  email
  phone
  organization

Case:
  caseNumber
  title
  description
  status
  court
  client reference

Document:
  filename
  title
  document type
  OCR text where authorized

Sensitive fields require explicit authorization and sensitivity checks.

12. Document and OCR Search

Phase 18 should consume the outputs of Phase 15–17.

Document search may include:

filename
title
document type
case association
tags
approved metadata
OCR text

OCR text must remain subject to the same document authorization boundary as the source document.

Important:

Document access denied
        |
        v
OCR search result denied

Never expose OCR-derived text from a document the user cannot access.

Machine-generated OCR data must not become an independent authorization path.

13. Search Indexing Pipeline

Use the existing queue infrastructure:

PostgreSQL transaction
       |
       v
Transactional Outbox
       |
       v
Indexing Dispatcher
       |
       v
BullMQ
       |
       v
Search Index Worker
       |
       v
OpenSearch

Do not perform large indexing operations inside normal API transactions.

14. Events to Index

Each searchable entity should emit index lifecycle events when appropriate.

Conceptual events:

SEARCH_ENTITY_CREATED
SEARCH_ENTITY_UPDATED
SEARCH_ENTITY_DELETED
SEARCH_ENTITY_ACCESS_CHANGED
SEARCH_REINDEX_REQUESTED

The existing transactional outbox conventions must be reused.

Events should contain stable identifiers and version information, not unnecessary sensitive payloads.

15. Index Worker Requirements

Workers must be:

idempotent
retryable
observable
tenant-aware
version-aware

A worker should verify that it is not indexing stale data.

Example:

event version = 10
database/current version = 12

=> do not overwrite version 12 with version 10

Use source-version or updated-at guards where appropriate.

16. Deletion and Revocation

When a searchable entity is deleted or becomes inaccessible:

PostgreSQL
    |
    v
Outbox event
    |
    v
Index worker
    |
    v
OpenSearch delete/update

Access revocation must propagate to the index.

Search must never continue returning a resource after its authorization has been revoked merely because the index is stale.

For high-risk resources, authorization should be validated against authoritative application state when required rather than relying solely on a potentially stale index.

17. Reindexing

Provide controlled reindexing.

Required capabilities:

reindex entity type
reindex tenant
reindex date/version range
full rebuild

Never mutate the active index blindly.

Recommended:

search-cases-v1
        |
        | rebuild
        v
search-cases-v2
        |
        | verify
        v
cases-current alias -> v2

Reindexing must preserve tenant and authorization metadata.

18. Search Query Model

Define a provider-independent query model.

Example:

SearchRequest
{
  query
  entityTypes[]
  filters[]
  sort
  page
  pageSize
  fields[]
}

Do not expose OpenSearch DSL directly through the public API.

Bad:

POST /search
{
  "opensearch": { ... }
}

Good:

POST /api/v1/search
{
  "query": "contract",
  "entityTypes": ["CASE", "DOCUMENT"],
  "filters": {
    "status": ["OPEN"]
  },
  "sort": {
    "field": "updatedAt",
    "direction": "desc"
  },
  "page": 1,
  "pageSize": 25
}

The server converts this safe query model into provider-specific syntax.

19. Filtering

Support only explicitly approved filters.

Common filters:

entity type
status
date range
organization
branch
department
assigned user
case
client
court
document type
task status
hearing date
deadline date
invoice status
communication type

Each filter must have:

type validation
authorization validation
sensitivity validation
tenant scoping
20. Sorting

Only allow whitelisted sortable fields.

Example:

createdAt
updatedAt
name
caseNumber
status
dueDate
hearingDate
amount

Do not allow arbitrary field names from clients.

Do not allow sorting by sensitive fields unless explicitly permitted.

21. Pagination

Use stable pagination.

For normal result sets:

page
pageSize

For deep pagination or large result sets, prefer cursor/search-after semantics.

Enforce server-side maximum page size.

Example baseline:

default page size = 25
maximum page size = 100

Exact values may be adjusted after performance testing.

22. Search Result Contract

Return a normalized provider-independent result.

Example:

SearchResult
{
  items: [
    {
      entityType
      entityId
      title
      highlights
      metadata
    }
  ],
  pagination,
  total,
  queryId
}

Never return raw OpenSearch documents.

Never expose:

internal index names
internal field mappings
analyzer details
OpenSearch errors
authorization internals
23. Highlighting

Search results may include safe highlights.

Highlighting must not expose fields the caller is not authorized to see.

For sensitive fields:

unauthorized field
    |
    v
not indexed for caller / not queried / not returned

Do not rely on result redaction after sensitive content has already been retrieved.

24. Arabic and English Search

The platform must support Arabic and English.

OpenSearch analysis must be designed for both languages.

Required evaluation areas:

Arabic normalization
diacritics
Arabic letter variants
Arabic/Latin mixed text
English stemming where appropriate
case normalization
punctuation
whitespace
legal identifiers
Arabic names
transliterated names
exact identifiers such as case numbers

Do not apply aggressive stemming to identifiers.

Maintain separate analyzers/fields where necessary:

title.text
title.keyword
caseNumber.keyword
ocrText.ar
ocrText.en

Exact matching and full-text matching must be separate concerns.

25. Legal Identifier Search

Identifiers such as:

case numbers
client references
document references
invoice numbers

should have exact-match fields.

Example:

caseNumber.keyword
clientReference.keyword
invoiceNumber.keyword

Do not rely exclusively on full-text analysis for legal identifiers.

26. Search Across Multiple Entity Types

The unified search API may search:

Clients
Cases
Parties
Courts
Documents
Tasks
Hearings
Deadlines
Invoices
Communications

The result must always include the entity type.

Example:

CASE       Case 2026/123
DOCUMENT   Power of Attorney.pdf
CLIENT     Ahmed Example
TASK       Review filing

The server must ensure every entity type uses its own authorization scope.

27. API Surface

Proposed endpoints:

POST /api/v1/search
GET  /api/v1/search/suggestions
GET  /api/v1/search/filters

Administrative/internal endpoints may include:

POST /api/v1/admin/search/reindex
GET  /api/v1/admin/search/index-status
POST /api/v1/admin/search/reindex/:entityType

Administrative endpoints require explicit privileged authorization.

Exact routes must be reconciled with existing project API conventions.

28. Search Suggestions

Suggestions must not become an enumeration vulnerability.

Do not reveal:

users
tenants
clients
cases
documents

simply because a prefix matches.

Suggestions must use the same authorization scope as normal search.

Rate-limit suggestion endpoints where appropriate.

29. Enumeration Protection

Search must prevent:

cross-tenant enumeration
unauthorized client enumeration
unauthorized case enumeration
unauthorized document enumeration
user enumeration
tenant enumeration

Do not return different error behavior that leaks existence where the policy requires indistinguishable responses.

30. Security Against Query Abuse

Validate:

query length
page size
filter count
filter values
wildcard usage
regex usage
sort fields
entity type count

Do not expose unrestricted OpenSearch query syntax.

Disable or tightly control expensive query constructs.

Apply request rate limits appropriate to the existing platform.

31. Database Schema

Phase 18 does not require storing the entire search index in PostgreSQL.

However, PostgreSQL may require metadata for:

SearchIndexDefinition
SearchIndexVersion
SearchReindexJob
SearchProjectionVersion

Only add database tables where operational requirements justify persistent state.

If search configuration can safely live in version-controlled application configuration, do not create unnecessary database tables.

All schema changes require Prisma migrations.

32. Search Projection Versioning

Every indexed document should carry a projection version:

projectionVersion = 1

When mappings or projections change:

projection v1
    |
    v2
    |
    v3

Reindex rather than silently mixing incompatible mappings.

33. Consistency Model

Search is eventually consistent.

Document this explicitly.

The system must guarantee:

PostgreSQL remains authoritative.
Outbox events are durable.
Index jobs are retryable.
Failed indexing is observable.
Reindexing is possible.
Authorization revocation is handled safely.
Search does not claim to be a real-time legal record unless the underlying consistency guarantees support that claim.
34. Failure Handling

Safe error codes:

SEARCH_INVALID_QUERY
SEARCH_UNSUPPORTED_ENTITY
SEARCH_INVALID_FILTER
SEARCH_INVALID_SORT
SEARCH_PROVIDER_UNAVAILABLE
SEARCH_INDEX_UNAVAILABLE
SEARCH_TIMEOUT
SEARCH_REINDEX_FAILED
SEARCH_INTERNAL_ERROR

Never expose raw provider exceptions.

Index worker failures must be retryable and visible through operational monitoring.

35. Observability

Structured events should include:

event
queryId
correlationId
tenantId
userId
entityTypes
resultCount
durationMs
provider
status
errorCode

Do not log complete sensitive queries or extracted legal text by default.

Metrics:

search_requests_total
search_failures_total
search_latency
search_result_count
search_provider_errors
index_jobs_total
index_jobs_failed
index_lag
reindex_duration
stale_projection_count
36. Audit

Audit security-sensitive search actions where required by the existing audit model.

At minimum, administrative actions should be auditable:

SEARCH_REINDEX_STARTED
SEARCH_REINDEX_COMPLETED
SEARCH_REINDEX_FAILED
SEARCH_INDEX_CONFIGURATION_CHANGED

For normal search requests, avoid creating excessive audit volume unless the project's security/data-classification policy requires query auditing.

If query auditing is enabled, minimize sensitive content and use a query identifier/reference where possible.

37. Testing Strategy
Unit Tests

Test:

provider-independent query model
authorization scope generation
tenant scoping
sensitivity rules
filter validation
sort validation
pagination
result normalization
query translation
analyzer selection
projection generation
index versioning
Integration Tests

Test:

PostgreSQL projection retrieval
transactional outbox
BullMQ indexing
OpenSearch adapter
index creation
alias switching
reindexing
deletion
update propagation
retry behavior
stale event protection
Security Tests

Mandatory:

same-tenant authorized search -> PASS
same-tenant unauthorized search -> DENY
cross-tenant search -> DENY
document inaccessible -> no document search result
OCR inaccessible -> no OCR-derived result
revoked access -> result disappears/blocked
explicit denial -> DENY
restricted field -> not exposed
admin reindex without permission -> DENY
E2E Tests

Verify:

create searchable client
index client
search client
create case
index case
search case
create document
OCR text becomes searchable after Phase 17 output is indexed
search document/OCR content
task/hearing/deadline search
invoice search
communication search
filters work
sorting works
pagination works
Arabic search works
English search works
mixed Arabic/English search works
cross-tenant search returns no unauthorized result
permission revocation is respected
reindex rebuilds search successfully
provider outage is handled safely
38. Search Security Verification Matrix
Scenario	Expected
User searches own authorized tenant	Results only from allowed scope
User specifies another tenant ID	Ignored/rejected; never changes security scope
User has no access to case	Case absent
User has no access to document	Document absent
User cannot access OCR source document	OCR-derived result absent
User loses access	Search cannot continue exposing resource
User has explicit denial	Denied
Unauthorized admin reindex	403/denied
Authorized admin reindex	Allowed and audited
Empty query	Controlled behavior
Huge query	Validation failure/rate limit
Huge page size	Clamped/rejected
Arbitrary sort field	Rejected
Raw OpenSearch DSL	Rejected
39. Frontend Requirements

The frontend may provide:

search box
entity filters
result grouping
sorting
pagination
highlighting
loading state
empty state
error state
RTL/LTR support
Arabic/English localization
keyboard accessibility

The frontend must not:

implement authorization
decide which tenant is searchable
hide unauthorized results as its primary security mechanism
hardcode permission assumptions
construct provider-specific OpenSearch queries
40. Performance Baseline

Measure:

p50 search latency
p95 search latency
p99 search latency
indexing throughput
indexing lag
reindex throughput
concurrent search behavior

Test realistic data volumes before production claims.

Avoid premature optimization.

The first objective is correctness and security.

41. Operational Deployment

Development:

Windows 11
PowerShell
Docker
PostgreSQL
Redis
OpenSearch

Production deployment must follow the project's deployment strategy.

OpenSearch must not be publicly exposed.

Restrict access through the private network/security boundary.

Protect OpenSearch administrative credentials using the project's secret-management mechanism.

42. Backup / Recovery

Because OpenSearch is derived data:

PostgreSQL = authoritative
OpenSearch = rebuildable

Recovery procedure:

Restore PostgreSQL
        |
        v
Verify source data
        |
        v
Create fresh OpenSearch indexes
        |
        v
Replay/rebuild projections
        |
        v
Validate counts and security
        |
        v
Switch aliases

Do not treat OpenSearch backup as the only recovery mechanism for legal records.

43. Implementation Order
Step 1 — Audit Existing Architecture

Inspect:

Phase 5 Client model
Phase 8 Case model
Phase 7 Party model
Phase 9 Court model
Phase 15 Document model
Phase 14 Task model
Phase 12 Hearing model
Phase 13 Deadline model
Phase 21 Invoice model only if already present
Phase 22 Communication model only if already present
existing tenant context
authorization services/policies
RLS
outbox
BullMQ
audit
observability
data classification
API conventions

Do not implement duplicate security or queue infrastructure.

Step 2 — Freeze Search Contracts

Define:

SearchProvider
SearchRequest
SearchResult
SearchFilter
SearchSort
SearchAuthorizationScope
SearchProjection
Step 3 — Select and Configure OpenSearch

Create the development container/configuration.

Document:

version
memory limits
security configuration
network exposure
credentials
index lifecycle
local setup
Step 4 — Build Search Abstraction

Implement:

SearchService
SearchProvider
OpenSearchAdapter
Step 5 — Build Authorization Scope

Implement:

SearchAuthorizationScopeBuilder

Reuse existing authorization infrastructure.

Step 6 — Build Search Projections

Implement projections for each Phase 18 entity.

Start with:

Client
Case
Party
Court
Document

Then:

Task
Hearing
Deadline
Invoice
Communication

as those domains are available in the repository.

Step 7 — Build Outbox Indexing

Connect entity changes to the existing transactional outbox.

Step 8 — Build BullMQ Index Workers

Implement:

indexing
updates
deletes
retries
stale-event protection
metrics
Step 9 — Build Index Versioning

Implement aliases and controlled reindexing.

Step 10 — Implement Search API

Implement validated provider-independent search requests.

Step 11 — Implement Filters / Sorting / Pagination

Use explicit allowlists.

Step 12 — Implement Arabic/English Analysis

Create and test language-aware mappings/analyzers.

Step 13 — Implement Human-Usable Search Results

Normalize result shapes and safe highlighting.

Step 14 — Implement Administrative Operations

Add protected reindex/status operations.

Step 15 — Security Verification

Run tenant isolation, authorization, sensitivity, revocation, and enumeration tests.

Step 16 — Performance Verification

Run representative search/index workloads.

Step 17 — Documentation

Update:

architecture documentation
search strategy
API documentation
data classification/search sensitivity
deployment documentation
ADRs
testing documentation
44. Recommended ADRs

Create:

docs/phase18/ADR-18-001-OPENSEARCH.md
docs/phase18/ADR-18-002-SEARCH-ABSTRACTION.md
docs/phase18/ADR-18-003-PERMISSION-AWARE-SEARCH.md
docs/phase18/ADR-18-004-SEARCH-SENSITIVITY-MODEL.md
docs/phase18/ADR-18-005-SEARCH-INDEXING-OUTBOX.md
docs/phase18/ADR-18-006-SEARCH-REINDEXING.md
docs/phase18/ADR-18-007-ARABIC-ENGLISH-SEARCH.md

Each ADR should document:

decision
alternatives
security implications
consistency implications
operational implications
rollback/replacement strategy
45. Completion Gate

Phase 18 is CLOSED only when all applicable items pass:

[ ] OpenSearch deployed for development
[ ] SearchProvider abstraction implemented
[ ] OpenSearch adapter implemented
[ ] Client indexing implemented
[ ] Case indexing implemented
[ ] Party indexing implemented
[ ] Court indexing implemented
[ ] Document indexing implemented
[ ] Task indexing implemented
[ ] Hearing indexing implemented
[ ] Deadline indexing implemented
[ ] Invoice indexing implemented
[ ] Communication indexing implemented
[ ] Search sensitivity model implemented
[ ] Permission-aware search implemented
[ ] Cross-tenant search blocked
[ ] Backend authorization enforced
[ ] Sensitive fields protected
[ ] OCR/document search respects document authorization
[ ] Outbox-driven indexing implemented
[ ] BullMQ indexing workers implemented
[ ] Retry behavior implemented
[ ] Stale-event protection implemented
[ ] Delete/revocation propagation implemented
[ ] Index versioning implemented
[ ] Reindexing implemented
[ ] Filters implemented
[ ] Sorting implemented
[ ] Pagination implemented
[ ] Arabic search verified
[ ] English search verified
[ ] Mixed-language search verified
[ ] Exact legal identifier search verified
[ ] Search API documented
[ ] Security tests pass
[ ] Integration tests pass
[ ] E2E tests pass
[ ] Observability implemented
[ ] Administrative search operations audited
[ ] Recovery/rebuild procedure tested
[ ] Rollback/mitigation plan documented
[ ] No critical automated test failures
46. Explicit Non-Goals

Do not:

make OpenSearch the legal source of truth
allow raw OpenSearch DSL from clients
put authorization solely in the frontend
use search-index filtering as a substitute for backend authorization
permit user-supplied tenant IDs to define search scope
index entire database rows without an explicit projection
index sensitive fields without classification
expose OCR text without source-document authorization
expose OpenSearch publicly
use Redis as the search source of truth
perform uncontrolled full reindexing against the active index
silently overwrite newer index projections with stale events
create public URLs for legal documents
claim search is production-ready without tenant/security E2E evidence
47. Final Locked Technology Stack

For the Phase 18 implementation plan, use:

Search Engine       = OpenSearch
Search Abstraction  = SearchProvider
Provider Adapter    = OpenSearchAdapter
Database            = PostgreSQL
ORM                 = Prisma
Queue               = BullMQ
Broker              = Redis
Event Backbone      = Existing Transactional Outbox
Backend             = Existing NestJS
Object Storage      = Existing MinIO/S3 abstraction
Authorization       = Existing RBAC + ABAC + resource authorization
Tenant Isolation    = Existing server-side tenant context + RLS where applicable
Observability        = Existing logs + metrics + traces + correlation IDs
Localization        = English + Arabic, full RTL/LTR
48. Source Alignment

This plan is derived from the uploaded Plan.txt.

Plan.txt places Phase 18 immediately after Phase 17 and defines its purpose as permission-aware platform search. Its required search domains are Clients, Cases, Parties, Courts, Documents, Tasks, Hearings, Deadlines, Invoices, and Communications, together with a search-index sensitivity model, permission-aware search, and a search abstraction. Its required outputs are indexers/background jobs, filters/sorting/pagination, and a search API. The closure requirements explicitly prohibit unauthorized results and cross-tenant search.

The concrete OpenSearch stack in this document is an implementation decision that fills the technology gap while preserving the mandatory provider abstraction and security requirements.
"""

path = Path("/mnt/data/phase18_implementation_plan.md")
path.write_text(plan, encoding="utf-8")
print(path)