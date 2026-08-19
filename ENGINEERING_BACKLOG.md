# Engineering Backlog

This backlog turns `Plan.txt` into an execution list. It is organized phase by phase and assumes:

- Every phase is production-grade for its own scope.
- Every phase ships with migrations, tests, docs, logging, and rollback strategy where applicable.
- No phase starts before the previous phase exit criteria are met.

## Cross-cutting rules

- Backend authorization is always authoritative.
- Tenant isolation must be enforced in DB, repository, service, search, cache, job, storage, export, and integration layers.
- No direct provider SDK calls inside domain modules.
- No hardcoded country, court system, case type, workflow, fee model, or document type.
- Every user-facing screen must support empty/loading/error states, responsive layouts, RTL/LTR, and accessibility.
- Every business-critical feature must have automated tests before release.

## Phase 0. Decision freeze

Goal:
- Lock architecture, platform choices, and delivery standards before implementation starts.

Backlog:
- Write and review `PROJECT_REFERENCE.md`.
- Finalize `ARCHITECTURE.md` with module boundaries and layering rules.
- Finalize `DOMAIN_MODEL.md` for identity, tenancy, cases, clients, parties, documents, billing, and integrations.
- Finalize `DATABASE.md` with PostgreSQL strategy, key tables, constraints, and migration policy.
- Finalize `API.md` with `/api/v1`, response formats, error model, pagination, filtering, and idempotency rules.
- Finalize `SECURITY.md`, `AUTHORIZATION.md`, and `MULTI_TENANCY.md`.
- Finalize `AI_ARCHITECTURE.md` and `INTEGRATION_HUB.md`.
- Finalize `TESTING.md`, `DEPLOYMENT.md`, and `ROADMAP.md`.
- Record ADRs for stack, deployment model, cache, queue, storage, and AI boundaries.

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

Exit criteria:
- Application boots locally and in CI.
- Database, Redis, queue, and storage all connect.
- API and frontend both run.
- Tests and CI pass.

## Phase 2. Identity and multi-tenancy

Goal:
- Build authentication, membership, and tenant isolation as the system core.

Backlog:
- Design and migrate `User`, `Membership`, `Tenant`, `Organization`, `Branch`, `Department`, `Role`, `Permission`, `DirectPermission`, and `Denial`.
- Implement login, logout, password reset, password change, and email verification.
- Implement MFA architecture and recovery flow scaffolding.
- Implement session management and device/session tracking.
- Implement tenant selection and membership switching.
- Implement RBAC + ABAC + resource-level authorization engine.
- Add permission cache with explicit invalidation.
- Enforce branch and department restrictions in authorization checks.
- Add login/logout/membership-switch audit events.
- Build backend tests for tenant A vs tenant B access, assigned case access, and branch restrictions.

Exit criteria:
- No tenant leak is possible through API access.
- All tenant isolation tests pass.
- A user with multiple memberships can switch safely.

## Phase 3. Security foundation

Goal:
- Harden the platform before business data is added.

Backlog:
- Implement password hashing and password policy enforcement.
- Implement account lockout and rate limiting.
- Configure CORS, CSRF protection where applicable, and security headers.
- Add input validation and output validation standards.
- Implement refresh token rotation.
- Add security event logging and audit foundation.
- Add secrets management rules for local, staging, and production.
- Add tests for IDOR, privilege escalation, tenant escape, rate-limit bypass, and unauthorized API calls.
- Add secure session invalidation and session revocation flows.
- Add baseline threat modeling notes for critical endpoints.

Exit criteria:
- Security test suite passes.
- No raw secrets in source control.
- Core auth flows are protected against the listed abuse cases.

## Phase 4. Organization configuration and platform administration

Goal:
- Make the platform configurable without code changes.

Backlog:
- Build settings storage and admin APIs for organization, branches, departments, teams, practice areas, case types, case statuses, party roles, court types, document types, task types, fee types, currencies, numbering rules, notification preferences, branding, and localization.
- Add platform administration screens.
- Add subscription model scaffolding.
- Add feature flags service and UI.
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

## Phase 6. Party management

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

## Phase 7. Case management

Goal:
- Build the core matter/case workflow.

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

## Phase 8. Court, jurisdiction, and country legal configuration

Goal:
- Make the product adaptable to multiple legal systems.

Backlog:
- Implement `Country`, `Jurisdiction`, `Court`, `CourtType`, `CourtDepartment`, and external court identifiers.
- Add location and jurisdiction metadata.
- Add country-specific procedure definitions, deadline rules, document types, numbering rules, and local settings.
- Add admin UI for country and jurisdiction configuration.
- Add tests proving country configuration does not require code changes.

Exit criteria:
- A new jurisdiction can be modeled entirely by configuration and extension data.

## Phase 9. Case timeline

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

## Phase 10. Workflow engine

Goal:
- Enable configurable legal workflows per tenant and case type.

Backlog:
- Implement workflow definition model: states, transitions, conditions, actions, approvals, required fields, required documents, notifications, deadlines, webhooks, escalations, and SLA timers.
- Implement workflow execution engine.
- Add manual override authorization rules.
- Add workflow admin UI and APIs.
- Add background actions for automatic tasks and reminders.
- Add tests for transition validity, escalation, and authorization.

Exit criteria:
- Different tenants can run different workflows safely.

## Phase 11. Hearing management and internal calendar

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

## Phase 12. Legal deadline engine

Goal:
- Compute and manage deadlines as a dedicated legal subsystem.

Backlog:
- Implement deadline entity, deadline type, deadline rule, reminder rule, escalation rule, and completion evidence.
- Support fixed, relative, rule-based, manual, and recurring deadlines.
- Implement jurisdiction-based deadline calculation.
- Add reminder and escalation job scheduling.
- Add UI for deadline creation and review.
- Add tests for date calculation and reminder behavior.

