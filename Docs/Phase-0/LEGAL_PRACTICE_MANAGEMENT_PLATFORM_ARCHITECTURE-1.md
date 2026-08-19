# Legal Practice Management Platform
## Complete Architecture Reference

Version: 1.0
Date: 2026-08-19
Status: Architecture Baseline

---

## 1. Purpose

This document defines the complete technical and functional architecture for a general-purpose Legal Practice Management Platform.

The platform must serve:

- Individual lawyers
- Small law offices
- Medium law firms
- Large law firms
- Multi-branch firms
- Multi-tenant SaaS deployments
- Different legal specialties
- Different countries and legal systems

The platform must not hardcode:

- A specific lawyer
- A specific law office
- A specific legal specialty
- A specific country
- A specific court system
- A specific case type
- A specific workflow
- A specific document type
- A specific fee model
- A specific external provider
- A specific AI provider

All such behavior must come from configuration, extensions, integrations, or country/legal configuration.

---

# 2. Core Architectural Principles

These principles are mandatory.

1. API-first architecture.
2. Modular monolith as the initial deployment architecture.
3. Strict module boundaries.
4. Domain-driven design principles.
5. Clean separation between Presentation, Application, Domain, and Infrastructure.
6. Multi-tenancy from day one.
7. Tenant isolation enforced server-side.
8. Authorization enforced server-side.
9. RBAC plus ABAC plus resource-level authorization.
10. No business logic in the frontend.
11. No direct database access from controllers.
12. No direct external-provider dependencies inside Domain logic.
13. No direct AI-provider dependencies inside Core business modules.
14. Configuration over hardcoding.
15. Event-driven communication between loosely coupled modules.
16. Background processing for heavy operations.
17. Immutable audit history for security-sensitive operations.
18. API versioning.
19. Database migrations for every schema change.
20. Automated tests for every business-critical feature.
21. Internationalization from the beginning.
22. RTL and LTR support.
23. Accessibility support.
24. Observability from the beginning.
25. Security must be treated as a system-wide concern.
26. AI must remain an optional layer.
27. AI output must never become an official legal record without appropriate human approval.
28. External integrations must use adapters.
29. The system must remain provider-agnostic.
30. The architecture must support future extraction of individual modules into services.

---

# 3. Recommended Architecture Style

Use a Modular Monolith initially.

Do not start with Microservices.

The application should have clear module boundaries so individual modules can later become independent services if scale requires it.

Recommended internal structure:

```text
Presentation
    ↓
API
    ↓
Application
    ↓
Domain
    ↓
Infrastructure
```

External systems:

```text
Core Platform
    ↓
Integration Hub
    ↓
External Providers
```

AI:

```text
Core Platform
    ↓
AI Gateway
    ↓
AI Orchestrator
    ↓
AI Providers / Local Models
```

---

# 4. High-Level System Architecture

```text
                         ┌──────────────────────┐
                         │      Web App         │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Client Portal     │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Mobile Clients    │
                         └──────────┬───────────┘
                                    │
                             API Gateway
                                    │
                         Application Layer
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
    Identity                    Business                    Configuration
    & Access                    Modules                       Modules
        │                           │                           │
        │           ┌───────────────┼───────────────┐           │
        │           │               │               │           │
     Tenant       Clients          Cases         Billing      Settings
        │                           │
        │                   ┌───────┼────────┐
        │                   │       │        │
        │                Hearings  Tasks   Documents
        │
        └──────────────────────┬───────────────────────────────
                               │
                         Domain Events
                               │
                       Integration Hub
                               │
       ┌──────────┬────────────┼───────────┬──────────┐
       │          │            │           │          │
     Email     Calendar      SMS       WhatsApp   Storage
       │          │            │           │          │
       └──────────┴────────────┼───────────┴──────────┘
                               │
                          AI Gateway
                               │
                       AI Orchestrator
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
          Agents              RAG               Tools
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
              OpenAI / Gemini / Claude / Local
```

---

# 5. Repository Structure

Recommended monorepo:

```text
legal-platform/
│
├── apps/
│   ├── web/
│   ├── client-portal/
│   ├── admin-portal/
│   └── mobile/
│
├── backend/
│   ├── api/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── workers/
│   └── migrations/
│
├── packages/
│   ├── shared-types/
│   ├── shared-validation/
│   ├── ui/
│   ├── i18n/
│   └── config/
│
├── integrations/
│   ├── email/
│   ├── calendar/
│   ├── sms/
│   ├── whatsapp/
│   ├── storage/
│   ├── payments/
│   ├── ocr/
│   ├── search/
│   └── ai/
│
├── ai/
│   ├── gateway/
│   ├── orchestration/
│   ├── agents/
│   ├── prompts/
│   ├── tools/
│   ├── retrieval/
│   ├── memory/
│   ├── policies/
│   ├── evaluations/
│   └── providers/
│
├── infrastructure/
│   ├── docker/
│   ├── reverse-proxy/
│   ├── monitoring/
│   ├── deployment/
│   └── backups/
│
├── docs/
│   ├── architecture/
│   ├── domain/
│   ├── database/
│   ├── api/
│   ├── security/
│   ├── authorization/
│   ├── tenancy/
│   ├── documents/
│   ├── workflows/
│   ├── integrations/
│   ├── ai/
│   ├── testing/
│   └── decisions/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── api/
│   ├── security/
│   ├── authorization/
│   ├── tenancy/
│   ├── e2e/
│   ├── performance/
│   └── ai/
│
├── PROJECT_REFERENCE.md
├── ARCHITECTURE.md
├── SECURITY.md
├── DATABASE.md
├── API.md
├── AI_ARCHITECTURE.md
├── TESTING.md
├── DEPLOYMENT.md
└── ROADMAP.md
```

---

# 6. Tenant Architecture

A Tenant represents a law firm, legal office, organization, or SaaS customer.

```text
Platform
├── Tenant A
│   ├── Branches
│   ├── Departments
│   ├── Users
│   ├── Clients
│   └── Cases
│
├── Tenant B
│   ├── Branches
│   ├── Departments
│   ├── Users
│   ├── Clients
│   └── Cases
```

Tenant isolation must exist at every applicable layer:

- Database
- Repository
- Service
- Authorization
- Search
- Cache
- Object storage
- AI retrieval
- Background jobs
- Reports
- Exports
- Integrations

Never trust a tenant ID supplied by the browser.

Derive tenant context from the authenticated membership and server-side authorization context.

---

# 7. Organization Structure

```text
Tenant
└── Organization
    ├── Branch
    │   └── Department
    │       └── Membership
    └── Configuration
```

