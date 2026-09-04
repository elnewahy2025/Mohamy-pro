# Phase 17 Implementation Plan: OCR Pipeline

I have reviewed the `phase17_plan.md` document. It specifies building a queue-backed OCR pipeline with strict separation between machine-generated data and human-approved metadata.

## User Review Required
> [!IMPORTANT]
> The database migration will drop/add tables to the ephemeral schema via Prisma push/migrate, just as in Phase 16. Do I have your approval to modify `schema.prisma` and sync it to the database for Phase 17?

## Proposed Changes

### 1. Database Schema
#### [MODIFY] `backend/api/prisma/schema.prisma`
Add the Phase 17 models with `tenantId` relationships and `FORCE ROW LEVEL SECURITY`:
- `OcrProcessing`
- `OcrPage`
- `OcrEntity`
- `ClassificationResult`
- `HumanReview`
- `ApprovedDocumentMetadata`
- Necessary enums (`OcrProcessingStatus`, `ExtractionMethod`, `ReviewStatus`, etc.)

### 2. Architecture & Adapters
#### [NEW] `backend/api/src/documents/ocr/interfaces/`
- `ocr-provider.interface.ts`
- `document-text-extractor.interface.ts`
- `document-classifier.interface.ts`
- `entity-extractor.interface.ts`

#### [NEW] `backend/api/src/documents/ocr/adapters/`
- `paddle-ocr.adapter.ts`
- `pymupdf-text.extractor.ts`
- `spacy-entity.extractor.ts`

### 3. Business Logic & Queue Workers
#### [NEW] `backend/api/src/documents/ocr/`
- `ocr-processing.service.ts` (Handles routing: Native PDF vs Scanned Image)
- `human-review.service.ts` (Handles approval, rejection, correction)
- `ocr-worker.processor.ts` (BullMQ consumer for `ocr.document.process`)

### 4. API Endpoints
#### [NEW] `backend/api/src/documents/ocr/ocr.controller.ts`
- `POST /documents/:documentId/ocr`
- `GET /documents/:documentId/ocr/:processingId`
- `POST /documents/:documentId/ocr/:processingId/review`
- `POST /documents/:documentId/ocr/:processingId/approve`

## Verification Plan

### Automated Tests
- Run `pnpm exec prisma format` and `pnpm exec nest build`.
- Validate that the queue dependencies and adapters compile successfully.

### Manual Verification
- After compilation, we will verify the Prisma schema is accurately synced without errors.

Click **Proceed** if this aligns with the provided `phase17_plan.md` and I will begin the backend implementation!
