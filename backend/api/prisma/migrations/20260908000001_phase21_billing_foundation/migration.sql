-- Phase 21 billing foundation (additive).
--
-- Creates the billing ledger tables (Fee, Expense, Invoice, InvoiceLine,
-- Payment, Credit, CreditApplication, Refund, LedgerEntry, TaxRule) plus new
-- billing enums. Table/enum DDL is the Prisma-generated slice for exactly
-- these models. CurrencyCode already exists (Phase 16-19 migration) and is
-- not re-created.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table. LedgerEntry rows are insert-only at the
-- application layer (no update/delete endpoints exist).

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('FIXED', 'HOURLY', 'RETAINER', 'MILESTONE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('OPEN', 'APPLIED', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "Fee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "kind" "FeeKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "rateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "receiptObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "taxRuleId" TEXT,
    "taxRateSnapshot" DECIMAL(19,4),
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "feeId" TEXT,
    "expenseId" TEXT,
    "timeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "appliedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "status" "CreditStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "caseId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fee_tenantId_caseId_idx" ON "Fee"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "Fee_tenantId_idx" ON "Fee"("tenantId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_caseId_idx" ON "Expense"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_caseId_status_idx" ON "Invoice"("tenantId", "caseId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_version_key" ON "Invoice"("tenantId", "invoiceNumber", "version");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_invoiceId_idx" ON "InvoiceLine"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Credit_tenantId_clientId_idx" ON "Credit"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "CreditApplication_tenantId_invoiceId_idx" ON "CreditApplication"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "CreditApplication_tenantId_creditId_idx" ON "CreditApplication"("tenantId", "creditId");

-- CreateIndex
CREATE INDEX "Refund_tenantId_paymentId_idx" ON "Refund"("tenantId", "paymentId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_transactionId_idx" ON "LedgerEntry"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_caseId_idx" ON "LedgerEntry"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_active_idx" ON "TaxRule"("tenantId", "active");

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "Rate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "Fee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Credit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Credit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Credit_tenant_isolation"
  ON "Credit"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "CreditApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CreditApplication_tenant_isolation"
  ON "CreditApplication"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Expense_tenant_isolation"
  ON "Expense"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Fee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fee" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Fee_tenant_isolation"
  ON "Fee"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Invoice_tenant_isolation"
  ON "Invoice"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InvoiceLine_tenant_isolation"
  ON "InvoiceLine"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "LedgerEntry_tenant_isolation"
  ON "LedgerEntry"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Payment_tenant_isolation"
  ON "Payment"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Refund_tenant_isolation"
  ON "Refund"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TaxRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TaxRule_tenant_isolation"
  ON "TaxRule"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