Exit criteria:
- Deadline calculation is configurable by jurisdiction and validated by tests.

## Phase 13. Task management

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

## Phase 14. Document management

Goal:
- Build the document system as a first-class legal data store.

Backlog:
- Implement document metadata, type, owner, case/client links, versions, storage object, OCR result pointer, classification, access policy, retention policy, and audit history.
- Add upload, preview, download, replace, share, archive, and versioning flows.
- Implement secure object storage integration through abstraction.
- Add document tagging and search indexing hooks.
- Add document list, detail, version history, and access control UI.
- Add tests for version retention and access enforcement.

Exit criteria:
- Documents are versioned and never overwritten silently.

## Phase 15. Document security

Goal:
- Secure the document pipeline end to end.

Backlog:
- Implement upload validation, file type validation, size validation, content validation, malware scanning, and file hashing.
- Implement signed URL generation and expiration.
- Add download logging and sharing audit.
- Enforce retention and archival rules.
- Add approval status for security-sensitive documents.
- Add tests for blocked file types, malware failures, and expired access.

Exit criteria:
- No public legal-document URLs exist.
- Every file access is controlled and logged.

## Phase 16. OCR pipeline

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

## Phase 17. Search

Goal:
- Deliver permission-aware global and local search.

Backlog:
- Define search abstraction and indexing strategy.
- Index clients, cases, parties, courts, documents, tasks, hearings, deadlines, invoices, and communications.
- Add search filters, sorting, pagination, and relevance handling.
- Add permission checks before result return.
- Add background indexing jobs and reindex flows.
- Add tests for unauthorized search result suppression.

Exit criteria:
- Search never returns cross-tenant or unauthorized data.

## Phase 18. Document templates

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

## Phase 19. Communications

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

## Phase 20. Calendar integrations

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

## Phase 21. Billing, expenses, invoices, payments, finance integration

Goal:
- Make the platform financially usable in production.

Backlog:
- Implement fee models: fixed, hourly, retainer, milestone, discounts, taxes, partial payments, credits, refunds.
- Implement expense capture and invoice linkage.
- Implement invoice lifecycle and payment reconciliation.
- Add payment provider adapters and accounting integration adapters.
- Add outstanding balance and ledger views.
- Add billing, invoice, and payment audit events.
- Add tests for double-charge prevention and payment reconciliation.

Exit criteria:
- Billing and payment records are reliable and traceable.

## Phase 22. Time tracking

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

## Phase 23. Client portal

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

## Phase 24. Reporting engine

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

## Phase 25. Dashboard engine

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

## Phase 26. Import and export

Goal:
- Move data safely in and out of the platform.

Backlog:
- Implement CSV and Excel import pipeline with schema detection, field mapping, validation, preview, approval, and background processing.
- Implement duplicate detection and optional rollback strategy.
- Implement export authorization, filtering, secure temporary storage, controlled download, and audit.
- Add import/export progress views and result reports.
- Add tests for invalid rows, duplicate handling, and authorization.

Exit criteria:
- Import and export run asynchronously and are fully auditable.

## Phase 27. Notifications

Goal:
- Deliver a configurable notification system.

Backlog:
- Implement notification events, rules, user preferences, channels, quiet hours, reminder sequences, and escalations.
- Support in-app, email, SMS, WhatsApp, and push channels.
- Add notification UI for preferences and history.
- Add tests for rule evaluation and quiet-hour suppression.

Exit criteria:
- Notifications honor preferences and permission boundaries.

## Phase 28. Conflict of interest

Goal:
- Support conflict checks before representation begins.

Backlog:
- Implement conflict request, requester, client, parties, related entities, historical matters, search results, reviewer, decision, reason, and audit.
- Add conflict search across relevant entities and historical relationships.
- Add reviewer workflow and decision UI.
- Add tests for mandatory checks and authorization.

Exit criteria:
- Conflict decisions are auditable and permission-controlled.

## Phase 29. Client intake

Goal:
- Convert leads or requests into approved clients/cases.

Backlog:
- Implement intake request, information collection, document collection, conflict check, review, approval, client creation, and case creation flows.
- Add public intake form, secure invitation, and portal intake paths.
- Add conditional questions, file upload, and consent collection.
- Add intake admin UI and workflow hooks.
- Add tests for intake approval and case creation.

Exit criteria:
- Intake can safely become a client and/or case with full audit trail.

## Phase 30. Audit, compliance, data protection, retention, archiving

Goal:
- Make governance, retention, and compliance operational.

Backlog:
- Implement immutable audit events with tenant, user, membership, action, resource type, resource ID, before, after, IP, device, session, correlation ID, and timestamp.
- Add access logs and export logs.
- Implement data classification and retention policies.
- Implement archiving lifecycle and secure deletion where legally permitted.
- Add privacy settings and data subject workflow scaffolding where applicable.
- Add compliance reporting views.
- Add tests for audit immutability and retention enforcement.

Exit criteria:
- Sensitive actions are always auditable and retention policies are enforceable.

## Phase 31. Integration hub

Goal:
- Normalize all external systems behind adapters.

Backlog:
- Implement integration interfaces for email, calendar, SMS, WhatsApp, storage, OCR, search, payment, accounting, and AI.
- Add tenant-level integration configuration and status tracking.
- Store credentials as references, never in clear text.
- Add webhook ingestion and outbound webhook delivery with signature validation, replay protection, timestamp validation, idempotency, and retries.
- Add integration monitoring and error dashboards.
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
- Add human approval gates before any AI output becomes a record.
- Add AI assistant surfaces in the frontend only where useful.
- Add evaluation and safety tests.

Exit criteria:
- AI can assist without bypassing authorization or becoming a legal source of truth.

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

