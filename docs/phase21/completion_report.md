# Phase 21 Completion Report: Billing + Finance

**Date:** 2026-09-05
**Status:** Implemented, statically verified. NOT committed, NOT pushed (owner hold).
**Plan:** `docs/phase21/implementation_plan.md` (owner-approved).

## Delivered

### Backend (`backend/api/src/billing/`, 16 files)
- Errors, validated DTOs (no `any`; `@IsUUID(4, {each:true})` array pattern), operations with 3 permission levels, 9 services, versioned guarded controller, module wired into `app.module.ts`
- Money: `Decimal(19,4)` exact arithmetic, line-level 4dp rounding, discount cap, tax-rate snapshot at issue
- Ledger: balanced-post guard, insert-only (no write endpoints), reversing entries on void
- Idempotency: `@@unique([tenantId, idempotencyKey])` + replay-returns-original
- Invoice lifecycle: DRAFT → ISSUED → PARTIALLY_PAID/PAID; VOID only with zero payments; versioning via supersede chain (payments block it)
- TimeEntry → INVOICED consumption (APPROVED-only, rated-only)
- Credits tracked per invoice via `CreditApplication`; refunds capped at unrefunded remainder
- Timeline: `INVOICE_CREATED` + `PAYMENT_RECEIVED` emitted (closes Phase 10 gap for these types)
- Audit: 9 new events across all 5 registration maps + allowlist
- Permissions: `CanManageBilling`, `CanApproveInvoices`, `CanRecordPayments`; tenant.admin full, tenant.manager approve/record only

### Schema + migration
- 10 models, 5 enums; Tenant/Case/Client/Rate/TimeEntry back-refs; `prisma validate` clean
- Migration `20260908000001_phase21_billing_foundation` (tables + new enums only; `CurrencyCode` not re-created) + FORCE RLS ×10; slice-completeness 0-missing; `migration-rls.spec.ts` extended

### Frontend (`apps/web`)
- `BillingsClient` (19 methods, `/billing` prefix) + 4 contract tests
- `/[locale]/billing` route (compiled), matters-group nav, `billing` i18n namespace (en+ar parity), 9 tabbed sections

## Gates (executed)
| Gate | Result |
|---|---|
| Backend jest (billing) | 6 suites, 15/15 |
| Backend tsc | exit 0 (after client regen) |
| `nest build` | exit 0 |
| Web vitest | 66/66 |
| Web tsc | exit 0 |
| `next build --webpack` | exit 0 (`ƒ /[locale]/billing`) |
| Prettier | clean on all authored files |
| `prisma validate` | valid |

## Explicitly not done (owner side)
- Live `migrate deploy` of `20260908000001` + proof queries (same runbook as Phase 16-19)
- Live flow: draft → issue → partial-pay → paid; idempotency replay; void immutability
- Deferred per plan: real PSP execution, multi-currency invoicing, dunning, ZATCA, PDF rendering
