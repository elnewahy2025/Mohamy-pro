# Phase 17 Tasks

- `[x]` Define Phase 17 Enums and Models in `backend/api/prisma/schema.prisma`
- `[x]` Add `tenantId` and `FORCE ROW LEVEL SECURITY` requirements for new tables
- `[x]` Run `npx prisma format` and `db push` to verify schema
- `[x]` Scaffold `documents/ocr` module in `backend/api/src/documents/ocr/`
- `[x]` Define adapter interfaces (`ocr-provider`, `document-text-extractor`, etc.)
- `[x]` Implement PaddleOCR, PyMuPDF, and spaCy service adapters
- `[x]` Implement `OcrProcessingService` (Upload routing)
- `[x]` Implement `HumanReviewService` (Review and approval states)
- `[x]` Implement BullMQ worker (`ocr-worker.processor.ts`)
- `[x]` Add Phase 17 endpoints (`ocr.controller.ts`)
- `[x]` Ensure code is Prettier-clean and tests/build pass
- `[x]` Create final Completion Report walkthrough
