import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BillingInvalidStateError,
  BillingNotFoundError,
} from './billing.errors';
import type { CreateRefundDto } from './billing.dto';
import { LedgerService } from './ledger.service';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class RefundService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  async issue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateRefundDto,
  ) {
    const payment = await tx.payment.findFirst({
      where: { id: dto.paymentId, tenantId },
      include: { refunds: true },
    });
    if (!payment) throw new BillingNotFoundError('Payment not found');
    if (payment.status !== 'SUCCEEDED') {
      throw new BillingInvalidStateError('Only succeeded payments refund');
    }
    let refunded = new Prisma.Decimal(0);
    for (const existing of payment.refunds) {
      refunded = refunded.plus(new Prisma.Decimal(existing.amount.toString()));
    }
    const remaining = new Prisma.Decimal(payment.amount.toString()).minus(
      refunded,
    );
    const amount = new Prisma.Decimal(String(dto.amount));
    if (amount.lte(0) || amount.gt(remaining)) {
      throw new BillingInvalidStateError('Refund exceeds refundable amount');
    }
    const refund = await tx.refund.create({
      data: {
        tenantId,
        paymentId: payment.id,
        amount,
        reason: dto.reason,
      },
    });
    if (amount.equals(remaining)) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });
    }
    await this.ledger.postBalanced(tx, tenantId, `refund:${refund.id}`, [
      {
        side: 'DEBIT',
        amount,
        currency: payment.currency,
        invoiceId: payment.invoiceId,
        paymentId: payment.id,
        memo: 'revenue reversal',
      },
      {
        side: 'CREDIT',
        amount,
        currency: payment.currency,
        invoiceId: payment.invoiceId,
        paymentId: payment.id,
        memo: 'cash',
      },
    ]);
    await this.reconciliation.refreshInvoiceStatus(
      tx,
      tenantId,
      payment.invoiceId,
    );
    return refund;
  }
}
