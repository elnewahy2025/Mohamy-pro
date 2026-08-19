# Engineering Backlog

This backlog is the implementation companion to `Plan.txt`. It has been revised to match the dependency model in the architecture review:

- earlier integration contracts
- earlier audit foundation
- earlier backup baseline
- explicit authorization and phase dependency docs
- conflict-check before acceptance
- time tracking before billing
- versioned workflows and deadline rules
- stronger document, search, export, AI, and operations controls

## Cross-cutting rules

- Backend authorization is always authoritative.
- Tenant isolation must be enforced in DB, repository, service, search, cache, job, storage, export, and integration layers.
- No direct provider SDK calls inside domain modules.
- No hardcoded country, court system, case type, workflow, fee model, or document type.
- All money uses fixed precision decimal or integer minor units only.
- Every user-facing screen must support empty/loading/error states, responsive layouts, RTL/LTR, and accessibility.
- Every business-critical feature must have automated tests before release.
- No AI memory is treated as a legal record.
- No public legal-document URLs.

## Phase 0. Decision freeze

Goal:
- Lock the architectural decisions, domain terms, and non-negotiable platform policies before implementation starts.

Backlog:
- Finalize `PROJECT_REFERENCE.md`.
- Finalize `ARCHITECTURE.md` with strict module boundaries and layering rules.
- Finalize `DOMAIN_MODEL.md` with the canonical `Case` model and the tenant/organization/branch/department/team hierarchy.
- Finalize `DATABASE.md` with PostgreSQL strategy, row-level enforcement where appropriate, constraints, and migration policy.
- Finalize `API.md` with `/api/v1`, response formats, error model, pagination, filtering, search, and idempotency rules.
- Finalize `SECURITY.md`, `AUTHORIZATION.md`, and `AUTHORIZATION_MATRIX.md`.
- Finalize `MULTI_TENANCY.md` and `PHASE_DEPENDENCIES.md`.
- Finalize `THREAT_MODEL.md`.
- Finalize `AI_ARCHITECTURE.md`, `INTEGRATION_HUB.md`, and `INTEGRATION_CONTRACTS.md`.
- Finalize `DATA_CLASSIFICATION.md`, `DATA_RESIDENCY.md`, and `PROVIDER_CAPABILITY_MATRIX.md`.
- Finalize `TESTING.md`, `API_COMPATIBILITY.md`, `OBSERVABILITY.md`, `MIGRATION_POLICY.md`, `DEPLOYMENT.md`, and `ROADMAP.md`.
- Record ADRs for stack, deployment model, cache, queue, storage, integration contracts, AI boundaries, and backup baseline.
- Freeze the domain term decision: `Case` is canonical; `Matter` is only an optional UI alias.

Exit criteria:
- All baseline docs approved.
- No feature coding begins before approval.

## Phase 1. Foundation platform

Goal:
- Produce a deployable skeleton that can run in real environments.

Backlog:
- Create the monorepo layout for apps, backend, packages, integrations, ai, infrastructure, docs, and tests.
- Scaffold backend layers: Presentation, API, Application, Domain, Infrastructure.
- Scaffold frontend app shell and shared UI package.
- Add environment configuration and secret loading.
- Add Docker and local compose for PostgreSQL, Redis, queue, and object storage.
- Implement object storage abstraction with a local development adapter.
- Add logging, error handling, and request correlation IDs.
- Add API versioning and OpenAPI generation.
- Add health checks for app, database, Redis, queue, and storage.
- Add CI pipeline for lint, test, build, and migration validation.
- Add baseline unit and integration test harnesses.
- Add initial observability hooks for logs and metrics.
- Define queue standards: naming, priorities, retries, dead-letter queues, deduplication, correlation IDs.
- Add transactional outbox table and dispatcher skeleton.
- Add idempotency registry skeleton.
- Add automated encrypted backup job and restore smoke test.
- Add architecture fitness tests for provider imports, tenant context, and module boundaries.