A tenant must support:

- One branch
- Multiple branches
- Departments
- Teams
- Custom organizational units

---

# 8. Identity Model

Use:

```text
User
└── Membership
    ├── Tenant
    ├── Branch
    ├── Department
    ├── Role
    ├── Direct Permissions
    └── Restrictions
```

A user may have multiple memberships.

Example:

```text
User
├── Membership → Tenant A → Branch 1 → Lawyer
└── Membership → Tenant B → Branch 2 → Consultant
```

Authentication and authorization must remain separate.

---

# 9. Authorization Architecture

Use:

```text
RBAC
+
ABAC
+
Resource-level authorization
+
Tenant isolation
+
Branch restrictions
+
Department restrictions
```

Permission resolution:

```text
User
↓
Membership
↓
Role Permissions
↓
Direct Permissions
↓
Denials
↓
Attribute Rules
↓
Resource Ownership / Assignment
↓
Branch / Department Rules
↓
Effective Permission
```

Example permissions:

```text
case.read
case.create
case.update
case.delete
case.assign
case.close
case.export

client.read
client.create
client.update
client.delete

document.read
document.upload
document.update
document.delete
document.download
document.share

billing.read
billing.create
billing.update
billing.export

user.manage
role.manage
settings.manage
audit.read
```

Frontend permissions only control UI visibility. Backend authorization remains authoritative.

---

# 10. Identity Security

Support:

- Strong password policies
- Password hashing
- MFA
- Recovery flows
- Email verification
- Account lockout
- Rate limiting
- Session management
- Refresh token rotation
- Device/session management
- Login history
- Security event logging
- Optional IP restrictions
- Optional SSO in future
- Optional enterprise identity providers in future

Never store raw passwords or raw long-lived access tokens.

---

# 11. Core Modules

Required modules:

```text
Identity
Tenant Management
Organization
Branch Management
Department Management

Client Management
Contact Management
Party Management

Case Management
Court Management
Hearing Management
Deadline Management

Task Management
Workflow Management

Document Management
Template Management

Calendar Management
Communication Management

Time Tracking
Fees
Expenses
Invoices
Payments
Finance Integration

Reporting
Dashboard
Search

Notification Management

Custom Fields
Custom Forms
Configuration

Audit
Security
Compliance

Subscription
Feature Flags
Usage
Platform Administration

Integration Hub
AI Layer
```

---

# 12. Client Management

Client types must be configurable.

Default categories:

- Individual
- Organization

Client profile:

```text
Client
├── Identity
├── Contact Information
├── Addresses
├── Identifiers
├── Organization Information
├── Contacts
├── Cases
├── Documents
├── Communications
├── Tasks
├── Invoices
├── Payments
├── Expenses
├── Notes
└── Audit History
```

Support:

- Client status
- Client source
- Client tags
- Custom fields
- Client relationships
- Related parties
- Internal notes
- Portal access
- Consent records
- Data retention status

---

# 13. Party Model

Do not assume only plaintiff and defendant.

Use:

```text
Party
CaseParty
PartyRole
PartyRelationship
```

Configurable roles:

```text
Plaintiff
Defendant
Claimant
Respondent
Witness
Expert
Company
Government Entity
Representative
Other
```

A party may be:

- A client
- An individual
- An organization
- A government entity
- Another legal entity

---

# 14. Case Management

Case structure:

```text
Case
├── Case Number
├── Internal Number
├── Case Type
├── Client
├── Parties
├── Lawyers
├── Team
├── Court
├── Jurisdiction
├── Practice Area
├── Status
├── Priority
├── Open Date
├── Close Date
├── Hearings
├── Deadlines
├── Tasks
├── Documents
├── Communications
├── Notes
├── Time Entries
├── Expenses
├── Fees
├── Invoices
├── Workflow
├── Custom Fields
└── Timeline
```

Case types must be configurable.

Practice areas must be configurable.

Do not encode legal specialties into the source code.

---

# 15. Case Timeline

Every important case event should appear in a unified timeline.

Examples:

```text
Case Created
Client Added
Party Added
Document Uploaded
Task Created
Hearing Scheduled
Hearing Completed
Deadline Created
Status Changed
Note Added
Invoice Created
Payment Received
Document Approved
Case Closed
```

Timeline records should be append-oriented and auditable.

---

# 16. Court Architecture

Court data must be configurable.

```text
Country
└── Jurisdiction
    └── Court
        ├── Court Type
        ├── Location
        ├── Department
        └── Configuration
```

Support:

- Multiple countries
- Multiple jurisdictions
- Multiple court types
- Court departments
- Court locations
- External court identifiers

---

# 17. Country and Legal Configuration Layer

The Core must not contain country-specific legal rules.

Use:

```text
Country
├── Legal System
├── Jurisdictions
├── Court Types
├── Practice Areas
├── Case Types
├── Procedure Definitions
├── Deadline Rules
├── Document Types
├── Numbering Rules
├── Templates
└── Local Settings
```

Country-specific logic must live in configuration or dedicated extensions.

---

# 18. Case Workflow Engine

Workflows must be configurable.

```text
Workflow
├── States
├── Transitions
├── Conditions
├── Actions
├── Required Fields
├── Required Documents
├── Notifications
└── Approval Rules
```

Example:

```text
New
↓
Under Review
↓
Documents Required
↓
Ready for Filing
↓
Filed
↓
Hearing
↓
Judgment
↓
Closed
```

Each tenant may configure different workflows.

---

# 19. Workflow Engine Requirements

Support:

- Conditional transitions
- Required fields
- Required documents
- Role-based approvals
- Automatic task creation
- Notifications
- Deadline creation
- Webhooks
- Audit events
- Escalation
- Reassignment
- SLA timers
- Manual overrides with authorization

Every workflow transition must be audited.

---

# 20. Legal Deadline Engine

Deadlines are different from normal calendar events.

```text
Deadline
├── Case
├── Type
├── Source
├── Due Date
├── Priority
├── Status
├── Responsible User
├── Rule
├── Reminder Policy
└── Completion Evidence
```

Support:

- Fixed deadlines
- Relative deadlines
- Rule-based deadlines
- Manual deadlines
- Recurring deadlines
- Escalation
- Multiple reminders
- Completion tracking

Legal deadline calculations must be configurable by jurisdiction and must not be assumed universally.

---

# 21. Calendar

Support:

- Hearings
- Client meetings
- Internal meetings
- Tasks
- Deadlines
- Custom events
- Personal calendars
- Team calendars
- Branch calendars

Integrations:

- Google Calendar
- Microsoft Outlook Calendar
- Internal calendar

