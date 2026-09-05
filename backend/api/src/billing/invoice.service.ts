import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaseTimelineService } from '../case-timeline/case-timeline.service';
import {
  BillingInvalidStateError,
  BillingNotFoundError,
} from './billing.errors';
import type { CreateInvoiceDto } from './billing.dto';
import { LedgerService } from './ledger.service';

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly timeline: CaseTimelineService,
  ) {}

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorMembershipId: string | null,
    dto: CreateInvoiceDto,
  ) {
    if (dto.caseId) {
      const found = await tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BillingNotFoundError('Case not found');
    }
    if (dto.clientId) {
      const found = await tx.client.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BillingNotFoundError('Client not found');
    }

    const lines: {
      description: string;
      quantity: Prisma.Decimal;
      unitAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      feeId?: string;
      expenseId?: string;
      timeEntryId?: string;
    }[] = [];

    for (const timeEntryId of dto.timeEntryIds ?? []) {
      const entry = await tx.timeEntry.findFirst({
        where: { id: timeEntryId, tenantId },
      });
      if (!entry) throw new BillingNotFoundError('Time entry not found');
      if (entry.status !== 'APPROVED') {
        throw new BillingInvalidStateError('Only approved time can be billed');
      }
      if (entry.rateAmount === null) {
        throw new BillingInvalidStateError('Time entry has no rate');
      }
      const quantity = dec(entry.durationMinutes).div(60);
      const unitAmount = dec(entry.rateAmount.toString());
      const lineTotal = quantity.times(unitAmount).toDecimalPlaces(4);
      lines.push({
        description: entry.description,
        quantity,
        unitAmount,
        lineTotal,
        timeEntryId: entry.id,
      });
    }

    for (const feeId of dto.feeIds ?? []) {
      const fee = await tx.fee.findFirst({ where: { id: feeId, tenantId } });
      if (!fee) throw new BillingNotFoundError('Fee not found');
      lines.push({
        description: fee.description,
        quantity: new Prisma.Decimal(1),
        unitAmount: dec(fee.amount.toString()),
        lineTotal: dec(fee.amount.toString()).toDecimalPlaces(4),
        feeId: fee.id,
      });
    }

    for (const expenseId of dto.expenseIds ?? []) {
      const expense = await tx.expense.findFirst({
        where: { id: expenseId, tenantId },
      });
      if (!expense) throw new BillingNotFoundError('Expense not found');
      lines.push({
        description: expense.description,
        quantity: new Prisma.Decimal(1),
        unitAmount: dec(expense.amount.toString()),
        lineTotal: dec(expense.amount.toString()).toDecimalPlaces(4),
        expenseId: expense.id,
      });
    }

    if (lines.length === 0) {
      throw new BillingInvalidStateError('Invoice requires at least one line');
    }

    let subtotal = new Prisma.Decimal(0);
    for (const line of lines) subtotal = subtotal.plus(line.lineTotal);
    subtotal = subtotal.toDecimalPlaces(4);
    const discount = dec(dto.discountAmount ?? 0).toDecimalPlaces(4);
    if (discount.gt(subtotal)) {
      throw new BillingInvalidStateError('Discount exceeds subtotal');
    }

    let taxRate: Prisma.Decimal | null = null;
    let taxRuleId: string | undefined;
    if (dto.taxRuleId) {
      const rule = await tx.taxRule.findFirst({
        where: { id: dto.taxRuleId, tenantId, active: true },
      });
      if (!rule) throw new BillingNotFoundError('Tax rule not found');
      taxRate = dec(rule.rate.toString());
      taxRuleId = rule.id;
    }
    const taxable = subtotal.minus(discount);
    const taxAmount = taxRate
      ? taxable.times(taxRate).toDecimalPlaces(4)
      : new Prisma.Decimal(0);
    const total = taxable.plus(taxAmount).toDecimalPlaces(4);

    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        invoiceNumber: dto.invoiceNumber,
        status: 'DRAFT',
        currency: 'EGP',
        subtotal,
        discountAmount: discount,
        taxAmount,
        total,
        taxRuleId,
        taxRateSnapshot: taxRate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        lines: {
          create: lines.map((line) => ({
            tenantId,
            description: line.description,
            quantity: line.quantity,
            unitAmount: line.unitAmount,
            lineTotal: line.lineTotal,
            feeId: line.feeId,
            expenseId: line.expenseId,
            timeEntryId: line.timeEntryId,
          })),
        },
      },
      include: { lines: true },
    });

    if ((dto.timeEntryIds ?? []).length > 0) {
      await tx.timeEntry.updateMany({
        where: { id: { in: dto.timeEntryIds }, tenantId },
        data: { status: 'INVOICED' },
      });
    }
    return invoice;
  }

  async get(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const invoice = await tx.invoice.findFirst({
      where: { id, tenantId },
      include: { lines: true, payments: true },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    return invoice;
  }

  async list(
    tx: Prisma.TransactionClient,
    tenantId: string,
    filters: { caseId?: string; status?: string },
  ) {
    return tx.invoice.findMany({
      where: {
        tenantId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async issue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorMembershipId: string | null,
    id: string,
  ) {
    const invoice = await tx.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    if (invoice.status !== 'DRAFT') {
      throw new BillingInvalidStateError('Only draft invoices can be issued');
    }
    const issued = await tx.invoice.update({
      where: { id },
      data: { status: 'ISSUED', issuedAt: new Date() },
      include: { lines: true },
    });
    const total = dec(issued.total.toString());
    await this.ledger.postBalanced(tx, tenantId, `invoice:${issued.id}:issue`, [
      {
        side: 'DEBIT',
        amount: total,
        currency: issued.currency,
        caseId: issued.caseId ?? undefined,
        invoiceId: issued.id,
        memo: 'receivable',
      },
      {
        side: 'CREDIT',
        amount: total,
        currency: issued.currency,
        caseId: issued.caseId ?? undefined,
        invoiceId: issued.id,
        memo: 'revenue',
      },
    ]);
    if (issued.caseId) {
      await this.timeline.recordEvent(
        tx,
        tenantId,
        actorUserId,
        actorMembershipId,
        {
          caseId: issued.caseId,
          eventType: 'INVOICE_CREATED',
          payload: {
            invoiceNumber: issued.invoiceNumber,
            total: total.toString(),
          },
        },
      );
    }
    return issued;
  }

  async void(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const invoice = await tx.invoice.findFirst({
      where: { id, tenantId },
      include: { payments: { where: { status: 'SUCCEEDED' } } },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    if (invoice.status !== 'ISSUED') {
      throw new BillingInvalidStateError('Only issued invoices can be voided');
    }
    if (invoice.payments.length > 0) {
      throw new BillingInvalidStateError(
        'Invoiced with payments must be refunded, not voided',
      );
    }
    const voided = await tx.invoice.update({
      where: { id },
      data: { status: 'VOID' },
    });
    const total = dec(invoice.total.toString());
    await this.ledger.postBalanced(tx, tenantId, `invoice:${id}:void`, [
      {
        side: 'CREDIT',
        amount: total,
        currency: invoice.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: id,
        memo: 'receivable reversal',
      },
      {
        side: 'DEBIT',
        amount: total,
        currency: invoice.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: id,
        memo: 'revenue reversal',
      },
    ]);
    return voided;
  }

  async newVersion(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const invoice = await tx.invoice.findFirst({
      where: { id, tenantId },
      include: {
        lines: true,
        payments: { where: { status: 'SUCCEEDED' } },
      },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    if (invoice.status === 'VOID' || invoice.status === 'SUPERSEDED') {
      throw new BillingInvalidStateError('Closed invoices cannot be versioned');
    }
    if (invoice.payments.length > 0) {
      throw new BillingInvalidStateError(
        'Invoices with payments cannot be versioned',
      );
    }
    const next = await tx.invoice.create({
      data: {
        tenantId,
        caseId: invoice.caseId,
        clientId: invoice.clientId,
        invoiceNumber: invoice.invoiceNumber,
        version: invoice.version + 1,
        supersedesId: invoice.id,
        status: 'DRAFT',
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        discountAmount: invoice.discountAmount,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        taxRuleId: invoice.taxRuleId,
        taxRateSnapshot: invoice.taxRateSnapshot,
        dueDate: invoice.dueDate,
        lines: {
          create: invoice.lines.map((line) => ({
            tenantId,
            description: line.description,
            quantity: line.quantity,
            unitAmount: line.unitAmount,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });
    await tx.invoice.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });
    return next;
  }
}