Exit criteria:
- Application boots locally and in CI.
- Database, Redis, queue, and storage all connect.
- API and frontend both run.
- Tests and CI pass.
- Backup and restore smoke test passes.

## Phase 2. Identity and multi-tenancy

Goal:
- Build authentication, membership, and tenant isolation as the system core.

Backlog:
- Design and migrate `User`, `Membership`, `Tenant`, `Organization`, `Branch`, `Department`, `Team`, `Role`, `Permission`, `DirectPermission`, and `Denial`.
- Implement login, logout, password reset, password change, and email verification.
- Implement MFA architecture and recovery flow scaffolding.
- Implement session management and device/session tracking.
- Implement tenant selection and membership switching.
- Implement RBAC + ABAC + resource-level authorization engine.
- Add permission cache with explicit invalidation.
- Enforce branch and department restrictions in authorization checks.
- Add login/logout/membership-switch audit events.
- Add authorization policy primitives such as `CanViewCase`, `CanDownloadDocument`, and `CanApproveInvoice`.
- Build backend tests for tenant A vs tenant B access, assigned case access, and branch restrictions.

Exit criteria:
- No tenant leak is possible through API access.
- All tenant isolation tests pass.
- A user with multiple memberships can switch safely.

## Phase 3. Security foundation + audit foundation

Goal:
- Harden the platform before business data is added.

Backlog:
- Implement password hashing and password policy enforcement.
- Implement account lockout and rate limiting.
- Configure CORS, CSRF protection where applicable, and security headers.
- Add input validation and output validation standards.
- Implement refresh token rotation.
- Add security event logging and audit foundation.
- Add data classification v1 for documents, exports, AI, and portal access.
- Add secrets management rules for local, staging, and production.
- Add tests for IDOR, privilege escalation, tenant escape, rate-limit bypass, and unauthorized API calls.
- Add secure session invalidation and session revocation flows.
- Add security scanning to CI: SAST, dependency scanning, secret scanning, container scanning, SBOM generation, and license scanning.
- Add baseline threat modeling notes for critical endpoints.

Exit criteria:
- Security test suite passes.
- No raw secrets in source control.
- Core auth flows are protected against the listed abuse cases.
- Audit events exist for authentication, membership, permission, and sensitive access changes.

## Phase 4. Organization configuration and platform administration

Goal:
- Make the platform configurable without code changes.

Backlog:
- Build settings storage and admin APIs for organization, branches, departments, teams, practice areas, case types, case statuses, party roles, court types, document types, task types, fee types, currencies, numbering rules, notification preferences, branding, and localization.
- Add platform administration screens.
- Add subscription model scaffolding.
- Add feature flags service and UI with safe defaults, audit, owner, reason, and expiration.
- Add usage metering model and reporting.
- Add tenant bootstrap and default configuration seeding.
- Add tests to ensure configurations can change without schema or code changes.

Exit criteria:
- A tenant can be configured for a distinct operating model without redeploying code.
- Feature flags and subscription state are visible and enforceable.

## Phase 5. Client management

Goal:
- Deliver a complete client domain.

Backlog:
- Implement individual and organization client types.
- Implement contacts, addresses, identifiers, relationships, tags, notes, and custom fields.
- Add client status, source, consent, data retention status, and portal access flags.
- Add client documents and client communications links.
- Build client list, filters, profile, and timeline views.
- Add client CRUD APIs and validation.
- Add tenant-aware client search.
- Add client audit history.
- Add tests for client lifecycle and authorization.

Exit criteria:
- Clients can be created, updated, searched, and audited end-to-end.
- All client access is tenant-scoped and permission-aware.

## Phase 6. Conflict check foundation

Goal:
- Build conflict checking before any matter/case acceptance.

Backlog:
- Implement conflict request, requester, client, parties, related entities, historical matters, reviewer, decision, reason, and audit.
- Implement search-backed conflict analysis for relevant entities and historical relationships.
- Add acceptance gate so intake cannot proceed until conflict check completes.
- Add reviewer workflow and decision UI/API.
- Add tests for mandatory checks, denial paths, and authorization.