Calendar permissions must be enforced.

---

# 22. Task Management

```text
Task
├── Title
├── Description
├── Assignee
├── Creator
├── Case
├── Client
├── Due Date
├── Priority
├── Status
├── Workflow
├── Checklist
├── Attachments
└── Audit
```

Support:

- Personal tasks
- Team tasks
- Recurring tasks
- Dependencies
- Subtasks
- Task templates
- Escalation
- SLA tracking
- Overdue detection

---

# 23. Document Management

Document architecture:

```text
Document
├── Metadata
├── Type
├── Client
├── Case
├── Owner
├── Versions
├── Storage Object
├── OCR Result
├── Classification
├── Access Policy
├── Retention Policy
└── Audit History
```

Required features:

- Upload
- Download
- Preview
- Versioning
- Classification
- Tagging
- Search
- Sharing
- Access control
- Archiving
- Retention
- Templates
- OCR
- Text extraction

---

# 24. Document Versioning

```text
Document
├── Version 1
├── Version 2
├── Version 3
└── Current Version
```

Never silently overwrite historical versions.

Every version should record:

- Creator
- Timestamp
- File hash
- Source
- Change metadata
- Approval status

---

# 25. File Security

File pipeline:

```text
Upload
↓
Authentication
↓
Authorization
↓
File Type Validation
↓
Size Validation
↓
Malware Scan
↓
Content Validation
↓
Object Storage
↓
Metadata Registration
↓
Indexing
```

Legal documents must not use public URLs.

Use controlled access or short-lived signed URLs.

---

# 26. OCR Pipeline

```text
Upload
↓
Virus Scan
↓
Storage
↓
OCR
↓
Text Extraction
↓
Classification
↓
Entity Extraction
↓
Human Review
↓
Approved Metadata
```

OCR output must be distinguishable from human-approved information.

---

# 27. Document Templates

Template engine:

```text
Template
↓
Variables
↓
Entity Data
↓
Validation
↓
Document Generation
↓
PDF / DOCX
```

Example variables:

```text
{{client.full_name}}
{{case.number}}
{{case.court}}
{{lawyer.name}}
{{tenant.name}}
```

Templates must be tenant-specific when required.

---

# 28. Client Intake

Workflow:

```text
Intake Request
↓
Information Collection
↓
Document Collection
↓
Conflict Check
↓
Review
↓
Approval
↓
Client Creation
↓
Case Creation
```

Support:

- Public intake form
- Secure invitation
- Portal intake
- Custom fields
- Conditional questions
- File upload
- Consent
- Conflict check
- Approval workflow

---

# 29. Conflict of Interest

Dedicated module:

```text
Conflict Check
├── Requester
├── Client
├── Parties
├── Related Entities
├── Historical Matters
├── Search Results
├── Reviewer
├── Decision
├── Reason
└── Audit
```

Search must cover configurable relevant entities and historical relationships.

Conflict decisions require authorization and audit history.

---

# 30. Communication Hub

Supported communication types:

```text
Email
Phone Call
SMS
WhatsApp
Internal Message
Client Portal Message
```

Every communication should support linking to:

- Client
- Case
- User
- Task
- Document

Support communication history and permissions.

---

# 31. Email Integration

Use provider adapters.

```text
Email Interface
├── SMTP
├── Gmail
└── Microsoft
```

Features:

- Send
- Receive
- Threading
- Attachments
- Case linking
- Client linking
- Email templates
- Delivery status
- Error tracking

---

# 32. WhatsApp and SMS

Use adapters.

Do not place provider-specific APIs in business modules.

Support:

- Outbound messages
- Inbound messages where supported
- Templates
- Delivery status
- Message history
- Case linking
- Client linking
- Opt-in/consent management
- Provider webhooks

---

# 33. Billing

Separate these concepts:

```text
Fee
Time Entry
Expense
Invoice
Payment
Credit
Refund
```

Support:

- Fixed fees
- Hourly billing
- Retainers
- Milestone fees
- Custom billing models
- Discounts
- Taxes where configured
- Partial payments
- Refunds
- Credits
- Outstanding balances

Do not hardcode one fee model.

---

# 34. Time Tracking

```text
TimeEntry
├── User
├── Case
├── Activity
├── Start
├── End
├── Duration
├── Billing Rate
├── Billable
└── Invoice Status
```

Support:

- Manual entry
- Timer
- Rounding rules
- Billable/non-billable
- Rate by user
- Rate by matter
- Rate by client
- Approval workflow

---

# 35. Expenses

```text
Expense
├── Case
├── Client
├── User
├── Category
├── Amount
├── Currency
├── Date
├── Receipt
├── Billable
└── Approval
```

Expenses may flow into invoices.

---

# 36. Accounting Integration

The legal platform should not become a full accounting system unless explicitly required.

Provide integration interfaces for:

- Accounting systems
- Payment providers
- Banks
- Tax systems where applicable

Keep financial records required by the legal platform internally.

---

# 37. Reporting Engine

Use a configurable Report Builder.

```text
Report Definition
├── Data Source
├── Fields
├── Filters
├── Grouping
├── Sorting
├── Permissions
├── Date Range
└── Export Settings
```

Support:

- Saved reports
- Scheduled reports
- CSV
- Excel
- PDF
- Dashboard widgets

Reports must respect authorization and tenant isolation.

---

# 38. Dashboard Engine

```text
Dashboard
├── Widgets
├── Layout
├── Filters
├── Refresh Policy
└── Permissions
```

Dashboard examples:

Lawyer:

- My cases
- Today's hearings
- Upcoming deadlines
- Overdue tasks
- Recent documents

Manager:

- Firm cases
- Workload
- Revenue
- Outstanding invoices
- Deadlines
- Team performance

---

# 39. Global Search

Search across:

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

Search must enforce authorization before returning results.

Use a dedicated search abstraction.

Possible implementation:

```text
PostgreSQL
+
Search Index
```

The search provider must remain replaceable.

---

# 40. Custom Fields

Architecture:

```text
Entity
↓
Custom Field Definition
↓
Custom Field Value
```

Supported types:

- Text
- Long text
- Number
- Currency
- Date
- Date/time
- Boolean
- Select
- Multi-select
- User
- Client
- Case
- Document
- Relationship

Support:

- Required
- Validation
- Default values
- Visibility
- Conditional rules
- Role restrictions

---

# 41. Custom Forms

```text
Form
├── Sections
├── Fields
├── Validation
├── Conditional Visibility
├── Required Rules
├── Submission Workflow
└── Version
```

Use forms for:

- Client intake
- Case creation
- Conflict checks
- Internal requests
- Custom workflows
- Data collection

