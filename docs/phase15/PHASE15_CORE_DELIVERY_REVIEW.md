# Phase 15 — Document Management (Core Delivery Review)

## Objective
Implement the backend foundation for Document Management from `Plan.txt`, enabling multi-tenant document storage, versioning, metadata tracking, access logging, and sharing.

## Deliverables
- **Data Model**: Appended `Document`, `DocumentVersion`, `DocumentTag`, `DocumentMetadata`, `DocumentShare`, and `DocumentAccess` to `schema.prisma`. 
- **Operations & Logic**: Implemented `DocumentOperations`, `DocumentService`, and `DocumentController` to enforce strict tenant isolation while providing endpoints for uploading documents, creating new document versions, updating statuses, and sharing documents via email.
- **Access Control**: Configured `CAN_MANAGE_DOCUMENTS` in `permission.constants.ts` and granted it to built-in admin roles (via `20260907010000_phase10_15_permission_seal` + `reconcileBuiltInRoles` startup wiring).
- **Audit Logging**: Added events to `audit-constants.ts` to log interactions (`DOCUMENT_UPLOADED`, `DOCUMENT_VERSIONED`, `DOCUMENT_SHARED`, `DOCUMENT_ARCHIVED`, `DOCUMENT_STATUS_CHANGED`) ensuring high compliance standards for legal documents.
- **Remediation**: `createDocument` now verifies `caseId`/`clientId` are visible within the tenant and wires `tenantId` onto nested `DocumentVersion`/`DocumentShare` rows (R2/R3); controller uses `SessionGuard` + `CsrfGuard` (R5); all six document tables have RLS via `20260907000000_phase10_15_rls_isolation` (R2).

## Scope note (R8)
This phase ships **document metadata/CRUD only**. It does **not** yet implement real object-storage upload/download through `ObjectStorageService`, multipart upload endpoints, authorized download streams, or mime/size validation — `storageObjectId` is an unvalidated reference. Real storage wiring is deferred (recorded, not silent) and is security-sensitive; it must be implemented before documents are considered production-ready.

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes cleanly.
- [x] Code is properly formatted using the standard `prettier` rules.
- [x] NestJS unit tests pass for the module (`document.service.spec.ts`).
- [~] Prisma migration (`20260906150000_document_management`) is authored; a live apply is **not** run in this environment (no PostgreSQL available). Migrations are validated statically (`prisma validate`) and by `migration-rls.spec.ts`.
- [x] **Verified gates (2026-09-04, `backend/api`):** `tsc --noEmit` EXIT 0 · `nest build` EXIT 0 · `prettier --check` clean · `prisma validate` valid · full `jest` **60/60 suites / 322/322 tests** EXIT 0 (incl. `document.service.spec.ts` + formerly-failing `oidc-provider` suite).
- [x] The NestJS server (`nest build`) compiles successfully.

## Next Steps
With document structures stored safely, Phase 16 (Document Security) or Phase 17 (OCR Pipeline) can follow.
