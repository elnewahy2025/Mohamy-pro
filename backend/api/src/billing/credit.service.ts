import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BillingInvalidStateError,
  BillingNotFoundError,
} from './billing.errors';
import type { ApplyCreditDto, CreateCreditDto } from './billing.dto';
import { LedgerService } from './ledger.service';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class CreditService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateCreditDto,
  ) {
    const client = await tx.client.findFirst({
      where: { id: dto.clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new BillingNotFoundError('Client not found');
    const amount = new Prisma.Decimal(String(dto.amount));
    if (amount.lte(0)) {
      throw new BillingInvalidStateError('Credit amount must be positive');
    }
    return tx.credit.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        caseId: dto.caseId,
        amount,
        currency: dto.currency ?? 'EGP',
        status: 'OPEN',
      },
    });
  }

  async apply(
    tx: Prisma.TransactionClient,
    tenantId: string,
    creditId: string,
    dto: ApplyCreditDto,
  ) {
    const credit = await tx.credit.findFirst({
      where: { id: creditId, tenantId },
    });
    if (!credit) throw new BillingNotFoundError('Credit not found');
    const invoice = await tx.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    if (invoice.status !== 'ISSUED' && invoice.status !== 'PARTIALLY_PAID') {
      throw new BillingInvalidStateError('Invoice cannot receive credit');
    }
    const open = new Prisma.Decimal(credit.amount.toString()).minus(
      new Prisma.Decimal(credit.appliedAmount.toString()),
    );
    const amount = new Prisma.Decimal(String(dto.amount));
    if (amount.lte(0) || amount.gt(open)) {
      throw new BillingInvalidStateError('Credit application exceeds balance');
    }
    const { outstanding } = await this.reconciliation.outstanding(
      tx,
      tenantId,
      invoice.id,
    );
    if (amount.gt(outstanding)) {
      throw new BillingInvalidStateError('Credit exceeds invoice balance');
    }
    const applied = new Prisma.Decimal(credit.appliedAmount.toString()).plus(
      amount,
    );
    await tx.credit.update({
      where: { id: credit.id },
      data: {
        appliedAmount: applied,
        status: applied.gte(new Prisma.Decimal(credit.amount.toString()))
          ? 'EXHAUSTED'
          : 'APPLIED',
      },
    });
    await tx.creditApplication.create({
      data: {
        tenantId,
        creditId: credit.id,
        invoiceId: invoice.id,
        amount,
      },
    });
    await this.ledger.postBalanced(tx, tenantId, `credit:${credit.id}:apply`, [
      {
        side: 'DEBIT',
        amount,
        currency: credit.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: invoice.id,
        memo: 'credit liability',
      },
      {
        side: 'CREDIT',
        amount,
        currency: credit.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: invoice.id,
        memo: 'receivable',
      },
    ]);
    await this.reconciliation.refreshInvoiceStatus(tx, tenantId, invoice.id);
    return tx.credit.findFirstOrThrow({ where: { id: credit.id } });
  }
}