---

# 42. Numbering System

Configurable numbering.

Examples:

```text
CASE-2026-00001
CL-2026-00001
INV-2026-00001
DOC-2026-00001
```

Support:

- Tenant-level numbering
- Branch-level numbering
- Entity-specific numbering
- Prefix
- Year
- Sequence
- Reset rules
- Custom formats

Sequence generation must be concurrency-safe.

---

# 43. Notification Engine

```text
Event
↓
Notification Rule
↓
User Preferences
↓
Channel
```

Channels:

- In-app
- Email
- SMS
- WhatsApp
- Push

Support:

- Immediate notifications
- Scheduled notifications
- Reminder sequences
- Escalations
- Quiet hours
- User preferences

---

# 44. Audit System

Audit every security-sensitive and business-critical action.

```text
AuditEvent
├── Tenant
├── User
├── Membership
├── Action
├── Resource Type
├── Resource ID
├── Before
├── After
├── IP
├── Device
├── Session
├── Correlation ID
└── Timestamp
```

Audit records must be append-only to application users.

---

# 45. Security Architecture

Minimum requirements:

- TLS
- Secure authentication
- MFA
- Strong password policy
- Password hashing
- Session controls
- Refresh token rotation
- Rate limiting
- CORS policy
- CSRF protection where applicable
- Input validation
- Output validation
- SQL injection protection
- XSS protection
- Security headers
- File validation
- Malware scanning
- Encryption at rest
- Secrets management
- Tenant isolation
- Authorization enforcement
- Audit logging
- Security event logging
- Backup encryption

Use secure defaults.

---

# 46. Secrets Management

Never store secrets in:

- Source code
- Git
- Frontend bundles
- Database records without appropriate protection

Use environment-specific secret management.

Examples:

```text
Database credentials
JWT secrets
Encryption keys
OAuth secrets
AI provider keys
Storage credentials
Payment credentials
Webhook secrets
```

---

# 47. Data Protection

Support:

- Data classification
- Retention policies
- Archiving
- Secure deletion where legally permitted
- Export
- Access logs
- Consent records where applicable
- Privacy settings
- Data subject workflows where required by the deployment jurisdiction

Legal retention requirements must be configurable by jurisdiction and tenant policy.

---

# 48. Data Retention and Archiving

Case lifecycle:

```text
Active
↓
Closed
↓
Archived
↓
Retention Review
↓
Deletion or Long-Term Archive
```

Retention rules must be configurable.

Never permanently delete records automatically without an appropriate policy and authorization.

---

# 49. Import System

Support:

- CSV
- Excel
- Future connectors

Pipeline:

```text
Upload
↓
Schema Detection
↓
Field Mapping
↓
Validation
↓
Preview
↓
Approval
↓
Background Import
↓
Result Report
```

Provide:

- Error rows
- Validation messages
- Import summary
- Duplicate detection
- Optional rollback strategy

---

# 50. Export System

Exports must respect authorization.

Pipeline:

```text
Export Request
↓
Authorization
↓
Filtering
↓
Background Job
↓
File Generation
↓
Secure Temporary Storage
↓
Controlled Download
↓
Audit
```

---

# 51. Backup and Disaster Recovery

Architecture:

```text
Primary Database
↓
Encrypted Backup
↓
Remote Backup Storage
↓
Retention Policy
```

Requirements:

- Automated backups
- Backup encryption
- Retention policies
- Restore testing
- Disaster recovery procedure
- Recovery Point Objective
- Recovery Time Objective
- Monitoring
- Backup audit

Do not consider a backup successful until restore procedures are tested.

---

# 52. Event-Driven Architecture

Use domain events for decoupling.

Examples:

```text
UserCreated
ClientCreated
CaseCreated
CaseUpdated
CaseClosed
HearingScheduled
HearingCompleted
DeadlineCreated
DeadlineApproaching
TaskCreated
TaskOverdue
DocumentUploaded
DocumentApproved
InvoiceCreated
PaymentReceived
ConflictCheckRequested
ConflictCheckCompleted
```

Events must include:

- Event ID
- Event type
- Tenant ID
- Actor
- Timestamp
- Correlation ID
- Resource reference
- Version

---

# 53. Background Jobs

Use a queue and workers.

```text
API
↓
Queue
↓
Worker
```

Use background processing for:

- OCR
- Document conversion
- PDF generation
- Email
- Notifications
- AI processing
- Search indexing
- Reports
- Imports
- Exports
- Scheduled tasks
- Cleanup
- Backup workflows

Jobs need:

- Retry policy
- Dead-letter handling
- Idempotency
- Monitoring
- Correlation IDs

---

# 54. Integration Hub

All external integrations must use adapters.

```text
Integration Interface
├── Email
├── Calendar
├── SMS
├── WhatsApp
├── Storage
├── OCR
├── Search
├── Payment
├── Accounting
└── AI
```

The Core must not know provider-specific implementation details.

---

# 55. Integration Management

Each tenant should have configurable integrations.

Store:

- Provider
- Status
- Configuration metadata
- Credentials reference
- Permissions
- Webhook status
- Last synchronization
- Error status

Never expose secrets to ordinary users.

---

# 56. Webhooks

Support inbound and outbound webhooks.

Security:

- Signature validation
- Replay protection
- Timestamp validation
- Idempotency
- Event logging
- Retry policy

---

# 57. API Architecture

Use:

```text
/api/v1/
```

Requirements:

- OpenAPI
- Consistent response formats
- Consistent error model
- Pagination
- Filtering
- Sorting
- Search
- Validation
- Idempotency for applicable write operations
- Request IDs
- Correlation IDs
- Rate limits

Future versions:

```text
/api/v2/
```

Do not break v1 contracts silently.

---

# 58. API Error Model

Use structured errors.

Example conceptual structure:

```text
code
message
details
field_errors
request_id
```

Never expose stack traces or internal infrastructure details to users.

---

# 59. Caching

Use Redis for:

- Sessions
- Permission cache
- Tenant configuration
- Reference data
- Rate limiting
- Temporary job state

Cache must never become the source of truth.

Cache invalidation must happen through explicit domain/application events where appropriate.

---

# 60. Database Architecture

Recommended primary database:

```text
PostgreSQL
```

Supporting infrastructure:

```text
PostgreSQL → transactional data
Redis → cache/session/rate limits
Object Storage → documents
Search Index → full-text and metadata search
Queue → background jobs
```

Use relational integrity for core legal and financial data.

---

# 61. Database Design Rules

Every major table should have appropriate fields such as:

```text
id
tenant_id
created_at
updated_at
created_by
updated_by
status
```

