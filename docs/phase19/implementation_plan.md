# Phase 19 Implementation Plan: Document Templates

I have reviewed the `phase19_implementation_plan.md`. The focus is on a tenant-isolated, permission-aware template builder and document generator using BullMQ for asynchronous rendering (via `docxtemplater` to DOCX, and logically to PDF).

## User Review Required
> [!IMPORTANT]
> The database migration will drop/add tables to the ephemeral schema via Prisma push, just as in previous phases. Do I have your approval to modify `schema.prisma` and start scaffolding the Template integrations?
> Note: External systems like LibreOffice or `docxtemplater` native bindings will be abstracted behind mock implementations to establish the backend contracts.

## Proposed Changes

### 1. Database Schema
#### [MODIFY] `backend/api/prisma/schema.prisma`
Add operational tracking tables:
- `Template`
- `TemplateVersion`
- `TemplateVariable`
- `TemplateApproval`
- `DocumentGenerationJob`
- Enums (`TemplateStatus`, `TemplateVersionStatus`, etc.)

### 2. Architecture & Adapters
#### [NEW] `backend/api/src/templates/interfaces/`
- `template-renderer.interface.ts`
- `document-conversion-provider.interface.ts`
- `template-variable-resolver.interface.ts`

#### [NEW] `backend/api/src/templates/adapters/`
- `docx-template.renderer.ts` (Mocked integration for docxtemplater)
- `libreoffice-conversion.provider.ts` (Mocked PDF conversion)

### 3. Business Logic & Queue Workers
#### [NEW] `backend/api/src/templates/`
- `template.service.ts` (Core logic for templates and variables)
- `template-generation.worker.ts` (BullMQ consumer for rendering DOCX/PDF)

### 4. API Endpoints
#### [NEW] `backend/api/src/templates/template.controller.ts`
- `POST/GET/PATCH` for templates, versions, and variables

#### [NEW] `backend/api/src/templates/template-generation.controller.ts`
- `POST /api/v1/templates/:templateId/generate` (dispatches to queue)

## Verification Plan

### Automated Tests
- Run `pnpm exec prisma format` and `pnpm exec nest build`.
- Validate that the template dependencies compile successfully.

### Manual Verification
- Verify the `Prisma` schema is accurately synced without errors.

Click **Proceed** if this aligns with the provided Phase 19 blueprint and I will begin the backend implementation!
