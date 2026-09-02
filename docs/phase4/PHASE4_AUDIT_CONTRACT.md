# Phase 4 Audit Hook Contract

**Context:** Phase 3 established a strict `AuditEventService` with an outbox emit path and a hardcoded `METADATA_ALLOWLIST` in `backend/api/src/audit/audit-event.service.ts`.

## The Contract

Every single domain mutation introduced in Phase 4 (e.g., creating a legal record, uploading a document, changing a case status) **MUST** adhere to the following contract to be considered compliant with the Security Foundation:

1. **Explicit Event Type Declaration**: The mutation must define a constant event type string (e.g., `case.created`, `document.uploaded`).
2. **Metadata Allowlist Registration**: This new event type **must** be explicitly added to `METADATA_ALLOWLIST` in `audit-event.service.ts`. The allowlist explicitly defines which metadata keys are safe to persist. Any unregistered keys will cause the audit (and thus the transaction) to fail-closed.
3. **Transactional Emission**: The mutation **must** use the `AuditEventService.write(...)` method to emit the event, passing the current Prisma transaction client (`tx`) to ensure the outbox message is atomically committed with the domain data.

*Violation of this contract breaks the Phase 3 audit boundaries and must block any Phase 4 code reviews or approvals.*