Where applicable also use:

```text
branch_id
department_id
version
deleted_at
```

Do not add tenant_id blindly to global platform tables.

Global tables must be explicitly identified.

Use foreign keys, unique constraints, check constraints, indexes, and database-level integrity rules.

---

# 62. Soft Delete Policy

Do not use soft delete everywhere automatically.

Use explicit lifecycle states where possible.

For legally important records:

- Prefer archival
- Preserve audit history
- Restrict deletion
- Require authorization
- Record deletion decisions

For disposable operational data, controlled deletion may be appropriate.

---

# 63. Concurrency

Protect against:

- Duplicate numbering
- Double payments
- Double job execution
- Simultaneous document updates
- Race conditions in workflows
- Duplicate webhook processing

Use:

- Transactions
- Unique constraints
- Idempotency keys
- Optimistic locking where appropriate
- Queue deduplication

---

# 64. Frontend Architecture

The frontend must be modular.

Recommended areas:

```text
Dashboard
Clients
Cases
Hearings
Deadlines
Tasks
Documents
Communications
Calendar
Billing
Reports
Search
Settings
Administration
AI Assistant
```

UI rules:

- No business logic in components
- No direct database access
- No hardcoded authorization assumptions
- No hardcoded translations
- Consistent loading states
- Consistent empty states
- Consistent error states
- Accessible forms
- Keyboard navigation
- RTL/LTR support
- Responsive design

---

# 65. Design System

Use a centralized design system.

Components should include:

- Buttons
- Inputs
- Selects
- Date pickers
- Tables
- Dialogs
- Drawers
- Toasts
- Alerts
- Tabs
- Cards
- Data grids
- Pagination
- File upload
- Timeline
- Calendar
- Charts

All visual tokens must be centralized.

Support:

- Light mode
- Dark mode
- RTL
- LTR
- Accessibility

---

# 66. Internationalization

No hardcoded UI language.
English and Arabic are first-class supported languages.

Use:

```text
t("clients.create")
t("cases.status.active")
```

Support:

- English
- Arabic
- Future languages

Support:

- RTL/LTR
- Date formats
- Number formats
- Currency
- Time zones
- Locale-specific formatting

---

# 67. Accessibility

Target WCAG 2.2 AA where practical.

Requirements:

- Keyboard navigation
- Focus management
- Screen reader labels
- Contrast
- Error identification
- Form accessibility
- Reduced motion support
- Accessible dialogs
- Accessible tables

---

# 68. Client Portal

Client portal must be isolated from staff application.

Client users should see only authorized information.

Features:

- Profile
- Cases
- Case status
- Hearings
- Deadlines where appropriate
- Documents
- Secure uploads
- Messages
- Invoices
- Payments
- Appointments
- Notifications
- Requests
- Intake forms

Never expose internal notes or internal communications unless explicitly configured.

---

# 69. Platform Administration

SaaS-level administration:

```text
Platform Super Admin
├── Tenants
├── Subscriptions
├── Plans
├── Usage
├── Feature Flags
├── System Health
├── Integrations
├── Security Events
└── Platform Audit
```

Platform administration must remain separate from tenant administration.

---

# 70. Super Admin Data Access

Platform administrators must not automatically receive unrestricted access to tenant legal content.

Use:

- Explicit support access
- Just-in-time access
- Time-limited access
- Reason capture
- Audit logging
- Optional approval workflow

---

# 71. Subscription Architecture

Support:

```text
Plan
├── Features
├── User Limits
├── Branch Limits
├── Storage Limits
├── Case Limits
├── AI Limits
└── Usage Policies
```

Feature access must be enforced server-side.

---

# 72. Feature Flags

Examples:

```text
CLIENT_PORTAL
AI_ASSISTANT
OCR
TIME_TRACKING
ADVANCED_REPORTS
WHATSAPP
CALENDAR_SYNC
MULTI_BRANCH
CUSTOM_WORKFLOWS
CUSTOM_FORMS
API_ACCESS
```

Support:

- Global flags
- Plan flags
- Tenant overrides
- User-level rollout where appropriate

---

# 73. AI Architecture

AI must remain outside the Core business domain.

Correct:

```text
Case Service
↓
AI Gateway
↓
AI Orchestrator
↓
AI Provider Adapter
↓
Model
```

Incorrect:

```text
Case Service
↓
OpenAI SDK
```

---

# 74. AI Gateway

Responsibilities:

- Authentication
- Authorization
- Tenant context
- User context
- Capability selection
- Model selection
- Token limits
- Usage limits
- Cost limits
- Data policy
- Logging
- Safety policy
- Provider abstraction

---

# 75. AI Orchestrator

Flow:

```text
User Request
↓
Intent Detection
↓
Authorization
↓
Capability Selection
↓
Agent Selection
↓
Context Building
↓
Tool Selection
↓
Retrieval
↓
Model Execution
↓
Output Validation
↓
Action Authorization
↓
Response
```

---

# 76. AI Agents

Initial agents:

```text
Legal Assistant Agent
Document Analysis Agent
Case Summary Agent
Research Agent
Deadline Assistant Agent
Document Classification Agent
Data Extraction Agent
Drafting Assistant Agent
Reporting Assistant Agent
```

Agents must have narrowly defined capabilities.

---

# 77. AI Tools

Examples:

```text
search_clients
get_client
search_cases
get_case
search_parties
search_documents
read_document
get_hearings
get_deadlines
get_tasks
get_invoices
generate_report
create_task
create_note
prepare_document
```

Every tool must enforce authorization.

AI tools must never query the database directly without passing through authorized application services.

---

# 78. AI Retrieval and RAG

Pipeline:

```text
Document
↓
OCR/Text Extraction
↓
Normalization
↓
Chunking
↓
Metadata
↓
Embedding
↓
Vector Index
```

Query:

```text
User Question
↓
Authorization Filter
↓
Hybrid Retrieval
↓
Relevant Chunks
↓
Context Builder
↓
AI Model
```

Retrieval metadata should include:

```text
tenant_id
branch_id
department_id
case_id
client_id
document_id
access_scope
```

Permission filtering must occur before model context construction.

---

# 79. AI Memory

Separate:

```text
Conversation Memory
Case Context
User Preferences
Tenant Configuration
Knowledge Base
```

Each memory type requires:

- Retention
- Permissions
- Deletion policy
- Audit policy

Do not allow unrestricted persistent AI memory.

---

# 80. AI Provider Abstraction

```text
AIProvider
├── OpenAIProvider
├── GeminiProvider
├── ClaudeProvider
└── LocalModelProvider
```

