# Phase 21 Implementation Plan: Billing + Finance

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` §804–832 (المرحلة 21); existing `Rate`/`TimeEntry`/`CurrencyCode` engine (Phase 20); idempotency infrastructure (Phase 1/2); `CaseTimelineEventType` (`INVOICE_CREATED`, `PAYMENT_RECEIVED` — declared, never emitted).

## User Review Required
> [!IMPORTANT]
> Money is involved. All amounts use the existing `Decimal(19,4)` fixed-precision pattern (no floats, no integer-cents rewrite). The ledger is append-only: corrections are reversing entries, never updates/deletes. Do you approve the schema additions and this plan?

## Objective (Plan.txt)
Make the platform financially usable in production: internal billing ledger, invoice lifecycle, payment reconciliation, expense flow into invoices. Closing conditions: no double-charge/double-payment without protection; transactions immutable (non-destructive); fixed-precision money only.

## 1. Database Schema
### [MODIFY] `backend/api/prisma/schema.prisma`
New tenant-isolated models (all with `tenantId`, Tenant back-refs, `@@index([tenantId, …])`):
- `Fee` (FIXED | HOURLY | RETAINER | MILESTONE kinds; links case/client/rate; amount Decimal)
- `Expense` (case-linked costs flowing into invoices; receipt `storageObjectId`)
- `Invoice` (number unique per tenant; status DRAFT | ISSUED | PARTIALLY_PAID | PAID | VOID | OVERDUE-derived; version int; totals; tax snapshot ref; currency)
- `InvoiceLine` (child of Invoice + version; description, quantity, unitAmount, lineTotal; source refs to Fee/Expense/TimeEntry)
- `Payment` (invoice link; amount; provider reference; idempotency key unique per tenant; status PENDING | SUCCEEDED | FAILED | REFUNDED)
- `Credit` (client balance; applied amount tracked, never negative)
- `Refund` (payment link; amount ≤ remaining refundable; reason)
- `LedgerEntry` (append-only: every invoice issue/payment/refund/credit posts balanced debit/credit lines; `transactionId` groups lines; NO update/delete API)
- `TaxRule` (jurisdiction/name/rate/version — tax calculation versioned, snapshot onto Invoice)
- `ExchangeRate` (from/to currency, rate Decimal(19,8)?, effectiveAt — only if multi-currency invoicing approved; else deferred)
### Enums
`FeeKind`, `InvoiceStatus`, `PaymentStatus`, `LedgerSide` (DEBIT | CREDIT), `CreditStatus`.
### Hard rules
- `TimeEntry.status` → `INVOICED` transition when consumed by an invoice (existing enum value, currently unreachable — wire it).
- Partial unique index: one DRAFT invoice version chain per case billing cycle (or explicit versioning: new `Invoice` row per version with `supersedesId`, old marked SUPERSEDED — preferred, keeps ledger joins simple).
- `Payment.idempotencyKey` `@@unique([tenantId, idempotencyKey])` reusing the global idempotency contract.

## 2. Backend Module
### [NEW] `backend/api/src/billing/`
- `billing.module.ts` (imports DatabaseModule, AuthModule, PermissionsModule)
- `billing.errors.ts` (`BillingNotFoundError`, `BillingInvalidStateError`, `BillingAccessDeniedError`)
- `billing.dto.ts` — validated DTOs for every write (class-validator; `@IsEnum` on Prisma enums; NO `any` bodies — lessons from time-tracking)
- `billing.operations.ts` — `authorize` (SessionGuard context + permission assert) + `run`/`read` (RLS tenant context + audit)
- `fee.service.ts`, `expense.service.ts`, `invoice.service.ts` (totals, versioning, VOID), `payment.service.ts` (idempotent create via key), `credit.service.ts`, `refund.service.ts`, `ledger.service.ts` (balanced-post guard: sum(debits)==sum(credits) else throw), `tax.service.ts`, `reconciliation.service.ts` (match payments↔invoices, outstanding balances)
- `billing.controller.ts` — `@Controller({ path: 'billing', version: '1' })`, `SessionGuard`+`CsrfGuard` on everything (never unguarded, never `v1/…` literal paths)
- `finance-provider.interface.ts` + `finance.integration.ts` docs stub — adapters FAIL CLOSED (`FinanceUnavailableError`), no mock money, ever
### Permissions (least-privilege, manager model from Phase 20 decision)
- `CanManageBilling` (create fees/expenses/draft invoices; tenant.admin; NOT manager)
- `CanApproveInvoices` (issue/void; tenant.admin + tenant.manager)
- `CanRecordPayments` (tenant.admin + tenant.manager)
- Reconcile + matrices only; `ensurePermissionId` creates rows at runtime (no seal migration needed)
### Timeline + audit
- Emit `INVOICE_CREATED` (payload: invoiceNumber, total) and `PAYMENT_RECEIVED` (payload: amount, providerRef) via `CaseTimelineEvent` — closes the Phase 10 declared-but-unemitted gap for these two types
- Audit events: `invoice.issued`, `invoice.voided`, `payment.recorded`, `refund.issued` (+ metadata allowlist + completeness guard)

## 3. Money discipline (non-negotiable)
- `Decimal(19,4)` everywhere (matches Rate/TimeEntry); computed totals in Decimal arithmetic, half-up rounding at line level, documented
- Discounts: line-level amount OR percent (percent resolved to amount at issue time and frozen on the line)
- Taxes: resolved from `TaxRule` version at issue, snapshot `{ruleId, version, rate}` onto Invoice/line — later rule edits never rewrite history
- Retainers/milestones: `Fee` with schedule; milestone release posts ledger entries per release, not at creation
- Outstanding balance = issued − paid − credited per case/client (reconciliation service, covered by spec)

## 4. API Endpoints (all `/api/v1/billing`, paginated lists with page/limit)
- `POST /fees`, `GET /fees?caseId=`; `POST /expenses`, `GET /expenses?caseId=`
- `POST /invoices` (from case: consumes approved TimeEntries → INVOICED, fees, expenses), `GET /invoices?caseId=&status=`, `GET /invoices/:id` (with lines), `POST /invoices/:id/issue`, `POST /invoices/:id/void`, `POST /invoices/:id/version` (supersede)
- `POST /payments` (idempotency-Key header + body key), `GET /payments?invoiceId=`
- `POST /credits`, `POST /credits/:id/apply`, `POST /refunds`
- `GET /ledger?caseId=` (read-only; NO write endpoints by design)
- `GET /balances?caseId=&clientId=` (outstanding)
- `GET/POST /tax-rules`

## 5. Frontend (`apps/web`, same conventions as phases 11–20)
- `BillingsClient` in `lib/api.ts` + `api.test.ts` block (exact-URL assertions; never `/v1/v1`)
- Route `/[locale]/billing` + nav item (matters group) + `billing` i18n namespace (en+ar parity, `messages.test.ts` extended)
- Sections (one file each): `billing-page`, `fee-section`, `expense-section`, `invoice-section` (create from case + totals preview), `invoice-detail-section` (lines, versions, void), `payment-section` (idempotency key field), `credit-refund-section`, `ledger-section` (read-only table), `balance-section`
- Money rendering: fixed 4-decimal display helper, currency code suffix; Arabic locale numerals via `Intl.NumberFormat` (no hardcoded formats)
- `FormSelect` for statuses/kinds; native date inputs for due/effective dates

## 6. Migration + RLS
- Additive migration `20260908000001_phase21_billing_foundation` (naming: next timestamp after `20260908000000`): Prisma-generated tables/enums + FORCE RLS + tenant-isolation policies on every tenant table (Phase 10-15/16-19 precedent)
- Extend `migration-rls.spec.ts` (CREATE TABLE + RLS + FK assertions)

## 7. Verification plan
- `prisma validate`; slice-completeness check (0 missing vs full DDL)
- `tsc --noEmit` (both), `nest build`, `next build --webpack`
- jest: service specs (ledger balance guard, idempotent payment replay, VOID immutability, supersede chain, INVOICED transition, reconciliation math) + adapter specs (fail-closed)
- vitest: client URL/contract tests
- prettier `--check` on touched files; `--write` only authored files
- Live (owner, post-`migrate deploy`): create→issue→partial-pay→paid flow; double-submit same idempotency key → single payment; voided invoice immutable; ledger sums to zero per transaction

## 8. Explicit deferrals (recorded, not silent)
- Real payment-provider charge execution (adapters fail closed; references stored, no money moves)
- Multi-currency invoicing (`ExchangeRate` model lands only if approved — else deferred with model omitted)
- Dunning/late-fee automation, e-invoicing (ZATCA/FATOORAH), payroll
- Frontend PDF invoice rendering (metadata + data only)

## 9. Risks
- Rounding disputes → mitigated by frozen line-level amounts + documented half-up rule
- Double-charge → mitigated by idempotency key unique constraint + header contract + replay spec
- Scope creep into real money movement → blocked by fail-closed adapters + this plan's deferrals
