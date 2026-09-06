# Phase 25 Completion Report: Import / Export

**Date:** 2026-09-05
**Status:** Implemented, statically verified. NOT committed, NOT pushed (owner hold).
**Plan:** `docs/phase25/implementation_plan.md`.

## Delivered

### Backend (`backend/api/src/transfer/`, 12 files)
- In-house RFC-4180-subset CSV parser (no new deps) + `toCsv` with escaping
- Column allowlists per entity (fail-closed); required-column maps; caps (1000 rows / 256KB inline / 5000 export, never silent truncation)
- Import lifecycle: create (idempotent, XLSX rejected) → validate (row errors recorded, duplicates pre-checked) → approve (two-person rule) → BullMQ worker runs → rollback by recorded IDs
- Export: policy checks, watermarked CSV generation, expiry with EXPIRED transition, controlled re-generation on download
- XLSX/storage-backed paths fail closed with explicit errors
- Permissions: `CanManageImports`, `CanManageExports` (tenant.admin); audit ×5 across all maps

### Schema + migration
- 3 models, 4 enums; `20260908000008_phase25_transfer_foundation` + FORCE RLS ×3 (timestamp collision with G5 resolved by rename); slice verified 0-missing; RLS spec extended

### Frontend (`apps/web`)
- `TransferClient` (11 methods) + 3 contract tests; `/[locale]/transfer` route (compiled); nav; `transfer` i18n (en+ar parity); 3 sections with sign-in prompts

## Gates (executed)
| Gate | Result |
|---|---|
| Backend jest (transfer) | 12/12 |
| Backend tsc | exit 0 (after client regen) |
| `nest build` | exit 0 |
| Web vitest | 90/90 |
| Web tsc | exit 0 |
| `next build --webpack` | exit 0 (`ƒ /[locale]/transfer`) |
| Prettier | clean on authored files |

## Explicitly not done (owner side)
- Live `migrate deploy` + proof queries (same runbook)
- XLSX connector, future connectors, scheduled exports, PDF export
- Live flow: 10-row import → validate → approve → run → rollback; duplicate re-import; oversized export rejection; watermark inspection