The Core must never depend on provider-specific SDKs.

---

# 81. AI Prompt Management

Prompts must be versioned.

```text
Prompt
├── Agent
├── Version
├── System Instructions
├── Variables
├── Model Requirements
├── Policy Requirements
└── Evaluation Status
```

Support:

- Versioning
- Rollback
- Testing
- Approval
- Evaluation

---

# 82. AI Guardrails

Flow:

```text
Input
↓
Input Validation
↓
Authorization
↓
Data Policy
↓
Context Filtering
↓
Model
↓
Output Validation
↓
Action Authorization
↓
Human Confirmation where required
↓
Execution
```

High-impact actions should require human confirmation.

Examples:

- Delete records
- Close cases
- Send external messages
- Modify official records
- Issue invoices
- Send documents
- Change permissions

---

# 83. AI Legal Safety Model

The platform must distinguish:

```text
AI Suggestion
Human Approved Content
Official Record
```

AI output should not silently become an official legal record.

For legal research, show:

- Source
- Document
- Relevant excerpt
- Confidence or retrieval information where appropriate
- Date/version where available

Do not present unsupported generated claims as verified legal facts.

---

# 84. AI Privacy

AI requests must follow tenant policy.

Support tenant settings for:

- Allowed providers
- Allowed models
- Data retention
- Training opt-out where supported
- Sensitive data restrictions
- AI feature access
- Maximum usage
- Cost limits

Do not send tenant data to an AI provider unless the tenant's configured policy allows the operation.

---

# 85. AI Observability

Record:

```text
Request ID
Tenant
User
Agent
Model
Provider
Prompt Version
Tool Calls
Input Tokens
Output Tokens
Latency
Cost
Validation Status
Result Status
```

Sensitive content should be minimized in logs.

---

# 86. AI Evaluation

Each agent needs evaluation datasets.

```text
Test Case
├── Input
├── Expected Behavior
├── Expected Criteria
├── Actual Output
├── Score
├── Failure Reason
└── Model/Prompt Version
```

Run evaluations before releasing prompt or model changes.

---

# 87. AI Cost Controls

Support:

- Tenant AI budgets
- User AI budgets
- Per-feature limits
- Token limits
- Daily/monthly limits
- Model routing
- Usage alerts

---

# 88. AI Model Routing

The orchestrator should support policy-based routing.

Example:

```text
Simple extraction → economical model
Complex reasoning → configured reasoning model
Sensitive workflow → approved model
Offline deployment → local model
```

Routing rules must be configurable.

---

# 89. AI Human Review

Support review queues:

```text
AI Generated
↓
Review Required
↓
Human Review
↓
Approved / Rejected
↓
Official Record or Discard
```

Record:

- Reviewer
- Time
- Decision
- Changes
- Source AI output

---

# 90. Search and AI Separation

Search and AI are separate capabilities.

```text
Search Service
    ↓
Structured / Full Text Search

AI Retrieval
    ↓
Permission-Aware Retrieval
    ↓
RAG
```

AI should not replace ordinary deterministic search.

---

# 91. Observability

Required:

```text
Application Logs
Security Logs
Audit Logs
Metrics
Distributed Tracing
Error Tracking
Health Checks
Queue Monitoring
Integration Monitoring
Search Monitoring
AI Monitoring
```

Use correlation IDs throughout the system.

---

# 92. Performance

Design for:

- Pagination
- Lazy loading
- Efficient indexes
- Query optimization
- Background processing
- Caching
- Batch processing
- Async integrations
- Search indexes
- Object storage for large files

Avoid loading large datasets into application memory.

---

# 93. Rate Limiting

Apply limits by:

- IP
- User
- Tenant
- Endpoint
- Integration
- AI feature

Differentiate public endpoints from authenticated endpoints.

---

# 94. API Idempotency

Use idempotency keys for operations such as:

- Payments
- Invoice creation where appropriate
- Webhook processing
- External submissions
- Critical asynchronous commands

---

# 95. Data Integrity

Use:

- Foreign keys
- Unique constraints
- Check constraints
- Transactions
- Optimistic locking where appropriate
- Referential integrity
- Domain validation
- Application validation

Critical financial operations require transactional guarantees.

---

# 96. Testing Strategy

Required levels:

```text
Unit Tests
Integration Tests
API Tests
Authorization Tests
Tenant Isolation Tests
Security Tests
Workflow Tests
Document Tests
Search Tests
AI Tests
E2E Tests
Performance Tests
Migration Tests
Backup/Restore Tests
```

Critical invariant:

```text
Tenant A user
MUST NEVER access
Tenant B data
```

---

# 97. Security Testing

Test:

- Authentication bypass
- Authorization bypass
- Tenant isolation
- IDOR
- Injection
- XSS
- CSRF where applicable
- File upload attacks
- SSRF where applicable
- Rate-limit bypass
- Session abuse
- Token abuse
- Privilege escalation
- Search data leakage
- Export leakage
- AI data leakage

---

# 98. E2E Scenarios

At minimum:

```text
Create Tenant
Create User
Assign Role
Create Client
Create Case
Add Parties
Schedule Hearing
Create Deadline
Upload Document
Create Task
Generate Invoice
Record Payment
Close Case
Archive Case
```

Also test:

```text
User from Tenant A attempts Tenant B access
```

Expected result: denied.

---

# 99. Deployment Architecture

Environments:

```text
Development
Staging
Production
```

Each environment must have separate:

- Database
- Storage
- Redis
- Queue
- Secrets
- External integrations
- AI credentials

Never use production secrets in development.

---

# 100. CI/CD

Pipeline:

```text
Commit
↓
Lint
↓
Type Check
↓
Unit Tests
↓
Integration Tests
↓
Security Checks
↓
Build
↓
Migration Validation
↓
E2E
↓
Deploy Staging
↓
Smoke Tests
↓
Production Approval
↓
Deploy
```

Production migrations require controlled deployment.

---

# 101. Database Migrations

Every schema change requires a migration.

Rules:

- Never edit production schema manually
- Migrations must be versioned
- Migrations must be reversible where practical
- Test migrations against realistic data
- Test rollback strategy
- Include migration validation in CI

---

# 102. Disaster Recovery

Define:

```text
RPO
RTO
Backup Frequency
Retention
Restore Procedure
Failover Procedure
Incident Owner
Communication Procedure
```

Run restore drills.

---

# 103. Incident Management

Create procedures for:

- Security incidents
- Data leakage
- Service outage
- Database failure
- Storage failure
- AI provider outage
- Email provider outage
- Payment provider outage
- Queue failure

The system should degrade gracefully when external integrations fail.