Exit criteria:
- No matter/case can be accepted before the required conflict process completes.

## Phase 7. Party management

Goal:
- Separate legal parties from clients and support arbitrary legal role structures.

Backlog:
- Implement `Party`, `CaseParty`, `PartyRole`, and `PartyRelationship`.
- Support configurable party roles.
- Allow parties to be clients, individuals, organizations, government entities, or other legal entities.
- Add APIs for linking parties to cases and to each other.
- Add tests for non-plaintiff/non-defendant scenarios.

Exit criteria:
- A case can represent arbitrary legal party structures without code changes.

## Phase 8. Matter / Case management

Goal:
- Build the core legal record.

Backlog:
- Implement case identity, case number, internal number, status, priority, open/close dates, and custom fields.
- Link cases to clients, parties, lawyers, teams, courts, jurisdictions, practice areas, and case types.
- Add assignment flows for lawyers and teams.
- Add close, reopen, and archive actions.
- Build case list, case detail, and case timeline surfaces.
- Add case documents, communications, tasks, hearings, deadlines, expenses, fees, invoices, and time entries links.
- Add case audit events for all critical actions.
- Add tests for create/update/assign/close/reopen/archive flows.

Exit criteria:
- A case can be operated as a production matter record from creation to archive.

## Phase 9. Court, jurisdiction, and country legal configuration

Goal:
- Make the product adaptable to multiple legal systems.

Backlog:
- Implement `Country`, `Jurisdiction`, `Court`, `CourtType`, `CourtDepartment`, and external court identifiers.
- Add location and jurisdiction metadata.
- Add country-specific procedure definitions, deadline rule metadata, document types, numbering rules, and local settings.
- Add admin UI for country and jurisdiction configuration.
- Add tests proving country configuration does not require code changes.

Exit criteria:
- A new jurisdiction can be modeled entirely by configuration and extension data.

## Phase 10. Case timeline

Goal:
- Create a unified append-only event timeline.

Backlog:
- Define a timeline event schema with actor, timestamp, correlation ID, resource reference, and event version.
- Publish timeline events for case, client, document, task, hearing, deadline, invoice, payment, note, and workflow actions.
- Build projection/read model for case timeline and client timeline.
- Add audit-friendly event retention policy.
- Add tests for append-only behavior and ordering.

Exit criteria:
- Important events are visible in timeline and cannot be rewritten silently.

## Phase 11. Workflow engine

Goal:
- Enable configurable legal workflows per tenant and case type.

Backlog:
- Implement workflow definition model with states, transitions, conditions, actions, approvals, required fields, required documents, notifications, deadlines, webhooks, escalations, and SLA timers.
- Add workflow versioning with effective-from, effective-to, published-at, and retired-at fields.
- Implement workflow execution engine.
- Add manual override authorization rules.
- Add workflow admin UI and APIs.
- Add background actions for automatic tasks and reminders.
- Add tests for transition validity, version binding, escalation, and authorization.

Exit criteria:
- Different tenants can run different workflows safely.
- Historical executions always reference the exact workflow version used.

## Phase 12. Hearing management and internal calendar

Goal:
- Manage hearings and internal calendar events.

Backlog:
- Implement hearing entity with case, court, date, time, location, assigned lawyer, hearing type, outcome, notes, documents, and next hearing.
- Implement internal calendar events for hearings, meetings, tasks, and deadlines.
- Add calendar permissions and role-based visibility.
- Build hearing list, detail, and scheduling screens.
- Add tests for hearing lifecycle and calendar permissions.

Exit criteria:
- Hearings can be scheduled and reflected in the calendar without authorization leaks.

## Phase 13. Legal deadline engine

Goal:
- Compute and manage deadlines as a dedicated legal subsystem.

