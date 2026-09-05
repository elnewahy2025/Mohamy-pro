# Phase 21 Tasks — Billing + Finance

- [x] Owner approves this plan (schema + money rules + deferrals)
- [x] Add schema models/enums (§1) + Tenant back-refs + validate
- [x] Wire TimeEntry → INVOICED consumption path
- [x] Scaffold `billing/` module: errors, DTOs, operations, services, controller
- [x] Permissions: `CanManageBilling`, `CanApproveInvoices`, `CanRecordPayments` + matrices
- [x] Timeline emission: `INVOICE_CREATED`, `PAYMENT_RECEIVED`
- [x] Audit events + metadata allowlist + completeness guard
- [x] Finance provider interface (fail-closed) + docs
- [x] Additive migration + RLS + `migration-rls.spec.ts` extension
- [x] Backend specs (ledger balance, idempotency replay, void immutability, supersede, reconciliation)
- [x] Frontend: client + tests + route + nav + i18n + sections
- [x] Gates: tsc ×2, nest build, next build, jest, vitest, prettier
- [ ] Owner live verification (issue → partial-pay → paid; idempotency replay; void immutability)
- [x] Completion report