---

# 104. Offline and Provider Failure Strategy

Core business operations should not fail entirely because an external provider is unavailable.

Examples:

```text
AI unavailable
→ Core system continues.

Email unavailable
→ Queue and retry.

Calendar unavailable
→ Internal calendar continues.

OCR unavailable
→ Document remains available.

Search index unavailable
→ Core database remains authoritative.
```

---

# 105. Feature Degradation

External integrations must support states such as:

```text
Connected
Degraded
Disconnected
Error
Reconnecting
Disabled
```

Show actionable status to administrators.

---

# 106. Configuration Management

Tenant configuration should cover:

```text
Organization
Branches
Departments
Users
Roles
Permissions
Case Types
Practice Areas
Case Statuses
Workflows
Courts
Document Types
Custom Fields
Custom Forms
Templates
Numbering
Billing
Currencies
Taxes
Notifications
Integrations
AI Policies
Retention
Security
Branding
Localization
```

---

# 107. Office Branding

Each tenant should configure:

- Logo
- Name
- Address
- Contact details
- Website
- Email
- Phone
- Brand colors
- Document headers
- Document footers
- Invoice branding
- Portal branding

These settings must flow consistently across the application.

---

# 108. Localization

Support:

- Language
- Locale
- Time zone
- Date format
- Time format
- Number format
- Currency
- First day of week
- Week numbering where applicable
- RTL/LTR

---

# 109. Mobile Architecture

Mobile should consume the same API.

Do not create a separate business logic implementation.

```text
Mobile
↓
API
↓
Application
↓
Domain
```

Support future:

- Push notifications
- Offline cache
- Secure device storage
- Biometric unlock where appropriate

Offline changes must use conflict-safe synchronization.

---

# 110. API and Integration Extensibility

Provide:

- REST API
- Webhooks
- API keys for service integrations
- OAuth where appropriate
- Scoped permissions
- Integration-specific audit logs

API clients must have restricted scopes.

---

# 111. Compliance and Governance

Because the platform stores legal information, include architecture for:

- Data classification
- Retention
- Audit
- Access review
- Permission review
- Incident management
- Backup
- Export
- Secure deletion
- Consent where applicable
- Regional data policies

Do not assume one country's compliance rules apply globally.

---

# 112. Multi-Region Readiness

Even if the first deployment is single-region, design identifiers and infrastructure so future regional deployment remains possible.

Potential future structure:

```text
Global Platform
├── Region A
│   └── Tenants
├── Region B
│   └── Tenants
└── Region C
    └── Tenants
```

Region selection must follow tenant configuration and legal requirements.

---

# 113. Security Boundaries

Important boundaries:

```text
Browser
↓
API
↓
Authorization
↓
Application
↓
Domain
↓
Infrastructure
```

External:

```text
Core
↓
Integration Hub
↓
Provider
```

AI:

```text
User
↓
AI Gateway
↓
Authorization
↓
Context
↓
AI
```

Never bypass these boundaries.

---

# 114. Domain Events and Audit Are Different

Domain events:

- Drive application behavior.

Audit events:

- Record what happened.

Do not use audit logs as the primary event bus.

Do not assume every domain event should become a user-visible audit record.

---

# 115. Official Record Model

Legal records should have explicit status:

```text
Draft
Under Review
Approved
Official
Archived
Superseded
```

AI-generated and user-generated content should be distinguishable.

---

# 116. Data Provenance

For important data, track source:

```text
Manual
Imported
OCR
AI Extracted
Integration
System Generated
```

Also track:

- Source record
- Extraction timestamp
- Reviewer
- Approval status

---

# 117. Human Approval Model

Use approval workflows for high-impact actions.

```text
Draft
↓
Review
↓
Approve
↓
Official
```

Support configurable approval requirements.

---

# 118. Document and Record Integrity

Use file hashes and metadata to detect accidental or unauthorized changes.

For critical records, preserve:

- Hash
- Version
- Timestamp
- Actor
- Source
- Approval state

---

# 119. Search Index Security

Search indexing must preserve authorization metadata.

Never build a global unrestricted index and filter only in the frontend.

Required filtering dimensions may include:

```text
tenant_id
branch_id
department_id
role_scope
owner_id
case_id
client_id
access_policy
```

---

# 120. Cache Security

Never use a cache key such as:

```text
case:123
```

without sufficient tenant and authorization context.

Prefer conceptual keys such as:

```text
tenant:{tenant_id}:case:{case_id}
```

Permission-sensitive cached results require careful invalidation.

---

# 121. AI Cache Security

AI responses containing private data must not be globally cached.

AI cache keys must include appropriate tenant and user/security context.

---

# 122. Document Sharing

Support controlled sharing:

```text
Internal
Team
Branch
Client
External
```

External sharing requires:

- Expiration
- Permission scope
- Optional password
- Download restriction where supported
- Audit
- Revocation

---

# 123. Client Portal Security

Use:

- Strong authentication
- MFA where appropriate
- Session expiration
- Secure file access
- Authorization
- Audit
- Rate limiting
- Secure invitation process

Never expose internal office information.

---

# 124. Notifications and Privacy

Notifications should avoid exposing sensitive legal content in insecure channels.

Example:

Prefer:

```text
"You have a new case notification."
```

over including sensitive case details in a notification preview.

Tenant policy should control notification content.

---

# 125. Searchable Sensitive Data

Sensitive fields should have explicit indexing policies.

Not every database field should become searchable.

---

# 126. Logging Privacy

Do not log:

- Passwords
- Access tokens
- API keys
- Full payment credentials
- Unnecessary document contents
- Unnecessary sensitive client information

Use redaction.

---

# 127. Testing Data

Development and test environments must not use production legal data unless a controlled, authorized, properly protected process exists.

Prefer synthetic data.

---

# 128. Development Rules for AI Coding Agents

Any coding agent must:

1. Read `PROJECT_REFERENCE.md`.
2. Read the relevant architecture documents.
3. Inspect the existing repository before modifying code.
4. Preserve existing functionality.
5. Follow module boundaries.
6. Never bypass authorization.
7. Never bypass tenant isolation.
8. Never hardcode tenant configuration.
9. Never hardcode translations.
10. Never connect Core modules directly to external providers.
11. Never connect Core modules directly to AI providers.
12. Use existing abstractions before creating new ones.
13. Add migrations for schema changes.
14. Add tests for every feature.
15. Add authorization tests for security-sensitive features.
16. Add tenant isolation tests for tenant-scoped features.
17. Update documentation after architectural changes.
18. Avoid duplicate implementations.
19. Avoid dead code.
20. Run linting, type checks, tests, and build validation.
21. Never hide errors.
22. Never introduce silent fallbacks that alter business behavior.
23. Never weaken security to make a feature work.
24. Never replace a failing integration with a fake implementation without explicit approval.
25. Report blockers instead of inventing workarounds.