Backlog:
- Implement deadline entity, deadline type, deadline rule, rule version, reminder rule, escalation rule, and completion evidence.
- Support fixed, relative, rule-based, manual, and recurring deadlines.
- Implement jurisdiction-based deadline calculation.
- Add reminder and escalation job scheduling.
- Add UI for deadline creation and review.
- Add tests for date calculation, reminder behavior, and rule-version preservation.

Exit criteria:
- Deadline calculation is configurable by jurisdiction and validated by tests.
- Historical deadlines preserve the exact rule version used.

## Phase 14. Task management

Goal:
- Support operational work with task control and escalation.

Backlog:
- Implement tasks, subtasks, checklists, assignments, due dates, priorities, dependencies, recurring tasks, SLAs, and escalation.
- Link tasks to cases, clients, and workflows.
- Add task list, task detail, and assignment UI.
- Add overdue detection and reminder jobs.
- Add tests for task lifecycle and dependency behavior.

Exit criteria:
- Tasks can be created, assigned, escalated, and completed with audit history.

## Phase 15. Document management

Goal:
- Build the document system as a first-class legal data store.

Backlog:
- Implement document metadata, type, owner, case/client links, versions, storage object, OCR result pointer, classification, access policy, retention policy, and audit history.
- Add `DocumentShare` as an explicit entity with permission, expiry, revocation, watermark policy, and audit reference.
- Add upload, preview, download, replace, share, archive, and versioning flows.
- Implement secure object storage integration through abstraction.
- Add document tagging and search indexing hooks.
- Add document list, detail, version history, and access control UI.
- Add tests for version retention and access enforcement.

Exit criteria:
- Documents are versioned and never overwritten silently.

## Phase 16. Document security

Goal:
- Secure the document pipeline end to end.

Backlog:
- Implement upload validation, file type validation, size validation, content validation, malware scanning, and file hashing.
- Implement encryption in transit and at rest.
- Implement key management and key rotation.
- Implement signed URL generation with short TTL, resource binding, tenant binding, and revocation.
- Add download logging and sharing audit.
- Enforce retention and archival rules.
- Add approval status for security-sensitive documents.
- Add tests for blocked file types, malware failures, and expired access.

Exit criteria:
- No public legal-document URLs exist.
- Every file access is controlled and logged.

## Phase 17. OCR pipeline

Goal:
- Extract text and metadata without mixing OCR output with approved data.

Backlog:
- Add OCR job pipeline behind queue workers.
- Implement text extraction, classification, entity extraction, and human review workflow.
- Store OCR output separately from approved metadata.
- Add UI for review and approval.
- Add tests for OCR processing and review status transitions.

Exit criteria:
- OCR runs asynchronously and reviewed data is distinguishable from raw OCR output.

## Phase 18. Search

Goal:
- Deliver permission-aware global and local search.

Backlog:
- Define search abstraction and indexing strategy.
- Treat the search index as sensitive data with tenant, auth, deletion, and retention rules.
- Index clients, cases, parties, courts, documents, tasks, hearings, deadlines, invoices, and communications.
- Add search filters, sorting, pagination, and relevance handling.
- Add permission checks before result return.
- Add background indexing jobs and reindex flows.
- Add tests for unauthorized search result suppression.

Exit criteria:
- Search never returns cross-tenant or unauthorized data.

## Phase 19. Document templates

Goal:
- Produce templated legal documents safely and traceably.

Backlog:
- Implement template model, versions, tenant scoping, variables, and approval flow.
- Support DOCX and PDF generation.
- Add document generation jobs.
- Add template preview and management UI.
- Add tests for variable substitution and version traceability.

Exit criteria:
- Generated documents are traceable to template version and source data.

## Phase 20. Time tracking

Goal:
- Capture billable time accurately and safely.

Backlog:
- Implement timer and manual time entry flows.
- Add billable/non-billable flags, rounding rules, and rates by user/client/case.
- Implement approval workflow.
- Link approved time to billing and invoicing.
- Add timer, entry, and approval UI.
- Add tests for rate application and approval behavior.

