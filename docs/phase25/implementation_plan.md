# Phase 25 Implementation Plan: Import / Export

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` (المرحلة 25); existing BullMQ worker pattern (OCR/search), idempotency contract, object-storage service, audit maps.

## User Review Required
> [!IMPORTANT]
> CSV is fully implemented; Excel is accepted but explicitly rejected as unsupported until its connector lands (fail-closed, no silent parsing). Exports are allowlist-columned, size-capped, and watermarked. Do you approve?

## Objective (Plan.txt)
Secure, auditable data transfer: import/export jobs, validation reports. Closing: queue-based + idempotent.

## 1. Database Schema
- `ImportJob` (tenantId; entityType CASE|CLIENT|PARTY|TASK; format CSV|XLSX; storageObjectId?; inline `content` Text? for ≤256KB UI pastes; mapping Json; status DRAFT|VALIDATED|APPROVED|RUNNING|COMPLETED|FAILED|ROLLED_BACK; counts; requestedBy; approvedBy?; idempotencyKey unique; resultSummary Json?)
- `ImportRowError` (tenantId; jobId; rowNumber; raw Json?; errors string[]/Json)
- `ExportJob` (tenantId; entityType; filters Json?; format CSV; status QUEUED|RUNNING|COMPLETED|FAILED|EXPIRED; storageObjectId?; rowCount; expiresAt; requestedBy; idempotencyKey unique)
### Enums
`TransferEntity`, `TransferFormat`, `ImportStatus`, `ExportStatus`.
### Hard rules
- Import cap: 1000 rows / 256KB inline; larger requires storageObjectId.
- Export cap: 5000 rows; inputs beyond cap rejected, never truncated silently.
- Exports use per-entity column allowlists (fail-closed); no sensitive tokens/hashes ever leave.
- Duplicates: pre-check (caseNumber unique, client displayName+tenant) recorded as error rows, never silently skipped.
- Rollback deletes created rows by recorded IDs (scoped, audited).
- Approval: approver ≠ requester (two-person rule).

## 2. Backend (`backend/api/src/transfer/`)
- `transfer.errors.ts`, `transfer.dto.ts`, `transfer.operations.ts`, `csv.parser.ts` (in-house RFC-4180 subset, no new deps), `columns.allowlist.ts`, `import.service.ts` (validate → approve → enqueue), `import.worker.ts` (BullMQ `transfer.import` consumer), `export.service.ts` (policy checks, generation with watermark header row, expiry), `transfer.controller.ts` (versioned, guarded), `transfer.module.ts`.
- XLSX input → explicit `UNSUPPORTED_FORMAT` (fail-closed).
- `finance-provider`-style: no external connectors; `TransferConnector` interface documents the future shape (or omit — decided: document in guide comment only).

## 3. Permissions + audit
- `CanManageImports`, `CanManageExports` (tenant.admin; least privilege).
- Audit: `import.validated/approved/completed/rolled_back`, `export.completed` (+ maps + allowlist).

## 4. Frontend
- `TransferClient` + tests; `/[locale]/transfer` route; nav; `transfer` i18n (en+ar); sections: import (paste/file-id + mapping + validate/approve/run), export (entity + download), jobs (status + errors), rollback.

## 5. Migration + RLS
- Additive `20260908000005_phase25_transfer_foundation` + FORCE RLS ×3 + spec extension.

## 6. Verification
- validate; slice-completeness; tsc ×2; nest/next builds; jest (CSV edge cases, caps, duplicates, idempotent replay, rollback correctness, allowlist enforcement, two-person approval); vitest; prettier.
- Live (owner): import 10-row CSV → validate → approve → run → verify rows; duplicate re-import → error rows; export → watermarked CSV download; oversized export rejected.

## 7. Deferrals
XLSX connector, future connectors (API/SFTP), scheduled exports, e-invoicing formats, PDF export.