---

# 129. Definition of Done

A feature is not complete until applicable items are satisfied:

```text
Database
Domain
Application
API
Authorization
Tenant Isolation
Validation
Error Handling
Audit
Logging
Tests
Documentation
English and Arabic support with full RTL/LTR behavior
Frontend
Loading State
Empty State
Error State
Accessibility
Security Review
Build
Lint
Type Check
Migration Test
E2E Test
```

---

# 130. Architecture Decision Records

Every major architectural decision should have an ADR.

Examples:

```text
ADR-001 Modular Monolith
ADR-002 PostgreSQL
ADR-003 Multi-Tenant Strategy
ADR-004 Authorization Model
ADR-005 Document Storage
ADR-006 Search Strategy
ADR-007 AI Provider Abstraction
ADR-008 RAG Architecture
ADR-009 Workflow Engine
ADR-010 Event Architecture
```

---

# 131. Documentation Source of Truth

The repository must contain:

```text
PROJECT_REFERENCE.md
ARCHITECTURE.md
DOMAIN_MODEL.md
DATABASE.md
API.md
SECURITY.md
AUTHORIZATION.md
MULTI_TENANCY.md
DOCUMENT_MANAGEMENT.md
WORKFLOW_ENGINE.md
INTEGRATION_HUB.md
AI_ARCHITECTURE.md
TESTING.md
DEPLOYMENT.md
ROADMAP.md
```

Documentation must be updated when architecture changes.

---

# 132. Recommended Implementation Phases

## Phase 0: Foundation

- Repository
- CI/CD
- Environments
- Database
- Configuration
- Logging
- Error handling
- API framework
- Testing framework
- Localization for English and Arabic with full RTL/LTR behavior
- Design system

## Phase 1: Identity and Tenancy

- Authentication
- Users
- Memberships
- Tenants
- Branches
- Departments
- Roles
- Permissions
- Authorization engine
- Audit
- Security events

## Phase 2: Core Legal Management

- Clients
- Parties
- Cases
- Courts
- Practice areas
- Case types
- Case statuses
- Case timeline

## Phase 3: Operational Management

- Hearings
- Calendar
- Deadlines
- Tasks
- Workflows
- Notifications

## Phase 4: Documents

- Document management
- Storage
- Versioning
- OCR
- Templates
- Search
- Document sharing

## Phase 5: Finance

- Fees
- Time tracking
- Expenses
- Invoices
- Payments
- Financial reports

## Phase 6: Client Portal

- Client authentication
- Case access
- Documents
- Messaging
- Appointments
- Invoices
- Intake

## Phase 7: Reporting and Search

- Global search
- Report builder
- Dashboard builder
- Scheduled reports
- Export

## Phase 8: Integration Hub

- Email
- Calendar
- SMS
- WhatsApp
- Storage
- Payments
- Accounting
- Webhooks

## Phase 9: AI

- AI Gateway
- Provider adapters
- AI policies
- Agents
- Tools
- RAG
- Document analysis
- Case summaries
- AI evaluation
- AI observability
- Human approval

## Phase 10: SaaS

- Plans
- Subscriptions
- Usage
- Feature flags
- Tenant billing
- Platform admin

## Phase 11: Scale

- Performance
- Search optimization
- Queue scaling
- Read replicas where required
- Regional deployment
- Service extraction where justified
```

---

# 133. Final Architectural Model

The final system should conceptually follow:

```text
                         USERS
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
     Staff             Clients              Admins
       │                   │                   │
       ▼                   ▼                   ▼
   Web App           Client Portal       Admin Portal
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                      API Gateway
                           │
                  Authentication
                           │
                    Authorization
                           │
                  Application Layer
                           │
 ┌─────────────────────────┼─────────────────────────┐
 │                         │                         │
Identity                Legal Core               Finance
 │                         │                         │
Tenant                  Clients                  Billing
Membership              Cases                    Payments
RBAC/ABAC               Parties                  Expenses
 │                       Hearings                Time
 │                       Deadlines
 │                       Tasks
 │                       Documents
 │                       Workflows
 │
 └─────────────────────────┬─────────────────────────┘
                           │
                     Domain Events
                           │
                  Integration Hub
                           │
       ┌──────────┬────────┼────────┬──────────┐
       │          │        │        │          │
     Email     Calendar   SMS    WhatsApp   Storage
       │          │        │        │          │
       └──────────┴────────┼────────┴──────────┘
                           │
                       AI Gateway
                           │
                    AI Orchestrator
                           │
          ┌────────────────┼────────────────┐
          │                │                │
        Agents            RAG             Tools
          │                │                │
          └────────────────┼────────────────┘
                           │
              OpenAI / Gemini / Claude
                           │
                     Local Models
```

---

# 134. Final Non-Negotiable Rules

```text
1. No hardcoded office.
2. No hardcoded lawyer.
3. No hardcoded legal specialty.
4. No hardcoded country.
5. No hardcoded court system.
6. No hardcoded case workflow.
7. No hardcoded permissions.
8. No hardcoded document types.
9. No hardcoded fee model.
10. No direct AI dependency in Core.
11. No direct external-provider dependency in Domain.
12. No frontend-only authorization.
13. No tenant isolation based only on frontend filtering.
14. No public legal-document URLs.
15. No untracked security-sensitive changes.
16. No untested business-critical features.
17. No production schema changes without migrations.
18. No unrestricted AI access to tenant data.
19. No AI action that bypasses authorization.
20. No automatic conversion of AI output into official records.
21. No production legal data in development/test by default.
22. No secrets in source code.
23. No silent security bypasses.
24. No undocumented architectural changes.
25. No fake integrations presented as completed integrations.
26. No uncontrolled persistent AI memory.
27. No global search that bypasses permissions.
28. No cache that crosses tenant/security boundaries.
29. No external dependency that prevents core operation when unavailable.
30. No architecture decision that prevents future SaaS, mobile, AI, or regional expansion.
```

---

# 135. Architectural Goal

The finished product should behave as a configurable legal operations platform.

The Core should provide stable legal practice capabilities.

Configuration should control office-specific behavior.

Country configuration should control jurisdiction-specific behavior.

Integrations should control external services.

The AI Layer should provide optional intelligence without becoming a dependency of the legal system.

The architecture should support a single lawyer today and a multi-tenant legal SaaS platform later without rewriting the core.