Exit criteria:
- Approved time entries can flow cleanly into invoices.

## Phase 21. Billing + finance

Goal:
- Make the platform financially usable in production.

Backlog:
- Implement fee models: fixed, hourly, retainer, milestone, discounts, taxes, partial payments, credits, refunds.
- Implement immutable financial transactions with transaction IDs, idempotency keys, payment provider references, reconciliation states, invoice versions, and tax calculation version.
- Implement expense capture and invoice linkage.
- Implement invoice lifecycle and payment reconciliation.
- Add payment provider adapters and accounting integration adapters.
- Add outstanding balance and ledger views.
- Add billing, invoice, and payment audit events.
- Add tests for double-charge prevention, payment reconciliation, and money precision.

Exit criteria:
- Billing and payment records are reliable and traceable.
- Historical financial corrections are modeled as new compensating transactions.

## Phase 22. Communications

Goal:
- Unify outbound and inbound communications.

Backlog:
- Implement email, phone call, SMS, WhatsApp, internal message, and portal message models.
- Add threading, attachments, delivery status, error tracking, and linking to cases and clients.
- Add consent and opt-in management.
- Add provider adapters only, not provider logic in core modules.
- Add message history views and audit events.
- Add tests for threading and delivery state handling.

Exit criteria:
- Communications are tracked and linked without provider lock-in.

## Phase 23. Calendar integrations

Goal:
- Connect the internal calendar to external providers.

Backlog:
- Implement Google Calendar adapter.
- Implement Microsoft Calendar adapter.
- Add OAuth flow and token refresh handling.
- Implement sync, conflict detection, retry, and webhook handling.
- Add calendar integration admin screens.
- Add audit events for sync activity.
- Add tests for sync conflicts and retries.

Exit criteria:
- Calendar sync is recoverable and tenant-configurable.

## Phase 24. Client portal

Goal:
- Expose a secure client-facing surface.

Backlog:
- Implement portal login and secure invitation flow.
- Show only authorized cases and related documents, hearings, deadlines where allowed, messages, appointments, invoices, and payments.
- Add portal intake entry points where appropriate.
- Add portal-specific permissions and audit logs.
- Add responsive portal UI with RTL/LTR support.
- Add tests for case authorization and tenant isolation.

Exit criteria:
- The client can see only authorized data and perform only authorized actions.

## Phase 25. Import and export

Goal:
- Move data safely in and out of the platform.

Backlog:
- Implement CSV and Excel import pipeline with schema detection, field mapping, validation, preview, approval, and background processing.
- Implement duplicate detection and optional rollback strategy.
- Implement export authorization, filtering, maximum size limits, sensitive-field restrictions, secure temporary storage, controlled download, watermarking where appropriate, expiration, and audit.
- Add import/export progress views and result reports.
- Add tests for invalid rows, duplicate handling, and authorization.

Exit criteria:
- Import and export run asynchronously and are fully auditable.

## Phase 26. Notifications

Goal:
- Deliver a configurable notification system.

Backlog:
- Implement notification events, rules, user preferences, channels, quiet hours, reminder sequences, and escalations.
- Support in-app, email, SMS, WhatsApp, and push channels.
- Add notification UI for preferences and history.
- Add tests for rule evaluation and quiet-hour suppression.

Exit criteria:
- Notifications honor preferences and permission boundaries.

## Phase 27. Reporting

Goal:
- Provide configurable operational and legal reporting.

Backlog:
- Implement report definitions, data sources, fields, filters, grouping, sorting, permissions, date range, and export settings.
- Add saved reports and scheduled reports.
- Add CSV, Excel, and PDF export paths.
- Add report data access checks.
- Add report builder UI.
- Add tests for permission-aware reporting.

Exit criteria:
- Reports respect tenant boundaries and permissions.

## Phase 28. Dashboard

