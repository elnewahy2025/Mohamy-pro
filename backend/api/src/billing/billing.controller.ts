import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import {
  BILLING_INVOICE_PERMISSION,
  BILLING_MANAGE_PERMISSION,
  BILLING_PAYMENT_PERMISSION,
  BillingOperations,
} from './billing.operations';
import {
  ApplyCreditDto,
  CreateCreditDto,
  CreateExpenseDto,
  CreateFeeDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateRefundDto,
  CreateTaxRuleDto,
} from './billing.dto';
import { FeeService } from './fee.service';
import { ExpenseService } from './expense.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { CreditService } from './credit.service';
import { RefundService } from './refund.service';
import { TaxService } from './tax.service';
import { ReconciliationService } from './reconciliation.service';

@Controller({
  path: 'billing',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class BillingController {
  constructor(
    private readonly operations: BillingOperations,
    private readonly fees: FeeService,
    private readonly expenses: ExpenseService,
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly credits: CreditService,
    private readonly refunds: RefundService,
    private readonly taxes: TaxService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Post('fees')
  async createFee(@Req() request: Request, @Body() dto: CreateFeeDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.FEE_CREATED,
      'Fee',
      (tx) => this.fees.create(tx, ctx.tenantId, dto),
      { caseId: dto.caseId },
    );
  }

  @Get('fees')
  async listFees(@Req() request: Request, @Query('caseId') caseId?: string) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.fees.list(tx, ctx.tenantId, caseId),
    );
  }

  @Post('expenses')
  async createExpense(@Req() request: Request, @Body() dto: CreateExpenseDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.EXPENSE_CREATED,
      'Expense',
      (tx) => this.expenses.create(tx, ctx.tenantId, dto),
      { caseId: dto.caseId },
    );
  }

  @Get('expenses')
  async listExpenses(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.expenses.list(tx, ctx.tenantId, caseId),
    );
  }

  @Post('invoices')
  async createInvoice(@Req() request: Request, @Body() dto: CreateInvoiceDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INVOICE_DRAFTED,
      'Invoice',
      (tx) =>
        this.invoices.create(
          tx,
          ctx.tenantId,
          ctx.userId,
          ctx.actorMembershipId,
          dto,
        ),
      { invoiceNumber: dto.invoiceNumber },
    );
  }

  @Get('invoices')
  async listInvoices(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
    @Query('status') status?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.invoices.list(tx, ctx.tenantId, { caseId, status }),
    );
  }

  @Get('invoices/:id')
  async getInvoice(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.invoices.get(tx, ctx.tenantId, id),
    );
  }

  @Post('invoices/:id/issue')
  async issueInvoice(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_INVOICE_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INVOICE_ISSUED,
      'Invoice',
      (tx) =>
        this.invoices.issue(
          tx,
          ctx.tenantId,
          ctx.userId,
          ctx.actorMembershipId,
          id,
        ),
      {},
      BILLING_INVOICE_PERMISSION,
    );
  }

  @Post('invoices/:id/void')
  async voidInvoice(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_INVOICE_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INVOICE_VOIDED,
      'Invoice',
      (tx) => this.invoices.void(tx, ctx.tenantId, id),
      {},
      BILLING_INVOICE_PERMISSION,
    );
  }

  @Post('invoices/:id/version')
  async versionInvoice(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_INVOICE_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INVOICE_DRAFTED,
      'Invoice',
      (tx) => this.invoices.newVersion(tx, ctx.tenantId, id),
      {},
      BILLING_INVOICE_PERMISSION,
    );
  }

  @Post('payments')
  async recordPayment(@Req() request: Request, @Body() dto: CreatePaymentDto) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_PAYMENT_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PAYMENT_RECORDED,
      'Payment',
      (tx) =>
        this.payments.record(
          tx,
          ctx.tenantId,
          ctx.userId,
          ctx.actorMembershipId,
          dto,
        ),
      { invoiceId: dto.invoiceId },
      BILLING_PAYMENT_PERMISSION,
    );
  }

  @Get('payments')
  async listPayments(
    @Req() request: Request,
    @Query('invoiceId') invoiceId?: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_PAYMENT_PERMISSION,
    );
    return this.operations.read(request, ctx, (tx) =>
      this.payments.listByInvoice(tx, ctx.tenantId, invoiceId ?? ''),
    );
  }

  @Post('credits')
  async createCredit(@Req() request: Request, @Body() dto: CreateCreditDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CREDIT_CREATED,
      'Credit',
      (tx) => this.credits.create(tx, ctx.tenantId, dto),
      { clientId: dto.clientId },
    );
  }

  @Post('credits/:id/apply')
  async applyCredit(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyCreditDto,
  ) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_PAYMENT_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PAYMENT_RECORDED,
      'Credit',
      (tx) => this.credits.apply(tx, ctx.tenantId, id, dto),
      { invoiceId: dto.invoiceId },
      BILLING_PAYMENT_PERMISSION,
    );
  }

  @Post('refunds')
  async issueRefund(@Req() request: Request, @Body() dto: CreateRefundDto) {
    const ctx = await this.operations.authorize(
      request,
      BILLING_PAYMENT_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.REFUND_ISSUED,
      'Refund',
      (tx) => this.refunds.issue(tx, ctx.tenantId, dto),
      { paymentId: dto.paymentId },
      BILLING_PAYMENT_PERMISSION,
    );
  }

  @Get('ledger')
  async readLedger(@Req() request: Request, @Query('caseId') caseId?: string) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.ledgerEntry.findMany({
        where: { tenantId: ctx.tenantId, ...(caseId ? { caseId } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Get('balances')
  async readBalances(
    @Req() request: Request,
    @Query('invoiceId') invoiceId?: string,
    @Query('caseId') caseId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      if (invoiceId) {
        return [
          {
            invoiceId,
            ...(await this.reconciliation.outstanding(
              tx,
              ctx.tenantId,
              invoiceId,
            )),
          },
        ];
      }
      const invoices = await tx.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(caseId ? { caseId } : {}),
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
        },
        select: { id: true },
      });
      const rows = [];
      for (const invoice of invoices) {
        rows.push({
          invoiceId: invoice.id,
          ...(await this.reconciliation.outstanding(
            tx,
            ctx.tenantId,
            invoice.id,
          )),
        });
      }
      return rows;
    });
  }

  @Post('tax-rules')
  async createTaxRule(@Req() request: Request, @Body() dto: CreateTaxRuleDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TAX_RULE_CREATED,
      'TaxRule',
      (tx) => this.taxes.create(tx, ctx.tenantId, dto),
      { name: dto.name },
    );
  }

  @Get('tax-rules')
  async listTaxRules(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.taxes.list(tx, ctx.tenantId),
    );
  }
}