Goal:
- Deliver role-based operational dashboards.

Backlog:
- Implement dashboard layout, widgets, filters, refresh policy, and permissions.
- Build lawyer and manager dashboard presets.
- Add widget data APIs and caching where appropriate.
- Add responsive UI and empty/error states.
- Add tests for widget authorization and rendering.

Exit criteria:
- Dashboards are usable, secure, and localized.

## Phase 29. Client intake

Goal:
- Convert leads or requests into approved clients/cases.

Backlog:
- Implement intake request, information collection, document collection, conflict check, review, approval, client creation, and case creation flows.
- Add public intake form, secure invitation, and portal intake paths.
- Add conditional questions, file upload, consent collection, rate limiting, bot protection, and anti-automation controls.
- Add abuse prevention: no tenant enumeration, no user enumeration.
- Add intake admin UI and workflow hooks.
- Add tests for intake approval, case creation, and conflict gate enforcement.

Exit criteria:
- Intake can safely become a client and/or case with full audit trail.

## Phase 30. Audit, compliance, retention, legal hold

Goal:
- Make governance, retention, and compliance operational.

Backlog:
- Implement immutable audit events with tenant, user, membership, action, resource type, resource ID, before, after, IP, device, session, correlation ID, and timestamp.
- Add access logs and export logs.
- Implement data classification and retention policies.
- Implement archiving lifecycle and secure deletion where legally permitted.
- Add `LegalHold`, `LegalHoldScope`, and `LegalHoldResource`.
- Add privacy settings and data subject workflow scaffolding where applicable.
- Add compliance reporting views.
- Add tests for audit immutability and retention enforcement.

Exit criteria:
- Sensitive actions are always auditable and retention policies are enforceable.
- Legal holds prevent deletion or retention purge of protected records.

## Phase 31. Integration hub completion

Goal:
- Normalize all external systems behind adapters.

Backlog:
- Implement integration interfaces for email, calendar, SMS, WhatsApp, storage, OCR, search, payment, accounting, and AI.
- Add tenant-level integration configuration and status tracking.
- Store credentials as references, never in clear text.
- Add webhook ingestion and outbound webhook delivery with signature validation, replay protection, timestamp validation, idempotency, and retries.
- Add integration monitoring and error dashboards.
- Add provider capability metadata: version, region, limits, auth method, webhook support, retention, status.
- Add tests for adapter failure and retry behavior.

Exit criteria:
- Core modules never depend directly on provider-specific APIs.

## Phase 32. AI layer

Goal:
- Add AI safely as an optional, permission-aware layer.

Backlog:
- Implement AI gateway and orchestration layer.
- Implement prompt, tools, retrieval, policies, memory, provider, and evaluation modules.
- Add permission-aware retrieval and tenant isolation for AI data access.
- Add AI data classification, prompt injection defense, tool authorization, output validation, and human approval gates.
- Add model version tracking, prompt version tracking, RAG source references, and AI request/response/tool-call audit.
- Add AI assistant surfaces in the frontend only where useful.
- Add evaluation and safety tests.

Exit criteria:
- AI can assist without bypassing authorization or becoming a legal source of truth.
- AI memory remains distinct from legal records and case data.

## Phase 33. Operations, backup, and disaster recovery

Goal:
- Make the product supportable in real production conditions.

Backlog:
- Implement automated encrypted backups.
- Add restore testing and documented restore procedures.
- Define RPO and RTO targets.
- Add monitoring dashboards, alerts, log aggregation, and tracing.
- Add incident response and release runbooks.
- Validate environment separation for dev, staging, and production.
- Add operational smoke tests for critical flows.

Exit criteria:
- Restore has been tested successfully.
- Critical operational alerts are in place.

## Release discipline

- Every phase ends with a staging deployment.
- Every phase must include a release note and rollback note.
- Every phase must update docs and tests before merge.
- Every phase must be validated against the non-negotiable rules in `Plan.txt`.

